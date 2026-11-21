import { NextRequest, NextResponse } from 'next/server';
import { serializarServicios, desdeCotizacion } from '@/lib/serviciosVendidos';
import { uploadPDFToCloudinary } from '@/lib/cloudinary';
import { hoyLima, sumarDiasISO, fechaCortaLima, nombreDesdeEmail } from '@/lib/utils';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateCotizacionPDF } from '@/lib/pdf-generator';
import { trasEscribir } from '@/lib/cache';
import { anotarVersion, guardarPrincipalActual } from '@/lib/cotizacionVersiones';
import { opcionDePersona } from '@/lib/equipo';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const NOTION_VERSION = '2022-06-28';
function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

const BANCO_DEFAULT = {
  id: 1, nombre: 'BCP', tipo_cuenta: 'Cuenta Corriente Soles',
  numero: '1941617224095', cci: '00219400161722409590', titular: 'IDEALO FILMS S.A.C.',
};

function readRollup(prop: any): string {
  if (!prop || prop.type !== 'rollup') return '';
  const r = prop.rollup;
  if (!r) return '';
  if (r.type === 'array' && r.array?.length > 0) {
    const first = r.array[0];
    if (first.type === 'rich_text')    return first.rich_text?.[0]?.plain_text || '';
    if (first.type === 'title')        return first.title?.[0]?.plain_text || '';
    if (first.type === 'email')        return first.email || '';
    if (first.type === 'phone_number') return first.phone_number || '';
    if (first.type === 'number')       return String(first.number ?? '');
  }
  return '';
}

const trozosTexto = (t: string) => {
  const out: any[] = [];
  for (let i = 0; i < t.length && out.length < 50; i += 2000) out.push({ type: 'text', text: { content: t.slice(i, i + 2000) } });
  return out;
};

function parsePage(page: any) {
  const p = page.properties;
  return {
    id: page.id,
    numero_cotizacion: p['Proyecto']?.title?.[0]?.plain_text || '',
    cliente_nombre:    readRollup(p['Cliente']) || '',
    mail:              readRollup(p['Mail']),
    telefono:          readRollup(p['Telefono']),
    ruc:               readRollup(p['RUC']),
    monto_total:       p['Total']?.number || 0,
    gravado:           p['Gravado']?.number || 0,
    igv_monto:         p['IGV']?.number || 0,
    fecha_emision:     p['Fecha de contactado']?.date?.start || '',
    url_pdf:           p['COTIZACIONES']?.url || null,
    estado:            p['ESTADO DE LEAD']?.status?.name || '',
    creado_por:        p['OS creador de la cotizacion']?.select?.name
                       || p['Usuario']?.rich_text?.[0]?.plain_text || '',
    empresa_id:        p['Empresa']?.relation?.[0]?.id || null,
    periodo:           readRollup(p['Período']),
    canal:             readRollup(p['Canal']),
  };
}

// Actualiza un campo a la vez — tolera errores individuales sin romper todo
async function patchCampo(pageId: string, properties: any): Promise<{ ok: boolean; error?: string; status?: number }> {
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) {
      const raw = await res.text();
      let msg = raw;
      try { msg = JSON.parse(raw).message; } catch {}
      return { ok: false, error: msg, status: res.status };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// Lee las opciones de un campo `status` directamente del esquema de la BD.
// Devuelve la opción exacta cuyo nombre normalizado (sin tildes, lowercase)
// coincide con el target, o null si no hay match.
// Esto resuelve el problema de "no sé si la opción se llama 'Cotización enviada'
// o 'Cotizacion Enviada' o 'cotización enviada'" sin tener que adivinar.
async function buscarOpcionStatusExacta(
  dbId: string,
  fieldName: string,
  targetNormalizado: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const field: any = data.properties?.[fieldName];
    if (!field || field.type !== 'status') return null;
    const opciones: any[] = field.status?.options || [];
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const match = opciones.find(o => norm(o.name) === targetNormalizado);
    return match ? match.name : null;
  } catch {
    return null;
  }
}

// Siguiente correlativo del día para el número de cotización (AAMMDD-NN).
// Busca el mayor NN ya emitido hoy, tanto en el título del proyecto
// ("COT-261008-03") como en la URL del PDF (".../COT-261008-03-Cliente.pdf").
// Antes se contaban los proyectos con "Fecha de contactado" = hoy, lo que
// repetía números al cotizar sobre proyectos creados otro día.
// Si la consulta falla, devuelve 1 para no bloquear nunca la generación.
async function siguienteCorrelativo(dbId: string, prefijo: string): Promise<number> {
  try {
    let maximo = 0;
    let cursor: string | undefined = undefined;
    const patron = new RegExp(`COT-${prefijo}-(\\d{2,})`, 'g');
    // Las versiones anteriores ya no están en "COTIZACIONES" (solo la principal),
    // así que también se mira "Notas de seguimiento", donde se anota cada una.
    let conNotas = true;
    do {
      const filtros: any[] = [
        { property: 'Proyecto', title: { contains: `COT-${prefijo}-` } },
        { property: 'COTIZACIONES', url: { contains: `COT-${prefijo}-` } },
      ];
      if (conNotas) filtros.push({ property: 'Notas de seguimiento', rich_text: { contains: `COT-${prefijo}-` } });
      const bodyReq: any = { page_size: 100, filter: { or: filtros } };
      if (cursor) bodyReq.start_cursor = cursor;
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(bodyReq),
      });
      if (!res.ok) {
        // Si la columna de notas no existe, se reintenta sin ella
        if (conNotas && !cursor) { conNotas = false; continue; }
        break;
      }
      const data = await res.json();
      for (const page of data.results || []) {
        const p = page.properties || {};
        const textos = [
          p['Proyecto']?.title?.[0]?.plain_text || '',
          p['COTIZACIONES']?.url || '',
          (p['Notas de seguimiento']?.rich_text || []).map((t: any) => t.plain_text).join(''),
        ];
        for (const t of textos) {
          for (const m of Array.from(t.matchAll(patron)) as RegExpMatchArray[]) maximo = Math.max(maximo, parseInt(m[1], 10));
        }
      }
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return maximo + 1;
  } catch {
    return 1;
  }
}

export async function GET() {
  const DB_ID = process.env.NOTION_DB_COTIZACIONES!;
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({
        page_size: 100,
        sorts: [{ property: 'Fecha de contactado', direction: 'descending' }],
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw; try { msg = JSON.parse(raw).message; } catch {}
      return NextResponse.json({ success: false, error: msg, cotizaciones: [] }, { status: res.status });
    }
    const data = JSON.parse(raw);
    return NextResponse.json({ success: true, cotizaciones: (data.results || []).map(parsePage) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, cotizaciones: [] }, { status: 500 });
  }
}

// Tras generar la cotización, deja el lead listo para el seguimiento (C4):
// último contacto = hoy, próximo seguimiento en 2 días, línea en el historial
// y "Atendido por" (solo si estaba vacío y con una opción que ya exista).
async function cerrarCicloCotizacion(dbId: string, pageId: string, numero: string, total: number, usuarioCorto: string, usuarioNombre: string, warnings: string[]) {
  try {
    const pr = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: getHeaders() });
    if (!pr.ok) return;
    const p = (await pr.json()).properties || {};
    const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const key = (...n: string[]) => Object.keys(p).find(k => n.map(norm).includes(norm(k)));
    const props: any = {};
    const hoy = hoyLima();
    const kUlt = key('Fecha último contacto', 'Fecha ultimo contacto');
    if (kUlt) props[kUlt] = { date: { start: hoy } };
    const kProx = key('Próximo seguimiento', 'Proximo seguimiento');
    if (kProx) props[kProx] = { date: { start: sumarDiasISO(2) } };
    const kHoy = key('Contactado hoy');
    if (kHoy) props[kHoy] = { date: null };
    const kNotas = key('Notas de seguimiento');
    if (kNotas) {
      const previo = (p[kNotas]?.rich_text || []).map((t: any) => t.plain_text).join('');
      const linea = `[${fechaCortaLima()} · ${usuarioNombre || 'OS'}] 📄 Cotización COT-${numero} enviada (S/ ${total.toFixed(2)})`;
      props[kNotas] = { rich_text: [{ type: 'text', text: { content: (previo ? `${linea}\n${previo}` : linea).slice(0, 2000) } }] };
    }
    const kOs = key('OS creador de la cotizacion');
    if (kOs && !p[kOs]?.select?.name && usuarioCorto) {
      const esquema = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers: getHeaders() });
      const opciones: string[] = esquema.ok ? ((await esquema.json()).properties?.[kOs]?.select?.options || []).map((o: any) => o.name) : [];
      const opcion = opciones.includes(usuarioCorto) ? usuarioCorto : opcionDePersona(usuarioCorto, opciones);
      if (opcion) props[kOs] = { select: { name: opcion } };
    }
    if (Object.keys(props).length) {
      const r = await patchCampo(pageId, props);
      if (!r.ok) warnings.push(`Seguimiento: ${r.error}`);
    }
  } catch { /* no bloquea la cotización */ }
}

async function POST_(req: NextRequest) {
  const DB_ID = process.env.NOTION_DB_COTIZACIONES!;
  const session = await getServerSession(authOptions);
  const usuarioCorto = nombreDesdeEmail(session?.user?.email);
  try {
    const body = await req.json();
    const { cliente, servicios, equipos, notas, empresa_notion_id, proyecto_notion_id, usuario, forma_pago } = body;
    const fecha: string | undefined = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha || '') ? body.fecha : undefined;
    const moneda: 'PEN' | 'USD' = body.moneda === 'USD' ? 'USD' : 'PEN';

    if (!cliente?.nombre?.trim())
      return NextResponse.json({ success: false, error: 'El nombre del cliente es requerido.' }, { status: 400 });
    if (!servicios || servicios.length === 0)
      return NextResponse.json({ success: false, error: 'Selecciona al menos un servicio.' }, { status: 400 });

    // 1. Número de cotización — formato AÑO+MES+DÍA + correlativo del día
    //    Ej: 26 (2026) + 05 (mayo) + 19 (día) + 01 (1ra del día) → 260519-01
    //    La fecha es la de Perú (el servidor de Vercel corre en UTC: desde las
    //    19:00 de Lima ya sería "mañana").
    const hoyISO = fecha || hoyLima(); // YYYY-MM-DD en Lima (o la fecha elegida en el formulario)
    const [yyyy, mm, dd] = hoyISO.split('-');
    const prefijo = `${yyyy.slice(-2)}${mm}${dd}`;
    const nn = (await siguienteCorrelativo(DB_ID, prefijo)).toString().padStart(2, '0');
    const numero_cotizacion = `${prefijo}-${nn}`;

    // 2. Totales
    // Total CON IGV (lo que paga el cliente): priorizamos precio_con_igv del servicio
    // si está disponible, sino calculamos a partir del precio_base * 1.18
    const monto_total = Math.round(
      servicios.reduce((acc: number, s: any) =>
        acc + (s.precio_con_igv || s.precio_base * 1.18) * s.cantidad, 0
      ) * 100
    ) / 100;
    const gravado = Math.round((monto_total / 1.18) * 100) / 100;
    const igv     = Math.round((monto_total - gravado) * 100) / 100;

    // 3. Generar PDF
    const pdf = await generateCotizacionPDF({
      cliente, servicios, equipos: equipos ?? [],
      bancos: [BANCO_DEFAULT], numero_cotizacion, notas, forma_pago, fecha, moneda,
      vence: /^\d{4}-\d{2}-\d{2}$/.test(body.vence || '') ? body.vence : undefined,
    });
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

    // 4. Subir a Cloudinary
    const safeName = cliente.nombre.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    const url_pdf = await uploadPDFToCloudinary(pdfBuffer, `COT-${numero_cotizacion}-${safeName}`);

    const warnings: string[] = [];

    // ─────────────────────────────────────────────────────────────────
    // 5a. Actualizar proyecto existente (si viene proyecto_notion_id)
    //
    // FIX FALLA 1: separamos CADA campo en su propio PATCH.
    // Antes COTIZACIONES y ESTADO DE LEAD iban juntos → si el `status`
    // "Cotización enviada" no existe exactamente en Notion, el PATCH
    // entero falla y la URL del PDF nunca se escribe.
    // Ahora cada campo va aislado: si uno falla, los demás sí pasan.
    // ─────────────────────────────────────────────────────────────────
    if (proyecto_notion_id) {

      // Paso 0: si el proyecto ya tenía una cotización, se conserva como versión
      // (antes se perdía al reemplazar el enlace). Ver lib/cotizacionVersiones.ts
      try {
        const actual = await fetch(`https://api.notion.com/v1/pages/${proyecto_notion_id}`, { headers: getHeaders() });
        if (actual.ok) await guardarPrincipalActual(proyecto_notion_id, (await actual.json()).properties);
      } catch { /* no bloquea la cotización */ }

      // Paso 1: URL del PDF SOLA (es el campo MÁS importante, debe quedar siempre)
      const rUrl = await patchCampo(proyecto_notion_id, {
        'COTIZACIONES': { url: url_pdf },
      });
      if (!rUrl.ok) {
        warnings.push(`COTIZACIONES: ${rUrl.error}`);
      }

      // Paso 2: ESTADO DE LEAD (status). Buscamos el nombre EXACTO en el esquema de la BD.
      // Probamos varias variantes normalizadas (sin tildes, lowercase).
      // Si ninguna coincide, dejamos el status como está y reportamos warning.
      const candidatos = [
        'cotizacion enviada',
        'cotización enviada',
        'cotizado',
        'cotizacion',
      ];
      let nombreEstadoExacto: string | null = null;
      for (const c of candidatos) {
        nombreEstadoExacto = await buscarOpcionStatusExacta(DB_ID, 'ESTADO DE LEAD', c);
        if (nombreEstadoExacto) break;
      }

      if (nombreEstadoExacto) {
        const rEstado = await patchCampo(proyecto_notion_id, {
          'ESTADO DE LEAD': { status: { name: nombreEstadoExacto } },
        });
        if (!rEstado.ok) {
          warnings.push(`ESTADO DE LEAD: ${rEstado.error}`);
        }
      } else {
        warnings.push(
          `ESTADO DE LEAD: ninguna opción coincide con "Cotizacion enviada" en el campo status. ` +
          `Crea esa opción manualmente en Notion (BD Proyectos 2026 → campo ESTADO DE LEAD).`
        );
      }

      // Paso 3: campos numéricos (Total, Gravado, IGV) — siempre seguros
      const rNum = await patchCampo(proyecto_notion_id, {
        'Total':   { number: monto_total },
        'Gravado': { number: gravado },
        'IGV':     { number: igv },
      });
      if (!rNum.ok) warnings.push(`Total/Gravado/IGV: ${rNum.error}`);

      // Paso 3b: qué se vendió (lo usa la ficha de Producción). Si falla, no bloquea.
      const textoServ = serializarServicios(desdeCotizacion(servicios));
      if (textoServ) await patchCampo(proyecto_notion_id, { 'Servicios vendidos': { rich_text: trozosTexto(textoServ) } });

      // Paso 4: Usuario (rich_text)
      const rUsr = await patchCampo(proyecto_notion_id, {
        'Usuario': { rich_text: [{ text: { content: usuario || '' } }] },
      });
      if (!rUsr.ok) warnings.push(`Usuario: ${rUsr.error}`);

      // Paso 5: seguimiento del lead + "Atendido por" (sin crear opciones nuevas)
      await cerrarCicloCotizacion(DB_ID, proyecto_notion_id, numero_cotizacion, monto_total, usuarioCorto, usuario || '', warnings);

      // Paso 6: anotar esta cotización en las versiones del proyecto
      await anotarVersion(proyecto_notion_id, {
        numero: numero_cotizacion, url: url_pdf, total: monto_total, gravado, igv,
        fecha: hoyISO, usuario: usuario || '', manual: false,
      }).catch(() => null);

      const urlGuardada = rUrl.ok;
      return NextResponse.json({
        success: true,
        url_pdf,
        numero_cotizacion,
        modo: 'proyecto_actualizado',
        notion_ok: urlGuardada,
        warning: warnings.length > 0 ? warnings.join(' | ') : undefined,
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // 5b. Crear proyecto NUEVO en "Proyectos 2026"
    // Estrategia: crear primero la página solo con campos 100% seguros
    // (title, url, date, números, rich_text). Luego intentar status y
    // select por separado.
    // ─────────────────────────────────────────────────────────────────

    const propsBase: any = {
      'Proyecto':            { title: [{ text: { content: `COT-${numero_cotizacion}` } }] },
      'COTIZACIONES':        { url: url_pdf },
      'Fecha de contactado': { date: { start: hoyISO } },
      'Total':               { number: monto_total },
      'Gravado':             { number: gravado },
      'IGV':                 { number: igv },
      'Usuario':             { rich_text: [{ text: { content: usuario || '' } }] },
    };

    if (empresa_notion_id) propsBase['Empresa'] = { relation: [{ id: empresa_notion_id }] };

    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({ parent: { database_id: DB_ID }, properties: propsBase }),
    });

    const notionRaw = await notionRes.text();
    if (!notionRes.ok) {
      let errMsg = notionRaw; try { errMsg = JSON.parse(notionRaw).message; } catch {}
      // PDF ya generado — éxito parcial
      return NextResponse.json({
        success: true, url_pdf, numero_cotizacion,
        warning: `PDF generado OK. Error guardando en Notion: ${errMsg}`,
      });
    }

    const newPage = JSON.parse(notionRaw);

    // Qué se vendió (lo usa la ficha de Producción). Si falla, no bloquea.
    const textoServNew = serializarServicios(desdeCotizacion(servicios));
    if (textoServNew) await patchCampo(newPage.id, { 'Servicios vendidos': { rich_text: trozosTexto(textoServNew) } });

    // Ahora sí intentamos ESTADO DE LEAD por separado, buscando el nombre exacto
    const candidatosNew = [
      'cotizacion enviada',
      'cotización enviada',
      'cotizado',
      'cotizacion',
    ];
    let nombreEstadoExactoNew: string | null = null;
    for (const c of candidatosNew) {
      nombreEstadoExactoNew = await buscarOpcionStatusExacta(DB_ID, 'ESTADO DE LEAD', c);
      if (nombreEstadoExactoNew) break;
    }
    if (nombreEstadoExactoNew) {
      const rEstadoNew = await patchCampo(newPage.id, {
        'ESTADO DE LEAD': { status: { name: nombreEstadoExactoNew } },
      });
      if (!rEstadoNew.ok) {
        warnings.push(`ESTADO DE LEAD: ${rEstadoNew.error}`);
      }
    } else {
      warnings.push(
        `ESTADO DE LEAD: ninguna opción coincide con "Cotizacion enviada" en el campo status. ` +
        `Crea esa opción manualmente en Notion.`
      );
    }

    // Seguimiento del lead + "Atendido por"
    await cerrarCicloCotizacion(DB_ID, newPage.id, numero_cotizacion, monto_total, usuarioCorto, usuario || '', warnings);
    await anotarVersion(newPage.id, {
      numero: numero_cotizacion, url: url_pdf, total: monto_total, gravado, igv,
      fecha: hoyISO, usuario: usuario || '', manual: false,
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      cotizacion: parsePage(newPage),
      url_pdf,
      numero_cotizacion,
      modo: 'proyecto_creado',
      notion_ok: true,
      warning: warnings.length > 0 ? warnings.join(' | ') : undefined,
    });

  } catch (e: any) {
    console.error('[POST cotizaciones]', e.message);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
const POST_GENERAR = trasEscribir(['proyectos', 'clientes', 'campanas'], POST_);

// Vista previa / borrador: genera el MISMO PDF (mismo diseño y número que
// tendría) pero no lo sube a Cloudinary ni toca Notion. Devuelve el PDF.
async function PDF_SOLO(body: any) {
  const DB_ID = process.env.NOTION_DB_COTIZACIONES!;
  const { cliente, servicios, equipos, notas, forma_pago } = body;
  const fecha: string | undefined = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha || '') ? body.fecha : undefined;
  const moneda: 'PEN' | 'USD' = body.moneda === 'USD' ? 'USD' : 'PEN';
  const [yyyy, mm, dd] = (fecha || hoyLima()).split('-');
  const prefijo = `${yyyy.slice(-2)}${mm}${dd}`;
  let numero_cotizacion = `${prefijo}-XX`;
  if (body.modo === 'borrador') {
    try { numero_cotizacion = `${prefijo}-${(await siguienteCorrelativo(DB_ID, prefijo)).toString().padStart(2, '0')}`; } catch { /* sin Notion: XX */ }
  }
  const pdf = await generateCotizacionPDF({
    cliente: { nombre: '', documento_identidad: '', razon_social: '', correo: '', telefono: '', ...(cliente || {}) },
    servicios: servicios || [], equipos: equipos ?? [],
    bancos: [BANCO_DEFAULT], numero_cotizacion, notas, forma_pago, fecha, moneda,
      vence: /^\d{4}-\d{2}-\d{2}$/.test(body.vence || '') ? body.vence : undefined,
  });
  return new NextResponse(Buffer.from(pdf.output('arraybuffer')), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="BORRADOR-COT-${numero_cotizacion}.pdf"`,
      'X-Numero-Cotizacion': numero_cotizacion,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}));
  if (body?.modo === 'preview' || body?.modo === 'borrador') {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    try { return await PDF_SOLO(body); }
    catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  }
  return POST_GENERAR(req);
}

// PATCH — corregir el precio de una cotización/proyecto sin generar otra.
// Recalcula gravado e IGV (precio con IGV incluido).
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const total = Number(body.total);
  if (!body.pageId || !(total >= 0)) return NextResponse.json({ error: 'Faltan pageId o total' }, { status: 400 });
  const t = Math.round(total * 100) / 100;
  const gravado = Math.round((t / 1.18) * 100) / 100;
  const igv = Math.round((t - gravado) * 100) / 100;
  const r = await fetch(`https://api.notion.com/v1/pages/${body.pageId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
    body: JSON.stringify({ properties: { Total: { number: t }, Gravado: { number: gravado }, IGV: { number: igv } } }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    return NextResponse.json({ error: d.message || 'No se pudo guardar' }, { status: r.status });
  }
  return NextResponse.json({ ok: true, total: t, gravado, igv });
}
export const PATCH = trasEscribir(['proyectos', 'campanas'], PATCH_);

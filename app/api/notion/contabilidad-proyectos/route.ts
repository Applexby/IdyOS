import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { lineaPago, parseHistorialPagos, pagosDeProyecto } from '@/lib/pagos';
import { diasEntreFechasISO, hoyLima, fechaCortaLima } from '@/lib/utils';
import { anotarVersion, guardarPrincipalActual } from '@/lib/cotizacionVersiones';
import { trasEscribir, conCache, refrescarSiSePide } from '@/lib/cache';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});

const DB_PIPELINE = process.env.NOTION_DB_PIPELINE!;

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

function findKey(p: any, ...names: string[]) {
  const targets = names.map(norm);
  for (const key of Object.keys(p)) {
    if (targets.includes(norm(key))) return key;
  }
}

function readRollup(p: any, ...names: string[]): string {
  const k = findKey(p, ...names);
  if (!k || p[k]?.type !== 'rollup') return '';
  const r = p[k].rollup;
  if (!r) return '';
  if (r.type === 'array' && r.array?.length > 0) {
    const first = r.array[0];
    if (first.type === 'rich_text')    return first.rich_text?.[0]?.plain_text || '';
    if (first.type === 'title')        return first.title?.[0]?.plain_text || '';
    if (first.type === 'phone_number') return first.phone_number || '';
    if (first.type === 'email')        return first.email || '';
    if (first.type === 'number')       return String(first.number ?? '');
  }
  return '';
}

// Toda la contabilidad vive ahora en la BD PROYECTOS.
function parseProyecto(page: any) {
  const p = page.properties;
  const getTitle   = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.title?.[0]?.plain_text || '' : ''; };
  const getNumber  = (...n: string[]) => { const k = findKey(p,...n); return k ? (p[k]?.number ?? null) : null; };
  const getUrl     = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.url || null : null; };
  const getDate    = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.date?.start || null : null; };
  const getStatus  = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.status?.name || '' : ''; };
  const getSelect  = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.select?.name || '' : ''; };
  // Texto completo (Notion parte los textos largos en varios fragmentos)
  const getText    = (...n: string[]) => { const k = findKey(p,...n); return k ? (p[k]?.rich_text || []).map((t: any) => t.plain_text).join('') : ''; };
  const getFormula = (...n: string[]) => { const k = findKey(p,...n); const f = k ? p[k]?.formula : null; if (!f) return null; return f.type === 'number' ? f.number : (f.type === 'string' ? f.string : null); };

  const total          = getNumber('Total') ?? 0;
  const montoPagado    = getNumber('Monto Pagado') ?? 0;
  const montoPendiente = (getFormula('Monto Pendiente') as number) ?? (total - montoPagado);
  const estadoPago     = (getFormula('Estado de pago') as string) || (montoPagado >= total && total > 0 ? 'Pagado' : montoPagado > 0 ? 'Pago parcial' : 'Sin pagar');
  const fechaCobro     = getDate('Fecha de cobro');
  const fechaInicio    = getDate('Fecha inicio proyecto');
  const fechaEntrega   = getDate('Fecha entrega estimada');
  const recordatorioPago = getDate('Recordatorio pago', 'Recordatorio de pago'); // opcional en Notion
  const hoy = hoyLima();

  // Alerta sobre la fecha de entrega estimada mientras quede saldo por cobrar
  let alertaPago: 'vencido' | 'urgente' | 'proximo' | null = null;
  if (fechaEntrega && montoPendiente > 0) {
    const dias = diasEntreFechasISO(hoy, fechaEntrega);
    if (dias < 0) alertaPago = 'vencido';
    else if (dias <= 3) alertaPago = 'urgente';
    else if (dias <= 7) alertaPago = 'proximo';
  }

  // ¿Se oculta hoy del tracker de cobranza?
  // Regla: si ya se envió recordatorio HOY o DESPUÉS, se oculta —EXCEPTO— en dos hitos
  // donde debe reaparecer aunque ya se haya recordado: (a) el día del vencimiento,
  // (b) 1 día después del vencimiento. Una vez VENCIDO (>1 día) nunca se oculta.
  let cobranzaOculta = false;
  if (alertaPago && recordatorioPago) {
    const diasAEntrega = fechaEntrega ? diasEntreFechasISO(hoy, fechaEntrega) : 99; // + = futuro
    const esDiaVencimiento = diasAEntrega === 0;
    const esDiaDespues     = diasAEntrega === -1;
    const recordadoHoy     = diasEntreFechasISO(recordatorioPago, hoy) <= 0; // recordatorio hoy o futuro
    // Se oculta solo si ya se recordó y NO estamos en un hito de reaparición ni vencido fuerte
    if (recordadoHoy && !esDiaVencimiento && !esDiaDespues && alertaPago !== 'vencido') {
      cobranzaOculta = true;
    }
    // Si está vencido más de 1 día, nunca se oculta (cae aquí: alertaPago==='vencido' lo impide arriba)
  }

  return {
    id:               page.id,
    notion_url:       page.url,
    proyecto:         getTitle('Proyecto', 'Name'),
    cliente:          readRollup(p, 'Cliente'),
    telefono:         readRollup(p, 'Telefono', 'Teléfono'),
    mail:             readRollup(p, 'Mail'),
    ruc:              readRollup(p, 'RUC'),
    total,
    gravado:          getNumber('Gravado'),
    igv:              getNumber('IGV'),
    monto_pagado:     montoPagado,
    monto_pendiente:  montoPendiente,
    estado_pago:      estadoPago,
    historial_pagos:  getText('Historial de pagos'),
    cotizacion_url:   getUrl('COTIZACIONES'),
    factura_url:      getUrl('FACTURA'),
    contrato_url:     getUrl('CONTRATO'),
    drive_url:        getUrl('DRIVE PROYECTO'),
    estado_lead:      getStatus('ESTADO DE LEAD'),
    estado_prod:      getStatus('Estado'),
    encargado:        getSelect('OS creador de la cotizacion'),
    fecha_cobro:      fechaCobro,
    fecha_inicio:     fechaInicio,
    fecha_entrega:    fechaEntrega,
    alerta_pago:      alertaPago,
    recordatorio_pago: recordatorioPago,
    cobranza_oculta:  cobranzaOculta,
    created_time:     page.created_time,
    last_edited_time: page.last_edited_time,
  };
}

// Proyecto + sus pagos repartidos por fecha real (ver lib/pagos.ts)
function conPagos(p: ReturnType<typeof parseProyecto>) {
  return { ...p, pagos: pagosDeProyecto(p) };
}

// ─── GET — proyectos GANADOS con su contabilidad (todo en PROYECTOS) ──────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  refrescarSiSePide(req.url, 'proyectos');
  const { searchParams } = new URL(req.url);
  const mes        = searchParams.get('mes');  // YYYY-MM
  const ano        = searchParams.get('ano');  // YYYY
  const incluirPagados = searchParams.get('incluir_pagados') === '1';

  try {
    const allProyectos = await conCache(['proyectos'], 'ganados', async () => {
    let allProyectos: any[] = [];
    let cursor: string | undefined;
    const bodyProy: any = {
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      filter: { property: 'ESTADO DE LEAD', status: { equals: 'GANADO' } },
    };
    do {
      const b = cursor ? { ...bodyProy, start_cursor: cursor } : bodyProy;
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_PIPELINE}/query`, {
        method: 'POST', headers: H(), body: JSON.stringify(b),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || 'Error Notion'); }
      const d = await r.json();
      allProyectos = allProyectos.concat(d.results || []);
      cursor = d.has_more ? d.next_cursor : undefined;
    } while (cursor);
      return allProyectos.map(parseProyecto).map(conPagos);
    });

    let proyectos = allProyectos;

    // Filtro por mes/año usando Fecha de cobro (fallback: created_time)
    const refFecha = (p: any) => new Date(p.fecha_cobro || p.created_time);
    if (mes) {
      const [y, m] = mes.split('-').map(Number);
      proyectos = proyectos.filter(p => { const f = refFecha(p); return f.getFullYear() === y && f.getMonth()+1 === m; });
    } else if (ano) {
      const y = parseInt(ano);
      proyectos = proyectos.filter(p => refFecha(p).getFullYear() === y);
    }

    // Totales sobre el conjunto filtrado (antes de ocultar saldados)
    const totalFacturado = proyectos.reduce((a, p) => a + (p.total || 0), 0);
    const totalPagado    = proyectos.reduce((a, p) => a + (p.monto_pagado || 0), 0);
    const totalPendiente = proyectos.reduce((a, p) => a + (p.monto_pendiente || 0), 0);
    const alertas        = proyectos.filter(p => p.alerta_pago !== null);

    // Por defecto se ocultan los saldados (Monto Pendiente <= 0). El modo tabla los puede pedir.
    const visibles = incluirPagados ? proyectos : proyectos.filter(p => p.monto_pendiente > 0);

    return NextResponse.json({
      proyectos: visibles,
      totales: { facturado: totalFacturado, pagado: totalPagado, pendiente: totalPendiente },
      alertas_count: alertas.length,
      total: visibles.length,
      total_todos: proyectos.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── PATCH — actualizar contabilidad directamente en el proyecto ─────────────
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  // pageId = id del proyecto (la contabilidad vive en el mismo proyecto)
  const { pageId, proyecto, enlaces, monto_pagado, monto_total, fecha_inicio, fecha_entrega, fecha_cobro, registrar_pago, anular_pago, editar_pago, marcar_recordatorio } = body;
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });

  const properties: any = {};
  if (monto_pagado  !== undefined) properties['Monto Pagado'] = { number: monto_pagado ?? null };
  if (monto_total   !== undefined) properties['Total']        = { number: monto_total ?? null };
  if (fecha_inicio  !== undefined) properties['Fecha inicio proyecto']  = fecha_inicio  ? { date: { start: fecha_inicio } }  : { date: null };
  if (fecha_entrega !== undefined) properties['Fecha entrega estimada'] = fecha_entrega ? { date: { start: fecha_entrega } } : { date: null };
  if (fecha_cobro   !== undefined) properties['Fecha de cobro']         = fecha_cobro   ? { date: { start: fecha_cobro } }   : { date: null };

  // Marca "recordatorio de pago enviado hoy" (oculta la cobranza del tracker según la regla de hitos)
  if (marcar_recordatorio) {
    const hoyISO = hoyLima();
    properties['Recordatorio pago'] = { date: { start: hoyISO } };
  }

  // proyecto = nuevo nombre (título de la página en Notion)
  // enlaces = { cotizacion?, contrato?, factura?, drive? } → URLs puestas a mano
  // (propuestas hechas fuera del OS, contratos o facturas subidos a Drive…).
  // '' o null borra el enlace.
  const quiereEnlaces = enlaces && typeof enlaces === 'object' && Object.keys(enlaces).length > 0;
  let cotizacionManual: string | null = null;
  let propsActuales: any = null;
  if ((typeof proyecto === 'string' && proyecto.trim()) || quiereEnlaces) {
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: H() });
    if (!r.ok) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    const pp = (await r.json()).properties || {};
    propsActuales = pp;
    if (typeof proyecto === 'string' && proyecto.trim()) {
      const kTitulo = Object.keys(pp).find(k => pp[k]?.type === 'title');
      if (kTitulo) properties[kTitulo] = { title: [{ text: { content: proyecto.trim().slice(0, 200) } }] };
    }
    if (quiereEnlaces) {
      const COLUMNAS: Record<string, string[]> = {
        cotizacion: ['COTIZACIONES', 'Cotizaciones'],
        contrato: ['CONTRATO', 'Contrato'],
        factura: ['FACTURA', 'Factura'],
        drive: ['DRIVE PROYECTO', 'Drive proyecto', 'Drive'],
      };
      for (const [campo, valor] of Object.entries(enlaces as Record<string, unknown>)) {
        const nombres = COLUMNAS[campo];
        if (!nombres) continue;
        const k = findKey(pp, ...nombres);
        if (!k || pp[k]?.type !== 'url') return NextResponse.json({ error: `No existe la columna de enlace para "${campo}" en Notion` }, { status: 400 });
        const url = String(valor ?? '').trim();
        if (url && !/^https?:\/\/\S+$/i.test(url)) return NextResponse.json({ error: 'El enlace debe empezar con https://' }, { status: 400 });
        properties[k] = { url: url || null };
        // Cotización puesta a mano: la anterior se conserva como versión y la
        // nueva se anota como "Propuesta manual" (ver lib/cotizacionVersiones.ts)
        if (campo === 'cotizacion' && url && url !== pp[k]?.url) cotizacionManual = url;
      }
    }
  }

  // registrar_pago = { monto, fecha?, medio?, operacion?, nota? } → antepone una
  // línea al Historial de pagos (con la FECHA REAL del abono) y suma al Monto Pagado.
  // anular_pago = { linea } → quita esa línea y resta su monto (corregir errores).
  // Se leen los valores ACTUALES de Notion para no pisar pagos registrados a la vez
  // por otra persona (antes se usaba el historial que tenía la pantalla).
  // editar_pago = { linea, nuevo: { fecha, monto, medio, operacion, nota } } →
  // reemplaza esa línea y ajusta el Monto Pagado por la diferencia.
  // registrar_pago.sin_sumar = true → solo detalla un pago que ya estaba sumado en
  // "Monto Pagado" sin historial (fila "sin detalle"): añade la línea sin sumar.
  if ((registrar_pago && Number(registrar_pago.monto) > 0) || anular_pago?.linea || editar_pago?.linea) {
    const actual = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: H() });
    if (!actual.ok) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    const pp = (await actual.json()).properties || {};
    const kHist = findKey(pp, 'Historial de pagos') || 'Historial de pagos';
    const kPagado = findKey(pp, 'Monto Pagado') || 'Monto Pagado';
    const kCobro = findKey(pp, 'Fecha de cobro') || 'Fecha de cobro';
    const historial: string = (pp[kHist]?.rich_text || []).map((t: any) => t.plain_text).join('');
    const pagadoActual: number = pp[kPagado]?.number ?? 0;

    if (registrar_pago && Number(registrar_pago.monto) > 0) {
      const monto = Math.round(Number(registrar_pago.monto) * 100) / 100;
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(registrar_pago.fecha || '') ? registrar_pago.fecha : hoyLima();
      const usuario = (session.user as any)?.name || 'OS';
      const linea = lineaPago({ fecha, usuario, monto, medio: registrar_pago.medio, operacion: registrar_pago.operacion, nota: registrar_pago.nota });
      const nuevo = historial.trim() ? `${linea}\n${historial.trim()}` : linea;
      if (nuevo.length > 2000) {
        return NextResponse.json({ error: 'El historial de pagos de este proyecto está lleno (límite de Notion). Resume las líneas antiguas en Notion.' }, { status: 400 });
      }
      properties[kHist] = { rich_text: [{ text: { content: nuevo } }] };
      if (registrar_pago.sin_sumar) {
        const enHistorial = parseHistorialPagos(historial).reduce((a, x) => a + x.monto, 0);
        if (monto > pagadoActual - enHistorial + 0.01) {
          return NextResponse.json({ error: 'Ese monto es mayor que lo pagado sin detalle. Recarga la página.' }, { status: 409 });
        }
      } else {
        properties[kPagado] = { number: Math.round((pagadoActual + monto) * 100) / 100 };
      }
      // La "Fecha de cobro" queda como la del primer abono (si aún no tenía)
      if (!pp[kCobro]?.date?.start && fecha_cobro === undefined) properties[kCobro] = { date: { start: fecha } };
    } else if (editar_pago?.linea) {
      const lineas = historial.split('\n');
      const idx = lineas.findIndex(l => l.trim() === String(editar_pago.linea).trim());
      if (idx < 0) return NextResponse.json({ error: 'Ese pago cambió o ya no está. Recarga la página.' }, { status: 409 });
      const [antes] = parseHistorialPagos(lineas[idx]);
      const n = editar_pago.nuevo || {};
      const monto = Math.round(Number(n.monto) * 100) / 100;
      if (!antes || !(monto > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(n.fecha || '')) {
        return NextResponse.json({ error: 'Fecha o monto no válidos' }, { status: 400 });
      }
      lineas[idx] = lineaPago({ fecha: n.fecha, usuario: antes.usuario, monto, medio: n.medio, operacion: n.operacion, nota: n.nota });
      const nuevo = lineas.join('\n').trim();
      if (nuevo.length > 2000) return NextResponse.json({ error: 'El historial de pagos de este proyecto está lleno (límite de Notion).' }, { status: 400 });
      properties[kHist] = { rich_text: [{ text: { content: nuevo } }] };
      if (monto !== antes.monto) properties[kPagado] = { number: Math.max(0, Math.round((pagadoActual - antes.monto + monto) * 100) / 100) };
    } else if (anular_pago?.linea) {
      const lineas = historial.split('\n');
      const idx = lineas.findIndex(l => l.trim() === String(anular_pago.linea).trim());
      if (idx < 0) return NextResponse.json({ error: 'Ese pago ya no está en el historial' }, { status: 409 });
      const [pago] = parseHistorialPagos(lineas[idx]);
      lineas.splice(idx, 1);
      properties[kHist] = { rich_text: lineas.join('\n').trim() ? [{ text: { content: lineas.join('\n').trim() } }] : [] };
      properties[kPagado] = { number: Math.max(0, Math.round((pagadoActual - (pago?.monto || 0)) * 100) / 100) };
    }
  }

  try {
    let res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH', headers: H(), body: JSON.stringify({ properties }),
    });
    // Si falló por la columna opcional "Recordatorio pago" (no existe en Notion),
    // reintenta sin ella para no bloquear el resto del guardado.
    if (!res.ok && marcar_recordatorio && properties['Recordatorio pago']) {
      const e = await res.json().catch(() => ({}));
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('recordatorio') || msg.includes('property') || msg.includes('is not a property')) {
        const { ['Recordatorio pago']: _omit, ...resto } = properties;
        res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: 'PATCH', headers: H(), body: JSON.stringify({ properties: resto }),
        });
        if (res.ok) {
          return NextResponse.json({ ok: true, aviso: 'falta_columna_recordatorio' });
        }
      } else {
        return NextResponse.json({ error: e.message }, { status: res.status });
      }
    }
    if (!res.ok) { const e = await res.json(); return NextResponse.json({ error: e.message }, { status: res.status }); }
    if (cotizacionManual) {
      try {
        await guardarPrincipalActual(pageId, propsActuales);
        await anotarVersion(pageId, {
          numero: '', url: cotizacionManual, total: null, gravado: null, igv: null, manual: true,
          fecha: hoyLima(), usuario: (session.user as any)?.name || '',
        });
      } catch { /* el enlace ya quedó guardado */ }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const PATCH = trasEscribir(['proyectos'], PATCH_);

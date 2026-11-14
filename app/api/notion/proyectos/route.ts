import { NextRequest, NextResponse } from 'next/server';
import { trasEscribir } from '@/lib/cache';

// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

// BD Proyectos confirmada por debug:
// title    → "Proyecto"
// status   → "ESTADO DE LEAD"    (tipo status, NO select)
// status   → "Estado"            (tipo status)
// relation → "Empresa"           (apunta a BD Contactos)
// rollup   → "Cliente"           (calculado desde Empresa, solo lectura)
// rollup   → "Telefono"          (calculado, solo lectura)
// rollup   → "Mail"              (calculado, solo lectura)
// rollup   → "RUC"               (calculado, solo lectura)
// url      → "COTIZACIONES"      ✓ se puede escribir
// number   → "Total", "Gravado", "IGV"
// date     → "Fecha de contactado"

const NOTION_VERSION = '2022-06-28';
function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

// Leer rollup — puede ser array de valores o string
function readRollup(prop: any): string {
  if (!prop || prop.type !== 'rollup') return '';
  const r = prop.rollup;
  if (!r) return '';
  if (r.type === 'array' && r.array?.length > 0) {
    const first = r.array[0];
    if (first.type === 'rich_text') return first.rich_text?.[0]?.plain_text || '';
    if (first.type === 'title')     return first.title?.[0]?.plain_text || '';
    if (first.type === 'email')     return first.email || '';
    if (first.type === 'phone_number') return first.phone_number || '';
    if (first.type === 'number')    return String(first.number ?? '');
    if (first.type === 'url')       return first.url || '';
  }
  if (r.type === 'number') return String(r.number ?? '');
  return '';
}

function parsePage(page: any) {
  const p = page.properties;
  return {
    id: page.id,
    nombre:           p['Proyecto']?.title?.[0]?.plain_text || '',
    // ESTADO DE LEAD es tipo "status" en Notion
    estado_lead:      p['ESTADO DE LEAD']?.status?.name || p['Estado']?.status?.name || '',
    // Empresa es relation directa
    empresa_id:       p['Empresa']?.relation?.[0]?.id || null,
    // Cliente, Telefono, Mail, RUC son rollups (solo lectura)
    cliente_rollup:   readRollup(p['Cliente']),
    telefono_rollup:  readRollup(p['Telefono']),
    mail_rollup:      readRollup(p['Mail']),
    ruc_rollup:       readRollup(p['RUC']),
    // URLs
    cotizacion_url:   p['COTIZACIONES']?.url || null,
    contrato_url:     p['CONTRATO']?.url || null,
    drive_url:        p['DRIVE PROYECTO']?.url || null,
    // Números
    total:            p['Total']?.number || 0,
    gravado:          p['Gravado']?.number || 0,
    igv:              p['IGV']?.number || 0,
    // Fecha
    fecha:            p['Fecha de contactado']?.date?.start || '',
    // Otros
    usuario:          p['Usuario']?.rich_text?.[0]?.plain_text || '',
    periodo:          readRollup(p['Período']),
    canal:            readRollup(p['Canal']),
  };
}

// GET — buscar proyectos + opción de cargar empresa por ID
export async function GET(req: NextRequest) {
  const DB_ID = process.env.NOTION_DB_COTIZACIONES!;
  const q = req.nextUrl.searchParams.get('q') || '';
  const empresaId = req.nextUrl.searchParams.get('empresa_id');

  // Cargar datos de una empresa específica (para autocompletar al seleccionar proyecto)
  if (empresaId) {
    try {
      const res = await fetch(`https://api.notion.com/v1/pages/${empresaId}`, {
        headers: getHeaders(),
      });
      const raw = await res.text();
      if (!res.ok) return NextResponse.json({ error: 'No se pudo cargar la empresa' }, { status: res.status });

      const page = JSON.parse(raw);
      const p = page.properties;

      // Busca una propiedad por nombre de forma tolerante (ignora mayúsculas/tildes/espacios).
      // Devuelve la primera coincidencia o undefined.
      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
      const findProp = (...candidates: string[]) => {
        const targets = candidates.map(norm);
        for (const key of Object.keys(p)) {
          if (targets.includes(norm(key))) return p[key];
        }
        return undefined;
      };
      const richText = (prop: any) => prop?.rich_text?.[0]?.plain_text || '';

      const empresa = {
        id: page.id,
        nombre_empresa:   findProp('Empresa', 'Nombre', 'Name')?.title?.[0]?.plain_text || '',
        persona_contacto: richText(findProp('Cliente', 'Contacto', 'Persona de contacto')),
        email:            findProp('Email', 'Correo', 'Mail')?.email || '',
        telefono:         findProp('Phone', 'Teléfono', 'Telefono')?.phone_number || '',
        ruc:              findProp('RUC')?.number ? String(findProp('RUC').number) : '',
        tipo_doc:         findProp('Tipo de documento', 'Tipo doc')?.select?.name || '',
        // DNI / documento del representante. El campo en Notion se llama
        // "DNI REPRESENTANTE" pero Notion distingue mayúsculas, así que
        // hacemos la búsqueda insensible a mayúsculas/tildes para que aguante
        // cualquier variante (DNI representante, Dni Representante, etc.)
        num_doc:          richText(findProp('DNI representante', 'Número de documento', 'Numero de documento', 'N° de documento', 'DNI', 'Documento')),
        estado:           findProp('Estado')?.select?.name || '',
      };

      return NextResponse.json({ empresa });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Buscar proyectos normalmente
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        page_size: 50,
        sorts: [{ property: 'Fecha de contactado', direction: 'descending' }],
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      let msg = raw; try { msg = JSON.parse(raw).message; } catch {}
      return NextResponse.json({ error: msg, proyectos: [] }, { status: res.status });
    }

    const data = JSON.parse(raw);
    let proyectos = (data.results || []).map(parsePage);

    if (q.length > 0) {
      const ql = q.toLowerCase();
      proyectos = proyectos.filter((p: any) =>
        p.nombre.toLowerCase().includes(ql) ||
        p.estado_lead.toLowerCase().includes(ql) ||
        p.cliente_rollup.toLowerCase().includes(ql)
      );
    }

    return NextResponse.json({ proyectos });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, proyectos: [] }, { status: 500 });
  }
}

// PATCH — actualizar proyecto: escribir PDF URL + estado + totales
async function PATCH_(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const body = await req.json();
  const updates: any = {};

  // COTIZACIONES es url — aquí va el link de Cloudinary
  if (body.pdf_url !== undefined)
    updates['COTIZACIONES'] = { url: body.pdf_url };

  // ESTADO DE LEAD es tipo "status" (NO select) — sintaxis diferente
  if (body.estado !== undefined)
    updates['ESTADO DE LEAD'] = { status: { name: body.estado } };

  // Números opcionales
  if (body.total !== undefined)   updates['Total']   = { number: body.total };
  if (body.gravado !== undefined) updates['Gravado'] = { number: body.gravado };
  if (body.igv !== undefined)     updates['IGV']     = { number: body.igv };

  // Usuario
  if (body.usuario !== undefined)
    updates['Usuario'] = { rich_text: [{ text: { content: body.usuario || '' } }] };

  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ properties: updates }),
  });

  const raw = await res.text();
  if (!res.ok) {
    let msg = raw; try { msg = JSON.parse(raw).message; } catch {}
    return NextResponse.json({ error: msg }, { status: res.status });
  }

  return NextResponse.json({ proyecto: parsePage(JSON.parse(raw)) });
}

// Toda escritura correcta invalida la caché de lectura al instante
export const PATCH = trasEscribir(['proyectos'], PATCH_);

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trasEscribir, conCache } from '@/lib/cache';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

function findKey(p: any, ...names: string[]) {
  const targets = names.map(norm);
  for (const key of Object.keys(p)) {
    if (targets.includes(norm(key))) return key;
  }
  return undefined;
}

function parseProyecto(page: any) {
  const p = page.properties;
  const getTitle   = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.title?.[0]?.plain_text || '' : ''; };
  const getStatus  = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.status?.name || '' : ''; };
  const getUrl     = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.url || null : null; };
  const getNumber  = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.number ?? null : null; };
  const getCheck   = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.checkbox ?? false : false; };
  const getSelect  = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.select?.name || '' : ''; };
  const getDate    = (...n: string[]) => { const k = findKey(p,...n); return k ? p[k]?.date?.start || null : null; };
  const getPeople  = (...n: string[]) => { const k = findKey(p,...n); if (!k || !p[k]?.people) return []; return (p[k].people as any[]).map((u:any) => ({ id: u.id, name: u.name || '' })); };
  const readRollup = (...n: string[]) => {
    const k = findKey(p,...n);
    if (!k || p[k]?.type !== 'rollup') return '';
    const r = p[k].rollup;
    if (!r) return '';
    if (r.type === 'array' && r.array?.length > 0) {
      const first = r.array[0];
      if (first.type === 'rich_text')    return first.rich_text?.[0]?.plain_text || '';
      if (first.type === 'title')        return first.title?.[0]?.plain_text || '';
      if (first.type === 'phone_number') return first.phone_number || '';
      if (first.type === 'email')        return first.email || '';
    }
    return '';
  };

  return {
    id:               page.id,
    notion_url:       page.url,
    proyecto:         getTitle('Proyecto', 'Name'),
    cliente:          readRollup('Cliente'),
    telefono:         readRollup('Telefono', 'Teléfono'),
    mail:             readRollup('Mail'),
    estado_lead:      getStatus('ESTADO DE LEAD'),
    estado_produccion: getStatus('Estado'),
    cotizaciones_url: getUrl('COTIZACIONES'),
    contrato_url:     getUrl('CONTRATO'),
    drive_url:        getUrl('DRIVE PROYECTO'),
    factura_url:      getUrl('FACTURA'),
    material_subido:  getCheck('MATERIAL SUBIDO AL TERABOX'),
    total:            getNumber('Total'),
    gravado:          getNumber('Gravado'),
    igv:              getNumber('IGV'),
    monto_pagado:     getNumber('Monto Pagado'),
    monto_pendiente:  (() => { const k = findKey(p, 'Monto Pendiente'); const f = k ? p[k]?.formula : null; return f?.type === 'number' ? f.number : ((getNumber('Total') ?? 0) - (getNumber('Monto Pagado') ?? 0)); })(),
    estado_pago:      (() => { const k = findKey(p, 'Estado de pago'); const f = k ? p[k]?.formula : null; return f?.type === 'string' ? f.string : ''; })(),
    fecha_cobro:      getDate('Fecha de cobro'),
    historial_pagos:  (() => { const k = findKey(p, 'Historial de pagos'); return k ? p[k]?.rich_text?.[0]?.plain_text || '' : ''; })(),
    encargado:        getSelect('OS creador de la cotizacion'),
    persona_contactado: getPeople('Persona de Contactado'),
    // Nuevos campos de producción
    fecha_inicio_proyecto:  getDate('Fecha inicio proyecto'),
    fecha_entrega_estimada: getDate('Fecha entrega estimada'),
    porcentaje_avance:      getNumber('Porcentaje avance'),
    notas_produccion:       (() => { const k = findKey(p, 'Notas de producción', 'Notas de produccion'); return k ? p[k]?.rich_text?.[0]?.plain_text || '' : ''; })(),
    sub_etapa:              getSelect('Sub-etapa'),
    created_time:     page.created_time,
    last_edited_time: page.last_edited_time,
  };
}

// ─── GET — proyectos GANADOS filtrados por estado de producción ───────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const dbId = process.env.NOTION_DB_PIPELINE;
  if (!dbId) return NextResponse.json({ error: 'NOTION_DB_PIPELINE no configurado' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const estadoProd = searchParams.get('estado'); // Planeando | En Progreso | En revision | Hecho

  // Filtrar por ESTADO DE LEAD = GANADO + Estado de producción
  const filters: any[] = [
    { property: 'ESTADO DE LEAD', status: { equals: 'GANADO' } },
  ];

  if (estadoProd && estadoProd !== 'todos') {
    filters.push({ property: 'Estado', status: { equals: estadoProd } });
  } else if (!estadoProd || estadoProd === 'todos') {
    // Excluir solo Archivado (Hecho, En Progreso, etc. sí aparecen)
    filters.push({ property: 'Estado', status: { does_not_equal: 'Archivado' } });
  }

  try {
    const allResults = await conCache(['proyectos'], `produccion:${req.nextUrl.search}`, async () => {
    let allResults: any[] = [];
    let cursor: string | undefined;
    const body: any = {
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      filter: { and: filters },
    };

    do {
      const pageBody = cursor ? { ...body, start_cursor: cursor } : body;
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST', headers: H(), body: JSON.stringify(pageBody),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error Notion' || 'Error Notion');
      }
      const data = await res.json();
      allResults = allResults.concat(data.results || []);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
      return allResults.map(parseProyecto);
    });

    const proyectos = allResults;
    return NextResponse.json({ proyectos, total: proyectos.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── PATCH — actualizar estado de producción ──────────────────────────────────
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { pageId, estado_produccion, material_subido,
          porcentaje_avance, fecha_inicio, fecha_entrega, notas_produccion, sub_etapa,
          proyecto, persona_contactado_ids, total, atendido_por } = body;
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });

  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: H() });
  if (!pageRes.ok) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const page = await pageRes.json();
  const p = page.properties;

  const properties: any = {};

  if (estado_produccion) {
    const k = findKey(p, 'Estado');
    if (k) properties[k] = { status: { name: estado_produccion } };
  }
  if (material_subido !== undefined) {
    const k = findKey(p, 'MATERIAL SUBIDO AL TERABOX');
    if (k) properties[k] = { checkbox: material_subido };
  }
  if (porcentaje_avance !== undefined) {
    const k = findKey(p, 'Porcentaje avance');
    if (k) properties[k] = { number: porcentaje_avance ?? null };
  }
  if (fecha_inicio !== undefined) {
    const k = findKey(p, 'Fecha inicio proyecto');
    if (k) properties[k] = fecha_inicio ? { date: { start: fecha_inicio } } : { date: null };
  }
  if (fecha_entrega !== undefined) {
    const k = findKey(p, 'Fecha entrega estimada');
    if (k) properties[k] = fecha_entrega ? { date: { start: fecha_entrega } } : { date: null };
  }
  if (notas_produccion !== undefined) {
    const k = findKey(p, 'Notas de producción', 'Notas de produccion');
    if (k) properties[k] = { rich_text: notas_produccion ? [{ type: 'text', text: { content: notas_produccion.slice(0, 2000) } }] : [] };
  }
  if (sub_etapa !== undefined) {
    const k = findKey(p, 'Sub-etapa');
    if (k) properties[k] = sub_etapa ? { select: { name: sub_etapa } } : { select: null };
  }
  if (proyecto !== undefined) {
    const k = findKey(p, 'Proyecto', 'Name');
    if (k) properties[k] = { title: [{ type: 'text', text: { content: String(proyecto).slice(0, 200) } }] };
  }
  if (persona_contactado_ids !== undefined) {
    const k = findKey(p, 'Persona de Contactado');
    if (k) properties[k] = { people: (persona_contactado_ids || []).map((id: string) => ({ id })) };
  }
  if (total !== undefined) {
    const k = findKey(p, 'Total');
    if (k) { const n = Number(total); properties[k] = { number: isNaN(n) ? null : n }; }
  }
  if (atendido_por !== undefined) {
    const k = findKey(p, 'OS creador de la cotizacion');
    if (k) properties[k] = atendido_por ? { select: { name: atendido_por } } : { select: null };
  }

  if (Object.keys(properties).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH', headers: H(), body: JSON.stringify({ properties }),
    });
    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.message }, { status: res.status });
    }
    const updated = await res.json();
    return NextResponse.json({ proyecto: parseProyecto(updated) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const PATCH = trasEscribir(['proyectos'], PATCH_);

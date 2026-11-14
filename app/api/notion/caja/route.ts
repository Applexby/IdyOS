import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hoyLima } from '@/lib/utils';
import { trasEscribir, conCache } from '@/lib/cache';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const DB_CAJA = process.env.NOTION_DB_CAJA || 'a29089cfcc104c66997cd6ba911ce654';
const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function findKey(p: any, ...names: string[]): string | undefined {
  const targets = names.map(norm);
  for (const k of Object.keys(p)) if (targets.includes(norm(k))) return k;
  return undefined;
}

function parseMov(page: any) {
  const p = page.properties;
  const title = (k?: string) => (k && p[k]?.title?.[0]?.plain_text) || '';
  const sel   = (k?: string) => (k && p[k]?.select?.name) || '';
  const num   = (k?: string) => (k && typeof p[k]?.number === 'number') ? p[k].number : null;
  const dt    = (k?: string) => (k && p[k]?.date?.start) || null;
  return {
    id: page.id,
    url: page.url,
    descripcion: title(findKey(p, 'Descripción', 'Descripcion', 'Nombre', 'Name')),
    categoria:   sel(findKey(p, 'Categoría', 'Categoria')),
    tipo:        sel(findKey(p, 'Tipo de Transacción', 'Tipo de Transaccion', 'Tipo')),
    monto:       num(findKey(p, 'Monto')) ?? 0,
    fecha:       dt(findKey(p, 'Fecha')),
    created:     page.created_time,
  };
}

// GET — todos los movimientos
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  try {
    const all = await conCache(['caja'], 'todos', async () => {
    let all: any[] = [];
    let cursor: string | undefined;
    do {
      const b: any = { page_size: 100, sorts: [{ property: 'Fecha', direction: 'descending' }] };
      if (cursor) b.start_cursor = cursor;
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_CAJA}/query`, {
        method: 'POST', headers: H(), body: JSON.stringify(b),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || 'Error Notion'); }
      const d = await r.json();
      all = all.concat(d.results || []);
      cursor = d.has_more ? d.next_cursor : undefined;
    } while (cursor);
      return all;
    });
    return NextResponse.json({ movimientos: all.map(parseMov) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, movimientos: [] }, { status: 500 });
  }
}

// POST — crear movimiento. Body: { descripcion, tipo, categoria?, monto, fecha? }
async function POST_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { descripcion, tipo, categoria, monto, fecha } = await req.json();
  if (!descripcion?.trim()) return NextResponse.json({ error: 'La descripción es obligatoria' }, { status: 400 });
  if (monto === undefined || monto === null || isNaN(Number(monto))) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });

  const schemaRes = await fetch(`https://api.notion.com/v1/databases/${DB_CAJA}`, { headers: H() });
  const schema = await schemaRes.json();
  const sp = schema.properties;
  const props: any = {};
  const kDesc = Object.keys(sp).find(k => ['descripción','descripcion','nombre','name'].includes(norm(k)));
  if (kDesc) props[kDesc] = { title: [{ type: 'text', text: { content: descripcion.slice(0, 200) } }] };
  const setSel = (names: string[], val: any) => { const k = Object.keys(sp).find(x => names.map(norm).includes(norm(x))); if (k && val) props[k] = { select: { name: val } }; };
  setSel(['Tipo de Transacción', 'Tipo'], tipo || 'Egreso');
  setSel(['Categoría', 'Categoria'], categoria);
  const kMonto = Object.keys(sp).find(k => norm(k) === norm('Monto'));
  if (kMonto) props[kMonto] = { number: Number(monto) };
  const kFecha = Object.keys(sp).find(k => norm(k) === norm('Fecha'));
  if (kFecha) props[kFecha] = { date: { start: fecha || hoyLima() } };

  try {
    const r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ parent: { database_id: DB_CAJA }, properties: props }),
    });
    if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
    return NextResponse.json({ movimiento: parseMov(await r.json()) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — editar movimiento. Body: { pageId, fields: {...} }
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { pageId, fields } = await req.json();
  if (!pageId || !fields) return NextResponse.json({ error: 'Faltan pageId o fields' }, { status: 400 });
  const cur = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: H() });
  if (!cur.ok) { const e = await cur.json(); return NextResponse.json({ error: e.message }, { status: cur.status }); }
  const page = await cur.json();
  const p = page.properties;
  const props: any = {};
  if (fields.descripcion !== undefined) { const k = findKey(p, 'Descripción', 'Descripcion', 'Nombre', 'Name'); if (k) props[k] = { title: [{ type: 'text', text: { content: String(fields.descripcion).slice(0, 200) } }] }; }
  if (fields.tipo !== undefined) { const k = findKey(p, 'Tipo de Transacción', 'Tipo de Transaccion', 'Tipo'); if (k) props[k] = { select: { name: fields.tipo } }; }
  if (fields.categoria !== undefined) { const k = findKey(p, 'Categoría', 'Categoria'); if (k) props[k] = fields.categoria ? { select: { name: fields.categoria } } : { select: null }; }
  if (fields.monto !== undefined) { const k = findKey(p, 'Monto'); if (k) props[k] = { number: Number(fields.monto) }; }
  if (fields.fecha !== undefined) { const k = findKey(p, 'Fecha'); if (k) props[k] = fields.fecha ? { date: { start: fields.fecha } } : { date: null }; }
  if (Object.keys(props).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ properties: props }) });
    if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
    return NextResponse.json({ movimiento: parseMov(await r.json()) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — archivar movimiento. Body: { pageId }
async function DELETE_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { pageId } = await req.json();
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });
  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ archived: true }) });
    if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const POST = trasEscribir(['caja'], POST_);
export const PATCH = trasEscribir(['caja'], PATCH_);
export const DELETE = trasEscribir(['caja'], DELETE_);

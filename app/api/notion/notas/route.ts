import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hoyLima } from '@/lib/utils';
import { trasEscribir, conCache } from '@/lib/cache';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const DB_NOTAS = process.env.NOTION_DB_NOTAS || '33a3ff7416638072b858ceaad18ebd54';
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

function parseNota(page: any) {
  const p = page.properties;
  const title = (k?: string) => (k && p[k]?.title?.[0]?.plain_text) || '';
  const sel   = (k?: string) => (k && p[k]?.select?.name) || '';
  const chk   = (k?: string) => !!(k && p[k]?.checkbox);
  const dt    = (k?: string) => (k && p[k]?.date?.start) || null;
  const rich  = (k?: string) => (k && p[k]?.rich_text?.map((t: any) => t.plain_text).join('')) || '';

  // Dos fechas separadas:
  //  - "Fecha de creación": día de creación (editable). La usan Idea/Nota/Llamada.
  //  - "Fecha de recordatorio": cuándo recordar, con hora. Solo Recordatorio (va al calendar).
  const kCreacion = findKey(p, 'Fecha de creación', 'Fecha de creacion', 'Fecha creación');
  const kRecordatorio = findKey(p, 'Fecha de recordatorio', 'Fecha recordatorio');

  return {
    id: page.id,
    url: page.url,
    nombre:     title(findKey(p, 'Nombre', 'Name')),
    tipo:       sel(findKey(p, 'Tipo')),
    prioridad:  sel(findKey(p, 'Prioridad')),
    espacio:    sel(findKey(p, 'ESPACIO', 'Espacio')),
    asignado:   sel(findKey(p, 'Asignado OS')),
    hecho:      chk(findKey(p, 'Hecho')),
    fecha_creacion: dt(kCreacion) || page.created_time,
    fecha_recordatorio: dt(kRecordatorio),
    descripcion: rich(findKey(p, 'Descripción', 'Descripcion')),
    created:    page.created_time,
  };
}

// GET — lista de notas (el filtrado por permiso se hace en el front según rol/usuario)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  try {
    const all = await conCache(['notas'], 'todas', async () => {
    let all: any[] = [];
    let cursor: string | undefined;
    do {
      const b: any = { page_size: 100, sorts: [{ timestamp: 'created_time', direction: 'descending' }] };
      if (cursor) b.start_cursor = cursor;
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_NOTAS}/query`, {
        method: 'POST', headers: H(), body: JSON.stringify(b),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || 'Error Notion'); }
      const d = await r.json();
      all = all.concat(d.results || []);
      cursor = d.has_more ? d.next_cursor : undefined;
    } while (cursor);
      return all;
    });
    return NextResponse.json({ notas: all.map(parseNota) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, notas: [] }, { status: 500 });
  }
}

// Asegura que el select "Asignado OS" tenga la opción dada (la añade si falta)
async function ensureAsignadoOption(nombre: string) {
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_NOTAS}`, { headers: H() });
    if (!r.ok) return;
    const d = await r.json();
    const key = Object.keys(d.properties).find(k => norm(k) === norm('Asignado OS'));
    if (!key) return;
    const opts = d.properties[key].select?.options || [];
    if (opts.some((o: any) => norm(o.name) === norm(nombre))) return;
    opts.push({ name: nombre });
    await fetch(`https://api.notion.com/v1/databases/${DB_NOTAS}`, {
      method: 'PATCH', headers: H(),
      body: JSON.stringify({ properties: { [key]: { select: { options: opts } } } }),
    });
  } catch { /* noop */ }
}

// POST — crear nota. Body: { nombre, tipo, prioridad?, espacio, asignado, fecha?, descripcion? }
async function POST_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const body = await req.json();
  const { nombre, tipo, prioridad, espacio, asignado, fecha_creacion, fecha_recordatorio, descripcion } = body;
  if (!nombre?.trim()) return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });

  if (asignado) await ensureAsignadoOption(asignado);

  // Leer schema para escribir con los nombres exactos
  const schemaRes = await fetch(`https://api.notion.com/v1/databases/${DB_NOTAS}`, { headers: H() });
  const schema = await schemaRes.json();
  const sp = schema.properties;
  const props: any = {};
  const kNombre = Object.keys(sp).find(k => norm(k) === norm('Nombre') || norm(k) === norm('Name'));
  if (kNombre) props[kNombre] = { title: [{ type: 'text', text: { content: nombre.slice(0, 200) } }] };
  const setSel = (name: string, val: any) => { const k = Object.keys(sp).find(x => norm(x) === norm(name)); if (k && val) props[k] = { select: { name: val } }; };
  setSel('Tipo', tipo);
  setSel('Prioridad', prioridad);
  setSel('ESPACIO', espacio || 'IDEALO');
  setSel('Asignado OS', asignado);
  // Fecha de creación: día de creación, editable (todas las notas la tienen)
  const kCreacion = Object.keys(sp).find(k => ['fecha de creación','fecha de creacion','fecha creación'].includes(norm(k)));
  if (kCreacion) props[kCreacion] = { date: { start: fecha_creacion || hoyLima() } };
  // Fecha de recordatorio (con hora): SOLO para recordatorios → es la que va al calendar
  const kRecordatorio = Object.keys(sp).find(k => ['fecha de recordatorio','fecha recordatorio'].includes(norm(k)));
  if (kRecordatorio && fecha_recordatorio) props[kRecordatorio] = { date: { start: fecha_recordatorio } };
  const kDesc = Object.keys(sp).find(k => norm(k) === norm('Descripción') || norm(k) === norm('Descripcion'));
  if (kDesc && descripcion) props[kDesc] = { rich_text: [{ type: 'text', text: { content: descripcion.slice(0, 2000) } }] };

  try {
    const r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ parent: { database_id: DB_NOTAS }, properties: props }),
    });
    if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
    return NextResponse.json({ nota: parseNota(await r.json()) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — actualizar nota. Body: { pageId, fields: {...} }
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { pageId, fields } = await req.json();
  if (!pageId || !fields) return NextResponse.json({ error: 'Faltan pageId o fields' }, { status: 400 });

  // Deshacer un borrado: Notion permite des-archivar la página
  if (fields.restaurar) {
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH', headers: H(), body: JSON.stringify({ archived: false }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return NextResponse.json({ error: e.message || 'No se pudo restaurar' }, { status: r.status }); }
    return NextResponse.json({ nota: parseNota(await r.json()) });
  }

  const cur = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: H() });
  if (!cur.ok) { const e = await cur.json(); return NextResponse.json({ error: e.message }, { status: cur.status }); }
  const page = await cur.json();
  const p = page.properties;
  const props: any = {};

  if (fields.nombre !== undefined) { const k = findKey(p, 'Nombre', 'Name'); if (k) props[k] = { title: [{ type: 'text', text: { content: String(fields.nombre).slice(0, 200) } }] }; }
  if (fields.tipo !== undefined) { const k = findKey(p, 'Tipo'); if (k) props[k] = { select: { name: fields.tipo } }; }
  if (fields.prioridad !== undefined) { const k = findKey(p, 'Prioridad'); if (k) props[k] = fields.prioridad ? { select: { name: fields.prioridad } } : { select: null }; }
  if (fields.espacio !== undefined) { const k = findKey(p, 'ESPACIO', 'Espacio'); if (k) props[k] = { select: { name: fields.espacio } }; }
  if (fields.asignado !== undefined) { await ensureAsignadoOption(fields.asignado); const k = findKey(p, 'Asignado OS'); if (k) props[k] = fields.asignado ? { select: { name: fields.asignado } } : { select: null }; }
  if (fields.hecho !== undefined) { const k = findKey(p, 'Hecho'); if (k) props[k] = { checkbox: !!fields.hecho }; }
  if (fields.fecha_creacion !== undefined) { const k = findKey(p, 'Fecha de creación', 'Fecha de creacion', 'Fecha creación'); if (k) props[k] = fields.fecha_creacion ? { date: { start: fields.fecha_creacion } } : { date: null }; }
  if (fields.fecha_recordatorio !== undefined) { const k = findKey(p, 'Fecha de recordatorio', 'Fecha recordatorio'); if (k) props[k] = fields.fecha_recordatorio ? { date: { start: fields.fecha_recordatorio } } : { date: null }; }
  if (fields.descripcion !== undefined) { const k = findKey(p, 'Descripción', 'Descripcion'); if (k) props[k] = { rich_text: [{ type: 'text', text: { content: String(fields.descripcion).slice(0, 2000) } }] }; }

  if (Object.keys(props).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH', headers: H(), body: JSON.stringify({ properties: props }),
    });
    if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
    return NextResponse.json({ nota: parseNota(await r.json()) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — archivar nota. Body: { pageId }
async function DELETE_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { pageId } = await req.json();
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });
  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH', headers: H(), body: JSON.stringify({ archived: true }),
    });
    if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const POST = trasEscribir(['notas'], POST_);
export const PATCH = trasEscribir(['notas'], PATCH_);
export const DELETE = trasEscribir(['notas'], DELETE_);

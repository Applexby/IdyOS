import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trasEscribir, conCache } from '@/lib/cache';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const DB_PIPELINE = process.env.NOTION_DB_PIPELINE || '340f4139a8f04fc0bf85f1fe99e3af07';
const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});
const PROP = 'Motivo de Perdida';

async function getDataSourceId(): Promise<string> {
  // El endpoint /databases/{id} devuelve la propiedad con sus opciones
  return DB_PIPELINE;
}

// GET — listar motivos actuales (opciones del select)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  try {
    // Esquema de la BD Proyectos (opciones de selects), cacheado e invalidado al editar
    const d = await conCache(['proyectos'], 'esquema-proyectos', async () => {
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_PIPELINE}`, { headers: H() });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || 'Error Notion'); }
      return r.json();
    });
    const prop = d.properties?.[PROP];
    const opciones = (prop?.select?.options || []).map((o: any) => ({ id: o.id, name: o.name, color: o.color }));
    return NextResponse.json({ motivos: opciones });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Reescribe la lista completa de opciones del select.
async function setOptions(options: { name: string; color?: string }[]) {
  const r = await fetch(`https://api.notion.com/v1/databases/${DB_PIPELINE}`, {
    method: 'PATCH', headers: H(),
    body: JSON.stringify({ properties: { [PROP]: { select: { options } } } }),
  });
  return r;
}

// POST — añadir un motivo nuevo. Body: { name, color? }
async function POST_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { name, color } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  try {
    const cur = await fetch(`https://api.notion.com/v1/databases/${DB_PIPELINE}`, { headers: H() });
    const d = await cur.json();
    const existing = (d.properties?.[PROP]?.select?.options || []).map((o: any) => ({ name: o.name, color: o.color }));
    if (existing.some((o: any) => o.name.toLowerCase() === name.trim().toLowerCase()))
      return NextResponse.json({ error: 'Ese motivo ya existe' }, { status: 409 });
    existing.push({ name: name.trim(), color: color || 'default' });
    const r = await setOptions(existing);
    if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — renombrar un motivo. Body: { oldName, newName }
// Renombrar la opción en el schema actualiza automáticamente todas las páginas
// que la usan (Notion mantiene el id de la opción).
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { oldName, newName } = await req.json();
  if (!oldName || !newName?.trim()) return NextResponse.json({ error: 'Faltan nombres' }, { status: 400 });
  try {
    const cur = await fetch(`https://api.notion.com/v1/databases/${DB_PIPELINE}`, { headers: H() });
    const d = await cur.json();
    const options = (d.properties?.[PROP]?.select?.options || []).map((o: any) => ({
      id: o.id, // conservar el id hace que el rename propague a las páginas
      name: o.name === oldName ? newName.trim() : o.name,
      color: o.color,
    }));
    const r = await setOptions(options);
    if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — eliminar un motivo. Body: { name }
async function DELETE_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  try {
    const cur = await fetch(`https://api.notion.com/v1/databases/${DB_PIPELINE}`, { headers: H() });
    const d = await cur.json();
    const options = (d.properties?.[PROP]?.select?.options || [])
      .filter((o: any) => o.name !== name)
      .map((o: any) => ({ id: o.id, name: o.name, color: o.color }));
    const r = await setOptions(options);
    if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const POST = trasEscribir(['proyectos'], POST_);
export const PATCH = trasEscribir(['proyectos'], PATCH_);
export const DELETE = trasEscribir(['proyectos'], DELETE_);

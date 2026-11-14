import { NextRequest, NextResponse } from 'next/server';
import { trasEscribir, conCache } from '@/lib/cache';

// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const NOTION_VERSION = '2022-06-28';
function getHeaders() {
  return { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': NOTION_VERSION };
}
function parsePage(page: any) {
  return { id: page.id, nombre: page.properties['Nombre']?.title?.[0]?.plain_text || '' };
}

export async function GET() {
  const DB_ID = process.env.NOTION_DB_EQUIPOS!;
  try {
    const results = await conCache(['equipos'], 'todos', async () => {
    const results: any[] = [];
    let cursor: string | undefined;
    do {
      const body: any = { page_size: 100, sorts: [{ property: 'Nombre', direction: 'ascending' }] };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Error Notion' || 'Error Notion'); }
      const data = await res.json();
      results.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return results;
    });
    return NextResponse.json({ equipos: results.map(parsePage) });
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo conectar con Notion: ${e.message}`, equipos: [] }, { status: 502 });
  }
}

async function POST_(req: NextRequest) {
  const DB_ID = process.env.NOTION_DB_EQUIPOS!;
  const { nombre } = await req.json();
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST', headers: getHeaders(),
    body: JSON.stringify({ parent: { database_id: DB_ID }, properties: { Nombre: { title: [{ text: { content: nombre || '' } }] } } }),
  });
  if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message }, { status: res.status }); }
  const page = await res.json();
  return NextResponse.json({ equipo: parsePage(page) }, { status: 201 });
}

async function PATCH_(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  const { nombre } = await req.json();
  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH', headers: getHeaders(),
    body: JSON.stringify({ properties: { Nombre: { title: [{ text: { content: nombre || '' } }] } } }),
  });
  if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message }, { status: res.status }); }
  const page = await res.json();
  return NextResponse.json({ equipo: parsePage(page) });
}

async function DELETE_(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH', headers: getHeaders(),
    body: JSON.stringify({ archived: true }),
  });
  if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message }, { status: res.status }); }
  return NextResponse.json({ ok: true });
}

// Toda escritura correcta invalida la caché de lectura al instante
export const POST = trasEscribir(['equipos'], POST_);
export const PATCH = trasEscribir(['equipos'], PATCH_);
export const DELETE = trasEscribir(['equipos'], DELETE_);

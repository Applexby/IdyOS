import { NextRequest, NextResponse } from 'next/server';
import { trasEscribir, conCache } from '@/lib/cache';

// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

// BD Servicios confirmada por debug:
// title    → "Nombre"
// richText → "Descripción"
// number   → "PRECIO"
// formula  → "PRECIO SIN IGV" (solo lectura, no se escribe)
// SIN campo Categoría

const NOTION_VERSION = '2022-06-28';
function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

function parsePage(page: any) {
  const p = page.properties;
  const precioConIgv = p['PRECIO']?.number || 0;
  const precioSinIgv =
    p['PRECIO SIN IGV']?.formula?.number ??
    parseFloat((precioConIgv / 1.18).toFixed(2));

  return {
    id: page.id,
    nombre:         p['Nombre']?.title?.[0]?.plain_text || '',
    descripcion:    p['Descripción']?.rich_text?.[0]?.plain_text || '',
    precio_base:    parseFloat(Number(precioSinIgv).toFixed(2)),
    precio_con_igv: precioConIgv,
    // Sin Categoría en la BD → todos van bajo "Servicios"
    categoria:      'Servicios',
    cantidad:       1,
  };
}

export async function GET() {
  const DB_ID = process.env.NOTION_DB_SERVICIOS!;
  try {
    // Paginamos: Notion devuelve como máximo 100 registros por consulta
    const results = await conCache(['servicios'], 'todos', async () => {
    const results: any[] = [];
    let cursor: string | undefined;
    do {
      const body: any = { page_size: 100, sorts: [{ property: 'Nombre', direction: 'ascending' }] };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
      });
      const raw = await res.text();
      if (!res.ok) {
        let msg = raw; try { msg = JSON.parse(raw).message; } catch {}
        throw new Error(msg || 'Error Notion');
      }
      const data = JSON.parse(raw);
      results.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return results;
    });
    return NextResponse.json({ servicios: results.map(parsePage) });
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo conectar con Notion: ${e.message}`, servicios: [] }, { status: 502 });
  }
}

async function POST_(req: NextRequest) {
  const DB_ID = process.env.NOTION_DB_SERVICIOS!;
  const body = await req.json();

  // Solo escribimos campos que existen en la BD
  const properties: any = {
    Nombre:      { title: [{ text: { content: body.nombre || '' } }] },
    Descripción: { rich_text: [{ text: { content: body.descripcion || '' } }] },
    PRECIO:      { number: parseFloat(body.precio_con_igv) || 0 },
    // NO escribimos PRECIO SIN IGV (es fórmula, Notion la calcula)
  };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ parent: { database_id: DB_ID }, properties }),
  });

  const raw = await res.text();
  if (!res.ok) {
    let msg = raw; try { msg = JSON.parse(raw).message; } catch {}
    return NextResponse.json({ error: msg }, { status: res.status });
  }
  return NextResponse.json({ servicio: parsePage(JSON.parse(raw)) }, { status: 201 });
}

async function PATCH_(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  const body = await req.json();

  const properties: any = {
    Nombre:      { title: [{ text: { content: body.nombre || '' } }] },
    Descripción: { rich_text: [{ text: { content: body.descripcion || '' } }] },
    PRECIO:      { number: parseFloat(body.precio_con_igv) || 0 },
  };

  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ properties }),
  });
  const raw = await res.text();
  if (!res.ok) {
    let msg = raw; try { msg = JSON.parse(raw).message; } catch {}
    return NextResponse.json({ error: msg }, { status: res.status });
  }
  return NextResponse.json({ servicio: parsePage(JSON.parse(raw)) });
}

// Toda escritura correcta invalida la caché de lectura al instante
export const POST = trasEscribir(['servicios'], POST_);
export const PATCH = trasEscribir(['servicios'], PATCH_);

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { conCache, invalidar } from '@/lib/cache';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const NOTION_VERSION = '2022-06-28';
const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': NOTION_VERSION,
});

// IDs fijos (no cambian)
const DB_PLANTILLAS      = '5c5f4601-feac-4af0-b974-8a3dfcc44771'; // BD estructurada
const PAGE_WA            = '2e73ff74-1663-8011-8eb7-cff6704b0067'; // Respuestas rápidas WA
const PAGE_MESSENGER     = '2c53ff74-1663-80f0-9802-e8e152bde525'; // Respuestas rápidas Messenger

// Caché 5 min

// ─── Parser de BD Plantillas ──────────────────────────────────────────────────
function parsePlantilla(page: any) {
  const p = page.properties;
  return {
    id:        page.id,
    nombre:    p['Nombre']?.title?.[0]?.plain_text || '',
    categoria: p['Categoría']?.select?.name || p['Categoria']?.select?.name || 'Otro',
    canal:     p['Canal Sugerido']?.select?.name || 'Cualquiera',
    cuerpo:    p['Cuerpo']?.rich_text?.[0]?.plain_text || '',
    activo:    p['Activo']?.checkbox ?? true,
    notas:     p['Notas Internas']?.rich_text?.[0]?.plain_text || '',
    fuente:    'bd' as const,
  };
}

// ─── Parser de bloques de página (para páginas de respuestas rápidas) ──────────
function parseBloques(blocks: any[], canal: string): any[] {
  const plantillas: any[] = [];
  let categoriaActual = 'General';
  let cuerpoActual: string[] = [];

  const flush = () => {
    if (cuerpoActual.length > 0 && categoriaActual !== 'General') {
      plantillas.push({
        id:        `page-${canal}-${plantillas.length}`,
        nombre:    categoriaActual,
        categoria: canal === 'wa' ? 'Respuesta Rápida WA' : 'Respuesta Rápida Messenger',
        canal:     canal === 'wa' ? 'WhatsApp' : 'Messenger',
        cuerpo:    cuerpoActual.join('\n').trim(),
        activo:    true,
        notas:     '',
        fuente:    'page' as const,
      });
    }
    cuerpoActual = [];
  };

  for (const block of blocks) {
    if (block.type === 'heading_2' || block.type === 'heading_3') {
      flush();
      const texts = block[block.type]?.rich_text || [];
      categoriaActual = texts.map((t: any) => t.plain_text).join('').trim();
    } else if (block.type === 'paragraph') {
      const texts = block.paragraph?.rich_text || [];
      const linea = texts.map((t: any) => t.plain_text).join('').trim();
      if (linea) cuerpoActual.push(linea);
    } else if (block.type === 'bulleted_list_item') {
      const texts = block.bulleted_list_item?.rich_text || [];
      const linea = texts.map((t: any) => t.plain_text).join('').trim();
      if (linea) cuerpoActual.push(`• ${linea}`);
    }
  }
  flush();
  return plantillas;
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get('refresh') === 'true';

  if (refresh) invalidar('plantillas');

  try {
    const result = await conCache(['plantillas'], 'todas', async () => {
    // 1) BD estructurada
    const resBD = await fetch(`https://api.notion.com/v1/databases/${DB_PLANTILLAS}/query`, {
      method: 'POST',
      headers: H(),
      body: JSON.stringify({ page_size: 100, sorts: [{ property: 'Categoría', direction: 'ascending' }] }),
    });
    const dataBD = resBD.ok ? await resBD.json() : { results: [] };
    const plantillasBD = (dataBD.results || [])
      .map(parsePlantilla)
      .filter((p: any) => p.activo && p.cuerpo);

    // 2) Respuestas rápidas WA
    const resWA = await fetch(`https://api.notion.com/v1/blocks/${PAGE_WA}/children?page_size=100`, {
      headers: H(),
    });
    const dataWA = resWA.ok ? await resWA.json() : { results: [] };
    const plantillasWA = parseBloques(dataWA.results || [], 'wa');

    // 3) Respuestas rápidas Messenger
    const resMSG = await fetch(`https://api.notion.com/v1/blocks/${PAGE_MESSENGER}/children?page_size=100`, {
      headers: H(),
    });
    const dataMSG = resMSG.ok ? await resMSG.json() : { results: [] };
    const plantillasMSG = parseBloques(dataMSG.results || [], 'messenger');

    // Juntar todo
    const todas = [...plantillasBD, ...plantillasWA, ...plantillasMSG];

    // Agrupar por categoría
    const porCategoria: Record<string, any[]> = {};
    for (const p of todas) {
      if (!porCategoria[p.categoria]) porCategoria[p.categoria] = [];
      porCategoria[p.categoria].push(p);
    }

    return { plantillas: todas, porCategoria, total: todas.length };
    });
    return NextResponse.json(result);

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

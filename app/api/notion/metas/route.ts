import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trasEscribir, conCache, invalidar } from '@/lib/cache';

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

// Caché de 5 minutos para no saturar Notion en cada carga del dashboard

function parseMeta(page: any) {
  const p = page.properties;
  // Normalizar nombres para manejar variaciones de acentos
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const findProp = (name: string) => {
    const target = norm(name);
    return Object.keys(p).find(k => norm(k) === target) || name;
  };
  const getTitle  = (name: string) => p[findProp(name)]?.title?.[0]?.plain_text || '';
  const getNumber = (name: string) => p[findProp(name)]?.number ?? 0;
  const getText   = (name: string) => p[findProp(name)]?.rich_text?.[0]?.plain_text || '';

  return {
    id:           page.id,
    mes:          getTitle('Mes'),
    ano:          getNumber('Año'),
    mes_numero:   getNumber('Mes Número'),
    meta_mensual: getNumber('Meta (S/)'),
    meta_anual:   getNumber('Meta Anual (S/)'),
    notas:        getText('Notas'),
  };
}

// ─── GET ─────────────────────────────────────────────────────────────────────
// Query params:
//   mes=YYYY-MM  → devuelve la meta de ese mes específico
//   ano=YYYY     → devuelve todas las metas del año
//   (sin params) → devuelve todas las metas
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const dbId = process.env.NOTION_DB_METAS;
  if (!dbId) return NextResponse.json({ error: 'NOTION_DB_METAS no configurado' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const mesParam = searchParams.get('mes');   // YYYY-MM
  const anoParam = searchParams.get('ano');   // YYYY
  const refresh  = searchParams.get('refresh') === 'true';

  if (refresh) invalidar('metas');

  try {
    const metas = await conCache(['metas'], 'todas', async () => {
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          page_size: 100,
          // Sort por created_time para evitar problemas con acentos en nombres de campos
          sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Error Notion'); }
      const data = await res.json();
      return (data.results || []).map(parseMeta);
    });

    return filtrarYResponder(metas, mesParam, anoParam);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function filtrarYResponder(metas: any[], mesParam: string | null, anoParam: string | null) {
  if (mesParam) {
    // YYYY-MM → extraer año y mes
    const [year, month] = mesParam.split('-').map(Number);
    const meta = metas.find(m => m.ano === year && m.mes_numero === month);
    if (!meta) return NextResponse.json({ error: 'Meta no encontrada para ese mes' }, { status: 404 });

    // La meta anual la sacamos del registro de enero del mismo año
    const metaAnual = metas.find(m => m.ano === year && m.mes_numero === 1)?.meta_anual
      || meta.meta_anual
      || 0;

    return NextResponse.json({ meta: { ...meta, meta_anual: metaAnual } });
  }

  if (anoParam) {
    const year = parseInt(anoParam);
    const filtradas = metas.filter(m => m.ano === year);
    const metaAnual = filtradas.find(m => m.mes_numero === 1)?.meta_anual || 0;
    return NextResponse.json({ metas: filtradas, meta_anual: metaAnual });
  }

  return NextResponse.json({ metas });
}

// ─── PATCH — actualizar meta de un mes ────────────────────────────────────────
// Solo admins. Body: { pageId, meta_mensual?, meta_anual?, notas? }
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  // Solo admin puede editar metas
  if ((session.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores pueden editar metas' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { pageId, meta_mensual, meta_anual, notas } = body;
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });

  const properties: any = {};
  if (meta_mensual !== undefined) properties['Meta (S/)']      = { number: meta_mensual ?? null };
  if (meta_anual   !== undefined) properties['Meta Anual (S/)'] = { number: meta_anual ?? null };
  if (notas        !== undefined) properties['Notas']           = {
    rich_text: notas ? [{ type: 'text', text: { content: notas } }] : [],
  };

  if (Object.keys(properties).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.message || 'Error al actualizar' }, { status: res.status });
    }
    // Invalidar caché
    const updated = await res.json();
    return NextResponse.json({ meta: parseMeta(updated) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const PATCH = trasEscribir(['metas'], PATCH_);

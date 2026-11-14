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


const round2 = (n: number | null) => (n !== null && !isNaN(n) ? Math.round(n * 100) / 100 : null);

function getFormulaNum(p: any, name: string): number | null {
  const f = p[name]?.formula;
  if (!f) return null;
  return f.type === 'number' ? (f.number ?? null) : null;
}
function getRollupNum(p: any, name: string): number | null {
  const r = p[name]?.rollup;
  if (!r) return null;
  if (r.type === 'number') return r.number ?? null;
  return null;
}

function parseCampana(page: any) {
  const p = page.properties;
  const getTitle  = (name: string) => p[name]?.title?.[0]?.plain_text || '';
  const getSelect = (name: string) => p[name]?.select?.name || '';
  const getNumber = (name: string) => p[name]?.number ?? null;
  const getDate   = (name: string) => p[name]?.date?.start || null;
  const getText   = (name: string) => p[name]?.rich_text?.[0]?.plain_text || '';

  const presupuesto = getNumber('Presupuesto') ?? 0;
  const gastado     = getNumber('Gastado') ?? 0;

  // Métricas automáticas (rollups + fórmulas de Notion alimentadas por el CRM)
  const leadsAuto    = getRollupNum(p, 'Leads (auto)') ?? 0;
  const ganadosAuto  = getRollupNum(p, 'Ganados (auto)') ?? 0;
  const ingresosAuto = getRollupNum(p, 'Ingresos (auto)') ?? 0;

  // Fallback manual (campañas históricas sin leads vinculados)
  const leadsManual    = getNumber('Leads generados') ?? 0;
  const ingresosManual = getNumber('Ingresos (S/)') ?? 0;

  const leads    = leadsAuto > 0 ? leadsAuto : leadsManual;
  const ingresos = ingresosAuto > 0 ? ingresosAuto : ingresosManual;
  const ganados  = ganadosAuto;

  // Cálculos derivados (preferimos fórmula de Notion; si no, calculamos aquí)
  const cpl = getFormulaNum(p, 'CPL real') ?? (leads > 0 ? gastado / leads : null);
  const cpa = getFormulaNum(p, 'CPA real') ?? (ganados > 0 ? gastado / ganados : null);
  const roas = getFormulaNum(p, 'ROAS real') ?? (gastado > 0 ? ingresos / gastado : null);
  const conversion = getFormulaNum(p, 'Conversión (auto)') ?? (leads > 0 ? ganados / leads : null);

  return {
    id:             page.id,
    notion_url:     page.url,
    created_time:   page.created_time,
    nombre:         getTitle('Nombre'),
    canal:          getSelect('Canal'),
    estado:         getSelect('Estado'),
    objetivo:       getSelect('Objetivo'),
    fecha_inicio:   getDate('Inicio'),
    fecha_fin:      getDate('Fin'),
    presupuesto,
    gastado,
    notas:          getText('Notas'),
    // Métricas (automáticas desde el CRM)
    leads,
    ganados,
    ingresos,
    leads_auto:     leadsAuto,
    ingresos_auto:  ingresosAuto,
    // Derivadas
    cpl:        round2(cpl),
    cpa:        round2(cpa),
    roas:       round2(roas),
    conversion: round2(conversion !== null ? conversion * 100 : null), // en %
  };
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const dbId = process.env.NOTION_DB_CAMPANAS;
  if (!dbId) return NextResponse.json({ error: 'NOTION_DB_CAMPANAS no configurado' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const estadoParam = searchParams.get('estado');
  const refresh     = searchParams.get('refresh') === 'true';
  const debug       = searchParams.get('debug') === '1';
  const leadsDe     = searchParams.get('leads'); // id de campaña → devuelve sus leads

  // Devolver los leads vinculados a una campaña (para la tabla tipo CRM)
  if (leadsDe) {
    try {
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${leadsDe}`, { headers: getHeaders() });
      if (!pageRes.ok) return NextResponse.json({ leads: [] });
      const page = await pageRes.json();
      const rel = page.properties?.Leads?.relation || [];
      // Traer cada lead vinculado (en paralelo, máx 50 para no saturar)
      const ids = rel.slice(0, 50).map((r: any) => r.id);
      const leads = await Promise.all(ids.map(async (id: string) => {
        try {
          const r = await fetch(`https://api.notion.com/v1/pages/${id}`, { headers: getHeaders() });
          if (!r.ok) return null;
          const lp = (await r.json()).properties;
          const getTitle = (n: string) => lp[n]?.title?.[0]?.plain_text || '';
          const getStatus = (n: string) => lp[n]?.status?.name || '';
          const getNum = (n: string) => lp[n]?.number ?? null;
          const getDate = (n: string) => lp[n]?.date?.start || null;
          return {
            id,
            proyecto: getTitle('Proyecto'),
            estado_lead: getStatus('ESTADO DE LEAD'),
            total: getNum('Total'),
            fecha_contactado: getDate('Fecha de contactado'),
          };
        } catch { return null; }
      }));
      return NextResponse.json({ leads: leads.filter(Boolean) });
    } catch (e: any) {
      return NextResponse.json({ leads: [], error: e.message });
    }
  }

  // Modo diagnóstico: ?debug=1 → devuelve info cruda para detectar el problema
  if (debug) {
    try {
      const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ page_size: 100 }),
      });
      const raw = await r.json();
      return NextResponse.json({
        debug: true,
        tiene_token: !!process.env.NOTION_TOKEN,
        db_id_usado: dbId,
        notion_status: r.status,
        notion_ok: r.ok,
        notion_error: r.ok ? null : raw,
        resultados_crudos: (raw.results || []).length,
        nombres: (raw.results || []).map((p: any) => p.properties?.Nombre?.title?.[0]?.plain_text || '(sin nombre)'),
      });
    } catch (e: any) {
      return NextResponse.json({ debug: true, excepcion: e.message });
    }
  }

  // Lectura cacheada: se invalida al instante al crear/editar campañas o leads
  if (refresh) invalidar('campanas');

  try {
    const campanas = await conCache(['campanas', 'proyectos'], 'todas', async () => {
      // Sin sort por 'Inicio' (puede estar vacío y dar resultados inconsistentes).
      // Traemos todo y ordenamos en código.
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ page_size: 100 }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Error Notion'); }
      const data = await res.json();
      return (data.results || []).map(parseCampana)
        .sort((a: any, b: any) => {
          const fa = a.fecha_inicio || a.created_time || '';
          const fb = b.fecha_inicio || b.created_time || '';
          return fb.localeCompare(fa);
        });
    });
    const resultado = estadoParam ? campanas.filter((c: any) => c.estado === estadoParam) : campanas;

    // Totales agregados para los KPI cards del módulo
    const totales = resultado.reduce((acc: any, c: any) => {
      acc.gastado  += c.gastado || 0;
      acc.leads    += c.leads || 0;
      acc.ganados  += c.ganados || 0;
      acc.ingresos += c.ingresos || 0;
      return acc;
    }, { gastado: 0, leads: 0, ganados: 0, ingresos: 0 });
    totales.cpl  = totales.leads > 0 ? round2(totales.gastado / totales.leads) : null;
    totales.cpa  = totales.ganados > 0 ? round2(totales.gastado / totales.ganados) : null;
    totales.roas = totales.gastado > 0 ? round2(totales.ingresos / totales.gastado) : null;

    return NextResponse.json({ campanas: resultado, total: resultado.length, totales });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── POST — crear campaña nueva desde el OS ───────────────────────────────────
// Body: { nombre, canal?, objetivo?, estado?, presupuesto?, gastado?, fecha_inicio?, fecha_fin?, notas? }
async function POST_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const dbId = process.env.NOTION_DB_CAMPANAS;
  if (!dbId) return NextResponse.json({ error: 'NOTION_DB_CAMPANAS no configurado' }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { nombre, canal, objetivo, estado, presupuesto, gastado, fecha_inicio, fecha_fin, notas } = body;
  if (!nombre || !nombre.trim()) return NextResponse.json({ error: 'Falta el nombre de la campaña' }, { status: 400 });

  const properties: any = {
    'Nombre': { title: [{ text: { content: nombre.trim() } }] },
    'Estado': { select: { name: estado || 'Preparando' } },
  };
  if (canal)       properties['Canal']       = { select: { name: canal } };
  if (objetivo)    properties['Objetivo']    = { select: { name: objetivo } };
  if (presupuesto !== undefined && presupuesto !== null) properties['Presupuesto'] = { number: Number(presupuesto) };
  if (gastado     !== undefined && gastado !== null)     properties['Gastado']     = { number: Number(gastado) };
  if (fecha_inicio) properties['Inicio'] = { date: { start: fecha_inicio } };
  if (fecha_fin)    properties['Fin']    = { date: { start: fecha_fin } };
  if (notas)        properties['Notas']  = { rich_text: [{ text: { content: notas } }] };

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({ parent: { database_id: dbId }, properties }),
    });
    if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message || 'Error al crear' }, { status: res.status }); }
    const created = await res.json();
    return NextResponse.json({ campana: parseCampana(created) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── PATCH — actualizar campaña (gasto, estado, presupuesto, etc.) ────────────
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if ((session.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores pueden editar campañas' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { pageId, gastado, presupuesto, estado, canal, objetivo, fecha_inicio, fecha_fin, notas } = body;
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });

  const properties: any = {};
  if (gastado      !== undefined) properties['Gastado']     = { number: gastado ?? null };
  if (presupuesto  !== undefined) properties['Presupuesto'] = { number: presupuesto ?? null };
  if (estado       !== undefined) properties['Estado']      = { select: estado ? { name: estado } : null };
  if (canal        !== undefined) properties['Canal']       = { select: canal ? { name: canal } : null };
  if (objetivo     !== undefined) properties['Objetivo']    = { select: objetivo ? { name: objetivo } : null };
  if (fecha_inicio !== undefined) properties['Inicio']      = fecha_inicio ? { date: { start: fecha_inicio } } : { date: null };
  if (fecha_fin    !== undefined) properties['Fin']         = fecha_fin ? { date: { start: fecha_fin } } : { date: null };
  if (notas        !== undefined) properties['Notas']       = { rich_text: notas ? [{ type: 'text', text: { content: notas } }] : [] };

  if (Object.keys(properties).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ properties }),
    });
    if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message || 'Error al actualizar' }, { status: res.status }); }
    const updated = await res.json();
    return NextResponse.json({ campana: parseCampana(updated) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const POST = trasEscribir(['campanas', 'proyectos'], POST_);
export const PATCH = trasEscribir(['campanas', 'proyectos'], PATCH_);

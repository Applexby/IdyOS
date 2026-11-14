import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { diasEntreFechasISO, hoyLima } from '@/lib/utils';
import { trasEscribir } from '@/lib/cache';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});

const DB_ID = '3443ff74-1663-8034-a7d1-000b15b2ed4e';

function parseContabilidad(page: any) {
  const p = page.properties;
  const getNum  = (n: string) => p[n]?.number ?? null;
  const getDate = (n: string) => p[n]?.date?.start || null;
  const getTitle= (n: string) => p[n]?.title?.[0]?.plain_text || '';
  const getSelect=(n: string) => p[n]?.select?.name || '';
  const getFormula=(n: string) => {
    const f = p[n]?.formula;
    if (!f) return null;
    if (f.type === 'number') return f.number;
    if (f.type === 'string') return f.string;
    return null;
  };

  const montoTotal  = getNum('Monto Total') ?? 0;
  const montoPagado = getNum('Monto Pagado') ?? 0;
  const montoPendiente = getFormula('Monto Pendiente') ?? (montoTotal - montoPagado);
  const fechaLimite = getDate('Fecha límite de pago');
  const hoy = hoyLima();

  let alertaPago: 'vencido' | 'urgente' | 'proximo' | null = null;
  if (fechaLimite && montoPendiente > 0) {
    const diasRestantes = diasEntreFechasISO(hoy, fechaLimite);
    if (diasRestantes < 0)   alertaPago = 'vencido';
    else if (diasRestantes <= 3) alertaPago = 'urgente';
    else if (diasRestantes <= 7) alertaPago = 'proximo';
  }

  const proyectosRelacion = p['PROYECTOS']?.relation || [];

  return {
    id:              page.id,
    notion_url:      page.url,
    nombre:          getTitle('Nombre'),
    monto_total:     montoTotal,
    monto_pagado:    montoPagado,
    monto_pendiente: montoPendiente,
    fecha_inicio:    getDate('INICIO DE PROYECTO'),
    fecha_limite:    fechaLimite,
    mes:             getSelect('MES'),
    alerta_pago:     alertaPago,
    proyecto_id:     proyectosRelacion[0]?.id || null,
    created_time:    page.created_time,
  };
}

// ─── GET — todos los registros contables o filtrados por proyecto ──────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const soloAlertas = searchParams.get('alertas') === 'true';
  const proyectoId  = searchParams.get('proyecto_id');

  try {
    let allResults: any[] = [];
    let cursor: string | undefined;
    const body: any = {
      page_size: 100,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    };

    do {
      const pageBody = cursor ? { ...body, start_cursor: cursor } : body;
      const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
        method: 'POST', headers: H(), body: JSON.stringify(pageBody),
      });
      if (!res.ok) {
        const err = await res.json();
        return NextResponse.json({ error: err.message || 'Error Notion' }, { status: res.status });
      }
      const data = await res.json();
      allResults = allResults.concat(data.results || []);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    let registros = allResults.map(parseContabilidad);

    if (proyectoId) {
      registros = registros.filter(r => r.proyecto_id === proyectoId);
    }

    if (soloAlertas) {
      registros = registros.filter(r => r.alerta_pago !== null);
    }

    const totalPendiente = registros.reduce((a, r) => a + (r.monto_pendiente || 0), 0);
    const totalPagado    = registros.reduce((a, r) => a + (r.monto_pagado || 0), 0);
    const alertas        = registros.filter(r => r.alerta_pago !== null);

    return NextResponse.json({ registros, totalPendiente, totalPagado, alertas, total: registros.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── PATCH — actualizar monto pagado o fecha límite ───────────────────────────
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { pageId, monto_pagado, fecha_limite, monto_total } = body;
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });

  const properties: any = {};
  if (monto_pagado  !== undefined) properties['Monto Pagado']          = { number: monto_pagado ?? null };
  if (monto_total   !== undefined) properties['Monto Total']           = { number: monto_total ?? null };
  if (fecha_limite  !== undefined) properties['Fecha límite de pago']  = fecha_limite ? { date: { start: fecha_limite } } : { date: null };

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
    return NextResponse.json({ registro: parseContabilidad(updated) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const PATCH = trasEscribir(['proyectos'], PATCH_);

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const userName = session.user?.name || '';
  const userEmail = session.user?.email || '';

  try {
    // Cotizaciones del usuario (campo creado_por)
    const resCot = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_DB_COTIZACIONES}/query`, {
      method: 'POST',
      headers: H(),
      body: JSON.stringify({ page_size: 100 }),
    });
    const dataCot = resCot.ok ? await resCot.json() : { results: [] };
    const todasCots = dataCot.results || [];

    // Filtrar por usuario
    const misCots = todasCots.filter((p: any) => {
      const creador = p.properties['OS creador de la cotizaci...']?.created_by?.name ||
                     p.properties['Creado por']?.created_by?.name || '';
      return norm(creador).includes(norm(userName.split(' ')[0]));
    });

    const montoTotal = misCots.reduce((acc: number, p: any) => {
      const total = p.properties['Total']?.number ||
                   p.properties['Monto']?.number || 0;
      return acc + total;
    }, 0);

    // Leads atendidos (Persona de Contactado)
    const resLeads = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_DB_PIPELINE}/query`, {
      method: 'POST',
      headers: H(),
      body: JSON.stringify({ page_size: 100 }),
    });
    const dataLeads = resLeads.ok ? await resLeads.json() : { results: [] };
    const todosLeads = dataLeads.results || [];

    const misLeads = todosLeads.filter((p: any) => {
      const personas: any[] = p.properties['Persona de Contactado']?.people || [];
      return personas.some((u: any) =>
        norm(u.name || '').includes(norm(userName.split(' ')[0]))
      );
    });

    const ganados  = misLeads.filter((p: any) => p.properties['ESTADO DE LEAD']?.status?.name === 'GANADO').length;
    const activos  = misLeads.filter((p: any) => {
      const e = p.properties['ESTADO DE LEAD']?.status?.name || '';
      return !['GANADO', 'PERDIDO'].includes(e);
    }).length;
    const perdidos = misLeads.filter((p: any) => p.properties['ESTADO DE LEAD']?.status?.name === 'PERDIDO').length;
    const cerrados = ganados + perdidos;
    const tasaCierre = cerrados > 0 ? Math.round((ganados / cerrados) * 100) : 0;

    // Últimas 5 cotizaciones del usuario
    const recientes = misCots.slice(0, 5).map((p: any) => ({
      numero: p.properties['Número']?.title?.[0]?.plain_text ||
              p.properties['Cotización']?.title?.[0]?.plain_text || '—',
      cliente: p.properties['Cliente']?.rich_text?.[0]?.plain_text || '—',
      monto: p.properties['Total']?.number || p.properties['Monto']?.number || 0,
      fecha: p.created_time?.split('T')[0] || '',
    }));

    return NextResponse.json({
      usuario: {
        nombre: userName,
        email: userEmail,
        rol: (session.user as any)?.role || 'user',
      },
      stats: {
        cotizaciones: misCots.length,
        monto_total: montoTotal,
        leads_atendidos: misLeads.length,
        leads_ganados: ganados,
        leads_activos: activos,
        leads_perdidos: perdidos,
        tasa_cierre: tasaCierre,
      },
      recientes,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

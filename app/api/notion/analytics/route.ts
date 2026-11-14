import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { conCache, invalidar } from '@/lib/cache';
import { mesLima } from '@/lib/utils';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});


// ─── GET /api/notion/analytics ───────────────────────────────────────────────
// Query params:
//   mes=YYYY-MM   → filtra por mes
//   ano=YYYY      → filtra por año
//   tipo=servicios|fidelizacion|ambos (default: ambos)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mesParam  = searchParams.get('mes');
  const anoParam  = searchParams.get('ano');
  const tipo      = searchParams.get('tipo') || 'ambos';
  const refresh   = searchParams.get('refresh') === 'true';

  const cacheKey = `${mesParam || ''}_${anoParam || ''}_${tipo}`;

  if (refresh) invalidar('proyectos');

  const DB_PIPELINE = process.env.NOTION_DB_PIPELINE!;
  const DB_SERVICIOS = process.env.NOTION_DB_SERVICIOS!;

  try {
    const result = await conCache(['proyectos', 'servicios'], `analytics:${cacheKey}`, async () => {
    // 1) Traer proyectos GANADOS
    let allProyectos: any[] = [];
    let cursor: string | undefined;
    const bodyQ: any = {
      page_size: 100,
      filter: { property: 'ESTADO DE LEAD', status: { equals: 'GANADO' } },
    };
    do {
      const b = cursor ? { ...bodyQ, start_cursor: cursor } : bodyQ;
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_PIPELINE}/query`, {
        method: 'POST', headers: H(), body: JSON.stringify(b),
      });
      if (!r.ok) break;
      const d = await r.json();
      allProyectos = allProyectos.concat(d.results || []);
      cursor = d.has_more ? d.next_cursor : undefined;
    } while (cursor);

    // 2) Filtrar por periodo
    let proyectos = allProyectos;
    if (mesParam) {
      const [y, m] = mesParam.split('-').map(Number);
      const clave = `${y}-${String(m).padStart(2, '0')}`;
      proyectos = proyectos.filter(p => mesLima(p.properties['Fecha de contactado']?.date?.start || p.created_time) === clave);
    } else if (anoParam) {
      const y = parseInt(anoParam);
      proyectos = proyectos.filter(p => mesLima(p.properties['Fecha de contactado']?.date?.start || p.created_time)?.startsWith(`${y}-`));
    }

    // 3) Obtener nombres de servicios (si hay relaciones)
    const serviciosIds = new Set<string>();
    proyectos.forEach(p => {
      const rels = p.properties['Servicios']?.relation || [];
      rels.forEach((r: any) => serviciosIds.add(r.id));
    });

    const serviciosMap: Record<string, string> = {};
    if (serviciosIds.size > 0 && DB_SERVICIOS) {
      // Batch fetch de servicios
      const ids = Array.from(serviciosIds).slice(0, 50); // máx 50
      await Promise.all(ids.map(async (id) => {
        try {
          const r = await fetch(`https://api.notion.com/v1/pages/${id}`, { headers: H() });
          if (!r.ok) return;
          const d = await r.json();
          const nombre = d.properties['Nombre']?.title?.[0]?.plain_text
            || d.properties['Name']?.title?.[0]?.plain_text
            || 'Servicio sin nombre';
          serviciosMap[id] = nombre;
        } catch {}
      }));
    }

    // 4) Calcular servicios más vendidos
    const serviciosCount: Record<string, { nombre: string; count: number; monto: number }> = {};
    proyectos.forEach(p => {
      const rels = p.properties['Servicios']?.relation || [];
      const monto = p.properties['Total']?.number || 0;
      const montoPorServicio = rels.length > 0 ? monto / rels.length : monto;

      if (rels.length === 0) {
        // Sin servicio específico — usar nombre del proyecto como referencia
        const nombre = p.properties['Proyecto']?.title?.[0]?.plain_text || 'Sin clasificar';
        const cat = inferirCategoria(nombre);
        if (!serviciosCount[cat]) serviciosCount[cat] = { nombre: cat, count: 0, monto: 0 };
        serviciosCount[cat].count++;
        serviciosCount[cat].monto += monto;
      } else {
        rels.forEach((r: any) => {
          const nombre = serviciosMap[r.id] || inferirCategoria(
            p.properties['Proyecto']?.title?.[0]?.plain_text || ''
          );
          if (!serviciosCount[nombre]) serviciosCount[nombre] = { nombre, count: 0, monto: 0 };
          serviciosCount[nombre].count++;
          serviciosCount[nombre].monto += montoPorServicio;
        });
      }
    });

    const serviciosTop = Object.values(serviciosCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(s => ({ ...s, monto: Math.round(s.monto) }));

    // 5) Calcular fidelización (clientes que repiten)
    const clientesPorMes: Record<string, Set<string>> = {};
    allProyectos.forEach(p => {
      const key = mesLima(p.properties['Fecha de contactado']?.date?.start || p.created_time) || '';
      const empresaId = p.properties['Empresa']?.relation?.[0]?.id;
      if (!empresaId) return;
      if (!clientesPorMes[key]) clientesPorMes[key] = new Set();
      clientesPorMes[key].add(empresaId);
    });

    // Detectar renovaciones: empresa que aparece en mes actual Y en algún mes anterior
    let renovaciones = 0;
    let totalGanadosMes = proyectos.length;
    if (mesParam) {
      const clientesMesActual = new Set(
        proyectos.map(p => p.properties['Empresa']?.relation?.[0]?.id).filter(Boolean)
      );
      const mesesAnteriores = Object.entries(clientesPorMes)
        .filter(([k]) => k < mesParam!)
        .map(([, v]) => v);
      const clientesAnteriores = new Set(mesesAnteriores.flatMap(s => Array.from(s)));
      clientesMesActual.forEach(id => {
        if (clientesAnteriores.has(id)) renovaciones++;
      });
    }

    const pctFidelizacion = totalGanadosMes > 0
      ? Math.round((renovaciones / totalGanadosMes) * 100)
      : 0;

    const result = {
      __key: cacheKey,
      servicios_top: serviciosTop,
      fidelizacion: {
        renovaciones,
        total_ganados: totalGanadosMes,
        pct: pctFidelizacion,
      },
      periodo: mesParam || anoParam || 'total',
    };

    return result;
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Inferir categoría desde el nombre del proyecto
function inferirCategoria(nombre: string): string {
  const n = nombre.toLowerCase();
  if (n.includes('reel') || n.includes('reels'))             return 'Reels';
  if (n.includes('foto producto') || n.includes('fotopro'))  return 'Foto Producto';
  if (n.includes('fotografía') || n.includes('fotografia') || n.includes('foto publicit')) return 'Fotografía Publicitaria';
  if (n.includes('cobertura') || n.includes('evento'))       return 'Cobertura de Evento';
  if (n.includes('video corp') || n.includes('corporativ'))  return 'Video Corporativo';
  if (n.includes('video pub') || n.includes('publicitario')) return 'Video Publicitario';
  if (n.includes('animac') || n.includes('ia'))              return 'Animación con IA';
  if (n.includes('contenido') || n.includes('content'))      return 'Contenido Digital';
  return 'Otros servicios';
}

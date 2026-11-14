import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CADENCIA_SEGUIMIENTO } from '@/types/crm';
import { hoyLima } from '@/lib/utils';
import { trasEscribir } from '@/lib/cache';

export const runtime = 'nodejs';

const DB_PIPELINE = process.env.NOTION_DB_PIPELINE || '340f4139a8f04fc0bf85f1fe99e3af07';
const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
function findKey(p: any, ...names: string[]): string | undefined {
  const targets = names.map(norm);
  for (const key of Object.keys(p)) if (targets.includes(norm(key))) return key;
  return undefined;
}
const getDate = (p: any, ...names: string[]) => {
  const k = findKey(p, ...names);
  return (k && p[k]?.date?.start) || null;
};

// Días de calendario entre dos fechas ISO (solo parte YYYY-MM-DD, en UTC).
function diasEntre(aISO: string, bISO: string): number {
  const ta = Date.parse(aISO.slice(0, 10) + 'T00:00:00Z');
  const tb = Date.parse(bISO.slice(0, 10) + 'T00:00:00Z');
  return Math.round((tb - ta) / 86400000);
}
// Suma días a una fecha ISO y devuelve YYYY-MM-DD
function sumarDias(baseISO: string, dias: number): string {
  const t = Date.parse(baseISO.slice(0, 10) + 'T00:00:00Z') + dias * 86400000;
  return new Date(t).toISOString().split('T')[0];
}

const ESTADOS_ACTIVOS = ['CONTACTADO', 'SEGUIMIENTO', 'COTIZACION ENVIADA', 'Negociacion'];

// Dado los días que lleva un lead desde su contacto, cuál es su PRÓXIMO hito (3/7/14/30).
// Devuelve null si ya pasó el último hito (cadencia agotada).
function proximoHito(diasLleva: number): number | null {
  for (const h of CADENCIA_SEGUIMIENTO) {
    if (diasLleva < h) return h;
  }
  return null; // pasó el día 30
}

// ─── POST — calibración de un solo uso ────────────────────────────────────────
// Recorre los leads activos y puebla "Próximo seguimiento" con la fecha de su
// próximo hito de cadencia, calculada desde su fecha de contacto. NO toca
// GANADO/PERDIDO. Reporta los leads que ya pasaron el día 30.
// Body opcional: { dry_run: true } → solo simula y reporta, no escribe.
async function POST_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  // Acción masiva sobre todos los leads (vive en Ajustes): solo administradores
  if ((session.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* sin body = aplicar */ }
  const dryRun = !!body?.dry_run;

  const hoyISO = hoyLima();

  try {
    // 1) Traer todos los leads (paginado)
    let all: any[] = [];
    let cursor: string | undefined;
    do {
      const b: any = { page_size: 100 };
      if (cursor) b.start_cursor = cursor;
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_PIPELINE}/query`, {
        method: 'POST', headers: H(), body: JSON.stringify(b),
      });
      if (!r.ok) { const e = await r.json(); return NextResponse.json({ error: e.message }, { status: r.status }); }
      const d = await r.json();
      all = all.concat(d.results || []);
      cursor = d.has_more ? d.next_cursor : undefined;
    } while (cursor);

    const actualizados: any[] = [];
    const agotados: any[] = [];   // pasaron día 30 y no están PERDIDO
    const saltados: any[] = [];   // sin fecha de contacto

    for (const page of all) {
      const p = page.properties;
      const estado = p[findKey(p, 'ESTADO DE LEAD') || '']?.status?.name || '';
      if (!ESTADOS_ACTIVOS.includes(estado)) continue; // ignora NUEVO LEAD, GANADO, PERDIDO

      const nombre = p[findKey(p, 'Proyecto', 'Name') || '']?.title?.[0]?.plain_text || '(sin nombre)';
      const ref = getDate(p, 'Fecha último contacto', 'Fecha ultimo contacto') || getDate(p, 'Fecha de contactado');
      if (!ref) { saltados.push({ id: page.id, nombre }); continue; }

      const diasLleva = diasEntre(ref, hoyISO);
      const hito = proximoHito(diasLleva);

      if (hito === null) {
        // Cadencia agotada (>30 días). No lo tocamos; lo reportamos para revisión.
        agotados.push({ id: page.id, nombre, dias: diasLleva, url: page.url });
        continue;
      }

      // Fecha del próximo hito = fecha de contacto + hito días
      const fechaProximo = sumarDias(ref, hito);
      actualizados.push({ id: page.id, nombre, dias: diasLleva, proximo_hito: hito, fecha: fechaProximo });

      if (!dryRun) {
        const kProx = findKey(p, 'Próximo seguimiento', 'Proximo seguimiento');
        if (kProx) {
          await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
            method: 'PATCH', headers: H(),
            body: JSON.stringify({ properties: { [kProx]: { date: { start: fechaProximo } } } }),
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total_activos: actualizados.length + agotados.length + saltados.length,
      actualizados: actualizados.length,
      detalle_actualizados: actualizados,
      agotados_mas_30_dias: agotados,   // ← revísalos tú
      sin_fecha_contacto: saltados,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const POST = trasEscribir(['proyectos'], POST_);

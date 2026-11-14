import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { AccionSeguimiento, EstadoLead } from '@/types/crm';
import { etapaDe, proximoIntervalo, CADENCIA_SEGUIMIENTO } from '@/types/crm';
import { hoyLima, sumarDiasISO, ZONA_HORARIA } from '@/lib/utils';
import { trasEscribir } from '@/lib/cache';

export const runtime = 'nodejs';

const NOTION_VERSION = '2022-06-28';
const headers = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': NOTION_VERSION,
});

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

function findKey(p: any, ...names: string[]): string | undefined {
  const targets = names.map(norm);
  for (const key of Object.keys(p)) {
    if (targets.includes(norm(key))) return key;
  }
  return undefined;
}

// Fechas en hora de Perú: con toISOString (UTC) las acciones hechas después
// de las 19:00 quedaban registradas con la fecha del día siguiente.
const addDays = (days: number) => sumarDiasISO(days);
const hoy = hoyLima;

// Cuenta los toques SIN respuesta del ciclo actual: las notas están en orden
// de más reciente a más antigua, así que contamos las líneas "No respondió"
// hasta encontrar la última vez que el cliente respondió (o se le envió
// cotización). Así la cadencia 3→7→14→30 se reinicia cuando hay respuesta.
function contarToques(notas: string): number {
  if (!notas) return 0;
  let toques = 0;
  for (const linea of notas.split('\n')) {
    if (/Respondió|Cotización enviada/.test(linea) && !/No respondió/.test(linea)) break;
    if (/No respondió/.test(linea)) toques++;
  }
  return toques;
}

// ─── POST — procesar acción de seguimiento ────────────────────────────────────
// Acciones:
//  - mensaje_enviado: marca "Contactado hoy" (limbo). Sale del checklist hoy,
//    reaparece mañana. NO cambia etapa ni próximo seguimiento.
//  - no_respondio: se queda en SEGUIMIENTO, reprograma próximo contacto según cadencia.
//  - respondio: el usuario fija la etapa (default SEGUIMIENTO); si sigue abierto,
//    programa el próximo contacto (3 días, o 2 si se envió cotización).
//  - cotizacion_enviada / ganado / perdido: etapas finales del embudo.
async function POST_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { leadId, accion, nuevo_estado, motivo_perdida, nota } = body as {
    leadId: string; accion: AccionSeguimiento;
    nuevo_estado?: EstadoLead; motivo_perdida?: string; nota?: string;
  };

  if (!leadId || !accion) return NextResponse.json({ error: 'Faltan leadId o accion' }, { status: 400 });

  const pageRes = await fetch(`https://api.notion.com/v1/pages/${leadId}`, { headers: headers() });
  if (!pageRes.ok) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
  const page = await pageRes.json();
  const p = page.properties;

  const estadoActual = (p[findKey(p, 'ESTADO DE LEAD') || '']?.status?.name || '') as EstadoLead;
  const notasActual  = p[findKey(p, 'Notas de seguimiento') || '']?.rich_text?.[0]?.plain_text || '';

  const properties: any = {};
  const userName = session.user?.name || 'Usuario';
  const timestamp = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA_HORARIA });

  // ── Caso especial: mensaje_enviado (el limbo) ──────────────────────────────
  // Solo marca Contactado hoy y deja una nota. No cambia etapa ni próximo seg.
  if (accion === 'mensaje_enviado') {
    const kHoy = findKey(p, 'Contactado hoy');
    if (kHoy) properties[kHoy] = { date: { start: hoy() } };
    const kNotas = findKey(p, 'Notas de seguimiento');
    if (kNotas) {
      const linea = `[${timestamp} · ${userName}] 📨 Mensaje enviado${nota ? ` — ${nota}` : ''}`;
      const textoNuevo = notasActual ? `${linea}\n${notasActual}` : linea;
      properties[kNotas] = { rich_text: [{ type: 'text', text: { content: textoNuevo.slice(0, 2000) } }] };
    }
    const res = await fetch(`https://api.notion.com/v1/pages/${leadId}`, {
      method: 'PATCH', headers: headers(), body: JSON.stringify({ properties }),
    });
    if (!res.ok) { const e = await res.json(); return NextResponse.json({ error: e.message }, { status: res.status }); }
    return NextResponse.json({ ok: true, contactado_hoy: hoy() });
  }

  let nuevoEstado: EstadoLead | undefined;
  let proximoSeguimiento: string | undefined;
  let limpiarContactadoHoy = false;

  const etapa = etapaDe(estadoActual);

  switch (accion) {
    case 'no_respondio': {
      // Se mantiene en SEGUIMIENTO; el tiempo lo lleva el contador.
      nuevoEstado = 'SEGUIMIENTO';
      const toques = contarToques(notasActual) + 1; // este es un toque más
      proximoSeguimiento = addDays(proximoIntervalo(toques));
      limpiarContactadoHoy = true; // listo para el próximo ciclo
      break;
    }
    case 'respondio': {
      nuevoEstado = nuevo_estado || 'SEGUIMIENTO';
      // Si sigue abierto, programar el siguiente contacto (antes quedaba vacío
      // y el lead se perdía del radar de "próximos seguimientos").
      if (nuevoEstado === 'GANADO' || nuevoEstado === 'PERDIDO') proximoSeguimiento = undefined;
      else if (nuevoEstado === 'COTIZACION ENVIADA') proximoSeguimiento = addDays(2);
      else proximoSeguimiento = addDays(CADENCIA_SEGUIMIENTO[0]);
      limpiarContactadoHoy = true;
      break;
    }
    case 'cotizacion_enviada': {
      nuevoEstado = 'COTIZACION ENVIADA';
      proximoSeguimiento = addDays(2);
      limpiarContactadoHoy = true;
      break;
    }
    case 'ganado': {
      nuevoEstado = 'GANADO';
      proximoSeguimiento = undefined;
      // Al ganar, registrar la Fecha de cobro = hoy (alimenta contabilidad/dashboard)
      const kCobro = findKey(p, 'Fecha de cobro');
      if (kCobro && !p[kCobro]?.date?.start) properties[kCobro] = { date: { start: hoy() } };
      limpiarContactadoHoy = true;
      break;
    }
    case 'perdido': {
      nuevoEstado = 'PERDIDO';
      proximoSeguimiento = undefined;
      limpiarContactadoHoy = true;
      break;
    }
  }

  const kEstado = findKey(p, 'ESTADO DE LEAD');
  if (kEstado && nuevoEstado) properties[kEstado] = { status: { name: nuevoEstado } };

  const kFechaUltimo = findKey(p, 'Fecha último contacto', 'Fecha ultimo contacto');
  if (kFechaUltimo) properties[kFechaUltimo] = { date: { start: hoy() } };

  const kProximo = findKey(p, 'Próximo seguimiento', 'Proximo seguimiento');
  if (kProximo) properties[kProximo] = proximoSeguimiento ? { date: { start: proximoSeguimiento } } : { date: null };

  // Limpiar "Contactado hoy" cuando ya se resolvió el ciclo
  if (limpiarContactadoHoy) {
    const kHoy = findKey(p, 'Contactado hoy');
    if (kHoy) properties[kHoy] = { date: null };
  }

  const kNotas = findKey(p, 'Notas de seguimiento');
  if (kNotas) {
    const accionLabel: Record<string, string> = {
      respondio:          '✅ Respondió',
      no_respondio:       '⏳ No respondió',
      ganado:             '🎉 GANADO',
      perdido:            '❌ PERDIDO',
      cotizacion_enviada: '📄 Cotización enviada',
    };
    const linea = `[${timestamp} · ${userName}] ${accionLabel[accion] || accion}${nota ? ` — ${nota}` : ''}`;
    const textoNuevo = notasActual ? `${linea}\n${notasActual}` : linea;
    properties[kNotas] = { rich_text: [{ type: 'text', text: { content: textoNuevo.slice(0, 2000) } }] };
  }

  if (accion === 'perdido' && motivo_perdida) {
    const kMotivo = findKey(p, 'Motivo de Perdida', 'Motivo de Pérdida');
    if (kMotivo) properties[kMotivo] = { select: { name: motivo_perdida } };
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${leadId}`, {
      method: 'PATCH', headers: headers(), body: JSON.stringify({ properties }),
    });
    if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message || 'Error' }, { status: res.status }); }
    return NextResponse.json({ ok: true, nuevo_estado: nuevoEstado, proximo_seguimiento: proximoSeguimiento || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const POST = trasEscribir(['proyectos', 'campanas'], POST_);

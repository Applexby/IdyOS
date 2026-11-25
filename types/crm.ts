// ─── Estados del lead ────────────────────────────────────────────────────────
// Modelo nuevo: el ESTADO es la ETAPA del embudo. Los días de seguimiento los
// calcula el sistema solo (no son estados). Los estados "SEGUIMIENTO DIA X" que
// aún existen en Notion se tratan todos como la etapa "SEGUIMIENTO".
export type EstadoLead =
  | 'NUEVO LEAD'
  | 'CONTACTADO'
  | 'SEGUIMIENTO'
  | 'SEGUIMIENTO DIA 3'
  | 'SEGUIMIENTO DIA 7'
  | 'SEGUIMIENTO DIA 14'
  | 'SEGUIMIENTO DIA 30'
  | 'COTIZACION ENVIADA'
  | 'Negociacion'
  | 'GANADO'
  | 'PERDIDO';

// Etapas canónicas del embudo (lo que el usuario realmente maneja)
export type EtapaEmbudo =
  | 'NUEVO LEAD'
  | 'CONTACTADO'
  | 'SEGUIMIENTO'
  | 'COTIZACION ENVIADA'
  | 'Negociacion'
  | 'GANADO'
  | 'PERDIDO';

// Cualquier "SEGUIMIENTO DIA X" colapsa a la etapa SEGUIMIENTO
export function etapaDe(estado: string): EtapaEmbudo {
  if (!estado) return 'NUEVO LEAD';
  if (estado.startsWith('SEGUIMIENTO')) return 'SEGUIMIENTO';
  return estado as EtapaEmbudo;
}

export const ESTADOS_ACTIVOS: EstadoLead[] = [
  'NUEVO LEAD',
  'CONTACTADO',
  'SEGUIMIENTO',
  'SEGUIMIENTO DIA 3',
  'SEGUIMIENTO DIA 7',
  'SEGUIMIENTO DIA 14',
  'SEGUIMIENTO DIA 30',
  'COTIZACION ENVIADA',
  'Negociacion',
];

export const ESTADOS_CERRADOS: EstadoLead[] = ['GANADO', 'PERDIDO'];

// Etapas visibles en el kanban (4 columnas como hoy, pero limpias)
export const ETAPAS_KANBAN: EtapaEmbudo[] = [
  'NUEVO LEAD',
  'CONTACTADO',
  'SEGUIMIENTO',
  'COTIZACION ENVIADA',
];

// Avance automático cuando NO responde: al estar en SEGUIMIENTO se queda en
// SEGUIMIENTO y solo se reprograma el próximo contacto. La cadencia define en
// cuántos días vuelve a aparecer según cuántos toques ya lleva.
export const SIGUIENTE_ETAPA: Partial<Record<EtapaEmbudo, EtapaEmbudo>> = {
  'NUEVO LEAD':  'CONTACTADO',
  'CONTACTADO':  'SEGUIMIENTO',
  'SEGUIMIENTO': 'SEGUIMIENTO', // se mantiene; el tiempo lo lleva el contador
};

// Cadencia de reintentos de seguimiento (días desde el último contacto).
// El sistema elige el siguiente intervalo según cuántos toques lleva el lead.
/** Canales por los que llega un lead (select "Canal" de la ficha del cliente). */
export const CANALES_LEAD = ['WhatsApp', 'Instagram', 'Messenger', 'Facebook', 'TikTok', 'Correo', 'Llamada'];

export const CADENCIA_SEGUIMIENTO = [3, 7, 14, 30];

export function proximoIntervalo(toques: number): number {
  if (toques <= 0) return CADENCIA_SEGUIMIENTO[0];
  if (toques >= CADENCIA_SEGUIMIENTO.length) return CADENCIA_SEGUIMIENTO[CADENCIA_SEGUIMIENTO.length - 1];
  return CADENCIA_SEGUIMIENTO[toques];
}

// ── Lógica del tracker de seguimiento basada en DÍAS desde el contacto ─────────
// Cadencia de dos pasos por hito: en el día del hito (3,7,14,30) toca "contactar"
// (marcar mensaje enviado); al día siguiente (4,8,15,31) toca "reportar" el
// resultado. Funciona aunque el lead NO tenga "Próximo seguimiento" en Notion:
// la referencia es la fecha de contacto / último contacto.
//
// Devuelve:
//  - 'contactar':  hoy cae en un hito (3/7/14/30) y aún no se marcó mensaje.
//  - 'atrasado':   pasó un hito sin atender (no es día exacto pero ya venció) → sigue pendiente.
//  - 'reportar':   ya se marcó mensaje un día anterior → reportar resultado.
//  - null:         hoy no toca nada.
export type TareaTracker = 'contactar' | 'atrasado' | 'reportar' | null;

export function tareaSeguimiento(params: {
  diasDesdeContacto: number | null; // días desde la última interacción (contacto o último contacto)
  contactadoHoy: boolean;            // ya marqué "mensaje enviado" hoy
  contactadoAntes: boolean;          // marqué "mensaje enviado" un día anterior (pendiente de reporte)
}): TareaTracker {
  const { diasDesdeContacto, contactadoHoy, contactadoAntes } = params;

  // Si dejé un mensaje un día anterior y no lo he reportado → reportar siempre.
  if (contactadoAntes) return 'reportar';
  // Si ya marqué hoy, no debe reaparecer hoy.
  if (contactadoHoy) return null;
  if (diasDesdeContacto === null) return null;
  if (diasDesdeContacto < CADENCIA_SEGUIMIENTO[0]) return null; // aún no llega al primer hito

  // ¿Hoy es exactamente un día-hito? (3, 7, 14, 30) o pasó del último (30+).
  const esHitoExacto = CADENCIA_SEGUIMIENTO.includes(diasDesdeContacto);
  if (esHitoExacto) return 'contactar';
  // Pasó un hito sin atenderse → queda como "atrasado" hasta que se marque.
  return 'atrasado';
}

// Colores por etapa para el kanban / chips
export const COLOR_ETAPA: Record<string, { bg: string; text: string; border: string }> = {
  'NUEVO LEAD':         { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200' },
  'CONTACTADO':         { bg: 'bg-indigo-50',  text: 'text-indigo-700', border: 'border-indigo-200' },
  'SEGUIMIENTO':        { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  'COTIZACION ENVIADA': { bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200' },
  'Negociacion':        { bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-200' },
  'GANADO':             { bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200' },
  'PERDIDO':            { bg: 'bg-gray-100',   text: 'text-gray-500',   border: 'border-gray-200' },
};

// Alias retro-compat (código viejo que aún importa COLOR_ESTADO)
export const COLOR_ESTADO = COLOR_ETAPA;

// Días desde el último contacto → urgencia visual
export function urgenciaDias(dias: number | null): 'ok' | 'medio' | 'alto' | 'critico' {
  if (dias === null) return 'ok';
  if (dias >= 14) return 'critico';
  if (dias >= 7)  return 'alto';
  if (dias >= 3)  return 'medio';
  return 'ok';
}

// ─── Lead ─────────────────────────────────────────────────────────────────────
export interface Lead {
  id: string;
  notion_url: string;
  proyecto: string;
  empresa: string;
  empresa_id: string | null;
  cliente: string;
  ruc: string;
  dni_representante: number | null;
  sitio_web: string;
  telefono: string;
  mail: string;
  estado_lead: EstadoLead;
  canal: string;
  origen: string;
  campana: string;
  campana_vinculada_id?: string | null;
  monto_pagado?: number | null;
  total?: number | null;
  fecha_contactado: string | null;
  fecha_ultimo_contacto: string | null;
  contactado_hoy: string | null;
  proximo_seguimiento: string | null;
  fecha_cobro?: string | null;
  fidelizacion?: string | null;
  fidelizacion_estado?: string;
  fidelizacion_nota?: string;
  notas_seguimiento: string;
  chats_vinculados?: string;
  motivo_perdida: string;
  persona_contactado: { id: string; name: string; avatar: string | null }[];
  atendido_por?: string;
  cotizaciones_url?: string | null;
  created_time: string;
  last_edited_time: string;
}

// ─── Acción de seguimiento diario ────────────────────────────────────────────
export type AccionSeguimiento = 'respondio' | 'no_respondio' | 'ganado' | 'perdido' | 'cotizacion_enviada' | 'mensaje_enviado';

export interface SeguimientoPayload {
  leadId: string;
  accion: AccionSeguimiento;
  nuevo_estado?: EstadoLead;
  motivo_perdida?: string;
  nota?: string;
}

'use client';
// lib/leadChat.ts — qué lead del CRM corresponde al chat abierto en Mensajes.
// 1) Chats enlazados a mano ("Chats vinculados" del lead: canal:identificador)
// 2) Mismo teléfono (últimos 9 dígitos) o mismo nombre (lib/chatLog)
import type { CanalMensajes, ChatLeido } from './desktop';
import type { Lead } from '@/types/crm';
import { claveChat, esElMismo } from './chatLog';
import { hoyLima, diasEntreFechasISO } from './utils';

export const chatsDe = (l: Pick<Lead, 'chats_vinculados'>) =>
  (l.chats_vinculados || '').split('\n').map(x => x.trim()).filter(Boolean);

export function leadDelChat(leads: Lead[], canal: CanalMensajes, chat: Pick<ChatLeido, 'nombre' | 'telefono'> | null): { lead: Lead; enlazado: boolean } | null {
  if (!chat) return null;
  const clave = claveChat(canal, chat);
  if (clave) {
    const l = leads.find(x => chatsDe(x).includes(clave));
    if (l) return { lead: l, enlazado: true };
  }
  // Preferir leads abiertos sobre ganados/perdidos si hay varios iguales
  const iguales = leads.filter(l => esElMismo(l, chat));
  const l = iguales.find(x => !['GANADO', 'PERDIDO'].includes(x.estado_lead)) || iguales[0];
  return l ? { lead: l, enlazado: false } : null;
}

export const ESTADOS_LEAD = ['NUEVO LEAD', 'CONTACTADO', 'SEGUIMIENTO', 'COTIZACION ENVIADA', 'Negociacion', 'GANADO', 'PERDIDO'] as const;
export const NOMBRE_ESTADO: Record<string, string> = {
  'NUEVO LEAD': 'Nuevo', CONTACTADO: 'Contactado', SEGUIMIENTO: 'Seguimiento', 'COTIZACION ENVIADA': 'Cotización enviada',
  Negociacion: 'Negociación', GANADO: 'Cliente', PERDIDO: 'Perdido',
};
export const COLOR_ESTADO: Record<string, string> = {
  'NUEVO LEAD': '#9ca3af', CONTACTADO: '#a78bfa', SEGUIMIENTO: '#f59e0b', 'COTIZACION ENVIADA': '#ec4899',
  Negociacion: '#3b82f6', GANADO: '#10b981', PERDIDO: '#ef4444',
};

/** Texto corto para la etiqueta junto al nombre del chat. */
export function textoEtiqueta(l: Lead | null): string {
  if (!l) return 'Sin lead · Registrar';
  const estado = NOMBRE_ESTADO[l.estado_lead] || l.estado_lead;
  if (['GANADO', 'PERDIDO'].includes(l.estado_lead) || !l.proximo_seguimiento) return estado;
  const d = diasEntreFechasISO(hoyLima(), l.proximo_seguimiento.slice(0, 10));
  const cuando = d < 0 ? `seguimiento atrasado ${-d} d` : d === 0 ? 'seguimiento hoy' : d === 1 ? 'seguimiento mañana' : `seguimiento en ${d} días`;
  return `${estado} · ${cuando}`;
}

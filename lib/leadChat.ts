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

const CERRADOS = ['GANADO', 'PERDIDO'];

export interface LeadEncontrado {
  lead: Lead;               // el que se muestra: el abierto si hay; si no, el más reciente
  enlazado: boolean;        // este chat está enlazado a mano a ese lead
  relacionados: Lead[];     // todos los proyectos de esa persona/cliente (historial)
}

export function leadDelChat(leads: Lead[], canal: CanalMensajes, chat: Pick<ChatLeido, 'nombre' | 'telefono'> | null): LeadEncontrado | null {
  if (!chat) return null;
  const clave = claveChat(canal, chat);
  const enlazados = clave ? leads.filter(x => chatsDe(x).includes(clave)) : [];
  const iguales = leads.filter(l => esElMismo(l, chat));
  const base = [...enlazados, ...iguales];
  if (!base.length) return null;
  // Mismo cliente (ficha) = mismos proyectos, aunque el teléfono no esté en todos
  const fichas = new Set(base.map(l => l.empresa_id).filter(Boolean));
  const relacionados = Array.from(new Map([...base, ...leads.filter(l => l.empresa_id && fichas.has(l.empresa_id))].map(l => [l.id, l])).values())
    .sort((a, b) => (b.fecha_contactado || b.created_time || '').localeCompare(a.fecha_contactado || a.created_time || ''));
  // Se muestra el proyecto ABIERTO (el que se está trabajando); si no hay, el más reciente
  const abierto = relacionados.find(l => !CERRADOS.includes(l.estado_lead));
  const lead = abierto || enlazados[0] || relacionados[0];
  return { lead, enlazado: enlazados.some(l => l.id === lead.id), relacionados };
}

export const esCerrado = (l: Lead | null) => !!l && CERRADOS.includes(l.estado_lead);

// Copia local de los leads: la etiqueta sale al instante con lo último conocido
// y se actualiza en cuanto llega la versión fresca del CRM.
const CLAVE_CACHE = 'idyos:leads';
export function leadsEnCache(): Lead[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_CACHE) || '[]'); } catch { return []; }
}
export function guardarLeadsEnCache(leads: Lead[]) {
  try {
    const ligeros = leads.map(l => ({
      id: l.id, proyecto: l.proyecto, empresa: l.empresa, empresa_id: l.empresa_id, cliente: l.cliente, telefono: l.telefono,
      estado_lead: l.estado_lead, proximo_seguimiento: l.proximo_seguimiento, fecha_contactado: l.fecha_contactado,
      created_time: l.created_time, chats_vinculados: l.chats_vinculados, total: l.total, notas_seguimiento: '',
    }));
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(ligeros));
  } catch { /* sin almacenamiento */ }
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
export function textoEtiqueta(e: LeadEncontrado | null): string {
  if (!e) return 'Sin lead · Registrar';
  const l = e.lead;
  const ganados = e.relacionados.filter(x => x.estado_lead === 'GANADO').length;
  if (esCerrado(l)) return ganados ? `Cliente · ${ganados} proyecto${ganados === 1 ? '' : 's'}` : NOMBRE_ESTADO[l.estado_lead];
  const estado = NOMBRE_ESTADO[l.estado_lead] || l.estado_lead;
  const recurrente = ganados ? ' · cliente' : '';
  if (!l.proximo_seguimiento) return estado + recurrente;
  const d = diasEntreFechasISO(hoyLima(), l.proximo_seguimiento.slice(0, 10));
  const cuando = d < 0 ? `atrasado ${-d} d` : d === 0 ? 'seguimiento hoy' : d === 1 ? 'seguimiento mañana' : `seguimiento en ${d} días`;
  return `${estado} · ${cuando}${recurrente}`;
}

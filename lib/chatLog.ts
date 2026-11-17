'use client';
// lib/chatLog.ts
// Memoria local (en esta PC) de lo que se hizo en cada chat desde IdyOS:
// plantillas pegadas, lead creado, seguimiento marcado… Sirve para ver en el
// panel "le escribiste hace 26 h" sin volver a leer la conversación.

import type { CanalMensajes, ChatLeido } from './desktop';

export interface EventoChat { t: number; tipo: 'plantilla' | 'lead' | 'seguimiento'; detalle: string }
const CLAVE = 'idyos:chats';

const soloDigitos = (s?: string) => (s || '').replace(/\D/g, '');
export const normNombre = (s?: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function claveChat(canal: CanalMensajes, chat: Pick<ChatLeido, 'nombre' | 'telefono'> | null): string | null {
  if (!chat) return null;
  const tel = soloDigitos(chat.telefono).slice(-9);
  const id = tel || normNombre(chat.nombre);
  return id ? `${canal}:${id}` : null;
}

function leer(): Record<string, EventoChat[]> {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { return {}; }
}

export function eventosChat(clave: string | null): EventoChat[] {
  return clave ? (leer()[clave] || []) : [];
}

export function registrarEvento(clave: string | null, ev: Omit<EventoChat, 't'>) {
  if (!clave) return;
  try {
    const todo = leer();
    todo[clave] = [{ ...ev, t: Date.now() }, ...(todo[clave] || [])].slice(0, 30);
    localStorage.setItem(CLAVE, JSON.stringify(todo));
    window.dispatchEvent(new Event('idyos:chats'));
  } catch { /* sin almacenamiento */ }
}

/** "hace 32 h", "hace 3 días", "hace 5 min". */
export function hace(t: number): string {
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** Mismo teléfono (últimos 9 dígitos) o mismo nombre. */
export function esElMismo(lead: { telefono?: string; cliente?: string; empresa?: string; proyecto?: string }, chat: Pick<ChatLeido, 'nombre' | 'telefono'>) {
  const t1 = soloDigitos(lead.telefono).slice(-9), t2 = soloDigitos(chat.telefono).slice(-9);
  if (t1 && t2) return t1 === t2;
  const n = normNombre(chat.nombre);
  if (!n || n.length < 3) return false;
  return [lead.cliente, lead.empresa].some(x => normNombre(x) === n) || normNombre(lead.proyecto).includes(n);
}

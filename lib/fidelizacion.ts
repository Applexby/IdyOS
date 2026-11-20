// lib/fidelizacion.ts — recordatorios para volver a escribir a clientes que ya cerraron.
import { hoyLima, diasEntreFechasISO } from './utils';

export const PLAZOS = [
  { meses: 1, txt: '1 mes' },
  { meses: 2, txt: '2 meses' },
  { meses: 3, txt: '3 meses' },
  { meses: 6, txt: '6 meses' },
  { meses: 12, txt: '1 año' },
] as const;

/** Fecha (YYYY-MM-DD) dentro de N meses desde `desde` (hoy por defecto). */
export function enMeses(meses: number, desde = hoyLima()): string {
  const [y, m, d] = desde.slice(0, 10).split('-').map(Number);
  const objetivo = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)).getUTCDate();
  objetivo.setUTCDate(Math.min(d, ultimo));
  return objetivo.toISOString().slice(0, 10);
}

/** Días que faltan (negativo = ya pasó). */
export const diasPara = (fecha: string) => diasEntreFechasISO(hoyLima(), fecha.slice(0, 10));

export function textoCuenta(fecha: string): string {
  const d = diasPara(fecha);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d < 0) return `Hace ${-d} día${d === -1 ? '' : 's'}`;
  if (d < 60) return `Faltan ${d} días`;
  const meses = Math.round(d / 30);
  return `Faltan ${d} días (~${meses} mes${meses === 1 ? '' : 'es'})`;
}

export async function guardarFidelizacion(pageId: string, campos: { fidelizacion?: string | null; fidelizacion_estado?: string | null; fidelizacion_nota?: string }) {
  const r = await fetch('/api/notion/pipeline', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId, fields: campos }),
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'No se pudo guardar'); }
}

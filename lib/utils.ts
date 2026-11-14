import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ───────────────────────────────────────────────────────────
//  CÁLCULO DE DÍAS POR CALENDARIO (no por bloques de 24h)
//  Cuenta la diferencia de DÍAS DE CALENDARIO entre dos fechas,
//  ignorando la hora. Así un lead del 5 de junio, visto el 9 de
//  junio, da 4 días (5→6→7→8→9) y no 3.
//
//  Notion entrega fechas como "2026-06-05" o "2026-06-05T15:00:00.000-05:00".
//  Estrategia a prueba de zona horaria: extraemos SIEMPRE el día de calendario
//  (YYYY-MM-DD) de cada fecha y lo convertimos a un número de día absoluto con
//  aritmética pura (sin objetos Date que dependan del huso). "Hoy" se toma en
//  hora LOCAL del dispositivo.
// ───────────────────────────────────────────────────────────

/** Extrae {y,m,d} de una fecha. Si es string "YYYY-MM-DD[...]" toma los primeros
 *  10 caracteres tal cual (sin interpretar huso). Si es Date, usa su fecha local. */
function partesFecha(fecha: string | Date): { y: number; m: number; d: number } | null {
  if (typeof fecha === 'string') {
    const s = fecha.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (s) return { y: +s[1], m: +s[2], d: +s[3] };
    const dt = new Date(fecha);
    if (isNaN(dt.getTime())) return null;
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }
  if (isNaN(fecha.getTime())) return null;
  return { y: fecha.getFullYear(), m: fecha.getMonth() + 1, d: fecha.getDate() };
}

/** Número de día absoluto (días desde una época fija) para un {y,m,d} de calendario.
 *  Usa Date.UTC solo como aritmética de calendario; al ser ambos operandos UTC,
 *  la resta es exacta y NO depende del huso del dispositivo. */
function diaAbsoluto(p: { y: number; m: number; d: number }): number {
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
}

/** Días de calendario transcurridos DESDE `fecha` hasta hoy (positivo si es pasado).
 *  Devuelve null si la fecha es inválida o vacía. */
export function diasDesde(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const pf = partesFecha(fecha);
  if (!pf) return null;
  const hoy = partesFecha(new Date());
  if (!hoy) return null;
  return diaAbsoluto(hoy) - diaAbsoluto(pf);
}

/** Días de calendario que FALTAN hasta `fecha` (positivo si es futuro,
 *  negativo si ya pasó, 0 si es hoy). Devuelve null si es inválida. */
export function diasHasta(fecha: string | null | undefined): number | null {
  const d = diasDesde(fecha);
  return d === null ? null : -d;
}

/** Días de calendario entre dos fechas dadas como string ISO ("YYYY-MM-DD" o con hora).
 *  Compara SOLO la parte de fecha (primeros 10 caracteres) en UTC, sin importar la hora
 *  ni la zona horaria del servidor. Apto para rutas API que corren en Vercel (UTC).
 *  Retorna (b - a) en días: positivo si `b` es posterior a `a`. */
export function diasEntreFechasISO(a: string, b: string): number {
  const ad = a.slice(0, 10);
  const bd = b.slice(0, 10);
  const ta = Date.parse(ad + 'T00:00:00Z');
  const tb = Date.parse(bd + 'T00:00:00Z');
  if (isNaN(ta) || isNaN(tb)) return NaN;
  return Math.round((tb - ta) / 86400000);
}

// ───────────────────────────────────────────────────────────
//  "HOY" EN HORA DE PERÚ
//  `new Date().toISOString()` da la fecha en UTC: en Lima (UTC-5), desde las
//  19:00 ya devuelve el día siguiente. Estas utilidades fijan la zona
//  America/Lima, así que dan el mismo resultado en el navegador y en el
//  servidor (Vercel corre en UTC).
// ───────────────────────────────────────────────────────────
export const ZONA_HORARIA = 'America/Lima';

/** Fecha de hoy en Perú como "YYYY-MM-DD". */
export function hoyLima(): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Fecha de calendario en Perú ("YYYY-MM-DD") de una fecha de Notion o un Date.
 *  Las fechas sin hora ("2026-07-01") se devuelven tal cual: interpretarlas con
 *  new Date() las movería al día anterior en Lima (medianoche UTC = 19:00 del día previo). */
export function fechaLima(fecha: string | Date | null | undefined): string | null {
  if (!fecha) return null;
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Mes ("YYYY-MM") en Perú de una fecha de Notion o un Date. */
export function mesLima(fecha: string | Date | null | undefined): string | null {
  return fechaLima(fecha)?.slice(0, 7) ?? null;
}

/** Fecha corta en formato peruano (dd/mm/aaaa) en hora de Lima. */
export function fechaCortaLima(fecha: Date = new Date()): string {
  return fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA_HORARIA });
}

/** Suma `dias` a una fecha "YYYY-MM-DD" (por defecto hoy en Perú). */
export function sumarDiasISO(dias: number, desde: string = hoyLima()): string {
  const base = Date.parse(desde.slice(0, 10) + 'T00:00:00Z');
  return new Date(base + dias * 86400000).toISOString().slice(0, 10);
}

/** Nombre corto del usuario (el que se usa en los selects de Notion) a partir de su correo. */
export function nombreDesdeEmail(email?: string | null): string {
  if (!email) return '';
  const e = email.toLowerCase();
  if (e.includes('isai')) return 'Isai';
  if (e.includes('rebeca')) return 'Rebeca';
  if (e.includes('administracion') || e.includes('administración')) return 'Administración';
  return '';
}

export function generateCotizacionNumber(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${year}${month}-${rand}`;
}

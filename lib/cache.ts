// lib/cache.ts
// Caché de lecturas de Notion con invalidación INMEDIATA al escribir.
//
// Usa la caché de datos de Next.js (compartida entre todas las instancias en
// Vercel). Cada lectura se etiqueta con la(s) BD(s) de Notion de la que sale;
// cualquier escritura llama a invalidar() con esas etiquetas y la próxima
// lectura vuelve a ir a Notion. Así los cambios se ven al momento, sin esperar
// a que caduque la caché. El TTL es solo una red de seguridad para cambios
// hechos directamente en Notion (fuera del sistema).
//
// Solo para rutas de servidor (app/api).

import { unstable_cache, revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';

export type EtiquetaBD =
  | 'clientes' | 'proyectos' | 'servicios' | 'equipos' | 'campanas'
  | 'notas' | 'caja' | 'metas' | 'plantillas';

const tag = (e: EtiquetaBD) => `notion:${e}`;

/** TTL de seguridad (segundos) para cambios hechos fuera del sistema, en Notion.
 *  Ojo: las búsquedas de Notion tardan ~1-2 s en reflejar una escritura; por eso
 *  las pantallas muestran primero el dato que devolvió el servidor (optimista) y
 *  recargan en segundo plano unos segundos después (recargarTrasGuardar). */
const TTL_SEGUNDOS = 30;

/**
 * Ejecuta `fn` con caché. `clave` distingue variantes (p. ej. filtros).
 * Si `fn` lanza un error, no se guarda nada en caché.
 */
export function conCache<T>(
  etiquetas: EtiquetaBD[],
  clave: string,
  fn: () => Promise<T>,
  ttl: number = TTL_SEGUNDOS,
): Promise<T> {
  // Quien acaba de guardar algo lee siempre de Notion durante unos segundos
  // (ver COOKIE_FRESCO): así nunca ve una copia anterior a su propio cambio.
  if (leyendoTrasEscribir()) invalidar(...etiquetas);
  return unstable_cache(fn, ['notion', ...etiquetas, clave], {
    tags: etiquetas.map(tag),
    revalidate: ttl,
  })();
}

/** Invalida las lecturas cacheadas de esas BDs (llamar tras cada escritura). */
export function invalidar(...etiquetas: EtiquetaBD[]) {
  for (const e of etiquetas) {
    try { revalidateTag(tag(e)); } catch { /* fuera de contexto de request: no hay caché que invalidar */ }
  }
}

/**
 * Envuelve un handler de escritura (POST/PATCH/DELETE): si responde OK,
 * invalida las etiquetas indicadas. Así ninguna escritura se olvida de
 * refrescar la caché.
 *   async function PATCH_(req: NextRequest) { … }
 *   export const PATCH = trasEscribir(['proyectos'], PATCH_);
 */
export function trasEscribir<A extends any[]>(
  etiquetas: EtiquetaBD[],
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const res = await handler(...args);
    if (res.ok) {
      invalidar(...etiquetas);
      marcarLecturaFresca(res);
    }
    return res;
  };
}

// ── Lectura fresca tras escribir ────────────────────────────────────────────
// Las búsquedas de Notion tardan ~1-2 s en reflejar una escritura. Si otra
// persona carga la página en ese intervalo, la caché podría guardar el dato
// anterior. Para que QUIEN GUARDA vea siempre su cambio, la respuesta de la
// escritura deja una cookie de pocos segundos; mientras exista, sus lecturas
// saltan la caché (y la vuelven a llenar con el dato bueno).
const COOKIE_FRESCO = 'os_lectura_fresca';
const SEGUNDOS_FRESCO = 6;

function marcarLecturaFresca(res: Response) {
  try {
    const hasta = Date.now() + SEGUNDOS_FRESCO * 1000;
    res.headers.append('Set-Cookie', `${COOKIE_FRESCO}=${hasta}; Path=/; Max-Age=${SEGUNDOS_FRESCO}; SameSite=Lax; HttpOnly`);
  } catch { /* cabeceras inmutables: sin marca, queda la invalidación normal */ }
}

function leyendoTrasEscribir(): boolean {
  try {
    const v = cookies().get(COOKIE_FRESCO)?.value;
    return !!v && Number(v) > Date.now();
  } catch {
    return false; // fuera de una petición
  }
}

/**
 * Si la petición trae ?fresh=1, invalida esas etiquetas antes de leer: se usa
 * en la recarga en segundo plano que hacen las pantallas tras guardar, para
 * no quedarse con una copia que alguien cacheó mientras Notion indexaba.
 */
export function refrescarSiSePide(url: string | URL, ...etiquetas: EtiquetaBD[]) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.searchParams.get('fresh') === '1') invalidar(...etiquetas);
}

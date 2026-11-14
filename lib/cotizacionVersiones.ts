// lib/cotizacionVersiones.ts  (solo servidor)
// Versiones de cotización de un proyecto.
//
// La columna "COTIZACIONES" del proyecto guarda UNA url: la cotización
// PRINCIPAL (la que vale para el proyecto). Antes, al generar otra, la anterior
// se perdía. Ahora cada versión (generada en el OS o puesta a mano, p. ej. una
// propuesta en Drive) se anota como un párrafo en el CUERPO de la página del
// proyecto en Notion, sin cambiar la estructura de la base de datos:
//
//   📄 Cotización COT-261020-01 — S/ 1180.00 (gravado 1000.00 + IGV 180.00) — 20/10/2026 — Isai Manzanares
//   📄 Propuesta manual — 20/10/2026 — Rebeca Acosta
//
// El número (o "Propuesta manual") lleva el enlace. Elegir una versión copia su
// url a "COTIZACIONES" y, si tiene montos, también Total, Gravado e IGV.

const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

export interface VersionCotizacion {
  id: string;              // id del bloque en Notion ('' si no está anotada)
  numero: string;          // "261020-01" o '' (propuesta manual)
  url: string;
  total: number | null;
  gravado: number | null;
  igv: number | null;
  fecha: string;           // YYYY-MM-DD
  usuario: string;
  manual: boolean;
  principal: boolean;      // es la que está en "COTIZACIONES"
}

const RE_LINEA = /^📄 (?:Cotización COT-(\S+)|Propuesta manual)(?: — S\/ ([\d.]+) \(gravado ([\d.]+) \+ IGV ([\d.]+)\))? — (\d{2})\/(\d{2})\/(\d{4})(?: — (.*))?$/;

const mismaUrl = (a?: string | null, b?: string | null) => !!a && !!b && a.trim() === b.trim();

/** Texto del párrafo para una versión. */
function textoVersion(v: Omit<VersionCotizacion, 'id' | 'principal'>) {
  const [y, m, d] = v.fecha.split('-');
  const cabeza = v.manual ? 'Propuesta manual' : `Cotización COT-${v.numero}`;
  const montos = v.total !== null && v.gravado !== null && v.igv !== null
    ? ` — S/ ${v.total.toFixed(2)} (gravado ${v.gravado.toFixed(2)} + IGV ${v.igv.toFixed(2)})` : '';
  return { cabeza, resto: `${montos} — ${d}/${m}/${y}${v.usuario ? ` — ${v.usuario}` : ''}` };
}

/** Lee las versiones anotadas en el cuerpo de la página. */
async function leerBloques(pageId: string): Promise<VersionCotizacion[]> {
  const versiones: VersionCotizacion[] = [];
  let cursor: string | undefined;
  do {
    const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`, { headers: H() });
    if (!r.ok) break;
    const d = await r.json();
    for (const b of d.results || []) {
      if (b.type !== 'paragraph') continue;
      const rt: any[] = b.paragraph?.rich_text || [];
      const texto = rt.map(t => t.plain_text).join('');
      const m = texto.match(RE_LINEA);
      const url = rt.find(t => t.href)?.href;
      if (!m || !url) continue;
      versiones.push({
        id: b.id, numero: m[1] || '', url,
        total: m[2] ? Number(m[2]) : null, gravado: m[3] ? Number(m[3]) : null, igv: m[4] ? Number(m[4]) : null,
        fecha: `${m[7]}-${m[6]}-${m[5]}`, usuario: (m[8] || '').trim(), manual: !m[1], principal: false,
      });
    }
    cursor = d.has_more ? d.next_cursor : undefined;
  } while (cursor);
  return versiones;
}

/** Anota una versión al final de la página (si esa url no estaba ya anotada). */
export async function anotarVersion(pageId: string, v: Omit<VersionCotizacion, 'id' | 'principal'>, existentes?: VersionCotizacion[]) {
  const lista = existentes || await leerBloques(pageId);
  if (lista.some(x => mismaUrl(x.url, v.url))) return;
  const { cabeza, resto } = textoVersion(v);
  await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH', headers: H(),
    body: JSON.stringify({
      children: [{
        object: 'block', type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: '📄 ' } },
            { type: 'text', text: { content: cabeza, link: { url: v.url } } },
            { type: 'text', text: { content: resto } },
          ],
        },
      }],
    }),
  }).catch(() => null);
}

/** Datos de la cotización principal actual (columna COTIZACIONES + montos). */
function principalDesde(props: any) {
  const url: string | null = props?.['COTIZACIONES']?.url || null;
  const num = (k: string) => (typeof props?.[k]?.number === 'number' ? props[k].number : null);
  const m = url?.match(/COT-(\d{6}-\d{2,})/);
  return { url, numero: m?.[1] || '', total: num('Total'), gravado: num('Gravado'), igv: num('IGV') };
}

/**
 * Antes de reemplazar la principal: si la url actual aún no está anotada como
 * versión (proyectos de antes de esta función), se anota para no perderla.
 */
export async function guardarPrincipalActual(pageId: string, props: any) {
  const p = principalDesde(props);
  if (!p.url) return;
  const lista = await leerBloques(pageId);
  if (lista.some(x => mismaUrl(x.url, p.url))) return;
  const fecha = (props?.['Fecha de contactado']?.date?.start || new Date().toISOString()).slice(0, 10);
  await anotarVersion(pageId, {
    numero: p.numero, url: p.url, manual: !p.numero, usuario: '',
    total: p.numero ? p.total : null, gravado: p.numero ? p.gravado : null, igv: p.numero ? p.igv : null, fecha,
  }, lista);
}

/** Todas las versiones del proyecto, marcando la principal (más reciente primero). */
export async function listarVersiones(pageId: string): Promise<{ versiones: VersionCotizacion[]; principal: string | null }> {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: H() });
  if (!r.ok) throw new Error('Proyecto no encontrado');
  const props = (await r.json()).properties || {};
  const p = principalDesde(props);
  const versiones = await leerBloques(pageId);
  // La principal puede no estar anotada (proyectos antiguos): se muestra igual
  if (p.url && !versiones.some(v => mismaUrl(v.url, p.url))) {
    versiones.push({
      id: '', numero: p.numero, url: p.url, manual: !p.numero, usuario: '',
      total: p.numero ? p.total : null, gravado: p.numero ? p.gravado : null, igv: p.numero ? p.igv : null,
      fecha: (props?.['Fecha de contactado']?.date?.start || '').slice(0, 10), principal: true,
    });
  }
  for (const v of versiones) v.principal = mismaUrl(v.url, p.url);
  versiones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.numero.localeCompare(a.numero));
  return { versiones, principal: p.url };
}

/** Deja una versión como principal: url en COTIZACIONES y, si tiene, sus montos. */
export async function elegirVersion(pageId: string, url: string): Promise<{ ok: boolean; error?: string; version?: VersionCotizacion }> {
  const { versiones } = await listarVersiones(pageId);
  const v = versiones.find(x => mismaUrl(x.url, url));
  if (!v) return { ok: false, error: 'Esa versión ya no está en el proyecto' };
  const properties: any = { 'COTIZACIONES': { url: v.url } };
  if (v.total !== null && v.gravado !== null && v.igv !== null) {
    properties['Total'] = { number: v.total };
    properties['Gravado'] = { number: v.gravado };
    properties['IGV'] = { number: v.igv };
  }
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ properties }) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); return { ok: false, error: e.message || 'Error al guardar' }; }
  return { ok: true, version: { ...v, principal: true } };
}

/** Quita una versión de la lista (no la principal). */
export async function quitarVersion(pageId: string, blockId: string): Promise<{ ok: boolean; error?: string }> {
  const { versiones } = await listarVersiones(pageId);
  const v = versiones.find(x => x.id === blockId);
  if (!v) return { ok: false, error: 'Esa versión ya no está' };
  if (v.principal) return { ok: false, error: 'No se puede quitar la cotización principal: elige otra primero' };
  const r = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, { method: 'DELETE', headers: H() });
  return r.ok ? { ok: true } : { ok: false, error: 'No se pudo quitar' };
}

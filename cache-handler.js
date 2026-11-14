// cache-handler.js
// Caché de datos de Next.js para IdyOS (escritorio).
//
// En la web (Vercel) la caché de lecturas de Notion (lib/cache.ts →
// unstable_cache) vive en la infraestructura de Vercel. En el .exe la
// guardamos en la carpeta del usuario (IDYOS_CACHE_DIR, la pone Electron en
// %APPDATA%/IdyOS/cache), así:
//   • sobrevive a cerrar el programa y a las actualizaciones,
//   • no depende de que la carpeta de instalación sea escribible,
//   • se puede vaciar desde Ajustes del programa.
//
// Solo las entradas de datos (kind FETCH, que es lo que produce unstable_cache)
// se guardan en esa carpeta, con una copia en memoria para lecturas
// instantáneas. Todo lo demás (páginas, rutas) lo sigue manejando la caché por
// defecto de Next. Sin IDYOS_CACHE_DIR (web / desarrollo) se comporta igual que
// la caché de Next.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FileSystemCache =
  require('next/dist/server/lib/incremental-cache/file-system-cache').default;

const DIR = process.env.IDYOS_CACHE_DIR || '';
const MAX_MEMORIA = 500; // entradas en memoria (las más recientes)

const memoria = new Map(); // clave → { value, lastModified, tags }
let etiquetas = null; // { [tag]: revalidatedAt }

function archivoEtiquetas() { return path.join(DIR, 'tags.json'); }
function archivoDe(key) {
  const h = crypto.createHash('sha1').update(String(key)).digest('hex');
  return path.join(DIR, 'datos', h.slice(0, 2), `${h}.json`);
}

function cargarEtiquetas() {
  if (etiquetas) return etiquetas;
  try { etiquetas = JSON.parse(fs.readFileSync(archivoEtiquetas(), 'utf8')) || {}; }
  catch { etiquetas = {}; }
  return etiquetas;
}

async function escribir(file, contenido) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(tmp, contenido);
  await fs.promises.rename(tmp, file);
}

function recordar(key, entrada) {
  memoria.delete(key);
  memoria.set(key, entrada);
  if (memoria.size > MAX_MEMORIA) memoria.delete(memoria.keys().next().value);
}

module.exports = class IdyosCacheHandler extends FileSystemCache {
  constructor(ctx) {
    super(ctx);
    this.revalidadasEnPeticion = ctx.revalidatedTags || [];
  }

  async get(...args) {
    const [key, ctx = {}] = args;
    const esDato = ctx.kindHint === 'fetch' || ctx.fetchCache;
    if (!DIR || !esDato) return super.get(...args);

    let entrada = memoria.get(key);
    if (!entrada) {
      try {
        entrada = JSON.parse(await fs.promises.readFile(archivoDe(key), 'utf8'));
        if (entrada) recordar(key, entrada);
      } catch { return null; }
    }
    if (!entrada || entrada.value?.kind !== 'FETCH') return null;

    // Si alguna etiqueta se invalidó después de guardar este dato → descartarlo
    const tags = cargarEtiquetas();
    const todas = [...(ctx.tags || []), ...(ctx.softTags || []), ...(entrada.tags || [])];
    const invalidado = todas.some(t =>
      this.revalidadasEnPeticion.includes(t) ||
      (tags[t] && tags[t] >= (entrada.lastModified || Date.now())));
    if (invalidado) return null;

    return { value: entrada.value, lastModified: entrada.lastModified };
  }

  async set(...args) {
    const [key, data, ctx = {}] = args;
    if (!DIR || data?.kind !== 'FETCH') return super.set(...args);

    const entrada = { value: data, lastModified: Date.now(), tags: ctx.tags || data.tags || [] };
    recordar(key, entrada);
    try { await escribir(archivoDe(key), JSON.stringify(entrada)); }
    catch { /* sin disco: queda la copia en memoria */ }
  }

  async revalidateTag(...args) {
    if (!DIR) return super.revalidateTag(...args);
    const lista = [args[0]].flat().filter(Boolean);
    const tags = cargarEtiquetas();
    const ahora = Date.now();
    for (const t of lista) tags[t] = ahora;
    try { await escribir(archivoEtiquetas(), JSON.stringify(tags)); } catch { /* memoria basta */ }
    try { await super.revalidateTag(...args); } catch { /* caché por defecto no escribible */ }
  }
};

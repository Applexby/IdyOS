// lib/adjuntos.ts
// Adjuntos de una plantilla (Cloudinary). En Notion se guardan en el texto
// "Adjuntos", uno por línea: "Brochure campaña.pdf | https://res.cloudinary…"

export interface Adjunto { nombre: string; url: string }

export function parseAdjuntos(texto: string | null | undefined): Adjunto[] {
  return (texto || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.lastIndexOf('|');
    const url = (i >= 0 ? l.slice(i + 1) : l).trim();
    const nombre = (i >= 0 ? l.slice(0, i) : decodeURIComponent(url.split('/').pop() || 'archivo')).trim();
    return { nombre, url };
  }).filter(a => /^https:\/\//.test(a.url));
}

export function textoAdjuntos(lista: Adjunto[]): string {
  return lista.map(a => `${a.nombre.replace(/[|\n]/g, ' ').trim()} | ${a.url}`).join('\n');
}

export const esImagen = (a: Adjunto) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url) || /\.(png|jpe?g|webp|gif)$/i.test(a.nombre);

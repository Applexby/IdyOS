'use client';
// lib/subidasDrive.ts
// Subidas a Google Drive que siguen aunque cambies de pantalla.
// Vive fuera de los componentes (módulo único del programa): la subida y el
// guardado del enlace en Notion terminan aunque la pantalla que la empezó ya no
// esté. La ventanita flotante (components/shell/SubidasDrive) muestra el avance.
// Mientras un documento se sube, no se puede empezar otro para el mismo campo
// (evita archivos duplicados en Drive).

import { puente, type TipoDocDrive } from '@/lib/desktop';

export interface Subida {
  id: string;
  pageId: string;
  campo: TipoDocDrive;
  etiqueta: string;     // "Contrato" / "Factura"
  nombre: string;       // nombre del archivo
  proyecto?: string;
  estado: 'subiendo' | 'guardando' | 'listo' | 'error';
  error?: string;
  url?: string;
  carpeta?: string;
  inicio: number;
}

let subidas: Subida[] = [];
const oyentes = new Set<(s: Subida[]) => void>();
const emitir = () => { const copia = [...subidas]; oyentes.forEach(f => f(copia)); };

export function escucharSubidas(fn: (s: Subida[]) => void): () => void {
  oyentes.add(fn); fn([...subidas]);
  return () => { oyentes.delete(fn); };
}

export const subidaEnCurso = (pageId: string, campo: string) =>
  subidas.find(s => s.pageId === pageId && s.campo === campo && (s.estado === 'subiendo' || s.estado === 'guardando'));

function actualizar(id: string, cambios: Partial<Subida>) {
  subidas = subidas.map(s => s.id === id ? { ...s, ...cambios } : s);
  emitir();
}

export function quitarSubida(id: string) { subidas = subidas.filter(s => s.id !== id); emitir(); }

/** Aviso global cuando un enlace quedó guardado (para refrescar las pantallas abiertas). */
export const EVENTO_ENLACE = 'idyos:enlace-guardado';

export async function subirADrive(d: { pageId: string; campo: TipoDocDrive; etiqueta: string; archivo: File; proyecto?: string }): Promise<{ ok: boolean; error?: string }> {
  const api = puente()?.drive;
  if (!api) return { ok: false, error: 'Solo disponible en el programa de escritorio' };
  if (subidaEnCurso(d.pageId, d.campo)) return { ok: false, error: `Ya se está subiendo un archivo de ${d.etiqueta.toLowerCase()} para este proyecto` };

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  subidas = [...subidas.filter(s => s.estado === 'subiendo' || s.estado === 'guardando' || Date.now() - s.inicio < 60_000),
    { id, pageId: d.pageId, campo: d.campo, etiqueta: d.etiqueta, nombre: d.archivo.name, proyecto: d.proyecto, estado: 'subiendo', inicio: Date.now() }];
  emitir();

  try {
    const r = await api.subir({ tipo: d.campo, nombre: d.archivo.name, mime: d.archivo.type || 'application/pdf', datos: await d.archivo.arrayBuffer() });
    if (!r.ok) { actualizar(id, { estado: 'error', error: r.error }); return { ok: false, error: r.error }; }
    actualizar(id, { estado: 'guardando', url: r.url, carpeta: r.carpeta });
    // Guardar el enlace en el proyecto de Notion (mismo camino que "Añadir enlace")
    const res = await fetch('/api/notion/contabilidad-proyectos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: d.pageId, enlaces: { [d.campo]: r.url } }),
    }).catch(() => null);
    if (!res?.ok) {
      const e = await res?.json().catch(() => ({}));
      const error = `Se subió a Drive, pero no se pudo guardar el enlace en Notion: ${e?.error || 'sin conexión'}`;
      actualizar(id, { estado: 'error', error });
      return { ok: false, error };
    }
    actualizar(id, { estado: 'listo' });
    window.dispatchEvent(new CustomEvent(EVENTO_ENLACE, { detail: { pageId: d.pageId, campo: d.campo, url: r.url } }));
    setTimeout(() => { if (subidas.find(s => s.id === id)?.estado === 'listo') quitarSubida(id); }, 8000);
    return { ok: true };
  } catch (e: any) {
    actualizar(id, { estado: 'error', error: e?.message || 'No se pudo subir' });
    return { ok: false, error: e?.message };
  }
}

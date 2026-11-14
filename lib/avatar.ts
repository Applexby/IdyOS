'use client';
// Foto de perfil del usuario en sesión. Se recuerda en el navegador para
// mostrarse al instante y se refresca desde /api/perfil/foto.
import { useEffect, useState } from 'react';

const CLAVE = 'idyos:avatar';
const EVENTO = 'idyos:avatar';

function leer(): string | null {
  try { return localStorage.getItem(CLAVE) || null; } catch { return null; }
}

export function guardarAvatarLocal(url: string | null) {
  try { url ? localStorage.setItem(CLAVE, url) : localStorage.removeItem(CLAVE); } catch { /* noop */ }
  window.dispatchEvent(new Event(EVENTO));
}

export function useAvatar() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(leer());
    const sync = () => setUrl(leer());
    window.addEventListener(EVENTO, sync);
    fetch('/api/perfil/foto').then(r => r.ok ? r.json() : null).then(d => {
      if (d && 'url' in d && d.url !== leer()) guardarAvatarLocal(d.url);
    }).catch(() => {});
    return () => window.removeEventListener(EVENTO, sync);
  }, []);
  return url;
}

export function iniciales(nombre?: string | null) {
  return (nombre || 'U').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

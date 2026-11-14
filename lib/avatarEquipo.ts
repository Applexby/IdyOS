'use client';
// Fotos de perfil de los miembros del equipo (por nombre o correo), para
// mostrarlas en el CRM, el equipo, etc. Se piden una sola vez por persona.
import { useEffect, useState } from 'react';
import { EQUIPO, mismaPersona } from '@/lib/equipo';

const cache = new Map<string, Promise<string | null>>();

export function emailDe(nombreOEmail?: string | null): string | null {
  if (!nombreOEmail) return null;
  if (nombreOEmail.includes('@')) return nombreOEmail.toLowerCase();
  return EQUIPO.find(m => mismaPersona(m.nombre, nombreOEmail))?.email || null;
}

function pedir(email: string) {
  if (!cache.has(email)) {
    cache.set(email, fetch(`/api/perfil/foto?email=${encodeURIComponent(email)}`)
      .then(r => (r.ok ? r.json() : null)).then(d => d?.url || null).catch(() => null));
  }
  return cache.get(email)!;
}

/** URL de la foto de esa persona del equipo (o null si no tiene). */
export function useAvatarDe(nombreOEmail?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const email = emailDe(nombreOEmail);
    if (!email) { setUrl(null); return; }
    let vivo = true;
    pedir(email).then(u => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [nombreOEmail]);
  return url;
}

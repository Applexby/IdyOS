'use client';
import { useState } from 'react';
import { iniciales } from '@/lib/avatar';

/** Foto de perfil redonda; si no hay foto (o falla), iniciales sobre el acento. */
export default function Avatar({ url, nombre, size = 36, className = '' }: {
  url?: string | null; nombre?: string | null; size?: number; className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const style = { width: size, height: size };
  if (url && error !== url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nombre || 'Perfil'} style={style} onError={() => setError(url)}
      className={`rounded-full object-cover flex-shrink-0 ring-2 ring-white dark:ring-[#151515] ${className}`} />;
  }
  return (
    <div style={{ ...style, fontSize: Math.max(10, size * 0.36) }}
      className={`rounded-full flex-shrink-0 grid place-items-center font-bold bg-[var(--acento)] text-[var(--acento-texto)] ${className}`}>
      {iniciales(nombre)}
    </div>
  );
}

'use client';
// Barra de aviso superior: aparece cuando hay una versión nueva de IdyOS
// (descargando / lista para instalar). Se puede ocultar hasta la próxima versión.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useEscritorio } from '@/lib/desktop';

const CLAVE = 'idyos:aviso-oculto';

export default function AvisoActualizacion() {
  const { actualizacion: e, api } = useEscritorio();
  const [oculta, setOculta] = useState<string | null>(null);

  useEffect(() => {
    try { setOculta(localStorage.getItem(CLAVE)); } catch { /* sin almacenamiento */ }
  }, []);

  if (!api || !e?.nueva) return null;
  if (!['disponible', 'descargando', 'descargada'].includes(e.fase)) return null;
  const clave = `${e.nueva.version}:${e.fase === 'descargada' ? 'lista' : 'nueva'}`;
  if (oculta === clave) return null;

  const ocultar = () => {
    setOculta(clave);
    try { localStorage.setItem(CLAVE, clave); } catch { /* sin almacenamiento */ }
  };

  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-2 bg-[#ffc500] text-gray-900 text-[13px] shadow-sm">
      {e.fase === 'descargada'
        ? <RefreshCw size={14} className="flex-shrink-0" />
        : <Download size={14} className="flex-shrink-0" />}
      <p className="flex-1 min-w-0 truncate">
        {e.fase === 'descargada' && <>La versión <b>{e.nueva.version}</b> de IdyOS está lista. Se instalará al reiniciar.</>}
        {e.fase === 'descargando' && <>Descargando IdyOS <b>{e.nueva.version}</b>… {e.progreso}%</>}
        {e.fase === 'disponible' && <>Hay una versión nueva de IdyOS: <b>{e.nueva.version}</b>.</>}
      </p>
      {e.fase === 'descargada' && (
        <button onClick={() => api.instalarActualizacion()}
          className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black">
          Reiniciar y actualizar
        </button>
      )}
      {e.fase === 'disponible' && (
        <button onClick={() => api.descargarActualizacion()}
          className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black">
          Descargar
        </button>
      )}
      <Link href="/programa" className="text-xs font-semibold underline underline-offset-2">Detalles</Link>
      <button onClick={ocultar} aria-label="Ocultar aviso" className="p-1 rounded hover:bg-black/10">
        <X size={14} />
      </button>
    </div>
  );
}

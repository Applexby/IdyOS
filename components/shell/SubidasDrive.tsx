'use client';
// Ventanita flotante (abajo a la derecha) con las subidas a Google Drive en
// curso. Se ve en cualquier pantalla: la subida sigue aunque cambies de sección.

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, X, AlertCircle } from 'lucide-react';
import { escucharSubidas, quitarSubida, type Subida } from '@/lib/subidasDrive';
import LogoDrive from '@/components/ui/LogoDrive';

export default function SubidasDrive() {
  const [lista, setLista] = useState<Subida[]>([]);
  useEffect(() => escucharSubidas(setLista), []);
  if (!lista.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[80] w-80 bg-white rounded-2xl border border-gray-100 shadow-[0_12px_40px_rgba(16,24,40,0.18)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
        <LogoDrive size={15} />
        <span className="flex-1 text-[12.5px] font-semibold text-gray-800">Google Drive</span>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
        {lista.map(s => (
          <div key={s.id} className="flex items-start gap-2.5 px-4 py-2.5">
            <span className="mt-0.5">
              {s.estado === 'listo' ? <CheckCircle2 size={15} className="text-emerald-500" />
                : s.estado === 'error' ? <AlertCircle size={15} className="text-rose-500" />
                : <Loader2 size={15} className="animate-spin text-[var(--acento)]" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-medium text-gray-800 truncate">{s.etiqueta} · {s.nombre}</p>
              <p className={`text-[11.5px] ${s.estado === 'error' ? 'text-rose-600' : 'text-gray-400'} line-clamp-2`}>
                {s.estado === 'subiendo' ? `Subiendo${s.proyecto ? ` · ${s.proyecto}` : ''}…`
                  : s.estado === 'guardando' ? 'Guardando el enlace…'
                  : s.estado === 'listo' ? `Listo · ${s.carpeta || 'Drive'}`
                  : s.error}
              </p>
            </div>
            {(s.estado === 'listo' || s.estado === 'error') && (
              <button onClick={() => quitarSubida(s.id)} aria-label="Cerrar" className="text-gray-300 hover:text-gray-600"><X size={13} /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';
// Al cerrar un cliente (GANADO): ¿cuándo recordarnos volver a escribirle?
// Rápido a propósito: un clic. La fecha exacta se ajusta luego en CRM → Fidelización.
import { useState } from 'react';
import { HeartHandshake, X, Loader2 } from 'lucide-react';
import { PLAZOS, enMeses, guardarFidelizacion } from '@/lib/fidelizacion';

export default function ModalCierre({ lead, onClose }: { lead: { id: string; proyecto?: string; cliente?: string; empresa?: string }; onClose: () => void }) {
  const [guardando, setGuardando] = useState<string>('');
  const [error, setError] = useState('');
  const [nota, setNota] = useState('');

  async function elegir(clave: string, campos: Parameters<typeof guardarFidelizacion>[1]) {
    setGuardando(clave); setError('');
    try { await guardarFidelizacion(lead.id, { ...campos, ...(nota.trim() ? { fidelizacion_nota: nota.trim() } : {}) }); onClose(); }
    catch (e: any) { setError(e.message); }
    finally { setGuardando(''); }
  }

  return (
    <div data-superpuesto className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 h-14 border-b border-gray-100">
          <HeartHandshake size={17} className="text-[var(--acento)]" />
          <h3 className="flex-1 text-[15px] font-semibold text-gray-900">¡Cliente cerrado! 🎉</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[13px] text-gray-600"><b>{lead.cliente || lead.empresa || lead.proyecto}</b> — ¿en cuánto tiempo te recuerdo volver a escribirle para que nos contrate de nuevo?</p>
          <div className="grid grid-cols-3 gap-2">
            {PLAZOS.map(p => (
              <button key={p.meses} disabled={!!guardando} onClick={() => elegir(String(p.meses), { fidelizacion: enMeses(p.meses), fidelizacion_estado: 'Programada' })}
                className="h-11 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-800 hover:border-[var(--acento)] hover:bg-[var(--acento-suave)] flex items-center justify-center gap-1.5 disabled:opacity-50">
                {guardando === String(p.meses) && <Loader2 size={13} className="animate-spin" />} En {p.txt}
              </button>
            ))}
            <button disabled={!!guardando} onClick={() => elegir('no', { fidelizacion: null, fidelizacion_estado: 'No volver a escribir' })}
              className="h-11 rounded-xl border border-gray-200 text-[12.5px] text-gray-500 hover:border-gray-300 disabled:opacity-50">No volver a escribir</button>
          </div>
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota opcional (ej: aniversario en marzo, cobertura de fin de año)"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--acento)]" />
          {error && <p className="text-[12px] text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <button onClick={onClose} className="w-full text-[12px] text-gray-400 hover:text-gray-600 py-1">Decidir después (en CRM → Fidelización)</button>
        </div>
      </div>
    </div>
  );
}

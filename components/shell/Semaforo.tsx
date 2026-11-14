'use client';
// Botones de ventana tipo Mac (cerrar / minimizar / maximizar) a la izquierda.
// Solo en el programa de escritorio; en el navegador no se muestran.
import { useEffect, useState } from 'react';
import { puente } from '@/lib/desktop';

export default function Semaforo({ className = '', sinMaximizar = false }: { className?: string; sinMaximizar?: boolean }) {
  const [api, setApi] = useState<ReturnType<typeof puente>>(null);
  const [max, setMax] = useState(false);
  useEffect(() => {
    const p = puente();
    setApi(p);
    if (!p?.alCambiarVentana) return;
    return p.alCambiarVentana(e => setMax(e.maximizada || e.pantallaCompleta));
  }, []);
  if (!api?.ventana) return null;

  const b = 'w-3 h-3 rounded-full grid place-items-center border border-black/10 text-black/60 transition-[filter] active:brightness-90';
  return (
    <div className={`group flex items-center gap-2 ${className}`} data-no-arrastre>
      <button aria-label="Cerrar" title="Cerrar" onClick={() => api.ventana!('cerrar')} className={`${b} bg-[#ff5f57]`}>
        <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 group-hover:opacity-100"><path d="M1 1l4 4M5 1L1 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
      </button>
      <button aria-label="Minimizar" title="Minimizar" onClick={() => api.ventana!('minimizar')} className={`${b} bg-[#febc2e]`}>
        <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 group-hover:opacity-100"><path d="M1 3h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
      </button>
      <button aria-label={max ? 'Restaurar' : 'Maximizar'} title={max ? 'Restaurar' : 'Maximizar'} disabled={sinMaximizar}
        onClick={() => api.ventana!('maximizar')} className={`${b} ${sinMaximizar ? 'bg-white/25' : 'bg-[#28c840]'}`}>
        <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 group-hover:opacity-100">
          {max ? <path d="M1.2 3h3.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /> : <path d="M3 1v4M1 3h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
        </svg>
      </button>
    </div>
  );
}

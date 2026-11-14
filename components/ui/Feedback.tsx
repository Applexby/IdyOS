'use client';

// Avisos (toasts) y confirmaciones globales.
// Sustituyen a alert()/confirm() del navegador: no bloquean la página, siguen
// el estilo de la app y se pueden usar desde cualquier componente cliente:
//
//   const notify = useNotify();     notify.success('Guardado');  notify.error('…')
//   const confirmar = useConfirm(); if (await confirmar({ titulo: '¿Eliminar?' })) …

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, X, AlertTriangle } from 'lucide-react';

type Tipo = 'success' | 'error' | 'info';
interface Aviso { id: number; tipo: Tipo; mensaje: string; accion?: { label: string; onClick: () => void } }

interface OpcionesConfirmar {
  titulo: string;
  mensaje?: string;
  confirmar?: string;     // texto del botón principal
  cancelar?: string;
  peligro?: boolean;      // botón rojo (eliminar)
}

interface Ctx {
  notificar: (tipo: Tipo, mensaje: string, accion?: Aviso['accion']) => void;
  confirmar: (o: OpcionesConfirmar) => Promise<boolean>;
}

const FeedbackContext = createContext<Ctx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [dialogo, setDialogo] = useState<(OpcionesConfirmar & { resolver: (v: boolean) => void }) | null>(null);
  const contador = useRef(0);

  const cerrar = useCallback((id: number) => setAvisos(a => a.filter(x => x.id !== id)), []);

  const notificar = useCallback((tipo: Tipo, mensaje: string, accion?: Aviso['accion']) => {
    const id = ++contador.current;
    setAvisos(a => [...a.slice(-3), { id, tipo, mensaje, accion }]);
    setTimeout(() => cerrar(id), tipo === 'error' ? 7000 : accion ? 6000 : 3500);
  }, [cerrar]);

  const confirmar = useCallback((o: OpcionesConfirmar) => new Promise<boolean>(resolver => {
    setDialogo({ ...o, resolver });
  }), []);

  const responder = (v: boolean) => { dialogo?.resolver(v); setDialogo(null); };

  return (
    <FeedbackContext.Provider value={{ notificar, confirmar }}>
      {children}

      {/* Pila de avisos */}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
        {avisos.map(a => (
          <div key={a.id} role={a.tipo === 'error' ? 'alert' : 'status'}
            className="os-toast pointer-events-auto w-full sm:w-auto sm:max-w-sm flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-2xl border bg-gray-900 text-white border-gray-800 animate-enter">
            {a.tipo === 'success' && <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />}
            {a.tipo === 'error'   && <XCircle size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />}
            {a.tipo === 'info'    && <Info size={16} className="text-sky-400 mt-0.5 flex-shrink-0" />}
            <p className="text-[13px] leading-snug flex-1">{a.mensaje}</p>
            {a.accion && (
              <button onClick={() => { a.accion!.onClick(); cerrar(a.id); }}
                className="text-[12px] font-bold text-[#ffc500] hover:underline flex-shrink-0">
                {a.accion.label}
              </button>
            )}
            <button onClick={() => cerrar(a.id)} aria-label="Cerrar aviso" className="text-white/40 hover:text-white/80 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Diálogo de confirmación */}
      {dialogo && <DialogoConfirmar o={dialogo} onResponder={responder} />}
    </FeedbackContext.Provider>
  );
}

function DialogoConfirmar({ o, onResponder }: { o: OpcionesConfirmar; onResponder: (v: boolean) => void }) {
  const botonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    botonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onResponder(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResponder]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onResponder(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo"
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-start gap-3">
          {o.peligro && (
            <span className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} />
            </span>
          )}
          <div className="min-w-0">
            <h2 id="confirmar-titulo" className="text-[15px] font-bold text-gray-900 dark:text-gray-100">{o.titulo}</h2>
            {o.mensaje && <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{o.mensaje}</p>}
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={() => onResponder(false)}
            className="flex-1 text-sm font-medium py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            {o.cancelar || 'Cancelar'}
          </button>
          <button ref={botonRef} onClick={() => onResponder(true)}
            className={`flex-1 text-sm font-bold py-2.5 rounded-xl text-white transition-colors ${o.peligro ? 'bg-rose-500 hover:bg-rose-600' : 'bg-[#ffc500] hover:bg-[#e6b000]'}`}>
            {o.confirmar || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function useFeedback(): Ctx {
  const ctx = useContext(FeedbackContext);
  // Fallback por si un componente se renderiza fuera del provider
  return ctx || {
    notificar: (_t, m) => { if (typeof window !== 'undefined') window.alert(m); },
    confirmar: async o => typeof window !== 'undefined' ? window.confirm(o.titulo) : false,
  };
}

export function useNotify() {
  const { notificar } = useFeedback();
  return {
    success: (m: string, accion?: Aviso['accion']) => notificar('success', m, accion),
    error:   (m: string) => notificar('error', m),
    info:    (m: string, accion?: Aviso['accion']) => notificar('info', m, accion),
  };
}

export function useConfirm() {
  return useFeedback().confirmar;
}

/**
 * Evita que una misma acción se ejecute dos veces a la vez (doble clic),
 * sin bloquear el resto de la interfaz. Uso:
 *   const unaVez = useUnaVez();
 *   onClick={() => unaVez('crear', async () => { … })}
 * Mientras la acción 'crear' está en curso, los clics repetidos se ignoran.
 */
export function useUnaVez() {
  const enCurso = useRef(new Set<string>());
  return useCallback(async <T,>(clave: string, fn: () => Promise<T>): Promise<T | undefined> => {
    if (enCurso.current.has(clave)) return undefined;
    enCurso.current.add(clave);
    try { return await fn(); }
    finally { enCurso.current.delete(clave); }
  }, []);
}

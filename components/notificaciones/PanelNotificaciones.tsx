'use client';
// Panel lateral de notificaciones (se abre desde la campana).
import Link from 'next/link';
import { useEffect } from 'react';
import { X, Bell, Clock, AlertTriangle, MessageSquareReply, UserPlus, Wallet, Sparkles, UserX, CheckCheck, RefreshCw, Loader2 } from 'lucide-react';
import { useNotificaciones, type TipoAviso } from './Notificaciones';

const ESTILO: Record<TipoAviso, { icon: any; color: string; grupo: string }> = {
  actualizacion: { icon: Sparkles,           color: 'text-[var(--acento)] bg-[var(--acento-suave)]', grupo: 'Programa' },
  atrasado:      { icon: AlertTriangle,      color: 'text-red-500 bg-red-500/10',        grupo: 'Seguimientos' },
  contactar:     { icon: Clock,              color: 'text-amber-500 bg-amber-500/10',    grupo: 'Seguimientos' },
  reportar:      { icon: MessageSquareReply, color: 'text-violet-500 bg-violet-500/10',  grupo: 'Seguimientos' },
  perder:        { icon: UserX,              color: 'text-slate-500 bg-slate-500/10',    grupo: 'Seguimientos' },
  pago:          { icon: Wallet,             color: 'text-emerald-500 bg-emerald-500/10', grupo: 'Cobros' },
  nuevo:         { icon: UserPlus,           color: 'text-blue-500 bg-blue-500/10',      grupo: 'Leads nuevos' },
};

export default function PanelNotificaciones() {
  const { avisos, leidas, marcarLeida, marcarTodas, abierto, setAbierto, recargar, cargando, noLeidas } = useNotificaciones();

  useEffect(() => {
    if (!abierto) return;
    const t = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, [abierto, setAbierto]);

  if (!abierto) return null;
  const grupos = avisos.reduce<Record<string, typeof avisos>>((acc, a) => {
    (acc[ESTILO[a.tipo].grupo] ||= []).push(a); return acc;
  }, {});

  return (
    <>
      <div className="fixed inset-0 z-[55]" onClick={() => setAbierto(false)} />
      <div className="fixed z-[60] top-11 bottom-2 left-[calc(var(--sidebar-ancho,252px)+16px)] w-[380px] rounded-2xl border border-[#e4e7ee] dark:border-[#262626] bg-white/95 dark:bg-[#151515]/95 backdrop-blur-xl shadow-2xl flex flex-col animate-enter">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-[#eef0f4] dark:border-[#262626]">
          <Bell size={16} className="text-[var(--acento)]" />
          <h2 className="flex-1 text-sm font-semibold text-[#111827] dark:text-white">Notificaciones {noLeidas > 0 && <span className="text-[#9aa3b2] font-medium">· {noLeidas} sin leer</span>}</h2>
          <button onClick={recargar} title="Actualizar" className="w-8 h-8 grid place-items-center rounded-lg text-[#8a93a3] hover:bg-[#f3f5f9] dark:hover:bg-[#212121]">
            {cargando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button onClick={marcarTodas} title="Marcar todo como leído" className="w-8 h-8 grid place-items-center rounded-lg text-[#8a93a3] hover:bg-[#f3f5f9] dark:hover:bg-[#212121]"><CheckCheck size={15} /></button>
          <button onClick={() => setAbierto(false)} title="Cerrar" className="w-8 h-8 grid place-items-center rounded-lg text-[#8a93a3] hover:bg-[#f3f5f9] dark:hover:bg-[#212121]"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto scroll-fino p-2">
          {avisos.length === 0 && (
            <div className="text-center py-16 px-6">
              <div className="w-12 h-12 rounded-full bg-[var(--acento-suave)] grid place-items-center mx-auto mb-3"><CheckCheck size={20} className="text-[var(--acento)]" /></div>
              <p className="text-sm font-semibold text-[#111827] dark:text-white">Todo al día</p>
              <p className="text-xs text-[#8a93a3] mt-1">No hay seguimientos, cobros ni avisos pendientes.</p>
            </div>
          )}
          {Object.entries(grupos).map(([grupo, lista]) => (
            <div key={grupo} className="mb-2">
              <p className="px-2 pt-2 pb-1 text-[11px] font-semibold text-[#8a93a3]">{grupo} · {lista.length}</p>
              {lista.map(a => {
                const { icon: Icon, color } = ESTILO[a.tipo];
                const leida = leidas.has(a.id);
                return (
                  <Link key={a.id} href={a.href} onClick={() => { marcarLeida(a.id); setAbierto(false); }}
                    className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-[#f5f7fa] dark:hover:bg-[#1c1c1c]">
                    <span className={`w-8 h-8 rounded-full grid place-items-center flex-shrink-0 ${color}`}><Icon size={15} /></span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[13px] leading-snug ${leida ? 'text-[#6b7280] dark:text-[#949494]' : 'text-[#111827] dark:text-white font-medium'}`}>{a.titulo}</span>
                      <span className="block text-[11.5px] text-[#8a93a3] mt-0.5 truncate">{a.detalle}</span>
                    </span>
                    {!leida && <span className="w-2 h-2 rounded-full bg-[var(--acento)] mt-1.5 flex-shrink-0" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

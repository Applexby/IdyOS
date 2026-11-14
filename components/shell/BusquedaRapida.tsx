'use client';
// Búsqueda rápida (Ctrl K): ir a cualquier pantalla o acción del sistema.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search, CornerDownLeft, Settings, User, Bell, Palette } from 'lucide-react';
import { SECCIONES } from './navegacion';

const EVENTO = 'idyos:busqueda';
export const abrirBusqueda = () => window.dispatchEvent(new Event(EVENTO));

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function BusquedaRapida({ onNotificaciones }: { onNotificaciones: () => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';
  const [abierta, setAbierta] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abrir = () => { setAbierta(true); setQ(''); setSel(0); };
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrir(); }
    };
    window.addEventListener(EVENTO, abrir);
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener(EVENTO, abrir); window.removeEventListener('keydown', tecla); };
  }, []);
  useEffect(() => { if (abierta) setTimeout(() => input.current?.focus(), 10); }, [abierta]);

  const opciones = useMemo(() => {
    const todas = [
      ...SECCIONES.filter(s => !s.adminOnly || isAdmin).flatMap(s => s.items.map(i => ({
        label: i.label, grupo: s.label, icon: i.icon, claves: i.claves || '', accion: () => router.push(i.href),
      }))),
      { label: 'Notificaciones', grupo: 'Programa', icon: Bell, claves: 'avisos seguimientos', accion: onNotificaciones },
      { label: 'Configuración del programa', grupo: 'Programa', icon: Settings, claves: 'actualizaciones preferencias cache', accion: () => router.push('/programa') },
      { label: 'Temas y apariencia', grupo: 'Programa', icon: Palette, claves: 'oscuro claro color', accion: () => router.push('/programa#apariencia') },
      { label: 'Mi perfil', grupo: 'Programa', icon: User, claves: 'foto cuenta', accion: () => router.push('/perfil') },
    ];
    const t = norm(q.trim());
    return t ? todas.filter(o => norm(`${o.label} ${o.grupo} ${o.claves}`).includes(t)) : todas;
  }, [q, isAdmin, router, onNotificaciones]);

  if (!abierta) return null;
  const elegir = (i: number) => { const o = opciones[i]; if (!o) return; setAbierta(false); o.accion(); };

  return (
    <div className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4" onClick={() => setAbierta(false)}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-[#e4e7ee] dark:border-[#232c3d] bg-white dark:bg-[#111826]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-[#eef0f4] dark:border-[#1f2737]">
          <Search size={16} className="text-[#9aa3b2]" />
          <input ref={input} value={q} onChange={e => { setQ(e.target.value); setSel(0); }}
            placeholder="Buscar pantalla o acción…"
            onKeyDown={e => {
              if (e.key === 'Escape') setAbierta(false);
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(opciones.length - 1, s + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
              if (e.key === 'Enter') elegir(sel);
            }}
            className="flex-1 bg-transparent outline-none text-sm text-[#111827] dark:text-white placeholder-[#9aa3b2]" />
          <kbd className="text-[10px] text-[#9aa3b2] border border-[#e1e5ec] dark:border-[#273044] rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto scroll-fino p-1.5">
          {opciones.length === 0 && <p className="text-center text-xs text-[#9aa3b2] py-8">Sin resultados</p>}
          {opciones.map((o, i) => {
            const Icon = o.icon;
            return (
              <button key={`${o.grupo}-${o.label}`} onMouseEnter={() => setSel(i)} onClick={() => elegir(i)}
                className={`w-full flex items-center gap-3 px-3 h-10 rounded-xl text-left ${i === sel ? 'bg-[#f3f5f9] dark:bg-[#1a2232]' : ''}`}>
                <Icon size={16} className={i === sel ? 'text-[var(--acento)]' : 'text-[#8a93a3]'} />
                <span className="flex-1 text-[13px] text-[#1f2937] dark:text-[#e5e7eb]">{o.label}</span>
                <span className="text-[11px] text-[#9aa3b2]">{o.grupo}</span>
                {i === sel && <CornerDownLeft size={13} className="text-[#9aa3b2]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

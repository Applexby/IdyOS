'use client';
// Ventana de ayuda rápida (atajos y cómo funciona el programa).
import { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useEscritorio } from '@/lib/desktop';

const EVENTO = 'idyos:ayuda';
export const abrirAyuda = () => window.dispatchEvent(new Event(EVENTO));

const ATAJOS = [
  ['Ctrl K', 'Búsqueda rápida: ir a cualquier pantalla'],
  ['Ctrl ,', 'Configuración del programa'],
  ['Ctrl R', 'Recargar la pantalla'],
  ['Esc', 'Cerrar paneles y ventanas'],
];

const PREGUNTAS = [
  ['¿Cómo se actualiza IdyOS?', 'Solo. Cuando hay una versión nueva aparece una tarjeta en la barra lateral: pulsa "Reiniciar y actualizar".'],
  ['¿De dónde salen los avisos?', 'De los seguimientos del CRM, leads nuevos y cobros pendientes. Se revisan cada 10 minutos.'],
  ['Los datos no coinciden con Notion', 'Configuración → Datos locales → "Vaciar caché y recargar".'],
  ['Borrador vs. Generar cotización', 'El borrador guarda el PDF en tu PC. Generar lo sube a Cloudinary y lo registra en Notion.'],
];

export default function Ayuda() {
  const [abierta, setAbierta] = useState(false);
  const { info } = useEscritorio();
  useEffect(() => {
    const a = () => setAbierta(true);
    const t = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false);
    window.addEventListener(EVENTO, a);
    window.addEventListener('keydown', t);
    return () => { window.removeEventListener(EVENTO, a); window.removeEventListener('keydown', t); };
  }, []);
  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-[2px] grid place-items-center p-4" onClick={() => setAbierta(false)}>
      <div className="w-full max-w-md rounded-2xl border border-[#e4e7ee] dark:border-[#2b2b2b] bg-white dark:bg-[#181818] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 h-14 border-b border-[#eef0f4] dark:border-[#262626]">
          <HelpCircle size={17} className="text-[var(--acento)]" />
          <h2 className="flex-1 text-[15px] font-semibold text-[#111827] dark:text-white">Ayuda</h2>
          <button onClick={() => setAbierta(false)} className="w-8 h-8 grid place-items-center rounded-lg text-[#8a93a3] hover:bg-[#f3f5f9] dark:hover:bg-[#212121]"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <p className="text-[12px] font-semibold text-[#6b7280] mb-2">Atajos de teclado</p>
            <div className="space-y-1.5">
              {ATAJOS.map(([k, d]) => (
                <div key={k} className="flex items-center gap-3 text-[13.5px] text-[#374151] dark:text-[#dcdcdc]">
                  <kbd className="min-w-[56px] text-center text-[11.5px] font-medium border border-[#e1e5ec] dark:border-[#323232] rounded-md px-1.5 py-0.5 text-[#6b7280]">{k}</kbd>{d}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#6b7280] mb-2">Preguntas frecuentes</p>
            <div className="space-y-3">
              {PREGUNTAS.map(([p, r]) => (
                <div key={p}><p className="text-[13.5px] font-medium text-[#111827] dark:text-white">{p}</p><p className="text-[13px] text-[#6b7280] dark:text-[#949494]">{r}</p></div>
              ))}
            </div>
          </div>
          <p className="text-[11.5px] text-[#9aa3b2]">IdyOS{info ? ` ${info.version}` : ''} · Idealo Films</p>
        </div>
      </div>
    </div>
  );
}

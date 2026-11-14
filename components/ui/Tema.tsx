'use client';

// Modo oscuro (E5). La preferencia se guarda en este navegador:
// 'claro' | 'oscuro' | 'sistema' (sigue al sistema operativo).
// El script SCRIPT_TEMA se ejecuta en <head> antes de pintar para evitar el
// parpadeo; este componente solo permite cambiarla.

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export type Tema = 'claro' | 'oscuro' | 'sistema';
const CLAVE = 'os_tema';

/** Script inline para <head>: aplica la clase .dark antes del primer pintado. */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('${CLAVE}')||'claro';var d=t==='oscuro'||(t==='sistema'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

function aplicar(t: Tema) {
  const oscuro = t === 'oscuro' || (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', oscuro);
  document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light';
}

export function SelectorTema() {
  const [tema, setTema] = useState<Tema>('claro');

  useEffect(() => {
    try { setTema((localStorage.getItem(CLAVE) as Tema) || 'claro'); } catch { /* noop */ }
  }, []);

  // En modo "sistema", seguir los cambios del sistema operativo
  useEffect(() => {
    if (tema !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const f = () => aplicar('sistema');
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [tema]);

  function cambiar(t: Tema) {
    setTema(t);
    try { localStorage.setItem(CLAVE, t); } catch { /* noop */ }
    aplicar(t);
  }

  const opciones: { t: Tema; l: string; icon: typeof Sun }[] = [
    { t: 'claro', l: 'Claro', icon: Sun },
    { t: 'oscuro', l: 'Oscuro', icon: Moon },
    { t: 'sistema', l: 'Sistema', icon: Monitor },
  ];

  return (
    <div className="px-3 py-2.5" role="radiogroup" aria-label="Tema de la interfaz">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Tema</p>
      <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-lg p-0.5">
        {opciones.map(({ t, l, icon: Icon }) => (
          <button key={t} role="radio" aria-checked={tema === t} onClick={() => cambiar(t)}
            className={`flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md transition-colors ${tema === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            <Icon size={12} /> {l}
          </button>
        ))}
      </div>
    </div>
  );
}

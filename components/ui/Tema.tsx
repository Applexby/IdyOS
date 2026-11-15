'use client';

// Modo oscuro (E5). La preferencia se guarda en este navegador:
// 'claro' | 'oscuro' | 'sistema' (sigue al sistema operativo).
// El script SCRIPT_TEMA se ejecuta en <head> antes de pintar para evitar el
// parpadeo; este componente solo permite cambiarla.

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export type Tema = 'claro' | 'oscuro' | 'sistema';
const CLAVE = 'os_tema';
const CLAVE_ACENTO = 'os_acento';
const CLAVE_VIDRIO = 'os_vidrio';
const EVENTO = 'idyos:tema';

/** Temas de color (acento). Para añadir uno: agregarlo aquí y en globals.css
 *  (bloque html[data-acento="…"]). 'idealo' es el amarillo de la marca. */
export const ACENTOS = [
  { id: 'idealo',    nombre: 'Idealo',    color: '#ffc500', texto: '#111827' },
  { id: 'oceano',    nombre: 'Océano',    color: '#3b82f6', texto: '#ffffff' },
  { id: 'esmeralda', nombre: 'Esmeralda', color: '#10b981', texto: '#ffffff' },
  { id: 'violeta',   nombre: 'Violeta',   color: '#8b5cf6', texto: '#ffffff' },
  { id: 'coral',     nombre: 'Coral',     color: '#f43f5e', texto: '#ffffff' },
  { id: 'naranja', nombre: 'Naranja', color: '#f97316', texto: '#ffffff' },
  { id: 'rojo', nombre: 'Rojo', color: '#ef4444', texto: '#ffffff' },
  { id: 'rosa', nombre: 'Rosa', color: '#ec4899', texto: '#ffffff' },
  { id: 'fucsia', nombre: 'Fucsia', color: '#d946ef', texto: '#ffffff' },
  { id: 'indigo', nombre: 'Índigo', color: '#6366f1', texto: '#ffffff' },
  { id: 'cielo', nombre: 'Cielo', color: '#0ea5e9', texto: '#ffffff' },
  { id: 'cian', nombre: 'Cian', color: '#06b6d4', texto: '#ffffff' },
  { id: 'turquesa', nombre: 'Turquesa', color: '#14b8a6', texto: '#ffffff' },
  { id: 'lima', nombre: 'Lima', color: '#84cc16', texto: '#111827' },
  { id: 'cobre', nombre: 'Cobre', color: '#c2703d', texto: '#ffffff' },
  { id: 'grafito', nombre: 'Grafito', color: '#64748b', texto: '#ffffff' },
] as const;
export type Acento = typeof ACENTOS[number]['id'];

/** Script inline para <head>: aplica la clase .dark y el acento antes del primer pintado. */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('${CLAVE}')||'claro';var d=t==='oscuro'||(t==='sistema'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';document.documentElement.dataset.acento=location.pathname.indexOf('/login')===0?'idealo':(localStorage.getItem('${CLAVE_ACENTO}')||'idealo');document.documentElement.dataset.vidrio=localStorage.getItem('${CLAVE_VIDRIO}')==='1'?'1':'0';}catch(e){}})();`;

function aplicar(t: Tema) {
  const oscuro = t === 'oscuro' || (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', oscuro);
  document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light';
}

function leer<T extends string>(clave: string, def: T): T {
  try { return (localStorage.getItem(clave) as T) || def; } catch { return def; }
}

/** Tema y acento actuales, sincronizados entre todos los componentes que los usan. */
export function useTema() {
  const [tema, setTemaE] = useState<Tema>('claro');
  const [acento, setAcentoE] = useState<Acento>('idealo');
  const [vidrio, setVidrioE] = useState(false);

  useEffect(() => {
    const sync = () => { setTemaE(leer<Tema>(CLAVE, 'claro')); setAcentoE(leer<Acento>(CLAVE_ACENTO, 'idealo')); setVidrioE(leer<string>(CLAVE_VIDRIO, '0') === '1'); };
    sync();
    window.addEventListener(EVENTO, sync);
    return () => window.removeEventListener(EVENTO, sync);
  }, []);

  useEffect(() => {
    if (tema !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const f = () => aplicar('sistema');
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [tema]);

  const setTema = (t: Tema) => {
    try { localStorage.setItem(CLAVE, t); } catch { /* noop */ }
    aplicar(t);
    window.dispatchEvent(new Event(EVENTO));
  };
  const setAcento = (a: Acento) => {
    try { localStorage.setItem(CLAVE_ACENTO, a); } catch { /* noop */ }
    document.documentElement.dataset.acento = a;
    window.dispatchEvent(new Event(EVENTO));
  };
  /** Estilo vidrio (desenfoque gaussiano en barra lateral y paneles). Opcional: usa más recursos. */
  const setVidrio = (v: boolean) => {
    try { localStorage.setItem(CLAVE_VIDRIO, v ? '1' : '0'); } catch { /* noop */ }
    document.documentElement.dataset.vidrio = v ? '1' : '0';
    window.dispatchEvent(new Event(EVENTO));
  };
  const oscuro = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return { tema, setTema, acento, setAcento, vidrio, setVidrio, oscuro };
}

export function SelectorTema() {
  const { tema, setTema } = useTema();
  const cambiar = setTema;

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


/**
 * Guardián del tema: si algo borra la clase .dark o los atributos de acento /
 * vidrio del <html> (React lo hace cuando rehace la página tras un error de
 * hidratación), los vuelve a poner al instante. En /login el acento es siempre
 * el amarillo de Idealo.
 */
export function GuardianTema() {
  useEffect(() => {
    const raiz = document.documentElement;
    const aplicarTodo = () => {
      const t = leer<Tema>(CLAVE, 'claro');
      const oscuro = t === 'oscuro' || (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const acento = window.location.pathname.startsWith('/login') ? 'idealo' : leer<string>(CLAVE_ACENTO, 'idealo');
      const vidrio = leer<string>(CLAVE_VIDRIO, '0') === '1' ? '1' : '0';
      if (raiz.classList.contains('dark') !== oscuro) raiz.classList.toggle('dark', oscuro);
      if (raiz.style.colorScheme !== (oscuro ? 'dark' : 'light')) raiz.style.colorScheme = oscuro ? 'dark' : 'light';
      if (raiz.dataset.acento !== acento) raiz.dataset.acento = acento;
      if (raiz.dataset.vidrio !== vidrio) raiz.dataset.vidrio = vidrio;
    };
    aplicarTodo();
    const obs = new MutationObserver(aplicarTodo);
    obs.observe(raiz, { attributes: true, attributeFilter: ['class', 'style', 'data-acento', 'data-vidrio'] });
    window.addEventListener(EVENTO, aplicarTodo);
    window.addEventListener('popstate', aplicarTodo);
    // Las navegaciones internas (pushState) no avisan: revisar al cambiar la ruta
    let ruta = location.pathname;
    const t = setInterval(() => { if (location.pathname !== ruta) { ruta = location.pathname; aplicarTodo(); } }, 400);
    return () => { obs.disconnect(); window.removeEventListener(EVENTO, aplicarTodo); window.removeEventListener('popstate', aplicarTodo); clearInterval(t); };
  }, []);
  return null;
}

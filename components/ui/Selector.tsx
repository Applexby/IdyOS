'use client';

// Lista desplegable propia (sustituye a <select>, cuya lista la dibuja el
// sistema operativo y no se puede estilizar). Se usa igual que un <select>:
//
//   <Selector value={x} onChange={e => setX(e.target.value)} className="…">
//     <option value="">—</option>
//     <optgroup label="Grupo">{lista.map(o => <option key={o} value={o}>{o}</option>)}</optgroup>
//   </Selector>
//
// - `className` se aplica al botón (mantiene el aspecto de cada pantalla).
// - onChange recibe un objeto { target: { value } } como el de un <select>.
// - Lista flotante (portal) con bordes redondeados, opción elegida marcada,
//   buscador si hay más de 12 opciones, y modo claro/oscuro (clases .sel-* en globals.css).
// - Teclado: Enter/Espacio/↓ abre, ↑↓ se mueve, Enter elige, Esc cierra,
//   escribir una letra salta a la opción que empieza así.

import {
  Children, Fragment, forwardRef, isValidElement, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

interface Opcion { value: string; label: string; disabled?: boolean; grupo?: string }

const texto = (n: ReactNode): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(texto).join('');
  if (isValidElement(n)) return texto((n.props as any).children);
  return '';
};

/** Lee los <option>/<optgroup> hijos (también dentro de fragmentos y .map). */
function leerOpciones(children: ReactNode, grupo?: string, acc: Opcion[] = []): Opcion[] {
  Children.toArray(children).forEach(ch => {
    if (!isValidElement(ch)) return;
    const props = ch.props as any;
    if (ch.type === Fragment) return void leerOpciones(props.children, grupo, acc);
    if (ch.type === 'optgroup') return void leerOpciones(props.children, props.label, acc);
    if (ch.type === 'option') {
      const label = texto(props.children);
      acc.push({ value: props.value !== undefined ? String(props.value) : label, label, disabled: !!props.disabled, grupo });
    }
  });
  return acc;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Props {
  value?: string | number | null;
  onChange?: (e: { target: { value: string }; currentTarget: { value: string } }) => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  title?: string;
  placeholder?: string;
  'aria-label'?: string;
  'data-hoja-col'?: string;
}

const Selector = forwardRef<HTMLButtonElement | null, Props>(function Selector(
  { value, onChange, onBlur, onKeyDown, children, className, disabled, autoFocus, title, placeholder, ...rest }, ref,
) {
  const opciones = useMemo(() => leerOpciones(children), [children]);
  const actual = value === null || value === undefined ? '' : String(value);
  const elegida = opciones.find(o => o.value === actual);
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => boton.current as HTMLButtonElement);

  useEffect(() => { if (autoFocus) { boton.current?.focus(); setAbierto(true); } }, [autoFocus]);

  function elegir(v: string) {
    setAbierto(false);
    boton.current?.focus();
    if (v !== actual) onChange?.({ target: { value: v }, currentTarget: { value: v } });
  }

  function teclas(e: KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented || disabled) return;
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setAbierto(true); }
  }

  return (
    <>
      <button ref={boton} type="button" disabled={disabled} title={title} aria-label={rest['aria-label']}
        data-hoja-col={rest['data-hoja-col']} aria-haspopup="listbox" aria-expanded={abierto}
        onClick={() => setAbierto(a => !a)} onKeyDown={teclas}
        onBlur={() => { if (!abierto) onBlur?.(); }}
        className={`sel-boton relative text-left !pr-8 truncate cursor-pointer disabled:cursor-not-allowed ${className || 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[#ffc500]'}`}>
        <span className={elegida && elegida.value !== '' ? '' : 'sel-vacio'}>
          {elegida ? elegida.label || ' ' : (placeholder || actual || '—')}
        </span>
        <ChevronDown size={14} className={`absolute right-2.5 top-1/2 -translate-y-1/2 sel-flecha transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <Lista ancla={boton.current} opciones={opciones} actual={actual} onElegir={elegir}
          onCerrar={() => { setAbierto(false); onBlur?.(); }}
          onEscape={() => { setAbierto(false); boton.current?.focus(); }} />
      )}
    </>
  );
});

export default Selector;

function Lista({ ancla, opciones, actual, onElegir, onCerrar, onEscape }: {
  ancla: HTMLElement | null; opciones: Opcion[]; actual: string;
  onElegir: (v: string) => void; onCerrar: () => void; onEscape: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const conBuscador = opciones.length > 12;
  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return q ? opciones.filter(o => sinTildes(o.label).includes(q)) : opciones;
  }, [opciones, busqueda]);
  const [activa, setActiva] = useState(() => Math.max(0, opciones.findIndex(o => o.value === actual)));
  useEffect(() => { if (busqueda) setActiva(0); }, [busqueda]);

  // Posición bajo el botón (o encima si no cabe), con el ancho del botón
  useLayoutEffect(() => {
    const colocar = () => {
      if (!ancla) return;
      const r = ancla.getBoundingClientRect();
      const width = Math.max(r.width, 180);
      const abajo = window.innerHeight - r.bottom - 12, arriba = r.top - 12;
      const h = Math.min(caja.current?.scrollHeight || 300, 320);
      const haciaArriba = abajo < Math.min(h, 220) && arriba > abajo;
      const maxH = Math.max(140, Math.min(320, haciaArriba ? arriba : abajo));
      const top = haciaArriba ? r.top - Math.min(h, maxH) - 6 : r.bottom + 6;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ top, left, width, maxH });
    };
    colocar();
    window.addEventListener('resize', colocar);
    window.addEventListener('scroll', colocar, true);
    return () => { window.removeEventListener('resize', colocar); window.removeEventListener('scroll', colocar, true); };
  }, [ancla, visibles.length]);

  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (caja.current?.contains(e.target as Node) || ancla?.contains(e.target as Node)) return;
      onCerrar();
    };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [ancla, onCerrar]);

  // Foco: buscador si lo hay; si no, la lista (para el teclado)
  useEffect(() => {
    const el = caja.current?.querySelector<HTMLElement>(conBuscador ? 'input' : '[role=listbox]');
    el?.focus({ preventScroll: true });
  }, [conBuscador]);

  // Mantener visible la opción activa
  useEffect(() => {
    caja.current?.querySelector(`[data-i="${activa}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activa]);

  const tecleo = useRef({ txt: '', t: 0 });
  function teclas(e: KeyboardEvent) {
    const mover = (d: number) => {
      e.preventDefault();
      let i = activa;
      for (let n = 0; n < visibles.length; n++) {
        i = (i + d + visibles.length) % visibles.length;
        if (!visibles[i].disabled) break;
      }
      setActiva(i);
    };
    if (e.key === 'ArrowDown') mover(1);
    else if (e.key === 'ArrowUp') mover(-1);
    else if (e.key === 'Home') { e.preventDefault(); setActiva(0); }
    else if (e.key === 'End') { e.preventDefault(); setActiva(visibles.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = visibles[activa]; if (o && !o.disabled) onElegir(o.value); }
    else if (e.key === 'Escape') { e.preventDefault(); onEscape(); }
    else if (e.key === 'Tab') onCerrar();
    else if (!conBuscador && e.key.length === 1) {
      // Saltar por la primera letra (como en un <select>)
      const ahora = Date.now();
      tecleo.current = { txt: (ahora - tecleo.current.t < 700 ? tecleo.current.txt : '') + sinTildes(e.key), t: ahora };
      const i = visibles.findIndex(o => sinTildes(o.label).startsWith(tecleo.current.txt));
      if (i >= 0) setActiva(i);
    }
  }

  if (typeof document === 'undefined') return null;
  let grupoAnterior: string | undefined;
  return createPortal(
    <div ref={caja} onKeyDown={teclas}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width, maxHeight: pos?.maxH }}
      className="sel-panel fixed z-[140] rounded-xl p-1 flex flex-col animate-enter">
      {conBuscador && (
        <div className="relative p-1 pb-1.5">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 -mt-[1px] sel-flecha pointer-events-none" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar…" aria-label="Buscar opción"
            className="sel-buscar w-full text-[13px] rounded-lg pl-8 pr-2 py-1.5 focus:outline-none" />
        </div>
      )}
      <div role="listbox" tabIndex={-1} className="overflow-y-auto outline-none" style={{ maxHeight: (pos?.maxH ?? 320) - (conBuscador ? 52 : 8) }}>
        {visibles.length === 0 && <p className="text-[12px] sel-vacio px-3 py-2">Sin coincidencias</p>}
        {visibles.map((o, i) => {
          const cabecera = o.grupo && o.grupo !== grupoAnterior ? o.grupo : null;
          grupoAnterior = o.grupo;
          const sel = o.value === actual && o.value !== '';
          return (
            <Fragment key={`${o.grupo || ''}|${o.value}|${i}`}>
              {cabecera && <p className="sel-grupo text-[10px] font-bold uppercase tracking-wider px-3 pt-2 pb-1">{cabecera}</p>}
              <div role="option" aria-selected={sel} aria-disabled={o.disabled} data-i={i}
                onMouseEnter={() => setActiva(i)}
                onClick={() => !o.disabled && onElegir(o.value)}
                className={`sel-opcion flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg cursor-pointer select-none
                  ${i === activa ? 'sel-activa' : ''} ${sel ? 'sel-elegida' : ''} ${o.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <span className="flex-1 truncate">{o.label || ' '}</span>
                {sel && <Check size={14} className="sel-check flex-shrink-0" />}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

'use client';

// Selector de fecha propio (sustituye a <input type="date"> del navegador, que
// se veía distinto en cada sistema). Estilo: cabecera con flechas y "pastillas"
// de mes y año, días como fichas redondeadas, el elegido en el color de marca y
// hoy resaltado. Funciona en modo claro y oscuro (clases .dp-* en globals.css).
//
//   <DatePicker value="2026-10-13" onChange={v => …} />   (v = 'YYYY-MM-DD' o '')
//
// El calendario se abre en una capa flotante (portal) para que no lo recorten
// tablas ni modales. Teclado: flechas para moverse, Enter elige, Esc cierra.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import { hoyLima } from '@/lib/utils';
import Selector from '@/components/ui/Selector';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const valida = (v?: string | null) => !!v && /^\d{4}-\d{2}-\d{2}/.test(v);
/** 'YYYY-MM-DD' → 'dd/mm/yyyy' */
export const fechaVisible = (v?: string | null) => (valida(v) ? `${v!.slice(8, 10)}/${v!.slice(5, 7)}/${v!.slice(0, 4)}` : '');

function sumarDias(v: string, n: number) {
  const d = new Date(Date.parse(v.slice(0, 10) + 'T12:00:00Z') + n * 86400000);
  return d.toISOString().slice(0, 10);
}

interface Props {
  value: string | null | undefined;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Muestra la "x" para dejar la fecha vacía */
  borrable?: boolean;
  /** Clases del botón (por defecto, estilo de campo de formulario) */
  className?: string;
  /** Aspecto mínimo, para celdas de tablas */
  compacto?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  title?: string;
  /** Atributo para navegar entre celdas (hoja editable) */
  dataCol?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

export default function DatePicker({
  value, onChange, min, max, placeholder = 'dd/mm/aaaa', disabled, borrable, className, compacto, autoFocus, title, dataCol, onKeyDown,
  ...rest
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (autoFocus) boton.current?.focus(); }, [autoFocus]);

  const elegir = (v: string) => { onChange(v); setAbierto(false); boton.current?.focus(); };

  const base = compacto
    ? 'dp-campo w-full flex items-center gap-1.5 text-left text-[12.5px] px-2 py-1.5 rounded-md border border-transparent hover:border-gray-200 focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-[#ffc500]/20 disabled:cursor-default disabled:hover:border-transparent'
    : 'dp-campo w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white hover:border-gray-300 focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-[#ffc500]/20 disabled:opacity-50';

  return (
    <>
      <button ref={boton} type="button" disabled={disabled} title={title} aria-label={rest['aria-label']}
        aria-haspopup="dialog" aria-expanded={abierto} data-hoja-col={dataCol}
        onClick={() => setAbierto(a => !a)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); setAbierto(true); return; }
          onKeyDown?.(e);
        }}
        className={className || base}>
        {!compacto && <Calendar size={14} className="text-gray-400 flex-shrink-0" />}
        <span className={`flex-1 tabular-nums truncate ${valida(value) ? 'text-gray-800' : 'text-gray-400'}`}>
          {valida(value) ? fechaVisible(value) : placeholder}
        </span>
        {borrable && valida(value) && !disabled && (
          <span role="button" tabIndex={-1} aria-label="Borrar fecha" onClick={e => { e.stopPropagation(); onChange(''); }}
            className="text-gray-300 hover:text-gray-600"><X size={13} /></span>
        )}
        {compacto && <Calendar size={12} className="text-gray-300 flex-shrink-0" />}
      </button>
      {abierto && (
        <Calendario ancla={boton.current} valor={valida(value) ? value!.slice(0, 10) : ''} min={min} max={max}
          borrable={borrable} onElegir={elegir} onCerrar={() => { setAbierto(false); boton.current?.focus(); }} />
      )}
    </>
  );
}

function Calendario({ ancla, valor, min, max, borrable, onElegir, onCerrar }: {
  ancla: HTMLElement | null; valor: string; min?: string; max?: string; borrable?: boolean;
  onElegir: (v: string) => void; onCerrar: () => void;
}) {
  const hoy = hoyLima();
  const inicial = valor || hoy;
  const [vista, setVista] = useState({ y: Number(inicial.slice(0, 4)), m: Number(inicial.slice(5, 7)) - 1 });
  const [foco, setFoco] = useState(inicial);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  // Posición: debajo del campo (o encima si no cabe), dentro de la ventana
  useLayoutEffect(() => {
    const colocar = () => {
      if (!ancla || !caja.current) return;
      const r = ancla.getBoundingClientRect();
      const w = caja.current.offsetWidth, h = caja.current.offsetHeight;
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      setPos({ top, left });
    };
    colocar();
    window.addEventListener('resize', colocar);
    window.addEventListener('scroll', colocar, true);
    return () => { window.removeEventListener('resize', colocar); window.removeEventListener('scroll', colocar, true); };
  }, [ancla]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (caja.current?.contains(e.target as Node) || ancla?.contains(e.target as Node)) return;
      // Las listas de mes/año se abren en otra capa (Selector)
      if ((e.target as HTMLElement).closest?.('.sel-panel')) return;
      onCerrar();
    };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [ancla, onCerrar]);

  // Enfocar el día activo al abrir y al moverse con el teclado
  useEffect(() => {
    caja.current?.querySelector<HTMLButtonElement>(`[data-dia="${foco}"]`)?.focus();
  }, [foco, vista]);

  const fuera = (d: string) => (!!min && d < min.slice(0, 10)) || (!!max && d > max.slice(0, 10));

  // 6 semanas desde el lunes anterior al día 1
  const celdas = useMemo(() => {
    const primero = new Date(Date.UTC(vista.y, vista.m, 1));
    const desfase = (primero.getUTCDay() + 6) % 7;
    const inicio = sumarDias(iso(vista.y, vista.m, 1), -desfase);
    return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  }, [vista]);

  const irMes = (delta: number) => setVista(v => {
    const t = v.m + delta;
    return { y: v.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
  });

  function mover(nuevo: string) {
    setFoco(nuevo);
    const y = Number(nuevo.slice(0, 4)), m = Number(nuevo.slice(5, 7)) - 1;
    if (y !== vista.y || m !== vista.m) setVista({ y, m });
  }

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented) return; // ya lo atendió la lista de mes/año
    const mapa: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (mapa[e.key] !== undefined) { e.preventDefault(); mover(sumarDias(foco, mapa[e.key])); }
    else if (e.key === 'PageUp') { e.preventDefault(); irMes(-1); }
    else if (e.key === 'PageDown') { e.preventDefault(); irMes(1); }
    else if (e.key === 'Escape') { e.preventDefault(); onCerrar(); }
  }

  const anos = useMemo(() => {
    const y = Number(hoy.slice(0, 4));
    const lista = new Set<number>();
    for (let a = y - 6; a <= y + 3; a++) lista.add(a);
    lista.add(vista.y);
    return Array.from(lista).sort((a, b) => a - b);
  }, [hoy, vista.y]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={caja} role="dialog" aria-label="Elegir fecha" onKeyDown={teclas}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="dp-panel fixed z-[130] w-[300px] rounded-2xl p-3.5 animate-enter">
      {/* Cabecera: flechas + pastillas de mes y año */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button type="button" onClick={() => irMes(-1)} aria-label="Mes anterior" className="dp-flecha">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-1.5">
          <div className="dp-pastilla">
            <Selector aria-label="Mes" className="dp-sel" value={vista.m} onChange={e => setVista(v => ({ ...v, m: Number(e.target.value) }))}>
              {MESES.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </Selector>
          </div>
          <div className="dp-pastilla">
            <Selector aria-label="Año" className="dp-sel" value={vista.y} onChange={e => setVista(v => ({ ...v, y: Number(e.target.value) }))}>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </Selector>
          </div>
        </div>
        <button type="button" onClick={() => irMes(1)} aria-label="Mes siguiente" className="dp-flecha">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DIAS.map(d => <span key={d} className="dp-semana text-center text-[11.5px] font-medium py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid">
        {celdas.map(d => {
          const delMes = Number(d.slice(5, 7)) - 1 === vista.m;
          const elegido = d === valor;
          const esHoy = d === hoy;
          const bloqueado = fuera(d);
          return (
            <button key={d} type="button" data-dia={d} tabIndex={d === foco ? 0 : -1} disabled={bloqueado}
              aria-label={fechaVisible(d)} aria-selected={elegido} aria-current={esHoy ? 'date' : undefined}
              onClick={() => onElegir(d)} onFocus={() => setFoco(d)}
              className={`dp-dia h-9 rounded-[10px] text-[13px] tabular-nums transition-colors
                ${elegido ? 'dp-elegido' : esHoy ? 'dp-hoy' : delMes ? 'dp-normal' : 'dp-fuera'}`}>
              {Number(d.slice(8, 10))}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3 pt-2.5 dp-pie">
        <button type="button" onClick={() => !fuera(hoy) && onElegir(hoy)} className="dp-enlace">Hoy</button>
        {borrable && valor && <button type="button" onClick={() => onElegir('')} className="dp-enlace dp-borrar">Borrar</button>}
      </div>
    </div>,
    document.body,
  );
}

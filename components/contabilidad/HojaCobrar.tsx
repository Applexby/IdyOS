'use client';

// Modo "Hoja" de Por cobrar: los proyectos y sus pagos en una tabla tipo Excel.
// Cada celda se edita en el sitio y se guarda al salir de ella (o con Enter);
// Escape deshace lo escrito. Enter baja a la misma columna de la fila siguiente.
//
// - Proyecto, total y fechas se guardan en el proyecto de Notion.
// - Cada pago es una línea del "Historial de pagos": editar fecha, monto, medio,
//   n° de operación o nota reescribe esa línea (y ajusta el Monto Pagado).
// - La fila "sin detalle" es dinero ya sumado en Monto Pagado sin línea en el
//   historial: al completarla se crea su línea sin volver a sumar el monto.
// - Pagado y pendiente se calculan; el cliente se edita en Clientes.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, Trash2, Check, X, ExternalLink } from 'lucide-react';
import { formatCurrency, hoyLima } from '@/lib/utils';
import { MEDIOS_PAGO, parseMonto, type PagoProyecto } from '@/lib/pagos';
import type { DatosPago } from './RegistrarPago';
import DatePicker from '@/components/ui/DatePicker';
import type { ProyectoCont } from './tipos';
import Selector from '@/components/ui/Selector';

const fmt = (n: number) => formatCurrency(n);

export type CampoProyecto = 'proyecto' | 'monto_total' | 'fecha_inicio' | 'fecha_entrega' | 'fecha_cobro';

interface Props {
  proyectos: ProyectoCont[];
  onCampo: (id: string, campo: CampoProyecto, valor: string | number | null) => Promise<boolean>;
  onRegistrarPago: (id: string, d: DatosPago & { sin_sumar?: boolean }) => Promise<boolean>;
  onEditarPago: (id: string, linea: string, nuevo: DatosPago) => Promise<boolean>;
  onAnularPago: (id: string, linea: string, monto: number) => void;
}

// ── Celda editable ────────────────────────────────────────────────────────────
type TipoCelda = 'texto' | 'monto' | 'fecha' | 'medio';

function Celda({ valor, tipo = 'texto', onGuardar, col, deshabilitada, titulo, ancho, negrita, placeholder, resaltar }: {
  valor: string; tipo?: TipoCelda; onGuardar: (v: string) => Promise<boolean> | boolean;
  col: string; deshabilitada?: boolean; titulo?: string; ancho?: string; negrita?: boolean; placeholder?: string; resaltar?: boolean;
}) {
  const [borrador, setBorrador] = useState(valor);
  const [estado, setEstado] = useState<'' | 'guardando' | 'error'>('');
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const cancelado = useRef(false);
  useEffect(() => { setBorrador(valor); }, [valor]);

  async function confirmar(directo?: string) {
    if (cancelado.current) { cancelado.current = false; return; }
    const v = (directo ?? borrador).trim();
    if (v === valor.trim()) return;
    if (tipo === 'monto' && v && !(parseMonto(v) >= 0)) { setBorrador(valor); return; }
    setEstado('guardando');
    const ok = await onGuardar(v);
    setEstado(ok === false ? 'error' : '');
    if (ok === false) setBorrador(valor);
  }

  function onKey(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') { cancelado.current = true; setBorrador(valor); (e.target as HTMLElement).blur(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Como en Excel: Enter guarda y baja a la misma columna
      const celdas = Array.from(document.querySelectorAll<HTMLElement>(`[data-hoja-col="${col}"]:not(:disabled)`));
      const sig = celdas[celdas.indexOf(e.target as HTMLElement) + 1];
      if (sig) sig.focus(); else (e.target as HTMLElement).blur();
    }
  }

  const base = `os-celda w-full bg-transparent text-[12.5px] px-2 py-1.5 rounded-md border border-transparent outline-none
    hover:border-gray-200 focus:border-[#ffc500] focus:bg-white focus:ring-2 focus:ring-[#ffc500]/20
    disabled:hover:border-transparent disabled:cursor-default ${negrita ? 'font-semibold text-gray-900' : 'text-gray-700'}
    ${estado === 'guardando' ? 'opacity-60' : ''} ${estado === 'error' ? 'border-rose-300' : ''} ${tipo === 'monto' ? 'text-right tabular-nums' : ''} ${resaltar && !borrador ? 'placeholder:text-amber-600 !bg-amber-50' : ''}`;

  if (tipo === 'medio') {
    return (
      <Selector data-hoja-col={col} value={borrador} disabled={deshabilitada} title={titulo} aria-label={titulo || col}
        onChange={e => { setBorrador(e.target.value); confirmar(e.target.value); }} onKeyDown={onKey}
        className={`${base} ${ancho || ''} appearance-none cursor-pointer`}>
        <option value="">—</option>
        {MEDIOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
      </Selector>
    );
  }
  if (tipo === 'fecha') {
    // Calendario propio: guarda al elegir el día
    return (
      <div className={`${estado === 'guardando' ? 'opacity-60' : ''} ${estado === 'error' ? 'ring-1 ring-rose-300 rounded-md' : ''}`}>
        <DatePicker compacto value={borrador} disabled={deshabilitada} title={titulo} aria-label={titulo || col} dataCol={col}
          borrable={col !== 'pfecha'} placeholder="—"
          onChange={v => { setBorrador(v); confirmar(v); }} onKeyDown={e => { if (e.key === 'Enter') onKey(e); }} />
      </div>
    );
  }
  return (
    <input ref={ref} data-hoja-col={col} value={borrador} disabled={deshabilitada} title={titulo} aria-label={titulo || col}
      type="text" inputMode={tipo === 'monto' ? 'decimal' : undefined} placeholder={placeholder}
      onChange={e => setBorrador(e.target.value)} onBlur={() => confirmar()} onKeyDown={onKey} onFocus={e => e.target.select()}
      className={`${base} ${ancho || ''}`} />
  );
}

// ── Fila nueva de pago ────────────────────────────────────────────────────────
function FilaNuevoPago({ proyecto, inicial, onGuardar, onCancelar }: {
  proyecto: ProyectoCont; inicial?: Partial<DatosPago>;
  onGuardar: (d: DatosPago) => Promise<boolean>; onCancelar: () => void;
}) {
  const [d, setD] = useState<DatosPago>({
    fecha: inicial?.fecha || hoyLima(),
    monto: inicial?.monto ?? Math.max(0, proyecto.monto_pendiente || 0),
    medio: inicial?.medio || 'Transferencia', operacion: inicial?.operacion || '', nota: inicial?.nota || '',
  });
  const [montoTxt, setMontoTxt] = useState(d.monto ? String(d.monto) : '');
  const [guardando, setGuardando] = useState(false);
  const inp = 'w-full text-[12.5px] px-2 py-1.5 rounded-md border border-[#ffc500]/60 bg-amber-50/40 outline-none focus:border-[#ffc500] focus:bg-white';
  async function guardar() {
    const monto = parseMonto(montoTxt);
    if (!(monto > 0) || !d.fecha) return;
    setGuardando(true);
    const ok = await onGuardar({ ...d, monto: Math.round(monto * 100) / 100 });
    setGuardando(false);
    if (ok) onCancelar();
  }
  const teclas = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } if (e.key === 'Escape') onCancelar(); };
  return (
    <>
      <td className="px-1 py-1"><DatePicker autoFocus value={d.fecha} onChange={v => v && setD({ ...d, fecha: v })} max={hoyLima()} aria-label="Fecha del pago"
        className={`${inp} flex items-center gap-1 text-left`} /></td>
      <td className="px-1 py-1"><input value={montoTxt} inputMode="decimal" onChange={e => setMontoTxt(e.target.value)} onKeyDown={teclas} className={`${inp} text-right`} aria-label="Monto" placeholder="0.00" /></td>
      <td className="px-1 py-1">
        <Selector value={d.medio} onChange={e => setD({ ...d, medio: e.target.value })} onKeyDown={teclas} className={inp} aria-label="Medio">
          {MEDIOS_PAGO.map(m => <option key={m}>{m}</option>)}
        </Selector>
      </td>
      <td className="px-1 py-1"><input value={d.operacion} onChange={e => setD({ ...d, operacion: e.target.value })} onKeyDown={teclas} className={`${inp} font-mono`} aria-label="N° de operación" placeholder="N° op. voucher" /></td>
      <td className="px-1 py-1"><input value={d.nota} onChange={e => setD({ ...d, nota: e.target.value })} onKeyDown={teclas} className={inp} aria-label="Nota" placeholder="Adelanto 50%, saldo…" /></td>
      <td className="px-1 py-1 whitespace-nowrap">
        <button onClick={guardar} disabled={guardando} title="Guardar pago (Enter)" aria-label="Guardar pago"
          className="p-1.5 rounded-md bg-[#ffc500] text-white hover:bg-[#e6b000] disabled:opacity-50"><Check size={13} /></button>
        <button onClick={onCancelar} title="Cancelar (Esc)" aria-label="Cancelar"
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 ml-0.5"><X size={13} /></button>
      </td>
    </>
  );
}

// ── Hoja ──────────────────────────────────────────────────────────────────────
export default function HojaCobrar({ proyectos, onCampo, onRegistrarPago, onEditarPago, onAnularPago }: Props) {
  // Proyecto con una fila de pago nuevo abierta
  const [nuevoEn, setNuevoEn] = useState<string | null>(null);

  const totales = proyectos.reduce((a, p) => ({
    total: a.total + (p.total || 0), pagado: a.pagado + (p.monto_pagado || 0), pendiente: a.pendiente + Math.max(0, p.monto_pendiente || 0),
  }), { total: 0, pagado: 0, pendiente: 0 });

  const th = 'text-left text-[10.5px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-2.5 whitespace-nowrap';
  const tdP = 'px-1 py-0.5 align-top border-r border-gray-100';
  const tdPago = 'px-1 py-0.5';

  async function guardarPago(p: ProyectoCont, pago: PagoProyecto, cambio: Partial<DatosPago>) {
    const nuevo: DatosPago = { fecha: pago.fecha, monto: pago.monto, medio: pago.medio, operacion: pago.operacion, nota: pago.nota, ...cambio };
    // Fila "sin detalle": se crea su línea en el historial sin volver a sumar
    if (pago.estimado) {
      return onRegistrarPago(p.id, { ...nuevo, monto: pago.monto, nota: nuevo.nota === 'Pago sin detalle en el historial' ? '' : nuevo.nota, sin_sumar: true });
    }
    return onEditarPago(p.id, pago.linea, nuevo);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 text-[11.5px] text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
        <span>Haz clic en una celda para editarla · <kbd className="font-sans">Enter</kbd> guarda y baja · <kbd className="font-sans">Esc</kbd> deshace</span>
        <span>Pagado y pendiente se calculan con los pagos · el cliente se edita en Clientes</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className={`${th} pl-3 sticky left-0 z-[2] bg-gray-50`}>Proyecto</th>
              <th className={th}>Cliente</th>
              <th className={`${th} text-right`}>Total</th>
              <th className={`${th} text-right`}>Pagado</th>
              <th className={`${th} text-right`}>Pendiente</th>
              <th className={th}>Inicio</th>
              <th className={th}>Entrega</th>
              <th className={`${th} border-r border-gray-200`}>F. cobro</th>
              <th className={`${th} bg-emerald-50`}>Fecha pago</th>
              <th className={`${th} bg-emerald-50 text-right`}>Monto</th>
              <th className={`${th} bg-emerald-50`}>Medio</th>
              <th className={`${th} bg-emerald-50`}>N° op.</th>
              <th className={`${th} bg-emerald-50`}>Nota</th>
              <th className={`${th} bg-emerald-50 w-16`} aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {proyectos.map((p, ip) => {
              const pagos = p.pagos || [];
              const abierto = nuevoEn === p.id;
              const filas = Math.max(1, pagos.length + (abierto ? 1 : 0));
              const zebra = ip % 2 ? 'bg-gray-50/40' : '';
              const pendiente = Math.max(0, p.monto_pendiente || 0);
              const celdasProyecto = (
                <>
                  <td rowSpan={filas} className={`${tdP} pl-2 min-w-[200px] sticky left-0 z-[1] bg-white`}>
                    <Celda col="proyecto" valor={p.proyecto} negrita titulo="Nombre del proyecto"
                      onGuardar={v => v ? onCampo(p.id, 'proyecto', v) : false} />
                    <div className="flex items-center gap-2 px-2 pb-1">
                      {p.notion_url && (
                        <a href={p.notion_url} target="_blank" rel="noopener noreferrer" className="text-[10.5px] text-gray-300 hover:text-gray-600 inline-flex items-center gap-0.5">
                          Notion <ExternalLink size={9} />
                        </a>
                      )}
                      {!abierto && (
                        <button onClick={() => setNuevoEn(p.id)} className="text-[10.5px] font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-0.5">
                          <Plus size={10} /> Pago
                        </button>
                      )}
                    </div>
                  </td>
                  <td rowSpan={filas} className={`${tdP} text-[12.5px] text-gray-500 px-3 py-2 min-w-[130px] max-w-[180px]`} title="El cliente se edita en Clientes">
                    {p.cliente || '—'}
                  </td>
                  <td rowSpan={filas} className={`${tdP} w-28`}>
                    <Celda col="total" tipo="monto" valor={p.total ? String(p.total) : ''} negrita placeholder="0.00" titulo="Total del proyecto"
                      onGuardar={v => onCampo(p.id, 'monto_total', v ? Math.round(parseMonto(v) * 100) / 100 : null)} />
                  </td>
                  <td rowSpan={filas} className={`${tdP} text-[12.5px] text-right tabular-nums text-emerald-600 px-3 py-2 w-28`}>{fmt(p.monto_pagado || 0)}</td>
                  <td rowSpan={filas} className={`${tdP} text-[12.5px] text-right tabular-nums font-semibold px-3 py-2 w-28 ${pendiente > 0 ? 'text-rose-500' : 'text-gray-300'}`}>{fmt(pendiente)}</td>
                  <td rowSpan={filas} className={`${tdP} w-[136px]`}>
                    <Celda col="inicio" tipo="fecha" valor={p.fecha_inicio?.slice(0, 10) || ''} titulo="Fecha de inicio"
                      onGuardar={v => onCampo(p.id, 'fecha_inicio', v || null)} />
                  </td>
                  <td rowSpan={filas} className={`${tdP} w-[136px]`}>
                    <Celda col="entrega" tipo="fecha" valor={p.fecha_entrega?.slice(0, 10) || ''} titulo="Fecha de entrega"
                      onGuardar={v => onCampo(p.id, 'fecha_entrega', v || null)} />
                  </td>
                  <td rowSpan={filas} className={`${tdP} w-[136px] border-r-gray-200`}>
                    <Celda col="cobro" tipo="fecha" valor={p.fecha_cobro?.slice(0, 10) || ''} titulo="Fecha de cobro"
                      onGuardar={v => onCampo(p.id, 'fecha_cobro', v || null)} />
                  </td>
                </>
              );

              const filasPago = pagos.map((pg, i) => {
                const guardando = !pg.estimado && !pg.linea; // recién registrado, aún sin su línea de Notion
                const t = pg.estimado ? 'Pago sumado en Monto Pagado sin detalle: completa los datos para crear su línea' : undefined;
                return (
                  <tr key={`${p.id}-${i}-${pg.linea}`} className={`${zebra} ${i === 0 ? 'border-t border-gray-200' : ''}`}>
                    {i === 0 && celdasProyecto}
                    <td className={`${tdPago} w-[136px]`}>
                      <Celda col="pfecha" tipo="fecha" valor={pg.fecha} deshabilitada={guardando} titulo={t || 'Fecha del pago'}
                        onGuardar={v => v ? guardarPago(p, pg, { fecha: v }) : false} />
                    </td>
                    <td className={`${tdPago} w-28`}>
                      <Celda col="pmonto" tipo="monto" valor={String(pg.monto)} deshabilitada={guardando || pg.estimado}
                        titulo={pg.estimado ? 'El monto sin detalle sale de Monto Pagado' : 'Monto del pago'}
                        onGuardar={v => parseMonto(v) > 0 ? guardarPago(p, pg, { monto: Math.round(parseMonto(v) * 100) / 100 }) : false} />
                    </td>
                    <td className={`${tdPago} w-32`}>
                      <Celda col="pmedio" tipo="medio" valor={pg.medio} deshabilitada={guardando} titulo={t || 'Medio de pago'}
                        onGuardar={v => guardarPago(p, pg, { medio: v })} />
                    </td>
                    <td className={`${tdPago} w-32`}>
                      <Celda col="pop" valor={pg.operacion} deshabilitada={guardando} titulo={t || 'N° de operación del voucher (lo usa contabilidad para ubicar el pago)'}
                        placeholder={pg.medio === 'Efectivo' ? '—' : 'Falta N° op.'} resaltar={!pg.operacion && pg.medio !== 'Efectivo'}
                        onGuardar={v => guardarPago(p, pg, { operacion: v })} />
                    </td>
                    <td className={`${tdPago} min-w-[180px]`}>
                      <Celda col="pnota" valor={pg.estimado ? '' : pg.nota} deshabilitada={guardando}
                        placeholder={pg.estimado ? 'Sin detalle — completar' : '—'} titulo={t || 'Nota'}
                        onGuardar={v => guardarPago(p, pg, { nota: v })} />
                    </td>
                    <td className={`${tdPago} text-center`}>
                      {pg.estimado ? (
                        <span className="text-[9.5px] font-bold uppercase text-amber-600 bg-amber-50 rounded px-1.5 py-0.5" title={t}>Sin detalle</span>
                      ) : guardando ? (
                        <span className="text-[10px] text-gray-400">Guardando…</span>
                      ) : (
                        <button onClick={() => onAnularPago(p.id, pg.linea, pg.monto)} title="Anular este pago" aria-label="Anular pago"
                          className="p-1.5 rounded-md text-gray-300 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                );
              });

              const filaNueva = abierto ? (
                <tr key={`${p.id}-nuevo`} className={`${zebra} ${pagos.length === 0 ? 'border-t border-gray-200' : ''}`}>
                  {pagos.length === 0 && celdasProyecto}
                  <FilaNuevoPago proyecto={p} onCancelar={() => setNuevoEn(null)} onGuardar={d => onRegistrarPago(p.id, d)} />
                </tr>
              ) : null;

              if (pagos.length === 0 && !abierto) {
                return (
                  <tr key={p.id} className={`${zebra} border-t border-gray-200`}>
                    {celdasProyecto}
                    <td colSpan={6} className="px-3 py-2">
                      <button onClick={() => setNuevoEn(p.id)} className="text-[12px] text-gray-400 hover:text-emerald-600 inline-flex items-center gap-1">
                        <Plus size={12} /> Sin pagos · añadir el primero
                      </button>
                    </td>
                  </tr>
                );
              }
              return [...filasPago, filaNueva];
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 text-[12.5px] font-bold text-gray-800">
              <td className="px-3 py-2.5" colSpan={2}>{proyectos.length} proyectos</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totales.total)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{fmt(totales.pagado)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-rose-500">{fmt(totales.pendiente)}</td>
              <td colSpan={9} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

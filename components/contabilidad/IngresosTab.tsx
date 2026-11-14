'use client';

// Pestaña "Ingresos": lo cobrado en el periodo (cada pago por su fecha real),
// lo vendido y lo pendiente, con resumen mensual y exportación a Excel.

import { useMemo, useState } from 'react';
import { Download, Wallet, TrendingUp, Clock, Receipt, Info } from 'lucide-react';
import { formatCurrency, hoyLima } from '@/lib/utils';
import { descargarXlsx, type Hoja } from '@/lib/xlsx';
import type { PagoProyecto } from '@/lib/pagos';
import { extractoLibroBancos, hojaExtracto } from '@/lib/libroBancos';
import { type ProyectoCont, MESES_CORTO, fechaVenta, etiquetaPeriodo, enPeriodo, fechaCorta } from './tipos';
import Selector from '@/components/ui/Selector';

const fmt = (n: number) => formatCurrency(n);

export default function IngresosTab({ proyectos }: { proyectos: ProyectoCont[] }) {
  const hoy = hoyLima();
  const [modo, setModo] = useState<'mes' | 'ano' | 'todo'>('mes');
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [ano, setAno] = useState(hoy.slice(0, 4));
  const periodo = modo === 'mes' ? mes : modo === 'ano' ? ano : '';

  const pagos: PagoProyecto[] = useMemo(
    () => proyectos.flatMap(p => p.pagos || []).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [proyectos],
  );
  const anos = useMemo(() => {
    const set = new Set<string>([hoy.slice(0, 4)]);
    pagos.forEach(p => set.add(p.fecha.slice(0, 4)));
    proyectos.forEach(p => { const f = fechaVenta(p); if (f) set.add(f.slice(0, 4)); });
    return Array.from(set).sort().reverse();
  }, [pagos, proyectos, hoy]);

  const pagosPeriodo = pagos.filter(p => enPeriodo(p.fecha, periodo));
  const vendidos = proyectos.filter(p => enPeriodo(fechaVenta(p), periodo));
  const cobrado = pagosPeriodo.reduce((a, p) => a + p.monto, 0);
  const vendido = vendidos.reduce((a, p) => a + (p.total || 0), 0);
  const pendienteVendidos = vendidos.reduce((a, p) => a + Math.max(0, p.monto_pendiente || 0), 0);
  const estimados = pagosPeriodo.filter(p => p.estimado);

  // Resumen mensual del año visible (o del año actual en modo histórico)
  const anoResumen = modo === 'mes' ? mes.slice(0, 4) : modo === 'ano' ? ano : hoy.slice(0, 4);
  const resumen = MESES_CORTO.map((nombre, i) => {
    const clave = `${anoResumen}-${String(i + 1).padStart(2, '0')}`;
    const c = pagos.filter(p => p.fecha.startsWith(clave)).reduce((a, p) => a + p.monto, 0);
    const v = proyectos.filter(p => fechaVenta(p).startsWith(clave)).reduce((a, p) => a + (p.total || 0), 0);
    return { clave, nombre, cobrado: c, vendido: v };
  });
  const maxResumen = Math.max(1, ...resumen.map(r => Math.max(r.cobrado, r.vendido)));

  function exportar(alcance: 'periodo' | 'historico') {
    const per = alcance === 'periodo' ? periodo : '';
    const ps = pagos.filter(p => enPeriodo(p.fecha, per)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const vs = proyectos.filter(p => enPeriodo(fechaVenta(p), per));
    const hojas: Hoja[] = [
      {
        nombre: 'Pagos recibidos',
        columnas: [
          { titulo: 'Fecha', formato: 'fecha', ancho: 12 }, { titulo: 'Proyecto', ancho: 34 }, { titulo: 'Cliente', ancho: 28 },
          { titulo: 'Medio', ancho: 14 }, { titulo: 'N° operación', ancho: 16 }, { titulo: 'Nota', ancho: 30 },
          { titulo: 'Registrado por', ancho: 18 }, { titulo: 'Monto', formato: 'moneda', ancho: 14 },
        ],
        filas: ps.map(p => [p.fecha, p.proyecto, p.cliente, p.medio, p.operacion, p.estimado ? 'Pago sin detalle (dif. Monto Pagado)' : p.nota, p.usuario, p.monto]),
        totales: ['', 'TOTAL COBRADO', '', '', '', '', '', ps.reduce((a, p) => a + p.monto, 0)],
      },
      {
        nombre: 'Proyectos',
        columnas: [
          { titulo: 'Proyecto', ancho: 34 }, { titulo: 'Cliente', ancho: 28 }, { titulo: 'RUC', ancho: 14 },
          { titulo: 'Inicio', formato: 'fecha', ancho: 12 }, { titulo: 'Entrega', formato: 'fecha', ancho: 12 },
          { titulo: 'Total', formato: 'moneda', ancho: 14 }, { titulo: 'Pagado', formato: 'moneda', ancho: 14 },
          { titulo: 'Pendiente', formato: 'moneda', ancho: 14 }, { titulo: 'Estado de pago', ancho: 14 },
          { titulo: 'N° pagos', ancho: 10 }, { titulo: 'Encargado', ancho: 16 },
        ],
        filas: vs.map(p => [p.proyecto, p.cliente, p.ruc, p.fecha_inicio || '', p.fecha_entrega || '', p.total || 0, p.monto_pagado || 0,
          Math.max(0, p.monto_pendiente || 0), p.estado_pago, (p.pagos || []).length, p.encargado]),
        totales: ['TOTAL', '', '', '', '', vs.reduce((a, p) => a + (p.total || 0), 0), vs.reduce((a, p) => a + (p.monto_pagado || 0), 0),
          vs.reduce((a, p) => a + Math.max(0, p.monto_pendiente || 0), 0), '', '', ''],
      },
    ];
    // Mismo formato que el "Libro Auxiliar Bancos" de contabilidad (solo ingresos)
    hojas.splice(1, 0, hojaExtracto(extractoLibroBancos(proyectos, per), per));
    // Resumen por mes de todos los meses con movimiento
    const meses = new Set<string>();
    ps.forEach(p => meses.add(p.fecha.slice(0, 7)));
    vs.forEach(p => { const f = fechaVenta(p); if (f) meses.add(f.slice(0, 7)); });
    const filasMes = Array.from(meses).sort().map(m => {
      const c = ps.filter(p => p.fecha.startsWith(m)).reduce((a, p) => a + p.monto, 0);
      const v = vs.filter(p => fechaVenta(p).startsWith(m)).reduce((a, p) => a + (p.total || 0), 0);
      return [etiquetaPeriodo(m), c, v, ps.filter(p => p.fecha.startsWith(m)).length];
    });
    hojas.push({
      nombre: 'Resumen mensual',
      columnas: [{ titulo: 'Mes', ancho: 18 }, { titulo: 'Cobrado', formato: 'moneda', ancho: 16 }, { titulo: 'Vendido', formato: 'moneda', ancho: 16 }, { titulo: 'N° pagos', ancho: 10 }],
      filas: filasMes,
      totales: ['TOTAL', filasMes.reduce((a, f) => a + (f[1] as number), 0), filasMes.reduce((a, f) => a + (f[2] as number), 0), filasMes.reduce((a, f) => a + (f[3] as number), 0)],
    });
    const nombre = alcance === 'historico' ? 'historico' : (per || 'historico');
    descargarXlsx(`Idealo-ingresos-${nombre}-${hoy}`, hojas);
  }

  const sel = 'text-[13px] border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] bg-white text-gray-700';

  return (
    <div className="space-y-4">
      {/* Selector de periodo + exportar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-0.5">
          {([['mes', 'Mes'], ['ano', 'Año'], ['todo', 'Histórico']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setModo(k)}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors ${modo === k ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
        {modo === 'mes' && <input type="month" value={mes} max={hoy.slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} className={sel} aria-label="Mes" />}
        {modo === 'ano' && (
          <Selector value={ano} onChange={e => setAno(e.target.value)} className={sel} aria-label="Año">
            {anos.map(a => <option key={a}>{a}</option>)}
          </Selector>
        )}
        <div className="flex-1" />
        <button onClick={() => exportar('periodo')}
          className="text-[13px] font-semibold px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors">
          <Download size={14} /> Excel · {etiquetaPeriodo(periodo)}
        </button>
        {modo !== 'todo' && (
          <button onClick={() => exportar('historico')}
            className="text-[13px] font-medium px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-gray-300 flex items-center gap-1.5">
            <Download size={14} /> Excel histórico
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: `Cobrado · ${etiquetaPeriodo(periodo)}`, value: fmt(cobrado), sub: `${pagosPeriodo.length} pago${pagosPeriodo.length === 1 ? '' : 's'}`, icon: Wallet, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' },
          { label: 'Vendido en el periodo', value: fmt(vendido), sub: `${vendidos.length} proyecto${vendidos.length === 1 ? '' : 's'}`, icon: TrendingUp, color: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10' },
          { label: 'Pendiente de lo vendido', value: fmt(pendienteVendidos), sub: 'aún por cobrar', icon: Clock, color: pendienteVendidos > 0 ? 'bg-rose-50 text-rose-500 dark:bg-rose-500/10' : 'bg-gray-50 text-gray-400 dark:bg-gray-800' },
          { label: 'Ticket promedio', value: vendidos.length ? fmt(vendido / vendidos.length) : '—', sub: 'por proyecto vendido', icon: Receipt, color: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2.5 ${color}`}><Icon size={14} /></div>
            <p className="text-[20px] font-bold text-gray-900 dark:text-gray-100 tracking-tight">{value}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
            <p className="text-[10px] text-gray-400">{sub}</p>
          </div>
        ))}
      </div>

      {estimados.length > 0 && (
        <div className="flex items-start gap-2 text-[12px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-3 py-2.5">
          <Info size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            {estimados.length} pago{estimados.length === 1 ? '' : 's'} sin detalle ({fmt(estimados.reduce((a, p) => a + p.monto, 0))}):
            el &quot;Monto Pagado&quot; de esos proyectos es mayor que su historial, así que la diferencia se ubicó en su fecha de cobro.
            Para que cuadre con el banco, anúlalo y regístralo con su fecha real desde &quot;Por cobrar&quot; (activa &quot;ver saldados&quot;).
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Lista de pagos */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Pagos recibidos · {etiquetaPeriodo(periodo)}</p>
            <p className="text-sm font-bold text-emerald-600">{fmt(cobrado)}</p>
          </div>
          {pagosPeriodo.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <Wallet size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No hay pagos registrados en este periodo</p>
              <p className="text-xs mt-1">Registra los abonos desde la pestaña &quot;Por cobrar&quot; o con la conciliación bancaria</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {['Fecha', 'Proyecto', 'Medio', 'N° op.', 'Monto'].map(h => (
                      <th key={h} className={`text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2.5 ${h === 'Monto' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagosPeriodo.map((p, i) => (
                    <tr key={`${p.proyecto_id}-${i}`} className="border-t border-gray-50 dark:border-gray-800">
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fechaCorta(p.fecha)}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-800 dark:text-gray-100 truncate max-w-[260px]">{p.proyecto}</p>
                        <p className="text-[11px] text-gray-400 truncate max-w-[260px]">
                          {p.cliente}{p.nota ? ` · ${p.nota}` : ''}
                          {p.estimado && <span className="ml-1 text-amber-600 font-semibold">· sin detalle</span>}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{p.medio || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-[12px]">{p.operacion || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap">{fmt(p.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Resumen mensual del año */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-1">Mes a mes · {anoResumen}</p>
          <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-3">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Cobrado</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />Vendido</span>
          </div>
          <div className="space-y-2">
            {resumen.map(r => (
              <button key={r.clave} onClick={() => { setModo('mes'); setMes(r.clave); }}
                className={`w-full text-left group rounded-lg px-1.5 py-1 transition-colors ${modo === 'mes' && mes === r.clave ? 'bg-yellow-50 dark:bg-yellow-500/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-gray-600 dark:text-gray-300 w-8">{r.nombre}</span>
                  <span className="text-gray-500">{r.cobrado ? fmt(r.cobrado) : '—'}</span>
                </div>
                <div className="space-y-0.5">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${(r.cobrado / maxResumen) * 100}%`, minWidth: r.cobrado ? 2 : 0 }} />
                  <div className="h-1 rounded-full bg-slate-300 dark:bg-slate-600" style={{ width: `${(r.vendido / maxResumen) * 100}%`, minWidth: r.vendido ? 2 : 0 }} />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between text-xs">
            <span className="text-gray-500">Total cobrado {anoResumen}</span>
            <span className="font-bold text-emerald-600">{fmt(resumen.reduce((a, r) => a + r.cobrado, 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

// Extracto de los cobros del OS con el formato del Libro Auxiliar Bancos de
// contabilidad (N°, fecha, operación, detalle, deudor). Se ve en pantalla igual
// que el libro y se descarga en Excel para revisarlo al lado del libro.

import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { formatCurrency, hoyLima } from '@/lib/utils';
import { descargarXlsx } from '@/lib/xlsx';
import { extractoLibroBancos, hojaExtracto, periodoLibro, EMPRESA } from '@/lib/libroBancos';
import { type ProyectoCont, fechaCorta } from './tipos';
import Selector from '@/components/ui/Selector';

const fmt = (n: number) => formatCurrency(n);

export default function ExtractoLibroBancos({ proyectos }: { proyectos: ProyectoCont[] }) {
  const hoy = hoyLima();
  // Meses con cobros (más reciente primero) y años, para elegir el periodo
  const { meses, anos } = useMemo(() => {
    const m = new Set<string>([hoy.slice(0, 7)]);
    proyectos.forEach(p => (p.pagos || []).forEach(x => m.add(x.fecha.slice(0, 7))));
    const meses = Array.from(m).sort().reverse();
    return { meses, anos: Array.from(new Set(meses.map(x => x.slice(0, 4)))) };
  }, [proyectos, hoy]);
  const [periodo, setPeriodo] = useState(hoy.slice(0, 7));

  const filas = useMemo(() => extractoLibroBancos(proyectos, periodo), [proyectos, periodo]);
  const total = filas.reduce((a, f) => a + f.deudor, 0);
  const sinOp = filas.filter(f => !f.operacion).length;

  function descargar() {
    descargarXlsx(`LIBRO_BANCOS_OS_${periodoLibro(periodo).replace(/\s+/g, '_')}`, [hojaExtracto(filas, periodo)]);
  }

  const th = 'text-left text-[10.5px] font-bold text-[#1f2937] uppercase tracking-wide px-3 py-2 whitespace-nowrap';

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3 border-b border-gray-100 dark:border-gray-800">
        <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><FileSpreadsheet size={17} /></span>
        <div className="flex-1 min-w-[220px]">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">1 · Extracto del OS en formato Libro Bancos</h2>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400">Los cobros registrados, con las mismas columnas del libro de contabilidad (solo ingresos).</p>
        </div>
        <Selector value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Periodo"
          className="text-[13px] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[#ffc500]">
          <optgroup label="Mes">
            {meses.map(m => <option key={m} value={m}>{periodoLibro(m)}</option>)}
          </optgroup>
          <optgroup label="Año completo">
            {anos.map(a => <option key={a} value={a}>{periodoLibro(a)}</option>)}
          </optgroup>
        </Selector>
        <button onClick={descargar} disabled={!filas.length}
          className="text-[13px] font-semibold px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 disabled:opacity-40">
          <Download size={14} /> Descargar Excel
        </button>
      </div>

      {/* Cabecera como en el libro */}
      <div className="px-4 sm:px-5 py-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
        <span className="font-bold text-gray-700 dark:text-gray-300">PERIODO:</span><span className="text-gray-700 dark:text-gray-300">{periodoLibro(periodo)}</span>
        <span className="font-bold text-gray-700 dark:text-gray-300">RUC:</span><span className="text-gray-700 dark:text-gray-300">{EMPRESA.ruc}</span>
        <span className="font-bold text-gray-700 dark:text-gray-300">RAZÓN SOCIAL:</span><span className="text-gray-700 dark:text-gray-300">{EMPRESA.razonSocial}</span>
      </div>

      {sinOp > 0 && (
        <p className="mx-4 sm:mx-5 mb-3 text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span><strong>{sinOp} {sinOp === 1 ? 'cobro no tiene' : 'cobros no tienen'} N° de operación.</strong> Agrégalo desde Por cobrar → Hoja (columna N° op.) para que contabilidad lo ubique en el banco.</span>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="bg-[#ffc500]">
              <th className={`${th} w-12 text-center`}>N°</th>
              <th className={`${th} w-32`}>Fecha de la operación</th>
              <th className={`${th} w-32`}>Operación</th>
              <th className={th}>Detalle de la operación</th>
              <th className={`${th} w-32 text-right`}>Deudor</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[13px] text-gray-400">No hay cobros registrados en {periodoLibro(periodo).toLowerCase()}.</td></tr>
            )}
            {filas.map(f => (
              <tr key={`${f.pago.proyecto_id}-${f.n}`} className="border-b border-gray-100 dark:border-gray-800 text-[12.5px] hover:bg-gray-50/60">
                <td className="px-3 py-2 text-center text-gray-400 tabular-nums">{f.n}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 tabular-nums">{fechaCorta(f.fecha)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {f.operacion
                    ? <span className="font-mono text-gray-800 dark:text-gray-200">{f.operacion}</span>
                    : <span className="text-[10.5px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">Falta N° op.</span>}
                </td>
                <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                  {f.detalle}
                  {f.pago.estimado && <span className="ml-2 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5" title="Monto Pagado sin línea en el historial">sin detalle</span>}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmt(f.deudor)}</td>
              </tr>
            ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-800/60 text-[12.5px] font-bold text-gray-900 dark:text-gray-100">
                <td colSpan={4} className="px-3 py-2.5 text-right">TOTAL INGRESOS · {filas.length} {filas.length === 1 ? 'cobro' : 'cobros'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

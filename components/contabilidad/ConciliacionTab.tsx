'use client';

// Pestaña "Libro Bancos" (solo administradores).
//   1. Extracto del OS con el formato del Libro Bancos (ver ExtractoLibroBancos).
//   2. Comparativa: se sube el Libro Bancos de contabilidad (o el estado de cuenta) (Excel .xlsx o CSV) o se pegan las filas copiadas
// del banco/Excel. El sistema toma los INGRESOS, los cruza con los pagos
// registrados en el OS y muestra:
//   ✓ conciliados · ⚠ en el banco pero sin registrar · ⚠ registrados pero no en el banco
// Cada ingreso sin registrar se puede asignar a un proyecto con un clic: se
// registra el pago con la fecha, monto y nº de operación del banco.

import { useMemo, useRef, useState } from 'react';
import {
  Upload, ClipboardPaste, CheckCircle2, AlertTriangle, HelpCircle, Download, X, Search, Landmark, ArrowRight,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { leerXlsx, leerTextoTabla, descargarXlsx } from '@/lib/xlsx';
import {
  detectarColumnas, interpretarEstadoCuenta, conciliar, sugerirProyectos,
  type ColumnasEstado, type MovimientoBanco,
} from '@/lib/conciliacion';
import RegistrarPago, { type DatosPago } from './RegistrarPago';
import { type ProyectoCont, fechaCorta } from './tipos';
import { useNotify } from '@/components/ui/Feedback';
import ExtractoLibroBancos from './ExtractoLibroBancos';
import { comparativa, hojaComparativa, ETIQUETA_ESTADO, type EstadoComparativa } from '@/lib/libroBancos';
import Selector from '@/components/ui/Selector';

const fmt = (n: number) => formatCurrency(n);
const sumarDias = (f: string, d: number) => new Date(Date.parse(f + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);

type PropsTab = {
  proyectos: ProyectoCont[];
  onRegistrarPago: (proyectoId: string, d: DatosPago) => Promise<boolean>;
};

export default function ConciliacionTab(props: PropsTab) {
  return (
    <div className="space-y-4">
      <ExtractoLibroBancos proyectos={props.proyectos} />
      <Comparacion {...props} />
    </div>
  );
}

function Comparacion({ proyectos, onRegistrarPago }: PropsTab) {
  const notify = useNotify();
  // Uno o varios archivos (p. ej. los libros bancos de varios meses)
  const [archivos, setArchivos] = useState<{ nombre: string; filas: (string | number)[][]; cols: ColumnasEstado | null }[]>([]);
  const filas = archivos.length ? archivos[0].filas : null;
  const cols = archivos.length ? archivos[0].cols : null;
  const setCols = (fn: (c: ColumnasEstado | null) => ColumnasEstado | null) =>
    setArchivos(a => a.length ? [{ ...a[0], cols: fn(a[0].cols) }, ...a.slice(1)] : a);
  const archivo = archivos.length === 1 ? archivos[0].nombre : `${archivos.length} archivos`;
  // Movimientos que el usuario marca como "no es cobro de proyecto" (o vuelve a incluir)
  const [exclusionManual, setExclusionManual] = useState<Record<string, boolean>>({});
  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState('');
  const [asignando, setAsignando] = useState<MovimientoBanco | null>(null);
  const [asignados, setAsignados] = useState<Record<string, string>>({}); // id movimiento → proyecto
  const inputRef = useRef<HTMLInputElement>(null);

  function cargarFilas(f: (string | number)[][], nombre: string) {
    const c = detectarColumnas(f);
    setArchivos([{ nombre, filas: f, cols: c }]); setAsignados({}); setExclusionManual({});
    if (!c) notify.info('No reconocí las columnas automáticamente: elígelas abajo.');
  }

  async function leerArchivo(file: File): Promise<(string | number)[][] | null> {
    if (/\.xlsx$/i.test(file.name)) return leerXlsx(await file.arrayBuffer());
    if (/\.(csv|txt|tsv)$/i.test(file.name)) return leerTextoTabla(await file.text());
    if (/\.xls$/i.test(file.name)) notify.error(`${file.name}: formato .xls antiguo. Ábrelo en Excel y guárdalo como .xlsx.`);
    else notify.error(`${file.name}: sube un .xlsx o .csv`);
    return null;
  }

  async function onArchivos(lista: FileList) {
    const nuevos: { nombre: string; filas: (string | number)[][]; cols: ColumnasEstado | null }[] = [];
    for (const file of Array.from(lista)) {
      try {
        const f = await leerArchivo(file);
        if (!f) continue;
        const c = detectarColumnas(f);
        if (!c && lista.length > 1) { notify.error(`${file.name}: no reconocí sus columnas`); continue; }
        nuevos.push({ nombre: file.name, filas: f, cols: c });
      } catch (e: any) {
        notify.error(`No se pudo leer ${file.name}: ${e.message}`);
      }
    }
    if (!nuevos.length) return;
    setArchivos(nuevos); setAsignados({}); setExclusionManual({});
    if (nuevos.length === 1 && !nuevos[0].cols) notify.info('No reconocí las columnas automáticamente: elígelas abajo.');
  }

  // Todos los ingresos de todos los archivos; los préstamos (y lo que el usuario
  // marque) quedan como excluidos y no se concilian.
  const movimientos = useMemo(() => archivos.flatMap((a, ai) =>
    (a.cols ? interpretarEstadoCuenta(a.filas, a.cols) : []).map(m => ({ ...m, id: `${ai}-${m.id}` })),
  ).map(m => {
    const manual = exclusionManual[m.id];
    if (manual === true) return { ...m, excluido: m.excluido || 'Marcado como no cobro' };
    if (manual === false) return { ...m, excluido: undefined };
    return m;
  }), [archivos, exclusionManual]);
  const excluidos = movimientos.filter(m => m.excluido);
  const rango = useMemo(() => {
    if (!movimientos.length) return null;
    const fechas = movimientos.map(m => m.fecha).sort();
    return { desde: fechas[0], hasta: fechas[fechas.length - 1] };
  }, [movimientos]);

  const resultado = useMemo(() => {
    if (!rango) return null;
    const todos = proyectos.flatMap(p => p.pagos || []);
    // Margen de 4 días para emparejar pagos anotados con fecha cercana
    const candidatos = todos.filter(p => p.fecha >= sumarDias(rango.desde, -4) && p.fecha <= sumarDias(rango.hasta, 4));
    const r = conciliar(movimientos, candidatos);
    // "Solo en el sistema" se limita al periodo exacto del estado de cuenta
    r.soloSistema = r.soloSistema.filter(p => p.fecha >= rango.desde && p.fecha <= rango.hasta);
    return r;
  }, [movimientos, proyectos, rango]);

  const pendientesBanco = (resultado?.soloBanco || []).filter(m => !asignados[m.id]);


  const filasComparativa = useMemo(
    () => resultado ? comparativa(resultado, excluidos, proyectos) : [],
    [resultado, excluidos, proyectos],
  );

  function exportar() {
    if (!resultado || !rango) return;
    descargarXlsx(`COMPARATIVA_LIBRO_BANCOS_${rango.desde}_a_${rango.hasta}`, [hojaComparativa(filasComparativa, rango.desde, rango.hasta)]);
  }

  // ── Sin archivo: pantalla de carga ─────────────────────────────────────────
  if (!filas) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
        <div className="max-w-xl mx-auto text-center">
          <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 flex items-center justify-center mx-auto mb-3"><Landmark size={22} /></div>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">2 · Comparar con el Libro Bancos de contabilidad</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
            Sube el <strong>Libro Bancos</strong> que llena contabilidad (uno o varios meses). Cada ingreso del libro
            (DEUDOR) se pone al lado del cobro del OS que le corresponde: verás qué cuadra, qué ingreso no se sabe
            de qué proyecto es y qué cobro del OS no aparece en el libro.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-6">
            <button onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-[#ffc500] hover:bg-yellow-50/40 dark:hover:bg-yellow-500/5 transition-colors">
              <Upload size={20} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Subir Libro Bancos</span>
              <span className="text-[11px] text-gray-400">.xlsx · puedes elegir varios meses · también sirve el estado de cuenta</span>
            </button>
            <button onClick={() => setPegando(true)}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-[#ffc500] hover:bg-yellow-50/40 dark:hover:bg-yellow-500/5 transition-colors">
              <ClipboardPaste size={20} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Pegar movimientos</span>
              <span className="text-[11px] text-gray-400">copiados del banco o de Excel (con encabezados)</span>
            </button>
          </div>
          <input ref={inputRef} type="file" multiple accept=".xlsx,.csv,.txt,.tsv,.xls" className="hidden"
            onChange={e => { if (e.target.files?.length) onArchivos(e.target.files); e.target.value = ''; }} />
          {pegando && (
            <div className="mt-4 text-left">
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={7} autoFocus
                placeholder={'Fecha\tDescripción\tMonto\n15/06/2026\tTRANSF ANDES FOODS\t1,250.50'}
                className="w-full text-xs font-mono border border-gray-200 dark:border-gray-700 dark:bg-gray-950 rounded-xl p-3 focus:outline-none focus:border-[#ffc500]" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setPegando(false); setTexto(''); }} className="flex-1 text-sm py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500">Cancelar</button>
                <button onClick={() => texto.trim() && cargarFilas(leerTextoTabla(texto), 'Movimientos pegados')}
                  className="flex-1 text-sm font-bold py-2 rounded-xl bg-[#ffc500] hover:bg-[#e6b000] text-white">Analizar</button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-5">
            Se reconoce el Libro Auxiliar Bancos de Idealo y los formatos de los bancos (BCP, Interbank, BBVA…).
            Solo se usan los ingresos; los préstamos se excluyen solos. El archivo no se guarda en ningún lado.
          </p>
        </div>
      </div>
    );
  }

  const encabezados = cols ? filas[cols.filaEncabezado] : filas[0];
  const opcionesCol = (encabezados || []).map((h, i) => ({ i, l: String(h || `Columna ${i + 1}`) }));
  const selCol = (k: keyof ColumnasEstado, label: string) => (
    <label className="text-[11px] text-gray-500 dark:text-gray-400">
      {label}
      <Selector value={cols ? (cols[k] as number) : -1}
        onChange={e => setCols(c => ({ ...(c || { fecha: -1, descripcion: -1, operacion: -1, relacion: -1, monto: -1, abono: -1, cargo: -1, filaEncabezado: 0 }), [k]: Number(e.target.value) }))}
        className="block mt-1 w-full text-xs border border-gray-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-2 py-1.5">
        <option value={-1}>—</option>
        {opcionesCol.map(o => <option key={o.i} value={o.i}>{o.l}</option>)}
      </Selector>
    </label>
  );

  return (
    <div className="space-y-4">
      {/* Cabecera del archivo */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-wrap items-center gap-3">
        <Landmark size={18} className="text-sky-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{archivo}</p>
          <p className="text-[11px] text-gray-400">
            {rango ? `${movimientos.length} ingresos del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)} · total ${fmt(resultado?.totalBanco || 0)}` : 'Sin ingresos reconocidos'}
          </p>
        </div>
        {resultado && (
          <button onClick={exportar} className="text-[13px] font-semibold px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5">
            <Download size={14} /> Descargar comparativa
          </button>
        )}
        <button onClick={() => { setArchivos([]); setTexto(''); setPegando(false); }}
          className="text-[13px] px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300">
          Cambiar archivo
        </button>
      </div>

      {/* Mapeo de columnas (si no se detectó o para corregir) */}
      <details open={!cols || movimientos.length === 0} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
        <summary className="text-[12px] font-semibold text-gray-600 dark:text-gray-300 cursor-pointer">Columnas del estado de cuenta</summary>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
          {selCol('fecha', 'Fecha')}
          {selCol('descripcion', 'Descripción')}
          {selCol('abono', 'Abono / ingreso')}
          {selCol('monto', 'Monto (con signo)')}
          {selCol('cargo', 'Cargo / egreso')}
          {selCol('operacion', 'N° operación')}
        </div>
        <label className="text-[11px] text-gray-500 dark:text-gray-400 block mt-3">
          Fila de encabezados
          <input type="number" min={1} value={(cols?.filaEncabezado ?? 0) + 1}
            onChange={e => setCols(c => c ? { ...c, filaEncabezado: Math.max(0, Number(e.target.value) - 1) } : c)}
            className="ml-2 w-16 text-xs border border-gray-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-2 py-1" />
        </label>
      </details>

      {resultado && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Cuadran con el OS', n: resultado.conciliados.length, monto: resultado.conciliados.reduce((a, c) => a + c.banco.monto, 0), icon: CheckCircle2, tono: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10' },
              { label: 'En el libro, no registrados en el OS', n: pendientesBanco.length, monto: pendientesBanco.reduce((a, m) => a + m.monto, 0), icon: AlertTriangle, tono: pendientesBanco.length ? 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' : 'text-gray-400 bg-gray-50 dark:bg-gray-800' },
              { label: 'En el OS, no están en el libro', n: resultado.soloSistema.length, monto: resultado.soloSistema.reduce((a, p) => a + p.monto, 0), icon: HelpCircle, tono: resultado.soloSistema.length ? 'text-rose-500 bg-rose-50 dark:bg-rose-500/10' : 'text-gray-400 bg-gray-50 dark:bg-gray-800' },
            ].map(({ label, n, monto, icon: Icon, tono }) => (
              <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-3">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${tono}`}><Icon size={18} /></span>
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{n} · {fmt(monto)}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
                </div>
              </div>
            ))}
          </div>

          <TablaComparativa filas={filasComparativa} asignados={asignados}
            onAsignar={m => setAsignando(m)} onExcluir={(id, v) => setExclusionManual(x => ({ ...x, [id]: v }))} />

        </>
      )}

      {asignando && (
        <ModalAsignar mov={asignando} proyectos={proyectos} onClose={() => setAsignando(null)}
          onRegistrar={async (p, d) => {
            const ok = await onRegistrarPago(p.id, d);
            if (ok) {
              setAsignados(a => ({ ...a, [asignando.id]: p.proyecto }));
              setAsignando(null);
            }
            return ok;
          }} />
      )}
    </div>
  );
}

const ESTILO_ESTADO: Record<EstadoComparativa, string> = {
  cuadra: 'text-emerald-700 bg-emerald-50',
  falta_os: 'text-amber-700 bg-amber-50',
  falta_libro: 'text-rose-600 bg-rose-50',
  excluido: 'text-gray-500 bg-gray-100',
};

// Comparativa lado a lado: columnas del libro (izquierda) y del OS (derecha)
function TablaComparativa({ filas, asignados, onAsignar, onExcluir }: {
  filas: ReturnType<typeof comparativa>;
  asignados: Record<string, string>;
  onAsignar: (m: MovimientoBanco) => void;
  onExcluir: (id: string, excluir: boolean) => void;
}) {
  const [filtro, setFiltro] = useState<EstadoComparativa | ''>('');
  const cuenta = (e: EstadoComparativa) => filas.filter(f => f.estado === e).length;
  const visibles = filtro ? filas.filter(f => f.estado === filtro) : filas;
  const th = 'text-left text-[10px] font-bold uppercase tracking-wide px-2.5 py-2 whitespace-nowrap';
  const td = 'px-2.5 py-2 align-top';
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mr-2">Comparativa: Libro Bancos ↔ OS</h3>
        {([['', 'Todo', filas.length], ...(['cuadra', 'falta_os', 'falta_libro', 'excluido'] as EstadoComparativa[]).map(e => [e, ETIQUETA_ESTADO[e], cuenta(e)])] as [EstadoComparativa | '', string, number][])
          .map(([k, l, n]) => (
            <button key={k || 'todo'} onClick={() => setFiltro(k)}
              className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${filtro === k ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-500 border-gray-200 hover:border-gray-300'}`}>
              {l} <span className="opacity-60">{n}</span>
            </button>
          ))}
      </div>
      <div className="overflow-x-auto max-h-[70vh]">
        <table className="w-full min-w-[1320px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <th className={`${th} bg-gray-50 text-gray-400`} colSpan={2} />
              <th className={`${th} bg-sky-50 text-sky-700 text-center`} colSpan={3}>Libro Bancos (contabilidad)</th>
              <th className={`${th} bg-emerald-50 text-emerald-700 text-center`} colSpan={3}>OS (pagos registrados)</th>
              <th className={`${th} bg-gray-50`} colSpan={2} />
            </tr>
            <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <th className={`${th} w-10 text-center`}>N°</th>
              <th className={`${th} w-24`}>Fecha</th>
              <th className={`${th} w-24`}>Operación</th>
              <th className={`${th} min-w-[240px]`}>Detalle de la operación</th>
              <th className={`${th} w-24 text-right border-r border-gray-200`}>Deudor</th>
              <th className={`${th} w-24`}>Operación</th>
              <th className={`${th} min-w-[240px]`}>Detalle (proyecto)</th>
              <th className={`${th} w-24 text-right border-r border-gray-200`}>Deudor</th>
              <th className={`${th} w-40`}>Estado</th>
              <th className={`${th} w-44`} />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Nada en este filtro</td></tr>}
            {visibles.map(f => {
              const opDistinta = f.libro && f.os && f.libro.operacion && f.os.operacion
                && f.libro.operacion.replace(/^0+/, '') !== f.os.operacion.replace(/^0+/, '');
              return (
                <tr key={`${f.estado}-${f.n}`} className={`border-b border-gray-100 dark:border-gray-800 ${f.estado === 'excluido' ? 'opacity-60' : ''}`}>
                  <td className={`${td} text-center text-gray-400 tabular-nums`}>{f.n}</td>
                  <td className={`${td} tabular-nums text-gray-600`}>{fechaCorta(f.fecha)}</td>
                  <td className={`${td} font-mono text-gray-700`}>{f.libro?.operacion || (f.libro ? '—' : '')}</td>
                  <td className={`${td} text-gray-800 dark:text-gray-200`}>{f.libro?.detalle || (f.libro ? '—' : <span className="text-gray-300">—</span>)}</td>
                  <td className={`${td} text-right font-semibold tabular-nums border-r border-gray-100 ${f.estado === 'excluido' ? 'line-through' : ''}`}>{f.libro ? fmt(f.libro.deudor) : ''}</td>
                  <td className={`${td} font-mono ${opDistinta ? 'text-rose-600' : 'text-gray-700'}`} title={opDistinta ? 'N° de operación distinto al del libro' : undefined}>
                    {f.os ? (f.os.operacion || <span className="font-sans text-[10px] font-semibold text-amber-700 bg-amber-50 rounded px-1">falta</span>) : ''}
                  </td>
                  <td className={`${td} text-gray-800 dark:text-gray-200`}>{f.os?.detalle || ''}</td>
                  <td className={`${td} text-right font-semibold tabular-nums border-r border-gray-100`}>{f.os ? fmt(f.os.deudor) : ''}</td>
                  <td className={td}>
                    <span className={`inline-block whitespace-nowrap text-[10.5px] font-bold rounded px-1.5 py-0.5 ${ESTILO_ESTADO[f.estado]}`}>{ETIQUETA_ESTADO[f.estado]}</span>
                    {f.nota && f.estado !== 'falta_os' && <p className="text-[10.5px] text-gray-400 mt-0.5">{f.nota}</p>}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {f.estado === 'falta_os' && f.libro && (asignados[f.libro.mov.id]
                      ? <span className="text-[11px] font-semibold text-emerald-600">→ {asignados[f.libro.mov.id]}</span>
                      : <span className="inline-flex gap-1">
                          <button onClick={() => onExcluir(f.libro!.mov.id, true)} title="No es el cobro de un proyecto (préstamo, devolución, aporte…)"
                            className="text-[11px] font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300">No es cobro</button>
                          <button onClick={() => onAsignar(f.libro!.mov)} title="Registrar este ingreso como pago de un proyecto"
                            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#ffc500] hover:bg-[#e6b000] text-white">Asignar</button>
                        </span>)}
                    {f.estado === 'excluido' && f.libro && (
                      <button onClick={() => onExcluir(f.libro!.mov.id, false)} className="text-[11px] font-semibold text-[#b8890b] hover:underline">Incluir</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModalAsignar({ mov, proyectos, onClose, onRegistrar }: {
  mov: MovimientoBanco; proyectos: ProyectoCont[]; onClose: () => void;
  onRegistrar: (p: ProyectoCont, d: DatosPago) => Promise<boolean>;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<ProyectoCont | null>(null);
  const sugeridos = useMemo(() => sugerirProyectos(mov, proyectos.filter(p => p.monto_pendiente > 0)).slice(0, 6), [mov, proyectos]);
  const q = busqueda.trim().toLowerCase();
  const lista = q
    ? proyectos.filter(p => `${p.proyecto} ${p.cliente}`.toLowerCase().includes(q)).slice(0, 20)
    : sugeridos;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="asignar-titulo" className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-start gap-3">
          <div className="flex-1">
            <h2 id="asignar-titulo" className="text-base font-bold text-gray-900 dark:text-gray-100">Asignar ingreso a un proyecto</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">{fechaCorta(mov.fecha)} · {mov.descripcion} · <strong>{fmt(mov.monto)}</strong></p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {!elegido ? (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar proyecto o cliente…"
                  className="w-full pl-8 pr-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-950 rounded-xl focus:outline-none focus:border-[#ffc500]" />
              </div>
              {!q && <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Sugeridos (saldo pendiente / nombre en la descripción)</p>}
              <div className="space-y-1.5">
                {lista.length === 0 && <p className="text-[12px] text-gray-400 py-4 text-center">Sin coincidencias. Busca por nombre del proyecto o cliente.</p>}
                {lista.map(p => (
                  <button key={p.id} onClick={() => setElegido(p)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-[#ffc500] hover:bg-yellow-50/40 dark:hover:bg-yellow-500/5 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.proyecto}</p>
                      <p className="text-[11px] text-gray-400 truncate">{p.cliente || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[12px] font-bold ${p.monto_pendiente > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{p.monto_pendiente > 0 ? fmt(p.monto_pendiente) : 'Saldado'}</p>
                      <p className="text-[10px] text-gray-400">pendiente</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{elegido.proyecto}</p>
                  <p className="text-[11px] text-gray-500">{elegido.cliente} · pendiente {fmt(Math.max(0, elegido.monto_pendiente))}</p>
                </div>
                <button onClick={() => setElegido(null)} className="text-[12px] text-gray-500 hover:text-gray-800">Cambiar</button>
              </div>
              <RegistrarPago compacto pendiente={Math.max(0, elegido.monto_pendiente)} textoBoton="Registrar y conciliar"
                inicial={{ monto: mov.monto, fecha: mov.fecha, medio: mov.medio || 'Transferencia', operacion: mov.operacion, nota: (mov.descripcion || mov.relacion).slice(0, 80) }}
                onRegistrar={d => onRegistrar(elegido, d)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

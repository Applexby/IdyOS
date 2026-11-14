'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils';
import { ExternalLink, RefreshCw, FileText, Search, Copy, Check, Send, X, FileDown, Calendar, ChevronDown, Loader2, User } from 'lucide-react';
import { Toast, useToast } from './Toast';
import DatePicker from '@/components/ui/DatePicker';
import Selector from '@/components/ui/Selector';

interface Cotizacion {
  id: string; numero_cotizacion: string; cliente_nombre: string;
  documento_identidad: string; monto_total: number; fecha_emision: string;
  url_pdf: string | null; estado: string; creado_por: string; periodo: string; canal: string;
}

function ModalDetalle({ cot, onClose }: { cot: Cotizacion; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [bajando, setBajando] = useState(false);

  // Descarga forzada: trae el PDF como blob y lo dispara con <a download>.
  // Igual que en el formulario de generación: Cloudinary sirve los PDFs como
  // "inline" (el navegador los abre), así que los convertimos a blob local
  // para forzar la descarga real en vez de solo abrirlos.
  const descargarPDF = async () => {
    if (!cot.url_pdf) return;
    setBajando(true);
    try {
      const resp = await fetch(cot.url_pdf);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `Cotizacion_${cot.numero_cotizacion}_${(cot.cliente_nombre || 'cliente').replace(/\s+/g, '_').slice(0, 20)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(cot.url_pdf, '_blank');
    } finally {
      setBajando(false);
    }
  };
  const msg = cot.url_pdf ? encodeURIComponent(`Hola ${cot.cliente_nombre}, le reenviamos la *Cotización ${cot.numero_cotizacion}* de Idealo Films S.A.C.:\n\n${cot.url_pdf} 🎬`) : '';

  const estadoClr = (e: string) => ({ GANADO: 'text-green-700 bg-green-50 border-green-200', Enviada: 'text-blue-700 bg-blue-50 border-blue-200', Aceptada: 'text-amber-700 bg-amber-50 border-amber-200', Rechazada: 'text-red-700 bg-red-50 border-red-200' } as any)[e] || 'text-gray-500 bg-gray-50 border-gray-200';

  return (
    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div><p className="text-sm font-bold text-gray-900">{cot.numero_cotizacion || 'Proyecto'}</p><p className="text-[10px] text-gray-400 mt-0.5">{cot.fecha_emision || '—'}</p></div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs border border-gray-100">
            {cot.cliente_nombre && <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="font-semibold text-gray-800">{cot.cliente_nombre}</span></div>}
            {cot.documento_identidad && <div className="flex justify-between"><span className="text-gray-500">RUC / DNI</span><span className="font-mono text-gray-700">{cot.documento_identidad}</span></div>}
            {cot.monto_total > 0 && <div className="flex justify-between"><span className="text-gray-500">Monto</span><span className="font-bold text-[#ffc500] text-sm">{formatCurrency(cot.monto_total)}</span></div>}
            {cot.estado && <div className="flex justify-between items-center"><span className="text-gray-500">Estado</span><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${estadoClr(cot.estado)}`}>{cot.estado}</span></div>}
            {cot.creado_por && <div className="flex justify-between"><span className="text-gray-500">Generado por</span><span className="text-gray-600">{cot.creado_por}</span></div>}
          </div>
          {cot.url_pdf ? (
            <div className="grid grid-cols-2 gap-2">
              <a href={cot.url_pdf} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#ffc500] hover:bg-[#e6b000] text-white text-xs font-semibold py-2.5 rounded-xl shadow-sm transition-all"><ExternalLink size={13} /> Ver PDF</a>
              <button onClick={() => { navigator.clipboard.writeText(cot.url_pdf!); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2.5 rounded-xl transition-all">
                {copied ? <><Check size={13} className="text-green-500" /> Copiado</> : <><Copy size={13} /> Copiar enlace</>}
              </button>
              <button onClick={descargarPDF} disabled={bajando} className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2.5 rounded-xl transition-all disabled:opacity-60">{bajando ? <><Loader2 size={13} className="animate-spin" /> Bajando...</> : <><FileDown size={13} /> Descargar</>}</button>
              <a href={`https://wa.me/?text=${msg}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-semibold py-2.5 rounded-xl shadow-sm transition-all">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
            </div>
          ) : <div className="text-center py-3 bg-gray-50 rounded-xl border border-gray-100"><p className="text-xs text-gray-400">Sin PDF generado</p></div>}
        </div>
      </div>
    </div>
  );
}

// D4 — Estado de la cotización, derivado del estado del lead en Notion
// (sin campos nuevos): Ganado = aceptada, Perdido = rechazada.
type EstadoCot = 'Enviada' | 'En negociación' | 'Aceptada' | 'Rechazada';
function estadoCotizacion(estadoLead: string): EstadoCot {
  if (estadoLead === 'GANADO') return 'Aceptada';
  if (estadoLead === 'PERDIDO') return 'Rechazada';
  if (estadoLead === 'Negociacion') return 'En negociación';
  return 'Enviada';
}
const ESTADOS_COT: EstadoCot[] = ['Enviada', 'En negociación', 'Aceptada', 'Rechazada'];
const ESTILO_COT: Record<EstadoCot, string> = {
  'Enviada': 'text-sky-700 bg-sky-50', 'En negociación': 'text-violet-700 bg-violet-50',
  'Aceptada': 'text-emerald-700 bg-emerald-50', 'Rechazada': 'text-rose-700 bg-rose-50',
};

export default function HistorialTable() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [filtered, setFiltered] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCreador, setFiltroCreador] = useState('');
  const [soloConPdf, setSoloConPdf] = useState(false);
  const [detalle, setDetalle] = useState<Cotizacion | null>(null);
  const [showFiltros, setShowFiltros] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/notion/cotizaciones');
      const d = await r.json();
      if (d.success) { setCotizaciones(d.cotizaciones); setFiltered(d.cotizaciones); }
      else showToast(`Error: ${d.error}`, 'error');
    } catch (e: any) { showToast(`Error: ${e.message}`, 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Todos los filtros menos el de estado (el resumen por estado se calcula sobre esto)
  const [sinFiltroEstado, setSinFiltroEstado] = useState<Cotizacion[]>([]);
  useEffect(() => {
    let r = cotizaciones;
    if (search) { const q = search.toLowerCase(); r = r.filter(c => c.cliente_nombre?.toLowerCase().includes(q) || c.numero_cotizacion?.toLowerCase().includes(q) || c.documento_identidad?.includes(q) || c.periodo?.toLowerCase().includes(q) || c.creado_por?.toLowerCase().includes(q)); }
    if (fechaDesde) r = r.filter(c => c.fecha_emision >= fechaDesde);
    if (fechaHasta) r = r.filter(c => c.fecha_emision <= fechaHasta);
    if (filtroCreador) r = r.filter(c => c.creado_por === filtroCreador);
    if (soloConPdf) r = r.filter(c => c.url_pdf);
    setSinFiltroEstado(r);
    setFiltered(filtroEstado ? r.filter(c => estadoCotizacion(c.estado) === filtroEstado) : r);
  }, [search, fechaDesde, fechaHasta, filtroEstado, filtroCreador, soloConPdf, cotizaciones]);

  const filteredTotal = filtered.reduce((acc, c) => acc + (c.monto_total || 0), 0);
  const hayFiltros = search || fechaDesde || fechaHasta || filtroEstado || filtroCreador || soloConPdf;
  // Lista de creadores únicos (para el filtro), tomada de los datos cargados
  const creadores = [...new Set(cotizaciones.map(c => c.creado_por).filter(Boolean))].sort();
  const inp = "bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-200/50 focus:border-amber-400 transition-all";


  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {detalle && <ModalDetalle cot={detalle} onClose={() => setDetalle(null)} />}

      <div className="bg-gray-100/60 min-h-full p-6 space-y-4">
        {/* Header limpio (sin barra de stats al entrar) */}
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Cotizaciones realizadas</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {cotizaciones.length} proyectos · {filtered.length} en vista
            {filtered.length !== cotizaciones.length && <span> · {formatCurrency(filteredTotal)}</span>}
          </p>
        </div>

        {/* D4 — Resumen por estado (clic para filtrar) */}
        {!loading && cotizaciones.length > 0 && (() => {
          const base = sinFiltroEstado;
          const conteo = (e: EstadoCot) => base.filter(c => estadoCotizacion(c.estado) === e);
          const acept = conteo('Aceptada'), rech = conteo('Rechazada');
          const tasa = acept.length + rech.length > 0 ? Math.round((acept.length / (acept.length + rech.length)) * 100) : null;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {ESTADOS_COT.map(e => {
                const lista = conteo(e);
                return (
                  <button key={e} onClick={() => setFiltroEstado(f => f === e ? '' : e)}
                    className={`text-left bg-white rounded-2xl border p-3 transition-colors ${filtroEstado === e ? 'border-[#ffc500] ring-2 ring-yellow-100' : 'border-gray-100 hover:border-gray-200'}`}>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ESTILO_COT[e]}`}>{e}</span>
                    <p className="text-lg font-bold text-gray-900 mt-1.5">{lista.length}</p>
                    <p className="text-[11px] text-gray-400">{formatCurrency(lista.reduce((a, c) => a + (c.monto_total || 0), 0))}</p>
                  </button>
                );
              })}
              <div className="bg-white rounded-2xl border border-gray-100 p-3">
                <span className="text-[10px] font-semibold text-gray-500">Tasa de aceptación</span>
                <p className="text-lg font-bold text-gray-900 mt-1.5">{tasa !== null ? `${tasa}%` : '—'}</p>
                <p className="text-[11px] text-gray-400">aceptadas / (aceptadas + rechazadas)</p>
              </div>
            </div>
          );
        })()}

        {/* Búsqueda */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Buscar por cliente, empresa, N° cotización..." value={search} onChange={e => setSearch(e.target.value)} className={`${inp} w-full pl-9 py-2.5`} />
            </div>
            <button onClick={() => setShowFiltros(!showFiltros)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${showFiltros || hayFiltros ? 'border-amber-300 text-[#ffc500] bg-amber-50' : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'}`}>
              <Calendar size={13} /> Filtros {hayFiltros && <span className="w-1.5 h-1.5 rounded-full bg-[#ffc500]" />}
              <ChevronDown size={12} className={`transition-transform ${showFiltros ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={load} disabled={loading} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all disabled:opacity-40">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          {showFiltros && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div><label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Desde</label><DatePicker value={fechaDesde} borrable onChange={v => setFechaDesde(v)} /></div>
                <div><label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Hasta</label><DatePicker value={fechaHasta} borrable onChange={v => setFechaHasta(v)} /></div>
                <div><label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Estado</label>
                  <Selector value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={`${inp} w-full`}>
                    <option value="">Todos</option>
                    {ESTADOS_COT.map(e => <option key={e}>{e}</option>)}
                  </Selector>
                </div>
                <div><label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Creado por</label>
                  <Selector value={filtroCreador} onChange={e => setFiltroCreador(e.target.value)} className={`${inp} w-full`}>
                    <option value="">Todos</option>
                    {creadores.map(u => <option key={u}>{u}</option>)}
                  </Selector>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={soloConPdf} onChange={e => setSoloConPdf(e.target.checked)} className="rounded accent-amber-500" /><span className="text-xs text-gray-500">Solo proyectos con PDF generado</span></label>
                {hayFiltros && <button onClick={() => { setSearch(''); setFechaDesde(''); setFechaHasta(''); setFiltroEstado(''); setFiltroCreador(''); setSoloConPdf(false); }} className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1"><X size={11} /> Limpiar</button>}
              </div>
            </div>
          )}
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-200 border-t-[#ffc500] rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto"><FileText size={20} className="text-gray-300" /></div>
              <p className="text-sm text-gray-400">{hayFiltros ? 'Sin resultados para los filtros.' : 'No hay proyectos en Notion.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-50 bg-gray-50/50">
                  {[['Proyecto', ''], ['Cliente', ''], ['Monto', ''], ['Fecha', 'hidden md:table-cell'], ['Estado', ''], ['Creado por', 'hidden sm:table-cell'], ['PDF', '']].map(([h, cls]) => (
                    <th key={h} className={`text-left px-5 py-3.5 text-[10px] font-bold tracking-wider text-gray-400 uppercase ${cls}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(c => (
                    <tr key={c.id} onClick={() => setDetalle(c)} className="hover:bg-amber-50/30 transition-colors cursor-pointer">
                      <td className="px-5 py-4"><span className="text-[11px] font-bold font-mono text-[#ffc500] bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">{c.numero_cotizacion || '—'}</span><p className="text-[10px] text-gray-400 mt-1">{c.periodo || ''}</p></td>
                      <td className="px-5 py-4"><p className="text-sm font-medium text-gray-800 truncate max-w-[150px]">{c.cliente_nombre || '—'}</p>{c.documento_identidad && <p className="text-[10px] text-gray-400 font-mono mt-0.5">{c.documento_identidad}</p>}</td>
                      <td className="px-5 py-4">{c.monto_total > 0 ? <span className="text-sm font-bold text-gray-800">{formatCurrency(c.monto_total)}</span> : <span className="text-xs text-gray-300">—</span>}</td>
                      <td className="px-5 py-4 hidden md:table-cell"><span className="text-xs text-gray-500 whitespace-nowrap">{c.fecha_emision ? c.fecha_emision.slice(0, 10).split('-').reverse().join('/') : '—'}</span></td>
                      <td className="px-5 py-4"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ESTILO_COT[estadoCotizacion(c.estado)]}`}>{estadoCotizacion(c.estado)}</span></td>
                      <td className="px-5 py-4 hidden sm:table-cell">{c.creado_por ? <span className="inline-flex items-center gap-1 text-xs text-gray-600"><User size={11} className="text-gray-400" />{c.creado_por}</span> : <span className="text-xs text-gray-300">—</span>}</td>
                      <td className="px-5 py-4">{c.url_pdf ? <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">✓ PDF</span> : <span className="text-[10px] text-gray-300">sin PDF</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-400 text-center">Clic en cualquier fila para ver detalles y acciones</p>
      </div>
    </>
  );
}

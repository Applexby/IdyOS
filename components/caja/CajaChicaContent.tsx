'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, X, Trash2, RefreshCw, Edit2,
  Wallet, Calendar, History,
} from 'lucide-react';
import { formatCurrency, hoyLima } from '@/lib/utils';
import DatePicker from '@/components/ui/DatePicker';

const CATEGORIAS = ['Transporte', 'Equipos', 'Otros'];
const CAT_STYLE: Record<string, string> = {
  Transporte: 'bg-gray-100 text-gray-600',
  Equipos: 'bg-sky-50 text-sky-600',
  Otros: 'bg-amber-50 text-amber-700',
};

interface Mov {
  id: string; url: string; descripcion: string; categoria: string;
  tipo: string; monto: number; fecha: string | null; created: string;
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function claveMes(fecha: string | null, created: string): string {
  const d = fecha ? new Date(fecha + 'T12:00:00') : new Date(created);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function etiquetaMes(clave: string): string {
  const [y, m] = clave.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export default function CajaChicaContent() {
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vista, setVista] = useState<'mes' | 'historico'>('mes');
  const [modal, setModal] = useState<{ tipo: string } | null>(null);
  const [editMov, setEditMov] = useState<Mov | null>(null);

  const cargar = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const r = await fetch('/api/notion/caja');
      const d = await r.json();
      if (d.movimientos) setMovs(d.movimientos);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function eliminar(m: Mov) {
    setMovs(prev => prev.filter(x => x.id !== m.id));
    await fetch('/api/notion/caja', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: m.id }) });
  }

  // Agrupar por mes
  const porMes: Record<string, Mov[]> = {};
  for (const m of movs) {
    const k = claveMes(m.fecha, m.created);
    (porMes[k] = porMes[k] || []).push(m);
  }
  const mesesOrdenados = Object.keys(porMes).sort().reverse();

  // Saldo: el correcto es el del mes vigente (el "TOTAL DE CAJA" de cada mes ya
  // arrastra el saldo anterior, así que NO se suman todos los meses).
  const saldoDe = (lista: Mov[]) => lista.reduce((s, m) => s + (m.tipo === 'Ingreso' ? m.monto : -m.monto), 0);
  const mesActualKey = mesesOrdenados[0];
  const saldoActual = mesActualKey ? saldoDe(porMes[mesActualKey]) : 0;

  // Qué meses mostrar según la vista
  const mesesVisibles = vista === 'mes' ? mesesOrdenados.slice(0, 1) : mesesOrdenados;

  return (
    <div className="flex flex-col h-full bg-gray-100/60 min-h-screen">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Caja Chica</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">Registro rápido de pagos pequeños internos</p>
          </div>
          <button onClick={() => cargar(true)} disabled={refreshing}
            className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Saldo actual */}
        <div className="mb-4">
          <div className="inline-flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04)] px-5 py-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center"><Wallet size={18} className="text-[#ffc500]" /></div>
            <div>
              <p className={`text-[26px] font-bold tracking-tight leading-none ${saldoActual >= 0 ? 'text-gray-900' : 'text-rose-500'}`}>{formatCurrency(saldoActual)}</p>
              <p className="text-[11px] text-gray-400 mt-1">Saldo que queda en caja</p>
            </div>
          </div>
        </div>

        {/* Botones de registro rápido + vista */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            <button onClick={() => setModal({ tipo: 'Ingreso' })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-bold transition-colors shadow-sm">
              <ArrowDownCircle size={16} /> Ingreso
            </button>
            <button onClick={() => setModal({ tipo: 'Egreso' })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[13px] font-bold transition-colors shadow-sm">
              <ArrowUpCircle size={16} /> Egreso
            </button>
          </div>
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
            <button onClick={() => setVista('mes')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${vista === 'mes' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
              <Calendar size={14} /> Mes
            </button>
            <button onClick={() => setVista('historico')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${vista === 'historico' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
              <History size={14} /> Histórico
            </button>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : movs.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Wallet size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin movimientos aún</p>
            <p className="text-sm mt-1">Registra un ingreso o egreso con los botones de arriba</p>
          </div>
        ) : (
          <div className="space-y-5">
            {mesesVisibles.map(mesKey => {
              const items = porMes[mesKey];
              const saldoMes = saldoDe(items);
              return (
                <div key={mesKey} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04)] overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <span className="inline-block text-[13px] font-bold text-gray-700 first-letter:uppercase">{etiquetaMes(mesKey)}</span>
                    <span className={`text-[13px] font-bold ${saldoMes >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      Saldo: {formatCurrency(saldoMes)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {['Descripción', 'Categoría', 'Fecha', 'Tipo', 'Monto', ''].map(h => (
                            <th key={h} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2.5">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(m => (
                          <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors group">
                            <td className="px-4 py-3 text-[13px] font-medium text-gray-800">{m.descripcion || '—'}</td>
                            <td className="px-4 py-3">
                              {m.categoria ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${CAT_STYLE[m.categoria] || 'bg-gray-100 text-gray-500'}`}>{m.categoria}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-[12px] text-gray-500">{m.fecha ? new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ${m.tipo === 'Ingreso' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${m.tipo === 'Ingreso' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                {m.tipo}
                              </span>
                            </td>
                            <td className={`px-4 py-3 text-[13px] font-bold ${m.tipo === 'Ingreso' ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {m.tipo === 'Ingreso' ? '+' : '−'}{formatCurrency(m.monto)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditMov(m)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-gray-300 hover:text-[#ffc500] transition-all"><Edit2 size={13} /></button>
                                <button onClick={() => eliminar(m)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-rose-400 transition-all"><Trash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(modal || editMov) && (
        <MovModal
          tipoInicial={modal?.tipo || editMov?.tipo || 'Egreso'}
          mov={editMov}
          onClose={() => { setModal(null); setEditMov(null); }}
          onSaved={() => { setModal(null); setEditMov(null); cargar(true); }}
        />
      )}
    </div>
  );
}

function MovModal({ tipoInicial, mov, onClose, onSaved }: {
  tipoInicial: string; mov: Mov | null; onClose: () => void; onSaved: () => void;
}) {
  const esEdicion = !!mov;
  const [form, setForm] = useState({
    descripcion: mov?.descripcion || '',
    tipo: mov?.tipo || tipoInicial,
    categoria: mov?.categoria || 'Otros',
    monto: mov?.monto ? String(mov.monto) : '',
    fecha: mov?.fecha?.slice(0, 10) || hoyLima(),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));
  const esIngreso = form.tipo === 'Ingreso';

  async function guardar() {
    if (!form.descripcion.trim() || !form.monto || isNaN(Number(form.monto))) return;
    setSaving(true);
    try {
      if (esEdicion) {
        await fetch('/api/notion/caja', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: mov!.id, fields: form }) });
      } else {
        await fetch('/api/notion/caja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      }
      onSaved();
    } finally { setSaving(false); }
  }

  const inp = 'w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-yellow-100 transition-all';
  const lbl = 'block text-[11px] font-semibold text-gray-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${esIngreso ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
              {esIngreso ? <ArrowDownCircle size={17} /> : <ArrowUpCircle size={17} />}
            </span>
            <h2 className="text-lg font-bold text-gray-900">{esEdicion ? 'Editar movimiento' : `Nuevo ${form.tipo.toLowerCase()}`}</h2>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 p-1.5 rounded-lg transition-colors"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-3.5">
          {/* Toggle tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setForm(p => ({ ...p, tipo: 'Ingreso' }))}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-all ${esIngreso ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
              <ArrowDownCircle size={15} /> Ingreso
            </button>
            <button onClick={() => setForm(p => ({ ...p, tipo: 'Egreso' }))}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-all ${!esIngreso ? 'bg-rose-50 border-rose-300 text-rose-600' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
              <ArrowUpCircle size={15} /> Egreso
            </button>
          </div>

          <div>
            <label className={lbl}>Descripción</label>
            <input className={inp} value={form.descripcion} onChange={set('descripcion')} autoFocus placeholder="Ej. Pasaje grabación de contenido" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Monto (S/)</label>
              <input type="number" step="0.01" className={inp} value={form.monto} onChange={set('monto')} placeholder="0.00" />
            </div>
            <div>
              <label className={lbl}>Fecha</label>
              <DatePicker value={form.fecha} onChange={v => set('fecha')({ target: { value: v } } as any)} />
            </div>
          </div>

          <div>
            <label className={lbl}>Categoría</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORIAS.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, categoria: c }))}
                  className={`py-2 rounded-xl border text-[12px] font-medium transition-all ${form.categoria === c ? `${CAT_STYLE[c]} ring-1 ring-current/20` : 'border-gray-100 text-gray-400 hover:bg-gray-50'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={guardar} disabled={saving || !form.descripcion.trim() || !form.monto}
            className="flex-1 py-2.5 text-sm font-bold bg-[#ffc500] hover:bg-[#e6b000] text-gray-900 rounded-xl transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : esEdicion ? 'Guardar' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Megaphone, TrendingUp, Target, DollarSign, Users,
  ChevronDown, ChevronUp, Plus, Save, X, Award, Percent, Search, Link2, Unlink, ExternalLink,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { etapaDe } from '@/types/crm';
import { useNotify } from '@/components/ui/Feedback';
import DatePicker from '@/components/ui/DatePicker';
import Selector from '@/components/ui/Selector';

// Lead mínimo que usa este módulo (viene de /api/notion/pipeline)
interface LeadCamp {
  id: string; proyecto: string; empresa: string; cliente: string;
  estado_lead: string; origen: string; campana_vinculada_id: string | null;
  total: number | null; monto_pagado: number | null;
  fecha_contactado: string | null; created_time: string;
}

interface Campana {
  id: string;
  notion_url: string;
  nombre: string;
  canal: string;
  estado: string;
  objetivo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presupuesto: number;
  gastado: number;
  notas: string;
  leads: number;
  ganados: number;
  ingresos: number;
  leads_auto: number;
  cpl: number | null;
  cpa: number | null;
  roas: number | null;
  conversion: number | null;
}

interface Totales {
  gastado: number; leads: number; ganados: number; ingresos: number;
  cpl: number | null; cpa: number | null; roas: number | null;
}

const fmt = (n: number) => formatCurrency(n);
const CANALES = ['Meta Ads', 'Google Ads', 'TikTok Ads', 'Email', 'Orgánico'];
const OBJETIVOS = ['Leads', 'Ventas', 'Reconocimiento', 'Tráfico'];
const ESTADOS = ['Preparando', 'Activa', 'Pausada', 'Finalizada'];

const COLOR_ESTADO: Record<string, string> = {
  'Activa': 'bg-green-50 text-green-700 border-green-200',
  'Pausada': 'bg-amber-50 text-amber-700 border-amber-200',
  'Finalizada': 'bg-gray-100 text-gray-500 border-gray-200',
  'Preparando': 'bg-blue-50 text-blue-700 border-blue-200',
};

// ─── Tarjeta de campaña ───────────────────────────────────────────────────────
function CampanaCard({ campana, leads, onEdit, onVer }: {
  campana: Campana; leads: LeadCamp[]; onEdit: (c: Campana) => void; onVer: (c: Campana) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Métricas desde los leads vinculados (si los hay); si no, las de Notion (históricas/manuales)
  const vinculados = leads.filter(l => l.campana_vinculada_id === campana.id);
  const nLeads = vinculados.length || campana.leads;
  const ganadosL = vinculados.filter(l => l.estado_lead === 'GANADO');
  const nGanados = vinculados.length ? ganadosL.length : campana.ganados;
  const vendido = vinculados.length ? ganadosL.reduce((a, l) => a + (l.total || 0), 0) : campana.ingresos;
  const cobrado = ganadosL.reduce((a, l) => a + (l.monto_pagado || 0), 0);
  const cpl = nLeads > 0 && campana.gastado > 0 ? Math.round((campana.gastado / nLeads) * 100) / 100 : campana.cpl;
  const roas = campana.gastado > 0 ? Math.round(((cobrado || vendido) / campana.gastado) * 100) / 100 : campana.roas;
  const pctPresup = campana.presupuesto > 0 ? Math.round((campana.gastado / campana.presupuesto) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <button onClick={() => onVer(campana)} className="min-w-0 text-left">
            <p className="text-sm font-bold text-gray-900 truncate hover:underline">{campana.nombre}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${COLOR_ESTADO[campana.estado] || COLOR_ESTADO['Preparando']}`}>
                {campana.estado || 'Preparando'}
              </span>
              {campana.canal && <span className="text-[10px] text-gray-400">{campana.canal}</span>}
              {campana.fecha_inicio && <span className="text-[10px] text-gray-400">· {campana.fecha_inicio.slice(0, 10).split('-').reverse().join('/')}</span>}
            </div>
          </button>
          <button onClick={() => onEdit(campana)} className="text-gray-300 hover:text-gray-600 transition-colors text-xs font-medium">Editar</button>
        </div>

        {/* Métricas principales */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-sm font-bold text-gray-800">{nLeads}</p>
            <p className="text-[10px] text-gray-400">Leads</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-sm font-bold text-green-600">{nGanados}</p>
            <p className="text-[10px] text-gray-400">Ganados</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-sm font-bold text-gray-800">{cpl !== null ? `S/${cpl}` : '—'}</p>
            <p className="text-[10px] text-gray-400">CPL</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className={`text-sm font-bold ${roas !== null && roas >= 2 ? 'text-green-600' : roas !== null && roas < 1 ? 'text-red-500' : 'text-gray-800'}`}>
              {roas !== null ? `${roas}x` : '—'}
            </p>
            <p className="text-[10px] text-gray-400">ROAS</p>
          </div>
        </div>

        {/* Barra de presupuesto */}
        <div className="mb-1">
          <div className="flex justify-between text-[11px] text-gray-500 mb-1">
            <span>Gastado {fmt(campana.gastado)}</span>
            <span>{campana.presupuesto > 0 ? `de ${fmt(campana.presupuesto)}` : 'sin presupuesto'}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min(pctPresup, 100)}%`, backgroundColor: pctPresup > 100 ? '#ef4444' : pctPresup > 80 ? '#f59e0b' : '#10b981' }} />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {expanded ? 'Menos' : 'Más métricas'}
          </button>
          <button onClick={() => onVer(campana)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#b8890b] hover:underline">
            <Users size={11} /> Ver pipeline ({nLeads})
          </button>
        </div>

        {expanded && (
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
            <div><p className="text-[10px] text-gray-400">CPA (costo/cliente)</p><p className="text-sm font-bold text-gray-800">{nGanados > 0 && campana.gastado > 0 ? `S/${Math.round(campana.gastado / nGanados)}` : '—'}</p></div>
            <div><p className="text-[10px] text-gray-400">Vendido</p><p className="text-sm font-bold text-gray-800">{vendido > 0 ? fmt(vendido) : '—'}</p></div>
            <div><p className="text-[10px] text-gray-400">Cobrado</p><p className="text-sm font-bold text-green-600">{cobrado > 0 ? fmt(cobrado) : '—'}</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pipeline de una campaña (como el CRM) + vincular leads ───────────────────
const COLUMNAS_CAMP: { etapa: string; label: string; color: string }[] = [
  { etapa: 'NUEVO LEAD', label: 'Nuevo', color: 'bg-sky-500' },
  { etapa: 'CONTACTADO', label: 'Contactado', color: 'bg-violet-500' },
  { etapa: 'SEGUIMIENTO', label: 'Seguimiento', color: 'bg-amber-500' },
  { etapa: 'COTIZACION ENVIADA', label: 'Cotización', color: 'bg-fuchsia-500' },
  { etapa: 'GANADO', label: 'Ganado', color: 'bg-emerald-500' },
  { etapa: 'PERDIDO', label: 'Perdido', color: 'bg-gray-400' },
];

function ModalLeadsCampana({ campana, leads, onClose, onVincular }: {
  campana: Campana; leads: LeadCamp[]; onClose: () => void;
  onVincular: (leadId: string, campanaId: string | null) => Promise<void>;
}) {
  const [vinculando, setVinculando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const vinculados = leads.filter(l => l.campana_vinculada_id === campana.id);
  const columna = (l: LeadCamp) => {
    const e = etapaDe(l.estado_lead);
    return e === 'Negociacion' ? 'COTIZACION ENVIADA' : e;
  };
  const ganados = vinculados.filter(l => l.estado_lead === 'GANADO');
  const vendido = ganados.reduce((a, l) => a + (l.total || 0), 0);
  const cobrado = ganados.reduce((a, l) => a + (l.monto_pagado || 0), 0);
  const conversion = vinculados.length ? Math.round((ganados.length / vinculados.length) * 100) : 0;

  // Candidatos para vincular: primero los de origen "Campaña" sin campaña asignada
  const q = busqueda.trim().toLowerCase();
  const candidatos = leads
    .filter(l => l.campana_vinculada_id !== campana.id)
    .filter(l => !q || `${l.proyecto} ${l.empresa} ${l.cliente}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const pa = a.origen === 'Campaña' && !a.campana_vinculada_id ? 0 : 1;
      const pb = b.origen === 'Campaña' && !b.campana_vinculada_id ? 0 : 1;
      return pa - pb || (b.fecha_contactado || b.created_time || '').localeCompare(a.fecha_contactado || a.created_time || '');
    })
    .slice(0, 30);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="camp-titulo"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Megaphone size={16} className="text-[#ffc500]" />
              <p id="camp-titulo" className="text-base font-bold text-gray-900 truncate">{campana.nombre}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${COLOR_ESTADO[campana.estado] || COLOR_ESTADO['Preparando']}`}>{campana.estado}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Pipeline de los leads de esta campaña</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setVinculando(v => !v)}
              className={`text-[12px] font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors ${vinculando ? 'bg-gray-900 text-white' : 'bg-[#ffc500] hover:bg-[#e6b000] text-white'}`}>
              <Link2 size={13} /> {vinculando ? 'Listo' : 'Vincular leads'}
            </button>
            <button onClick={onClose} aria-label="Cerrar" className="text-gray-300 hover:text-gray-600 transition-colors"><X size={20} /></button>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/60">
          {[
            { l: 'Leads', v: String(vinculados.length) },
            { l: 'Ganados', v: String(ganados.length), c: 'text-green-600' },
            { l: 'Conversión', v: `${conversion}%` },
            { l: 'Inversión', v: fmt(campana.gastado) },
            { l: 'Vendido', v: vendido ? fmt(vendido) : '—' },
            { l: 'Cobrado', v: cobrado ? fmt(cobrado) : '—', c: 'text-green-600' },
          ].map(m => (
            <div key={m.l} className="text-center">
              <p className={`text-base font-bold ${m.c || 'text-gray-800'}`}>{m.v}</p>
              <p className="text-[10px] text-gray-400">{m.l}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {vinculando && (
            <div className="px-5 py-4 border-b border-gray-100 bg-yellow-50/40">
              <div className="relative max-w-md mb-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar lead por proyecto o cliente…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#ffc500]" />
              </div>
              <p className="text-[11px] text-gray-500 mb-2">Primero aparecen los leads con origen &quot;Campaña&quot; que aún no tienen campaña asignada.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {candidatos.map(l => (
                  <div key={l.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{l.proyecto || '(sin nombre)'}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {[l.empresa || l.cliente, l.estado_lead, l.campana_vinculada_id ? 'en otra campaña' : (l.origen || '')].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button onClick={() => onVincular(l.id, campana.id)}
                      className="text-[11px] font-bold text-[#b8890b] hover:underline flex-shrink-0">Vincular</button>
                  </div>
                ))}
                {candidatos.length === 0 && <p className="text-[12px] text-gray-400">Sin leads que coincidan.</p>}
              </div>
            </div>
          )}

          {vinculados.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Aún no hay leads vinculados a esta campaña</p>
              <p className="text-xs mt-1">Usa &quot;Vincular leads&quot; o elige esta campaña al crear un lead con origen &quot;Campaña&quot;.</p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto p-4 snap-x">
              {COLUMNAS_CAMP.map(col => {
                const items = vinculados.filter(l => columna(l) === col.etapa);
                return (
                  <div key={col.etapa} className="w-60 flex-shrink-0 snap-start bg-gray-50 rounded-2xl p-2.5">
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <span className={`w-2 h-2 rounded-full ${col.color}`} />
                      <span className="text-[12px] font-bold text-gray-700">{col.label}</span>
                      <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-100 rounded px-1.5">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map(l => (
                        <div key={l.id} className="bg-white rounded-xl border border-gray-100 p-2.5 group">
                          <p className="text-[12px] font-semibold text-gray-800 leading-snug line-clamp-2">{l.proyecto || '(sin nombre)'}</p>
                          <p className="text-[11px] text-gray-400 truncate">{l.empresa || l.cliente || '—'}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[11px] font-semibold text-gray-600">{l.total ? fmt(l.total) : ''}</span>
                            <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100">
                              <a href={`/crm?lead=${l.id}`} title="Abrir en el CRM" className="text-gray-400 hover:text-gray-700"><ExternalLink size={12} /></a>
                              <button onClick={() => onVincular(l.id, null)} title="Quitar de la campaña" aria-label="Quitar de la campaña"
                                className="text-gray-400 hover:text-rose-500"><Unlink size={12} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {items.length === 0 && <p className="text-[11px] text-gray-300 text-center py-3">—</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalCampana({ campana, onClose, onSaved }: { campana: Campana | 'nueva'; onClose: () => void; onSaved: () => void }) {
  const esNueva = campana === 'nueva';
  const c = esNueva ? null : campana as Campana;
  const [nombre, setNombre]           = useState(c?.nombre || '');
  const [canal, setCanal]             = useState(c?.canal || 'Meta Ads');
  const [objetivo, setObjetivo]       = useState(c?.objetivo || 'Leads');
  const [estado, setEstado]           = useState(c?.estado || 'Preparando');
  const [presupuesto, setPresupuesto] = useState(String(c?.presupuesto || ''));
  const [gastado, setGastado]         = useState(String(c?.gastado || ''));
  const [fechaInicio, setFechaInicio] = useState(c?.fecha_inicio || '');
  const [fechaFin, setFechaFin]       = useState(c?.fecha_fin || '');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  async function guardar() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError('');
    const payload: any = {
      nombre: nombre.trim(), canal, objetivo, estado,
      presupuesto: presupuesto ? Number(presupuesto) : null,
      gastado: gastado ? Number(gastado) : null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
    };
    try {
      const res = await fetch('/api/notion/campanas', {
        method: esNueva ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(esNueva ? payload : { pageId: c!.id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al guardar'); setSaving(false); return; }
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{esNueva ? 'Nueva campaña' : 'Editar campaña'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Nombre *</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: 260601 - Meta Ads, Campaña Navideña..."
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Canal</label>
            <Selector value={canal} onChange={e => setCanal(e.target.value)} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] bg-white">
              {CANALES.map(o => <option key={o} value={o}>{o}</option>)}
            </Selector>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Objetivo</label>
            <Selector value={objetivo} onChange={e => setObjetivo(e.target.value)} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] bg-white">
              {OBJETIVOS.map(o => <option key={o} value={o}>{o}</option>)}
            </Selector>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Presupuesto (S/)</label>
            <input type="number" value={presupuesto} onChange={e => setPresupuesto(e.target.value)} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Gastado (S/)</label>
            <input type="number" value={gastado} onChange={e => setGastado(e.target.value)} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500]" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Inicio</label>
            <DatePicker value={fechaInicio} onChange={v => setFechaInicio(v)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Fin</label>
            <DatePicker value={fechaFin} borrable onChange={v => setFechaFin(v)} />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Estado</label>
          <Selector value={estado} onChange={e => setEstado(e.target.value)} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] bg-white">
            {ESTADOS.map(o => <option key={o} value={o}>{o}</option>)}
          </Selector>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 text-sm text-gray-500 border border-gray-200 rounded-xl py-2 hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="flex-1 bg-[#ffc500] text-white text-sm font-bold rounded-xl py-2 hover:bg-[#e6b000] disabled:opacity-40 flex items-center justify-center gap-1">
            <Save size={13} /> {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
          Los leads, ganados, ingresos, CPL, CPA, ROAS y conversión se calculan solos a partir de los leads que vincules a esta campaña en el CRM. Aquí solo registras el gasto.
        </p>
      </div>
    </div>
  );
}

// ─── Módulo principal ──────────────────────────────────────────────────────────
export default function CampanasContent() {
  const [campanas, setCampanas]     = useState<Campana[]>([]);
  const [totales, setTotales]       = useState<Totales | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro]         = useState('Activa');
  const [modal, setModal]           = useState<Campana | 'nueva' | null>(null);
  const [leads, setLeads]           = useState<LeadCamp[]>([]);
  const [viendo, setViendo]         = useState<Campana | null>(null);
  const notify = useNotify();

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (filtro !== 'todos') params.set('estado', filtro);
      if (silent) { params.set('refresh', 'true'); }
      const [data, dataLeads] = await Promise.all([
        fetch(`/api/notion/campanas?${params}`).then(r => r.json()),
        fetch(`/api/notion/pipeline?solo_activos=false${silent ? '&fresh=1' : ''}`).then(r => r.json()),
      ]);
      if (data.campanas) setCampanas(data.campanas);
      if (data.totales)  setTotales(data.totales);
      if (dataLeads.leads) setLeads(dataLeads.leads);
    } finally { setLoading(false); setRefreshing(false); }
  }, [filtro]);

  // Vincular / desvincular un lead (optimista)
  async function vincular(leadId: string, campanaId: string | null) {
    const previo = leads.find(l => l.id === leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, campana_vinculada_id: campanaId, origen: campanaId ? 'Campaña' : l.origen } : l));
    const res = await fetch('/api/notion/pipeline', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: leadId, fields: campanaId ? { campana_id: campanaId, origen: 'Campaña' } : { campana_id: null } }),
    }).catch(() => null);
    if (!res || !res.ok) {
      if (previo) setLeads(prev => prev.map(l => l.id === leadId ? previo : l));
      notify.error('No se pudo actualizar la campaña del lead');
      return;
    }
    notify.success(campanaId ? 'Lead vinculado a la campaña' : 'Lead quitado de la campaña');
  }

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campañas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Métricas calculadas automáticamente desde los leads del CRM</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModal('nueva')} className="flex items-center gap-1.5 bg-[#ffc500] text-white text-sm font-bold px-3 py-2 rounded-xl hover:bg-[#e6b000] transition-colors">
            <Plus size={15} /> Nueva campaña
          </button>
          <button onClick={() => cargar(true)} disabled={refreshing} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Inversión total', value: loading ? '…' : fmt(totales?.gastado || 0), icon: DollarSign, color: 'bg-blue-50 text-blue-600' },
          { label: 'Leads generados', value: loading ? '…' : (totales?.leads || 0), icon: Users, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Clientes ganados', value: loading ? '…' : (totales?.ganados || 0), icon: Award, color: 'bg-green-50 text-green-600' },
          { label: 'CPL promedio', value: loading ? '…' : (totales?.cpl ? `S/${totales.cpl}` : '—'), icon: Target, color: 'bg-amber-50 text-amber-600' },
          { label: 'ROAS total', value: loading ? '…' : (totales?.roas ? `${totales.roas}x` : '—'), icon: TrendingUp, color: totales?.roas && totales.roas >= 2 ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2.5 ${color}`}><Icon size={14} /></div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filtro */}
      <div className="flex gap-2">
        {['todos', ...ESTADOS].map(e => (
          <button key={e} onClick={() => setFiltro(e)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors
              ${filtro === e ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {e === 'todos' ? 'Todas' : e}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" /></div>
      ) : campanas.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Megaphone size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Sin campañas</p>
          <p className="text-sm mt-1">Crea tu primera campaña y vincula leads desde el CRM para ver métricas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campanas.map(c => <CampanaCard key={c.id} campana={c} leads={leads} onEdit={setModal} onVer={setViendo} />)}
        </div>
      )}

      {viendo && <ModalLeadsCampana campana={viendo} leads={leads} onClose={() => setViendo(null)} onVincular={vincular} />}
      {modal && <ModalCampana campana={modal} onClose={() => setModal(null)} onSaved={() => cargar(true)} />}
    </div>
  );
}

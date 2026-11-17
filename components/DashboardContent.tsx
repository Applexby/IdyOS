'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatCurrency, diasDesde, hoyLima, mesLima } from '@/lib/utils';
import { cobradoPorMes, type PagoProyecto } from '@/lib/pagos';
import { useNotify } from '@/components/ui/Feedback';
import {
  FileText, TrendingUp, CheckCircle, Users, Target,
  ChevronLeft, ChevronRight, AlertTriangle, Plus,
  ArrowUpRight, ArrowDownRight, Clock, Bell, ChevronRight as ChevronR,
  DollarSign, Square, CheckSquare, MessageCircle, Check, X, Copy,
} from 'lucide-react';
import type { Lead, AccionSeguimiento } from '@/types/crm';
import { ESTADOS_ACTIVOS, etapaDe, tareaSeguimiento } from '@/types/crm';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import PanelSeguimiento from '@/components/dashboard/PanelSeguimiento';
import PanelPago from '@/components/dashboard/PanelPago';
import NuevoLeadModal from '@/components/crm/NuevoLeadModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function mesActual() { const n = new Date(); return { ano: n.getFullYear(), mes: n.getMonth() + 1 }; }
function addMes(ano: number, mes: number, delta: number) {
  const d = new Date(ano, mes - 1 + delta, 1); return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}
function mesLabel(ano: number, mes: number) {
  return new Date(ano, mes - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}
const fmt = (n: number) => formatCurrency(n);
const YELLOW = '#ffc500';
const PIE_COLORS = ['#ffc500','#6366f1','#10b981','#f97316','#8b5cf6','#ef4444','#06b6d4','#ec4899'];

function CustomTooltip({ active, payload, label, currency = false }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-xl rounded-xl px-3 py-2 text-xs">
      {label && <p className="text-gray-500 mb-1 font-medium">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {currency ? fmt(p.value) : p.value}
        </p>
      ))}
      {currency && payload[0]?.payload?.porCobrar > 0 && (
        <p className="text-red-500 font-semibold mt-0.5">Por cobrar: {fmt(payload[0].payload.porCobrar)}</p>
      )}
    </div>
  );
}

function ProgressBar({ value, max, color = YELLOW }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5">
      <div className="h-2.5 rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Tarjeta de tarea diaria ──────────────────────────────────────────────────
function TareaCard({ lead, tipo, onVer, onNuevoLead }: {
  lead: Lead; tipo: 'nuevo' | 'seguimiento';
  onVer: (l: Lead) => void;
  onNuevoLead?: () => void;
}) {
  const dias = diasDesde(lead.fecha_ultimo_contacto || lead.fecha_contactado);

  function handleClick() {
    if (tipo === 'nuevo' && onNuevoLead) { onNuevoLead(); return; }
    onVer(lead);
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm cursor-pointer active:scale-[0.99]
      ${tipo === 'seguimiento' ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-blue-50 border-blue-200 hover:bg-blue-100'}`}
      onClick={handleClick}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
        ${tipo === 'seguimiento' ? 'bg-amber-100' : 'bg-blue-100'}`}>
        {tipo === 'seguimiento' ? <Bell size={13} className="text-amber-600" /> : <Plus size={13} className="text-blue-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{lead.proyecto}</p>
        <p className="text-xs text-gray-500 truncate">
          {lead.empresa || lead.cliente || '—'}
          {tipo === 'seguimiento' && ` · ${lead.estado_lead}`}
          {tipo === 'nuevo' && ' · Click para agregar datos'}
        </p>
      </div>
      {dias !== null && tipo === 'seguimiento' && (
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0
          ${dias >= 5 ? 'bg-red-100 text-red-600' : dias >= 2 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
          {dias === 0 ? 'Hoy' : `${dias}d`}
        </span>
      )}
      <ChevronR size={13} className="text-gray-300 flex-shrink-0" />
    </div>
  );
}

// ─── PASO 1: casilla "Ya contacté hoy" ────────────────────────────────────────
// Marca la casilla → dispara mensaje_enviado → desaparece (reaparece mañana para reportar).
function TareaContactar({ lead, onAccion, onVer, atrasado = false }: {
  lead: Lead;
  onAccion: (id: string, accion: AccionSeguimiento, extra?: any) => Promise<void>;
  onVer: (l: Lead) => void;
  atrasado?: boolean;
}) {
  const [marcando, setMarcando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const dias = diasDesde(lead.fecha_ultimo_contacto || lead.fecha_contactado);

  async function marcar(e: React.MouseEvent) {
    e.stopPropagation();
    if (marcando) return;
    setMarcando(true);
    try { await onAccion(lead.id, 'mensaje_enviado'); }
    catch { setMarcando(false); }
  }

  function openWA(e: React.MouseEvent) {
    e.stopPropagation();
    if (!lead.telefono) return;
    const num = lead.telefono.replace(/\D/g, '');
    window.open(`https://wa.me/${num.startsWith('51') ? num : '51' + num}`, '_blank');
  }
  function copyTel(e: React.MouseEvent) {
    e.stopPropagation();
    if (!lead.telefono) return;
    navigator.clipboard.writeText(lead.telefono);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className={`p-3 rounded-xl border transition-all cursor-pointer active:scale-[0.99]
      ${atrasado ? 'bg-red-50 border-red-200 hover:bg-red-100' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
      onClick={() => onVer(lead)}>
      <div className="flex items-center gap-3">
        {/* Casilla */}
        <button onClick={marcar} disabled={marcando}
          className={`flex-shrink-0 transition-colors disabled:opacity-50 ${atrasado ? 'text-red-500 hover:text-red-700' : 'text-amber-500 hover:text-amber-700'}`}
          title="Marcar: ya lo contacté hoy">
          {marcando ? <CheckSquare size={20} /> : <Square size={20} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{lead.proyecto}</p>
          <p className="text-xs text-gray-500 truncate">
            {[lead.cliente, lead.empresa].filter(Boolean).join(' · ') || '—'} · {etapaDe(lead.estado_lead)}
          </p>
        </div>
        {atrasado && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-red-100 text-red-700">
            Atrasado
          </span>
        )}
        {dias !== null && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0
            ${dias >= 5 ? 'bg-red-100 text-red-600' : dias >= 2 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
            {dias === 0 ? 'Hoy' : `${dias}d`}
          </span>
        )}
      </div>
      {/* Teléfono con WhatsApp + copiar (para buscar el número desde otro equipo) */}
      {lead.telefono && (
        <div className="flex items-center gap-2 mt-2 pl-8">
          <span className="text-xs text-gray-600 font-medium">{lead.telefono}</span>
          <button onClick={openWA} className="text-emerald-600 hover:text-emerald-700 p-1 hover:bg-emerald-50 rounded-md transition-colors" title="WhatsApp">
            <MessageCircle size={13} />
          </button>
          <button onClick={copyTel} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-md transition-colors" title="Copiar número">
            {copiado ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── PASO 2: reportar qué pasó con el contacto del/los día(s) anterior(es) ─────
// Botones Respondió / No respondió → resuelve el ciclo y reprograma siguiente seg.
function TareaReportar({ lead, onAccion, onVer }: {
  lead: Lead;
  onAccion: (id: string, accion: AccionSeguimiento, extra?: any) => Promise<void>;
  onVer: (l: Lead) => void;
}) {
  const [procesando, setProcesando] = useState<'respondio' | 'no_respondio' | null>(null);
  const [copiado, setCopiado] = useState(false);
  const desde = (lead as any).contactado_hoy
    ? diasDesde((lead as any).contactado_hoy)
    : null;

  async function reportar(e: React.MouseEvent, accion: 'respondio' | 'no_respondio') {
    e.stopPropagation();
    if (procesando) return;
    setProcesando(accion);
    try { await onAccion(lead.id, accion); }
    catch { setProcesando(null); }
  }

  function openWA(e: React.MouseEvent) {
    e.stopPropagation();
    if (!lead.telefono) return;
    const num = lead.telefono.replace(/\D/g, '');
    window.open(`https://wa.me/${num.startsWith('51') ? num : '51' + num}`, '_blank');
  }
  function copyTel(e: React.MouseEvent) {
    e.stopPropagation();
    if (!lead.telefono) return;
    navigator.clipboard.writeText(lead.telefono);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="p-3 rounded-xl border bg-indigo-50 border-indigo-200">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => onVer(lead)}>
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <MessageCircle size={13} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{lead.proyecto}</p>
          <p className="text-xs text-gray-500 truncate">
            {[lead.cliente, lead.empresa].filter(Boolean).join(' · ') || '—'}
            {desde !== null && ` · contactado hace ${desde === 1 ? '1 día' : `${desde} días`}`}
          </p>
        </div>
      </div>
      {/* Teléfono para identificar al lead */}
      {lead.telefono && (
        <div className="flex items-center gap-2 mt-2 pl-11">
          <span className="text-xs text-gray-600 font-medium">{lead.telefono}</span>
          <button onClick={openWA} className="text-emerald-600 hover:text-emerald-700 p-1 hover:bg-emerald-50 rounded-md transition-colors" title="WhatsApp">
            <MessageCircle size={13} />
          </button>
          <button onClick={copyTel} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-md transition-colors" title="Copiar número">
            {copiado ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          </button>
        </div>
      )}
      {/* Botones de resultado */}
      <div className="flex gap-2 mt-2.5">
        <button onClick={(e) => reportar(e, 'respondio')} disabled={procesando !== null}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50">
          <Check size={13} /> {procesando === 'respondio' ? 'Guardando…' : 'Respondió'}
        </button>
        <button onClick={(e) => reportar(e, 'no_respondio')} disabled={procesando !== null}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <X size={13} /> {procesando === 'no_respondio' ? 'Guardando…' : 'No respondió'}
        </button>
      </div>
    </div>
  );
}

// ─── Tracker de cobranza: casilla "Recordatorio enviado" ──────────────────────
// Marca → guarda recordatorio_pago = hoy → desaparece. Reaparece el día del
// vencimiento y 1 día después; vencido ya no se oculta hasta saldar.
function TareaCobranza({ alerta, onMarcar, onVer }: {
  alerta: any;
  onMarcar: (id: string) => Promise<void>;
  onVer: (a: any) => void;
}) {
  const [marcando, setMarcando] = useState(false);
  const venc = alerta.alerta_pago === 'vencido';

  async function marcar(e: React.MouseEvent) {
    e.stopPropagation();
    if (marcando || venc) return; // vencido no se oculta
    setMarcando(true);
    try { await onMarcar(alerta.id); }
    catch { setMarcando(false); }
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer active:scale-[0.99]
      ${venc ? 'bg-red-50 border-red-200 hover:bg-red-100' :
        alerta.alerta_pago === 'urgente' ? 'bg-orange-50 border-orange-200 hover:bg-orange-100' :
        'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
      onClick={() => onVer(alerta)}>
      {/* Casilla (deshabilitada si está vencido: debe gestionarse, no ocultarse) */}
      <button onClick={marcar} disabled={marcando || venc}
        className={`flex-shrink-0 transition-colors ${venc ? 'text-red-300 cursor-not-allowed' : 'text-amber-500 hover:text-amber-700'} disabled:opacity-60`}
        title={venc ? 'Pago vencido: gestiona el cobro' : 'Marcar: recordatorio enviado'}>
        {marcando ? <CheckSquare size={20} /> : venc ? <AlertTriangle size={18} /> : <Square size={20} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{alerta.nombre}</p>
        <p className="text-xs text-gray-500 truncate">
          Pendiente: <strong>{fmt(alerta.monto_pendiente)}</strong>
          {alerta.fecha_limite && ` · ${venc ? 'Venció' : 'Vence'}: ${alerta.fecha_limite}`}
        </p>
      </div>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0
        ${venc ? 'bg-red-100 text-red-700' :
          alerta.alerta_pago === 'urgente' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
        {venc ? 'Vencido' : alerta.alerta_pago === 'urgente' ? 'Urgente' : 'Próximo'}
      </span>
    </div>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────
export default function DashboardContent({ userName }: { userName: string }) {
  const [periodo, setPeriodo]   = useState(mesActual());
  const [allCots, setAllCots]   = useState<any[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [campanas, setCampanas] = useState<any[]>([]);
  const [metas, setMetas]       = useState<any[]>([]);
  const [meta, setMeta]         = useState<any>(null);
  const [alertasPago, setAlertasPago] = useState<any[]>([]);
  const [proyectosCont, setProyectosCont] = useState<any[]>([]); // proyectos ganados con sus pagos
  const notify = useNotify();
  const [analytics, setAnalytics]     = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [leadSeleccionado, setLeadSeleccionado] = useState<Lead | null>(null);
  const [panelSeguimiento, setPanelSeguimiento] = useState<Lead | null>(null);
  const [panelPago, setPanelPago]               = useState<any | null>(null);
  const [showNuevoLead, setShowNuevoLead]        = useState(false);

  const esMesActual = periodo.ano === mesActual().ano && periodo.mes === mesActual().mes;
  const mesStr = `${periodo.ano}-${String(periodo.mes).padStart(2,'0')}`;

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [resCot, resLeads, resCamp, resMetas, resMeta, resCont, resAnalytics] = await Promise.all([
        fetch('/api/notion/cotizaciones').then(r => r.json()),
        fetch(`/api/notion/pipeline?solo_activos=false`).then(r => r.json()),
        fetch('/api/notion/campanas').then(r => r.json()),
        fetch(`/api/notion/metas?ano=${periodo.ano}`).then(r => r.json()),
        fetch(`/api/notion/metas?mes=${mesStr}`).then(r => r.json()),
        fetch('/api/notion/contabilidad-proyectos?incluir_pagados=1').then(r => r.json()),
        fetch(`/api/notion/analytics?mes=${mesStr}`).then(r => r.json()),
      ]);
      if (resCot.success)   setAllCots(resCot.cotizaciones || []);
      if (resLeads.leads)   setAllLeads(resLeads.leads || []);
      if (resCamp.campanas) setCampanas(resCamp.campanas || []);
      if (resMetas.metas)   setMetas(resMetas.metas || []);
      if (resMeta.meta)     setMeta(resMeta.meta);
      else setMeta(null);
      if (resCont.proyectos) {
        setProyectosCont(resCont.proyectos);
        // La API devuelve proyecto/total/fecha_entrega; el checklist y el panel de
        // cobro esperan nombre/monto_total/fecha_limite (antes salían vacíos).
        setAlertasPago(resCont.proyectos
          .filter((p: any) => p.alerta_pago && p.monto_pendiente > 0 && !p.cobranza_oculta)
          .map((p: any) => ({ ...p, nombre: p.proyecto, monto_total: p.total, fecha_limite: p.fecha_entrega })));
      }
      if (resAnalytics.servicios_top) setAnalytics(resAnalytics);
    } finally { setLoading(false); }
  }, [periodo, mesStr]);

  useEffect(() => { cargar(); }, [cargar]);

  // Handler acciones de seguimiento desde el dashboard
  const handleSeguimiento = useCallback(async (
    leadId: string, accion: AccionSeguimiento, extra?: any,
  ) => {
    await fetch('/api/notion/pipeline/seguimiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, accion, ...extra }),
    });
    // Actualizar lead en local (optimista) para que el tracker reaccione al instante
    const hoyISO = hoyLima();
    setAllLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l;
      const next: any = { ...l, fecha_ultimo_contacto: hoyISO };
      if (accion === 'mensaje_enviado') {
        // Paso 1: queda "contactado hoy" → sale de "por contactar", reaparece mañana para reportar
        next.contactado_hoy = hoyISO;
      } else if (accion === 'no_respondio' || accion === 'respondio') {
        // Paso 2 resuelto: limpia el limbo
        next.contactado_hoy = null;
        next.estado_lead = extra?.nuevo_estado || (accion === 'no_respondio' ? 'SEGUIMIENTO' : l.estado_lead);
      } else if (extra?.nuevo_estado) {
        next.estado_lead = extra.nuevo_estado;
      }
      return next;
    }));
    setTimeout(() => cargar(), 2000);
  }, [cargar]);

  // Handler pago desde el dashboard
  const handlePago = useCallback(async (contId: string, data: any) => {
    const res = await fetch('/api/notion/contabilidad-proyectos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: contId, ...data }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const e = res ? await res.json().catch(() => ({})) : {};
      notify.error(`No se pudo registrar el pago: ${e.error || 'sin conexión'}`);
      throw new Error('pago');
    }
    if (data.registrar_pago) notify.success(`Pago de ${fmt(data.registrar_pago.monto)} registrado`);
    setTimeout(() => cargar(), 2000);
  }, [cargar, notify]);

  // Marca "recordatorio enviado hoy" → la cobranza sale del tracker (optimista) y se reprograma
  const handleMarcarRecordatorio = useCallback(async (contId: string) => {
    // Quita del tracker al instante
    setAlertasPago(prev => prev.filter(a => a.id !== contId));
    await fetch('/api/notion/contabilidad-proyectos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: contId, marcar_recordatorio: true }),
    });
    setTimeout(() => cargar(), 2000);
  }, [cargar]);

  // ── Derivados mes ───────────────────────────────────────────────────────────
  // INGRESOS = lo COBRADO: cada abono cuenta en el mes en que entró el dinero
  // (lib/pagos.ts). Antes se sumaba el total de cada proyecto ganado aunque no
  // estuviera pagado, y no cuadraba con el libro banco.
  // VENDIDO = total de los proyectos ganados (por su fecha de inicio).
  const pagosTodos: PagoProyecto[] = proyectosCont.flatMap((p: any) => p.pagos || []);
  const cobradoMeses = cobradoPorMes(pagosTodos);
  const fechaVenta = (p: any) => (p.fecha_inicio || p.pagos?.[0]?.fecha || p.fecha_cobro || p.created_time || '').slice(0, 10);
  const vendidosEn = (clave: string) => proyectosCont.filter((p: any) => mesLima(fechaVenta(p)) === clave);

  const ganadosTodos = allLeads.filter(l => l.estado_lead === 'GANADO');
  const ganadosMes = vendidosEn(mesStr);
  const leadsMes = allLeads.filter((l: Lead) => mesLima(l.fecha_contactado || l.created_time) === mesStr);
  // Cotizaciones del mes — solo para el KPI de conteo, no para ingresos
  const cotsMes = allCots.filter((c: any) => c.fecha_emision && mesLima(c.fecha_emision) === mesStr);

  const montoMes     = cobradoMeses[mesStr] || 0;               // cobrado en el mes
  const vendidoMes   = ganadosMes.reduce((a: number, p: any) => a + (p.total || 0), 0);
  const porCobrar    = proyectosCont.reduce((a: number, p: any) => a + Math.max(0, p.monto_pendiente || 0), 0);
  const metaMensual  = meta?.meta_mensual ?? 0;
  const metaAnual    = metas.find(m => m.mes_numero === 1)?.meta_anual
                     || metas.reduce((a: number, m: any) => a + (m.meta_mensual || 0), 0);
  const pctMeta      = metaMensual > 0 ? Math.round((montoMes / metaMensual) * 100) : null;
  const ganados      = ganadosMes.length;
  const perdidos     = leadsMes.filter(l => l.estado_lead === 'PERDIDO').length;
  const activos      = allLeads.filter(l => ESTADOS_ACTIVOS.includes(l.estado_lead)).length;
  const tasaCierre   = (ganados+perdidos) > 0 ? Math.round((ganados/(ganados+perdidos))*100) : 0;
  const ticketPromedio = ganados > 0 ? Math.round(vendidoMes / ganados) : 0;

  // Cobrado acumulado del año
  const ingresosAno = Object.entries(cobradoMeses)
    .filter(([k]) => k.startsWith(`${periodo.ano}-`))
    .reduce((a, [, v]) => a + v, 0);
  const pctMetaAnual = metaAnual > 0 ? Math.round((ingresosAno / metaAnual) * 100) : null;

  // Crecimiento vs mes anterior (cobrado)
  const { ano: anoPrev, mes: mesPrev } = addMes(periodo.ano, periodo.mes, -1);
  const montoPrev = cobradoMeses[`${anoPrev}-${String(mesPrev).padStart(2, '0')}`] || 0;
  const crecimiento = montoPrev > 0 ? Math.round(((montoMes - montoPrev) / montoPrev) * 100) : null;

  // Leads hoy y nuevos sin contactar
  const hoy = hoyLima();

  // ── Tracker de seguimiento por DÍAS (no depende de "Próximo seguimiento") ─────
  // Referencia = último contacto, o fecha de contacto inicial. Cadencia 3/7/14/30
  // con paso de reporte al día siguiente. Funciona para leads ya cargados y futuros.
  const leadsPorReportar: Lead[] = [];
  const leadsPorContactar: Lead[] = [];
  const leadsAtrasados: Lead[] = [];
  const leadsCandidatosPerder: Lead[] = [];
  for (const l of allLeads) {
    if (!ESTADOS_ACTIVOS.includes(l.estado_lead)) continue;
    if (l.estado_lead === 'NUEVO LEAD') continue; // los nuevos van a su propia sección
    const ch = (l as any).contactado_hoy as string | null;

    // Candidato a perder: +40 días desde el último contacto sin cerrar (regla de la operación)
    const diasSin = diasDesde(l.fecha_ultimo_contacto || l.fecha_contactado);
    if (diasSin !== null && diasSin >= 40) { leadsCandidatosPerder.push(l); continue; }

    // Paso 2 (reportar): marqué mensaje un día anterior y no he reportado.
    if (ch && ch < hoy) { leadsPorReportar.push(l); continue; }
    // Si ya marqué hoy, sale del tracker hasta mañana.
    if (ch && ch === hoy) continue;

    // Referencia del hito: si el lead tiene "Próximo seguimiento" (poblado por la
    // calibración o por el ciclo normal), usamos ESA fecha — aparece exacto ese día.
    // Si no la tiene, caemos al cálculo por días desde el contacto (red de seguridad).
    const prox = l.proximo_seguimiento;
    if (prox) {
      const dHasta = diasDesde(prox); // >0 = ya pasó la fecha, 0 = hoy, <0 = futuro
      if (dHasta === null) continue;
      if (dHasta === 0) leadsPorContactar.push(l);        // hoy es el hito exacto
      else if (dHasta > 0) leadsAtrasados.push(l);         // el hito ya pasó → atrasado
      // dHasta < 0 (aún no llega) → no aparece
      continue;
    }

    // Sin "Próximo seguimiento": cálculo por días (leads sin calibrar).
    const ref = l.fecha_ultimo_contacto || l.fecha_contactado;
    const tarea = tareaSeguimiento({
      diasDesdeContacto: diasDesde(ref),
      contactadoHoy: false,
      contactadoAntes: false,
    });
    if (tarea === 'contactar') leadsPorContactar.push(l);
    else if (tarea === 'atrasado') leadsAtrasados.push(l);
  }
  // Total de tareas de seguimiento (para el contador y la condición de mostrar)
  const totalSeg = leadsPorReportar.length + leadsPorContactar.length + leadsAtrasados.length + leadsCandidatosPerder.length;
  const leadsNuevos = allLeads.filter(l => l.estado_lead === 'NUEVO LEAD').slice(0, 3);

  // ── Gráficos ────────────────────────────────────────────────────────────────

  // 1. Cobrado vs vendido por mes (6 meses)
  //    Vendido = lo cobrado ese mes + lo que AÚN se debe de los proyectos de ese
  //    mes. Así las dos líneas van juntas y solo se separan donde hay deuda real
  //    (si un proyecto se pagó al mes siguiente, no aparece como "falta cobrar").
  const ingresosXMes = (() => {
    const filas: { mes: string; ingresos: number; vendido: number; porCobrar: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const { ano, mes } = addMes(periodo.ano, periodo.mes, -i);
      const clave = `${ano}-${String(mes).padStart(2, '0')}`;
      const cobrado = cobradoMeses[clave] || 0;
      const pendiente = vendidosEn(clave).reduce((a: number, p: any) => a + Math.max(0, p.monto_pendiente || 0), 0);
      filas.push({
        mes: MESES_CORTO[mes - 1],
        ingresos: Math.round(cobrado),
        vendido: Math.round(cobrado + pendiente),
        porCobrar: Math.round(pendiente),
      });
    }
    return filas;
  })();

  // 2. Leads nuevos vs ganados (barras, 6 meses)
  const leadsXMes = (() => {
    const mapa: Record<string, { nuevos: number; ganados: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const { ano, mes } = addMes(periodo.ano, periodo.mes, -i);
      mapa[`${ano}-${String(mes).padStart(2,'0')}`] = { nuevos: 0, ganados: 0 };
    }
    allLeads.forEach((l: Lead) => {
      const key = mesLima(l.fecha_contactado || l.created_time) || '';
      if (!(key in mapa)) return;
      mapa[key].nuevos++;
      if (l.estado_lead === 'GANADO') mapa[key].ganados++;
    });
    return Object.entries(mapa).map(([k, v]) => ({
      mes: MESES_CORTO[parseInt(k.split('-')[1])-1], ...v,
    }));
  })();

  // 3. Embudo de leads
  const embudoData = [
    { name: 'Leads totales',   value: leadsMes.length,                                                color: '#6366f1' },
    { name: 'Contactados',     value: leadsMes.filter(l => l.estado_lead !== 'NUEVO LEAD').length,    color: '#3b82f6' },
    { name: 'En seguimiento',  value: leadsMes.filter(l => etapaDe(l.estado_lead) === 'SEGUIMIENTO').length, color: '#f59e0b' },
    { name: 'Cotización env.', value: leadsMes.filter(l => ['COTIZACION ENVIADA','Negociacion'].includes(l.estado_lead)).length, color: '#8b5cf6' },
    { name: 'Ganados',         value: ganados,                                                         color: '#10b981' },
  ].filter(d => d.value > 0);

  // 4. Estado del pipeline (pie)
  const pipelineData = (() => {
    const mapa: Record<string, number> = {};
    allLeads.filter(l => ESTADOS_ACTIVOS.includes(l.estado_lead)).forEach(l => {
      mapa[l.estado_lead] = (mapa[l.estado_lead] || 0) + 1;
    });
    return Object.entries(mapa).map(([n, v]) => ({ name: n, value: v })).sort((a,b) => b.value - a.value);
  })();

  // 5. Campaña activa principal
  const campanaActiva = campanas.find(c => c.estado === 'Activa');

  const hora   = new Date().getHours();
  const saludo = hora < 5 ? 'Buenas noches' : hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const barMeta = pctMeta !== null && pctMeta >= 100 ? '#10b981' : pctMeta !== null && pctMeta >= 60 ? YELLOW : '#ef4444';

  const contenido = (
    <div className="p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{saludo}, {userName.split(' ')[0]} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5 first-letter:uppercase">
            {new Date().toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2 py-1.5 shadow-sm">
          <button onClick={() => setPeriodo(p => addMes(p.ano, p.mes, -1))} aria-label="Mes anterior"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="inline-block text-sm font-semibold text-gray-700 px-2 first-letter:uppercase min-w-36 text-center">
            {mesLabel(periodo.ano, periodo.mes)}
          </span>
          <button onClick={() => setPeriodo(p => addMes(p.ano, p.mes, 1))} aria-label="Mes siguiente"
            disabled={esMesActual}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
          {!esMesActual && (
            <button onClick={() => setPeriodo(mesActual())}
              className="ml-1 text-[11px] text-[#ffc500] font-semibold hover:underline">Hoy</button>
          )}
        </div>
      </div>

      {/* ── Tracker diario (solo mes actual) ── */}
      {esMesActual && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
            <Bell size={14} className="text-[#ffc500]" />
            <h3 className="text-sm font-bold text-gray-800">Tareas del día</h3>
            <span className="text-xs bg-[#ffc500] text-white px-2 py-0.5 rounded-full font-bold">
              {totalSeg + alertasPago.length}
            </span>
            <button onClick={() => setShowNuevoLead(true)}
              className="ml-auto flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
              <Plus size={13} /> Nuevo lead
            </button>
          </div>
          <div className="p-4 space-y-2">

            {/* Si no hay nada que hacer hoy */}
            {totalSeg === 0 && alertasPago.length === 0 && leadsNuevos.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Sin tareas pendientes hoy. Todo al día ✓
              </p>
            )}

            {/* SECCIÓN A — Ya contactados: ver qué respondieron (los marcaste antes) */}
            {leadsPorReportar.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <MessageCircle size={11} /> Ya contactados — ¿respondieron? ({leadsPorReportar.length})
                </p>
                {leadsPorReportar.slice(0, 8).map(l => (
                  <TareaReportar key={l.id} lead={l} onAccion={handleSeguimiento} onVer={setPanelSeguimiento} />
                ))}
              </>
            )}

            {/* SECCIÓN B — Por contactar hoy (día-hito exacto: 3/7/14/30) */}
            {leadsPorContactar.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-1 mt-3 flex items-center gap-1">
                  <Bell size={11} /> Toca seguimiento hoy ({leadsPorContactar.length})
                </p>
                {leadsPorContactar.slice(0, 6).map(l => (
                  <TareaContactar key={l.id} lead={l} onAccion={handleSeguimiento} onVer={setPanelSeguimiento} />
                ))}
                {leadsPorContactar.length > 6 && (
                  <a href="/crm" className="block text-center text-xs text-[#ffc500] font-semibold py-1 hover:underline">
                    +{leadsPorContactar.length - 6} más en el CRM →
                  </a>
                )}
              </>
            )}

            {/* SECCIÓN C — Atrasados (pasó el hito sin atender) */}
            {leadsAtrasados.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-1 mt-3 flex items-center gap-1">
                  <AlertTriangle size={11} /> Atrasados — pendientes de seguimiento ({leadsAtrasados.length})
                </p>
                {leadsAtrasados.slice(0, 6).map(l => (
                  <TareaContactar key={l.id} lead={l} onAccion={handleSeguimiento} onVer={setPanelSeguimiento} atrasado />
                ))}
                {leadsAtrasados.length > 6 && (
                  <a href="/crm" className="block text-center text-xs text-red-400 font-semibold py-1 hover:underline">
                    +{leadsAtrasados.length - 6} más en el CRM →
                  </a>
                )}
              </>
            )}

            {/* SECCIÓN D — Candidatos a perder (+40 días sin respuesta) */}
            {leadsCandidatosPerder.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 mt-3 flex items-center gap-1">
                  <AlertTriangle size={11} /> +40 días sin respuesta — ¿marcar perdidos? ({leadsCandidatosPerder.length})
                </p>
                {leadsCandidatosPerder.slice(0, 5).map(l => {
                  const d = diasDesde(l.fecha_ultimo_contacto || l.fecha_contactado);
                  return (
                    <div key={l.id} onClick={() => setPanelSeguimiento(l)}
                      className="flex items-center gap-3 p-3 rounded-xl border bg-gray-50 border-gray-200 hover:bg-gray-100 transition-all cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">{l.proyecto}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {[l.cliente, l.empresa].filter(Boolean).join(' · ') || '—'} · {d} días sin respuesta
                        </p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleSeguimiento(l.id, 'perdido', { motivo_perdida: 'Sin respuesta' }); }}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors flex-shrink-0">
                        Marcar perdido
                      </button>
                    </div>
                  );
                })}
                {leadsCandidatosPerder.length > 5 && (
                  <a href="/crm" className="block text-center text-xs text-gray-400 font-semibold py-1 hover:underline">
                    +{leadsCandidatosPerder.length - 5} más en el CRM →
                  </a>
                )}
              </>
            )}

            {/* Pagos pendientes — tracker de cobranza con casilla */}
            {alertasPago.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-3">Cobranzas por gestionar</p>
                {alertasPago.map((a: any) => (
                  <TareaCobranza key={a.id} alerta={a} onMarcar={handleMarcarRecordatorio} onVer={setPanelPago} />
                ))}
              </>
            )}

            {/* Nuevos leads — botón abre modal nuevo lead */}
            {leadsNuevos.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-3">
                  Nuevos leads sin contactar ({leadsNuevos.length})
                </p>
                <button onClick={() => setShowNuevoLead(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-all text-left cursor-pointer active:scale-[0.99]">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Plus size={13} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-700">Registrar nuevo lead</p>
                    <p className="text-xs text-blue-400">{leadsNuevos.length} lead{leadsNuevos.length > 1 ? 's' : ''} sin datos completos</p>
                  </div>
                  <ChevronR size={13} className="text-blue-300 flex-shrink-0" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Fila 1: Meta mensual + Meta anual ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Meta mensual */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5" title="Suma de los pagos que entraron en el mes (por su fecha real)">
                Cobrado en el mes
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-gray-900">{loading ? '…' : fmt(montoMes)}</p>
                {crecimiento !== null && (
                  <span className={`flex items-center gap-0.5 text-xs font-bold ${crecimiento >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {crecimiento >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(crecimiento)}% vs mes ant.
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Meta mensual</p>
              <p className="text-lg font-bold text-gray-500">{loading ? '…' : metaMensual > 0 ? fmt(metaMensual) : 'Sin definir'}</p>
              {pctMeta !== null && (
                <p className="text-sm font-bold" style={{ color: barMeta }}>{pctMeta}%</p>
              )}
            </div>
          </div>
          {metaMensual > 0 && <ProgressBar value={montoMes} max={metaMensual} color={barMeta} />}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs">
            <span className="text-gray-500">Vendido en el mes: <strong className="text-gray-800">{loading ? '…' : fmt(vendidoMes)}</strong></span>
            <span className="text-gray-500">Por cobrar (total): <strong className={porCobrar > 0 ? 'text-rose-500' : 'text-gray-800'}>{loading ? '…' : fmt(porCobrar)}</strong></span>
          </div>
          {metaMensual === 0 && !loading && (
            <p className="text-xs text-gray-400 italic mt-1">Sin meta definida — configúrala en Ajustes</p>
          )}
        </div>

        {/* Meta anual acumulada */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">
                Cobrado acumulado {periodo.ano}
              </p>
              <p className="text-3xl font-bold text-gray-900">{loading ? '…' : fmt(ingresosAno)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Meta anual</p>
              <p className="text-lg font-bold text-gray-500">{loading ? '…' : metaAnual > 0 ? fmt(metaAnual) : 'Sin definir'}</p>
              {pctMetaAnual !== null && (
                <p className={`text-sm font-bold ${pctMetaAnual >= 100 ? 'text-green-600' : pctMetaAnual >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                  {pctMetaAnual}%
                </p>
              )}
            </div>
          </div>
          {metaAnual > 0 && (
            <ProgressBar value={ingresosAno} max={metaAnual}
              color={pctMetaAnual !== null && pctMetaAnual >= 100 ? '#10b981' : pctMetaAnual !== null && pctMetaAnual >= 60 ? YELLOW : '#ef4444'} />
          )}
        </div>
      </div>

      {/* ── Fila 2: 4 KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Cotizaciones', value: loading ? '…' : cotsMes.length, sub: `${cotsMes.filter((c:any)=>c.url_pdf).length} con PDF`, icon: FileText, color: 'bg-blue-50 text-blue-600' },
          { label: 'Leads activos', value: loading ? '…' : activos, sub: `${leadsMes.filter(l=>l.estado_lead==='NUEVO LEAD').length} nuevos`, icon: Users, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Ganados', value: loading ? '…' : ganados, sub: `${tasaCierre}% tasa cierre`, icon: CheckCircle, color: 'bg-green-50 text-green-600' },
          { label: 'Ticket promedio', value: loading ? '…' : (ticketPromedio > 0 ? fmt(ticketPromedio) : '—'), sub: 'por contrato ganado', icon: TrendingUp, color: 'bg-purple-50 text-purple-600' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2.5 ${color}`}>
              <Icon size={14} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs font-medium text-gray-600 mt-0.5">{label}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Fila 3: Gráfico área ingresos + Embudo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Área ingresos 6 meses */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800">Cobrado vs vendido · 6 meses</p>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: YELLOW }} />Cobrado</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-slate-400" />Vendido (cobrado + por cobrar)</span>
            </div>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={ingresosXMes} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradY" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={YELLOW} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={YELLOW} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `S/${(v/1000).toFixed(0)}k`} width={45} />
                <Tooltip content={<CustomTooltip currency />} />
                <Area type="monotone" dataKey="ingresos" name="Cobrado"
                  stroke={YELLOW} strokeWidth={2.5} fill="url(#gradY)" dot={{ fill: YELLOW, r: 3 }} />
                <Area type="monotone" dataKey="vendido" name="Vendido"
                  stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Embudo de leads */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-800 mb-4">Embudo del mes</p>
          {loading || embudoData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-gray-400">
              {loading ? <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" /> : 'Sin leads este mes'}
            </div>
          ) : (
            <div className="space-y-2">
              {embudoData.map((d, i) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600 font-medium">{d.name}</span>
                    <span className="font-bold text-gray-800">{d.value}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${embudoData[0].value > 0 ? (d.value / embudoData[0].value) * 100 : 0}%`, backgroundColor: d.color }} />
                  </div>
                </div>
              ))}
              {ganados > 0 && leadsMes.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-2 text-center">
                  {Math.round((ganados / leadsMes.length) * 100)}% conversión total
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Fila 4: Barras leads + Pipeline pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Barras leads vs ganados */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-800 mb-4">Leads nuevos vs ganados</p>
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={leadsXMes} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} width={25} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="nuevos" name="Nuevos" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={32} />
                <Bar dataKey="ganados" name="Ganados" fill="#10b981" radius={[4,4,0,0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pipeline pie */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-800 mb-4">Pipeline activo</p>
          {loading || pipelineData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-gray-400">
              {loading ? <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" /> : 'Sin leads activos'}
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                    {pipelineData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {pipelineData.slice(0, 4).map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-gray-600 truncate max-w-24">{e.name}</span>
                    </div>
                    <span className="font-bold text-gray-700">{e.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Fila 4b: Servicios top + Fidelización ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico servicios más vendidos */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-800">Servicios más solicitados</p>
            <span className="inline-block text-xs text-gray-400 first-letter:uppercase">{mesLabel(periodo.ano, periodo.mes)}</span>
          </div>
          {loading || !analytics?.servicios_top?.length ? (
            <div className="h-48 flex items-center justify-center text-xs text-gray-400">
              {loading ? <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" /> : 'Sin datos de servicios este mes'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {analytics.servicios_top.slice(0, 6).map((s: any, i: number) => {
                const max = analytics.servicios_top[0]?.count || 1;
                const pct = Math.round((s.count / max) * 100);
                const colors = ['#ffc500','#6366f1','#10b981','#f97316','#8b5cf6','#ec4899'];
                return (
                  <div key={s.nombre} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-36 truncate font-medium">{s.nombre}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }} />
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-6 text-right">{s.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* KPI fidelización */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <p className="text-sm font-bold text-gray-800 mb-1">Fidelización</p>
            <p className="text-xs text-gray-400">Clientes que repiten este mes</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center flex-1 py-8">
              <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 mt-4">
              <div className="text-center">
                <p className="text-4xl font-bold" style={{ color: analytics?.fidelizacion?.pct >= 30 ? '#10b981' : '#ffc500' }}>
                  {analytics?.fidelizacion?.pct ?? 0}%
                </p>
                <p className="text-xs text-gray-400 mt-1">tasa de renovación</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{analytics?.fidelizacion?.renovaciones ?? 0}</p>
                  <p className="text-[10px] text-gray-400">Renovaciones</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-blue-600">{analytics?.fidelizacion?.total_ganados ?? 0}</p>
                  <p className="text-[10px] text-gray-400">Ganados total</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 text-center italic">
                {(analytics?.fidelizacion?.renovaciones ?? 0) === 0
                  ? 'Sin renovaciones detectadas este mes'
                  : `${analytics!.fidelizacion.renovaciones} cliente${analytics!.fidelizacion.renovaciones > 1 ? 's' : ''} ya trabajó con Idealo antes`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Fila 5: Campaña activa + Cotizaciones recientes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Campaña activa */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-800">Campaña activa</p>
            <a href="/campanas" className="text-xs text-[#ffc500] font-medium hover:underline">Ver todas →</a>
          </div>
          {loading ? (
            <div className="h-24 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !campanaActiva ? (
            <div className="h-24 flex flex-col items-center justify-center text-gray-400 gap-2">
              <p className="text-sm">Sin campaña activa</p>
              <a href="/campanas" className="text-xs text-[#ffc500] hover:underline">Registrar campaña →</a>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-800">{campanaActiva.nombre}</p>
                  <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                    {campanaActiva.canal}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Inversión</p>
                  <p className="text-sm font-bold text-gray-800">{fmt(campanaActiva.gastado)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Leads', value: campanaActiva.leads ?? campanaActiva.leads_generados ?? 0 },
                  { label: 'CPL', value: campanaActiva.cpl ? `S/${campanaActiva.cpl}` : '—' },
                  { label: 'ROAS', value: campanaActiva.roas ? `${campanaActiva.roas}x` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <p className="text-sm font-bold text-gray-800">{value}</p>
                    <p className="text-[10px] text-gray-400">{label}</p>
                  </div>
                ))}
              </div>
              {campanaActiva.presupuesto > 0 && (
                <div>
                  <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                    <span>Presupuesto usado</span>
                    <span>{Math.round((campanaActiva.gastado/campanaActiva.presupuesto)*100)}%</span>
                  </div>
                  <ProgressBar value={campanaActiva.gastado} max={campanaActiva.presupuesto}
                    color={campanaActiva.gastado/campanaActiva.presupuesto > 0.9 ? '#ef4444' : YELLOW} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cotizaciones recientes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-800">Cotizaciones recientes</p>
            <a href="/historial" className="text-xs text-[#ffc500] font-medium hover:underline">Ver todas →</a>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : allCots.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">Sin cotizaciones</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {allCots.slice(0, 5).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{c.numero_cotizacion || '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{c.cliente_nombre || '—'} · {c.fecha_emision || ''}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {c.monto_total > 0 && <p className="text-sm font-bold text-gray-800">{fmt(c.monto_total)}</p>}
                    {c.url_pdf && <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium">PDF</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Accesos rápidos ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { href: '/cotizar',   label: 'Nueva cotización',    desc: 'Genera un PDF para un cliente',        icon: FileText, yellow: true },
          { href: '/crm',       label: 'CRM',                 desc: totalSeg > 0 ? `${totalSeg} pendientes hoy` : 'Ver pipeline', icon: Target, yellow: false },
          { href: '/historial', label: 'Historial',           desc: 'Ver cotizaciones realizadas',           icon: Clock,    yellow: false },
        ].map(item => (
          <a key={item.href} href={item.href}
            className={`flex items-center gap-3 rounded-2xl p-4 shadow-sm transition-all hover:scale-[1.01] hover:shadow-md
              ${item.yellow ? 'bg-[#ffc500] text-white' : 'bg-white border border-gray-100 text-gray-800 hover:border-[#ffc500]'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.yellow ? 'bg-white/20' : 'bg-gray-50'}`}>
              <item.icon size={16} className={item.yellow ? 'text-white' : 'text-gray-400'} />
            </div>
            <div>
              <p className="text-sm font-semibold">{item.label}</p>
              <p className={`text-xs mt-0.5 ${item.yellow ? 'text-white/70' : 'text-gray-400'}`}>{item.desc}</p>
            </div>
          </a>
        ))}
      </div>

    </div>
  );

  return (
    <>
      {contenido}
      {panelSeguimiento && (
        <PanelSeguimiento
          lead={panelSeguimiento}
          userName={userName}
          onClose={() => setPanelSeguimiento(null)}
          onAccion={async (id, accion, extra) => {
            await handleSeguimiento(id, accion, extra);
            setPanelSeguimiento(null);
          }}
        />
      )}
      {panelPago && (
        <PanelPago
          alerta={panelPago}
          onClose={() => setPanelPago(null)}
          onGuardar={async (id, data) => {
            await handlePago(id, data);
            setPanelPago(null);
          }}
        />
      )}
      {showNuevoLead && (
        <NuevoLeadModal
          campanas={campanas}
          onClose={() => setShowNuevoLead(false)}
          onCreated={() => { setShowNuevoLead(false); cargar(); }}
        />
      )}
    </>
  );
}

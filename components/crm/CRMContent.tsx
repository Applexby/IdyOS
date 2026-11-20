'use client';
import ModalCierre from '@/components/fidelizacion/ModalCierre';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, RefreshCw, Search, X, Filter, List, LayoutGrid,
  ArrowUpDown, Download, Check, ChevronDown, Pencil,
} from 'lucide-react';
import type { Lead, EstadoLead, AccionSeguimiento } from '@/types/crm';
import { hoyLima, nombreDesdeEmail, fechaCortaLima } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { mismaPersona, clavePersona } from '@/lib/equipo';
import { descargarXlsx } from '@/lib/xlsx';
import { etapaDe } from '@/types/crm';
import { useNotify, useUnaVez } from '@/components/ui/Feedback';
import KanbanCard from './KanbanCard';
import LeadDrawer from './LeadDrawer';
import NuevoLeadModal from './NuevoLeadModal';
import Selector from '@/components/ui/Selector';

const COLUMNAS = [
  { id: 'nuevo',      label: 'Nuevo Lead',  estados: ['NUEVO LEAD'] as EstadoLead[],            dot: 'bg-sky-400',     top: 'bg-sky-400' },
  { id: 'contactado', label: 'Contactado',  estados: ['CONTACTADO'] as EstadoLead[],            dot: 'bg-violet-400',  top: 'bg-violet-400' },
  { id: 'seguimiento',label: 'Seguimiento', estados: ['SEGUIMIENTO','SEGUIMIENTO DIA 3','SEGUIMIENTO DIA 7','SEGUIMIENTO DIA 14','SEGUIMIENTO DIA 30'] as EstadoLead[], dot: 'bg-amber-400', top: 'bg-amber-400' },
  { id: 'cotizacion', label: 'Cotización',  estados: ['COTIZACION ENVIADA'] as EstadoLead[],    dot: 'bg-fuchsia-400', top: 'bg-fuchsia-400' },
  { id: 'negociacion',label: 'Negociación', estados: ['Negociacion'] as EstadoLead[],           dot: 'bg-indigo-400',  top: 'bg-indigo-400' },
];

const TODOS_ESTADOS_ACTIVOS = [
  'NUEVO LEAD','CONTACTADO','SEGUIMIENTO','SEGUIMIENTO DIA 3',
  'SEGUIMIENTO DIA 7','SEGUIMIENTO DIA 14','SEGUIMIENTO DIA 30',
  'COTIZACION ENVIADA','Negociacion',
];

type Vista = 'kanban' | 'lista';
type OrdenCampo = 'reciente' | 'antiguo' | 'proximo' | 'nombre';

interface Filtros {
  busqueda: string;
  estado: string;
  encargado: string;
  campana: string;
  canal: string;
}

const FILTROS_VACIOS: Filtros = { busqueda: '', estado: '', encargado: '', campana: '', canal: '' };

const ETAPA_STYLE: Record<string, { bg: string; text: string }> = {
  'NUEVO LEAD':         { bg: 'bg-sky-50',     text: 'text-sky-600' },
  'CONTACTADO':         { bg: 'bg-violet-50',  text: 'text-violet-600' },
  'SEGUIMIENTO':        { bg: 'bg-amber-50',   text: 'text-amber-600' },
  'COTIZACION ENVIADA': { bg: 'bg-fuchsia-50', text: 'text-fuchsia-600' },
  'Negociacion':        { bg: 'bg-indigo-50',  text: 'text-indigo-600' },
  'GANADO':             { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  'PERDIDO':            { bg: 'bg-rose-50',    text: 'text-rose-600' },
};

const MOTIVOS_PERDIDA = [
  'Cotización rechazada por fuera de presupuesto',
  'No firmo contrato',
  'No respondio mensajes de seguimiento',
  'No podia añadir personal al evento',
  'Respuesta a ultimo momento',
  'Sin respuesta',
];

function etapaCorta(e: string) {
  return e.replace('SEGUIMIENTO DIA', 'SEG').replace('COTIZACION ENVIADA', 'COTIZACIÓN');
}

const AVATAR_COLORS = ['bg-violet-500','bg-sky-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-indigo-500','bg-teal-500','bg-fuchsia-500'];
function avatarColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length; return AVATAR_COLORS[Math.abs(h)]; }
function iniciales(name: string) { const p = name.trim().split(/\s+/); return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'; }

export default function CRMContent({ userName }: { userName?: string }) {
  const [leads, setLeads]               = useState<Lead[]>([]);
  const [campanas, setCampanas]         = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [vista, setVista]               = useState<Vista>('kanban');
  const [seccion, setSeccion]           = useState<'hoy'|'activos'|'ganados'|'perdidos'>('activos');
  const [soloMios, setSoloMios]         = useState(false);
  const { data: session } = useSession();
  const miNombre = nombreDesdeEmail(session?.user?.email);
  const [leadSeleccionado, setLeadSeleccionado] = useState<Lead | null>(null);
  const [showNuevoLead, setShowNuevoLead] = useState(false);
  const [showFiltros, setShowFiltros]   = useState(false);
  const [showSort, setShowSort]         = useState(false);
  const [orden, setOrden]               = useState<OrdenCampo>('reciente');
  const [filtros, setFiltros]           = useState<Filtros>(FILTROS_VACIOS);
  const [filtrosDraft, setFiltrosDraft] = useState<Filtros>(FILTROS_VACIOS);
  const [dragging, setDragging]         = useState<string | null>(null);
  const [dragOver, setDragOver]         = useState<string | null>(null);
  const [usuarios, setUsuarios]         = useState<{ id: string; name: string }[]>([]);
  const [motivos, setMotivos]           = useState<string[]>([]);
  const notify    = useNotify();
  const unaVez    = useUnaVez();

  // fresco = saltar la caché del servidor (recarga tras guardar o botón de refrescar)
  const cargar = useCallback(async (silent = false, fresco = silent) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [resLeads, resCamp] = await Promise.all([
        fetch(`/api/notion/pipeline?solo_activos=false${fresco ? '&fresh=1' : ''}`).then(r => r.json()),
        fetch('/api/notion/campanas').then(r => r.json()),
      ]);
      if (resLeads.leads) setLeads(resLeads.leads);
      if (resCamp.campanas) setCampanas(resCamp.campanas);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // C6 — Recordar vista, orden, filtros y "Mis leads" entre visitas (solo en este navegador)
  const [prefsCargadas, setPrefsCargadas] = useState(false);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('crm_prefs') || '{}');
      if (p.vista) setVista(p.vista);
      if (p.orden) setOrden(p.orden);
      if (p.filtros) { setFiltros({ ...FILTROS_VACIOS, ...p.filtros, busqueda: '' }); }
      if (typeof p.soloMios === 'boolean') setSoloMios(p.soloMios);
    } catch { /* sin almacenamiento: valores por defecto */ }
    setPrefsCargadas(true);
  }, []);
  useEffect(() => {
    if (!prefsCargadas) return;
    try { localStorage.setItem('crm_prefs', JSON.stringify({ vista, orden, soloMios, filtros: { ...filtros, busqueda: '' } })); } catch { /* noop */ }
  }, [vista, orden, soloMios, filtros, prefsCargadas]);

  // Abrir un lead concreto al llegar con /crm?lead=ID (p. ej. desde Campañas)
  const [leadPedido, setLeadPedido] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') setLeadPedido(new URLSearchParams(window.location.search).get('lead'));
  }, []);
  useEffect(() => {
    if (!leadPedido || leads.length === 0) return;
    const l = leads.find(x => x.id === leadPedido);
    if (l) setLeadSeleccionado(l);
    setLeadPedido(null);
  }, [leadPedido, leads]);
  useEffect(() => {
    fetch('/api/notion/usuarios').then(r => r.json()).then(d => { if (d.usuarios) setUsuarios(d.usuarios); }).catch(() => {});
    fetch('/api/notion/motivos').then(r => r.json()).then(d => { if (d.motivos) setMotivos(d.motivos.map((m: any) => m.name)); }).catch(() => {});
  }, []);

  // Al cerrar un cliente (GANADO): preguntar cuándo volver a escribirle (fidelización)
  const [cierre, setCierre] = useState<Lead | null>(null);

  const handleUpdate = useCallback(async (leadId: string, accion: AccionSeguimiento, extra?: any) => {
    await unaVez(`seg-${leadId}`, async () => {
      const previo = leads.find(l => l.id === leadId);
      // Optimista: la tarjeta cambia al instante; luego se ajusta con lo que guardó el servidor
      const aplicar = (l: Lead, data: any = {}): Lead => {
        if (accion === 'mensaje_enviado') return { ...l, contactado_hoy: data.contactado_hoy || hoyLima() };
        return {
          ...l,
          estado_lead: data.nuevo_estado || extra?.nuevo_estado || l.estado_lead,
          fecha_ultimo_contacto: hoyLima(),
          proximo_seguimiento: data.proximo_seguimiento !== undefined ? data.proximo_seguimiento : l.proximo_seguimiento,
          contactado_hoy: null,
        };
      };
      setLeads(prev => prev.map(l => l.id === leadId ? aplicar(l) : l));
      setLeadSeleccionado(prev => prev?.id === leadId ? aplicar(prev) : prev);

      const res = await fetch('/api/notion/pipeline/seguimiento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, accion, ...extra }),
      }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) {
        if (previo) {
          setLeads(prev => prev.map(l => l.id === leadId ? previo : l));
          setLeadSeleccionado(prev => prev?.id === leadId ? previo : prev);
        }
        notify.error(`No se pudo registrar el seguimiento: ${data.error || 'sin conexión'}`);
        return;
      }
      setLeads(prev => prev.map(l => l.id === leadId ? aplicar(l, data) : l));
      setLeadSeleccionado(prev => prev?.id === leadId ? aplicar(prev, data) : prev);
      if ((data.nuevo_estado || extra?.nuevo_estado) === 'GANADO' || accion === 'ganado') { if (previo) setCierre(previo); }
      setTimeout(() => cargar(true), 2000); // Notion tarda ~1-2 s en indexar el cambio
    });
  }, [leads, cargar, notify, unaVez]);

  const handleCambioEstado = useCallback(async (leadId: string, nuevoEstado: EstadoLead) => {
    const previo = leads.find(l => l.id === leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado_lead: nuevoEstado } : l));
    const res = await fetch('/api/notion/pipeline', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: leadId, fields: { estado_lead: nuevoEstado } }),
    }).catch(() => null);
    if (!res || !res.ok) {
      if (previo) setLeads(prev => prev.map(l => l.id === leadId ? previo : l));
      const e = res ? await res.json().catch(() => ({})) : {};
      notify.error(`No se pudo mover el lead: ${e.error || 'sin conexión'}`);
      return;
    }
    if (nuevoEstado === 'GANADO' && previo && previo.estado_lead !== 'GANADO') setCierre(previo);
    setTimeout(() => cargar(true), 2000);
  }, [leads, cargar, notify]);

  const handleDelete = useCallback(async (leadId: string) => {
    const previo = leads.find(l => l.id === leadId);
    setLeads(prev => prev.filter(l => l.id !== leadId));
    setLeadSeleccionado(null);
    const res = await fetch('/api/notion/pipeline', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: leadId }),
    }).catch(() => null);
    if (!res || !res.ok) {
      if (previo) setLeads(prev => [previo, ...prev]);
      notify.error('No se pudo eliminar el lead');
      return;
    }
    notify.success('Lead eliminado');
  }, [leads, notify]);

  // Editar motivo de pérdida (desde tabla o drawer)
  const handleEditMotivo = useCallback(async (leadId: string, motivo: string) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, motivo_perdida: motivo } : l));
    if (leadSeleccionado?.id === leadId) setLeadSeleccionado(prev => prev ? { ...prev, motivo_perdida: motivo } : null);
    await fetch('/api/notion/pipeline', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: leadId, fields: { motivo_perdida: motivo } }),
    });
  }, [leadSeleccionado]);

  // Editar datos del lead (y su cliente vinculado) desde el drawer
  const handleSaveEdit = useCallback(async (leadId: string, campos: any) => {
    const res = await fetch('/api/notion/pipeline', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: leadId, fields: campos }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) notify.error(`No se pudieron guardar los cambios: ${data.error || res.status}`);
    else notify.success('Cambios guardados');
    if (data.lead) {
      setLeads(prev => prev.map(l => l.id === leadId ? data.lead : l));
      if (leadSeleccionado?.id === leadId) setLeadSeleccionado(data.lead);
    }
    setTimeout(() => cargar(true), 1200);
  }, [leadSeleccionado, cargar, notify]);

  // Agregar nota rápida al historial (con fecha de hoy, sin reemplazar)
  const handleAddNota = useCallback(async (leadId: string, nota: string) => {
    const usuario = session?.user?.name || miNombre || '';
    const linea = `[${fechaCortaLima()}${usuario ? ' · ' + usuario : ''}] 📝 ${nota}`;
    const res = await fetch('/api/notion/pipeline', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: leadId, fields: { notas_seguimiento: linea } }),
    });
    const data = await res.json();
    if (data.lead) {
      setLeads(prev => prev.map(l => l.id === leadId ? data.lead : l));
      if (leadSeleccionado?.id === leadId) setLeadSeleccionado(data.lead);
    }
  }, [leadSeleccionado, session, miNombre]);

  // Drag & drop
  const onDragStart = (leadId: string) => setDragging(leadId);
  const onDragEnd   = () => { setDragging(null); setDragOver(null); };
  const onDragOver  = (e: React.DragEvent, colId: string) => { e.preventDefault(); setDragOver(colId); };
  const onDrop = async (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (!dragging) return;
    const col = COLUMNAS.find(c => c.id === colId);
    if (!col) return;
    await handleCambioEstado(dragging, col.estados[0]);
    setDragging(null); setDragOver(null);
  };

  const leadsActivos  = leads.filter(l => TODOS_ESTADOS_ACTIVOS.includes(l.estado_lead as any));
  const leadsPerdidos = leads.filter(l => l.estado_lead === 'PERDIDO');
  const leadsGanados  = leads.filter(l => l.estado_lead === 'GANADO');

  const aplicarFiltros = (arr: Lead[]) => arr.filter(l => {
    const q = filtros.busqueda.toLowerCase();
    const soloDigitos = filtros.busqueda.replace(/\D/g, '');
    const telLead = (l.telefono || '').replace(/\D/g, '');
    if (q) {
      const coincide =
        l.proyecto?.toLowerCase().includes(q) ||
        l.empresa?.toLowerCase().includes(q) ||
        l.cliente?.toLowerCase().includes(q) ||
        (soloDigitos.length >= 3 && telLead.includes(soloDigitos));
      if (!coincide) return false;
    }
    if (filtros.estado && l.estado_lead !== filtros.estado) return false;
    if (filtros.encargado && !mismaPersona(l.atendido_por || l.persona_contactado[0]?.name || '', filtros.encargado)) return false;
    if (filtros.campana && l.campana_vinculada_id !== campanas.find(c => c.nombre === filtros.campana)?.id) return false;
    // "Isai" (sesión) y "Isai Manzanares" (Notion) son la misma persona
    if (soloMios && miNombre && !mismaPersona(l.atendido_por, miNombre)) return false;
    if (filtros.canal && l.canal !== filtros.canal) return false;
    return true;
  });

  const ordenar = (arr: Lead[]) => {
    const copia = [...arr];
    const t = (d: string | null) => d ? Date.parse(d.slice(0, 10)) : 0;
    switch (orden) {
      case 'reciente': copia.sort((a, b) => t(b.fecha_contactado) - t(a.fecha_contactado)); break;
      case 'antiguo':  copia.sort((a, b) => t(a.fecha_contactado) - t(b.fecha_contactado)); break;
      case 'proximo':  copia.sort((a, b) => t(a.proximo_seguimiento) - t(b.proximo_seguimiento)); break;
      case 'nombre':   copia.sort((a, b) => (a.proyecto || '').localeCompare(b.proyecto || '')); break;
    }
    return copia;
  };

  const hoy = hoyLima();
  // C2 — Bandeja de hoy: seguimientos vencidos o de hoy, y mensajes enviados
  // días atrás que falta reportar (respondió / no respondió).
  const leadsHoy = leadsActivos.filter(l =>
    (l.proximo_seguimiento && l.proximo_seguimiento.slice(0, 10) <= hoy && !(l.contactado_hoy && l.contactado_hoy.slice(0, 10) === hoy)) ||
    (l.contactado_hoy && l.contactado_hoy.slice(0, 10) < hoy));
  const base = seccion === 'perdidos' ? leadsPerdidos : seccion === 'ganados' ? leadsGanados : seccion === 'hoy' ? leadsHoy : leadsActivos;
  const leadsFiltrados = ordenar(aplicarFiltros(base));
  const misHoy = aplicarFiltros(leadsHoy).length;

  // C8 — Exportar a Excel lo que se ve (sección + filtros + orden)
  function exportarExcel() {
    descargarXlsx(`Idealo-leads-${seccion}-${hoy}`, [{
      nombre: 'Leads',
      columnas: [
        { titulo: 'Proyecto', ancho: 32 }, { titulo: 'Empresa / Razón social', ancho: 30 }, { titulo: 'Contacto', ancho: 24 },
        { titulo: 'RUC', ancho: 14 }, { titulo: 'Teléfono', ancho: 15 }, { titulo: 'Email', ancho: 26 },
        { titulo: 'Etapa', ancho: 18 }, { titulo: 'Origen', ancho: 12 }, { titulo: 'Campaña', ancho: 24 }, { titulo: 'Canal', ancho: 12 },
        { titulo: 'Atendido por', ancho: 14 }, { titulo: 'Primer contacto', formato: 'fecha', ancho: 14 },
        { titulo: 'Último contacto', formato: 'fecha', ancho: 14 }, { titulo: 'Próximo seguimiento', formato: 'fecha', ancho: 16 },
        { titulo: 'Total', formato: 'moneda', ancho: 13 }, { titulo: 'Motivo de pérdida', ancho: 26 },
      ],
      filas: leadsFiltrados.map(l => [
        l.proyecto, l.empresa, l.cliente, l.ruc, l.telefono, l.mail, etapaDe(l.estado_lead), l.origen,
        campanas.find(c => c.id === l.campana_vinculada_id)?.nombre || '', l.canal, l.atendido_por || '',
        l.fecha_contactado?.slice(0, 10) || '', l.fecha_ultimo_contacto?.slice(0, 10) || '', l.proximo_seguimiento?.slice(0, 10) || '',
        l.total ?? '', l.motivo_perdida,
      ]),
    }]);
    notify.success(`${leadsFiltrados.length} leads exportados a Excel`);
  }
  const pendientesHoy = leadsActivos.filter(l => l.proximo_seguimiento && l.proximo_seguimiento <= hoy).length;
  const nFiltros = Object.entries(filtros).filter(([k, v]) => k !== 'busqueda' && v !== '').length + (soloMios ? 1 : 0);

  // Un nombre por persona ("Administracion" y "Administración" son la misma)
  const encargados = Array.from(new Map(
    leads.map(l => l.atendido_por || l.persona_contactado[0]?.name || '').filter(Boolean).map(n => [clavePersona(n), n] as const),
  ).values()).sort();
  const canales = [...new Set(leads.map(l => l.canal).filter(Boolean))];

  const ORDEN_LABEL: Record<OrdenCampo, string> = {
    reciente: 'Más recientes', antiguo: 'Más antiguos', proximo: 'Próximo seguimiento', nombre: 'Nombre (A-Z)',
  };

  function abrirFiltros() { setFiltrosDraft(filtros); setShowFiltros(true); setShowSort(false); }
  function aplicarDraft() { setFiltros(filtrosDraft); setShowFiltros(false); }
  function limpiarFiltros() { setFiltros(FILTROS_VACIOS); setFiltrosDraft(FILTROS_VACIOS); setSoloMios(false); setShowFiltros(false); }

  return (
    <div className="flex flex-col h-full bg-gray-100/60">
      {cierre && <ModalCierre lead={cierre} onClose={() => { setCierre(null); cargar(true); }} />}

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">CRM</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">
              Pipeline de leads · {leadsActivos.length} activos
              {pendientesHoy > 0 && <span className="text-amber-500 font-medium"> · {pendientesHoy} con seguimiento hoy</span>}
            </p>
          </div>
          <button onClick={() => setShowNuevoLead(true)}
            className="flex items-center gap-2 bg-[#ffc500] hover:bg-[#e6b000] text-gray-900 text-[13px] font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md">
            <Plus size={16} /> Nuevo lead
          </button>
        </div>

        {/* Barra de controles estilo referencia */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de vista */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
            <button onClick={() => { setVista('kanban'); setSeccion('activos'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${vista === 'kanban' && seccion === 'activos' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              <LayoutGrid size={14} /> Tablero
            </button>
            <button onClick={() => { setVista('lista'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${vista === 'lista' || seccion !== 'activos' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              <List size={14} /> Tabla
            </button>
          </div>

          {/* Buscador */}
          <div className="relative flex-1 min-w-44">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar lead, empresa o teléfono..."
              value={filtros.busqueda}
              onChange={e => setFiltros(f => ({ ...f, busqueda: e.target.value }))}
              className="w-full pl-9 pr-9 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-yellow-100 bg-white transition-all" />
            {filtros.busqueda && (
              <button onClick={() => setFiltros(f => ({ ...f, busqueda: '' }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filtros */}
          <div className="relative">
            <button onClick={() => showFiltros ? setShowFiltros(false) : abrirFiltros()}
              className={`flex items-center gap-1.5 text-[13px] px-3.5 py-2.5 rounded-xl border transition-colors font-medium
                ${nFiltros > 0 ? 'bg-yellow-50 text-gray-800 border-[#ffc500]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              <Filter size={14} /> Filtros {nFiltros > 0 && <span className="bg-[#ffc500] text-gray-900 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{nFiltros}</span>}
            </button>
            {showFiltros && (
              <div className="absolute right-0 top-12 z-30 w-72 bg-white border border-gray-100 rounded-2xl shadow-[0_12px_40px_rgba(16,24,40,0.16)] overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Filtrar</p>
                  <button onClick={limpiarFiltros} className="text-[11px] text-gray-400 hover:text-rose-500 font-medium">Limpiar</button>
                </div>
                <div className="p-4 space-y-3">
                  <FiltroSelect label="Estado" value={filtrosDraft.estado} onChange={v => setFiltrosDraft(f => ({ ...f, estado: v }))}
                    options={[...TODOS_ESTADOS_ACTIVOS, 'GANADO', 'PERDIDO']} />
                  <FiltroSelect label="Encargado" value={filtrosDraft.encargado} onChange={v => setFiltrosDraft(f => ({ ...f, encargado: v }))} options={encargados} />
                  <FiltroSelect label="Canal" value={filtrosDraft.canal} onChange={v => setFiltrosDraft(f => ({ ...f, canal: v }))} options={canales} />
                  <FiltroSelect label="Campaña" value={filtrosDraft.campana} onChange={v => setFiltrosDraft(f => ({ ...f, campana: v }))} options={campanas.map(c => c.nombre)} />
                </div>
                <div className="px-4 py-3 border-t border-gray-50 flex gap-2">
                  <button onClick={() => setShowFiltros(false)} className="flex-1 text-[13px] text-gray-500 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">Cancelar</button>
                  <button onClick={aplicarDraft} className="flex-1 text-[13px] font-bold text-gray-900 py-2 rounded-xl bg-[#ffc500] hover:bg-[#e6b000] transition-colors">Aplicar</button>
                </div>
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <button onClick={() => { setShowSort(!showSort); setShowFiltros(false); }}
              className="flex items-center gap-1.5 text-[13px] px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:border-gray-300 transition-colors font-medium">
              <ArrowUpDown size={14} /> Ordenar
            </button>
            {showSort && (
              <div className="absolute right-0 top-12 z-30 w-52 bg-white border border-gray-100 rounded-2xl shadow-[0_12px_40px_rgba(16,24,40,0.16)] p-1.5">
                {(Object.keys(ORDEN_LABEL) as OrdenCampo[]).map(k => (
                  <button key={k} onClick={() => { setOrden(k); setShowSort(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-xl transition-colors ${orden === k ? 'bg-yellow-50 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {ORDEN_LABEL[k]} {orden === k && <Check size={14} className="text-[#ffc500]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Exportar a Excel la vista actual */}
          <button onClick={exportarExcel} disabled={leadsFiltrados.length === 0} title="Exportar a Excel lo que estás viendo"
            className="flex items-center gap-1.5 text-[13px] px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:border-gray-300 transition-colors font-medium disabled:opacity-40">
            <Download size={14} /> <span className="hidden sm:inline">Excel</span>
          </button>

          {/* Refresh */}
          <button onClick={() => cargar(true)} disabled={refreshing} aria-label="Actualizar"
            className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Acceso a secciones */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button onClick={() => { setSeccion('hoy'); setVista('lista'); }}
            className={`text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${seccion === 'hoy' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            Hoy ({misHoy})
          </button>
          <button onClick={() => setSeccion('activos')}
            className={`text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors ${seccion === 'activos' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            Activos ({leadsActivos.length})
          </button>
          <button onClick={() => { setSeccion('ganados'); setVista('lista'); }}
            className={`text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors ${seccion === 'ganados' ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            Ganados ({leadsGanados.length})
          </button>
          <button onClick={() => { setSeccion('perdidos'); setVista('lista'); }}
            className={`text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors ${seccion === 'perdidos' ? 'bg-rose-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            Perdidos ({leadsPerdidos.length})
          </button>
          <div className="flex-1" />
          {miNombre && (
            <button onClick={() => setSoloMios(v => !v)} title="Mostrar solo los leads que atiendo yo"
              className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${soloMios ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-500 border-gray-200 hover:border-gray-300'}`}>
              {soloMios ? `✓ Mis leads (${miNombre})` : 'Mis leads'}
            </button>
          )}
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-auto" onClick={() => { if (showFiltros) setShowFiltros(false); if (showSort) setShowSort(false); }}>
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : seccion === 'hoy' ? (
          <HoyView leads={leadsFiltrados} hoy={hoy} onSelect={setLeadSeleccionado} onUpdate={handleUpdate} />
        ) : seccion === 'perdidos' ? (
          <TableView leads={leadsFiltrados} onSelect={setLeadSeleccionado} modo="perdidos" onEditMotivo={handleEditMotivo} />
        ) : seccion === 'ganados' ? (
          <TableView leads={leadsFiltrados} onSelect={setLeadSeleccionado} modo="ganados" />
        ) : vista === 'kanban' ? (
          <KanbanView leads={leadsFiltrados} columnas={COLUMNAS} onSelect={setLeadSeleccionado} onNuevo={() => setShowNuevoLead(true)}
            dragging={dragging} dragOver={dragOver} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} />
        ) : (
          <TableView leads={leadsFiltrados} onSelect={setLeadSeleccionado} modo="activos" />
        )}
      </div>

      {leadSeleccionado && (
        <LeadDrawer lead={leadSeleccionado} onClose={() => setLeadSeleccionado(null)} onUpdate={handleUpdate} onDelete={handleDelete} onEditMotivo={handleEditMotivo} onSaveEdit={handleSaveEdit} onAddNota={handleAddNota} usuarios={usuarios} motivos={motivos} campanas={campanas} />
      )}
      {showNuevoLead && (
        <NuevoLeadModal campanas={campanas} usuarios={usuarios} onClose={() => setShowNuevoLead(false)} onCreated={(nuevo) => { setShowNuevoLead(false); if (nuevo) setLeads(prev => [nuevo, ...prev]); notify.success('Lead creado'); setTimeout(() => cargar(true), 2000); }} />
      )}
    </div>
  );
}

// ─── Filtro select reutilizable ───────────────────────────────────────────────
function FiltroSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{label}</label>
      <div className="relative">
        <Selector value={value} onChange={e => onChange(e.target.value)}
          className="w-full text-[13px] border border-gray-200 rounded-xl pl-3 pr-8 py-2 focus:outline-none focus:border-[#ffc500] bg-white appearance-none">
          <option value="">Todos</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </Selector>
      </div>
    </div>
  );
}

// ─── Vista Kanban ─────────────────────────────────────────────────────────────
function KanbanView({ leads, columnas, onSelect, onNuevo, dragging, dragOver, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  // En móvil se ve una columna a la vez, elegida con pestañas (E3)
  const [colMovil, setColMovil] = useState<string>(columnas[0]?.id);
  return (
    <div className="h-full">
      <div className="md:hidden flex gap-1.5 overflow-x-auto px-4 pt-4 -mb-1" role="tablist" aria-label="Etapas">
        {columnas.map((col: any) => {
          const n = leads.filter((l: Lead) => col.estados.includes(l.estado_lead)).length;
          return (
            <button key={col.id} role="tab" aria-selected={colMovil === col.id} onClick={() => setColMovil(col.id)}
              className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-xl whitespace-nowrap transition-colors ${colMovil === col.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              <span className={`w-2 h-2 rounded-full ${col.dot}`} /> {col.label} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
      </div>
    <div className="flex gap-4 px-4 md:px-6 py-5 h-full min-w-full">
      {columnas.map((col: any, idx: number) => {
        const items = leads.filter((l: Lead) => col.estados.includes(l.estado_lead));
        const isOver = dragOver === col.id;
        const movingHere = isOver && dragging && !items.some((l: Lead) => l.id === dragging);
        return (
          <div key={col.id}
            onDragOver={e => onDragOver(e, col.id)}
            onDrop={e => onDrop(e, col.id)}
            className={`${colMovil === col.id ? 'flex' : 'hidden'} md:flex flex-1 md:min-w-[260px] flex-col rounded-2xl bg-gray-200/50 transition-colors duration-200 overflow-hidden`}>
            <div className={`h-1 ${col.top}`} />
            <div className="flex items-center gap-2 px-4 pt-3.5 pb-3">
              <span className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className="text-[13px] font-bold text-gray-700">{col.label}</span>
              <span className="text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded-md min-w-5 text-center">{items.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5">
              {items.length === 0 && !movingHere && (
                <div className="h-24 border-2 border-dashed border-gray-300/70 rounded-2xl flex flex-col items-center justify-center gap-1 text-center px-3">
                  <p className="text-xs text-gray-400 font-medium">Sin leads en esta etapa</p>
                  {idx === 0 && onNuevo ? (
                    <button onClick={onNuevo} className="text-[11px] font-bold text-[#b8890b] hover:underline">+ Crear lead</button>
                  ) : (
                    <p className="text-[10px] text-gray-300 hidden md:block">Arrastra una tarjeta aquí</p>
                  )}
                </div>
              )}
              {items.map((lead: Lead) => (
                <div key={lead.id} draggable
                  onDragStart={() => onDragStart(lead.id)} onDragEnd={onDragEnd}
                  className={`transition-all duration-150 ${dragging === lead.id ? 'opacity-30' : ''}`}>
                  <KanbanCard lead={lead} onUpdate={async () => {}} onClick={onSelect} />
                </div>
              ))}
              {/* Placeholder del hueco donde caería la tarjeta (azul-gris, no amarillo) */}
              {movingHere && (
                <div className="h-24 rounded-2xl border-2 border-dashed border-slate-400 bg-slate-200/60 flex items-center justify-center">
                  <p className="text-xs text-slate-500 font-semibold">Soltar aquí</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

// ─── Vista Tabla (estilo referencia) ──────────────────────────────────────────
function TableView({ leads, onSelect, modo = 'activos', onEditMotivo }: {
  leads: Lead[]; onSelect: (l: Lead) => void;
  modo?: 'activos' | 'ganados' | 'perdidos';
  onEditMotivo?: (leadId: string, motivo: string) => Promise<void>;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editId, setEditId] = useState<string | null>(null);
  const hoy = hoyLima();
  const fmtFecha = (d: string | null) => {
    if (!d) return '—';
    const s = d.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const f = s ? new Date(+s[1], +s[2] - 1, +s[3]) : new Date(d);
    return f.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  };

  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(prev => prev.size === leads.length ? new Set() : new Set(leads.map(l => l.id)));

  const cols = modo === 'perdidos'
    ? ['Lead', 'Empresa', 'Motivo', 'Encargado', 'Contacto']
    : modo === 'ganados'
    ? ['Lead', 'Empresa', 'Canal', 'Encargado', 'Cerrado']
    : ['Lead', 'Empresa', 'Estado', 'Canal', 'Encargado', 'Próximo seg.'];

  return (
    <div className="px-6 py-5">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="w-10 px-4 py-3">
                  <button onClick={toggleAll} className="flex items-center justify-center">
                    <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors ${sel.size === leads.length && leads.length > 0 ? 'bg-violet-500 border-violet-500' : 'border-gray-300 bg-white'}`}>
                      {sel.size === leads.length && leads.length > 0 && <Check size={11} className="text-white" />}
                    </span>
                  </button>
                </th>
                {cols.map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">{h}<ChevronDown size={11} className="text-gray-300" /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => {
                const etapa = lead.estado_lead;
                const estilo = ETAPA_STYLE[etapa] || ETAPA_STYLE['NUEVO LEAD'];
                const enc = lead.atendido_por || lead.persona_contactado[0]?.name || '';
                const vencido = modo === 'activos' && lead.proximo_seguimiento && lead.proximo_seguimiento <= hoy;
                const checked = sel.has(lead.id);
                return (
                  <tr key={lead.id} onClick={() => onSelect(lead)}
                    className={`border-b border-gray-50 cursor-pointer transition-colors group ${checked ? 'bg-violet-50/60' : 'hover:bg-gray-50/70'}`}>
                    <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggle(lead.id); }}>
                      <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors ${checked ? 'bg-violet-500 border-violet-500' : 'border-gray-300 bg-white group-hover:border-gray-400'}`}>
                        {checked && <Check size={11} className="text-white" />}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-semibold text-gray-800 truncate max-w-52 group-hover:text-gray-900">{lead.proyecto || '(Sin nombre)'}</p>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-500 whitespace-nowrap">{lead.empresa || lead.cliente || '—'}</td>

                    {modo === 'perdidos' ? (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {editId === lead.id && onEditMotivo ? (
                          <Selector autoFocus value={lead.motivo_perdida || ''}
                            onChange={async e => { await onEditMotivo(lead.id, e.target.value); setEditId(null); }}
                            onBlur={() => setEditId(null)}
                            className="text-[12px] border border-rose-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-rose-100 bg-white">
                            <option value="">Sin especificar</option>
                            {MOTIVOS_PERDIDA.map(m => <option key={m} value={m}>{m}</option>)}
                          </Selector>
                        ) : (
                          <button onClick={() => setEditId(lead.id)}
                            className="text-[11px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md font-medium hover:bg-rose-100 transition-colors inline-flex items-center gap-1">
                            {lead.motivo_perdida || 'Sin especificar'} <Pencil size={9} />
                          </button>
                        )}
                      </td>
                    ) : modo === 'ganados' ? (
                      <td className="px-4 py-3 text-[12px] text-gray-500 whitespace-nowrap">{lead.canal || '—'}</td>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${estilo.bg} ${estilo.text} whitespace-nowrap`}>{etapaCorta(etapa)}</span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-gray-500 whitespace-nowrap">{lead.canal || '—'}</td>
                      </>
                    )}

                    <td className="px-4 py-3">
                      {enc ? (
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full ${avatarColor(enc)} text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0`}>{iniciales(enc)}</span>
                          <span className="text-[12px] text-gray-600 whitespace-nowrap">{enc.split(' ')[0]}</span>
                        </div>
                      ) : <span className="text-[12px] text-gray-300">—</span>}
                    </td>

                    {modo === 'perdidos' ? (
                      <td className="px-4 py-3 text-[12px] text-gray-400 whitespace-nowrap">{fmtFecha(lead.fecha_contactado)}</td>
                    ) : modo === 'ganados' ? (
                      <td className="px-4 py-3 text-[12px] text-emerald-600 font-medium whitespace-nowrap">{fmtFecha(lead.fecha_ultimo_contacto || lead.fecha_contactado)}</td>
                    ) : (
                      <td className="px-4 py-3 whitespace-nowrap">
                        {lead.proximo_seguimiento ? (
                          <span className={`text-[12px] font-medium ${vencido ? 'text-rose-500' : 'text-gray-500'}`}>
                            {vencido ? '⚠ ' : ''}{fmtFecha(lead.proximo_seguimiento)}
                          </span>
                        ) : <span className="text-[12px] text-gray-300">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {leads.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">
            {modo === 'perdidos' ? 'Sin leads perdidos' : modo === 'ganados' ? 'Sin leads ganados' : 'Sin leads con estos filtros'}
          </div>
        )}
      </div>

      {/* Barra flotante de selección (estilo referencia) */}
      {sel.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-gray-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl">
          <span className="text-[13px] font-medium">{sel.size} seleccionado{sel.size > 1 ? 's' : ''}</span>
          <button onClick={() => setSel(new Set())} className="text-[13px] text-gray-300 hover:text-white flex items-center gap-1">
            <X size={13} /> Limpiar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Bandeja "Hoy": seguimientos que tocan, con acciones rápidas ──────────────
function HoyView({ leads, hoy, onSelect, onUpdate }: {
  leads: Lead[]; hoy: string; onSelect: (l: Lead) => void;
  onUpdate: (leadId: string, accion: AccionSeguimiento, extra?: any) => Promise<void>;
}) {
  if (leads.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Check size={36} className="mx-auto mb-3 text-emerald-400" />
        <p className="font-medium text-gray-600">Todo al día</p>
        <p className="text-sm mt-1">No hay seguimientos pendientes para hoy.</p>
      </div>
    );
  }
  const dias = (f: string) => Math.round((Date.parse(hoy + 'T00:00:00Z') - Date.parse(f.slice(0, 10) + 'T00:00:00Z')) / 86400000);
  return (
    <div className="px-4 sm:px-6 py-5 space-y-2">
      {leads.map(l => {
        const reportar = !!l.contactado_hoy && l.contactado_hoy.slice(0, 10) < hoy;
        const atraso = l.proximo_seguimiento ? dias(l.proximo_seguimiento) : 0;
        const tel = (l.telefono || '').replace(/\D/g, '');
        const wa = tel ? `https://wa.me/${tel.startsWith('51') ? tel : '51' + tel}` : '';
        return (
          <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-3.5 flex flex-wrap items-center gap-3">
            <button onClick={() => onSelect(l)} className="flex-1 min-w-[200px] text-left">
              <p className="text-[14px] font-semibold text-gray-900">{l.proyecto || '(sin nombre)'}</p>
              <p className="text-[12px] text-gray-500">
                {[l.empresa || l.cliente, etapaCorta(l.estado_lead), l.atendido_por].filter(Boolean).join(' · ')}
              </p>
            </button>
            <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${reportar ? 'bg-sky-50 text-sky-700' : atraso > 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>
              {reportar ? 'Reportar respuesta' : atraso > 0 ? `Vencido ${atraso}d` : 'Toca hoy'}
            </span>
            <div className="flex items-center gap-1.5">
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp"
                  className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white">WhatsApp</a>
              )}
              {reportar ? (
                <>
                  <button onClick={() => onUpdate(l.id, 'respondio')} className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">Respondió</button>
                  <button onClick={() => onUpdate(l.id, 'no_respondio')} className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50">No respondió</button>
                </>
              ) : (
                <button onClick={() => onUpdate(l.id, 'mensaje_enviado')} className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Mensaje enviado</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


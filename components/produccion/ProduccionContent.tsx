'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  RefreshCw, ExternalLink, Phone, MessageCircle, Copy, CheckCheck,
  Package, FolderOpen, FileText, CheckSquare, Square, ChevronDown,
  X, DollarSign, Calendar, AlertTriangle, Edit2, Save, Link,
  Percent, StickyNote, Clock, ChevronRight, Check,
} from 'lucide-react';
import { formatCurrency, diasHasta, hoyLima } from '@/lib/utils';
import DatePicker from '@/components/ui/DatePicker';
import EnlacesDocumentos, { type CampoEnlace } from '@/components/ui/EnlacesDocumentos';
import Selector from '@/components/ui/Selector';

const fmt = (n: number) => formatCurrency(n);

interface Proyecto {
  id: string; notion_url: string; proyecto: string; cliente: string;
  telefono: string; mail: string; estado_produccion: string;
  cotizaciones_url: string | null; contrato_url: string | null;
  drive_url: string | null; factura_url: string | null;
  material_subido: boolean; total: number | null;
  encargado: string; persona_contactado: { id: string; name: string }[];
  last_edited_time: string;
  // Nuevos campos
  fecha_inicio: string | null;
  fecha_entrega: string | null;
  porcentaje_avance: number | null;
  notas_produccion: string;
  sub_etapa: string;
}

interface Contabilidad {
  id: string; nombre: string; monto_total: number; monto_pagado: number;
  monto_pendiente: number; fecha_inicio: string | null; fecha_limite: string | null;
  mes: string; alerta_pago: 'vencido' | 'urgente' | 'proximo' | null; proyecto_id: string | null;
}

// Solo 3 columnas activas — Hecho desaparece del kanban
const ESTADOS_KANBAN = ['Planeando', 'En Progreso', 'En revision'];

// Sub-etapas con avance automático
const SUB_ETAPAS = [
  'Pre-producción','Grabación','Sesión fotográfica',
  'Edición / Post','Primera revisión','Segunda revisión',
  'Entrega final','Cambios aprobados',
];
const AVANCE_POR_SUBETAPA: Record<string, number> = {
  'Pre-producción': 10, 'Grabación': 40, 'Sesión fotográfica': 40,
  'Edición / Post': 65, 'Primera revisión': 75, 'Segunda revisión': 85,
  'Entrega final': 95, 'Cambios aprobados': 100,
};
const ESTADOS_TODOS  = ['Planeando', 'En Progreso', 'En revision', 'Hecho'];

const COL: Record<string, { bg: string; text: string; border: string; dot: string; header: string }> = {
  'Planeando':   { bg: 'bg-gray-50',   text: 'text-gray-600',   border: 'border-gray-200',   dot: 'bg-gray-400',   header: 'bg-gray-100' },
  'En Progreso': { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500',   header: 'bg-blue-100' },
  'En revision': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500', header: 'bg-purple-100' },
  'Hecho':       { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500',  header: 'bg-green-100' },
};

// Toast simple
function Toast({ msg, tipo, onHide }: { msg: string; tipo: 'ok' | 'err'; onHide: () => void }) {
  useEffect(() => { const t = setTimeout(onHide, 2800); return () => clearTimeout(t); }, [onHide]);
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-xl text-sm font-semibold
      ${tipo === 'ok' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}>
      {tipo === 'ok' ? '✓' : '✕'} {msg}
    </div>
  );
}

// ─── Drawer lateral completo ──────────────────────────────────────────────────
function ProyectoDrawer({ proyecto, contabilidad, onClose, onUpdate, onUpdateCont, onFinalizar, onEnlace, usuarios = [] }: {
  onEnlace: (id: string, campo: CampoEnlace | 'total', valor: string | number | null) => void;
  proyecto: Proyecto; contabilidad: Contabilidad | null;
  onClose: () => void;
  onUpdate: (id: string, changes: any) => Promise<void>;
  onUpdateCont: (pageId: string, changes: any) => Promise<void>;
  onFinalizar: (id: string) => Promise<void>;
  usuarios?: { id: string; name: string }[];
}) {
  const [saving, setSaving]           = useState(false);
  const [editCont, setEditCont]       = useState(false);
  const [editProd, setEditProd]       = useState(false);
  const [editDatos, setEditDatos]     = useState(false);
  const [tituloEdit, setTituloEdit]   = useState(proyecto.proyecto || '');
  const [personaEdit, setPersonaEdit] = useState((proyecto as any).atendido_por || proyecto.persona_contactado[0]?.name || '');
  const [totalEdit, setTotalEdit]     = useState(String((proyecto as any).total ?? contabilidad?.monto_total ?? ''));
  const [montoPagado, setMontoPagado] = useState(String(contabilidad?.monto_pagado ?? ''));
  const [fechaLimite, setFechaLimite] = useState(contabilidad?.fecha_limite ?? '');
  const [avance, setAvance]           = useState(String(proyecto.porcentaje_avance ?? ''));
  const [subEtapa, setSubEtapa]       = useState(proyecto.sub_etapa ?? '');
  const [fechaInicio, setFechaInicio] = useState(proyecto.fecha_inicio ?? '');
  const [fechaEntrega, setFechaEntrega] = useState(proyecto.fecha_entrega ?? '');
  const [notasProd, setNotasProd]     = useState(proyecto.notas_produccion ?? '');

  // ── Checklist de tareas de producción ──────────────────────────────────────
  // Se guardan dentro de "Notas de producción" como líneas "[x] tarea" / "[ ] tarea".
  // El % de avance se deriva de cuántas tareas están marcadas.
  const TAREAS_DEFAULT = ['Pre-producción', 'Grabación / sesión', 'Selección de material', 'Edición / post', 'Primera revisión', 'Entrega final'];
  function parseChecklist(texto: string): { label: string; done: boolean }[] {
    const lineas = (texto || '').split('\n').filter(l => /^\s*\[[ xX]\]/.test(l));
    if (lineas.length === 0) return TAREAS_DEFAULT.map(t => ({ label: t, done: false }));
    return lineas.map(l => ({ label: l.replace(/^\s*\[[ xX]\]\s*/, '').trim(), done: /^\s*\[[xX]\]/.test(l) }));
  }
  const [tareas, setTareas] = useState<{ label: string; done: boolean }[]>(parseChecklist(proyecto.notas_produccion ?? ''));
  const pctChecklist = tareas.length ? Math.round((tareas.filter(t => t.done).length / tareas.length) * 100) : 0;

  function toggleTarea(i: number) {
    setTareas(prev => prev.map((t, idx) => idx === i ? { ...t, done: !t.done } : t));
  }
  function serializarChecklist(lista: { label: string; done: boolean }[]): string {
    return lista.map(t => `[${t.done ? 'x' : ' '}] ${t.label}`).join('\n');
  }

  // Al cambiar sub-etapa, calcular avance automático
  function handleSubEtapa(etapa: string) {
    setSubEtapa(etapa);
    const pct = AVANCE_POR_SUBETAPA[etapa];
    if (pct !== undefined) setAvance(String(pct));
  }
  const [copied, setCopied]           = useState(false);
  const [showEstados, setShowEstados] = useState(false);
  const [confirmFinalizar, setConfirmFinalizar] = useState(false);

  const col   = COL[proyecto.estado_produccion] || COL['Planeando'];
  const alerta = contabilidad?.alerta_pago;
  const pctPagado = contabilidad && contabilidad.monto_total > 0
    ? Math.round((contabilidad.monto_pagado / contabilidad.monto_total) * 100) : 0;

  const pctAvance = proyecto.porcentaje_avance ?? 0;

  function copyTel() { navigator.clipboard.writeText(proyecto.telefono); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  function openWA()  { const n = proyecto.telefono.replace(/\D/g,''); window.open(`https://wa.me/${n.startsWith('51') ? n : '51'+n}`, '_blank'); }

  async function cambiarEstado(estado: string) {
    setShowEstados(false);
    await onUpdate(proyecto.id, { estado_produccion: estado });
  }

  async function saveCont() {
    if (!contabilidad) return;
    setSaving(true);
    await onUpdateCont(contabilidad.id, { monto_pagado: Number(montoPagado)||0, fecha_entrega: fechaLimite||null });
    setEditCont(false); setSaving(false);
  }

  async function saveDatos() {
    setSaving(true);
    const changes: any = { proyecto: tituloEdit, total: totalEdit ? Number(totalEdit) : null };
    if (personaEdit) changes.atendido_por = personaEdit;
    await onUpdate(proyecto.id, changes);
    setEditDatos(false); setSaving(false);
  }

  async function saveProd() {
    setSaving(true);
    const checklistTexto = serializarChecklist(tareas);
    // Las notas libres van debajo del checklist (separadas por una línea en blanco)
    const notasLibres = (notasProd || '').split('\n').filter(l => !/^\s*\[[ xX]\]/.test(l)).join('\n').trim();
    const notasFinal = notasLibres ? `${checklistTexto}\n\n${notasLibres}` : checklistTexto;
    await onUpdate(proyecto.id, {
      fecha_inicio:       fechaInicio || null,
      fecha_entrega:      fechaEntrega || null,
      notas_produccion:   notasFinal,
      porcentaje_avance:  pctChecklist,
    });
    setEditProd(false); setSaving(false);
  }

  async function handleFinalizar() {
    setSaving(true);
    await onFinalizar(proyecto.id);
    setSaving(false);
    onClose();
  }

  // Días hasta entrega
  const diasEntrega = diasHasta(proyecto.fecha_entrega);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="relative mb-1">
              <button onClick={() => setShowEstados(!showEstados)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl border ${col.bg} ${col.text} ${col.border}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
                {proyecto.estado_produccion} <ChevronDown size={10} />
              </button>
              {showEstados && (
                <div className="absolute top-8 left-0 z-20 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden w-44">
                  {ESTADOS_TODOS.map(e => (
                    <button key={e} onClick={() => cambiarEstado(e)}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 transition-colors
                        ${e === proyecto.estado_produccion ? 'font-bold text-[#ffc500]' : 'text-gray-700'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${COL[e]?.dot}`} /> {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {editDatos ? (
              <div className="space-y-2 mt-1">
                <input value={tituloEdit} onChange={e => setTituloEdit(e.target.value)}
                  className="w-full text-sm font-bold border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#ffc500]" placeholder="Título del proyecto" />
                <div className="grid grid-cols-2 gap-2">
                  <Selector value={personaEdit} onChange={e => setPersonaEdit(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#ffc500] bg-white">
                    <option value="">Atendido por…</option>
                    {usuarios.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </Selector>
                  <input value={totalEdit} onChange={e => setTotalEdit(e.target.value)} type="number"
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#ffc500]" placeholder="Total S/" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditDatos(false)} className="flex-1 text-xs text-gray-500 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50">Cancelar</button>
                  <button onClick={saveDatos} disabled={saving} className="flex-1 text-xs font-bold bg-[#ffc500] hover:bg-[#e6b000] text-gray-900 rounded-lg py-1.5 disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 truncate">{proyecto.proyecto}</h2>
                  <p className="text-sm text-gray-500">{proyecto.cliente || '—'}</p>
                </div>
                <button onClick={() => setEditDatos(true)} title="Editar datos"
                  className="text-gray-300 hover:text-[#ffc500] hover:bg-yellow-50 p-1 rounded-lg transition-colors flex-shrink-0 mt-0.5">
                  <Edit2 size={14} />
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-1"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Progreso del proyecto */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Progreso</p>
              {!editProd && (
                <button onClick={() => setEditProd(true)} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700">
                  <Edit2 size={10} /> Editar
                </button>
              )}
            </div>

            {!editProd ? (
              <div className="space-y-2.5">
                {/* Barra avance */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500 font-medium">Avance</span>
                    <span className={`font-bold ${pctAvance >= 100 ? 'text-green-600' : pctAvance >= 50 ? 'text-blue-600' : 'text-gray-500'}`}>{pctAvance}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${pctAvance}%`, backgroundColor: pctAvance >= 100 ? '#10b981' : '#3b82f6' }} />
                  </div>
                </div>
                {/* Fechas */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-gray-400">Inicio</p>
                    <p className="text-xs font-semibold text-gray-700">{proyecto.fecha_inicio || '—'}</p>
                  </div>
                  <div className={`rounded-xl p-2.5 ${diasEntrega !== null && diasEntrega <= 3 ? 'bg-red-50' : diasEntrega !== null && diasEntrega <= 7 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                    <p className="text-[10px] text-gray-400">Entrega</p>
                    <p className={`text-xs font-semibold ${diasEntrega !== null && diasEntrega <= 3 ? 'text-red-600' : diasEntrega !== null && diasEntrega <= 7 ? 'text-amber-600' : 'text-gray-700'}`}>
                      {proyecto.fecha_entrega || '—'}
                      {diasEntrega !== null && diasEntrega >= 0 && <span className="text-[10px] ml-1">({diasEntrega}d)</span>}
                      {diasEntrega !== null && diasEntrega < 0 && <span className="text-[10px] ml-1 text-red-500">vencida</span>}
                    </p>
                  </div>
                </div>
                {/* Sub-etapa */}
                {proyecto.sub_etapa && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Etapa:</span>
                    <span className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-xl">
                      {proyecto.sub_etapa}
                    </span>
                  </div>
                )}
                {/* Notas producción */}
                {proyecto.notas_produccion && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
                    <p className="text-[11px] text-yellow-700 leading-relaxed">{proyecto.notas_produccion}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5 bg-gray-50 rounded-xl p-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-gray-500">Tareas del proyecto</label>
                    <span className="text-[11px] font-bold text-gray-700">{pctChecklist}% completado</span>
                  </div>
                  <div className="space-y-1">
                    {tareas.map((t, i) => (
                      <button key={i} onClick={() => toggleTarea(i)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white border border-gray-100 hover:border-gray-200 transition-colors text-left">
                        <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center flex-shrink-0 transition-colors ${t.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
                          {t.done && <Check size={11} className="text-white" />}
                        </span>
                        <span className={`text-[13px] ${t.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pctChecklist}%`, backgroundColor: pctChecklist >= 100 ? '#10b981' : '#ffc500' }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Fecha inicio</label>
                    <DatePicker value={fechaInicio} onChange={v => setFechaInicio(v)} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Fecha entrega</label>
                    <DatePicker value={fechaEntrega} borrable onChange={v => setFechaEntrega(v)} />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Notas de producción</label>
                  <textarea value={notasProd} onChange={e => setNotasProd(e.target.value)} rows={3}
                    placeholder="Coordinación, alertas, pendientes..."
                    className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] resize-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditProd(false)} className="flex-1 text-xs text-gray-500 border border-gray-200 rounded-xl py-1.5 hover:bg-gray-100">Cancelar</button>
                  <button onClick={saveProd} disabled={saving}
                    className="flex-1 bg-[#ffc500] text-white text-xs font-bold rounded-xl py-1.5 hover:bg-[#e6b000] disabled:opacity-40 flex items-center justify-center gap-1">
                    <Save size={11} /> {saving ? '...' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Contacto */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Contacto</p>
            {proyecto.telefono ? (
              <div className="flex items-center gap-2">
                <Phone size={13} className="text-gray-400" />
                <span className="text-sm text-gray-700 flex-1">{proyecto.telefono}</span>
                <button onClick={openWA} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><MessageCircle size={14} /></button>
                <button onClick={copyTel} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg">
                  {copied ? <CheckCheck size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
            ) : <p className="text-xs text-gray-400 italic">Sin teléfono registrado</p>}
            {(proyecto.encargado || proyecto.persona_contactado[0]) && (
              <p className="text-xs text-gray-500 mt-1.5">👤 {proyecto.persona_contactado[0]?.name || proyecto.encargado}</p>
            )}
          </section>

          {/* Entregables */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Entregables</p>
            <div className="space-y-1.5">
              <EnlacesDocumentos key={proyecto.id} pageId={proyecto.id}
                enlaces={{ cotizacion: proyecto.cotizaciones_url, contrato: proyecto.contrato_url, factura: proyecto.factura_url, drive: proyecto.drive_url }}
                onCambio={(campo, url) => onEnlace(proyecto.id, campo, url)}
                onCotizacionPrincipal={v => { if (v.total !== null) onEnlace(proyecto.id, 'total', v.total); }} />
              <button onClick={() => onUpdate(proyecto.id, { material_subido: !proyecto.material_subido })}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border w-full text-left transition-colors
                  ${proyecto.material_subido ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                {proyecto.material_subido
                  ? <CheckSquare size={13} className="text-green-500 flex-shrink-0" />
                  : <Square size={13} className="text-gray-300 flex-shrink-0" />}
                <span className={`text-xs font-medium ${proyecto.material_subido ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  Material subido al Terabox
                </span>
              </button>
            </div>
          </section>

          {/* Contabilidad */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Contabilidad</p>
              {contabilidad && !editCont && (
                <button onClick={() => setEditCont(true)} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700">
                  <Edit2 size={10} /> Editar
                </button>
              )}
            </div>
            {!contabilidad ? (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-3 py-3 text-center">
                <p className="text-xs text-gray-400">Sin registro contable vinculado</p>
              </div>
            ) : !editCont ? (
              <div className="space-y-2">
                {alerta && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold
                    ${alerta === 'vencido' ? 'bg-red-50 border-red-200 text-red-700' : alerta === 'urgente' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <AlertTriangle size={12} />
                    {alerta === 'vencido' ? '¡Pago vencido!' : alerta === 'urgente' ? 'Pago urgente (3 días)' : 'Pago próximo (7 días)'}
                    <span className="ml-auto">{fmt(contabilidad.monto_pendiente)}</span>
                  </div>
                )}
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">Progreso pago</span>
                    <span className={`font-bold ${pctPagado >= 100 ? 'text-green-600' : 'text-amber-600'}`}>{pctPagado}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pctPagado}%`, backgroundColor: pctPagado >= 100 ? '#10b981' : '#f59e0b' }} />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[{ l: 'Total', v: fmt(contabilidad.monto_total), c: 'text-gray-800' },
                      { l: 'Pagado', v: fmt(contabilidad.monto_pagado), c: 'text-green-600' },
                      { l: 'Pendiente', v: fmt(contabilidad.monto_pendiente), c: contabilidad.monto_pendiente > 0 ? 'text-red-500' : 'text-gray-400' }
                    ].map(({ l, v, c }) => (
                      <div key={l} className="text-center">
                        <p className={`text-xs font-bold ${c}`}>{v}</p>
                        <p className="text-[10px] text-gray-400">{l}</p>
                      </div>
                    ))}
                  </div>
                  {contabilidad.fecha_limite && (
                    <p className="text-[11px] text-gray-400 mt-2 text-center flex items-center justify-center gap-1">
                      <Calendar size={10} /> Límite: {contabilidad.fecha_limite}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2 bg-gray-50 rounded-xl p-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Monto pagado (S/)</label>
                  <input type="number" value={montoPagado} onChange={e => setMontoPagado(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500]" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Fecha límite de pago</label>
                  <DatePicker value={fechaLimite} borrable onChange={v => setFechaLimite(v)} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditCont(false)} className="flex-1 text-xs text-gray-500 border border-gray-200 rounded-xl py-2">Cancelar</button>
                  <button onClick={saveCont} disabled={saving}
                    className="flex-1 bg-[#ffc500] text-white text-xs font-bold rounded-xl py-2 hover:bg-[#e6b000] disabled:opacity-40 flex items-center justify-center gap-1">
                    <Save size={11} /> {saving ? '...' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 space-y-2">
          {/* Botón finalizar proyecto */}
          {!confirmFinalizar ? (
            <button onClick={() => setConfirmFinalizar(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl transition-colors">
              ✓ Finalizar proyecto
            </button>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
              <p className="text-xs text-green-700 font-semibold text-center">¿Confirmar finalización? El proyecto desaparecerá del kanban.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmFinalizar(false)} className="flex-1 text-xs text-gray-500 border border-gray-200 rounded-xl py-2">Cancelar</button>
                <button onClick={handleFinalizar} disabled={saving}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl py-2 transition-colors disabled:opacity-40">
                  {saving ? 'Finalizando...' : 'Sí, finalizar'}
                </button>
              </div>
            </div>
          )}
          <a href={proyecto.notion_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-xl transition-colors">
            <ExternalLink size={14} /> Ver en Notion
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta kanban mejorada ──────────────────────────────────────────────────
function ProyectoCard({ proyecto, contabilidad, onUpdate, onSelect }: {
  proyecto: Proyecto; contabilidad: Contabilidad | null;
  onUpdate: (id: string, c: any) => Promise<void>;
  onSelect: (p: Proyecto) => void;
}) {
  const [showEstados, setShowEstados] = useState(false);
  const col = COL[proyecto.estado_produccion] || COL['Planeando'];
  const alerta = contabilidad?.alerta_pago;
  const pctAvance = proyecto.porcentaje_avance ?? 0;

  const diasEntrega = diasHasta(proyecto.fecha_entrega);

  async function cambiarEstado(e: string) {
    setShowEstados(false);
    // Optimista — actualiza UI inmediatamente
    onUpdate(proyecto.id, { estado_produccion: e });
  }

  // Avatar de color (igual que el CRM)
  const enc = proyecto.persona_contactado[0]?.name || '';
  const AVATAR_COLORS = ['bg-violet-500','bg-sky-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-indigo-500','bg-teal-500','bg-fuchsia-500'];
  const avColor = (() => { let h = 0; for (let i = 0; i < enc.length; i++) h = (h*31 + enc.charCodeAt(i)) % AVATAR_COLORS.length; return AVATAR_COLORS[Math.abs(h)]; })();
  const ini = (() => { const pr = enc.trim().split(/\s+/); return ((pr[0]?.[0]||'')+(pr[1]?.[0]||'')).toUpperCase() || '?'; })();

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)] hover:border-gray-200 transition-all duration-200 cursor-pointer p-3.5"
      onClick={() => onSelect(proyecto)}>

      {/* Fila superior: estado + total */}
      <div className="flex items-center justify-between mb-2.5">
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md ${col.bg} ${col.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
          {proyecto.estado_produccion}
        </span>
        {proyecto.total ? <span className="text-[11px] font-bold text-gray-700">{fmt(proyecto.total)}</span> : null}
      </div>

      {/* Título + cliente */}
      <p className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2 mb-0.5">{proyecto.proyecto || '(Sin nombre)'}</p>
      {proyecto.cliente && <p className="text-xs text-gray-400 truncate mb-2.5">{proyecto.cliente}</p>}

      {/* Barra de avance (sutil) */}
      {pctAvance > 0 && (
        <div className="mb-2.5">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>Avance</span><span className="font-semibold text-gray-500">{pctAvance}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${pctAvance}%`, backgroundColor: pctAvance >= 100 ? '#10b981' : '#ffc500' }} />
          </div>
        </div>
      )}

      {/* Alerta de pago — chip sutil */}
      {alerta && (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md mb-2.5
          ${alerta === 'vencido' ? 'bg-rose-50 text-rose-600' : alerta === 'urgente' ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'}`}>
          <AlertTriangle size={9} />
          {alerta === 'vencido' ? 'Pago vencido' : alerta === 'urgente' ? 'Pago urgente' : 'Pago próximo'}
          {contabilidad && <span className="font-bold">· {fmt(contabilidad.monto_pendiente)}</span>}
        </span>
      )}

      {/* Pie: encargado + entrega */}
      <div className="flex items-center justify-between pt-2.5 mt-0.5 border-t border-gray-50">
        <div className="flex items-center gap-1.5 min-w-0">
          {enc ? (
            <>
              <span className={`w-5 h-5 rounded-full ${avColor} text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0`}>{ini}</span>
              <span className="text-[11px] text-gray-500 truncate">{enc.split(' ')[0]}</span>
            </>
          ) : <span className="text-[11px] text-gray-300">Sin asignar</span>}
        </div>
        {diasEntrega !== null && (
          <span className={`flex items-center gap-1 text-[11px] font-medium flex-shrink-0
            ${diasEntrega < 0 ? 'text-rose-500' : diasEntrega <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
            <Clock size={10} />
            {diasEntrega < 0 ? `${Math.abs(diasEntrega)}d tarde` : diasEntrega === 0 ? 'Hoy' : `${diasEntrega}d`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Módulo principal ─────────────────────────────────────────────────────────
export default function ProduccionContent() {
  const [proyectos, setProyectos]     = useState<Proyecto[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [filtro, setFiltro]           = useState('todos');
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<Proyecto | null>(null);
  const [toast, setToast]             = useState<{ msg: string; tipo: 'ok'|'err' } | null>(null);
  const [dragging, setDragging]       = useState<string | null>(null);
  const [dragOver, setDragOver]       = useState<string | null>(null);
  const [usuarios, setUsuarios]       = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/notion/usuarios').then(r => r.json()).then(d => { if (d.usuarios) setUsuarios(d.usuarios); }).catch(() => {});
  }, []);

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const resProy = await fetch('/api/notion/produccion?estado=todos').then(r => r.json());
      if (resProy.proyectos) setProyectos(resProy.proyectos.map((p: any) => ({
        ...p,
        fecha_inicio:       p.fecha_inicio_proyecto || null,
        fecha_entrega:      p.fecha_entrega_estimada || null,
        porcentaje_avance:  p.porcentaje_avance || null,
        notas_produccion:   p.notas_produccion || '',
        sub_etapa:          p.sub_etapa || '',
      })));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // La contabilidad ahora vive en el propio proyecto (no en BD separada).
  const getContabilidad = (proyectoId: string): Contabilidad | null => {
    const p = proyectos.find(pr => pr.id === proyectoId);
    if (!p) return null;
    const total = p.total ?? 0;
    const pagado = (p as any).monto_pagado ?? 0;
    const pendiente = (p as any).monto_pendiente ?? (total - pagado);
    const hoy = hoyLima();
    let alerta: 'vencido' | 'urgente' | 'proximo' | null = null;
    const fEnt = p.fecha_entrega;
    if (fEnt && pendiente > 0) {
      const dias = diasHasta(fEnt) ?? 0;
      if (dias < 0) alerta = 'vencido'; else if (dias <= 3) alerta = 'urgente'; else if (dias <= 7) alerta = 'proximo';
    }
    return {
      id: p.id, nombre: p.proyecto, monto_total: total, monto_pagado: pagado,
      monto_pendiente: pendiente, fecha_inicio: p.fecha_inicio, fecha_limite: p.fecha_entrega,
      mes: '', alerta_pago: alerta, proyecto_id: p.id,
    };
  };

  // Actualización optimista — UI cambia antes de que Notion confirme
  const handleUpdate = useCallback(async (id: string, changes: any) => {
    // 1. Actualizar UI inmediatamente
    setProyectos(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
    if (proyectoSeleccionado?.id === id) {
      setProyectoSeleccionado(prev => prev ? { ...prev, ...changes } : null);
    }
    // 2. Enviar a Notion en background
    try {
      const res = await fetch('/api/notion/produccion', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id, ...changes }),
      });
      if (!res.ok) throw new Error();
      setToast({ msg: 'Guardado en Notion ✓', tipo: 'ok' });
    } catch {
      setToast({ msg: 'Error al guardar — reintenta', tipo: 'err' });
      // Revertir si falló
      cargar(true);
    }
  }, [proyectoSeleccionado, cargar]);

  const handleUpdateCont = useCallback(async (pageId: string, changes: any) => {
    // pageId aquí es el id del proyecto. Los pagos viven en el proyecto.
    setProyectos(prev => prev.map(p => p.id === pageId ? { ...p, ...changes } : p));
    if (proyectoSeleccionado?.id === pageId) {
      setProyectoSeleccionado(prev => prev ? { ...prev, ...changes } : null);
    }
    try {
      await fetch('/api/notion/contabilidad-proyectos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, ...changes }),
      });
      setToast({ msg: 'Pago actualizado ✓', tipo: 'ok' });
    } catch {
      setToast({ msg: 'Error al guardar pago', tipo: 'err' });
    }
    setTimeout(() => cargar(true), 2000);
  }, [cargar, proyectoSeleccionado]);

  // Enlace de documento guardado a mano (ya escrito en Notion)
  // (o el total, si se eligió otra versión de cotización como principal)
  const handleEnlace = useCallback((id: string, campo: CampoEnlace | 'total', valor: string | number | null) => {
    const k = campo === 'total' ? 'total'
      : ({ cotizacion: 'cotizaciones_url', contrato: 'contrato_url', factura: 'factura_url', drive: 'drive_url' } as const)[campo];
    setProyectos(prev => prev.map(p => p.id === id ? { ...p, [k]: valor } : p));
    setProyectoSeleccionado(prev => prev && prev.id === id ? { ...prev, [k]: valor } : prev);
  }, []);

  // Finalizar proyecto → mover a Archivado
  const handleFinalizar = useCallback(async (id: string) => {
    setProyectos(prev => prev.filter(p => p.id !== id));
    try {
      await fetch('/api/notion/produccion', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id, estado_produccion: 'Archivado' }),
      });
      setToast({ msg: '🎉 Proyecto finalizado y archivado', tipo: 'ok' });
    } catch {
      setToast({ msg: 'Error al finalizar', tipo: 'err' });
      cargar(true);
    }
  }, [cargar]);

  // Drag & drop
  const onDragStart = (id: string) => setDragging(id);
  const onDragEnd   = () => { setDragging(null); setDragOver(null); };
  const onDragOver  = (e: React.DragEvent, col: string) => { e.preventDefault(); setDragOver(col); };
  const onDrop = async (e: React.DragEvent, estado: string) => {
    e.preventDefault();
    if (!dragging) return;
    await handleUpdate(dragging, { estado_produccion: estado });
    setDragging(null); setDragOver(null);
  };

  // Solo columnas activas (sin Hecho)
  const proyectosActivos = proyectos.filter(p => ESTADOS_KANBAN.includes(p.estado_produccion));
  const proyectosFiltrados = filtro === 'todos' ? proyectosActivos : proyectos.filter(p => p.estado_produccion === filtro);

  const alertasGlobales = proyectos
    .map(p => getContabilidad(p.id))
    .filter((c): c is Contabilidad => c !== null && c.alerta_pago !== null);

  const stats = {
    planeando:   proyectos.filter(p => p.estado_produccion === 'Planeando').length,
    en_progreso: proyectos.filter(p => p.estado_produccion === 'En Progreso').length,
    en_revision: proyectos.filter(p => p.estado_produccion === 'En revision').length,
  };

  return (
    <div className="flex flex-col h-full bg-gray-100/60">
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} onHide={() => setToast(null)} />}

      <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Producción</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">{proyectosActivos.length} proyectos activos</p>
          </div>
          <button onClick={() => cargar(true)} disabled={refreshing}
            className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Alertas pago */}
        {alertasGlobales.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {alertasGlobales.slice(0, 2).map(a => (
              <div key={a.id} className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-[13px]
                ${a.alerta_pago === 'vencido' ? 'bg-rose-50 border-rose-200 text-rose-700' : a.alerta_pago === 'urgente' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                <AlertTriangle size={13} className="flex-shrink-0" />
                <span className="font-medium truncate">{a.nombre}</span>
                <span className="ml-auto flex-shrink-0 font-bold">{fmt(a.monto_pendiente)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Filtros por etapa (chips discretos, no KPIs grandes) */}
        <div className="flex items-center gap-2">
          <button onClick={() => setFiltro('todos')}
            className={`text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors ${filtro === 'todos' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            Todos ({proyectosActivos.length})
          </button>
          {[
            { label: 'Planeando',   value: stats.planeando,   estado: 'Planeando',   dot: 'bg-gray-400' },
            { label: 'En progreso', value: stats.en_progreso, estado: 'En Progreso', dot: 'bg-sky-500' },
            { label: 'En revisión', value: stats.en_revision, estado: 'En revision', dot: 'bg-violet-500' },
          ].map(s => (
            <button key={s.label} onClick={() => setFiltro(filtro === s.estado ? 'todos' : s.estado)}
              className={`flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors ${filtro === s.estado ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label} ({s.value})
            </button>
          ))}
        </div>
      </div>

      {/* Kanban / Lista */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : proyectosFiltrados.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin proyectos activos</p>
            <p className="text-sm mt-1">Los proyectos aparecen aquí al marcarlos GANADO en el CRM</p>
          </div>
        ) : filtro === 'todos' ? (
          <div className="flex gap-4 px-6 py-5 h-full min-w-full">
            {ESTADOS_KANBAN.map(estado => {
              const items = proyectosFiltrados.filter(p => p.estado_produccion === estado);
              const col2  = COL[estado];
              const isOver = dragOver === estado;
              const movingHere = isOver && dragging && !items.some(p => p.id === dragging);
              return (
                <div key={estado}
                  onDragOver={e => onDragOver(e, estado)}
                  onDrop={e => onDrop(e, estado)}
                  className="flex-1 min-w-[260px] flex flex-col rounded-2xl bg-gray-200/50 transition-colors duration-200 overflow-hidden">
                  <div className={`h-1 ${col2.dot}`} />
                  <div className="flex items-center gap-2 px-4 pt-3.5 pb-3">
                    <span className={`w-2 h-2 rounded-full ${col2.dot}`} />
                    <span className="text-[13px] font-bold text-gray-700">{estado}</span>
                    <span className="text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded-md min-w-5 text-center">{items.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5">
                    {items.length === 0 && !movingHere && (
                      <div className="h-20 border-2 border-dashed border-gray-300/70 rounded-2xl flex items-center justify-center">
                        <p className="text-xs text-gray-400 font-medium">Sin proyectos</p>
                      </div>
                    )}
                    {items.map(p => (
                      <div key={p.id} draggable onDragStart={() => onDragStart(p.id)} onDragEnd={onDragEnd}
                        className={`transition-all duration-150 ${dragging === p.id ? 'opacity-30' : ''}`}>
                        <ProyectoCard proyecto={p} contabilidad={getContabilidad(p.id)}
                          onUpdate={handleUpdate} onSelect={setProyectoSeleccionado} />
                      </div>
                    ))}
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-6 py-5">
            {proyectosFiltrados.map(p => (
              <ProyectoCard key={p.id} proyecto={p} contabilidad={getContabilidad(p.id)}
                onUpdate={handleUpdate} onSelect={setProyectoSeleccionado} />
            ))}
          </div>
        )}
      </div>

      {proyectoSeleccionado && (
        <ProyectoDrawer
          proyecto={proyectoSeleccionado}
          contabilidad={getContabilidad(proyectoSeleccionado.id)}
          onClose={() => setProyectoSeleccionado(null)}
          onUpdate={handleUpdate}
          onEnlace={handleEnlace}
          onUpdateCont={handleUpdateCont}
          onFinalizar={handleFinalizar}
          usuarios={usuarios}
        />
      )}
    </div>
  );
}

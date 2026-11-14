'use client';

import { useState } from 'react';
import {
  X, ExternalLink, Phone, Mail, Globe, User, MessageCircle, Copy, CheckCheck,
  FileText, Trash2, Check, Clock3, Send, Trophy, XCircle, ChevronLeft, ChevronDown,
  Pencil, Plus, Megaphone,
} from 'lucide-react';
import type { Lead, EstadoLead, AccionSeguimiento } from '@/types/crm';
import { etapaDe } from '@/types/crm';
import LeadEditForm from './LeadEditForm';
import { diasDesde, diasHasta } from '@/lib/utils';
import EnlacesDocumentos from '@/components/ui/EnlacesDocumentos';
import Selector from '@/components/ui/Selector';

const ESTADOS_RESPONDIO: EstadoLead[] = ['SEGUIMIENTO', 'COTIZACION ENVIADA', 'Negociacion'];
const MOTIVOS_PERDIDA = [
  'Cotización rechazada por fuera de presupuesto',
  'No firmo contrato',
  'No respondio mensajes de seguimiento',
  'No podia añadir personal al evento',
  'Respuesta a ultimo momento',
  'Sin respuesta',
];

const ETAPA_STYLE: Record<string, { bg: string; text: string }> = {
  'NUEVO LEAD':         { bg: 'bg-sky-50',     text: 'text-sky-600' },
  'CONTACTADO':         { bg: 'bg-violet-50',  text: 'text-violet-600' },
  'SEGUIMIENTO':        { bg: 'bg-amber-50',   text: 'text-amber-600' },
  'COTIZACION ENVIADA': { bg: 'bg-fuchsia-50', text: 'text-fuchsia-600' },
  'Negociacion':        { bg: 'bg-indigo-50',  text: 'text-indigo-600' },
  'GANADO':             { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  'PERDIDO':            { bg: 'bg-rose-50',    text: 'text-rose-600' },
};

interface Props {
  lead: Lead;
  onClose: () => void;
  onUpdate: (leadId: string, accion: AccionSeguimiento, extra?: any) => Promise<void>;
  onDelete?: (leadId: string) => Promise<void>;
  onEditMotivo?: (leadId: string, motivo: string) => Promise<void>;
  onSaveEdit?: (leadId: string, campos: any) => Promise<void>;
  onAddNota?: (leadId: string, nota: string) => Promise<void>;
  usuarios?: { id: string; name: string }[];
  motivos?: string[];
  campanas?: { id: string; nombre: string; estado?: string; canal?: string; fecha_inicio?: string | null }[];
}

function fmt(d: string | null) {
  if (!d) return '—';
  const s = d.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const fecha = s ? new Date(+s[1], +s[2] - 1, +s[3]) : new Date(d);
  return fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Texto relativo para las fechas del lead ("hace 3 días", "en 2 días", "vencido")
function relativo(d: string | null, futuro = false): { texto: string; tono: string } | null {
  if (!d) return null;
  if (futuro) {
    const f = diasHasta(d);
    if (f === null) return null;
    if (f < 0) return { texto: `Vencido hace ${-f} día${f === -1 ? '' : 's'}`, tono: 'text-rose-600' };
    if (f === 0) return { texto: 'Toca hoy', tono: 'text-amber-600' };
    return { texto: `En ${f} día${f === 1 ? '' : 's'}`, tono: 'text-emerald-600' };
  }
  const p = diasDesde(d);
  if (p === null) return null;
  if (p <= 0) return { texto: 'Hoy', tono: 'text-gray-500' };
  return { texto: `Hace ${p} día${p === 1 ? '' : 's'}`, tono: 'text-gray-500' };
}

// C7 — Convierte una línea del historial ("[08/10/2026 · Isai] ✅ Respondió — nota")
// en un evento para la línea de tiempo (sin cambiar cómo se guarda en Notion).
function eventoHistorial(linea: string): { titulo: string; detalle: string; fecha: string; usuario: string; color: string } {
  const m = linea.match(/^\[([^\]·]+?)(?:\s*·\s*([^\]]+))?\]\s*(.*)$/);
  const fecha = m ? m[1].trim() : '';
  const usuario = m?.[2]?.trim() || '';
  let texto = (m ? m[3] : linea).trim();
  const [titulo, ...resto] = texto.split(' — ');
  const t = titulo.toLowerCase();
  const color =
    t.includes('ganado') ? 'bg-emerald-500' :
    t.includes('perdido') ? 'bg-rose-500' :
    t.includes('no respondió') ? 'bg-amber-500' :
    t.includes('respondió') ? 'bg-emerald-400' :
    t.includes('cotización') ? 'bg-fuchsia-500' :
    t.includes('mensaje enviado') ? 'bg-sky-500' : 'bg-gray-300';
  return { titulo: titulo || texto, detalle: resto.join(' — '), fecha, usuario, color };
}

type Modo = 'menu' | 'respondio' | 'perdido';

export default function LeadDrawer({ lead, onClose, onUpdate, onDelete, onEditMotivo, onSaveEdit, onAddNota, usuarios = [], motivos, campanas = [] }: Props) {
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState(false);
  const [agregandoNota, setAgregandoNota] = useState(false);
  const [notaRapida, setNotaRapida] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [copiedTel, setCopiedTel] = useState(false);
  const [copiedMail, setCopiedMail] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [modo, setModo] = useState<Modo>('menu');
  const [nota, setNota] = useState('');
  const [motivoSel, setMotivoSel] = useState('');
  const MOTIVOS = motivos && motivos.length ? motivos : MOTIVOS_PERDIDA;

  const etapa = etapaDe(lead.estado_lead);
  const estilo = ETAPA_STYLE[etapa] || ETAPA_STYLE['NUEVO LEAD'];

  function copyTel() { navigator.clipboard.writeText(lead.telefono); setCopiedTel(true); setTimeout(() => setCopiedTel(false), 2000); }
  function copyMail() { navigator.clipboard.writeText(lead.mail); setCopiedMail(true); setTimeout(() => setCopiedMail(false), 2000); }
  function openWA() {
    const num = lead.telefono.replace(/\D/g, '');
    window.open(`https://wa.me/${num.startsWith('51') ? num : '51' + num}`, '_blank');
  }

  // No esperamos al servidor: el CRM actualiza la tarjeta al instante (optimista)
  // y revierte con un aviso si Notion falla. Así el usuario puede seguir trabajando.
  function accion(a: AccionSeguimiento, extra?: any) {
    onUpdate(lead.id, a, { ...extra, nota: nota || undefined });
    setNota(''); setMotivoSel(''); setModo('menu');
  }

  async function eliminarLead() {
    if (!onDelete) return;
    setLoading(true);
    try { await onDelete(lead.id); onClose(); } finally { setLoading(false); }
  }

  const lineasHistorial = lead.notas_seguimiento ? lead.notas_seguimiento.split('\n').filter(Boolean) : [];
  const cerrado = etapa === 'GANADO' || etapa === 'PERDIDO';

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-lg mb-2 ${estilo.bg} ${estilo.text}`}>
              {etapa}
            </span>
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{lead.proyecto || '(Sin nombre)'}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{[lead.cliente, lead.empresa].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onSaveEdit && (
              <button onClick={() => setEditando(true)} title="Editar datos"
                className="text-gray-300 hover:text-[#ffc500] hover:bg-yellow-50 p-1.5 rounded-lg transition-colors">
                <Pencil size={16} />
              </button>
            )}
            <button onClick={onClose} className="text-gray-300 hover:text-gray-600 p-1.5 rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Contacto */}
          <section>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Contacto</p>
            <div className="space-y-2">
              {lead.telefono && (
                <div className="flex items-center gap-2.5">
                  <Phone size={14} className="text-gray-300 flex-shrink-0" />
                  <span className="text-sm text-gray-700 flex-1">{lead.telefono}</span>
                  <button onClick={openWA} className="text-emerald-600 hover:text-emerald-700 p-1.5 hover:bg-emerald-50 rounded-lg transition-colors" title="WhatsApp">
                    <MessageCircle size={15} />
                  </button>
                  <button onClick={copyTel} className="text-gray-300 hover:text-gray-600 p-1.5 hover:bg-gray-50 rounded-lg transition-colors" title="Copiar">
                    {copiedTel ? <CheckCheck size={15} className="text-emerald-500" /> : <Copy size={15} />}
                  </button>
                </div>
              )}
              {lead.mail && (
                <div className="flex items-center gap-2.5">
                  <Mail size={14} className="text-gray-300 flex-shrink-0" />
                  <span className="text-sm text-gray-700 flex-1 truncate">{lead.mail}</span>
                  <button onClick={copyMail} className="text-gray-300 hover:text-gray-600 p-1.5 hover:bg-gray-50 rounded-lg transition-colors">
                    {copiedMail ? <CheckCheck size={15} className="text-emerald-500" /> : <Copy size={15} />}
                  </button>
                </div>
              )}
              {lead.canal && (
                <div className="flex items-center gap-2.5">
                  <Globe size={14} className="text-gray-300 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{lead.canal}</span>
                </div>
              )}
              {(lead.origen || lead.campana_vinculada_id) && (
                <div className="flex items-center gap-2.5">
                  <Megaphone size={14} className="text-gray-300 flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    {lead.origen || 'Campaña'}
                    {lead.campana_vinculada_id && (
                      <> · <a href="/campanas" className="font-semibold hover:underline">
                        {campanas.find(c => c.id === lead.campana_vinculada_id)?.nombre || 'campaña vinculada'}
                      </a></>
                    )}
                  </span>
                </div>
              )}
              {(lead.atendido_por || lead.persona_contactado[0]) && (
                <div className="flex items-center gap-2.5">
                  <User size={14} className="text-gray-300 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Atendido por <strong className="font-semibold">{lead.atendido_por || lead.persona_contactado[0]?.name}</strong></span>
                </div>
              )}
            </div>
          </section>

          {/* Seguimiento — integrado en el drawer */}
          {!cerrado && (
            <section>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Seguimiento</p>

              {modo === 'menu' && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setModo('respondio')} disabled={loading}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-sm font-medium text-gray-700 disabled:opacity-50">
                    <Check size={15} className="text-emerald-500" /> Respondió
                  </button>
                  <button onClick={() => accion('no_respondio')} disabled={loading}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-amber-300 hover:bg-amber-50 transition-colors text-sm font-medium text-gray-700 disabled:opacity-50">
                    <Clock3 size={15} className="text-amber-500" /> No respondió
                  </button>
                  <button onClick={() => accion('cotizacion_enviada')} disabled={loading}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-fuchsia-300 hover:bg-fuchsia-50 transition-colors text-sm font-medium text-gray-700 disabled:opacity-50">
                    <Send size={14} className="text-fuchsia-500" /> Cotización
                  </button>
                  <button onClick={() => accion('ganado')} disabled={loading}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-sm font-semibold text-emerald-700 disabled:opacity-50">
                    <Trophy size={14} className="text-emerald-500" /> Ganado
                  </button>
                  <button onClick={() => setModo('perdido')} disabled={loading}
                    className="col-span-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-gray-100 hover:border-rose-300 hover:bg-rose-50 transition-colors text-sm font-medium text-rose-500 disabled:opacity-50">
                    <XCircle size={14} /> Marcar como perdido
                  </button>
                </div>
              )}

              {modo === 'respondio' && (
                <div>
                  <button onClick={() => setModo('menu')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2.5">
                    <ChevronLeft size={13} /> Volver
                  </button>
                  <p className="text-sm font-semibold text-gray-800 mb-2">¡Respondió! ¿A qué etapa pasa?</p>
                  <div className="space-y-1.5 mb-3">
                    {ESTADOS_RESPONDIO.map(e => (
                      <button key={e} onClick={() => accion('respondio', { nuevo_estado: e })} disabled={loading}
                        className="w-full text-left px-4 py-2.5 text-sm rounded-xl border border-gray-100 hover:border-[#ffc500] hover:bg-yellow-50/60 transition-colors font-medium text-gray-700 disabled:opacity-50">
                        {e}
                      </button>
                    ))}
                  </div>
                  <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
                    placeholder="Nota opcional (ej: revisa esta semana)"
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-yellow-100 resize-none" />
                </div>
              )}

              {modo === 'perdido' && (
                <div>
                  <button onClick={() => setModo('menu')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2.5">
                    <ChevronLeft size={13} /> Volver
                  </button>
                  <p className="text-sm font-semibold text-gray-800 mb-2">¿Por qué no se concretó?</p>
                  <div className="space-y-1.5 mb-3">
                    {MOTIVOS.map(m => (
                      <button key={m} onClick={() => setMotivoSel(m)}
                        className={`w-full text-left px-3.5 py-2 text-[13px] rounded-xl border transition-colors font-medium
                          ${motivoSel === m ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-gray-100 text-gray-700 hover:border-rose-200 hover:bg-rose-50/60'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <button disabled={!motivoSel || loading} onClick={() => accion('perdido', { motivo_perdida: motivoSel })}
                    className="w-full bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40">
                    {loading ? 'Guardando…' : 'Confirmar pérdida'}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Fechas */}
          <section>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Fechas</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Primer contacto', value: fmt(lead.fecha_contactado), rel: relativo(lead.fecha_contactado) },
                // Sin último contacto registrado, el primer contacto es la última interacción
                { label: 'Último contacto', value: fmt(lead.fecha_ultimo_contacto || lead.fecha_contactado), rel: relativo(lead.fecha_ultimo_contacto || lead.fecha_contactado) },
                { label: 'Próximo seguimiento', value: fmt(lead.proximo_seguimiento), rel: relativo(lead.proximo_seguimiento, true) },
              ].map(({ label, value, rel }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-gray-700">{value}</p>
                  {rel && <p className={`text-[10px] font-medium mt-0.5 ${rel.tono}`}>{rel.texto}</p>}
                </div>
              ))}
            </div>
          </section>

          {/* Historial */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Historial</p>
              {onAddNota && !agregandoNota && (
                <button onClick={() => setAgregandoNota(true)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#b8890b] hover:text-[#996f00] transition-colors">
                  <Plus size={12} /> Agregar nota
                </button>
              )}
            </div>

            {agregandoNota && (
              <div className="mb-2.5">
                <textarea value={notaRapida} onChange={e => setNotaRapida(e.target.value)} rows={2} autoFocus
                  placeholder="Escribe una nota rápida (se marcará con la fecha de hoy)…"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-yellow-100 resize-none" />
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => { setAgregandoNota(false); setNotaRapida(''); }}
                    className="flex-1 text-xs text-gray-500 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50">Cancelar</button>
                  <button disabled={!notaRapida.trim() || guardandoNota}
                    onClick={async () => {
                      if (!onAddNota || !notaRapida.trim()) return;
                      setGuardandoNota(true);
                      try { await onAddNota(lead.id, notaRapida.trim()); setNotaRapida(''); setAgregandoNota(false); }
                      finally { setGuardandoNota(false); }
                    }}
                    className="flex-1 text-xs font-bold bg-[#ffc500] hover:bg-[#e6b000] text-gray-900 rounded-lg py-1.5 disabled:opacity-50">
                    {guardandoNota ? 'Guardando…' : 'Guardar nota'}
                  </button>
                </div>
              </div>
            )}

            {lineasHistorial.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Sin historial aún.</p>
            ) : (
              <ol className="relative border-l border-gray-100 ml-1.5 space-y-3">
                {lineasHistorial.map((linea, i) => {
                  const e = eventoHistorial(linea);
                  return (
                    <li key={i} className="ml-4">
                      <span className={`absolute -left-[7px] mt-1 w-3.5 h-3.5 rounded-full border-2 border-white ${e.color}`} aria-hidden />
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[12px] font-semibold text-gray-800">{e.titulo}</p>
                        {e.fecha && <span className="text-[10px] text-gray-400 flex-shrink-0">{e.fecha}</span>}
                      </div>
                      {(e.detalle || e.usuario) && (
                        <p className="text-[11px] text-gray-500 leading-snug">
                          {e.detalle}{e.detalle && e.usuario ? ' · ' : ''}{e.usuario && <span className="text-gray-400">{e.usuario}</span>}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {etapa === 'PERDIDO' && (
            <section>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Motivo de pérdida</p>
              {onEditMotivo ? (
                <div className="relative">
                  <Selector value={lead.motivo_perdida || ''}
                    onChange={e => onEditMotivo(lead.id, e.target.value)}
                    className="w-full text-sm border border-rose-200 bg-rose-50 text-rose-700 font-medium rounded-xl pl-3 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-100 appearance-none">
                    <option value="">Sin especificar</option>
                    {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                  </Selector>
                </div>
              ) : (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700 font-medium">
                  {lead.motivo_perdida || 'Sin especificar'}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 space-y-2">
          {/* Cotización del OS o propuesta hecha a mano (enlace de Drive, PDF…) */}
          <EnlacesDocumentos key={lead.id} pageId={lead.id} campos={['cotizacion']} enlaces={{ cotizacion: lead.cotizaciones_url }} />
          <a href={`/cotizar?nombre=${encodeURIComponent(lead.cliente || lead.empresa || '')}&empresa_id=${encodeURIComponent(lead.empresa_id || '')}&empresa_nombre=${encodeURIComponent(lead.empresa || lead.cliente || '')}&telefono=${encodeURIComponent(lead.telefono || '')}&mail=${encodeURIComponent(lead.mail || '')}&ruc=${encodeURIComponent(lead.ruc || '')}&dni=${encodeURIComponent(lead.dni_representante || '')}&proyecto_id=${encodeURIComponent(lead.id)}&proyecto_nombre=${encodeURIComponent(lead.proyecto || '')}`}
            className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-bold bg-[#ffc500] hover:bg-[#e6b000] text-gray-900 rounded-xl transition-all shadow-sm hover:shadow-md">
            <FileText size={15} /> {lead.cotizaciones_url ? 'Nueva cotización' : 'Realizar cotización'}
          </a>
          <a href={lead.notion_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-xl transition-colors">
            <ExternalLink size={14} /> Ver en Notion
          </a>

          {onDelete && (
            confirmarBorrar ? (
              <div className="flex gap-2">
                <button onClick={() => setConfirmarBorrar(false)} disabled={loading}
                  className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={eliminarLead} disabled={loading}
                  className="flex-1 py-2 text-sm font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-xl disabled:opacity-40">
                  {loading ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmarBorrar(true)}
                className="flex items-center justify-center gap-2 w-full py-2 text-xs text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                <Trash2 size={14} /> Eliminar lead
              </button>
            )
          )}
        </div>
      </div>

      {/* Overlay de edición */}
      {editando && onSaveEdit && (
        <LeadEditForm
          lead={lead}
          usuarios={usuarios}
          campanas={campanas}
          onClose={() => setEditando(false)}
          onSave={async (campos) => { await onSaveEdit(lead.id, campos); setEditando(false); }}
        />
      )}
    </div>
  );
}

'use client';
// Ventana flotante del lead del chat abierto (se abre desde la etiqueta junto al
// nombre del chat). Ver y editar el lead, marcar el seguimiento, enlazar este
// chat a un lead existente, unir un lead duplicado, desvincular o eliminar.
// Nunca envía mensajes.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { X, Loader2, UserPlus, Link2, Unlink, Trash2, Merge, Search, CheckCircle2, XCircle, Send, ExternalLink, Repeat, History, MoreHorizontal, Pencil, Plus, FileText, Trophy } from 'lucide-react';
import type { CanalMensajes, ChatLeido } from '@/lib/desktop';
import type { Lead } from '@/types/crm';
import { claveChat } from '@/lib/chatLog';
import { chatsDe, ESTADOS_LEAD, NOMBRE_ESTADO, COLOR_ESTADO, esCerrado } from '@/lib/leadChat';
import { hoyLima, formatCurrency, diasEntreFechasISO } from '@/lib/utils';
import { useNotify, useConfirm } from '@/components/ui/Feedback';
import DatePicker from '@/components/ui/DatePicker';
import Selector from '@/components/ui/Selector';

const NOMBRE_CANAL: Record<CanalMensajes, string> = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', tiktok: 'TikTok' };
const inp = 'w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-800 focus:outline-none focus:border-[var(--acento)]';
const lbl = 'block text-[11px] font-semibold text-gray-500 mb-1';
const btn = 'h-9 px-3 rounded-xl border border-gray-200 bg-white text-[12.5px] font-medium text-gray-700 hover:border-gray-300 flex items-center justify-center gap-1.5 disabled:opacity-50';

async function patchLead(pageId: string, fields: any) {
  const r = await fetch('/api/notion/pipeline', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId, fields }) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'No se pudo guardar'); }
}

function Buscador({ leads, excluir, onElegir, texto }: { leads: Lead[]; excluir?: string; onElegir: (l: Lead) => void; texto: string }) {
  const [q, setQ] = useState('');
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase(), dig = t.replace(/\D/g, '');
    return leads.filter(l => l.id !== excluir).filter(l => !t
      || `${l.cliente} ${l.empresa} ${l.proyecto}`.toLowerCase().includes(t)
      || (dig.length >= 4 && (l.telefono || '').replace(/\D/g, '').includes(dig))).slice(0, 40);
  }, [leads, q, excluir]);
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 h-9 px-3 rounded-xl border border-gray-200 bg-white focus-within:border-[var(--acento)]">
        <Search size={14} className="text-gray-400" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, empresa, proyecto o teléfono" aria-label="Buscar lead" className="flex-1 bg-transparent text-[13px] outline-none" />
      </label>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
        {lista.map(l => (
          <button key={l.id} onClick={() => onElegir(l)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLOR_ESTADO[l.estado_lead] || '#9ca3af' }} />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium text-gray-800 truncate">{l.cliente || l.empresa || l.proyecto}</span>
              <span className="block text-[11.5px] text-gray-500 truncate">{[l.proyecto, l.telefono, NOMBRE_ESTADO[l.estado_lead]].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="text-[11.5px] font-semibold text-[var(--acento)]">{texto}</span>
          </button>
        ))}
        {!lista.length && <p className="px-3 py-3 text-[12.5px] text-gray-400">Sin resultados</p>}
      </div>
    </div>
  );
}

export default function LeadDelChat({ canal, chat, lead: leadInicial, enlazado: enlazadoInicial, relacionados = [], leads, onClose, onCambio, onCrear }: {
  canal: CanalMensajes; chat: ChatLeido | null; lead: Lead | null; enlazado: boolean; relacionados?: Lead[]; leads: Lead[];
  onClose: () => void; onCambio: () => void; onCrear: () => void;
}) {
  const notify = useNotify();
  const confirmar = useConfirm();
  const clave = claveChat(canal, chat);
  // Proyecto que se está viendo (se puede cambiar desde el historial del cliente)
  const [lead, setLeadSel] = useState<Lead | null>(leadInicial);
  const enlazado = !!lead && !!clave && chatsDe(lead).includes(clave) || (lead?.id === leadInicial?.id && enlazadoInicial);
  const [modo, setModo] = useState<'ver' | 'enlazar' | 'unir' | 'nuevo'>(leadInicial ? 'ver' : 'enlazar');
  const [ocupado, setOcupado] = useState('');
  const [editando, setEditando] = useState(false);
  const [menu, setMenu] = useState(false);
  const formDe = (l: Lead | null) => ({
    cliente: l?.cliente || '', empresa: l?.empresa || '', telefono: l?.telefono || '', proyecto: l?.proyecto || '',
    estado: l?.estado_lead || 'NUEVO LEAD', proximo: l?.proximo_seguimiento?.slice(0, 10) || '',
  });
  const [f, setF] = useState(() => formDe(leadInicial));
  useEffect(() => { setF(formDe(lead)); }, [lead]); // eslint-disable-line react-hooks/exhaustive-deps
  const historial = relacionados.length ? relacionados : (lead ? [lead] : []);
  const ganados = historial.filter(l => l.estado_lead === 'GANADO');
  const [nuevo, setNuevo] = useState({ servicio: '', estado: 'NUEVO LEAD' });

  // Cliente que vuelve: nuevo proyecto (lead) sobre la MISMA ficha, sin empezar de cero
  const crearProyecto = () => lead && hacer('nuevo', async () => {
    const previos = ganados.map(l => l.proyecto).filter(Boolean).slice(0, 5).join(', ');
    const r = await fetch('/api/notion/pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proyecto: nuevo.servicio.trim() || `Nueva consulta de ${lead.cliente || lead.empresa || 'cliente'}`,
        empresa_id: lead.empresa_id || null, estado_lead: nuevo.estado, fecha_contactado: hoyLima(),
        canal: NOMBRE_CANAL[canal],
        notas: `Cliente recurrente (vuelve a cotizar).${previos ? ` Proyectos anteriores: ${previos}.` : ''}`,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No se pudo crear el proyecto');
    if (d.lead?.id && clave) await patchLead(d.lead.id, { chats_vinculados: clave }).catch(() => {});
  }, 'Nuevo proyecto creado para este cliente', true);
  const set = (k: keyof typeof f) => (e: any) => setF(x => ({ ...x, [k]: e.target.value }));
  const titulo = chat?.nombre || (chat?.telefono ? `+${chat.telefono}` : 'Chat');

  async function hacer(id: string, fn: () => Promise<void>, aviso: string, cerrar = false) {
    setOcupado(id);
    try { await fn(); notify.success(aviso); onCambio(); if (cerrar) onClose(); }
    catch (e: any) { notify.error(e.message || 'No se pudo completar'); }
    finally { setOcupado(''); }
  }

  // Enlazar este chat a un lead existente (no se crea otro: sin duplicados)
  const enlazar = (l: Lead) => hacer('enlazar', async () => {
    const lista = Array.from(new Set([...chatsDe(l), ...(clave ? [clave] : [])]));
    const campos: any = { chats_vinculados: lista.join('\n') };
    // WhatsApp es el canal principal: si el lead no tenía teléfono, se guarda
    if (canal === 'whatsapp' && chat?.telefono && !l.telefono && l.empresa_id) campos.telefono = '+' + chat.telefono;
    await patchLead(l.id, campos);
  }, `Chat enlazado a ${l.cliente || l.proyecto}`, true);

  // Unir un lead duplicado dentro de este: se pasan sus chats y notas y se elimina
  const unir = async (dup: Lead) => {
    if (!lead) return;
    const ok = await confirmar({ titulo: `¿Unir "${dup.cliente || dup.proyecto}" con este lead?`, mensaje: 'Sus chats y notas pasan a este lead y el duplicado se elimina del CRM.', confirmar: 'Unir', peligro: true });
    if (!ok) return;
    await hacer('unir', async () => {
      const lista = Array.from(new Set([...chatsDe(lead), ...chatsDe(dup), ...(clave ? [clave] : [])]));
      const nota = `[Unido] ${dup.cliente || dup.proyecto}${dup.telefono ? ` · ${dup.telefono}` : ''}${dup.notas_seguimiento ? `\n${dup.notas_seguimiento}` : ''}`;
      await patchLead(lead.id, { chats_vinculados: lista.join('\n'), notas_seguimiento: nota });
      const r = await fetch('/api/notion/pipeline', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: dup.id }) });
      if (!r.ok) throw new Error('Se unieron los datos, pero no se pudo eliminar el duplicado');
    }, 'Leads unidos', true);
  };

  const guardar = () => lead && hacer('guardar', async () => {
    const campos: any = {};
    if (f.proyecto !== (lead.proyecto || '')) campos.proyecto = f.proyecto;
    if (f.estado !== lead.estado_lead) campos.estado_lead = f.estado;
    if (f.proximo !== (lead.proximo_seguimiento?.slice(0, 10) || '')) campos.proximo_seguimiento = f.proximo || null;
    if (lead.empresa_id) {
      if (f.cliente !== (lead.cliente || '')) campos.cliente_nombre = f.cliente;
      if (f.empresa !== (lead.empresa || '')) campos.empresa_nombre = f.empresa;
      if (f.telefono !== (lead.telefono || '')) campos.telefono = f.telefono;
    }
    if (Object.keys(campos).length) await patchLead(lead.id, campos);
    setEditando(false);
  }, 'Lead actualizado');

  const seguimiento = (acc: string, txt: string) => lead && hacer(acc, async () => {
    const r = await fetch('/api/notion/pipeline/seguimiento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, accion: acc }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'No se pudo guardar'); }
  }, txt);

  const desvincular = () => lead && clave && hacer('desv', () => patchLead(lead.id, { chats_vinculados: chatsDe(lead).filter(x => x !== clave).join('\n') }), 'Chat desvinculado', true);

  const eliminar = async () => {
    if (!lead) return;
    const ok = await confirmar({ titulo: `¿Eliminar el lead "${lead.cliente || lead.proyecto}"?`, mensaje: 'Se quita del CRM (queda en la papelera de Notion).', confirmar: 'Eliminar', peligro: true });
    if (!ok) return;
    await hacer('eliminar', async () => {
      const r = await fetch('/api/notion/pipeline', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: lead.id }) });
      if (!r.ok) throw new Error('No se pudo eliminar');
    }, 'Lead eliminado', true);
  };

  // ── Vista ────────────────────────────────────────────────────────────────
  const hoy = hoyLima();
  const dias = lead?.proximo_seguimiento ? diasEntreFechasISO(hoy, lead.proximo_seguimiento.slice(0, 10)) : null;
  const tocaHoy = !!lead && !esCerrado(lead) && (dias === null || dias <= 1);
  const cuandoTxt = dias === null ? 'sin fecha de seguimiento' : dias < 0 ? `atrasado ${-dias} día${dias === -1 ? '' : 's'}` : dias === 0 ? 'vence hoy' : dias === 1 ? 'vence mañana' : `en ${dias} días`;
  const nombre = lead ? (lead.cliente || lead.empresa || lead.proyecto) : titulo;
  const iniciales = (nombre || '?').split(/\s+/).map(x => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const accionesMenu: { id: string; txt: string; icon: any; fn: () => void; peligro?: boolean; si?: boolean }[] = [
    { id: 'unir', txt: 'Unir duplicado aquí', icon: Merge, fn: () => setModo('unir'), si: !!lead },
    { id: 'enlazar', txt: 'Fijar este chat a este lead', icon: Link2, fn: () => lead && enlazar(lead), si: !!lead && !enlazado },
    { id: 'desv', txt: 'Desvincular este chat', icon: Unlink, fn: () => { desvincular(); }, si: !!lead && enlazado && !!clave },
    { id: 'otro', txt: 'Enlazar a otro lead', icon: Link2, fn: () => setModo('enlazar'), si: !!lead },
    { id: 'eliminar', txt: 'Eliminar lead', icon: Trash2, fn: () => { eliminar(); }, peligro: true, si: !!lead },
  ];

  return (
    <div data-superpuesto className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col overflow-hidden" onClick={e => { e.stopPropagation(); setMenu(false); }}>
        {/* Cabecera */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <span className="w-11 h-11 rounded-full bg-amber-50 text-amber-700 grid place-items-center font-bold text-[14px] flex-shrink-0">{iniciales}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-[15.5px] font-semibold text-gray-900 truncate">{nombre}</p>
              {ganados.length > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap">Cliente · {ganados.length} proyecto{ganados.length === 1 ? '' : 's'}</span>}
            </div>
            <p className="text-[12px] text-gray-500 truncate">{NOMBRE_CANAL[canal]} · {titulo}{lead ? (enlazado ? ' · chat enlazado' : ' · por teléfono o nombre') : ' · sin lead en el CRM'}</p>
          </div>
          {lead && (
            <div className="relative">
              <button onClick={e => { e.stopPropagation(); setMenu(m => !m); }} aria-label="Más acciones" className="w-9 h-9 rounded-xl border border-gray-200 grid place-items-center text-gray-500 hover:text-gray-800"><MoreHorizontal size={16} /></button>
              {menu && (
                <div className="absolute right-0 top-11 z-10 w-60 bg-white rounded-xl border border-gray-100 shadow-xl py-1" onClick={e => e.stopPropagation()}>
                  {accionesMenu.filter(a => a.si).map(a => (
                    <button key={a.id} onClick={() => { setMenu(false); a.fn(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left hover:bg-gray-50 ${a.peligro ? 'text-rose-600' : 'text-gray-700'}`}>
                      <a.icon size={14} /> {a.txt}
                    </button>
                  ))}
                  <Link href="/crm" onClick={onClose} className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"><ExternalLink size={14} /> Abrir el CRM</Link>
                </div>
              )}
            </div>
          )}
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700"><X size={17} /></button>
        </div>

        <div className="overflow-y-auto">
          {/* Sin lead: registrar o enlazar */}
          {(!lead || modo === 'enlazar') && modo !== 'unir' && modo !== 'nuevo' && (
            <div className="p-5 space-y-4">
              {!lead && (
                <button onClick={() => { onClose(); onCrear(); }} className="w-full h-11 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[13.5px] font-semibold flex items-center justify-center gap-2">
                  <UserPlus size={15} /> Registrar lead nuevo
                </button>
              )}
              <div>
                <p className="text-[12.5px] text-gray-500 mb-2">{lead ? 'Elige el lead al que pertenece este chat:' : '¿Ya está en el CRM con otro nombre, número o red? Enlázalo para no duplicarlo:'}</p>
                <Buscador leads={leads} excluir={lead?.id} onElegir={enlazar} texto={ocupado === 'enlazar' ? '…' : 'Enlazar'} />
              </div>
              {lead && <button onClick={() => setModo('ver')} className={`${btn} w-full`}>Volver</button>}
            </div>
          )}

          {lead && modo === 'ver' && (
            <>
              {/* Lo de hoy */}
              {tocaHoy && (
                <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-100 space-y-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-semibold text-gray-900">Hoy toca: {lead.estado_lead === 'COTIZACION ENVIADA' ? 'seguimiento de la cotización' : 'seguimiento'}</p>
                    <span className={`text-[12px] ${dias !== null && dias < 0 ? 'text-rose-600 font-semibold' : 'text-amber-800'}`}>{cuandoTxt}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => seguimiento('mensaje_enviado', 'Seguimiento: le escribiste')} disabled={!!ocupado} className="h-10 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[13px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                      {ocupado === 'mensaje_enviado' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Le escribí
                    </button>
                    <button onClick={() => seguimiento('respondio', 'Seguimiento: respondió')} disabled={!!ocupado} className={`${btn} !h-10`}><CheckCircle2 size={13} /> Respondió</button>
                    <button onClick={() => seguimiento('no_respondio', 'Seguimiento: no respondió')} disabled={!!ocupado} className={`${btn} !h-10`}><XCircle size={13} /> No respondió</button>
                  </div>
                </div>
              )}

              {/* Cliente que ya cerró: nuevo proyecto */}
              {esCerrado(lead) && (
                <div className="px-5 py-4 bg-emerald-50/70 border-b border-emerald-100 flex items-center gap-3">
                  <Repeat size={16} className="text-emerald-600 flex-shrink-0" />
                  <p className="flex-1 text-[13px] text-emerald-900"><b>Proyecto cerrado.</b> ¿Está cotizando algo nuevo?</p>
                  <button onClick={() => setModo('nuevo')} className="h-9 px-3 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[12.5px] font-semibold whitespace-nowrap">Nuevo proyecto</button>
                </div>
              )}

              {/* Proyecto */}
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11.5px] font-semibold text-gray-500 uppercase tracking-wider">{esCerrado(lead) ? 'Proyecto' : 'Proyecto en curso'}</p>
                  {!editando
                    ? <button onClick={() => setEditando(true)} className="text-[12.5px] font-medium text-[var(--acento)] flex items-center gap-1"><Pencil size={12} /> Editar</button>
                    : <div className="flex gap-2"><button onClick={() => { setEditando(false); setF(formDe(lead)); }} className="text-[12.5px] text-gray-500">Cancelar</button>
                        <button onClick={guardar} disabled={!!ocupado} className="text-[12.5px] font-semibold text-[var(--acento)] flex items-center gap-1">{ocupado === 'guardar' && <Loader2 size={12} className="animate-spin" />} Guardar</button></div>}
                </div>
                {editando ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lbl}>Persona de contacto</label><input className={inp} value={f.cliente} onChange={set('cliente')} disabled={!lead.empresa_id} /></div>
                    <div><label className={lbl}>Empresa</label><input className={inp} value={f.empresa} onChange={set('empresa')} disabled={!lead.empresa_id} /></div>
                    <div><label className={lbl}>Teléfono</label><input className={inp} value={f.telefono} onChange={set('telefono')} disabled={!lead.empresa_id} /></div>
                    <div><label className={lbl}>Estado</label>
                      <Selector value={f.estado} onChange={set('estado')} className={inp}>
                        {ESTADOS_LEAD.map(e => <option key={e} value={e}>{NOMBRE_ESTADO[e]}</option>)}
                      </Selector>
                    </div>
                    <div className="col-span-2"><label className={lbl}>Servicio / proyecto</label><input className={inp} value={f.proyecto} onChange={set('proyecto')} /></div>
                    <div className="col-span-2"><label className={lbl}>Próximo seguimiento</label><DatePicker value={f.proximo} borrable onChange={v => setF(x => ({ ...x, proximo: v }))} /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                    <div className="col-span-2"><p className="text-[11.5px] text-gray-500">Servicio</p><p className="text-gray-900">{lead.proyecto || '—'}</p></div>
                    <div><p className="text-[11.5px] text-gray-500">Estado</p><p className="flex items-center gap-1.5 text-gray-900"><span className="w-2 h-2 rounded-full" style={{ background: COLOR_ESTADO[lead.estado_lead] }} />{NOMBRE_ESTADO[lead.estado_lead]}</p></div>
                    <div><p className="text-[11.5px] text-gray-500">Próximo seguimiento</p><p className="text-gray-900">{lead.proximo_seguimiento ? `${lead.proximo_seguimiento.slice(8, 10)}/${lead.proximo_seguimiento.slice(5, 7)}/${lead.proximo_seguimiento.slice(0, 4)}` : '—'}</p></div>
                    <div><p className="text-[11.5px] text-gray-500">Contacto</p><p className="text-gray-900 truncate">{lead.cliente || '—'}</p></div>
                    <div><p className="text-[11.5px] text-gray-500">Teléfono</p><p className="text-gray-900 truncate">{lead.telefono || '—'}</p></div>
                  </div>
                )}
                {!editando && !esCerrado(lead) && (
                  <div className="flex gap-2">
                    {lead.cotizaciones_url && <a href={lead.cotizaciones_url} target="_blank" rel="noopener noreferrer" className={`${btn} flex-1`}><FileText size={13} /> Ver cotización</a>}
                    <button onClick={() => seguimiento('ganado', 'Lead marcado como ganado: pasa a Producción')} disabled={!!ocupado} className={`${btn} flex-1`}><Trophy size={13} /> Marcar ganado</button>
                  </div>
                )}
              </div>

              {/* Historial del cliente */}
              <div className="px-5 pt-4 pb-5 border-t border-gray-100 space-y-2.5">
                <p className="text-[11.5px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1"><History size={12} /> Historial del cliente</p>
                {historial.length > 0 && (
                  <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {historial.map(h => (
                      <button key={h.id} onClick={() => { setLeadSel(h); setEditando(false); }}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 ${h.id === lead.id ? 'bg-[var(--acento-suave)]' : ''}`}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLOR_ESTADO[h.estado_lead] || '#9ca3af' }} />
                        <span className="flex-1 min-w-0 truncate text-[12.5px] text-gray-800">{h.proyecto || 'Sin nombre'}</span>
                        <span className="text-[11.5px] text-gray-500 whitespace-nowrap">{NOMBRE_ESTADO[h.estado_lead]}{h.total ? ` · ${formatCurrency(h.total)}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setModo('nuevo')} className="w-full h-10 rounded-xl border border-dashed border-gray-300 text-[13px] text-gray-700 hover:border-[var(--acento)] flex items-center justify-center gap-1.5"><Plus size={14} /> Nuevo proyecto para este cliente</button>
              </div>
            </>
          )}

          {lead && modo === 'unir' && (
            <div className="p-5 space-y-3">
              <p className="text-[12.5px] text-gray-500">Elige el lead duplicado (por ejemplo el que se creó desde Messenger). Sus chats y notas pasan a <b>{lead.cliente || lead.proyecto}</b> y el duplicado se elimina.</p>
              <Buscador leads={leads} excluir={lead.id} onElegir={unir} texto={ocupado === 'unir' ? '…' : 'Unir'} />
              <button onClick={() => setModo('ver')} className={`${btn} w-full`}>Volver</button>
            </div>
          )}

          {lead && modo === 'nuevo' && (
            <div className="p-5 space-y-3">
              <p className="text-[12.5px] text-gray-500">Nuevo proyecto para <b>{lead.cliente || lead.empresa}</b>. Se crea como lead sobre su misma ficha (no desde cero) y este chat queda enlazado a él.</p>
              <div><label className={lbl}>¿Qué está cotizando?</label><input autoFocus className={inp} value={nuevo.servicio} onChange={e => setNuevo(n => ({ ...n, servicio: e.target.value }))} placeholder="Ej.: Cobertura de evento de fin de año" /></div>
              <div><label className={lbl}>Estado</label>
                <Selector value={nuevo.estado} onChange={e => setNuevo(n => ({ ...n, estado: e.target.value }))} className={inp}>
                  {['NUEVO LEAD', 'CONTACTADO', 'COTIZACION ENVIADA'].map(e => <option key={e} value={e}>{NOMBRE_ESTADO[e]}</option>)}
                </Selector>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setModo('ver')} className={btn}>Volver</button>
                <button onClick={crearProyecto} disabled={!!ocupado} className="h-9 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[12.5px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                  {ocupado === 'nuevo' && <Loader2 size={13} className="animate-spin" />} Crear proyecto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

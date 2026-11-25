'use client';
// Ventana flotante del lead del chat abierto (se abre desde la etiqueta junto al
// nombre del chat). Ver y editar el lead, marcar el seguimiento, enlazar este
// chat a un lead existente, unir un lead duplicado, desvincular o eliminar.
// Nunca envía mensajes.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { X, Loader2, UserPlus, Link2, Unlink, Trash2, Merge, Search, CheckCircle2, XCircle, Send, ExternalLink, Repeat, History } from 'lucide-react';
import type { CanalMensajes, ChatLeido } from '@/lib/desktop';
import type { Lead } from '@/types/crm';
import { claveChat } from '@/lib/chatLog';
import { chatsDe, ESTADOS_LEAD, NOMBRE_ESTADO, COLOR_ESTADO, esCerrado } from '@/lib/leadChat';
import { hoyLima, formatCurrency } from '@/lib/utils';
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
    if (!Object.keys(campos).length) return;
    await patchLead(lead.id, campos);
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

  return (
    <div data-superpuesto className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 h-14 border-b border-gray-100 flex-shrink-0">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: lead ? COLOR_ESTADO[lead.estado_lead] : '#d1d5db' }} />
          <div className="flex-1 min-w-0">
            <p className="text-[14.5px] font-semibold text-gray-900 truncate">{lead ? (lead.cliente || lead.empresa || lead.proyecto) : titulo}</p>
            <p className="text-[11.5px] text-gray-500 truncate">{NOMBRE_CANAL[canal]} · {titulo}{lead ? ` · ${enlazado ? 'chat enlazado' : 'encontrado por teléfono o nombre'}` : ' · sin lead en el CRM'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700"><X size={17} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {!lead && modo === 'enlazar' && (
            <>
              <button onClick={() => { onClose(); onCrear(); }} className="w-full h-10 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[13px] font-semibold flex items-center justify-center gap-2">
                <UserPlus size={15} /> Registrar lead nuevo
              </button>
              <div>
                <p className="text-[12.5px] text-gray-500 mb-2">¿Ya está en el CRM con otro nombre, otro número o desde otra red? Enlázalo para no duplicarlo:</p>
                <Buscador leads={leads} onElegir={enlazar} texto={ocupado === 'enlazar' ? '…' : 'Enlazar'} />
              </div>
            </>
          )}

          {lead && modo === 'ver' && (
            <>
              {(esCerrado(lead) || ganados.length > 0) && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex items-center gap-3">
                  <Repeat size={16} className="text-emerald-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-emerald-800">{ganados.length ? `Cliente: ${ganados.length} proyecto${ganados.length === 1 ? '' : 's'} con nosotros` : 'Proyecto cerrado'}</p>
                    <p className="text-[12px] text-emerald-700/80">¿Está cotizando algo nuevo? Créalo sobre su misma ficha.</p>
                  </div>
                  <button onClick={() => setModo('nuevo')} className="h-9 px-3 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[12.5px] font-semibold whitespace-nowrap">Nuevo proyecto</button>
                </div>
              )}
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
              <button onClick={guardar} disabled={!!ocupado} className="w-full h-10 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {ocupado === 'guardar' && <Loader2 size={14} className="animate-spin" />} Guardar cambios
              </button>
              <div>
                <p className={lbl}>Seguimiento de hoy</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => seguimiento('mensaje_enviado', 'Seguimiento: le escribiste')} disabled={!!ocupado} className={btn}><Send size={13} /> Le escribí</button>
                  <button onClick={() => seguimiento('respondio', 'Seguimiento: respondió')} disabled={!!ocupado} className={btn}><CheckCircle2 size={13} /> Respondió</button>
                  <button onClick={() => seguimiento('no_respondio', 'Seguimiento: no respondió')} disabled={!!ocupado} className={btn}><XCircle size={13} /> No respondió</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={() => setModo('unir')} className={btn}><Merge size={13} /> Unir duplicado aquí</button>
                {enlazado && clave ? <button onClick={desvincular} disabled={!!ocupado} className={btn}><Unlink size={13} /> Desvincular chat</button>
                  : <button onClick={() => enlazar(lead)} disabled={!!ocupado} className={btn}><Link2 size={13} /> Fijar enlace</button>}
                <Link href="/crm" onClick={onClose} className={btn}><ExternalLink size={13} /> Abrir CRM</Link>
                <button onClick={eliminar} disabled={!!ocupado} className={`${btn} !text-rose-600 hover:!border-rose-200`}><Trash2 size={13} /> Eliminar lead</button>
              </div>
              {historial.length > 1 && (
                <div>
                  <p className={`${lbl} flex items-center gap-1`}><History size={12} /> Proyectos de este cliente</p>
                  <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {historial.map(h => (
                      <button key={h.id} onClick={() => setLeadSel(h)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 ${h.id === lead.id ? 'bg-[var(--acento-suave)]' : ''}`}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLOR_ESTADO[h.estado_lead] || '#9ca3af' }} />
                        <span className="flex-1 min-w-0 truncate text-[12.5px] text-gray-800">{h.proyecto || 'Sin nombre'}</span>
                        <span className="text-[11.5px] text-gray-500 whitespace-nowrap">{NOMBRE_ESTADO[h.estado_lead]}{h.total ? ` · ${formatCurrency(h.total)}` : ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!esCerrado(lead) && ganados.length === 0 && (
                <button onClick={() => setModo('nuevo')} className={`${btn} w-full`}><UserPlus size={13} /> Otro proyecto para este cliente</button>
              )}
            </>
          )}

          {lead && modo === 'nuevo' && (
            <>
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
            </>
          )}

          {lead && modo === 'unir' && (
            <>
              <p className="text-[12.5px] text-gray-500">Elige el lead duplicado (por ejemplo el que se creó desde Messenger). Sus chats y notas pasan a <b>{lead.cliente || lead.proyecto}</b> y el duplicado se elimina.</p>
              <Buscador leads={leads} excluir={lead.id} onElegir={unir} texto={ocupado === 'unir' ? '…' : 'Unir'} />
              <button onClick={() => setModo('ver')} className={`${btn} w-full`}>Volver</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

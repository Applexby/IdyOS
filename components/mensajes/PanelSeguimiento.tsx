'use client';
// Seguimiento desde el chat: datos del lead del chat abierto (último contacto,
// próximo seguimiento, bitácora) y la lista de seguimientos para hoy. Usa el
// mismo CRM y la misma cadencia (3 → 7 → 14 → 30 días).
// Solo lee la cabecera del chat abierto (nombre/teléfono); nunca envía nada.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, UserPlus, MessageCircleMore, CheckCircle2, XCircle, FileText, CalendarClock, ExternalLink, ClipboardPaste, RefreshCw } from 'lucide-react';
import type { CanalMensajes, ChatLeido, PuenteIdyos } from '@/lib/desktop';
import type { Lead } from '@/types/crm';
import { hoyLima, diasEntreFechasISO } from '@/lib/utils';
import { claveChat, eventosChat, registrarEvento, hace, esElMismo, type EventoChat } from '@/lib/chatLog';
import { useNotify } from '@/components/ui/Feedback';

interface PlantillaMini { id: string; nombre: string; categoria: string; cuerpo: string }

const ESTADO_TXT: Record<string, string> = {
  'NUEVO LEAD': 'Nuevo', CONTACTADO: 'Contactado', SEGUIMIENTO: 'Seguimiento', 'COTIZACION ENVIADA': 'Cotización enviada', Negociacion: 'Negociación',
};

function cuando(fecha: string | null, hoy: string) {
  if (!fecha) return '—';
  const d = diasEntreFechasISO(hoy, fecha.slice(0, 10));
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}

export default function PanelSeguimiento({ api, canal, plantillas, onPegar, onCrearLead }: {
  api: PuenteIdyos; canal: CanalMensajes; plantillas: PlantillaMini[];
  onPegar: (p: PlantillaMini) => void; onCrearLead: () => void;
}) {
  const notify = useNotify();
  const hoy = hoyLima();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cargando, setCargando] = useState(true);
  const [chat, setChat] = useState<ChatLeido | null>(null);
  const [eventos, setEventos] = useState<EventoChat[]>([]);
  const [ocupado, setOcupado] = useState('');

  const cargarLeads = useCallback(() => {
    setCargando(true);
    fetch('/api/notion/pipeline?solo_activos=true').then(r => r.json()).then(d => setLeads(d.leads || [])).catch(() => {}).finally(() => setCargando(false));
  }, []);
  useEffect(() => { cargarLeads(); }, [cargarLeads]);

  // Cabecera del chat abierto: se mira cada 3 s solo mientras este panel está a la vista
  useEffect(() => {
    let vivo = true;
    const mirar = () => {
      if (document.hidden) return;
      api.meta?.chatActual?.(canal).then(c => { if (vivo) setChat(c && (c.nombre || c.telefono) ? c : null); }).catch(() => {});
    };
    mirar();
    const t = setInterval(mirar, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [api, canal]);

  const clave = claveChat(canal, chat);
  useEffect(() => {
    const leer = () => setEventos(eventosChat(clave));
    leer();
    window.addEventListener('idyos:chats', leer);
    return () => window.removeEventListener('idyos:chats', leer);
  }, [clave]);

  const lead = useMemo(() => (chat ? leads.find(l => esElMismo(l, chat)) || null : null), [leads, chat]);
  const paraHoy = useMemo(() => leads
    .filter(l => l.proximo_seguimiento && l.proximo_seguimiento.slice(0, 10) <= hoy && (l.contactado_hoy || '').slice(0, 10) !== hoy)
    .sort((a, b) => (a.proximo_seguimiento || '').localeCompare(b.proximo_seguimiento || '')), [leads, hoy]);
  const deSeguimiento = plantillas.filter(p => /seguimiento/i.test(p.categoria));

  async function accion(l: Lead, acc: 'mensaje_enviado' | 'respondio' | 'no_respondio' | 'cotizacion_enviada', txt: string) {
    setOcupado(acc);
    try {
      const r = await fetch('/api/notion/pipeline/seguimiento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: l.id, accion: acc }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      registrarEvento(clave, { tipo: 'seguimiento', detalle: txt });
      notify.success(`${txt} · ${l.cliente || l.proyecto}`);
      cargarLeads();
    } catch (e: any) { notify.error(e.message); }
    finally { setOcupado(''); }
  }

  const Btn = ({ onClick, icon: I, children, id }: any) => (
    <button onClick={onClick} disabled={!!ocupado}
      className="h-8 rounded-lg border border-[#e4e7ee] dark:border-[#2a2a2a] text-[11.5px] font-medium text-[#374151] dark:text-[#d4d4d4] hover:border-[var(--acento)] flex items-center justify-center gap-1 disabled:opacity-50">
      {ocupado === id ? <Loader2 size={12} className="animate-spin" /> : <I size={12} />} {children}
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto scroll-fino p-2 space-y-3">
      {/* Este chat */}
      <div className="rounded-xl border border-[#eef0f4] dark:border-[#232323] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Este chat</p>
          <button onClick={cargarLeads} title="Actualizar del CRM" className="text-[#9aa3b2] hover:text-[#111827] dark:hover:text-white"><RefreshCw size={12} className={cargando ? 'animate-spin' : ''} /></button>
        </div>
        {!chat ? (
          <p className="text-[12px] text-[#9aa3b2]">Abre una conversación para ver su seguimiento.</p>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-[#111827] dark:text-white truncate">{lead?.cliente || chat.nombre || `+${chat.telefono}`}</p>
            {chat.telefono && <p className="text-[11.5px] text-[#6b7280]">+{chat.telefono}</p>}
            {!lead ? (
              <div className="mt-2">
                <p className="text-[12px] text-[#6b7280] mb-2">{cargando ? 'Buscando en el CRM…' : 'No está en el CRM.'}</p>
                {!cargando && (
                  <button onClick={onCrearLead} className="w-full h-8 rounded-lg bg-[var(--acento)] text-[var(--acento-texto)] text-[12px] font-semibold flex items-center justify-center gap-1.5">
                    <UserPlus size={13} /> Crear lead
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-[11.5px] text-[#6b7280] truncate">{lead.proyecto}</p>
                <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
                  <div className="rounded-lg bg-[#fafbfc] dark:bg-[#1a1a1a] p-2"><p className="text-[#9aa3b2]">Estado</p><p className="font-medium text-[#111827] dark:text-white">{ESTADO_TXT[lead.estado_lead] || lead.estado_lead}</p></div>
                  <div className="rounded-lg bg-[#fafbfc] dark:bg-[#1a1a1a] p-2"><p className="text-[#9aa3b2]">Primer contacto</p><p className="font-medium text-[#111827] dark:text-white">{cuando(lead.fecha_contactado, hoy)}</p></div>
                  <div className="rounded-lg bg-[#fafbfc] dark:bg-[#1a1a1a] p-2"><p className="text-[#9aa3b2]">Último contacto</p><p className="font-medium text-[#111827] dark:text-white">{eventos[0] ? hace(eventos[0].t) : cuando(lead.fecha_ultimo_contacto || lead.fecha_contactado, hoy)}</p></div>
                  <div className={`rounded-lg p-2 ${lead.proximo_seguimiento && lead.proximo_seguimiento.slice(0, 10) <= hoy ? 'bg-[var(--acento-suave)]' : 'bg-[#fafbfc] dark:bg-[#1a1a1a]'}`}><p className="text-[#9aa3b2]">Próximo seguimiento</p><p className="font-medium text-[#111827] dark:text-white">{cuando(lead.proximo_seguimiento, hoy)}</p></div>
                </div>
                {deSeguimiento.length > 0 && (
                  <div className="space-y-1">
                    {deSeguimiento.slice(0, 4).map(p => (
                      <button key={p.id} onClick={() => onPegar(p)} title={p.cuerpo.slice(0, 300)}
                        className="w-full h-8 rounded-lg bg-[var(--acento-suave)] text-[11.5px] font-semibold text-[#111827] dark:text-white flex items-center gap-1.5 px-2.5 truncate">
                        <ClipboardPaste size={12} className="flex-shrink-0" /> <span className="truncate">{p.nombre}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <Btn id="mensaje_enviado" icon={MessageCircleMore} onClick={() => accion(lead, 'mensaje_enviado', 'Seguimiento enviado')}>Ya le escribí</Btn>
                  <Btn id="respondio" icon={CheckCircle2} onClick={() => accion(lead, 'respondio', 'Respondió')}>Respondió</Btn>
                  <Btn id="no_respondio" icon={XCircle} onClick={() => accion(lead, 'no_respondio', 'No respondió')}>No respondió</Btn>
                  <Btn id="cotizacion_enviada" icon={FileText} onClick={() => accion(lead, 'cotizacion_enviada', 'Cotización enviada')}>Cotización</Btn>
                </div>
                {(eventos.length > 0 || lead.notas_seguimiento) && (
                  <div className="pt-1">
                    <p className="text-[11px] font-semibold text-[#9aa3b2] mb-1">Historial</p>
                    <ul className="space-y-0.5 text-[11px] text-[#6b7280] max-h-40 overflow-y-auto scroll-fino">
                      {eventos.slice(0, 6).map(e => <li key={e.t}>• {hace(e.t)} — {e.detalle}</li>)}
                      {(lead.notas_seguimiento || '').split('\n').filter(Boolean).slice(0, 6).map((n, i) => <li key={i} className="truncate" title={n}>• {n}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Seguimientos para hoy */}
      <div className="rounded-xl border border-[#eef0f4] dark:border-[#232323] p-3">
        <p className="text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide mb-2 flex items-center gap-1"><CalendarClock size={12} /> Para hoy · {paraHoy.length}</p>
        {paraHoy.length === 0 ? (
          <p className="text-[12px] text-[#9aa3b2]">{cargando ? 'Cargando…' : 'No hay seguimientos pendientes hoy.'}</p>
        ) : (
          <div className="space-y-1.5">
            {paraHoy.slice(0, 30).map(l => {
              const tel = (l.telefono || '').replace(/\D/g, '');
              return (
                <div key={l.id} className="rounded-lg bg-[#fafbfc] dark:bg-[#1a1a1a] p-2">
                  <p className="text-[12px] font-medium text-[#111827] dark:text-white truncate">{l.cliente || l.empresa || l.proyecto}</p>
                  <p className="text-[11px] text-[#6b7280] truncate">{l.canal || '—'} · último contacto {cuando(l.fecha_ultimo_contacto || l.fecha_contactado, hoy)} · tocaba {cuando(l.proximo_seguimiento, hoy)}</p>
                  {canal === 'whatsapp' && tel.length >= 8 ? (
                    <button onClick={() => api.meta?.abrirChat?.('whatsapp', tel)}
                      className="mt-1.5 w-full h-7 rounded-md bg-[var(--acento-suave)] text-[11.5px] font-semibold text-[#111827] dark:text-white flex items-center justify-center gap-1">
                      <ExternalLink size={11} /> Abrir chat
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

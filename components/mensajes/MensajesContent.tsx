'use client';
// Mensajes: Messenger (incluye Marketplace) e Instagram dentro de IdyOS.
// La página de Meta se dibuja encima del recuadro central (la coloca el
// programa); a la derecha, plantillas para copiar o pegar en el chat, y arriba
// "Crear lead" con los datos del chat abierto.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, Check, ClipboardPaste, Loader2, PanelRightClose, PanelRightOpen, RefreshCw, Search, UserPlus, MessageCircle, Instagram } from 'lucide-react';
import { useEscritorio, type CanalMensajes, type ChatLeido } from '@/lib/desktop';
import { useNotificaciones } from '@/components/notificaciones/Notificaciones';
import { useNotify } from '@/components/ui/Feedback';
import LeadDesdeChat from './LeadDesdeChat';

interface Plantilla { id: string; nombre: string; categoria: string; canal: string; cuerpo: string }

const CANALES: { id: CanalMensajes; nombre: string; icon: any }[] = [
  { id: 'messenger', nombre: 'Messenger', icon: MessageCircle },
  { id: 'instagram', nombre: 'Instagram', icon: Instagram },
];

export default function MensajesContent() {
  const { escritorio, api } = useEscritorio();
  const router = useRouter();
  const params = useSearchParams();
  const notify = useNotify();
  const notif = useNotificaciones();
  const [canal, setCanal] = useState<CanalMensajes>((params.get('canal') as CanalMensajes) || 'messenger');
  const [panel, setPanel] = useState(true);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [q, setQ] = useState('');
  const [copiada, setCopiada] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [lead, setLead] = useState<{ chat: ChatLeido | null } | null>(null);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => { const c = params.get('canal') as CanalMensajes; if (c === 'messenger' || c === 'instagram') setCanal(c); }, [params]);

  // Plantillas del sistema (Notion)
  useEffect(() => {
    fetch('/api/notion/plantillas').then(r => r.json()).then(d => setPlantillas(d.plantillas || [])).catch(() => {});
  }, []);

  const limites = useCallback(() => {
    const r = host.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  }, []);

  // La vista de Meta se oculta mientras hay algo encima (formulario, notificaciones)
  const tapada = !!lead || notif.abierto;
  useEffect(() => {
    if (!api?.meta) return;
    if (tapada) { api.meta.ocultar(); return; }
    const l = limites();
    if (l) api.meta.mostrar(canal, l);
  }, [api, canal, tapada, panel, limites]);

  // Seguir al recuadro cuando cambia de tamaño (ventana, barra lateral, panel)
  useEffect(() => {
    if (!api?.meta || !host.current) return;
    const mover = () => { const l = limites(); if (l && !tapada) api.meta!.mover(l); };
    const ro = new ResizeObserver(mover);
    ro.observe(host.current);
    document.addEventListener('scroll', mover, true); // si se desplaza el contenido
    return () => { ro.disconnect(); document.removeEventListener('scroll', mover, true); };
  }, [api, limites, tapada]);

  // Al salir de la pantalla, ocultar (sigue cargada para avisar si está activado)
  useEffect(() => () => { window.idyos?.meta?.ocultar(); }, []);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return plantillas.filter(p => !t || `${p.nombre} ${p.categoria} ${p.cuerpo}`.toLowerCase().includes(t));
  }, [plantillas, q]);
  const grupos = useMemo(() => filtradas.reduce<Record<string, Plantilla[]>>((acc, p) => { (acc[p.categoria] ||= []).push(p); return acc; }, {}), [filtradas]);

  async function crearLead() {
    if (!api?.meta) return;
    setLeyendo(true);
    try { setLead({ chat: await api.meta.leer(canal) }); }
    finally { setLeyendo(false); }
  }

  async function copiar(p: Plantilla) {
    try { await navigator.clipboard.writeText(p.cuerpo); setCopiada(p.id); setTimeout(() => setCopiada(null), 1500); } catch { /* noop */ }
  }
  async function pegar(p: Plantilla) {
    const ok = await api?.meta?.pegar(canal, p.cuerpo);
    if (!ok) notify.error('Abre una conversación para pegar la plantilla');
  }

  if (!escritorio) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">Mensajes</h1>
        <p className="text-sm text-gray-500 mt-1">Messenger e Instagram dentro del sistema solo están en el programa de escritorio IdyOS.</p>
      </div>
    );
  }

  const noLeidos = notif.mensajesNoLeidos;

  return (
    <div className="h-full flex flex-col p-3 gap-3 min-h-[calc(100vh-60px)]">
      {lead && (
        <LeadDesdeChat chat={lead.chat} canal={canal} onClose={() => setLead(null)}
          onCreado={() => { setLead(null); notify.success('Lead creado en el CRM'); }} />
      )}

      {/* Barra superior */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#eef1f5] dark:bg-[#161616] border border-[#e4e7ee] dark:border-[#232323]">
          {CANALES.map(({ id, nombre, icon: Icon }) => (
            <button key={id} onClick={() => { setCanal(id); router.replace(`/mensajes?canal=${id}`); }}
              className={`flex items-center gap-2 px-3.5 h-8 rounded-lg text-[13px] transition-colors
                ${canal === id ? 'bg-white dark:bg-[#232323] text-[#111827] dark:text-white font-medium shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#6b7280] hover:text-[#111827] dark:hover:text-white'}`}>
              <Icon size={15} /> {nombre}
              {noLeidos[id] > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--acento)] text-[var(--acento-texto)] text-[10px] font-bold grid place-items-center">{noLeidos[id]}</span>}
            </button>
          ))}
        </div>
        <button onClick={() => api?.meta?.recargar(canal)} title="Recargar"
          className="w-9 h-9 grid place-items-center rounded-xl border border-[#e4e7ee] dark:border-[#232323] text-[#6b7280] hover:text-[#111827] dark:hover:text-white"><RefreshCw size={15} /></button>
        <div className="flex-1" />
        <button onClick={crearLead} disabled={leyendo}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[13px] font-semibold disabled:opacity-60">
          {leyendo ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Crear lead del chat abierto
        </button>
        <button onClick={() => setPanel(v => !v)} title={panel ? 'Ocultar plantillas' : 'Mostrar plantillas'}
          className="w-9 h-9 grid place-items-center rounded-xl border border-[#e4e7ee] dark:border-[#232323] text-[#6b7280] hover:text-[#111827] dark:hover:text-white">
          {panel ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        {/* Recuadro donde el programa coloca Messenger / Instagram */}
        <div ref={host} className="flex-1 min-w-0 rounded-xl border border-[#e4e7ee] dark:border-[#232323] bg-white dark:bg-[#141414] grid place-items-center">
          <div className="text-center text-[13px] text-[#9aa3b2]">
            <Loader2 size={18} className="animate-spin mx-auto mb-2" />
            Cargando {CANALES.find(c => c.id === canal)?.nombre}… La primera vez inicia sesión con tu cuenta.
          </div>
        </div>

        {/* Plantillas */}
        {panel && (
          <aside className="w-[300px] flex-shrink-0 flex flex-col rounded-xl border border-[#e4e7ee] dark:border-[#232323] bg-white dark:bg-[#141414] overflow-hidden">
            <div className="p-3 border-b border-[#eef0f4] dark:border-[#232323]">
              <p className="text-[13px] font-semibold text-[#111827] dark:text-white mb-2">Plantillas</p>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa3b2]" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por servicio…"
                  className="w-full pl-8 pr-2.5 h-8 rounded-lg border border-[#e4e7ee] dark:border-[#2a2a2a] bg-transparent text-[12.5px] outline-none focus:border-[var(--acento)]" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scroll-fino p-2 space-y-3">
              {Object.keys(grupos).length === 0 && <p className="text-center text-[12px] text-[#9aa3b2] py-8">Sin plantillas</p>}
              {Object.entries(grupos).map(([cat, lista]) => (
                <div key={cat}>
                  <p className="px-1 mb-1 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">{cat}</p>
                  <div className="space-y-1.5">
                    {lista.map(p => (
                      <div key={p.id} className="rounded-lg border border-[#eef0f4] dark:border-[#232323] p-2.5">
                        <p className="text-[12.5px] font-medium text-[#111827] dark:text-white truncate">{p.nombre}</p>
                        <p className="text-[11.5px] text-[#6b7280] line-clamp-3 mt-0.5 whitespace-pre-line">{p.cuerpo}</p>
                        <div className="flex gap-1.5 mt-2">
                          <button onClick={() => pegar(p)} title="Pega el texto en el chat abierto (no lo envía)"
                            className="flex-1 h-7 rounded-md bg-[var(--acento-suave)] text-[11.5px] font-semibold text-[#111827] dark:text-white flex items-center justify-center gap-1 hover:brightness-95">
                            <ClipboardPaste size={12} /> Pegar en el chat
                          </button>
                          <button onClick={() => copiar(p)} title="Copiar"
                            className="w-8 h-7 rounded-md border border-[#e4e7ee] dark:border-[#2a2a2a] grid place-items-center text-[#6b7280]">
                            {copiada === p.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="px-3 py-2 text-[10.5px] text-[#9aa3b2] border-t border-[#eef0f4] dark:border-[#232323]">El texto se pega en el chat; tú decides cuándo enviarlo.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

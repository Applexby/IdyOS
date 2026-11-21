'use client';
// Mensajes: Messenger (incluye Marketplace) e Instagram dentro de IdyOS.
// La página de Meta se dibuja encima del recuadro central (la coloca el
// programa); a la derecha, plantillas para copiar o pegar en el chat, y arriba
// "Crear lead" con los datos del chat abierto.
import LogoRed from '@/components/ui/LogoRed';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, Check, ClipboardPaste, Loader2, PanelRightClose, PanelRightOpen, RefreshCw, Search, UserPlus, Sparkles, FileText, GripVertical, FolderOpen } from 'lucide-react';
import { useEscritorio, type CanalMensajes, type ChatLeido, type ModoMensajes } from '@/lib/desktop';
import { useNotificaciones } from '@/components/notificaciones/Notificaciones';
import { useNotify } from '@/components/ui/Feedback';
import LeadDesdeChat from './LeadDesdeChat';
import PanelSeguimiento from './PanelSeguimiento';
import { claveChat, registrarEvento } from '@/lib/chatLog';
import { esImagen, type Adjunto } from '@/lib/adjuntos';
import { useSession } from 'next-auth/react';
import { useTema, ACENTOS } from '@/components/ui/Tema';
import { nombreSaludo, rellenarPlantilla } from '@/lib/saludo';
import { hoyLima } from '@/lib/utils';
import { Camera, Smartphone, PartyPopper, Share2, Building, Plane, Image as ImageIcon, Package, ChevronDown } from 'lucide-react';

interface Plantilla { id: string; nombre: string; categoria: string; canal: string; cuerpo: string; adjuntos?: Adjunto[] }

// Icono de cada paquete según su nombre
function iconoPaquete(nombre: string) {
  const n = nombre.toLowerCase();
  if (n.includes('celular')) return Smartphone;
  if (n.includes('cámara') || n.includes('camara') || n.includes('reel')) return Camera;
  if (n.includes('cobertura') || n.includes('evento')) return PartyPopper;
  if (n.includes('redes')) return Share2;
  if (n.includes('institucional') || n.includes('corporativ')) return Building;
  if (n.includes('dron')) return Plane;
  if (n.includes('foto')) return ImageIcon;
  return Package;
}
// En Mensajes no hacen falta las plantillas de correo ni de llamada
const fueraDeMensajes = (p: Plantilla) => /correo|llamada/i.test(p.canal || '') || /correo|e-?mail/i.test(p.nombre);

const CANALES: { id: CanalMensajes; nombre: string; icon: any }[] = [
  { id: 'whatsapp', nombre: 'WhatsApp', icon: (p: any) => <LogoRed red="whatsapp" {...p} /> },
  { id: 'messenger', nombre: 'Messenger', icon: (p: any) => <LogoRed red="messenger" {...p} /> },
  { id: 'instagram', nombre: 'Instagram', icon: (p: any) => <LogoRed red="instagram" {...p} /> },
  { id: 'tiktok', nombre: 'TikTok', icon: (p: any) => <LogoRed red="tiktok" {...p} className={`${p.className || ''} dark:invert`} /> },
];
const esCanal = (c: string | null): c is CanalMensajes => c === 'whatsapp' || c === 'messenger' || c === 'instagram' || c === 'tiktok';

export default function MensajesContent() {
  const { escritorio, api } = useEscritorio();
  const router = useRouter();
  const params = useSearchParams();
  const notify = useNotify();
  const notif = useNotificaciones();
  const [canal, setCanal] = useState<CanalMensajes>(esCanal(params.get('canal')) ? params.get('canal') as CanalMensajes : 'whatsapp');
  const modo: ModoMensajes = 'chats'; // solo chats (sin notificaciones)
  const [panel, setPanel] = useState(true);
  const [pestana, setPestana] = useState<'plantillas' | 'seguimiento'>('plantillas');
  const [archivos, setArchivos] = useState<Record<string, string>>({}); // url → ruta local
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [q, setQ] = useState('');
  const [copiada, setCopiada] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [lead, setLead] = useState<{ chat: ChatLeido | null } | null>(null);
  const [, setTemaMeta] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({ Bienvenida: true, 'Campaña · Bienvenida': true });
  const { data: session } = useSession();
  const { acento, oscuro } = useTema();
  const colorAcento = ACENTOS.find(a => a.id === acento)?.color || '#ffc500';
  // El tema de Messenger/Instagram sigue el de IdyOS (si está activado)
  useEffect(() => {
    api?.meta?.tema?.({ acento: colorAcento, acentoTexto: ACENTOS.find(a => a.id === acento)?.texto || '#111827', oscuro: document.documentElement.classList.contains('dark') })
      .then(v => setTemaMeta(!!v)).catch(() => {});
  }, [api, colorAcento, oscuro]);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => { const c = params.get('canal'); if (esCanal(c)) setCanal(c); }, [params]);

  // Llegó desde un botón "WhatsApp" del sistema: abrir ese chat (con el texto escrito, sin enviar)
  const tel = params.get('tel'), textoInicial = params.get('texto');
  useEffect(() => {
    if (!api?.meta || params.get('canal') !== 'whatsapp' || (!tel && !textoInicial)) return;
    const t = setTimeout(async () => {
      if (tel) await api.meta!.abrirChat?.('whatsapp', tel, textoInicial || '');
      else if (textoInicial) {
        try { await navigator.clipboard.writeText(textoInicial); } catch { /* noop */ }
        notify.success('Mensaje copiado: abre el chat y pégalo');
      }
      router.replace('/mensajes?canal=whatsapp');
    }, 600);
    return () => clearTimeout(t);
  }, [api, tel, textoInicial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Plantillas del sistema (Notion)
  useEffect(() => {
    // Primero la copia guardada (instantáneo) y luego la versión al día de Notion
    fetch('/api/notion/plantillas').then(r => r.json()).then(d => d.plantillas && setPlantillas(d.plantillas)).catch(() => {});
    fetch('/api/notion/plantillas?refresh=true').then(r => r.json()).then(d => d.plantillas && setPlantillas(d.plantillas)).catch(() => {});
  }, []);

  const limites = useCallback(() => {
    const r = host.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  }, []);

  // ¿Hay una ventana flotante encima? (formulario, notificaciones, búsqueda, ayuda…)
  const [superpuesto, setSuperpuesto] = useState(false);
  useEffect(() => {
    const mirar = () => setSuperpuesto(!!document.querySelector('[data-superpuesto], .fixed.inset-0'));
    mirar();
    const mo = new MutationObserver(mirar);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  // La página de la red es una vista nativa que siempre se dibuja encima: mientras
  // hay algo encima se oculta, dejando de fondo una foto de cómo se veía.
  const tapada = !!lead || notif.abierto || superpuesto;
  const [foto, setFoto] = useState<string | null>(null);
  useEffect(() => {
    if (!api?.meta) return;
    let vivo = true;
    if (tapada) {
      const ocultar = () => { if (vivo) api.meta!.ocultar(); };
      if (api.meta.captura) api.meta.captura().then(img => { if (vivo && img) setFoto(img); ocultar(); }).catch(ocultar);
      else ocultar();
      return () => { vivo = false; };
    }
    const l = limites();
    if (l) api.meta.mostrar(canal, l, modo);
    const t = setTimeout(() => setFoto(null), 250); // quitar la foto cuando ya se ve la página
    return () => { vivo = false; clearTimeout(t); };
  }, [api, canal, modo, tapada, panel, limites]);
  useEffect(() => { setFoto(null); }, [canal]);
  // Entraste a esta red: sus avisos de mensajes ya no hacen falta en la campana
  useEffect(() => { notif.limpiarMensajes?.(canal); }, [canal, notif.avisos.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return plantillas.filter(p => !fueraDeMensajes(p)
      && (canal === 'whatsapp' || !/campa/i.test(p.categoria)) // plantillas de campaña: solo WhatsApp
      && (!t || `${p.nombre} ${p.categoria} ${p.cuerpo}`.toLowerCase().includes(t)));
  }, [plantillas, q, canal]);

  // Archivos de las plantillas: se descargan a esta PC (una vez) para arrastrarlos al chat
  useEffect(() => {
    if (!api?.adjunto) return;
    const todos = plantillas.flatMap(p => p.adjuntos || []).filter(a => !(a.url in archivos));
    todos.forEach(a => api.adjunto!(a.url, a.nombre)
      .then(ruta => setArchivos(m => ({ ...m, [a.url]: ruta || '!' })))
      .catch(() => setArchivos(m => ({ ...m, [a.url]: '!' }))));
  }, [api, plantillas]); // eslint-disable-line react-hooks/exhaustive-deps
  const paquetes = visibles.filter(p => p.categoria === 'Paquetes');
  const grupos = useMemo(() => visibles.filter(p => p.categoria !== 'Paquetes')
    .reduce<Record<string, Plantilla[]>>((acc, p) => { (acc[p.categoria] ||= []).push(p); return acc; }, {}), [visibles]);

  // Variables: {{nombre}} = cliente del chat abierto; {{nombre_usuario}} = quien atiende
  async function textoFinal(p: Plantilla) {
    let cliente = '';
    if (/\{\{\s*nombre\s*\}\}/i.test(p.cuerpo)) {
      const chat = await api?.meta?.leer(canal).catch(() => null);
      cliente = (chat?.nombre || '').split(/\s+/)[0] || '';
    }
    return rellenarPlantilla(p.cuerpo, {
      nombre: cliente,
      nombre_usuario: nombreSaludo(session?.user?.name, session?.user?.email),
      fecha_hoy: hoyLima().split('-').reverse().join('/'),
    });
  }

  async function crearLead() {
    if (!api?.meta) return;
    setLeyendo(true);
    try { setLead({ chat: await api.meta.leer(canal) }); }
    finally { setLeyendo(false); }
  }

  async function copiar(p: Plantilla) {
    try { await navigator.clipboard.writeText(await textoFinal(p)); setCopiada(p.id); setTimeout(() => setCopiada(null), 1500); } catch { /* noop */ }
  }
  async function pegar(p: Plantilla) {
    const ok = await api?.meta?.pegar(canal, await textoFinal(p));
    if (!ok) { notify.error('Abre una conversación para pegar la plantilla'); return; }
    // Recordar en esta PC que a este chat se le envió esta plantilla
    const chat = await api?.meta?.chatActual?.(canal).catch(() => null);
    registrarEvento(claveChat(canal, chat || null), { tipo: 'plantilla', detalle: `Plantilla "${p.nombre}"` });
  }

  // Chip de archivo: se arrastra al chat (archivo real, no el enlace)
  const ChipArchivo = ({ a }: { a: Adjunto }) => {
    const ruta = archivos[a.url] && archivos[a.url] !== '!' ? archivos[a.url] : '';
    const fallo = archivos[a.url] === '!';
    return (
      <div draggable={!!ruta}
        onDragStart={e => { e.preventDefault(); if (ruta) api?.arrastrar?.(ruta); }}
        title={ruta ? 'Arrástralo al chat para adjuntarlo' : fallo ? 'No se pudo descargar (revisa la conexión)' : 'Descargando…'}
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md border border-dashed text-[11px] ${ruta ? 'border-[var(--acento)] cursor-grab active:cursor-grabbing text-[#111827] dark:text-white' : 'border-[#e4e7ee] dark:border-[#2a2a2a] text-[#9aa3b2]'}`}>
        {ruta ? <GripVertical size={11} className="text-[#9aa3b2]" /> : fallo ? <span className="text-red-500">!</span> : <Loader2 size={11} className="animate-spin" />}
        {esImagen(a) ? <ImageIcon size={11} /> : <FileText size={11} />}
        <span className="flex-1 truncate">{a.nombre}</span>
        {ruta && <button onClick={() => api?.mostrarArchivo?.(ruta)} title="Ver en la carpeta" className="text-[#9aa3b2] hover:text-[#111827] dark:hover:text-white"><FolderOpen size={11} /></button>}
      </div>
    );
  };

  if (!escritorio) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">Mensajes</h1>
        <p className="text-sm text-gray-500 mt-1">WhatsApp, Messenger, Instagram y TikTok dentro del sistema solo están en el programa de escritorio IdyOS.</p>
      </div>
    );
  }

  const noLeidos = notif.mensajesNoLeidos;

  return (
    <div className="h-full flex flex-col p-3 gap-3 min-h-[calc(100vh-60px)]">
      {lead && (
        <LeadDesdeChat chat={lead.chat} canal={canal} onClose={() => setLead(null)}
          onCreado={() => { registrarEvento(claveChat(canal, lead.chat), { tipo: 'lead', detalle: 'Lead creado (primer contacto)' }); setLead(null); notify.success('Lead creado en el CRM'); }} />
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
        <button onClick={() => api?.meta?.recargar(canal, modo)} title="Recargar"
          className="w-9 h-9 grid place-items-center rounded-xl border border-[#e4e7ee] dark:border-[#232323] text-[#6b7280] hover:text-[#111827] dark:hover:text-white"><RefreshCw size={15} /></button>
        <div className="flex-1" />
        <button onClick={crearLead} disabled={leyendo}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[13px] font-semibold disabled:opacity-60">
          {leyendo ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Crear lead
        </button>
        <button onClick={() => setPanel(v => !v)} title={panel ? 'Ocultar plantillas' : 'Mostrar plantillas'}
          className="w-9 h-9 grid place-items-center rounded-xl border border-[#e4e7ee] dark:border-[#232323] text-[#6b7280] hover:text-[#111827] dark:hover:text-white">
          {panel ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        {/* Recuadro donde el programa coloca Messenger / Instagram */}
        <div ref={host} className="relative flex-1 min-w-0 rounded-xl border border-[#e4e7ee] dark:border-[#232323] bg-white dark:bg-[#141414] grid place-items-center overflow-hidden">
          {foto && <img src={foto} alt="" className="absolute inset-0 w-full h-full object-fill z-10 pointer-events-none select-none" />}
          <div className="text-center text-[13px] text-[#9aa3b2]">
            <Loader2 size={18} className="animate-spin mx-auto mb-2" />
            Cargando {CANALES.find(c => c.id === canal)?.nombre}… La primera vez inicia sesión con tu cuenta.
          </div>
        </div>

        {/* Plantillas */}
        {panel && (
          <aside className="w-[300px] flex-shrink-0 flex flex-col rounded-xl border border-[#e4e7ee] dark:border-[#232323] bg-white dark:bg-[#141414] overflow-hidden">
            <div className="p-3 border-b border-[#eef0f4] dark:border-[#232323]">
              <div className="flex gap-1 p-0.5 rounded-lg bg-[#eef1f5] dark:bg-[#1a1a1a] mb-2">
                {([['plantillas', 'Plantillas'], ['seguimiento', 'Seguimiento']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setPestana(k)}
                    className={`flex-1 h-7 rounded-md text-[12.5px] ${pestana === k ? 'bg-white dark:bg-[#262626] font-semibold text-[#111827] dark:text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#6b7280]'}`}>{l}</button>
                ))}
              </div>
              {pestana === 'plantillas' && (
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa3b2]" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por servicio…"
                    className="w-full pl-8 pr-2.5 h-8 rounded-lg border border-[#e4e7ee] dark:border-[#2a2a2a] bg-transparent text-[12.5px] outline-none focus:border-[var(--acento)]" />
                </div>
              )}
            </div>
            {pestana === 'seguimiento' && api ? (
              <PanelSeguimiento api={api} canal={canal} plantillas={visibles} onPegar={p => pegar(p as Plantilla)} onCrearLead={crearLead} />
            ) : (
            <div className="flex-1 overflow-y-auto scroll-fino p-2 space-y-3">
              {/* Paquetes: un botón por servicio (lo que más se envía) */}
              {paquetes.length > 0 && (
                <div>
                  <p className="px-1 mb-1.5 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Paquetes y servicios</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {paquetes.map(p => {
                      const Icon = iconoPaquete(p.nombre);
                      return (
                        <div key={p.id} className="group relative">
                          <button onClick={() => pegar(p)} title={`Pegar en el chat:\n\n${p.cuerpo.slice(0, 400)}`}
                            className="w-full h-[68px] rounded-xl border border-[#e4e7ee] dark:border-[#2a2a2a] bg-[#fafbfc] dark:bg-[#1a1a1a] hover:border-[var(--acento)] hover:bg-[var(--acento-suave)] flex flex-col items-center justify-center gap-1 px-2 text-center transition-colors">
                            <Icon size={18} className="text-[var(--acento)]" />
                            <span className="text-[11.5px] font-medium leading-tight text-[#111827] dark:text-white line-clamp-2">{p.nombre}</span>
                          </button>
                          <button onClick={() => copiar(p)} title="Copiar"
                            className="absolute top-1 right-1 w-6 h-6 rounded-md grid place-items-center bg-white/90 dark:bg-[#232323] text-[#6b7280] opacity-0 group-hover:opacity-100">
                            {copiada === p.id ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {paquetes.some(p => p.adjuntos?.length) && (
                    <div className="mt-1.5 space-y-1">{paquetes.flatMap(p => p.adjuntos || []).map(a => <ChipArchivo key={a.url} a={a} />)}</div>
                  )}
                </div>
              )}

              {/* Mensajes rápidos (bienvenida, seguimiento…), plegables */}
              {Object.keys(grupos).length > 0 && <p className="px-1 pt-1 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Mensajes rápidos</p>}
              {Object.entries(grupos).map(([cat, lista]) => {
                const abierto = !!abiertos[cat] || !!q.trim();
                return (
                  <div key={cat} className="rounded-xl border border-[#eef0f4] dark:border-[#232323]">
                    <button onClick={() => setAbiertos(a => ({ ...a, [cat]: !a[cat] }))}
                      className="w-full flex items-center justify-between px-3 h-9 text-[12.5px] font-medium text-[#374151] dark:text-[#d4d4d4]">
                      <span>{cat} <span className="text-[#9aa3b2] font-normal">· {lista.length}</span></span>
                      <ChevronDown size={14} className={`text-[#9aa3b2] transition-transform ${abierto ? 'rotate-180' : ''}`} />
                    </button>
                    {abierto && (
                      <div className="px-2 pb-2 space-y-1.5">
                        {lista.map(p => (
                          <div key={p.id} className="rounded-lg bg-[#fafbfc] dark:bg-[#1a1a1a] p-2.5">
                            <p className="text-[12px] font-medium text-[#111827] dark:text-white truncate">{p.nombre}</p>
                            <p className="text-[11.5px] text-[#6b7280] line-clamp-2 mt-0.5 whitespace-pre-line">{p.cuerpo}</p>
                            {!!p.adjuntos?.length && <div className="mt-1.5 space-y-1">{p.adjuntos.map(a => <ChipArchivo key={a.url} a={a} />)}</div>}
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
                    )}
                  </div>
                );
              })}
              {paquetes.length === 0 && Object.keys(grupos).length === 0 && <p className="text-center text-[12px] text-[#9aa3b2] py-8">Sin plantillas</p>}
            </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

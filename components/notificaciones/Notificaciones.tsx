'use client';
// Centro de notificaciones de IdyOS.
//
// Reúne lo que requiere atención y lo muestra en el panel de la campana:
//   • Seguimientos de leads (toca hoy / atrasados / por reportar / +40 días)
//   • Leads nuevos sin contactar
//   • Cobros pendientes con alerta
//   • Versión nueva del programa
// Se refresca cada 10 minutos. Lo nuevo dispara una notificación de Windows
// (una sola vez por aviso). Las leídas se recuerdan en este PC.
//
// Más adelante IdyNotch podrá consumir estos mismos avisos.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Lead } from '@/types/crm';
import { ESTADOS_ACTIVOS, tareaSeguimiento } from '@/types/crm';
import { diasDesde, hoyLima } from '@/lib/utils';
import { useEscritorio } from '@/lib/desktop';
import { useRouter } from 'next/navigation';

export type TipoAviso = 'mensaje' | 'contactar' | 'atrasado' | 'reportar' | 'perder' | 'nuevo' | 'pago' | 'actualizacion';

export interface Aviso {
  id: string;           // estable: tipo + entidad + día
  tipo: TipoAviso;
  titulo: string;
  detalle: string;
  href: string;
  fecha: string;        // ISO del día
}

interface Ctx {
  avisos: Aviso[];
  noLeidas: number;
  leidas: Set<string>;
  marcarLeida: (id: string) => void;
  marcarTodas: () => void;
  recargar: () => void;
  cargando: boolean;
  abierto: boolean;
  setAbierto: (v: boolean) => void;
  /** No leídos de Messenger / Instagram (del título de cada página) */
  mensajesNoLeidos: Record<'whatsapp' | 'messenger' | 'instagram' | 'tiktok', number>;
}

const NotifCtx = createContext<Ctx | null>(null);
export const useNotificaciones = () => useContext(NotifCtx)!;

const CLAVE_LEIDAS = 'idyos:notif-leidas';
const CLAVE_AVISADAS = 'idyos:notif-avisadas';
const INTERVALO = 10 * 60_000;

function leerSet(clave: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(clave) || '[]')); } catch { return new Set(); }
}
function guardarSet(clave: string, s: Set<string>) {
  try { localStorage.setItem(clave, JSON.stringify(Array.from(s).slice(-500))); } catch { /* noop */ }
}

const nombreLead = (l: Lead) => l.empresa || l.cliente || l.proyecto || 'Lead';

function avisosDeLeads(leads: Lead[]): Aviso[] {
  const hoy = hoyLima();
  const out: Aviso[] = [];
  for (const l of leads) {
    if (l.estado_lead === 'NUEVO LEAD') {
      out.push({ id: `nuevo:${l.id}`, tipo: 'nuevo', titulo: `Nuevo lead: ${nombreLead(l)}`, detalle: 'Sin contactar todavía', href: '/crm', fecha: hoy });
      continue;
    }
    if (!ESTADOS_ACTIVOS.includes(l.estado_lead)) continue;
    const ch = l.contactado_hoy;
    const diasSin = diasDesde(l.fecha_ultimo_contacto || l.fecha_contactado);
    const base = { href: '/dashboard', fecha: hoy };
    if (diasSin !== null && diasSin >= 40) {
      out.push({ ...base, id: `perder:${l.id}:${hoy}`, tipo: 'perder', titulo: `${nombreLead(l)}: +40 días sin respuesta`, detalle: 'Candidato a marcar como perdido' });
      continue;
    }
    if (ch && ch < hoy) { out.push({ ...base, id: `reportar:${l.id}:${ch}`, tipo: 'reportar', titulo: `Reportar seguimiento: ${nombreLead(l)}`, detalle: '¿Respondió al mensaje que enviaste?' }); continue; }
    if (ch && ch === hoy) continue;
    let tarea: 'contactar' | 'atrasado' | null = null;
    if (l.proximo_seguimiento) {
      const d = diasDesde(l.proximo_seguimiento);
      if (d === 0) tarea = 'contactar'; else if (d !== null && d > 0) tarea = 'atrasado';
    } else {
      const t = tareaSeguimiento({ diasDesdeContacto: diasSin, contactadoHoy: false, contactadoAntes: false });
      if (t === 'contactar' || t === 'atrasado') tarea = t;
    }
    if (tarea === 'contactar') out.push({ ...base, id: `contactar:${l.id}:${hoy}`, tipo: 'contactar', titulo: `Toca seguimiento hoy: ${nombreLead(l)}`, detalle: l.estado_lead });
    if (tarea === 'atrasado') out.push({ ...base, id: `atrasado:${l.id}:${hoy}`, tipo: 'atrasado', titulo: `Seguimiento atrasado: ${nombreLead(l)}`, detalle: l.estado_lead });
  }
  return out;
}

function avisosDePagos(proyectos: any[]): Aviso[] {
  const hoy = hoyLima();
  return proyectos
    .filter(p => p.alerta_pago && p.monto_pendiente > 0 && !p.cobranza_oculta)
    .map(p => ({
      id: `pago:${p.id}:${hoy}`, tipo: 'pago' as const, href: '/contabilidad', fecha: hoy,
      titulo: `Cobro pendiente: ${p.proyecto || p.nombre || 'Proyecto'}`,
      detalle: `Pendiente S/ ${Number(p.monto_pendiente).toFixed(2)}`,
    }));
}

const ORDEN: Record<TipoAviso, number> = { mensaje: -1, actualizacion: 0, atrasado: 1, contactar: 2, reportar: 3, pago: 4, perder: 5, nuevo: 6 };

export function ProveedorNotificaciones({ children }: { children: React.ReactNode }) {
  const { actualizacion, api } = useEscritorio();
  const [datos, setDatos] = useState<Aviso[]>([]);
  const [leidas, setLeidas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const primera = useRef(true);
  const router = useRouter();
  const [avisosMensajes, setAvisosMensajes] = useState<Aviso[]>([]);
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState({ whatsapp: 0, messenger: 0, instagram: 0, tiktok: 0 });

  // Messenger / Instagram: avisos de mensajes nuevos y contador de no leídos
  useEffect(() => {
    const meta = api?.meta;
    if (!meta) return;
    meta.noLeidos().then(n => n && setMensajesNoLeidos(m => ({ ...m, ...n }))).catch(() => {});
    return meta.alEvento(d => {
      if (d.evento === 'no-leidos') setMensajesNoLeidos({ whatsapp: d.whatsapp || 0, messenger: d.messenger || 0, instagram: d.instagram || 0, tiktok: d.tiktok || 0 });
      else if (d.evento === 'abrir') router.push(`/mensajes?canal=${d.canal}`);
      else if (d.evento === 'aviso') {
        const a: Aviso = {
          id: `mensaje:${d.canal}:${Date.now()}`, tipo: 'mensaje', fecha: hoyLima(), href: `/mensajes?canal=${d.canal}`,
          titulo: `${d.nombre}: ${d.titulo || 'Mensaje nuevo'}`, detalle: d.cuerpo || 'Tienes un mensaje nuevo',
        };
        setAvisosMensajes(prev => [a, ...prev].slice(0, 20));
      }
    });
  }, [api, router]);

  // Botones "WhatsApp" de todo el sistema (wa.me) → el WhatsApp de IdyOS
  useEffect(() => {
    if (!api?.alAbrirWhatsapp) return;
    return api.alAbrirWhatsapp(({ telefono, texto }) => {
      const q = new URLSearchParams({ canal: 'whatsapp' });
      if (telefono) q.set('tel', telefono);
      if (texto) q.set('texto', texto);
      router.push(`/mensajes?${q.toString()}`);
    });
  }, [api, router]);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [rl, rc]: any[] = await Promise.all([
        fetch('/api/notion/pipeline?solo_activos=true').then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch('/api/notion/contabilidad-proyectos').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      ]);
      setDatos([...avisosDeLeads(rl.leads || []), ...avisosDePagos(rc.proyectos || [])]);
    } finally { setCargando(false); }
  }, []);

  useEffect(() => {
    setLeidas(leerSet(CLAVE_LEIDAS));
    recargar();
    const t = setInterval(recargar, INTERVALO);
    return () => clearInterval(t);
  }, [recargar]);

  const avisos = useMemo(() => {
    const lista = [...avisosMensajes, ...datos];
    if (api && actualizacion?.nueva && ['disponible', 'descargando', 'descargada'].includes(actualizacion.fase)) {
      lista.push({
        id: `actualizacion:${actualizacion.nueva.version}`, tipo: 'actualizacion', href: '/programa', fecha: hoyLima(),
        titulo: actualizacion.fase === 'descargada' ? `IdyOS ${actualizacion.nueva.version} listo para instalar` : `Nueva versión de IdyOS: ${actualizacion.nueva.version}`,
        detalle: actualizacion.fase === 'descargada' ? 'Reinicia el programa para actualizar' : 'Descargando en segundo plano',
      });
    }
    return lista.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);
  }, [datos, avisosMensajes, actualizacion, api]);

  // Notificación de Windows para lo nuevo (una vez por aviso, y no la actualización: ya la avisa el programa)
  useEffect(() => {
    if (!datos.length || typeof Notification === 'undefined') return;
    const avisadas = leerSet(CLAVE_AVISADAS);
    const nuevas = datos.filter(a => !avisadas.has(a.id) && ['contactar', 'atrasado', 'reportar', 'pago', 'nuevo'].includes(a.tipo));
    if (!nuevas.length) return;
    nuevas.forEach(a => avisadas.add(a.id));
    guardarSet(CLAVE_AVISADAS, avisadas);
    if (primera.current && nuevas.length > 3) {
      // Al abrir el programa: un resumen en lugar de muchas notificaciones
      mostrar('IdyOS · Pendientes de hoy', `${nuevas.length} avisos: seguimientos, cobros y leads nuevos.`);
    } else {
      nuevas.slice(0, 3).forEach(a => mostrar(a.titulo, a.detalle));
    }
    primera.current = false;
  }, [datos]);

  function mostrar(titulo: string, cuerpo: string) {
    try {
      const n = new Notification(titulo, { body: cuerpo, silent: false });
      n.onclick = () => { window.focus(); setAbierto(true); };
    } catch { /* notificaciones no disponibles */ }
  }

  const marcarLeida = (id: string) => setLeidas(prev => { const s = new Set(prev); s.add(id); guardarSet(CLAVE_LEIDAS, s); return s; });
  const marcarTodas = () => setLeidas(prev => { const s = new Set(prev); avisos.forEach(a => s.add(a.id)); guardarSet(CLAVE_LEIDAS, s); return s; });
  const noLeidas = avisos.filter(a => !leidas.has(a.id)).length;

  // Número rojo sobre el icono de IdyOS en la barra de tareas (1…99, "99+")
  const totalAviso = noLeidas + Object.values(mensajesNoLeidos).reduce((x, y) => x + y, 0);
  useEffect(() => {
    if (!api?.insignia) return;
    if (!totalAviso) { api.insignia(null, 0); return; }
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); if (!g) return;
    g.fillStyle = '#ef4444'; g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();
    const txt = totalAviso > 99 ? '99+' : String(totalAviso);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${txt.length > 2 ? 12 : txt.length > 1 ? 16 : 19}px Segoe UI, Arial, sans-serif`;
    g.fillText(txt, 16, 17);
    api.insignia(c.toDataURL('image/png'), totalAviso);
  }, [api, totalAviso]);

  return (
    <NotifCtx.Provider value={{ avisos, noLeidas, leidas, marcarLeida, marcarTodas, recargar, cargando, abierto, setAbierto, mensajesNoLeidos }}>
      {children}
    </NotifCtx.Provider>
  );
}

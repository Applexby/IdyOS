'use client';

// Producción: tablero simple con 3 estados y una ficha completa por proyecto.
// La ficha se lee como texto; con "Editar proyecto" toda la ficha pasa a modo
// edición y se guarda de una vez (proyecto en PROYECTOS y contacto en la ficha
// del cliente). Lo que se vendió sale de "Servicios vendidos" (lo escribe la
// cotización). WhatsApp solo abre el chat dentro de IdyOS: nunca envía nada.

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  RefreshCw, ExternalLink, MessageCircle, Copy, Package, FolderOpen,
  Clock, ChevronLeft, Pencil, Plus, X, Loader2, Link as LinkIcon, CheckCircle2, Wallet,
} from 'lucide-react';
import { formatCurrency, diasHasta } from '@/lib/utils';
import { parseHistorialPagos } from '@/lib/pagos';
import { parsearServicios, serializarServicios, totalServicios, type ServicioVendido } from '@/lib/serviciosVendidos';
import { mismaPersona } from '@/lib/equipo';
import DatePicker, { fechaVisible } from '@/components/ui/DatePicker';
import EnlacesDocumentos, { type CampoEnlace } from '@/components/ui/EnlacesDocumentos';
import Selector from '@/components/ui/Selector';
import RegistrarPago, { type DatosPago } from '@/components/contabilidad/RegistrarPago';
import { useNotify, useConfirm } from '@/components/ui/Feedback';
import ModalCierre from '@/components/fidelizacion/ModalCierre';

const fmt = (n: number) => formatCurrency(n);

interface Proyecto {
  id: string; notion_url: string; proyecto: string;
  empresa: string; empresa_id: string | null; cliente: string; telefono: string; mail: string;
  estado_produccion: string;
  cotizaciones_url: string | null; contrato_url: string | null; drive_url: string | null; factura_url: string | null;
  link_entrega: string | null; servicios_vendidos: string;
  total: number | null; monto_pagado: number | null; monto_pendiente: number | null; historial_pagos: string;
  encargado: string;
  fecha_entrega: string | null; notas_produccion: string;
  last_edited_time: string;
}

const ESTADOS = ['Planeando', 'En Progreso', 'En revision'] as const;
const NOMBRE_ESTADO: Record<string, string> = { 'Planeando': 'Planeando', 'En Progreso': 'En progreso', 'En revision': 'En revisión' };
const PUNTO: Record<string, string> = { 'Planeando': 'bg-gray-400', 'En Progreso': 'bg-sky-500', 'En revision': 'bg-violet-500' };

// Las notas antiguas guardaban un checklist "[x] tarea": ya no se usa
const notasLimpias = (t: string) => (t || '').split('\n').filter(l => !/^\s*\[[ xX]\]/.test(l)).join('\n').trim();
const saldo = (p: Proyecto) => p.monto_pendiente ?? ((p.total ?? 0) - (p.monto_pagado ?? 0));
const nombreCorto = (n: string) => (n || '').split(' ')[0];

function abrirChat(telefono: string, texto = '') {
  const n = (telefono || '').replace(/\D/g, '');
  if (n.length < 8) return;
  // wa.me lo intercepta IdyOS y abre el chat en Mensajes (sin enviar nada)
  window.open(`https://wa.me/${n.length === 9 ? '51' + n : n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`, '_blank');
}

function Plazo({ fecha, grande = false }: { fecha: string | null; grande?: boolean }) {
  const d = diasHasta(fecha);
  if (d === null) return grande ? <span className="text-sm text-gray-400">Sin fecha de entrega</span> : null;
  const txt = d < 0 ? `${Math.abs(d)} día${d === -1 ? '' : 's'} tarde` : d === 0 ? 'Entrega hoy' : d === 1 ? 'Entrega mañana' : `Entrega en ${d} días`;
  const color = d < 0 ? 'bg-rose-50 text-rose-600' : d <= 3 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
  return <span className={`inline-flex items-center gap-1 font-semibold rounded-lg ${grande ? 'text-sm px-2.5 py-1' : 'text-[11px] px-2 py-0.5'} ${color}`}><Clock size={grande ? 13 : 10} />{txt}</span>;
}

function ChipPago({ p }: { p: Proyecto }) {
  const total = p.total ?? 0, pend = saldo(p), pagado = p.monto_pagado ?? 0;
  if (!total) return <span className="text-[11px] text-gray-400">Sin monto</span>;
  if (pend <= 0.5) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">Pagado</span>;
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">{pagado > 0 ? 'Saldo' : 'Sin pagar'} {fmt(pend)}</span>;
}

// ─── Tarjeta del tablero ──────────────────────────────────────────────────────
function Tarjeta({ p, onAbrir }: { p: Proyecto; onAbrir: () => void }) {
  const servicios = parsearServicios(p.servicios_vendidos);
  return (
    <div onClick={onAbrir}
      className="group bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)] hover:border-gray-200 transition-all cursor-pointer p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {(p.empresa || p.cliente) && <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide truncate">{p.empresa || p.cliente}</p>}
          <p className="text-[13.5px] font-semibold text-gray-900 leading-snug line-clamp-2">{p.proyecto || '(Sin nombre)'}</p>
        </div>
        <Plazo fecha={p.fecha_entrega} />
      </div>
      {servicios.length > 0 && (
        <p className="text-[12px] text-gray-500 line-clamp-2">{servicios.map(s => (s.cantidad > 1 ? `${s.cantidad} × ` : '') + s.nombre).join(' · ')}</p>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <ChipPago p={p} />
        <div className="flex items-center gap-1.5">
          {p.encargado && <span className="text-[11px] text-gray-400 mr-1">{nombreCorto(p.encargado)}</span>}
          {p.telefono && (
            <button onClick={e => { e.stopPropagation(); abrirChat(p.telefono); }} title="Abrir chat de WhatsApp en IdyOS" aria-label="Abrir chat de WhatsApp"
              className="w-8 h-8 rounded-lg border border-gray-200 grid place-items-center text-emerald-600 hover:bg-emerald-50"><MessageCircle size={14} /></button>
          )}
          {p.drive_url && (
            <button onClick={e => { e.stopPropagation(); window.open(p.drive_url!, '_blank'); }} title="Abrir carpeta del material" aria-label="Abrir carpeta del material"
              className="w-8 h-8 rounded-lg border border-gray-200 grid place-items-center text-gray-500 hover:bg-gray-50"><FolderOpen size={14} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Ficha del proyecto ───────────────────────────────────────────────────────
interface Form {
  proyecto: string; fecha_entrega: string; encargado: string;
  servicios: ServicioVendido[]; total: string; totalTocado: boolean;
  drive_url: string; link_entrega: string; notas: string;
  empresa: string; cliente: string; telefono: string; mail: string;
}

const formDe = (p: Proyecto, usuarios: { name: string }[]): Form => ({
  proyecto: p.proyecto || '',
  fecha_entrega: p.fecha_entrega || '',
  encargado: usuarios.find(u => mismaPersona(u.name, p.encargado))?.name || p.encargado || '',
  servicios: parsearServicios(p.servicios_vendidos),
  total: p.total != null ? String(p.total) : '',
  totalTocado: false,
  drive_url: p.drive_url || '', link_entrega: p.link_entrega || '',
  notas: notasLimpias(p.notas_produccion),
  empresa: p.empresa || '', cliente: p.cliente || '', telefono: p.telefono || '', mail: p.mail || '',
});

const inp = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[var(--acento)] focus:ring-2 focus:ring-[var(--acento-suave)]';
const lbl = 'block text-[11px] font-semibold text-gray-500 mb-1';
const tarjeta = 'bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5';

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-[11px] text-gray-400 mb-0.5">{label}</p><div className="text-sm text-gray-800 break-words">{children}</div></div>;
}

function Ficha({ proyecto: p, usuarios, onVolver, onEstado, onGuardado, onEntregado, onEnlace, onPago }: {
  proyecto: Proyecto; usuarios: { id: string; name: string }[];
  onVolver: () => void;
  onEstado: (estado: string) => void;
  onGuardado: (cambios: Partial<Proyecto>) => void;
  onEntregado: () => Promise<void>;
  onEnlace: (campo: CampoEnlace | 'total', valor: string | number | null) => void;
  onPago: (d: DatosPago) => Promise<boolean>;
}) {
  const notify = useNotify();
  const confirmar = useConfirm();
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState<Form>(() => formDe(p, usuarios));
  const [pagando, setPagando] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const servicios = parsearServicios(p.servicios_vendidos);
  const pagos = parseHistorialPagos(p.historial_pagos);
  const total = p.total ?? 0, pagado = p.monto_pagado ?? 0, pend = saldo(p);
  const sumaForm = totalServicios(form.servicios);

  function empezar() { setForm(formDe(p, usuarios)); setEditando(true); }

  function cambiarServicio(i: number, cambio: Partial<ServicioVendido>) {
    setForm(f => {
      const lista = f.servicios.map((s, j) => j === i ? { ...s, ...cambio } : s);
      return { ...f, servicios: lista, total: f.totalTocado ? f.total : String(totalServicios(lista) || f.total) };
    });
  }
  function quitarServicio(i: number) {
    setForm(f => {
      const lista = f.servicios.filter((_, j) => j !== i);
      return { ...f, servicios: lista, total: f.totalTocado || !lista.length ? f.total : String(totalServicios(lista)) };
    });
  }

  async function guardar() {
    const ini = formDe(p, usuarios);
    const prod: any = {}, cli: any = {};
    if (form.proyecto.trim() !== ini.proyecto) prod.proyecto = form.proyecto.trim();
    if (form.fecha_entrega !== ini.fecha_entrega) prod.fecha_entrega = form.fecha_entrega || null;
    const textoServ = serializarServicios(form.servicios);
    if (textoServ !== serializarServicios(ini.servicios)) prod.servicios_vendidos = textoServ;
    if (form.total.trim() !== ini.total) {
      const n = parseFloat(form.total.replace(/,/g, ''));
      prod.total = form.total.trim() === '' || isNaN(n) ? null : Math.round(n * 100) / 100;
    }
    let drive = form.drive_url.trim(); if (drive && !/^https?:\/\//i.test(drive)) drive = `https://${drive}`;
    let link = form.link_entrega.trim(); if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
    if (drive !== ini.drive_url) prod.drive_url = drive || null;
    if (link !== ini.link_entrega) prod.link_entrega = link || null;
    if (form.notas.trim() !== ini.notas) prod.notas_produccion = form.notas.trim();
    if (form.encargado !== ini.encargado) cli.atendido_por = form.encargado || null;
    if (p.empresa_id) {
      for (const [k, campo] of [['empresa', 'empresa_nombre'], ['cliente', 'cliente_nombre'], ['telefono', 'telefono'], ['mail', 'mail']] as const) {
        if (form[k].trim() !== ini[k].trim()) cli[campo] = form[k].trim();
      }
    }
    if (!Object.keys(prod).length && !Object.keys(cli).length) { setEditando(false); return; }

    setGuardando(true);
    try {
      const pedidos: Promise<Response>[] = [];
      if (Object.keys(prod).length) pedidos.push(fetch('/api/notion/produccion', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: p.id, ...prod }),
      }));
      if (Object.keys(cli).length) pedidos.push(fetch('/api/notion/pipeline', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: p.id, fields: cli }),
      }));
      const res = await Promise.all(pedidos);
      const malo = res.find(r => !r.ok);
      if (malo) { const e = await malo.json().catch(() => ({})); throw new Error(e.error || 'No se pudo guardar'); }
      const cambios: Partial<Proyecto> = {};
      if ('proyecto' in prod) cambios.proyecto = prod.proyecto;
      if ('fecha_entrega' in prod) cambios.fecha_entrega = prod.fecha_entrega;
      if ('servicios_vendidos' in prod) cambios.servicios_vendidos = prod.servicios_vendidos;
      if ('total' in prod) { cambios.total = prod.total; cambios.monto_pendiente = Math.round(((prod.total ?? 0) - pagado) * 100) / 100; }
      if ('drive_url' in prod) cambios.drive_url = prod.drive_url;
      if ('link_entrega' in prod) cambios.link_entrega = prod.link_entrega;
      if ('notas_produccion' in prod) cambios.notas_produccion = prod.notas_produccion;
      if ('atendido_por' in cli) cambios.encargado = cli.atendido_por || '';
      if ('empresa_nombre' in cli) cambios.empresa = cli.empresa_nombre;
      if ('cliente_nombre' in cli) cambios.cliente = cli.cliente_nombre;
      if ('telefono' in cli) cambios.telefono = cli.telefono;
      if ('mail' in cli) cambios.mail = cli.mail;
      onGuardado(cambios);
      setEditando(false);
      notify.success('Proyecto guardado en Notion');
    } catch (e: any) {
      notify.error(e.message || 'No se pudo guardar');
    } finally { setGuardando(false); }
  }

  async function entregar() {
    const ok = await confirmar({
      titulo: '¿Marcar como entregado?',
      mensaje: pend > 0.5 ? `Ojo: aún hay saldo pendiente de ${fmt(pend)}. El proyecto saldrá del tablero (sigue en Contabilidad).` : 'El proyecto saldrá del tablero de Producción.',
      confirmar: 'Sí, entregado',
    });
    if (ok) await onEntregado();
  }

  function copiar(t: string, que: string) { navigator.clipboard.writeText(t).then(() => notify.success(`${que} copiado`)).catch(() => {}); }

  const d = editando ? form : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-5 space-y-5">

        {/* Barra superior */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={onVolver} disabled={editando} className="flex items-center gap-1 text-[13px] font-medium text-gray-500 hover:text-gray-900 disabled:opacity-40">
            <ChevronLeft size={16} /> Producción
          </button>
          {editando ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-medium text-amber-600">Editando · se guarda al presionar Guardar</span>
              <button onClick={() => setEditando(false)} disabled={guardando} className="h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="h-9 px-4 rounded-xl bg-[var(--acento)] text-white text-[13px] font-semibold hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60">
                {guardando && <Loader2 size={13} className="animate-spin" />} Guardar cambios
              </button>
            </div>
          ) : (
            <button onClick={empezar} className="h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:border-[var(--acento)] hover:text-[var(--acento)] flex items-center gap-1.5">
              <Pencil size={13} /> Editar proyecto
            </button>
          )}
        </div>

        {/* Cabecera */}
        <div className={tarjeta}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              {d ? (
                <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
                  <div className="sm:col-span-2"><label className={lbl}>Nombre del proyecto</label><input className={inp} value={d.proyecto} onChange={e => set('proyecto', e.target.value)} /></div>
                  <div><label className={lbl}>Fecha de entrega</label><DatePicker value={d.fecha_entrega} borrable onChange={v => set('fecha_entrega', v)} /></div>
                  <div><label className={lbl}>Responsable</label>
                    <Selector value={d.encargado} onChange={e => set('encargado', e.target.value)} className={inp}>
                      <option value="">Sin asignar</option>
                      {usuarios.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                      {d.encargado && !usuarios.some(u => u.name === d.encargado) && <option value={d.encargado}>{d.encargado}</option>}
                    </Selector>
                  </div>
                </div>
              ) : (
                <>
                  {(p.empresa || p.cliente) && <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{p.empresa || p.cliente}</p>}
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight leading-tight">{p.proyecto || '(Sin nombre)'}</h1>
                  <div className="flex items-center gap-5 flex-wrap mt-3">
                    <Dato label="Fecha de entrega">{p.fecha_entrega ? fechaVisible(p.fecha_entrega) : '—'}</Dato>
                    <Dato label="Responsable">{p.encargado || 'Sin asignar'}</Dato>
                    <Plazo fecha={p.fecha_entrega} grande />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div role="radiogroup" aria-label="Estado" className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {ESTADOS.map(e => (
                  <button key={e} role="radio" aria-checked={p.estado_produccion === e} onClick={() => p.estado_produccion !== e && onEstado(e)}
                    className={`flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg transition-colors ${p.estado_produccion === e ? 'bg-white shadow-sm font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${PUNTO[e]}`} />{NOMBRE_ESTADO[e]}
                  </button>
                ))}
              </div>
              <button onClick={entregar} disabled={editando} className="h-9 px-3.5 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-40">
                <CheckCircle2 size={14} /> Marcar entregado
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-5 items-start">
          {/* Columna principal */}
          <div className="flex-[999_1_520px] min-w-0 space-y-5">

            {/* Qué se vendió */}
            <section className={tarjeta}>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-[15px] font-semibold text-gray-900">Qué se vendió</h2>
                {p.cotizaciones_url && <a href={p.cotizaciones_url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-gray-400 hover:text-gray-700 flex items-center gap-1">Ver cotización <ExternalLink size={11} /></a>}
              </div>
              {d ? (
                <div className="space-y-2.5">
                  {d.servicios.length > 0 && (
                    <div className="hidden sm:grid grid-cols-[1fr_70px_110px_36px] gap-2 text-[11px] font-semibold text-gray-400 px-1">
                      <span>Servicio y descripción</span><span>Cant.</span><span>Precio unit.</span><span />
                    </div>
                  )}
                  {d.servicios.map((s, i) => (
                    <div key={i} className="grid sm:grid-cols-[1fr_70px_110px_36px] gap-2 items-start bg-gray-50 rounded-xl p-2.5">
                      <div className="space-y-1.5">
                        <input className={inp} value={s.nombre} placeholder="Servicio" aria-label="Servicio" onChange={e => cambiarServicio(i, { nombre: e.target.value })} />
                        <textarea className={`${inp} resize-y`} rows={2} value={s.descripcion} placeholder="Descripción" aria-label="Descripción" onChange={e => cambiarServicio(i, { descripcion: e.target.value })} />
                      </div>
                      <input className={`${inp} text-center`} inputMode="decimal" value={String(s.cantidad)} aria-label="Cantidad"
                        onChange={e => cambiarServicio(i, { cantidad: parseFloat(e.target.value.replace(/[^\d.]/g, '')) || 0 })} />
                      <input className={inp} inputMode="decimal" value={String(s.precio)} aria-label="Precio unitario con IGV"
                        onChange={e => cambiarServicio(i, { precio: parseFloat(e.target.value.replace(/[^\d.]/g, '')) || 0 })} />
                      <button onClick={() => quitarServicio(i)} aria-label="Quitar servicio" className="w-9 h-9 rounded-xl border border-gray-200 bg-white grid place-items-center text-gray-400 hover:text-rose-500"><X size={14} /></button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <button onClick={() => set('servicios', [...d.servicios, { nombre: '', cantidad: 1, precio: 0, descripcion: '' }])}
                      className="text-[12.5px] px-3 py-2 rounded-xl border border-dashed border-gray-300 text-gray-600 hover:border-[var(--acento)] flex items-center gap-1"><Plus size={13} /> Añadir servicio</button>
                    {d.servicios.length > 0 && <span className="text-[12px] text-gray-500">Suma de servicios: <b className="text-gray-800">{fmt(sumaForm)}</b> (con IGV)</span>}
                  </div>
                </div>
              ) : servicios.length ? (
                <div className="divide-y divide-gray-100">
                  {servicios.map((s, i) => (
                    <div key={i} className="flex justify-between gap-4 py-2.5">
                      <div className="min-w-0"><p className="text-sm font-semibold text-gray-800">{s.nombre}</p>{s.descripcion && <p className="text-[12.5px] text-gray-500 leading-relaxed">{s.descripcion}</p>}</div>
                      <div className="text-right flex-shrink-0"><p className="text-sm text-gray-800">{fmt(s.cantidad * s.precio)}</p><p className="text-[11px] text-gray-400">{s.cantidad} × {fmt(s.precio)}</p></div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-gray-400">Aún no hay servicios registrados. Las cotizaciones nuevas los guardan solas; también puedes agregarlos con “Editar proyecto”.</p>
              )}
            </section>

            {/* Material y entrega */}
            <section className={tarjeta}>
              <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Material y entrega</h2>
              {d ? (
                <div className="space-y-3">
                  <div><label className={lbl}>Carpeta del material (Drive, Terabox…)</label><input className={inp} value={d.drive_url} placeholder="Pega el enlace de la carpeta" onChange={e => set('drive_url', e.target.value)} /></div>
                  <div><label className={lbl}>Link de entrega al cliente</label><input className={inp} value={d.link_entrega} placeholder="Pega el enlace final (Drive, WeTransfer…)" onChange={e => set('link_entrega', e.target.value)} /></div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3.5 py-2.5">
                    <Dato label="Carpeta del material">{p.drive_url ? <span className="truncate block max-w-[420px] text-gray-600">{p.drive_url}</span> : <span className="text-gray-400">Sin carpeta</span>}</Dato>
                    {p.drive_url && <a href={p.drive_url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-medium text-[var(--acento)] flex items-center gap-1 flex-shrink-0"><FolderOpen size={13} /> Abrir</a>}
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3.5 py-2.5 flex-wrap">
                    <Dato label="Link de entrega">{p.link_entrega ? <span className="truncate block max-w-[420px] text-gray-600">{p.link_entrega}</span> : <span className="text-gray-400">Aún no hay link</span>}</Dato>
                    {p.link_entrega && (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button onClick={() => copiar(p.link_entrega!, 'Link')} className="text-[12.5px] text-gray-500 hover:text-gray-800 flex items-center gap-1"><Copy size={12} /> Copiar</button>
                        {p.telefono && <button onClick={() => abrirChat(p.telefono, p.link_entrega!)} className="text-[12.5px] font-medium text-emerald-600 flex items-center gap-1"><MessageCircle size={13} /> Pegar en WhatsApp</button>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Notas */}
            <section className={tarjeta}>
              <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Notas</h2>
              {d ? (
                <textarea className={`${inp} resize-y leading-relaxed`} rows={5} value={d.notas} aria-label="Notas"
                  placeholder="Lo que el equipo necesita saber: cambios pedidos, accesos, detalles del cliente…" onChange={e => set('notas', e.target.value)} />
              ) : notasLimpias(p.notas_produccion) ? (
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{notasLimpias(p.notas_produccion)}</p>
              ) : <p className="text-[13px] text-gray-400">Sin notas.</p>}
            </section>
          </div>

          {/* Columna lateral */}
          <aside className="flex-[1_1_320px] min-w-0 space-y-5">

            {/* Contacto */}
            <section className={tarjeta}>
              <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Contacto</h2>
              {d && p.empresa_id ? (
                <div className="space-y-2.5">
                  <div><label className={lbl}>Empresa / razón social</label><input className={inp} value={d.empresa} onChange={e => set('empresa', e.target.value)} /></div>
                  <div><label className={lbl}>Persona de contacto</label><input className={inp} value={d.cliente} onChange={e => set('cliente', e.target.value)} /></div>
                  <div><label className={lbl}>Teléfono</label><input className={inp} value={d.telefono} inputMode="tel" onChange={e => set('telefono', e.target.value)} /></div>
                  <div><label className={lbl}>Correo</label><input className={inp} value={d.mail} inputMode="email" onChange={e => set('mail', e.target.value)} /></div>
                  <p className="text-[11px] text-gray-400">Se guarda en la ficha del cliente (también se ve en el CRM).</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <Dato label="Persona de contacto">{p.cliente || '—'}</Dato>
                  {p.empresa && p.empresa !== p.cliente && <Dato label="Empresa">{p.empresa}</Dato>}
                  {p.mail && <Dato label="Correo">{p.mail}</Dato>}
                  {p.telefono ? (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => abrirChat(p.telefono)} className="flex-1 h-10 rounded-xl bg-emerald-50 text-emerald-700 text-[13px] font-semibold hover:bg-emerald-100 flex items-center justify-center gap-1.5">
                        <MessageCircle size={14} /> {p.telefono}
                      </button>
                      <button onClick={() => copiar(p.telefono, 'Teléfono')} aria-label="Copiar teléfono" className="w-10 h-10 rounded-xl border border-gray-200 grid place-items-center text-gray-400 hover:text-gray-700"><Copy size={14} /></button>
                    </div>
                  ) : <p className="text-[12.5px] text-gray-400">Sin teléfono registrado</p>}
                  {d && !p.empresa_id && <p className="text-[11px] text-amber-600">Este proyecto no tiene cliente vinculado: vincúlalo desde el CRM para editar el contacto.</p>}
                </div>
              )}
            </section>

            {/* Cobro */}
            <section className={tarjeta}>
              <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Cobro</h2>
              {d ? (
                <div>
                  <label className={lbl}>Total del proyecto (S/, con IGV)</label>
                  <input className={inp} inputMode="decimal" value={d.total} onChange={e => setForm(f => ({ ...f, total: e.target.value.replace(/[^\d.,]/g, ''), totalTocado: true }))} />
                  {d.servicios.length > 0 && Math.abs(sumaForm - (parseFloat(d.total) || 0)) > 0.5 && (
                    <button onClick={() => setForm(f => ({ ...f, total: String(sumaForm), totalTocado: true }))} className="text-[11.5px] text-[var(--acento)] mt-1.5">Usar la suma de servicios ({fmt(sumaForm)})</button>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1.5">Lo pagado no cambia.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[{ l: 'Total', v: fmt(total), c: 'text-gray-900' }, { l: 'Cobrado', v: fmt(pagado), c: 'text-emerald-600' }, { l: 'Saldo', v: fmt(Math.max(0, pend)), c: pend > 0.5 ? 'text-rose-500' : 'text-gray-400' }].map(x => (
                      <div key={x.l} className="bg-gray-50 rounded-xl py-2.5"><p className="text-[10.5px] text-gray-400">{x.l}</p><p className={`text-[14px] font-bold ${x.c}`}>{x.v}</p></div>
                    ))}
                  </div>
                  {pagos.length > 0 && (
                    <div className="space-y-1">
                      {pagos.map((pg, i) => (
                        <div key={i} className="flex justify-between text-[12px] text-gray-500"><span>{fechaVisible(pg.fecha)} · {pg.medio}</span><span className="font-medium text-gray-700">{fmt(pg.monto)}</span></div>
                      ))}
                    </div>
                  )}
                  {pagando ? (
                    <div>
                      <RegistrarPago pendiente={Math.max(0, pend)} onRegistrar={async dp => { const ok = await onPago(dp); if (ok) setPagando(false); return ok; }} />
                      <button onClick={() => setPagando(false)} className="w-full text-[12px] text-gray-400 hover:text-gray-600 mt-1.5">Cancelar</button>
                    </div>
                  ) : (
                    <button onClick={() => setPagando(true)} className="w-full h-9 rounded-xl border border-gray-200 text-[13px] text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5"><Wallet size={13} /> Registrar pago</button>
                  )}
                </div>
              )}
            </section>

            {/* Documentos */}
            <section className={tarjeta}>
              <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Documentos</h2>
              <EnlacesDocumentos key={p.id} pageId={p.id} campos={['cotizacion', 'contrato', 'factura']}
                enlaces={{ cotizacion: p.cotizaciones_url, contrato: p.contrato_url, factura: p.factura_url }}
                onCambio={(campo, url) => onEnlace(campo, url)}
                onCotizacionPrincipal={v => { if (v.total !== null) onEnlace('total', v.total); }} />
              <a href={p.notion_url} target="_blank" rel="noopener noreferrer" className="mt-3 text-[12px] text-gray-400 hover:text-gray-700 flex items-center gap-1"><LinkIcon size={11} /> Ver en Notion</a>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Módulo principal ─────────────────────────────────────────────────────────
export default function ProduccionContent() {
  const notify = useNotify();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'semana' | 'atrasados' | 'saldo'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<{ id: string; name: string }[]>([]);
  const [cierre, setCierre] = useState<{ id: string; proyecto?: string; cliente?: string; empresa?: string } | null>(null);
  const modalCierre = cierre && <ModalCierre lead={cierre} onClose={() => setCierre(null)} />;

  useEffect(() => {
    fetch('/api/notion/usuarios').then(r => r.json()).then(d => { if (d.usuarios) setUsuarios(d.usuarios); }).catch(() => {});
  }, []);

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const r = await fetch('/api/notion/produccion?estado=todos').then(x => x.json());
      if (r.proyectos) setProyectos(r.proyectos.map((p: any) => ({
        ...p,
        empresa: p.empresa || '', cliente: p.cliente || '', telefono: p.telefono || '', mail: p.mail || '',
        fecha_entrega: p.fecha_entrega_estimada || null,
        notas_produccion: p.notas_produccion || '',
        servicios_vendidos: p.servicios_vendidos || '',
        historial_pagos: p.historial_pagos || '',
      })));
      else if (r.error) notify.error(`No se pudo cargar Producción: ${r.error}`);
    } catch { notify.error('Sin conexión con Notion'); }
    finally { setLoading(false); setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const local = useCallback((id: string, cambios: Partial<Proyecto>) => {
    setProyectos(prev => prev.map(p => p.id === id ? { ...p, ...cambios } : p));
  }, []);

  const cambiarEstado = useCallback(async (id: string, estado: string) => {
    const previo = proyectos.find(p => p.id === id)?.estado_produccion;
    local(id, { estado_produccion: estado });
    const res = await fetch('/api/notion/produccion', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: id, estado_produccion: estado }),
    }).catch(() => null);
    if (!res?.ok) { if (previo) local(id, { estado_produccion: previo }); notify.error('No se pudo cambiar el estado'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectos, local]);

  const entregado = useCallback(async (id: string) => {
    const res = await fetch('/api/notion/produccion', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: id, estado_produccion: 'Archivado' }),
    }).catch(() => null);
    if (!res?.ok) { notify.error('No se pudo marcar como entregado'); return; }
    const p = proyectos.find(x => x.id === id);
    setProyectos(prev => prev.filter(x => x.id !== id));
    setAbiertoId(null);
    notify.success('Proyecto entregado 🎉');
    // Al entregar: ¿cuándo volver a escribirle? (fidelización)
    if (p) setCierre({ id: p.id, proyecto: p.proyecto, cliente: p.cliente, empresa: p.empresa });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectos]);

  const pagar = useCallback(async (id: string, d: DatosPago): Promise<boolean> => {
    const res = await fetch('/api/notion/contabilidad-proyectos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: id, registrar_pago: d }),
    }).catch(() => null);
    if (!res?.ok) { const e = await res?.json().catch(() => ({})); notify.error(e?.error || 'No se pudo registrar el pago'); return false; }
    notify.success(`Pago de ${fmt(d.monto)} registrado`);
    cargar(true);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar]);

  const enlace = useCallback((id: string, campo: CampoEnlace | 'total', valor: string | number | null) => {
    if (campo === 'total') { local(id, { total: Number(valor) || 0 }); return; }
    const k = ({ cotizacion: 'cotizaciones_url', contrato: 'contrato_url', factura: 'factura_url', drive: 'drive_url' } as const)[campo];
    local(id, { [k]: valor as string | null });
  }, [local]);

  // Solo los 3 estados activos
  const activos = useMemo(() => proyectos.filter(p => (ESTADOS as readonly string[]).includes(p.estado_produccion)), [proyectos]);
  const semana = activos.filter(p => { const d = diasHasta(p.fecha_entrega); return d !== null && d >= 0 && d <= 7; });
  const atrasados = activos.filter(p => { const d = diasHasta(p.fecha_entrega); return d !== null && d < 0; });
  const conSaldo = activos.filter(p => (p.total ?? 0) > 0 && saldo(p) > 0.5);

  const q = busqueda.trim().toLowerCase();
  const visibles = (filtro === 'semana' ? semana : filtro === 'atrasados' ? atrasados : filtro === 'saldo' ? conSaldo : activos)
    .filter(p => !q || [p.proyecto, p.empresa, p.cliente].some(t => (t || '').toLowerCase().includes(q)))
    .sort((a, b) => (a.fecha_entrega || '9999').localeCompare(b.fecha_entrega || '9999'));

  const abierto = abiertoId ? proyectos.find(p => p.id === abiertoId) : null;

  if (abierto) {
    return (
      <div className="flex flex-col h-full bg-gray-100/60">
        <Ficha key={abierto.id} proyecto={abierto} usuarios={usuarios}
          onVolver={() => setAbiertoId(null)}
          onEstado={e => cambiarEstado(abierto.id, e)}
          onGuardado={c => local(abierto.id, c)}
          onEntregado={() => entregado(abierto.id)}
          onEnlace={(campo, v) => enlace(abierto.id, campo, v)}
          onPago={d => pagar(abierto.id, d)} />
        {modalCierre}
      </div>
    );
  }

  const indicadores = [
    { id: 'semana' as const, n: semana.length, t: 'Entregas en 7 días', det: semana[0] ? `${semana[0].proyecto}${semana.length > 1 ? ` y ${semana.length - 1} más` : ''}` : 'Ninguna', color: 'text-amber-600' },
    { id: 'atrasados' as const, n: atrasados.length, t: 'Atrasados', det: atrasados[0] ? atrasados[0].proyecto : 'Ninguno', color: 'text-rose-600' },
    { id: 'saldo' as const, n: conSaldo.length, t: 'Con saldo pendiente', det: conSaldo.length ? fmt(conSaldo.reduce((a, p) => a + saldo(p), 0)) : 'Todo cobrado', color: 'text-sky-600' },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-100/60">
      {modalCierre}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-white space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Producción</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">{activos.length} proyectos activos</p>
          </div>
          <div className="flex items-center gap-2">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar proyecto o cliente" aria-label="Buscar proyecto"
              className="h-9 w-56 text-[13px] px-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-[var(--acento)]" />
            <button onClick={() => cargar(true)} disabled={refreshing} aria-label="Actualizar" className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {indicadores.map(x => (
            <button key={x.id} onClick={() => setFiltro(filtro === x.id ? 'todos' : x.id)}
              className={`text-left flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${filtro === x.id ? 'border-[var(--acento)] bg-[var(--acento-suave)]' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
              <span className={`text-[24px] font-bold ${x.n ? x.color : 'text-gray-300'}`}>{x.n}</span>
              <span className="min-w-0"><span className="block text-[13px] font-semibold text-gray-800">{x.t}</span><span className="block text-[12px] text-gray-400 truncate">{x.det}</span></span>
            </button>
          ))}
        </div>
        {filtro !== 'todos' && (
          <button onClick={() => setFiltro('todos')} className="text-[12px] text-gray-500 hover:text-gray-800 flex items-center gap-1"><X size={12} /> Quitar filtro</button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-[var(--acento)] border-t-transparent rounded-full animate-spin" /></div>
        ) : activos.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin proyectos activos</p>
            <p className="text-sm mt-1">Los proyectos aparecen aquí al marcarlos GANADO en el CRM</p>
          </div>
        ) : (
          <div className="flex gap-4 px-6 py-5 h-full min-w-full">
            {ESTADOS.map(estado => {
              const items = visibles.filter(p => p.estado_produccion === estado);
              const movingHere = dragOver === estado && dragging && !items.some(p => p.id === dragging);
              return (
                <div key={estado} onDragOver={e => { e.preventDefault(); setDragOver(estado); }}
                  onDrop={e => { e.preventDefault(); if (dragging) cambiarEstado(dragging, estado); setDragging(null); setDragOver(null); }}
                  className="flex-1 min-w-[260px] flex flex-col rounded-2xl bg-gray-200/50 overflow-hidden">
                  <div className={`h-1 ${PUNTO[estado]}`} />
                  <div className="flex items-center gap-2 px-4 pt-3.5 pb-3">
                    <span className={`w-2 h-2 rounded-full ${PUNTO[estado]}`} />
                    <span className="text-[13px] font-bold text-gray-700">{NOMBRE_ESTADO[estado]}</span>
                    <span className="text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded-md min-w-5 text-center">{items.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5">
                    {items.length === 0 && !movingHere && (
                      <div className="h-20 border-2 border-dashed border-gray-300/70 rounded-2xl flex items-center justify-center"><p className="text-xs text-gray-400 font-medium">Sin proyectos</p></div>
                    )}
                    {items.map(p => (
                      <div key={p.id} draggable onDragStart={() => setDragging(p.id)} onDragEnd={() => { setDragging(null); setDragOver(null); }}
                        className={`transition-opacity ${dragging === p.id ? 'opacity-30' : ''}`}>
                        <Tarjeta p={p} onAbrir={() => setAbiertoId(p.id)} />
                      </div>
                    ))}
                    {movingHere && <div className="h-24 rounded-2xl border-2 border-dashed border-slate-400 bg-slate-200/60 flex items-center justify-center"><p className="text-xs text-slate-500 font-semibold">Soltar aquí</p></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

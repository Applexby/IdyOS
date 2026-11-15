'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { hoyLima, nombreDesdeEmail } from '@/lib/utils';
import {
  Lightbulb, Pin, AlarmClock, Phone, X, Check, Trash2, RefreshCw,
  Edit2, History, Search, Plus, Loader2,
} from 'lucide-react';
import { useNotify } from '@/components/ui/Feedback';
import DatePicker from '@/components/ui/DatePicker';
import Selector from '@/components/ui/Selector';

const TIPOS = [
  { key: '💡 Idea',         label: 'Idea',         icon: Lightbulb,  chip: 'bg-amber-100 text-amber-700',   ring: 'border-amber-200' },
  { key: '📌 Nota',         label: 'Nota',         icon: Pin,        chip: 'bg-gray-100 text-gray-600',     ring: 'border-gray-200' },
  { key: '⏰ Recordatorio', label: 'Recordatorio', icon: AlarmClock, chip: 'bg-rose-100 text-rose-700',     ring: 'border-rose-200' },
  { key: '📞 Llamada',      label: 'Llamada',      icon: Phone,      chip: 'bg-violet-100 text-violet-700', ring: 'border-violet-200' },
];
const tipoMeta = (key: string) => TIPOS.find(t => t.key === key) || TIPOS[1];

const COLORES = [
  { name: 'amarillo', card: 'bg-[#FEF3C7] border-[#FDE68A]', sw: 'bg-[#FCD34D]' },
  { name: 'rosa',     card: 'bg-[#FCE7F3] border-[#FBCFE8]', sw: 'bg-[#F9A8D4]' },
  { name: 'azul',     card: 'bg-[#DBEAFE] border-[#BFDBFE]', sw: 'bg-[#93C5FD]' },
  { name: 'verde',    card: 'bg-[#D1FAE5] border-[#A7F3D0]', sw: 'bg-[#6EE7B7]' },
  { name: 'lila',     card: 'bg-[#EDE9FE] border-[#DDD6FE]', sw: 'bg-[#C4B5FD]' },
  { name: 'blanco',   card: 'bg-white border-gray-200',      sw: 'bg-gray-200' },
];
const colorMeta = (name: string) => COLORES.find(c => c.name === name) || COLORES[0];
const COLOR_POR_TIPO: Record<string, string> = { '💡 Idea': 'amarillo', '📌 Nota': 'blanco', '⏰ Recordatorio': 'rosa', '📞 Llamada': 'lila' };
function extraerColor(desc: string): { limpio: string; color: string | null } {
  const m = (desc || '').match(/\{color:(\w+)\}\s*$/);
  if (m) return { limpio: desc.replace(/\s*\{color:\w+\}\s*$/, '').trim(), color: m[1] };
  return { limpio: desc || '', color: null };
}

const PRIORIDADES = ['Baja', 'Media', 'Alta'];
const PRIO_STYLE: Record<string, string> = { Baja: 'bg-gray-100 text-gray-500', Media: 'bg-amber-100 text-amber-700', Alta: 'bg-rose-100 text-rose-700' };
const EQUIPO = ['Isai', 'Rebeca', 'Administración'];

// Fecha y hora LOCAL para <input type="datetime-local"> (toISOString daría la hora UTC)
function ahoraLocalInput(): string {
  return aInputLocal(new Date().toISOString());
}
function aInputLocal(iso: string): string {
  if (iso.length <= 10) return `${iso}T09:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

interface Nota {
  id: string; url: string; nombre: string; tipo: string; prioridad: string;
  espacio: string; asignado: string; hecho: boolean;
  fecha_creacion: string | null; fecha_recordatorio: string | null;
  descripcion: string; created: string;
}

// Estado de un recordatorio respecto a ahora (hora local del navegador)
function estadoRecordatorio(n: Nota): 'vencido' | 'hoy' | 'proximo' | null {
  if (n.tipo !== '⏰ Recordatorio' || !n.fecha_recordatorio || n.hecho) return null;
  const f = n.fecha_recordatorio;
  const cuando = new Date(f.length > 10 ? f : f + 'T23:59:00');
  const ahora = new Date();
  if (cuando.getTime() < ahora.getTime()) return 'vencido';
  const mismoDia = cuando.toDateString() === ahora.toDateString();
  return mismoDia ? 'hoy' : 'proximo';
}
const ORDEN_PRIO: Record<string, number> = { Alta: 0, Media: 1, Baja: 2 };

export default function NotasContent({ userName }: { userName?: string }) {
  const { data: session } = useSession();
  // Cada persona (también el administrador) ve solo sus propias notas
  const isAdmin = false;
  const miNombre = nombreDesdeEmail(session?.user?.email) || userName || '';
  const notify = useNotify();

  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<string>('mias');
  const [modal, setModal] = useState<{ tipo: string } | null>(null);
  const [editNota, setEditNota] = useState<Nota | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [rapida, setRapida] = useState('');
  const [creandoRapida, setCreandoRapida] = useState(false);

  const cargar = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const r = await fetch('/api/notion/notas');
      const d = await r.json();
      if (d.notas) setNotas(d.notas);
      else if (d.error) notify.error(`No se pudieron cargar las notas: ${d.error}`);
    } catch {
      notify.error('Sin conexión con el servidor');
    } finally { setLoading(false); setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setTab(isAdmin ? 'general' : 'mias'); }, [isAdmin]);

  // PATCH optimista con reversión si falla
  async function patchNota(n: Nota, cambios: Partial<Nota>, fields: any) {
    setNotas(prev => prev.map(x => x.id === n.id ? { ...x, ...cambios } : x));
    const res = await fetch('/api/notion/notas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: n.id, fields }) }).catch(() => null);
    if (!res || !res.ok) {
      setNotas(prev => prev.map(x => x.id === n.id ? n : x));
      notify.error('No se pudo guardar el cambio');
      return false;
    }
    return true;
  }
  async function toggleHecho(n: Nota) {
    if (await patchNota(n, { hecho: !n.hecho }, { hecho: !n.hecho }) && !n.hecho) {
      notify.success('Marcada como hecha', { label: 'Deshacer', onClick: () => patchNota({ ...n, hecho: true }, { hecho: false }, { hecho: false }) });
    }
  }
  async function cambiarColor(n: Nota, color: string) {
    const { limpio } = extraerColor(n.descripcion);
    const nuevaDesc = `${limpio} {color:${color}}`.trim();
    await patchNota(n, { descripcion: nuevaDesc }, { descripcion: nuevaDesc });
  }
  // Eliminar con "Deshacer": la nota se archiva en Notion y se puede restaurar
  async function eliminar(n: Nota) {
    setNotas(prev => prev.filter(x => x.id !== n.id));
    const res = await fetch('/api/notion/notas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: n.id }) }).catch(() => null);
    if (!res || !res.ok) {
      setNotas(prev => [n, ...prev]);
      notify.error('No se pudo eliminar la nota');
      return;
    }
    notify.success('Nota eliminada', {
      label: 'Deshacer',
      onClick: async () => {
        setNotas(prev => [n, ...prev]);
        const r = await fetch('/api/notion/notas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: n.id, fields: { restaurar: true } }) }).catch(() => null);
        if (!r || !r.ok) { setNotas(prev => prev.filter(x => x.id !== n.id)); notify.error('No se pudo restaurar la nota'); }
      },
    });
  }
  // Captura rápida: escribe y Enter → crea una Nota asignada a mí
  async function crearRapida() {
    const texto = rapida.trim();
    if (!texto || creandoRapida) return;
    setCreandoRapida(true);
    try {
      const res = await fetch('/api/notion/notas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: texto.slice(0, 200), tipo: '📌 Nota', espacio: 'IDEALO', asignado: miNombre || 'Isai', fecha_creacion: hoyLima() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { notify.error(d.error || 'No se pudo crear la nota'); return; }
      if (d.nota) setNotas(prev => [d.nota, ...prev]);
      setRapida('');
      setTimeout(() => cargar(true), 2000);
    } finally { setCreandoRapida(false); }
  }

  // Notas del ámbito de la pestaña (antes de buscar/filtrar)
  const delAmbito = (k: string): Nota[] => {
    if (k === 'general') return isAdmin ? notas.filter(n => !n.hecho) : [];
    if (k === 'historial') return notas.filter(n => n.hecho && (isAdmin || n.asignado === miNombre));
    if (k === 'mias') return notas.filter(n => !n.hecho && n.asignado === miNombre);
    return isAdmin ? notas.filter(n => !n.hecho && n.asignado === k) : [];
  };
  const ambito = delAmbito(tab);
  const q = busqueda.trim().toLowerCase();
  const visibles = ambito
    .filter(n => !filtroTipo || n.tipo === filtroTipo)
    .filter(n => !q || `${n.nombre} ${extraerColor(n.descripcion).limpio} ${n.asignado}`.toLowerCase().includes(q))
    .sort((a, b) => (ORDEN_PRIO[a.prioridad] ?? 3) - (ORDEN_PRIO[b.prioridad] ?? 3)
      || (b.fecha_creacion || '').localeCompare(a.fecha_creacion || ''));

  // Recordatorios que requieren atención (vencidos y de hoy), arriba de todo
  const recordatorios = tab === 'historial' ? [] : ambito
    .map(n => ({ n, e: estadoRecordatorio(n) }))
    .filter(x => x.e === 'vencido' || x.e === 'hoy')
    .sort((a, b) => (a.n.fecha_recordatorio || '').localeCompare(b.n.fecha_recordatorio || ''));

  const grupos: Record<string, Nota[]> = {};
  for (const n of visibles) { const g = n.espacio || 'IDEALO'; (grupos[g] = grupos[g] || []).push(n); }

  const pestanas = isAdmin
    ? [{ k: 'general', l: 'General' }, ...EQUIPO.map(e => ({ k: e, l: e })), { k: 'historial', l: 'Historial' }]
    : [{ k: 'mias', l: 'Mis notas' }, { k: 'historial', l: 'Mi historial' }];

  return (
    <div className="flex flex-col h-full bg-gray-100/60 min-h-screen">
      <div className="px-4 sm:px-6 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Notes Keep</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">Ideas, notas, recordatorios y llamadas del equipo</p>
          </div>
          <button onClick={() => cargar(true)} disabled={refreshing} aria-label="Actualizar" className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Captura rápida */}
        {tab !== 'historial' && (
          <div className="flex items-center gap-2 mb-3 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 focus-within:border-[#ffc500] focus-within:bg-white transition-colors">
            <Plus size={16} className="text-gray-400 flex-shrink-0" />
            <input value={rapida} onChange={e => setRapida(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') crearRapida(); }}
              placeholder="Escribe una nota rápida y pulsa Enter…" aria-label="Nota rápida"
              className="flex-1 bg-transparent text-[14px] focus:outline-none py-1" />
            {creandoRapida && <Loader2 size={15} className="animate-spin text-gray-400" />}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
          {TIPOS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setModal({ tipo: t.key })} className={`flex items-center gap-2.5 px-3 sm:px-4 py-3 rounded-2xl border bg-white hover:shadow-md transition-all ${t.ring}`}>
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${t.chip}`}><Icon size={17} /></span>
                <div className="text-left min-w-0">
                  <p className="text-[13px] font-bold text-gray-800">{t.label}</p>
                  <p className="text-[10px] text-gray-400 truncate">Crear {t.label.toLowerCase()}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {pestanas.map(p => {
            const n = delAmbito(p.k).length;
            return (
              <button key={p.k} onClick={() => setTab(p.k)} className={`text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${tab === p.k ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {p.k === 'historial' && <History size={12} />}{p.l}
                <span className={`text-[10px] font-bold px-1.5 rounded ${tab === p.k ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* Buscador + filtro por tipo */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar en notas…" aria-label="Buscar notas"
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-[#ffc500]" />
          </div>
          <button onClick={() => setFiltroTipo('')}
            className={`text-[12px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${!filtroTipo ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
            Todos
          </button>
          {TIPOS.map(t => {
            const Icon = t.icon;
            const n = ambito.filter(x => x.tipo === t.key).length;
            return (
              <button key={t.key} onClick={() => setFiltroTipo(f => f === t.key ? '' : t.key)}
                className={`text-[12px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${filtroTipo === t.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                <Icon size={12} /> {t.label} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-5">
        {/* Recordatorios vencidos / de hoy */}
        {!loading && recordatorios.length > 0 && (
          <div className="mb-5 bg-white rounded-2xl border border-rose-100 p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <AlarmClock size={15} className="text-rose-500" />
              <p className="text-sm font-bold text-gray-800">Recordatorios por atender</p>
              <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 rounded">{recordatorios.length}</span>
            </div>
            <div className="space-y-1.5">
              {recordatorios.map(({ n, e }) => (
                <div key={n.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${e === 'vencido' ? 'bg-rose-50' : 'bg-amber-50'}`}>
                  <button onClick={() => toggleHecho(n)} aria-label="Marcar como hecho" title="Marcar como hecho"
                    className="w-4 h-4 rounded-[5px] border border-gray-400 hover:border-emerald-500 hover:bg-emerald-50 flex-shrink-0" />
                  <button onClick={() => setEditNota(n)} className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">{n.nombre}</p>
                  </button>
                  <span className={`text-[11px] font-semibold flex-shrink-0 ${e === 'vencido' ? 'text-rose-600' : 'text-amber-700'}`}>
                    {e === 'vencido' ? 'Vencido · ' : 'Hoy · '}
                    {new Date(n.fecha_recordatorio!.length > 10 ? n.fecha_recordatorio! : n.fecha_recordatorio + 'T12:00:00').toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {n.asignado && <span className="text-[10px] text-gray-500 hidden sm:inline">{n.asignado}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <div key={i} className="h-[200px] rounded-[20px] bg-white border border-gray-100 animate-pulse" />)}
          </div>
        ) : visibles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Pin size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">{q || filtroTipo ? 'Sin resultados' : tab === 'historial' ? 'Sin elementos en el historial' : 'Sin notas aquí'}</p>
            <p className="text-sm mt-1">{q || filtroTipo ? 'Prueba con otra búsqueda o quita el filtro' : tab === 'historial' ? 'Aquí aparece lo que marques como hecho' : 'Escribe una nota rápida arriba o usa los botones'}</p>
          </div>
        ) : tab === 'historial' ? (
          /* Historial en tabla estilo Clientes */
          <HistorialTabla notas={visibles} onToggle={toggleHecho} onDelete={eliminar} />
        ) : (
          <div className="space-y-6">
            {Object.entries(grupos).map(([espacio, items]) => (
              <div key={espacio}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${espacio === 'IDEALO' ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-500'}`}>{espacio}</span>
                  <span className="text-[11px] text-gray-400">{items.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {items.map(n => (<NotaCard key={n.id} n={n} onToggle={toggleHecho} onEdit={setEditNota} onDelete={eliminar} onColor={cambiarColor} />))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(modal || editNota) && (
        <NotaModal tipoInicial={modal?.tipo || editNota?.tipo || '📌 Nota'} nota={editNota} miNombre={miNombre}
          onClose={() => { setModal(null); setEditNota(null); }} onSaved={() => { setModal(null); setEditNota(null); notify.success('Nota guardada'); cargar(true); }} />
      )}
    </div>
  );
}

function NotaCard({ n, onToggle, onEdit, onDelete, onColor }: {
  n: Nota; onToggle: (n: Nota) => void; onEdit: (n: Nota) => void; onDelete: (n: Nota) => void; onColor: (n: Nota, c: string) => void;
}) {
  const [showColors, setShowColors] = useState(false);
  const meta = tipoMeta(n.tipo);
  const Icon = meta.icon;
  const { limpio, color } = extraerColor(n.descripcion);
  const colMeta = colorMeta(color || COLOR_POR_TIPO[n.tipo] || 'amarillo');
  // La nota "blanca" en modo oscuro pasa a fondo oscuro: sus textos grises deben aclararse
  const claroEnOscuro = colMeta.name === 'blanco';
  const esRecordatorio = n.tipo === '⏰ Recordatorio';
  const estadoRec = estadoRecordatorio(n);
  const fmtFecha = (f: string | null, conHora = false) => {
    if (!f) return '';
    const d = new Date(f.length > 10 ? f : f + 'T12:00:00');
    const fecha = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (conHora && f.length > 10) {
      const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
      return `${fecha} · ${hora}`;
    }
    return fecha;
  };

  return (
    <div className={`group relative rounded-[20px] border shadow-[0_2px_8px_rgba(16,24,40,0.06)] hover:shadow-[0_8px_24px_rgba(16,24,40,0.12)] hover:-translate-y-0.5 transition-all duration-200 p-4 flex flex-col min-h-[200px] ${colMeta.card}`}>
      {/* Fecha arriba + botón editar (estilo post-it) */}
      <div className="flex items-start justify-between mb-2">
        <span className={`text-[10px] font-semibold text-gray-500/80 ${claroEnOscuro ? 'dark:text-[#a3a3a3]' : ''}`}>{fmtFecha(n.fecha_creacion)}</span>
        <button onClick={() => onEdit(n)} aria-label="Editar nota" className="w-7 h-7 -mt-1 -mr-1 flex items-center justify-center rounded-lg bg-black/5 text-gray-600 hover:bg-black/10 transition-colors">
          <Edit2 size={13} />
        </button>
      </div>

      {/* Tipo + prioridad */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold text-gray-700/90 ${claroEnOscuro ? 'dark:text-[#d4d4d4]' : ''}`}><Icon size={12} /> {meta.label}</span>
        {n.prioridad && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${PRIO_STYLE[n.prioridad] || ''}`}>{n.prioridad}</span>}
      </div>

      {/* Título */}
      <p className="text-[15px] font-bold text-gray-900 leading-snug mb-1.5">{n.nombre}</p>

      {/* Descripción */}
      {limpio ? <p className={`text-[12px] text-gray-700/80 leading-relaxed line-clamp-5 flex-1 ${claroEnOscuro ? 'dark:text-[#cfcfcf]' : ''}`}>{limpio}</p> : <div className="flex-1" />}

      {/* Pie: hora de recordatorio (si aplica) + asignado + acciones */}
      <div className="mt-3 pt-2.5 border-t border-black/[0.07]">
        {esRecordatorio && n.fecha_recordatorio && (
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold mb-2 ${estadoRec === 'vencido' ? 'text-white bg-rose-500 rounded-lg px-2 py-1 w-fit' : 'text-rose-700'}`}>
            <AlarmClock size={12} /> {estadoRec === 'vencido' ? 'Vencido · ' : estadoRec === 'hoy' ? 'Hoy · ' : ''}{fmtFecha(n.fecha_recordatorio, true)}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => onToggle(n)} className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${n.hecho ? 'text-emerald-600' : 'text-gray-500 hover:text-emerald-600'}`}>
            <span className={`w-3.5 h-3.5 rounded-[5px] border flex items-center justify-center ${n.hecho ? 'bg-emerald-500 border-emerald-500' : 'border-gray-400'}`}>{n.hecho && <Check size={9} className="text-white" />}</span>
            Hecho
          </button>
          {n.asignado && <span className={`text-[10px] font-semibold text-gray-500/80 ml-1 ${claroEnOscuro ? 'dark:text-[#a3a3a3]' : ''}`}>{n.asignado}</span>}
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setShowColors(s => !s)} className={`w-4 h-4 rounded-full border border-black/15 ${colMeta.sw}`} title="Cambiar color" />
            {showColors && (
              <div className="absolute bottom-full right-0 mb-1.5 z-10 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 flex gap-1">
                {COLORES.map(c => (<button key={c.name} onClick={() => { onColor(n, c.name); setShowColors(false); }} className={`w-5 h-5 rounded-full border border-black/10 ${c.sw} hover:scale-110 transition-transform`} title={c.name} />))}
              </div>
            )}
          </div>
          <button onClick={() => onDelete(n)} aria-label="Eliminar nota" className="text-gray-400 hover:text-rose-500 p-1 transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}

function HistorialTabla({ notas, onToggle, onDelete }: {
  notas: Nota[]; onToggle: (n: Nota) => void; onDelete: (n: Nota) => void;
}) {
  const fmt = (f: string | null) => f ? new Date(f.length > 10 ? f : f + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Nota', 'Tipo', 'Asignado', 'Espacio', 'Creada', 'Estado', ''].map(h => (
                <th key={h} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {notas.map(n => {
              const meta = tipoMeta(n.tipo);
              const Icon = meta.icon;
              const { limpio } = extraerColor(n.descripcion);
              return (
                <tr key={n.id} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors group">
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-semibold text-gray-800">{n.nombre}</p>
                    {limpio && <p className="text-[11px] text-gray-400 truncate max-w-xs">{limpio}</p>}
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ${meta.chip}`}><Icon size={11} /> {meta.label}</span></td>
                  <td className="px-4 py-3 text-[12px] text-gray-500">{n.asignado || '—'}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${n.espacio === 'IDEALO' ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-500'}`}>{n.espacio || '—'}</span></td>
                  <td className="px-4 py-3 text-[12px] text-gray-500">{fmt(n.fecha_creacion)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onToggle(n)} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 hover:text-gray-500 transition-colors" title="Quitar de hecho">
                      <span className="w-3.5 h-3.5 rounded-[5px] bg-emerald-500 border border-emerald-500 flex items-center justify-center"><Check size={9} className="text-white" /></span>
                      Hecho
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => onDelete(n)} aria-label="Eliminar nota" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-rose-400 transition-all sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"><Trash2 size={13} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NotaModal({ tipoInicial, nota, miNombre, onClose, onSaved }: {
  tipoInicial: string; nota: Nota | null; miNombre: string; onClose: () => void; onSaved: () => void;
}) {
  const esEdicion = !!nota;
  const { limpio: descLimpia } = extraerColor(nota?.descripcion || '');
  const [form, setForm] = useState({
    nombre: nota?.nombre || '',
    tipo: nota?.tipo || tipoInicial,
    prioridad: nota?.prioridad || '',
    espacio: nota?.espacio || 'IDEALO',
    asignado: nota?.asignado || miNombre || 'Isai',
    fecha_creacion: nota?.fecha_creacion?.slice(0, 10) || hoyLima(),
    fecha_recordatorio: nota?.fecha_recordatorio ? aInputLocal(nota.fecha_recordatorio) : (tipoInicial === '⏰ Recordatorio' ? ahoraLocalInput() : ''),
    descripcion: descLimpia,
  });
  const [saving, setSaving] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));
  const meta = tipoMeta(form.tipo);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const Icon = meta.icon;
  const esRecordatorio = form.tipo === '⏰ Recordatorio';
  const usaPrioridad = esRecordatorio || form.tipo === '📌 Nota';

  async function guardar() {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const colorAntiguo = nota ? extraerColor(nota.descripcion).color : null;
      const descFinal = colorAntiguo ? `${form.descripcion} {color:${colorAntiguo}}`.trim() : form.descripcion;
      const payload: any = {
        nombre: form.nombre, tipo: form.tipo, prioridad: usaPrioridad ? form.prioridad : '',
        espacio: form.espacio, asignado: form.asignado, fecha_creacion: form.fecha_creacion, descripcion: descFinal,
      };
      // La hora del recordatorio es hora de Perú: sin el desfase, Notion la
      // tomaría como UTC y se mostraría 5 horas antes.
      const fr = esRecordatorio ? form.fecha_recordatorio : '';
      payload.fecha_recordatorio = fr && fr.length === 16 ? `${fr}:00-05:00` : fr;
      const res = esEdicion
        ? await fetch('/api/notion/notas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: nota!.id, fields: payload }) }).catch(() => null)
        : await fetch('/api/notion/notas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
      if (!res || !res.ok) {
        const e = res ? await res.json().catch(() => ({})) : {};
        setErrorGuardar(e.error || 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
        return;
      }
      onSaved();
    } finally { setSaving(false); }
  }

  const inp = 'w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-yellow-100 transition-all';
  const lbl = 'block text-[11px] font-semibold text-gray-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.chip}`}><Icon size={17} /></span>
            <h2 className="text-lg font-bold text-gray-900">{esEdicion ? 'Editar' : 'Nuevo'} {meta.label.toLowerCase()}</h2>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 p-1.5 rounded-lg transition-colors"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-3.5">
          <div>
            <label className={lbl}>Título</label>
            <input className={inp} value={form.nombre} onChange={set('nombre')} autoFocus placeholder={`Título de la ${meta.label.toLowerCase()}`} />
          </div>
          <div>
            <label className={lbl}>Tipo</label>
            <div className="grid grid-cols-4 gap-1.5">
              {TIPOS.map(t => {
                const TI = t.icon;
                return (
                  <button key={t.key} onClick={() => setForm(p => ({ ...p, tipo: t.key }))} className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] font-medium transition-all ${form.tipo === t.key ? `${t.chip} ${t.ring} ring-1` : 'border-gray-100 text-gray-400 hover:bg-gray-50'}`}>
                    <TI size={15} /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Espacio</label>
              <Selector className={inp} value={form.espacio} onChange={set('espacio')}>
                <option value="IDEALO">IDEALO</option>
                <option value="PERSONAL">PERSONAL</option>
              </Selector>
            </div>
            <div>
              <label className={lbl}>Asignado a</label>
              <Selector className={inp} value={form.asignado} onChange={set('asignado')}>
                {EQUIPO.map(e => <option key={e} value={e}>{e}</option>)}
              </Selector>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Fecha de creación</label>
              <DatePicker value={form.fecha_creacion} onChange={v => set('fecha_creacion')({ target: { value: v } } as any)} />
            </div>
            {usaPrioridad && (
              <div>
                <label className={lbl}>Prioridad</label>
                <Selector className={inp} value={form.prioridad} onChange={set('prioridad')}>
                  <option value="">—</option>
                  {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </Selector>
              </div>
            )}
          </div>
          {esRecordatorio && (
            <div>
              <label className={lbl}>Recordar el (fecha y hora → va a tu calendar)</label>
              <input type="datetime-local" className={inp} value={form.fecha_recordatorio} onChange={set('fecha_recordatorio')} />
            </div>
          )}
          <div>
            <label className={lbl}>Descripción</label>
            <textarea className={`${inp} resize-none`} rows={3} value={form.descripcion} onChange={set('descripcion')} placeholder="Detalle opcional…" />
          </div>
        </div>

        {errorGuardar && <p className="mx-6 mb-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{errorGuardar}</p>}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={guardar} disabled={saving || !form.nombre.trim()} className="flex-1 py-2.5 text-sm font-bold bg-[#ffc500] hover:bg-[#e6b000] text-gray-900 rounded-xl transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : esEdicion ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}

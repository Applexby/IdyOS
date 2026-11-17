'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search, Copy, CheckCheck, MessageCircle, RefreshCw,
  X, Plus, Edit2, Save, Trash2, Mail, Phone, Globe,
  ChevronDown, ChevronUp, Tag, Loader2, Paperclip, FileText, Image as ImageIcon,
} from 'lucide-react';
import { esImagen, type Adjunto } from '@/lib/adjuntos';
import Selector from '@/components/ui/Selector';

interface Plantilla {
  id: string; nombre: string; categoria: string;
  canal: string; cuerpo: string; notas: string; fuente: 'bd' | 'page';
  adjuntos?: Adjunto[];
}

const CATEGORIAS = ['Bienvenida','Seguimiento','Pedido de datos','Post-cotización','Post-cierre','Paquetes','Campaña','Otro'];
const CANALES    = ['WhatsApp','Correo','Cualquiera','Llamada'];

const VARIABLES: Record<string, string> = {
  '{{nombre}}':'Nombre del cliente','{{empresa}}':'Empresa',
  '{{nombre_usuario}}':'Tu nombre','{{numero_cotizacion}}':'N° cotización',
  '{{monto}}':'Monto S/','{{fecha_hoy}}':'Fecha de hoy',
  '{{vencimiento}}':'Fecha de vencimiento','{{telefono}}':'Teléfono',
};

function detectarVariables(cuerpo: string): string[] {
  return [...new Set(cuerpo.match(/\{\{[^}]+\}\}/g) || [])];
}
function reemplazar(cuerpo: string, vals: Record<string,string>, user: string): string {
  let r = cuerpo.replace('{{nombre_usuario}}', user);
  for (const [k, v] of Object.entries(vals)) r = r.replaceAll(k, v || k);
  return r;
}

// Badge de canal
function CanalBadge({ canal }: { canal: string }) {
  const map: Record<string, string> = {
    'WhatsApp':'bg-green-100 text-green-700','Correo':'bg-blue-100 text-blue-700',
    'Llamada':'bg-orange-100 text-orange-700','Cualquiera':'bg-gray-100 text-gray-500',
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[canal] || map['Cualquiera']}`}>{canal}</span>;
}

// ─── Modal crear/editar plantilla ────────────────────────────────────────────
function ModalPlantilla({ plantilla, onClose, onSaved }: {
  plantilla: Plantilla | null; onClose: () => void; onSaved: () => void;
}) {
  const [nombre, setNombre]       = useState(plantilla?.nombre || '');
  const [categoria, setCategoria] = useState(plantilla?.categoria || 'Seguimiento');
  const [canal, setCanal]         = useState(plantilla?.canal || 'WhatsApp');
  const [cuerpo, setCuerpo]       = useState(plantilla?.cuerpo || '');
  const [notas, setNotas]         = useState(plantilla?.notas || '');
  const [adjuntos, setAdjuntos]   = useState<Adjunto[]>(plantilla?.adjuntos || []);
  const [subiendo, setSubiendo]   = useState(false);

  // Sube el archivo a Cloudinary (desde ahí cada PC de IdyOS lo descarga)
  async function subir(files: FileList | null) {
    if (!files?.length) return;
    setSubiendo(true); setError('');
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append('file', f);
        const r = await fetch('/api/plantillas/adjunto', { method: 'POST', body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No se pudo subir');
        setAdjuntos(a => [...a, { nombre: d.nombre || f.name, url: d.url }]);
      }
    } catch (e: any) { setError(e.message); }
    finally { setSubiendo(false); }
  }
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  async function guardar() {
    if (!nombre.trim()) { setError('El nombre es requerido'); return; }
    if (!cuerpo.trim()) { setError('El mensaje es requerido'); return; }
    setError(''); setSaving(true);
    try {
      const url = plantilla?.fuente === 'bd' && plantilla?.id
        ? '/api/notion/plantillas-crud'
        : '/api/notion/plantillas-crud';
      const method = plantilla?.fuente === 'bd' && plantilla?.id ? 'PATCH' : 'POST';
      const body: any = { nombre, categoria, canal, cuerpo, notas, adjuntos };
      if (method === 'PATCH') body.pageId = plantilla!.id;

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); setError(e.error || 'Error'); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {plantilla ? 'Editar plantilla' : 'Nueva plantilla'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Nombre *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Seguimiento D3 — WhatsApp"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Categoría</label>
              <Selector value={categoria} onChange={e => setCategoria(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] bg-white">
                {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
              </Selector>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Canal</label>
              <Selector value={canal} onChange={e => setCanal(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] bg-white">
                {CANALES.map(c => <option key={c}>{c}</option>)}
              </Selector>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Mensaje * <span className="font-normal text-gray-400 ml-1">Variables: {'{{'} nombre {'}}'},  {'{{'} empresa {'}}'},  {'{{'} nombre_usuario {'}}'}, etc.</span>
            </label>
            <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)}
              placeholder="Hola {{nombre}}, soy {{nombre_usuario}} de Idealo Films..."
              rows={6}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] resize-none font-mono" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Archivos <span className="font-normal text-gray-400 ml-1">Imagen o PDF. En Mensajes se arrastran al chat (no se envía el enlace).</span>
            </label>
            <div className="space-y-1.5">
              {adjuntos.map((a, i) => (
                <div key={a.url} className="flex items-center gap-2 text-xs border border-gray-200 rounded-xl px-3 py-2">
                  {esImagen(a) ? <ImageIcon size={13} className="text-gray-400" /> : <FileText size={13} className="text-gray-400" />}
                  <span className="flex-1 truncate text-gray-700">{a.nombre}</span>
                  <button onClick={() => setAdjuntos(l => l.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X size={13} /></button>
                </div>
              ))}
              <label className={`flex items-center justify-center gap-1.5 text-xs font-semibold border border-dashed border-gray-300 rounded-xl py-2.5 cursor-pointer hover:border-[var(--acento)] text-gray-500 ${subiendo ? 'opacity-60 pointer-events-none' : ''}`}>
                {subiendo ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} {subiendo ? 'Subiendo…' : 'Añadir imagen o PDF'}
                <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => { subir(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Notas internas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Cuándo usar esta plantilla..."
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] resize-none" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 text-sm text-gray-500 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={saving}
            className="flex-1 bg-[#ffc500] hover:bg-[#e6b000] text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Save size={14} /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de plantilla ─────────────────────────────────────────────────────
function PlantillaCard({ plantilla, userName, onEdit, onRefresh }: {
  plantilla: Plantilla; userName: string;
  onEdit: (p: Plantilla) => void; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied]     = useState(false);
  const [showVars, setShowVars] = useState(false);
  const [valores, setValores]   = useState<Record<string,string>>({});
  const [deactivating, setDeactivating] = useState(false);

  const variables  = detectarVariables(plantilla.cuerpo);
  const textoFinal = reemplazar(plantilla.cuerpo, valores, userName);
  const varsSin    = variables.filter(v => !valores[v] && v !== '{{nombre_usuario}}');

  function copy() {
    navigator.clipboard.writeText(textoFinal);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }
  function openWA() {
    window.open(`https://wa.me/?text=${encodeURIComponent(textoFinal)}`, '_blank');
  }
  async function desactivar() {
    if (!plantilla.id || plantilla.fuente !== 'bd') return;
    setDeactivating(true);
    await fetch('/api/notion/plantillas-crud', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: plantilla.id, activo: false }),
    });
    onRefresh();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
      <div className="px-4 py-3.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CanalBadge canal={plantilla.canal} />
            <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{plantilla.categoria}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {plantilla.fuente === 'bd' && (
              <button onClick={e => { e.stopPropagation(); onEdit(plantilla); }}
                className="p-1 text-gray-300 hover:text-[#ffc500] transition-colors rounded-lg hover:bg-yellow-50">
                <Edit2 size={12} />
              </button>
            )}
            {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </div>
        <p className="text-sm font-semibold text-gray-800">{plantilla.nombre}</p>
        {!expanded && <p className="text-xs text-gray-400 mt-0.5 truncate">{plantilla.cuerpo.slice(0, 80)}…</p>}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
          {/* Variables */}
          {variables.length > 0 && (
            <div>
              <button onClick={() => setShowVars(!showVars)}
                className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium hover:text-gray-700 mb-2">
                <Tag size={11} />
                {varsSin.length > 0 ? `${varsSin.length} variable${varsSin.length > 1 ? 's' : ''} por rellenar` : 'Variables ✓'}
              </button>
              {showVars && (
                <div className="space-y-2 p-3 bg-gray-50 rounded-xl mb-2">
                  {variables.filter(v => v !== '{{nombre_usuario}}').map(v => (
                    <div key={v} className="flex items-center gap-2">
                      <label className="text-[11px] text-gray-500 min-w-28 font-medium">{VARIABLES[v] || v}</label>
                      <input type="text" placeholder={v} value={valores[v] || ''}
                        onChange={e => setValores(p => ({ ...p, [v]: e.target.value }))}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#ffc500]" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {textoFinal}
          </div>

          {plantilla.notas && (
            <p className="text-[11px] text-gray-400 italic px-1">💡 {plantilla.notas}</p>
          )}

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <button onClick={copy}
              className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2 rounded-xl border transition-all
                ${copied ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-transparent'}`}>
              {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            {(plantilla.canal === 'WhatsApp' || plantilla.canal === 'Cualquiera') && (
              <button onClick={openWA}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-colors">
                <MessageCircle size={14} /> WhatsApp
              </button>
            )}
            {plantilla.canal === 'Correo' && (
              <button onClick={copy}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition-colors">
                <Mail size={14} /> Copiar correo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Módulo principal ─────────────────────────────────────────────────────────
export default function PlantillasContent({ userName }: { userName: string }) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busqueda, setBusqueda]     = useState('');
  const [tabCanal, setTabCanal]     = useState<'Todos'|'WhatsApp'|'Correo'|'Otro'>('Todos');
  const [filtroCat, setFiltroCat]   = useState('Todas');
  const [modalPlantilla, setModalPlantilla] = useState<Plantilla | null | 'nueva'>('nueva' as any);

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch('/api/notion/plantillas?refresh=true');
      const data = await res.json();
      if (data.plantillas) setPlantillas(data.plantillas);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Inicializar sin abrir modal
  useEffect(() => {
    setModalPlantilla(null);
    cargar();
  }, [cargar]);

  // Categorías únicas
  const categorias = ['Todas', ...Array.from(new Set(plantillas.map(p => p.categoria))).sort()];

  // Filtrado con tabs por canal
  const filtradas = plantillas.filter(p => {
    const q = busqueda.toLowerCase();
    if (q && !p.nombre.toLowerCase().includes(q) && !p.cuerpo.toLowerCase().includes(q)) return false;
    if (filtroCat !== 'Todas' && p.categoria !== filtroCat) return false;
    if (tabCanal === 'WhatsApp' && p.canal !== 'WhatsApp' && p.canal !== 'Cualquiera') return false;
    if (tabCanal === 'Correo'   && p.canal !== 'Correo') return false;
    if (tabCanal === 'Otro'     && p.canal !== 'Llamada') return false;
    return true;
  });

  // Agrupar por categoría
  const grupos: Record<string, Plantilla[]> = {};
  for (const p of filtradas) {
    if (!grupos[p.categoria]) grupos[p.categoria] = [];
    grupos[p.categoria].push(p);
  }

  const tabs: { key: typeof tabCanal; label: string; icon: any; count: number }[] = [
    { key: 'Todos',    label: 'Todas',     icon: Globe,          count: plantillas.length },
    { key: 'WhatsApp', label: 'WhatsApp',  icon: MessageCircle,  count: plantillas.filter(p => p.canal === 'WhatsApp' || p.canal === 'Cualquiera').length },
    { key: 'Correo',   label: 'Correo',    icon: Mail,           count: plantillas.filter(p => p.canal === 'Correo').length },
    { key: 'Otro',     label: 'Llamada',   icon: Phone,          count: plantillas.filter(p => p.canal === 'Llamada').length },
  ];

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plantillas de mensajes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{plantillas.length} plantillas disponibles</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => cargar(true)} disabled={refreshing}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setModalPlantilla({ id:'', nombre:'', categoria:'Seguimiento', canal:'WhatsApp', cuerpo:'', notas:'', fuente:'bd' })}
            className="flex items-center gap-2 bg-[#ffc500] hover:bg-[#e6b000] text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm">
            <Plus size={15} /> Nueva plantilla
          </button>
        </div>
      </div>

      {/* Tabs de canal */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-2xl p-1.5">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTabCanal(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all
              ${tabCanal === t.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={13} />
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tabCanal === t.key ? 'bg-[#ffc500] text-white' : 'bg-gray-200 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar plantilla..." value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#ffc500]" />
          {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={13} /></button>}
        </div>
        <Selector value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] bg-white text-gray-700">
          {categorias.map(c => <option key={c}>{c}</option>)}
        </Selector>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <MessageCircle size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Sin plantillas</p>
          <p className="text-sm mt-1">Crea una nueva con el botón de arriba</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grupos).map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{cat}</p>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {items.map(p => (
                  <PlantillaCard key={p.id} plantilla={p} userName={userName}
                    onEdit={setModalPlantilla} onRefresh={() => cargar(true)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      {modalPlantilla && typeof modalPlantilla === 'object' && (
        <ModalPlantilla
          plantilla={modalPlantilla.id ? modalPlantilla : null}
          onClose={() => setModalPlantilla(null)}
          onSaved={() => { setModalPlantilla(null); cargar(true); }}
        />
      )}
    </div>
  );
}

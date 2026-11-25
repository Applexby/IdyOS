'use client';

// Enlaces de documentos de un proyecto (cotización o propuesta, contrato,
// factura y carpeta de Drive). Se abren con un clic y se pueden PONER O EDITAR
// A MANO sin entrar a Notion: útil cuando la propuesta se hizo fuera del OS y
// se subió a Drive. Se guardan en las columnas de enlace del proyecto en Notion.

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, FolderOpen, Pencil, Plus, Check, X, Loader2, UploadCloud, Trash2 } from 'lucide-react';
import { puente, type EstadoDrive, type TipoDocDrive } from '@/lib/desktop';
import { subirADrive, escucharSubidas, EVENTO_ENLACE } from '@/lib/subidasDrive';
import { useNotify } from '@/components/ui/Feedback';
import VersionesCotizacion, { type VersionCot } from '@/components/ui/VersionesCotizacion';

export type CampoEnlace = 'cotizacion' | 'contrato' | 'factura' | 'drive';

const ETIQUETAS: Record<CampoEnlace, string> = {
  cotizacion: 'Cotización / propuesta',
  contrato: 'Contrato',
  factura: 'Factura',
  drive: 'Drive del proyecto',
};

/** Guarda un enlace en el proyecto de Notion. '' lo borra. */
export async function guardarEnlace(pageId: string, campo: CampoEnlace, url: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/notion/contabilidad-proyectos', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId, enlaces: { [campo]: url } }),
  }).catch(() => null);
  if (!res) return { ok: false, error: 'sin conexión' };
  if (!res.ok) { const e = await res.json().catch(() => ({})); return { ok: false, error: e.error || 'error al guardar' }; }
  return { ok: true };
}

export default function EnlacesDocumentos({ pageId, enlaces, campos = ['cotizacion', 'contrato', 'factura', 'drive'], onCambio, onCotizacionPrincipal }: {
  pageId: string;
  enlaces: Partial<Record<CampoEnlace, string | null>>;
  campos?: CampoEnlace[];
  /** Se llama tras guardar (para actualizar la pantalla) */
  onCambio?: (campo: CampoEnlace, url: string | null) => void;
  /** Se eligió otra versión de cotización como principal (enlace y, si tiene, total) */
  onCotizacionPrincipal?: (v: VersionCot) => void;
}) {
  const notify = useNotify();
  const [editando, setEditando] = useState<CampoEnlace | null>(null);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Valor mostrado mientras se guarda (optimista)
  const [local, setLocal] = useState<Partial<Record<CampoEnlace, string | null>>>({});
  // Para releer las versiones de cotización tras poner una a mano
  const [recargarVersiones, setRecargarVersiones] = useState(0);

  const valor = (c: CampoEnlace) => (c in local ? local[c] : enlaces[c]) || '';

  // Google Drive (solo en el programa de escritorio): contratos y facturas se
  // arrastran aquí y se suben a su carpeta; el enlace queda guardado solo.
  const [drive, setDrive] = useState<EstadoDrive | null>(null);
  const [subiendoCampos, setSubiendoCampos] = useState<string[]>([]);
  const [encima, setEncima] = useState<CampoEnlace | null>(null);
  const selector = useRef<HTMLInputElement>(null);
  const destinoSelector = useRef<CampoEnlace | null>(null);
  useEffect(() => { puente()?.drive?.estado().then(setDrive).catch(() => {}); }, []);
  // Subidas en curso de este proyecto (siguen aunque se cambie de pantalla)
  useEffect(() => escucharSubidas(l => setSubiendoCampos(l.filter(x => x.pageId === pageId && (x.estado === 'subiendo' || x.estado === 'guardando')).map(x => x.campo))), [pageId]);
  const subiendo = (c: CampoEnlace) => subiendoCampos.includes(c);

  // Contratos y facturas: puede haber VARIOS por proyecto (lista en "Documentos")
  const MULTI: CampoEnlace[] = ['contrato', 'factura'];
  const esMulti = (c: CampoEnlace) => MULTI.includes(c);
  const [docs, setDocs] = useState<{ tipo: string; nombre: string; url: string }[] | null>(null);
  const cargarDocs = useCallback(async () => {
    if (!campos.some(esMulti)) return;
    const d = await fetch(`/api/notion/documentos?pageId=${pageId}`).then(r => r.json()).catch(() => null);
    if (d?.documentos) setDocs(d.documentos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);
  useEffect(() => { cargarDocs(); }, [cargarDocs]);
  const docsDe = (c: CampoEnlace) => docs
    ? docs.filter(d => d.tipo === c)
    : (enlaces[c] ? [{ tipo: c, nombre: '', url: enlaces[c] as string }] : []);
  async function cambiarDocs(c: CampoEnlace, cuerpo: any, aviso: string) {
    setGuardando(true);
    const r = await fetch('/api/notion/documentos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId, ...cuerpo }) }).catch(() => null);
    setGuardando(false);
    if (!r?.ok) { const e = await r?.json().catch(() => ({})); notify.error(`No se pudo guardar: ${e?.error || 'sin conexión'}`); return false; }
    const d = await r.json();
    setDocs(d.documentos);
    onCambio?.(c, d.documentos.find((x: any) => x.tipo === c)?.url || null);
    notify.success(aviso);
    return true;
  }
  // Enlace guardado por una subida (incluso si empezó en otra pantalla)
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.pageId !== pageId) return;
      if (MULTI.includes(d.campo)) { cargarDocs(); onCambio?.(d.campo, d.principal || d.url); return; }
      setLocal(l => ({ ...l, [d.campo]: d.url }));
      if (onCambio) { onCambio(d.campo, d.url); setLocal(l => { const { [d.campo as CampoEnlace]: _o, ...resto } = l; return resto; }); }
    };
    window.addEventListener(EVENTO_ENLACE, h);
    return () => window.removeEventListener(EVENTO_ENLACE, h);
  }, [pageId, onCambio, cargarDocs]); // eslint-disable-line react-hooks/exhaustive-deps
  const aceptaDrive = (c: CampoEnlace) => !!drive?.disponible && (c === 'contrato' || c === 'factura');

  async function subirArchivo(c: CampoEnlace, archivo: File | undefined) {
    if (!archivo) return;
    if (!drive?.conectado) { notify.error('Conecta Google Drive en Configuración para subir documentos.'); return; }
    const r = await subirADrive({ pageId, campo: c as TipoDocDrive, etiqueta: ETIQUETAS[c], archivo });
    if (!r.ok && r.error) notify.error(r.error);
  }
  const propsSoltar = (c: CampoEnlace) => aceptaDrive(c) ? {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setEncima(c); } },
    onDragLeave: () => setEncima(x => (x === c ? null : x)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setEncima(null); Array.from(e.dataTransfer.files || []).forEach(f => subirArchivo(c, f)); },
  } : {};

  function abrirEdicion(c: CampoEnlace) { setEditando(c); setTexto(valor(c)); }

  async function guardar(c: CampoEnlace, url: string) {
    let limpio = url.trim();
    if (limpio && !/^https?:\/\//i.test(limpio)) limpio = `https://${limpio}`;
    if (limpio && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(limpio)) { notify.error('Pega un enlace válido (por ejemplo, de Google Drive)'); return; }
    if (limpio === valor(c)) { setEditando(null); return; }
    const anterior = valor(c);
    setGuardando(true);
    setLocal(l => ({ ...l, [c]: limpio || null }));
    const r = await guardarEnlace(pageId, c, limpio);
    setGuardando(false);
    if (!r.ok) {
      setLocal(l => ({ ...l, [c]: anterior || null }));
      notify.error(`No se pudo guardar el enlace: ${r.error}`);
      return;
    }
    setEditando(null);
    if (c === 'cotizacion') setRecargarVersiones(n => n + 1);
    if (onCambio) {
      onCambio(c, limpio || null);
      setLocal(l => { const { [c]: _omit, ...resto } = l; return resto; });
    }
    notify.success(limpio ? `${ETIQUETAS[c]}: enlace guardado` : `${ETIQUETAS[c]}: enlace quitado`);
  }

  return (
    <div className="space-y-1.5">
      <input ref={selector} type="file" multiple className="hidden" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
        onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; const c = destinoSelector.current; if (c) fs.forEach(f => subirArchivo(c, f)); }} />
      {campos.map(c => {
        const url = valor(c);
        const Icon = c === 'drive' ? FolderOpen : FileText;
        if (esMulti(c)) {
          const lista = docsDe(c);
          return (
            <div key={c} {...propsSoltar(c)} className={`rounded-xl border text-xs transition-colors
              ${encima === c ? 'border-[var(--acento)] bg-[var(--acento-suave)]' : lista.length ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200'}`}>
              <div className="flex items-center gap-2 px-3 py-2">
                <Icon size={12} className="text-gray-400 flex-shrink-0" />
                <span className={`flex-1 font-medium truncate ${lista.length ? 'text-gray-700' : 'text-gray-400'}`}>
                  {subiendo(c) ? 'Subiendo a Drive…' : encima === c ? `Suelta para subir ${ETIQUETAS[c].toLowerCase()}` : `${ETIQUETAS[c]}${lista.length > 1 ? ` (${lista.length})` : ''}`}
                </span>
                {subiendo(c) && <Loader2 size={12} className="animate-spin text-gray-400" />}
                {aceptaDrive(c) && (
                  <button onClick={e => { e.stopPropagation(); destinoSelector.current = c; selector.current?.click(); }}
                    title="Subir uno o varios archivos a Google Drive (o arrástralos aquí)" aria-label={`Subir ${ETIQUETAS[c]} a Google Drive`}
                    className="p-1 rounded-md text-gray-400 hover:text-[#b8890b] hover:bg-gray-100 flex items-center gap-0.5 font-semibold">
                    <UploadCloud size={12} /><span>Subir</span>
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); setEditando(c); setTexto(''); }} title="Añadir enlace" aria-label={`Añadir enlace de ${ETIQUETAS[c]}`}
                  className="p-1 rounded-md text-gray-400 hover:text-[#b8890b] hover:bg-gray-100"><Plus size={12} /></button>
              </div>
              {lista.length > 0 && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {lista.map((d, i) => (
                    <div key={d.url} className="group flex items-center gap-2 px-3 py-1.5">
                      <span className="flex-1 truncate text-gray-600">{d.nombre || `${ETIQUETAS[c]} ${lista.length > 1 ? i + 1 : ''}`.trim()}</span>
                      <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="text-[#b8890b] font-semibold hover:underline flex items-center gap-0.5"><ExternalLink size={10} /> Abrir</a>
                      <button onClick={e => { e.stopPropagation(); cambiarDocs(c, { quitar: { tipo: c, url: d.url } }, `${ETIQUETAS[c]}: enlace quitado`); }}
                        title="Quitar de la lista (el archivo sigue en Drive)" aria-label="Quitar"
                        className="p-1 rounded-md text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              )}
              {editando === c && (
                <div className="border-t border-gray-100 p-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                  <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder="https://drive.google.com/…"
                    onKeyDown={async e => {
                      if (e.key === 'Escape') setEditando(null);
                      if (e.key === 'Enter') { e.preventDefault(); let u = texto.trim(); if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
                        if (u && await cambiarDocs(c, { agregar: { tipo: c, nombre: '', url: u } }, `${ETIQUETAS[c]}: enlace añadido`)) setEditando(null); }
                    }}
                    aria-label={`Enlace de ${ETIQUETAS[c]}`}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#ffc500]" />
                  <div className="flex items-center gap-1.5">
                    <button disabled={guardando} onClick={async () => { let u = texto.trim(); if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
                      if (u && await cambiarDocs(c, { agregar: { tipo: c, nombre: '', url: u } }, `${ETIQUETAS[c]}: enlace añadido`)) setEditando(null); }}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#ffc500] hover:bg-[#e6b000] text-white flex items-center gap-1 disabled:opacity-50">
                      {guardando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Añadir
                    </button>
                    <button onClick={() => setEditando(null)} className="text-[11px] px-2 py-1 rounded-lg text-gray-500 hover:text-gray-800">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          );
        }
        if (editando === c) {
          return (
            <div key={c} className="rounded-xl border border-[#ffc500] bg-white p-2 space-y-1.5" onClick={e => e.stopPropagation()}>
              <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-1.5"><Icon size={12} className="text-gray-400" /> {ETIQUETAS[c]}</p>
              <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder="https://drive.google.com/…"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); guardar(c, texto); } if (e.key === 'Escape') setEditando(null); }}
                aria-label={`Enlace de ${ETIQUETAS[c]}`}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#ffc500]" />
              <div className="flex items-center gap-1.5">
                <button onClick={() => guardar(c, texto)} disabled={guardando}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#ffc500] hover:bg-[#e6b000] text-white flex items-center gap-1 disabled:opacity-50">
                  {guardando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Guardar
                </button>
                <button onClick={() => setEditando(null)} className="text-[11px] px-2 py-1 rounded-lg text-gray-500 hover:text-gray-800">Cancelar</button>
                {url && (
                  <button onClick={() => guardar(c, '')} disabled={guardando}
                    className="ml-auto text-[11px] px-2 py-1 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center gap-1">
                    <X size={11} /> Quitar
                  </button>
                )}
              </div>
            </div>
          );
        }
        return (
          <Fragment key={c}>
          <div {...propsSoltar(c)} className={`group flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-colors
            ${encima === c ? 'border-[var(--acento)] bg-[var(--acento-suave)]' : url ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200'}`}>
            <Icon size={12} className="text-gray-400 flex-shrink-0" />
            <span className={`flex-1 font-medium truncate ${url ? 'text-gray-700' : 'text-gray-400'}`}>
              {subiendo(c) ? 'Subiendo a Drive…' : encima === c ? `Suelta para subir ${ETIQUETAS[c].toLowerCase()}` : ETIQUETAS[c]}
            </span>
            {subiendo(c) ? <Loader2 size={12} className="animate-spin text-gray-400" /> : aceptaDrive(c) && (
              <button onClick={e => { e.stopPropagation(); destinoSelector.current = c; selector.current?.click(); }}
                title={url ? 'Subir otro archivo a Drive (reemplaza el enlace)' : 'Subir archivo a Google Drive (o arrástralo aquí)'}
                aria-label={`Subir ${ETIQUETAS[c]} a Google Drive`}
                className="p-1 rounded-md text-gray-400 hover:text-[#b8890b] hover:bg-gray-100 flex items-center gap-0.5 font-semibold">
                <UploadCloud size={12} />{!url && <span>Subir</span>}
              </button>
            )}
            {subiendo(c) ? null : url ? (
              <>
                <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[#b8890b] font-semibold hover:underline flex items-center gap-0.5">
                  <ExternalLink size={10} /> Abrir
                </a>
                <button onClick={e => { e.stopPropagation(); abrirEdicion(c); }} title="Cambiar enlace" aria-label={`Cambiar enlace de ${ETIQUETAS[c]}`}
                  className="p-1 rounded-md text-gray-300 hover:text-gray-700 hover:bg-gray-100">
                  <Pencil size={11} />
                </button>
              </>
            ) : (
              <button onClick={e => { e.stopPropagation(); abrirEdicion(c); }}
                className="text-gray-500 hover:text-[#b8890b] font-semibold flex items-center gap-0.5">
                <Plus size={11} /> Añadir enlace
              </button>
            )}
          </div>
          {/* Desde la 2.ª cotización: todas las versiones a la par y elegir la principal */}
          {c === 'cotizacion' && (
            <VersionesCotizacion pageId={pageId} recargar={recargarVersiones}
              onPrincipal={v => {
                setLocal(l => ({ ...l, cotizacion: v.url }));
                onCambio?.('cotizacion', v.url);
                if (onCambio) setLocal(l => { const { cotizacion: _o, ...resto } = l; return resto; });
                onCotizacionPrincipal?.(v);
              }} />
          )}
          </Fragment>
        );
      })}
    </div>
  );
}

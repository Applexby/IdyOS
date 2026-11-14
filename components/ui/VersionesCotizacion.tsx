'use client';

// Versiones de cotización de un proyecto (ver lib/cotizacionVersiones.ts).
// Con una sola versión no muestra nada (el enlace ya se ve arriba). Desde la
// segunda, las lista a la par: número o "Propuesta manual", fecha, quién la hizo
// y monto; la PRINCIPAL va marcada y cualquier otra se puede elegir con
// "Usar esta" (cambia el enlace y el total del proyecto).

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Star, Trash2, Layers, Loader2, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useNotify, useConfirm } from '@/components/ui/Feedback';

export interface VersionCot {
  id: string; numero: string; url: string;
  total: number | null; gravado: number | null; igv: number | null;
  fecha: string; usuario: string; manual: boolean; principal: boolean;
}

const fecha = (f: string) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
const nombre = (v: VersionCot) => (v.manual ? 'Propuesta manual' : `COT-${v.numero}`);

export default function VersionesCotizacion({ pageId, recargar = 0, onPrincipal }: {
  pageId: string;
  /** Cambia este número para volver a leer (p. ej. tras poner un enlace a mano) */
  recargar?: number;
  /** La versión elegida como principal (para actualizar enlace y total en pantalla) */
  onPrincipal?: (v: VersionCot) => void;
}) {
  const notify = useNotify();
  const confirmar = useConfirm();
  const [versiones, setVersiones] = useState<VersionCot[] | null>(null);
  const [abierto, setAbierto] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/notion/cotizaciones/versiones?pageId=${encodeURIComponent(pageId)}`);
      const d = await r.json();
      setVersiones(Array.isArray(d.versiones) ? d.versiones : []);
    } catch { setVersiones([]); }
  }, [pageId]);

  useEffect(() => { cargar(); }, [cargar, recargar]);

  if (!versiones || versiones.length < 2) return null;

  async function usar(v: VersionCot) {
    const montos = v.total !== null ? ` El total del proyecto pasará a ${formatCurrency(v.total)}.` : ' El total del proyecto no cambia (la propuesta no tiene monto en el OS).';
    if (!(await confirmar({ titulo: `¿Usar ${nombre(v)} como cotización principal?`, mensaje: `Será el enlace de cotización del proyecto.${montos}`, confirmar: 'Usar esta' }))) return;
    setOcupado(v.url);
    const previo = versiones;
    setVersiones(vs => vs && vs.map(x => ({ ...x, principal: x.url === v.url })));
    const r = await fetch('/api/notion/cotizaciones/versiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, accion: 'elegir', url: v.url }),
    }).catch(() => null);
    setOcupado(null);
    if (!r || !r.ok) {
      setVersiones(previo);
      const e = r ? await r.json().catch(() => ({})) : {};
      notify.error(`No se pudo cambiar la cotización: ${e.error || 'sin conexión'}`);
      return;
    }
    notify.success(`${nombre(v)} es ahora la cotización principal`);
    onPrincipal?.({ ...v, principal: true });
  }

  async function quitar(v: VersionCot) {
    if (!(await confirmar({ titulo: `¿Quitar ${nombre(v)} de las versiones?`, mensaje: 'Se quita de la lista del proyecto. El PDF o enlace sigue existiendo.', confirmar: 'Quitar', peligro: true }))) return;
    setOcupado(v.url);
    const r = await fetch('/api/notion/cotizaciones/versiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, accion: 'quitar', id: v.id }),
    }).catch(() => null);
    setOcupado(null);
    if (!r || !r.ok) { const e = r ? await r.json().catch(() => ({})) : {}; notify.error(`No se pudo quitar: ${e.error || 'sin conexión'}`); return; }
    setVersiones(vs => vs && vs.filter(x => x.url !== v.url));
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden" onClick={e => e.stopPropagation()}>
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <Layers size={12} className="text-[#d4a200] flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-700 flex-1">Versiones de cotización</span>
        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full px-1.5">{versiones.length}</span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <ul className="border-t border-gray-100">
          {versiones.map(v => (
            <li key={v.url} className={`flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0 ${v.principal ? 'bg-amber-50/70' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                  <span className="truncate">{nombre(v)}</span>
                  {v.principal && (
                    <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 flex-shrink-0">
                      <Star size={8} className="fill-current" /> Principal
                    </span>
                  )}
                </p>
                <p className="text-[10.5px] text-gray-400 truncate">
                  {[fecha(v.fecha), v.usuario, v.total !== null ? formatCurrency(v.total) : 'sin monto en el OS'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <a href={v.url} target="_blank" rel="noopener noreferrer" title="Abrir" aria-label={`Abrir ${nombre(v)}`}
                className="p-1.5 rounded-md text-gray-400 hover:text-[#b8890b] hover:bg-amber-50"><ExternalLink size={12} /></a>
              {!v.principal && (
                <>
                  <button onClick={() => usar(v)} disabled={!!ocupado}
                    className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#ffc500] hover:bg-[#e6b000] text-white disabled:opacity-50 flex items-center gap-1">
                    {ocupado === v.url ? <Loader2 size={10} className="animate-spin" /> : null} Usar esta
                  </button>
                  {v.id && (
                    <button onClick={() => quitar(v)} disabled={!!ocupado} title="Quitar de la lista" aria-label={`Quitar ${nombre(v)}`}
                      className="p-1.5 rounded-md text-gray-300 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={12} /></button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

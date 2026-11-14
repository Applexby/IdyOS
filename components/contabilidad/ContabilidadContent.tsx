'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  RefreshCw, AlertTriangle, DollarSign, FileText, ExternalLink,
  ChevronDown, ChevronUp, Edit2, Save, Link, Calendar,
  CheckCircle, Clock, TrendingUp, PlusCircle, ChevronRight, Square, CheckSquare,
} from 'lucide-react';
import { formatCurrency, hoyLima, sumarDiasISO } from '@/lib/utils';
import PanelPago from '@/components/dashboard/PanelPago';
import RegistrarPago, { type DatosPago } from './RegistrarPago';
import IngresosTab from './IngresosTab';
import ConciliacionTab from './ConciliacionTab';
import HojaCobrar, { type CampoProyecto } from './HojaCobrar';
import { type ProyectoCont, fechaCorta } from './tipos';
import { useNotify, useConfirm } from '@/components/ui/Feedback';
import EnlacesDocumentos, { type CampoEnlace } from '@/components/ui/EnlacesDocumentos';
import { Trash2, Search, Wallet, Landmark, ListChecks, Table2, LayoutList } from 'lucide-react';
import DatePicker from '@/components/ui/DatePicker';

const fmt = (n: number) => formatCurrency(n);

type Proyecto = ProyectoCont;

// Sugiere fechas por defecto: inicio = hoy, entrega = +15 días (editable)
function defaultFechas(p: Proyecto) {
  const inicio = p.fecha_inicio || hoyLima();
  const entrega = p.fecha_entrega || sumarDiasISO(15);
  return { inicio, entrega };
}

// ─── Fila expandible de proyecto ─────────────────────────────────────────────
function FilaProyecto({ proyecto, onUpdate, onRegistrarPago, onAnularPago, onEnlace }: {
  proyecto: Proyecto;
  onUpdate: (proyectoId: string, data: any) => Promise<void>;
  onRegistrarPago: (proyectoId: string, d: DatosPago) => Promise<boolean>;
  onAnularPago: (proyectoId: string, linea: string, monto: number) => Promise<void>;
  onEnlace: (proyectoId: string, campo: CampoEnlace | 'total', valor: string | number | null) => void;
}) {
  const def = defaultFechas(proyecto);
  const [expanded, setExpanded]       = useState(false);
  const [editando, setEditando]       = useState(false);
  const [montoTotal, setMontoTotal]   = useState(String(proyecto.total ?? ''));
  const [fechaInicio, setFechaInicio] = useState(proyecto.fecha_inicio ?? def.inicio);
  const [fechaEntrega, setFechaEntrega] = useState(proyecto.fecha_entrega ?? def.entrega);
  const [saving, setSaving]           = useState(false);

  const total   = proyecto.total || 0;
  const pagado  = proyecto.monto_pagado || 0;
  const pend    = proyecto.monto_pendiente || 0;
  const alerta  = proyecto.alerta_pago;
  const pct     = total > 0 ? Math.round((pagado / total) * 100) : 0;

  // Edición de total y fechas. Los pagos se registran aparte (con su fecha real).
  async function guardar() {
    setSaving(true);
    try {
      await onUpdate(proyecto.id, {
        monto_total:  Number(montoTotal) || 0,
        fecha_inicio: fechaInicio || null,
        fecha_entrega: fechaEntrega || null,
      });
      setEditando(false);
    } finally { setSaving(false); }
  }

  return (
    <>
      <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer
        ${alerta === 'vencido' ? 'bg-red-50/30' : alerta === 'urgente' ? 'bg-orange-50/30' : ''}`}
        onClick={() => setExpanded(!expanded)}>

        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            {alerta && (
              <AlertTriangle size={13} className={
                alerta === 'vencido' ? 'text-red-500 flex-shrink-0' :
                alerta === 'urgente' ? 'text-orange-500 flex-shrink-0' :
                'text-amber-500 flex-shrink-0'} />
            )}
            <div>
              <p className="text-sm font-semibold text-gray-800 truncate max-w-48">{proyecto.proyecto}</p>
              <p className="text-xs text-gray-400">{proyecto.cliente || '—'}</p>
            </div>
          </div>
        </td>

        <td className="px-4 py-3.5 text-sm font-bold text-gray-800">{total ? fmt(total) : '—'}</td>

        <td className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 max-w-20">
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#ef4444' }} />
              </div>
            </div>
            <span className={`text-xs font-semibold ${pct >= 100 ? 'text-green-600' : pct > 0 ? 'text-amber-600' : 'text-gray-500'}`}>{pct}%</span>
          </div>
        </td>

        <td className="px-4 py-3.5">
          <span className={`text-sm font-bold ${pend > 0 ? 'text-red-500' : 'text-green-600'}`}>
            {pend > 0 ? fmt(pend) : '✓ Pagado'}
          </span>
        </td>

        <td className="px-4 py-3.5">
          {proyecto.fecha_entrega ? (
            <span className={`text-xs font-medium ${
              alerta === 'vencido' ? 'text-red-600 font-bold' :
              alerta === 'urgente' ? 'text-orange-600' :
              alerta === 'proximo' ? 'text-amber-600' : 'text-gray-600'}`}>
              {alerta === 'vencido' ? '⚠ ' : ''}{fechaCorta(proyecto.fecha_entrega)}
            </span>
          ) : <span className="text-gray-300 text-xs">Sin definir</span>}
        </td>

        <td className="px-4 py-3.5 text-xs text-gray-500">{proyecto.encargado || '—'}</td>

        <td className="px-4 py-3.5">
          <button className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <td colSpan={7} className="px-5 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Datos financieros + edición */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Detalle financiero</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Total c/IGV', value: total ? fmt(total) : '—' },
                    { label: 'Pagado',      value: fmt(pagado) },
                    { label: 'Pendiente',   value: pend > 0 ? fmt(pend) : '✓' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-xl p-2.5 border border-gray-100">
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p className="text-sm font-bold text-gray-800">{value}</p>
                    </div>
                  ))}
                </div>

                {!editando && (
                  <button onClick={e => { e.stopPropagation(); setEditando(true); }}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
                    <Edit2 size={11} /> Editar total y fechas
                  </button>
                )}

                {editando && (
                  <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3" onClick={e => e.stopPropagation()}>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 mb-1 block flex items-center gap-1"><DollarSign size={10} /> Monto total del proyecto (S/ con IGV)</label>
                      <input type="number" value={montoTotal} onChange={e => setMontoTotal(e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#ffc500]" />
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* BLOQUE 2: Fechas del proyecto (producción) */}
                    <div className="space-y-2.5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Calendar size={10} /> Fechas del proyecto</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Inicio</label>
                          <DatePicker value={fechaInicio} onChange={v => setFechaInicio(v)} />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Entrega</label>
                          <DatePicker value={fechaEntrega} borrable onChange={v => setFechaEntrega(v)} />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => setEditando(false)} className="flex-1 text-xs text-gray-500 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 transition-colors">
                        Cancelar
                      </button>
                      <button onClick={guardar} disabled={saving}
                        className="flex-1 bg-[#ffc500] text-white text-xs font-bold rounded-lg py-1.5 hover:bg-[#e6b000] transition-colors disabled:opacity-40 flex items-center justify-center gap-1">
                        <Save size={11} /> {saving ? '...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Pagos recibidos (cada uno con su fecha real) */}
                <div className="bg-white border border-gray-100 rounded-xl p-3" onClick={e => e.stopPropagation()}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Pagos recibidos</p>
                  {(proyecto.pagos || []).length === 0 ? (
                    <p className="text-[12px] text-gray-400">Aún no hay pagos registrados.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {proyecto.pagos.map((pg, i) => (
                        <li key={i} className="flex items-center gap-2 text-[12px]">
                          <span className="text-gray-500 w-[72px] flex-shrink-0">{fechaCorta(pg.fecha)}</span>
                          <span className="flex-1 min-w-0 truncate text-gray-600">
                            {[pg.medio, pg.operacion && `Op ${pg.operacion}`, pg.nota, pg.usuario].filter(Boolean).join(' · ') || '—'}
                            {pg.estimado && <span className="text-amber-600 font-semibold"> · sin detalle</span>}
                          </span>
                          <span className="font-semibold text-gray-800">{fmt(pg.monto)}</span>
                          {!pg.estimado && (
                            <button onClick={() => onAnularPago(proyecto.id, pg.linea, pg.monto)} title="Anular este pago"
                              aria-label="Anular pago" className="text-gray-300 hover:text-rose-500 p-0.5"><Trash2 size={12} /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {pend > 0 && (
                    <div className="mt-3">
                      <RegistrarPago pendiente={pend} onRegistrar={d => onRegistrarPago(proyecto.id, d)} />
                    </div>
                  )}
                </div>
              </div>

              {/* Documentos: enlaces editables a mano (propuestas en Drive, contrato, factura…) */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Documentos</p>
                <EnlacesDocumentos key={proyecto.id} pageId={proyecto.id}
                  enlaces={{ cotizacion: proyecto.cotizacion_url, contrato: proyecto.contrato_url, factura: proyecto.factura_url, drive: proyecto.drive_url }}
                  onCambio={(campo, url) => onEnlace(proyecto.id, campo, url)}
                  onCotizacionPrincipal={v => { if (v.total !== null) onEnlace(proyecto.id, 'total', v.total); }} />
                <a href={proyecto.notion_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700 transition-colors">
                  <ExternalLink size={10} /> Ver en Notion
                </a>
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Módulo principal ─────────────────────────────────────────────────────────
type Pestana = 'cobrar' | 'ingresos' | 'conciliacion';

export default function ContabilidadContent() {
  const notify = useNotify();
  const confirmar = useConfirm();
  const { data: session } = useSession();
  // La conciliación bancaria (estado de cuenta / Libro Bancos) es solo para administradores
  const esAdmin = (session?.user as any)?.role === 'admin';
  const [proyectos, setProyectos] = useState<Proyecto[]>([]); // TODOS los ganados (con sus pagos)
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pestana, setPestana]     = useState<Pestana>('cobrar');
  const [busqueda, setBusqueda]   = useState('');
  const [verPagados, setVerPagados] = useState(false);
  const [panelPago, setPanelPago] = useState<any | null>(null);
  // Por cobrar: vista de lista (tarjetas) u hoja editable tipo Excel; se recuerda en este navegador
  const [vistaCobrar, setVistaCobrar] = useState<'lista' | 'hoja'>('lista');
  useEffect(() => { try { if (localStorage.getItem('conta_vista') === 'hoja') setVistaCobrar('hoja'); } catch { /* noop */ } }, []);
  const cambiarVista = (v: 'lista' | 'hoja') => { setVistaCobrar(v); try { localStorage.setItem('conta_vista', v); } catch { /* noop */ } };

  // Se cargan todos los proyectos ganados una vez; las pestañas filtran en memoria.
  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch(`/api/notion/contabilidad-proyectos?incluir_pagados=1${silent ? '&fresh=1' : ''}`);
      const data = await res.json();
      if (data.proyectos) setProyectos(data.proyectos);
      else if (data.error) notify.error(`No se pudo cargar contabilidad: ${data.error}`);
    } catch {
      notify.error('Sin conexión con el servidor');
    } finally { setLoading(false); setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const totales = {
    vendido:   proyectos.reduce((a, p) => a + (p.total || 0), 0),
    cobrado:   proyectos.reduce((a, p) => a + (p.monto_pagado || 0), 0),
    pendiente: proyectos.reduce((a, p) => a + Math.max(0, p.monto_pendiente || 0), 0),
  };
  const conAlerta = proyectos.filter(p => p.alerta_pago && p.monto_pendiente > 0);

  // Checklist de cobranza: proyectos con alerta de pago activa (vencido/urgente/proximo),
  // ordenados por urgencia. Mismo concepto que el seguimiento de leads del dashboard.
  const ORDEN_ALERTA: Record<string, number> = { vencido: 0, urgente: 1, proximo: 2 };
  const alertasCobranza = conAlerta
    .filter(p => !p.cobranza_oculta)
    .sort((a, b) => (ORDEN_ALERTA[a.alerta_pago!] ?? 9) - (ORDEN_ALERTA[b.alerta_pago!] ?? 9));

  const q = busqueda.trim().toLowerCase();
  const visibles = proyectos
    .filter(p => verPagados || p.monto_pendiente > 0)
    .filter(p => !q || `${p.proyecto} ${p.cliente} ${p.ruc}`.toLowerCase().includes(q));

  // Adapta un Proyecto a la forma que espera PanelPago (nombre, monto_total, telefono, etc.)
  function abrirPanelPago(p: Proyecto) {
    setPanelPago({
      id: p.id,
      nombre: p.proyecto,
      cliente: p.cliente,
      telefono: p.telefono,
      monto_total: p.total,
      monto_pagado: p.monto_pagado,
      monto_pendiente: p.monto_pendiente,
      fecha_limite: p.fecha_entrega,
      fecha_entrega: p.fecha_entrega,
      alerta_pago: p.alerta_pago,
    });
  }

  async function patch(body: any): Promise<boolean> {
    const res = await fetch('/api/notion/contabilidad-proyectos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null);
    if (!res || !res.ok) {
      const e = res ? await res.json().catch(() => ({})) : {};
      notify.error(`No se pudo guardar: ${e.error || 'sin conexión'}`);
      return false;
    }
    return true;
  }

  // Marca recordatorio enviado → la cobranza sale del checklist (optimista) y reaparece según hitos
  async function marcarRecordatorio(proyectoId: string) {
    setProyectos(prev => prev.map(p => p.id === proyectoId ? { ...p, cobranza_oculta: true } : p));
    if (await patch({ pageId: proyectoId, marcar_recordatorio: true })) setTimeout(() => cargar(true), 2000);
    else cargar(true);
  }

  const handleUpdate = useCallback(async (proyectoId: string, data: any) => {
    if (await patch({ pageId: proyectoId, ...data })) {
      notify.success('Cambios guardados');
      setTimeout(() => cargar(true), 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar]);

  // Registrar un abono (optimista: el saldo baja al instante)
  // sin_sumar: completa el detalle de un pago que ya estaba en Monto Pagado (fila "sin detalle")
  const registrarPago = useCallback(async (proyectoId: string, d: DatosPago & { sin_sumar?: boolean }): Promise<boolean> => {
    const previo = proyectos.find(p => p.id === proyectoId);
    const suma = d.sin_sumar ? 0 : d.monto;
    setProyectos(prev => prev.map(p => p.id !== proyectoId ? p : {
      ...p,
      monto_pagado: (p.monto_pagado || 0) + suma,
      monto_pendiente: (p.monto_pendiente || 0) - suma,
      pagos: [...(p.pagos || []).filter(x => !(d.sin_sumar && x.estimado)),
        { fecha: d.fecha, monto: d.monto, medio: d.medio, operacion: d.operacion, nota: d.nota, usuario: '', linea: '', estimado: false, proyecto_id: p.id, proyecto: p.proyecto, cliente: p.cliente }]
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    }));
    const ok = await patch({ pageId: proyectoId, registrar_pago: d });
    if (!ok) { if (previo) setProyectos(prev => prev.map(p => p.id === proyectoId ? previo : p)); return false; }
    notify.success(d.sin_sumar ? 'Detalle del pago guardado' : `Pago de ${fmt(d.monto)} registrado`);
    setTimeout(() => cargar(true), 2000);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectos, cargar]);

  // Enlace de documento guardado (EnlacesDocumentos ya lo escribió en Notion)
  // (o el total, si se eligió otra versión de cotización como principal)
  const cambiarEnlace = useCallback((proyectoId: string, campo: CampoEnlace | 'total', valor: string | number | null) => {
    if (campo === 'total') {
      const total = Number(valor) || 0;
      setProyectos(prev => prev.map(p => p.id === proyectoId
        ? { ...p, total, monto_pendiente: Math.round((total - (p.monto_pagado || 0)) * 100) / 100 } : p));
      return;
    }
    const k = ({ cotizacion: 'cotizacion_url', contrato: 'contrato_url', factura: 'factura_url', drive: 'drive_url' } as const)[campo];
    setProyectos(prev => prev.map(p => p.id === proyectoId ? { ...p, [k]: valor } : p));
  }, []);

  // Hoja editable: guardar una celda del proyecto (optimista, con vuelta atrás si falla)
  const guardarCampo = useCallback(async (proyectoId: string, campo: CampoProyecto, valor: string | number | null): Promise<boolean> => {
    const previo = proyectos.find(p => p.id === proyectoId);
    setProyectos(prev => prev.map(p => {
      if (p.id !== proyectoId) return p;
      if (campo === 'monto_total') {
        const total = Number(valor) || 0;
        return { ...p, total, monto_pendiente: Math.round((total - (p.monto_pagado || 0)) * 100) / 100 };
      }
      return { ...p, [campo]: valor };
    }));
    const ok = await patch({ pageId: proyectoId, [campo]: valor });
    if (!ok) { if (previo) setProyectos(prev => prev.map(p => p.id === proyectoId ? previo : p)); return false; }
    setTimeout(() => cargar(true), 2000);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectos, cargar]);

  // Hoja editable: corregir un pago del historial (fecha, monto, medio, n° op., nota)
  const editarPago = useCallback(async (proyectoId: string, linea: string, nuevo: DatosPago): Promise<boolean> => {
    const previo = proyectos.find(p => p.id === proyectoId);
    setProyectos(prev => prev.map(p => {
      if (p.id !== proyectoId) return p;
      const antes = (p.pagos || []).find(x => x.linea === linea);
      const dif = antes ? nuevo.monto - antes.monto : 0;
      return {
        ...p,
        monto_pagado: (p.monto_pagado || 0) + dif,
        monto_pendiente: (p.monto_pendiente || 0) - dif,
        pagos: (p.pagos || []).map(x => x.linea === linea ? { ...x, ...nuevo } : x).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      };
    }));
    const ok = await patch({ pageId: proyectoId, editar_pago: { linea, nuevo } });
    if (!ok) { if (previo) setProyectos(prev => prev.map(p => p.id === proyectoId ? previo : p)); cargar(true); return false; }
    // La línea cambió en Notion: se recarga enseguida para poder seguir editándola
    cargar(true);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectos, cargar]);

  const anularPago = useCallback(async (proyectoId: string, linea: string, monto: number) => {
    if (!(await confirmar({ titulo: `¿Anular el pago de ${fmt(monto)}?`, mensaje: 'Se quitará del historial y se restará del monto pagado del proyecto.', confirmar: 'Anular pago', peligro: true }))) return;
    if (await patch({ pageId: proyectoId, anular_pago: { linea } })) {
      notify.success('Pago anulado');
      cargar(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar]);

  const PESTANAS: { k: Pestana; l: string; icon: any }[] = [
    { k: 'cobrar', l: 'Por cobrar', icon: ListChecks },
    { k: 'ingresos', l: 'Ingresos', icon: Wallet },
    ...(esAdmin ? [{ k: 'conciliacion' as Pestana, l: 'Libro Bancos', icon: Landmark }] : []),
  ];

  return (
    <div className="bg-gray-100/60 min-h-full p-4 sm:p-6 space-y-5">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Contabilidad</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Cobros de proyectos ganados · cada pago cuenta en el mes en que entró</p>
        </div>
        <button onClick={() => cargar(true)} disabled={refreshing} aria-label="Actualizar"
          className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
        {PESTANAS.map(({ k, l, icon: Icon }) => (
          <button key={k} onClick={() => setPestana(k)}
            className={`flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-xl whitespace-nowrap transition-colors
              ${pestana === k ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-white hover:text-gray-800'}`}>
            <Icon size={14} /> {l}
            {k === 'cobrar' && conAlerta.length > 0 && <span className="ml-0.5 text-[10px] bg-amber-400 text-white rounded-full px-1.5">{conAlerta.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
          </div>
          <div className="h-64 bg-white rounded-2xl border border-gray-100 animate-pulse" />
        </div>
      ) : pestana === 'ingresos' ? (
        <IngresosTab proyectos={proyectos} />
      ) : pestana === 'conciliacion' && esAdmin ? (
        <ConciliacionTab proyectos={proyectos} onRegistrarPago={registrarPago} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total vendido',    value: fmt(totales.vendido),   icon: TrendingUp,  color: 'bg-sky-50 text-sky-600',         dot: 'bg-sky-500' },
              { label: 'Total cobrado',    value: fmt(totales.cobrado),   icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
              { label: 'Por cobrar',       value: fmt(totales.pendiente), icon: Clock,       color: totales.pendiente > 0 ? 'bg-rose-50 text-rose-500' : 'bg-gray-50 text-gray-400', dot: totales.pendiente > 0 ? 'bg-rose-500' : 'bg-gray-300' },
              { label: 'Alertas de pago',  value: conAlerta.length,       icon: AlertTriangle, color: conAlerta.length > 0 ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-400', dot: conAlerta.length > 0 ? 'bg-amber-500' : 'bg-gray-300' },
            ].map(({ label, value, icon: Icon, color, dot }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04)] p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon size={14} />
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                </div>
                <p className="text-[22px] font-bold text-gray-900 tracking-tight">{value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar proyecto, cliente o RUC…"
                className="w-full pl-8 pr-3 py-2.5 text-[13px] border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#ffc500]" />
            </div>
            <div className="flex bg-white border border-gray-200 rounded-xl p-0.5" role="radiogroup" aria-label="Vista">
              {([['lista', 'Lista', LayoutList], ['hoja', 'Hoja', Table2]] as const).map(([v, l, Icon]) => (
                <button key={v} role="radio" aria-checked={vistaCobrar === v} onClick={() => cambiarVista(v)}
                  title={v === 'hoja' ? 'Hoja editable tipo Excel: todas las celdas se editan en el sitio' : 'Vista de lista'}
                  className={`flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-lg transition-colors
                    ${vistaCobrar === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                  <Icon size={13} /> {l}
                </button>
              ))}
            </div>
            <button onClick={() => setVerPagados(v => !v)}
              className={`text-[13px] font-medium px-3.5 py-2.5 rounded-xl border transition-colors flex items-center gap-1.5
                ${verPagados ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              <CheckCircle size={14} /> {verPagados ? 'Mostrando también saldados' : 'Ver también saldados'}
            </button>
          </div>

          {/* ── Checklist de cobranza ── */}
          {alertasCobranza.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-amber-600" />
                </div>
                <h2 className="text-sm font-bold text-gray-800">Cobranzas por gestionar</h2>
                <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {alertasCobranza.length}
                </span>
              </div>

              <div className="space-y-2">
                {alertasCobranza.map(p => (
                  <div key={p.id} onClick={() => abrirPanelPago(p)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm active:scale-[0.99]
                      ${p.alerta_pago === 'vencido' ? 'bg-red-50 border-red-200 hover:bg-red-100' :
                        p.alerta_pago === 'urgente' ? 'bg-orange-50 border-orange-200 hover:bg-orange-100' :
                        'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (p.alerta_pago !== 'vencido') marcarRecordatorio(p.id); }}
                      disabled={p.alerta_pago === 'vencido'}
                      title={p.alerta_pago === 'vencido' ? 'Pago vencido: gestiona el cobro' : 'Marcar: recordatorio enviado'}
                      aria-label="Marcar recordatorio enviado"
                      className={`flex-shrink-0 transition-colors ${p.alerta_pago === 'vencido' ? 'text-red-300 cursor-not-allowed' : 'text-amber-500 hover:text-amber-700'}`}>
                      {p.alerta_pago === 'vencido' ? <AlertTriangle size={18} /> : <Square size={20} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.proyecto}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {p.cliente ? `${p.cliente} · ` : ''}Pendiente: <strong>{fmt(p.monto_pendiente)}</strong>
                        {p.fecha_entrega && ` · Entrega: ${fechaCorta(p.fecha_entrega)}`}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0
                      ${p.alerta_pago === 'vencido' ? 'bg-red-100 text-red-700' :
                        p.alerta_pago === 'urgente' ? 'bg-orange-100 text-orange-700' :
                        'bg-amber-100 text-amber-700'}`}>
                      {p.alerta_pago === 'vencido' ? 'Vencido' : p.alerta_pago === 'urgente' ? 'Urgente' : 'Próximo'}
                    </span>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {visibles.length === 0 ? (
            <div className="text-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-100">
              <DollarSign size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">{q ? 'Sin resultados para la búsqueda' : 'Sin proyectos por cobrar'}</p>
              <p className="text-sm mt-1">{q ? 'Prueba con otro nombre o activa "Ver también saldados"' : 'Marca un lead como GANADO en el CRM y aparecerá aquí para ponerle montos y fechas'}</p>
            </div>
          ) : vistaCobrar === 'hoja' ? (
            <HojaCobrar proyectos={visibles} onCampo={guardarCampo} onRegistrarPago={registrarPago} onEditarPago={editarPago} onAnularPago={anularPago} />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Proyecto','Total','Progreso','Pendiente','Entrega','Encargado',''].map(h => (
                      <th key={h} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 first:pl-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(p => (
                    <FilaProyecto key={p.id} proyecto={p} onUpdate={handleUpdate} onRegistrarPago={registrarPago} onAnularPago={anularPago} onEnlace={cambiarEnlace} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Panel de cobro + recordatorio WhatsApp (mismo del dashboard) */}
      {panelPago && (
        <PanelPago
          alerta={panelPago}
          onClose={() => setPanelPago(null)}
          onGuardar={async (contId, data) => {
            if (data.registrar_pago) return registrarPago(contId, data.registrar_pago);
            await handleUpdate(contId, data);
          }}
        />
      )}
    </div>
  );
}

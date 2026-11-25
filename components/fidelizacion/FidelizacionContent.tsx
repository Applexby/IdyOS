'use client';
// CRM → Fidelización: clientes que ya cerraron y a los que hay que volver a
// escribir (nueva parrilla, aniversario, cobertura de fin de año…).
//  • Recordatorios: cuenta regresiva, fecha editable, plazos rápidos y nota.
//  • Añadir: cualquier proyecto ganado (también antiguos) se puede programar.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartHandshake, RefreshCw, Search, MessageCircle, Check, Plus, Undo2, Loader2, ChevronDown } from 'lucide-react';
import DatePicker from '@/components/ui/DatePicker';
import { useNotify } from '@/components/ui/Feedback';
import { PLAZOS, enMeses, diasPara, textoCuenta, guardarFidelizacion } from '@/lib/fidelizacion';
import type { Lead } from '@/types/crm';

const nombreDe = (l: Lead) => l.cliente || l.empresa || l.proyecto || 'Cliente';
const telDe = (l: Lead) => (l.telefono || '').replace(/\D/g, '');

function colorCuenta(d: number) {
  if (d <= 0) return 'bg-red-50 text-red-600 border-red-100';
  if (d <= 7) return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-gray-50 text-gray-600 border-gray-100';
}

export default function FidelizacionContent() {
  const notify = useNotify();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [verAnadir, setVerAnadir] = useState(false);
  const [verPausados, setVerPausados] = useState(false);

  const cargar = useCallback(async (fresco = false) => {
    setCargando(true);
    try {
      const r = await fetch(`/api/notion/pipeline?estado=GANADO${fresco ? '&fresh=1&refresh=true' : ''}`);
      const d = await r.json();
      setLeads(d.leads || []);
    } catch { notify.error('No se pudieron cargar los clientes'); }
    finally { setCargando(false); }
  // useNotify() devuelve un objeto nuevo en cada render: si se pone como
  // dependencia, la carga se repite sin fin y la pantalla queda "cargando".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Cambio optimista + guardado en Notion
  async function cambiar(l: Lead, campos: { fidelizacion?: string | null; fidelizacion_estado?: string | null; fidelizacion_nota?: string }, aviso?: string) {
    const previo = l;
    setLeads(prev => prev.map(x => x.id === l.id ? { ...x, ...campos } as Lead : x));
    setOcupado(l.id);
    try { await guardarFidelizacion(l.id, campos); if (aviso) notify.success(aviso); }
    catch (e: any) { setLeads(prev => prev.map(x => x.id === l.id ? previo : x)); notify.error(e.message); }
    finally { setOcupado(''); }
  }

  const t = q.trim().toLowerCase();
  const coincide = (l: Lead) => !t || `${l.cliente} ${l.empresa} ${l.proyecto}`.toLowerCase().includes(t);
  const programados = useMemo(() => leads.filter(l => l.fidelizacion_estado === 'Programada' && l.fidelizacion && coincide(l))
    .sort((a, b) => (a.fidelizacion || '').localeCompare(b.fidelizacion || '')), [leads, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const sinProgramar = useMemo(() => leads.filter(l => !l.fidelizacion_estado && coincide(l))
    .sort((a, b) => (b.fecha_cobro || b.created_time || '').localeCompare(a.fecha_cobro || a.created_time || '')), [leads, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const pausados = useMemo(() => leads.filter(l => (l.fidelizacion_estado === 'No volver a escribir' || l.fidelizacion_estado === 'Contactado') && coincide(l)), [leads, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const vencidos = programados.filter(l => diasPara(l.fidelizacion!) <= 0).length;
  const proximos = programados.filter(l => { const d = diasPara(l.fidelizacion!); return d > 0 && d <= 30; }).length;

  const Plazos = ({ l, etiqueta = 'En' }: { l: Lead; etiqueta?: string }) => (
    <div className="flex flex-wrap gap-1">
      {PLAZOS.map(p => (
        <button key={p.meses} disabled={ocupado === l.id}
          onClick={() => cambiar(l, { fidelizacion: enMeses(p.meses), fidelizacion_estado: 'Programada' }, `${nombreDe(l)}: recordar en ${p.txt}`)}
          className="h-7 px-2.5 rounded-lg border border-gray-200 text-[11.5px] text-gray-600 hover:border-[var(--acento)] hover:bg-[var(--acento-suave)] disabled:opacity-50">
          {etiqueta} {p.txt}
        </button>
      ))}
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><HeartHandshake size={20} className="text-[var(--acento)]" /> Fidelización de clientes</h1>
          <p className="text-sm text-gray-500">Clientes que ya cerraron y a los que toca volver a escribir para que nos contraten de nuevo.</p>
        </div>
        <button onClick={() => cargar(true)} className="h-9 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 flex items-center gap-1.5">
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
        <button onClick={() => setVerAnadir(v => !v)} className="h-9 px-3.5 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-xs font-semibold flex items-center gap-1.5">
          <Plus size={14} /> Añadir proyecto
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['Para hoy o vencidos', vencidos, 'text-red-600'], ['Próximos 30 días', proximos, 'text-amber-600'], ['Programados', programados.length, 'text-gray-900']].map(([l, n, c]) => (
          <div key={l as string} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">{l}</p>
            <p className={`text-2xl font-bold ${c}`}>{cargando ? '…' : n}</p>
          </div>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente o proyecto…"
          className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[var(--acento)]" />
      </div>

      {/* Añadir: proyectos ganados sin fidelización (incluye antiguos) */}
      {verAnadir && (
        <section className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-800 mb-1">Añadir un proyecto a fidelización</p>
          <p className="text-xs text-gray-400 mb-3">Proyectos ganados que aún no tienen recordatorio. Elige en cuánto tiempo recordarte.</p>
          <div className="space-y-2 max-h-[360px] overflow-y-auto scroll-fino">
            {sinProgramar.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">{cargando ? 'Cargando…' : 'No hay proyectos sin programar.'}</p>}
            {sinProgramar.slice(0, 80).map(l => (
              <div key={l.id} className="flex items-center gap-3 flex-wrap border border-gray-100 rounded-xl p-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{nombreDe(l)}</p>
                  <p className="text-[11.5px] text-gray-400 truncate">{l.proyecto}{l.fecha_cobro ? ` · cerrado ${l.fecha_cobro.slice(0, 10).split('-').reverse().join('/')}` : ''}</p>
                </div>
                <Plazos l={l} />
                <button onClick={() => cambiar(l, { fidelizacion: null, fidelizacion_estado: 'No volver a escribir' })} className="text-[11px] text-gray-400 hover:text-gray-600">No volver a escribir</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recordatorios programados */}
      <section className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recordatorios</p>
        {programados.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            {cargando ? 'Cargando…' : 'Sin recordatorios. Al cerrar un cliente como Ganado te preguntaré cuándo volver a escribirle, o usa “Añadir proyecto”.'}
          </div>
        )}
        {programados.map(l => {
          const d = diasPara(l.fidelizacion!);
          const tel = telDe(l);
          return (
            <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-semibold text-gray-900">{nombreDe(l)}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorCuenta(d)}`}>{textoCuenta(l.fidelizacion!)}</span>
                  {ocupado === l.id && <Loader2 size={12} className="animate-spin text-gray-400" />}
                </div>
                <p className="text-[12px] text-gray-400 truncate">{l.proyecto}</p>
                <input defaultValue={l.fidelizacion_nota || ''} placeholder="Nota: motivo del recordatorio…"
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (l.fidelizacion_nota || '')) cambiar(l, { fidelizacion_nota: v }); }}
                  className="mt-2 w-full text-[12.5px] px-3 py-1.5 rounded-lg border border-gray-100 bg-gray-50 outline-none focus:border-[var(--acento)]" />
              </div>
              <div className="w-[170px]">
                <p className="text-[11px] text-gray-400 mb-1">Recordar el</p>
                <DatePicker value={l.fidelizacion!.slice(0, 10)} onChange={v => v && cambiar(l, { fidelizacion: v, fidelizacion_estado: 'Programada' })}
                  className="w-full h-9 px-3 rounded-xl border border-gray-200 text-sm text-left" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400">Reprogramar desde hoy</p>
                <Plazos l={l} />
              </div>
              <div className="flex flex-col gap-1.5">
                {tel.length >= 8 && (
                  <button onClick={() => window.open(`https://wa.me/${tel.length === 9 ? '51' + tel : tel}`, '_blank')}
                    className="h-8 px-3 rounded-lg bg-emerald-500 text-white text-[12px] font-semibold flex items-center gap-1.5"><MessageCircle size={13} /> WhatsApp</button>
                )}
                <button onClick={() => cambiar(l, { fidelizacion_estado: 'Contactado' }, `${nombreDe(l)}: marcado como contactado`)}
                  className="h-8 px-3 rounded-lg border border-gray-200 text-[12px] text-gray-600 flex items-center gap-1.5 hover:border-gray-300"><Check size={13} /> Ya le escribí</button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Contactados / sin fidelización */}
      {pausados.length > 0 && (
        <section>
          <button onClick={() => setVerPausados(v => !v)} className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
            Contactados y sin fidelización · {pausados.length} <ChevronDown size={13} className={verPausados ? 'rotate-180' : ''} />
          </button>
          {verPausados && (
            <div className="mt-2 space-y-1.5">
              {pausados.map(l => (
                <div key={l.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[13px] font-medium text-gray-700 truncate">{nombreDe(l)}</p>
                    <p className="text-[11px] text-gray-400">{l.fidelizacion_estado}{l.proyecto ? ` · ${l.proyecto}` : ''}</p>
                  </div>
                  <Plazos l={l} etiqueta="Volver en" />
                  {l.fidelizacion_estado === 'No volver a escribir' && (
                    <button onClick={() => cambiar(l, { fidelizacion_estado: null })} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"><Undo2 size={11} /> Quitar</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

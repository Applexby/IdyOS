'use client';
// Configuración: menú de secciones a la izquierda y, a la derecha, solo la
// sección elegida (General, Apariencia, Notificaciones y sonido, Cuentas
// conectadas, Mensajes, Actualizaciones, Ayuda y datos).

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  RefreshCw, Download, CheckCircle2, AlertTriangle, Bell, Settings, Palette, Link2,
  MessageCircle, HelpCircle, FolderOpen, PlugZap, Loader2, Sparkles, Search, HardDrive,
} from 'lucide-react';
import {
  Grupo, Caja, Fila, FilaInterruptor, botonSec, SeccionApariencia, CajaSonido, FilaMontos,
  SeccionCuentas, OpcionesMensajes, MemoriaMensajes,
} from './Apariencia';
import { abrirAyuda } from '@/components/shell/Ayuda';
import Selector from '@/components/ui/Selector';
import { useEscritorio, type PreferenciasPrograma, type EstadoActualizacion } from '@/lib/desktop';

const INTERVALOS = [1, 3, 6, 12, 24];

type IdSeccion = 'general' | 'apariencia' | 'avisos' | 'cuentas' | 'mensajes' | 'actualizaciones' | 'soporte';
const SECCIONES: { id: IdSeccion; nombre: string; icono: any; claves: string; escritorio?: boolean }[] = [
  { id: 'general', nombre: 'General', icono: Settings, claves: 'inicio windows segundo plano montos privacidad' },
  { id: 'apariencia', nombre: 'Apariencia', icono: Palette, claves: 'tema color oscuro claro vidrio acento perfil foto' },
  { id: 'avisos', nombre: 'Notificaciones y sonido', icono: Bell, claves: 'sonido volumen notificaciones avisos' },
  { id: 'cuentas', nombre: 'Cuentas conectadas', icono: Link2, claves: 'whatsapp messenger instagram tiktok drive google conectar qr', escritorio: true },
  { id: 'mensajes', nombre: 'Mensajes', icono: MessageCircle, claves: 'vista limpia memoria chats colores', escritorio: true },
  { id: 'actualizaciones', nombre: 'Actualizaciones', icono: RefreshCw, claves: 'version beta descargar', escritorio: true },
  { id: 'soporte', nombre: 'Ayuda y datos', icono: HelpCircle, claves: 'ayuda cache registros datos conexion usuarios' },
];
// Enlaces antiguos (#apariencia, #google-drive…)
const ALIAS: Record<string, IdSeccion> = { apariencia: 'apariencia', 'google-drive': 'cuentas', cuentas: 'cuentas', mensajes: 'mensajes', actualizaciones: 'actualizaciones' };

function hace(ms: number) {
  if (!ms) return 'nunca';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(ms).toLocaleString('es-PE');
}

function CabeceraVersion({ e, version, onBuscar, onDescargar, onInstalar }: {
  e: EstadoActualizacion | null; version?: string; onBuscar: () => void; onDescargar: () => void; onInstalar: () => void;
}) {
  const v = e?.nueva?.version;
  const ocupado = e?.fase === 'buscando' || e?.fase === 'descargando';
  const estado = (() => {
    switch (e?.fase) {
      case 'buscando': return { t: 'Buscando actualizaciones…', c: 'bg-gray-100 text-gray-500', i: <Loader2 size={22} className="animate-spin" /> };
      case 'disponible': return { t: `Versión ${v} disponible`, c: 'bg-amber-50 text-amber-600', i: <Sparkles size={22} /> };
      case 'descargando': return { t: `Descargando ${v}… ${e.progreso}%`, c: 'bg-amber-50 text-amber-600', i: <Download size={22} /> };
      case 'descargada': return { t: `Versión ${v} lista para instalar`, c: 'bg-emerald-50 text-emerald-600', i: <CheckCircle2 size={22} /> };
      case 'error': return { t: e.error || 'No se pudo comprobar', c: 'bg-rose-50 text-rose-600', i: <AlertTriangle size={22} /> };
      case 'no-soportado': return { t: e.error || 'Actualizaciones no disponibles aquí', c: 'bg-gray-100 text-gray-500', i: <AlertTriangle size={22} /> };
      default: return { t: 'IdyOS está al día', c: 'bg-emerald-50 text-emerald-600', i: <CheckCircle2 size={22} /> };
    }
  })();
  return (
    <Caja className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <span className={`w-12 h-12 rounded-2xl grid place-items-center flex-shrink-0 ${estado.c}`}>{estado.i}</span>
        <div className="flex-1 min-w-[180px]">
          <p className="text-[15px] font-semibold text-gray-900">{estado.t}</p>
          <p className="text-[12.5px] text-gray-500">Versión {version ?? '…'} · revisado {hace(e?.ultimaBusqueda || 0)}</p>
        </div>
        {e?.fase === 'disponible' && <button onClick={onDescargar} className="h-9 px-3.5 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[12.5px] font-semibold">Descargar {v}</button>}
        {e?.fase === 'descargada'
          ? <button onClick={onInstalar} className="h-9 px-3.5 rounded-xl bg-gray-900 text-white text-[12.5px] font-semibold">Reiniciar y actualizar</button>
          : <button disabled={ocupado} onClick={onBuscar} className={botonSec}><RefreshCw size={13} className={e?.fase === 'buscando' ? 'animate-spin' : ''} /> Buscar ahora</button>}
      </div>
      {e?.fase === 'descargando' && (
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-[var(--acento)] transition-all" style={{ width: `${e.progreso}%` }} /></div>
      )}
      {e?.nueva?.notas && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600 max-h-48 overflow-y-auto">
          <p className="font-semibold text-gray-800 mb-1">Novedades de la versión {e.nueva.version}</p>
          <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: e.nueva.notas }} />
        </div>
      )}
    </Caja>
  );
}

export default function ProgramaContent() {
  const { escritorio, info, setInfo, actualizacion: e, api } = useEscritorio();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';
  const [seccion, setSeccion] = useState<IdSeccion>('general');
  const [busqueda, setBusqueda] = useState('');
  const [limpiando, setLimpiando] = useState(false);

  // #apariencia, #google-drive… (desde la búsqueda rápida o enlaces antiguos)
  useEffect(() => {
    const h = window.location.hash.replace('#', '');
    if (ALIAS[h]) setSeccion(ALIAS[h]);
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return SECCIONES.filter(s => (escritorio || !s.escritorio) && (!q || `${s.nombre} ${s.claves}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)));
  }, [busqueda, escritorio]);
  useEffect(() => { if (visibles.length && !visibles.some(s => s.id === seccion)) setSeccion(visibles[0].id); }, [visibles, seccion]);

  const pref = info?.preferencias;
  const guardar = async (c: Partial<PreferenciasPrograma>) => {
    if (!api || !info) return;
    const p = await api.guardarPreferencias(c);
    setInfo({ ...info, preferencias: p });
  };
  const hayAviso = e?.fase === 'disponible' || e?.fase === 'descargada';
  const actual = SECCIONES.find(s => s.id === seccion);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">Configuración</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            {escritorio ? `IdyOS ${info?.version ?? '…'}` : 'IdyOS web'}{session?.user?.name ? ` · ${session.user.name}` : ''}
          </p>
        </div>
        <label className="flex items-center gap-2 h-10 w-72 max-w-full px-3 rounded-xl border border-gray-200 bg-white focus-within:border-[var(--acento)]">
          <Search size={15} className="text-gray-400" />
          <input value={busqueda} onChange={ev => setBusqueda(ev.target.value)} placeholder="Buscar un ajuste" aria-label="Buscar un ajuste"
            className="flex-1 bg-transparent text-[13px] outline-none" />
        </label>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <nav aria-label="Secciones de configuración" className="flex-[1_1_220px] max-w-[250px] space-y-0.5">
          {visibles.map(({ id, nombre, icono: Icono }) => {
            const activa = id === seccion;
            return (
              <button key={id} onClick={() => setSeccion(id)} aria-current={activa ? 'page' : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-[13.5px] transition-colors
                  ${activa ? 'bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06)] font-semibold text-gray-900' : 'text-gray-600 hover:bg-gray-200/60 hover:text-gray-900'}`}>
                <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${activa ? 'bg-[var(--acento)] text-[var(--acento-texto)]' : 'bg-gray-200/70 text-gray-500'}`}><Icono size={15} /></span>
                <span className="flex-1">{nombre}</span>
                {id === 'actualizaciones' && hayAviso && <span className="w-2 h-2 rounded-full bg-amber-500" />}
              </button>
            );
          })}
          {!visibles.length && <p className="text-[12.5px] text-gray-400 px-2.5 py-2">Sin resultados</p>}
        </nav>

        <main className="flex-[999_1_560px] min-w-0 space-y-5">
          {actual && <h2 className="text-[17px] font-semibold text-gray-900">{actual.nombre}</h2>}

          {seccion === 'general' && (
            <>
              {escritorio && pref && (
                <Grupo titulo="Inicio">
                  <FilaInterruptor titulo="Abrir IdyOS al iniciar Windows" desc="Se abre minimizado en la bandeja." activo={pref.iniciarConWindows !== false} onChange={v => guardar({ iniciarConWindows: v })} />
                  <FilaInterruptor titulo="Seguir en segundo plano al cerrar" desc="La X oculta la ventana; para salir: clic derecho en el icono → Salir." activo={pref.segundoPlano !== false} onChange={v => guardar({ segundoPlano: v })} />
                </Grupo>
              )}
              <Grupo titulo="Privacidad"><FilaMontos /></Grupo>
            </>
          )}

          {seccion === 'apariencia' && <SeccionApariencia />}

          {seccion === 'avisos' && (
            <>
              {escritorio && pref && (
                <Grupo>
                  <FilaInterruptor titulo="Notificaciones de Windows" desc="Mensajes nuevos, fidelización y versiones nuevas." activo={pref.notificaciones} onChange={v => guardar({ notificaciones: v })} />
                </Grupo>
              )}
              <CajaSonido />
            </>
          )}

          {seccion === 'cuentas' && <SeccionCuentas />}

          {seccion === 'mensajes' && (
            <>
              <OpcionesMensajes segundoPlano={pref?.mensajesSegundoPlano} onSegundoPlano={pref ? v => guardar({ mensajesSegundoPlano: v }) : undefined} />
              <MemoriaMensajes />
            </>
          )}

          {seccion === 'actualizaciones' && (
            <>
              <CabeceraVersion e={e} version={info?.version} onBuscar={() => api?.buscarActualizacion()} onDescargar={() => api?.descargarActualizacion()} onInstalar={() => api?.instalarActualizacion()} />
              {pref && (
                <Grupo>
                  <FilaInterruptor titulo="Buscar automáticamente" activo={pref.autoBuscar} onChange={v => guardar({ autoBuscar: v })} />
                  {pref.autoBuscar && (
                    <Fila titulo="Cada cuánto">
                      <Selector value={String(pref.intervaloHoras)} onChange={ev => guardar({ intervaloHoras: Number(ev.target.value) })}
                        className="w-[120px] h-9 px-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-800 focus:outline-none focus:border-[var(--acento)]">
                        {INTERVALOS.map(h => <option key={h} value={String(h)}>{h} {h === 1 ? 'hora' : 'horas'}</option>)}
                      </Selector>
                    </Fila>
                  )}
                  <FilaInterruptor titulo="Descargar en segundo plano" desc="Solo tendrás que reiniciar." activo={pref.autoDescargar} onChange={v => guardar({ autoDescargar: v })} />
                  <FilaInterruptor titulo="Versiones de prueba (beta)" activo={pref.canal === 'beta'} onChange={v => guardar({ canal: v ? 'beta' : 'latest' })} />
                </Grupo>
              )}
            </>
          )}

          {seccion === 'soporte' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Caja className="space-y-3">
                <div><p className="text-[13.5px] font-medium text-gray-900">Ayuda</p><p className="text-[12.5px] text-gray-500">Guía de cada sección y atajos.</p></div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={abrirAyuda} className="h-9 px-3.5 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[12.5px] font-semibold flex items-center gap-1.5"><HelpCircle size={13} /> Abrir ayuda</button>
                  {escritorio && isAdmin && <button onClick={() => api?.verBienvenida?.()} className={botonSec}><Sparkles size={13} /> Ver bienvenida</button>}
                </div>
              </Caja>
              {escritorio && (
                <Caja className="space-y-3">
                  <div><p className="text-[13.5px] font-medium text-gray-900">Caché</p><p className="text-[12.5px] text-gray-500">Si algo se ve desactualizado.</p></div>
                  <button disabled={limpiando} onClick={async () => { setLimpiando(true); try { await api?.limpiarCache(); } finally { setLimpiando(false); } }} className={botonSec}>
                    {limpiando ? <Loader2 size={13} className="animate-spin" /> : <HardDrive size={13} />} Limpiar caché
                  </button>
                </Caja>
              )}
              {escritorio && (
                <Caja className="space-y-3">
                  <div><p className="text-[13.5px] font-medium text-gray-900">Archivos del programa</p><p className="text-[12.5px] text-gray-500">Para enviar a soporte si hay un error.</p></div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => api?.abrirCarpeta('logs')} className={botonSec}><FolderOpen size={13} /> Registros</button>
                    <button onClick={() => api?.abrirCarpeta('datos')} className={botonSec}><FolderOpen size={13} /> Datos</button>
                  </div>
                </Caja>
              )}
              {escritorio && isAdmin && (
                <Caja className="space-y-3">
                  <div>
                    <p className="text-[13.5px] font-medium text-gray-900">Conexión y usuarios <span className="ml-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 align-middle">Admin</span></p>
                    <p className="text-[12.5px] text-gray-500">Claves y personas con acceso.</p>
                  </div>
                  <button onClick={() => api?.abrirConexion()} className={botonSec}><PlugZap size={13} /> Abrir</button>
                </Caja>
              )}
              {!escritorio && <p className="sm:col-span-2 text-[12.5px] text-gray-500">Actualizaciones, cuentas y caché están en el programa de escritorio IdyOS.</p>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

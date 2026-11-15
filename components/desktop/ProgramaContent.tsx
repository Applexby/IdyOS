'use client';
// Ajustes del programa (solo en el .exe): versión, actualizaciones (manual y
// automática), notificaciones, caché local y conexión.

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  RefreshCw, Download, CheckCircle2, AlertTriangle, Bell, Clock,
  HardDrive, FolderOpen, PlugZap, Loader2, Monitor, Sparkles, Power,
} from 'lucide-react';
import Apariencia from './Apariencia';
import { useEscritorio, type PreferenciasPrograma, type EstadoActualizacion } from '@/lib/desktop';

const INTERVALOS = [1, 3, 6, 12, 24];

function hace(ms: number) {
  if (!ms) return 'nunca';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(ms).toLocaleString('es-PE');
}

function Tarjeta({ titulo, icono: Icono, children }: { titulo: string; icono: any; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
        <Icono size={15} className="text-[#ffc500]" /> {titulo}
      </h2>
      {children}
    </section>
  );
}

function Interruptor({ activo, onChange, label, desc }: { activo: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex items-start gap-3 py-2 cursor-pointer">
      <button type="button" role="switch" aria-checked={activo} onClick={() => onChange(!activo)}
        className={`mt-0.5 relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${activo ? 'bg-[#ffc500]' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${activo ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
      <span className="flex-1">
        <span className="block text-[13px] font-medium text-gray-800">{label}</span>
        {desc && <span className="block text-xs text-gray-400">{desc}</span>}
      </span>
    </label>
  );
}

function EstadoTexto({ e }: { e: EstadoActualizacion | null }) {
  if (!e) return null;
  const v = e.nueva?.version;
  switch (e.fase) {
    case 'buscando': return <span className="flex items-center gap-1.5 text-gray-500"><Loader2 size={13} className="animate-spin" /> Buscando actualizaciones…</span>;
    case 'al-dia': return <span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 size={13} /> Tienes la última versión.</span>;
    case 'disponible': return <span className="flex items-center gap-1.5 text-amber-700"><Sparkles size={13} /> Versión {v} disponible.</span>;
    case 'descargando': return <span className="flex items-center gap-1.5 text-amber-700"><Download size={13} /> Descargando {v}… {e.progreso}%</span>;
    case 'descargada': return <span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 size={13} /> Versión {v} lista para instalar.</span>;
    case 'error': return <span className="flex items-start gap-1.5 text-red-600"><AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {e.error}</span>;
    case 'no-soportado': return <span className="text-gray-500">{e.error}</span>;
    default: return <span className="text-gray-400">Sin comprobar todavía.</span>;
  }
}

export default function ProgramaContent() {
  const { escritorio, info, setInfo, actualizacion: e, api } = useEscritorio();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';
  const [limpiando, setLimpiando] = useState(false);

  // Hash #apariencia (desde "Temas" en la barra lateral)
  useEffect(() => {
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  if (!escritorio) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
        <Apariencia />
        <p className="text-sm text-gray-500">Las actualizaciones y la caché solo están en el programa de escritorio IdyOS (.exe).</p>
      </div>
    );
  }

  const pref = info?.preferencias;
  const guardar = async (c: Partial<PreferenciasPrograma>) => {
    if (!api || !info) return;
    const p = await api.guardarPreferencias(c);
    setInfo({ ...info, preferencias: p });
  };
  const ocupado = e?.fase === 'buscando' || e?.fase === 'descargando';

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500">IdyOS para escritorio · versión {info?.version ?? '…'}</p>
      </div>

      <Apariencia />

      <Tarjeta titulo="Actualizaciones" icono={RefreshCw}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex-1 min-w-[220px] text-[13px]"><EstadoTexto e={e} /></div>
          {e?.fase === 'disponible' && (
            <button onClick={() => api?.descargarActualizacion()}
              className="px-3.5 py-2 rounded-xl bg-[#ffc500] text-gray-900 text-xs font-semibold hover:brightness-95">
              Descargar {e.nueva?.version}
            </button>
          )}
          {e?.fase === 'descargada' ? (
            <button onClick={() => api?.instalarActualizacion()}
              className="px-3.5 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-black">
              Reiniciar y actualizar
            </button>
          ) : (
            <button disabled={ocupado} onClick={() => api?.buscarActualizacion()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-50">
              <RefreshCw size={13} className={e?.fase === 'buscando' ? 'animate-spin' : ''} /> Buscar ahora
            </button>
          )}
        </div>

        {e?.fase === 'descargando' && (
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-3">
            <div className="h-full bg-[#ffc500] transition-all" style={{ width: `${e.progreso}%` }} />
          </div>
        )}

        {e?.nueva?.notas && (
          <div className="mb-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600 max-h-48 overflow-y-auto">
            <p className="font-semibold text-gray-800 mb-1">Novedades de la versión {e.nueva.version}</p>
            <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: e.nueva.notas }} />
          </div>
        )}

        <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-2">
          <Clock size={12} /> Última búsqueda: {hace(e?.ultimaBusqueda || pref?.ultimaBusqueda || 0)}
        </p>

        {pref && (
          <div className="border-t border-gray-100 pt-2">
            <Interruptor activo={pref.autoBuscar} onChange={v => guardar({ autoBuscar: v })}
              label="Buscar actualizaciones automáticamente"
              desc="Al abrir el programa y cada cierto tiempo mientras está abierto." />
            {pref.autoBuscar && (
              <div className="flex items-center gap-2 pl-12 pb-2 text-[13px] text-gray-600">
                Cada
                <select value={pref.intervaloHoras} onChange={ev => guardar({ intervaloHoras: Number(ev.target.value) })}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-[13px] bg-white">
                  {INTERVALOS.map(h => <option key={h} value={h}>{h} {h === 1 ? 'hora' : 'horas'}</option>)}
                </select>
              </div>
            )}
            <Interruptor activo={pref.autoDescargar} onChange={v => guardar({ autoDescargar: v })}
              label="Descargar en segundo plano"
              desc="La versión nueva se baja sola; solo tendrás que reiniciar. Si se desactiva, se pregunta antes." />
            <Interruptor activo={pref.canal === 'beta'} onChange={v => guardar({ canal: v ? 'beta' : 'latest' })}
              label="Recibir versiones de prueba (beta)"
              desc="Para probar funciones nuevas antes que el resto del equipo." />
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Inicio y segundo plano" icono={Power}>
        {pref && (
          <>
            <Interruptor activo={pref.iniciarConWindows !== false} onChange={v => guardar({ iniciarConWindows: v })}
              label="Abrir IdyOS al iniciar Windows"
              desc="Se abre minimizado en la bandeja (junto a la batería y el volumen), listo para avisarte." />
            <Interruptor activo={pref.segundoPlano !== false} onChange={v => guardar({ segundoPlano: v })}
              label="Seguir en segundo plano al cerrar"
              desc="La X oculta la ventana en la bandeja. Para salir del todo: clic derecho en el icono → Salir." />
            <Interruptor activo={pref.mensajesSegundoPlano !== false} onChange={v => guardar({ mensajesSegundoPlano: v })}
              label="Mensajes en segundo plano (Messenger / Instagram)"
              desc="Siguen cargados para avisarte de mensajes nuevos aunque no estés en la pantalla Mensajes. Usa unos 300–500 MB de memoria por canal." />
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="Notificaciones" icono={Bell}>
        {pref && (
          <Interruptor activo={pref.notificaciones} onChange={v => guardar({ notificaciones: v })}
            label="Notificaciones de Windows"
            desc="Avisa cuando hay una versión nueva o está lista para instalar. El punto amarillo en el engranaje se muestra siempre." />
        )}
      </Tarjeta>

      <Tarjeta titulo="Datos locales y caché" icono={HardDrive}>
        <p className="text-xs text-gray-500 mb-3">
          IdyOS guarda en este PC una copia de las lecturas de Notion para abrir las pantallas al instante.
          Se renueva sola cuando alguien guarda cambios desde el sistema. Vacíala si ves datos desactualizados
          por cambios hechos directamente en Notion.
        </p>
        <div className="flex flex-wrap gap-2">
          <button disabled={limpiando}
            onClick={async () => { setLimpiando(true); try { await api?.limpiarCache(); } finally { setLimpiando(false); } }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-50">
            {limpiando ? <Loader2 size={13} className="animate-spin" /> : <HardDrive size={13} />} Vaciar caché y recargar
          </button>
          <button onClick={() => api?.abrirCarpeta('logs')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300">
            <FolderOpen size={13} /> Abrir registros
          </button>
          <button onClick={() => api?.abrirCarpeta('datos')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300">
            <FolderOpen size={13} /> Carpeta de datos
          </button>
        </div>
      </Tarjeta>

      {isAdmin && (
        <Tarjeta titulo="Conexión y usuarios" icono={PlugZap}>
          <p className="text-xs text-gray-500 mb-3">
            Tokens de Notion, Cloudinary y CODART, y usuarios que pueden entrar al sistema. Se guardan cifrados
            solo en este PC. Pide la contraseña de un administrador.
          </p>
          <button onClick={() => api?.verBienvenida?.()}
            className="flex items-center gap-1.5 px-3.5 py-2 mb-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300">
            <Sparkles size={13} /> Ver el primer arranque (como lo ve el equipo)
          </button>
          <button onClick={() => api?.abrirConexion()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-black">
            <PlugZap size={13} /> Abrir conexión y usuarios
          </button>
        </Tarjeta>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-gray-300">
        <Monitor size={11} /> {info?.plataforma} · datos en {info?.rutaDatos}
      </p>
    </div>
  );
}

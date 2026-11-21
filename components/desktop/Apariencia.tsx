'use client';
// Piezas de Configuración: grupos con filas e interruptores, apariencia,
// sonido, cuentas conectadas (Mensajes y Google Drive) y memoria de Mensajes.
import { Check, Monitor, Moon, Sun, Loader2, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import LogoDrive from '@/components/ui/LogoDrive';
import LogoRed, { COLOR_RED, type RedSocial } from '@/components/ui/LogoRed';
import { useEscritorio, type EstadoDrive } from '@/lib/desktop';
import { ACENTOS, useTema, type Tema } from '@/components/ui/Tema';
import { useMostrarMontos } from '@/lib/montos';
import { SONIDOS, sonar, sonidoElegido, guardarSonido, volumen, guardarVolumen, type Sonido } from '@/lib/sonidos';

// ─── Primitivas ───────────────────────────────────────────────────────────────
export function Grupo({ titulo, children, className = '' }: { titulo?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {titulo && <p className="text-[11.5px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5 ml-1">{titulo}</p>}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.04)] divide-y divide-gray-100">{children}</div>
    </div>
  );
}

export function Caja({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5 ${className}`}>{children}</div>;
}

export function Interruptor({ activo, onChange, etiqueta }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} onClick={() => onChange(!activo)}
      className={`relative w-10 h-6 rounded-full flex-shrink-0 transition-colors ${activo ? 'bg-[var(--acento)]' : 'bg-gray-200'}`}>
      <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${activo ? 'left-[19px]' : 'left-[3px]'}`} />
    </button>
  );
}

export function Fila({ titulo, desc, insignia, children }: { titulo: React.ReactNode; desc?: React.ReactNode; insignia?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium text-gray-900">
          {titulo}
          {insignia && <span className="ml-2 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 align-middle">{insignia}</span>}
        </p>
        {desc && <p className="text-[12.5px] text-gray-500 mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function FilaInterruptor({ titulo, desc, insignia, activo, onChange }: { titulo: string; desc?: string; insignia?: string; activo: boolean; onChange: (v: boolean) => void }) {
  return <Fila titulo={titulo} desc={desc} insignia={insignia}><Interruptor activo={activo} onChange={onChange} etiqueta={titulo} /></Fila>;
}

export const botonSec = 'h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-[12.5px] font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap';

// ─── Apariencia ───────────────────────────────────────────────────────────────
const MODOS: { t: Tema; l: string; icon: any }[] = [
  { t: 'claro', l: 'Claro', icon: Sun },
  { t: 'oscuro', l: 'Oscuro', icon: Moon },
  { t: 'sistema', l: 'Sistema', icon: Monitor },
];

export function SeccionApariencia() {
  const { tema, setTema, acento, setAcento, vidrio, setVidrio } = useTema();
  const nombreAcento = ACENTOS.find(a => a.id === acento)?.nombre || '';
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Caja>
          <p className="text-[13.5px] font-medium text-gray-900 mb-3">Modo</p>
          <div role="radiogroup" aria-label="Modo" className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
            {MODOS.map(({ t, l, icon: Icon }) => (
              <button key={t} role="radio" aria-checked={tema === t} onClick={() => setTema(t)}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12.5px] transition-colors ${tema === t ? 'bg-white shadow-sm font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
                <Icon size={14} /> {l}
              </button>
            ))}
          </div>
        </Caja>
        <Caja>
          <p className="text-[13.5px] font-medium text-gray-900 mb-3">Estilo</p>
          <div role="radiogroup" aria-label="Estilo" className="grid grid-cols-2 gap-2">
            {[{ v: false, l: 'Sólido' }, { v: true, l: 'Vidrio' }].map(o => (
              <button key={o.l} role="radio" aria-checked={vidrio === o.v} onClick={() => setVidrio(o.v)}
                className={`h-11 rounded-xl border text-[12.5px] font-semibold transition-colors ${vidrio === o.v ? 'border-[var(--acento)] ring-2 ring-[var(--acento-suave)] text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'}
                  ${o.v ? 'bg-gradient-to-br from-indigo-50 to-pink-50' : 'bg-white'}`}>
                {o.l}
              </button>
            ))}
          </div>
        </Caja>
      </div>
      <Caja>
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-[13.5px] font-medium text-gray-900">Color de acento</p>
          <span className="text-[12.5px] text-gray-500">{nombreAcento}</span>
        </div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(32px, 1fr))' }}>
          {ACENTOS.map(a => (
            <button key={a.id} onClick={() => setAcento(a.id)} title={a.nombre} aria-label={a.nombre}
              className="aspect-square rounded-full grid place-items-center transition-transform hover:scale-110"
              style={{ background: a.color, boxShadow: acento === a.id ? `0 0 0 2px var(--fondo-tarjeta, #fff), 0 0 0 4px ${a.color}` : undefined }}>
              {acento === a.id && <Check size={14} className="text-white drop-shadow" />}
            </button>
          ))}
        </div>
      </Caja>
      <Caja className="flex items-center gap-4">
        <div className="flex-1"><p className="text-[13.5px] font-medium text-gray-900">Perfil y foto</p><p className="text-[12.5px] text-gray-500">Tu nombre y foto en el menú.</p></div>
        <Link href="/perfil" className={botonSec}>Abrir perfil</Link>
      </Caja>
    </div>
  );
}

// ─── Notificaciones y sonido ──────────────────────────────────────────────────
export function CajaSonido() {
  const [s, setS] = useState<Sonido>('idealo');
  const [vol, setVol] = useState(0.6);
  useEffect(() => { setS(sonidoElegido()); setVol(volumen()); }, []);
  return (
    <Caja className="space-y-4">
      <div className="flex items-baseline justify-between"><p className="text-[13.5px] font-medium text-gray-900">Sonido</p><span className="text-[12.5px] text-gray-500">Toca uno para escucharlo</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SONIDOS.map(o => (
          <button key={o.id} onClick={() => { setS(o.id); guardarSonido(o.id); sonar(o.id, true); }}
            className={`h-11 px-3 rounded-xl border text-[12.5px] flex items-center gap-2 transition-colors ${s === o.id ? 'border-[var(--acento)] ring-2 ring-[var(--acento-suave)] text-gray-900 font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            <Play size={12} className="flex-shrink-0" /> <span className="truncate">{o.nombre}</span>
          </button>
        ))}
      </div>
      {s !== 'ninguno' && (
        <label className="flex items-center gap-3 text-[12.5px] text-gray-500">
          Volumen
          <input type="range" min={0} max={1} step={0.05} value={vol} className="flex-1 accent-[var(--acento)]"
            onChange={e => { const v = Number(e.target.value); setVol(v); guardarVolumen(v); }}
            onMouseUp={() => sonar(s, true)} />
        </label>
      )}
    </Caja>
  );
}

export function FilaMontos() {
  const [v, setV] = useMostrarMontos();
  return <FilaInterruptor titulo="Mostrar montos en el Dashboard" desc="Si está apagado se ven como «S/ ••••»." activo={v} onChange={setV} />;
}

// ─── Cuentas conectadas ───────────────────────────────────────────────────────
const REDES: { id: RedSocial; nombre: string; como: string; fondo: string }[] = [
  { id: 'whatsapp', nombre: 'WhatsApp', como: 'Código QR', fondo: 'bg-emerald-50' },
  { id: 'messenger', nombre: 'Messenger', como: 'Facebook', fondo: 'bg-blue-50' },
  { id: 'instagram', nombre: 'Instagram', como: 'Instagram', fondo: 'bg-rose-50' },
  { id: 'tiktok', nombre: 'TikTok', como: 'TikTok', fondo: 'bg-gray-100' },
];

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{children}</span>;
}

export function SeccionCuentas() {
  const { api } = useEscritorio();
  const [cuentas, setCuentas] = useState<Record<string, boolean>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [drive, setDrive] = useState<EstadoDrive | null>(null);
  const [conectandoDrive, setConectandoDrive] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api?.meta?.cuentas?.().then(setCuentas).catch(() => {});
    api?.drive?.estado().then(e => { if (e) setDrive(e); }).catch(() => {});
  }, [api]);

  async function conectarRed(id: string) {
    setAbierta(id); setError('');
    const r = await api?.meta?.conectarCuenta?.(id);
    setAbierta(null);
    if (r?.conectado) setCuentas(c => ({ ...c, [id]: true }));
    else setError('No se detectó la sesión. Inténtalo de nuevo.');
    api?.meta?.cuentas?.().then(setCuentas).catch(() => {});
  }
  async function conectarDrive() {
    setConectandoDrive(true); setError('');
    const r = await api!.drive!.conectar();
    setConectandoDrive(false);
    if (r.ok) setDrive(r); else setError(r.error);
  }

  return (
    <div className="space-y-6">
      {api?.meta && (
        <div>
          <p className="text-[11.5px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5 ml-1">Mensajes</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {REDES.map(r => {
              const ok = !!cuentas[r.id];
              return (
                <Caja key={r.id} className="!p-4 flex items-center gap-3.5">
                  <span className={`w-11 h-11 rounded-xl grid place-items-center flex-shrink-0 ${r.fondo}`}>
                    <LogoRed red={r.id} size={22} className={r.id === 'tiktok' ? 'dark:invert' : ''} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-gray-900">{r.nombre}</p>
                    <p className="text-[12px] text-gray-500 truncate">{abierta === r.id ? 'Inicia sesión en la ventana que se abrió' : ok ? 'Sesión iniciada' : r.como}</p>
                  </div>
                  {ok ? <Chip ok>Conectado</Chip> : (
                    <button onClick={() => conectarRed(r.id)} disabled={!!abierta}
                      className="h-9 px-3.5 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[12.5px] font-semibold disabled:opacity-60 flex items-center gap-1.5">
                      {abierta === r.id && <Loader2 size={13} className="animate-spin" />} Conectar
                    </button>
                  )}
                </Caja>
              );
            })}
          </div>
        </div>
      )}
      {api?.drive && drive && (
        <div>
          <p className="text-[11.5px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5 ml-1">Documentos</p>
          <Caja className="!p-4 flex items-center gap-3.5 flex-wrap">
            <span className="w-11 h-11 rounded-xl grid place-items-center flex-shrink-0 bg-blue-50"><LogoDrive size={22} /></span>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium text-gray-900">Google Drive</p>
              <p className="text-[12px] text-gray-500 truncate">
                {!drive.disponible ? 'Aún no está habilitado en el sistema'
                  : drive.conectado ? `Contratos y facturas · ${drive.email || 'cuenta de Google'}`
                  : conectandoDrive ? 'Termina de dar el permiso en el navegador' : 'Contratos y facturas'}
              </p>
            </div>
            {drive.disponible && (drive.conectado ? (
              <>
                <Chip ok>Conectado</Chip>
                <button onClick={async () => setDrive(await api.drive!.desconectar())} className={botonSec}>Desconectar</button>
              </>
            ) : (
              <button onClick={conectarDrive} disabled={conectandoDrive}
                className="h-9 px-3.5 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-[12.5px] font-semibold disabled:opacity-60 flex items-center gap-1.5">
                {conectandoDrive && <Loader2 size={13} className="animate-spin" />} {conectandoDrive ? 'Conectando…' : 'Conectar'}
              </button>
            ))}
          </Caja>
        </div>
      )}
      {error && <p className="text-[12.5px] text-rose-600 bg-rose-50 rounded-xl px-3.5 py-2.5">{error}</p>}
    </div>
  );
}

// ─── Mensajes: opciones y memoria ─────────────────────────────────────────────
const NOMBRES_RED: Record<string, string> = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', tiktok: 'TikTok' };

export function OpcionesMensajes({ segundoPlano, onSegundoPlano }: { segundoPlano?: boolean; onSegundoPlano?: (v: boolean) => void }) {
  const { api } = useEscritorio();
  const { acento } = useTema();
  const [limpia, setLimpia] = useState(false);
  const [temaMeta, setTemaMeta] = useState(false);
  const color = ACENTOS.find(a => a.id === acento)?.color || '#ffc500';
  const datosTema = () => ({ acento: color, acentoTexto: ACENTOS.find(a => a.id === acento)?.texto || '#111827', oscuro: document.documentElement.classList.contains('dark') });
  useEffect(() => {
    if (!api?.meta) return;
    api.meta.vistaLimpia().then(v => setLimpia(!!v)).catch(() => {});
    api.meta.tema(datosTema()).then(v => setTemaMeta(!!v)).catch(() => {});
  }, [api, acento]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!api?.meta) return null;
  return (
    <Grupo>
      <FilaInterruptor titulo="Vista limpia" desc="Oculta barras de Facebook e Instagram y estira los chats." activo={limpia}
        onChange={async () => setLimpia(!!(await api.meta!.vistaLimpia(!limpia)))} />
      <FilaInterruptor titulo="Colores de IdyOS en los chats" insignia="Beta" desc="Burbujas y barras con tu color de acento." activo={temaMeta}
        onChange={async () => setTemaMeta(!!(await api.meta!.tema({ ...datosTema(), activo: !temaMeta })))} />
      {onSegundoPlano && (
        <FilaInterruptor titulo="Mensajes en segundo plano" desc="WhatsApp y Messenger siguen avisando con IdyOS minimizado." activo={segundoPlano !== false} onChange={onSegundoPlano} />
      )}
    </Grupo>
  );
}

export function MemoriaMensajes() {
  const { api } = useEscritorio();
  const [mem, setMem] = useState<Record<string, number> | null>(null);
  const [liberando, setLiberando] = useState(false);
  const leer = () => api?.meta?.memoria?.().then(setMem).catch(() => {});
  useEffect(() => { leer(); const t = setInterval(leer, 5000); return () => clearInterval(t); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!api?.meta?.memoria) return null;
  const valores: Record<string, number> = Object.fromEntries(Object.entries(mem || {}).filter(([k]) => !k.includes(':')));
  const total = Object.values(valores).reduce((a, v) => a + v, 0);
  const tope = Math.max(1000, ...Object.values(valores));
  return (
    <Caja className="space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-[13.5px] font-medium text-gray-900">Memoria</p><p className="text-[12.5px] text-gray-500">Total {total} MB · Instagram y TikTok se cierran solos a los 3 min</p></div>
        <button onClick={async () => { setLiberando(true); await api.meta!.liberar?.(); setTimeout(() => { leer(); setLiberando(false); }, 4000); }}
          disabled={liberando} className={botonSec}>{liberando ? 'Liberando…' : 'Liberar memoria'}</button>
      </div>
      {(Object.keys(NOMBRES_RED) as RedSocial[]).map(k => {
        const v = valores[k];
        return (
          <div key={k} className="grid grid-cols-[110px_1fr_70px] gap-3 items-center text-[12.5px]">
            <span className="flex items-center gap-2 text-gray-700"><LogoRed red={k} size={14} className={k === 'tiktok' ? 'dark:invert' : ''} />{NOMBRES_RED[k]}</span>
            <span className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <span className="block h-2 rounded-full transition-all" style={{ width: v ? `${Math.min(100, (v / tope) * 100)}%` : '0%', background: COLOR_RED[k] === '#000000' ? '#6b7280' : COLOR_RED[k] }} />
            </span>
            <span className="text-right text-gray-500">{v ? `${v} MB` : 'Cerrado'}</span>
          </div>
        );
      })}
    </Caja>
  );
}

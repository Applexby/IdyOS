'use client';
// Barra lateral de IdyOS (estilo panel claro/oscuro, expandida o compacta).
//
//   Cabecera (logo + contraer) │ Búsqueda rápida │ Notificaciones
//   Menú (pantallas agrupadas; las subpantallas van en pestañas dentro)
//   Tarjeta de versión nueva │ Configuración · Modo oscuro/claro · Temas · Ayuda
//   Usuario (foto, nombre, rol) → menú: perfil, configuración, cerrar sesión

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import {
  Search, Bell, SlidersHorizontal, Moon, Sun, HelpCircle, LogOut, PanelLeft,
  Sparkles, RefreshCw, Download, ChevronsUpDown, User,
} from 'lucide-react';
import Avatar from '@/components/perfil/Avatar';
import { MENU, esActivo } from '@/components/shell/navegacion';
import { useEscritorio } from '@/lib/desktop';
import { useAvatar } from '@/lib/avatar';
import { useTema } from '@/components/ui/Tema';
import { useNotificaciones } from '@/components/notificaciones/Notificaciones';
import { abrirBusqueda } from '@/components/shell/BusquedaRapida';
import { abrirAyuda } from '@/components/shell/Ayuda';

const CLAVE_COMPACTA = 'idyos:sidebar-compacta';

// ── Estilos (claro / oscuro) ────────────────────────────────────────────────
const panel = 'bg-[#f5f7fb] dark:bg-[#141414] border border-[#e4e7ee] dark:border-[#232323]';
const linea = 'border-[#e4e7ee] dark:border-[#232323]';
const textoFila = 'text-[#1f2937] dark:text-[#dcdcdc]';
const icono = 'text-[#4b5563] dark:text-[#a3a3a3]';
const gris = 'text-[#6b7280] dark:text-[#949494]';
const activo = 'bg-white dark:bg-[#212121] border-[#e2e5ec] dark:border-[#323232] shadow-[0_1px_2px_rgba(16,24,40,0.06)]';

function Fila({ icon: Icon, label, compacta, activa, onClick, href, derecha, titulo }: {
  icon: any; label: string; compacta: boolean; activa?: boolean; onClick?: () => void; href?: string;
  derecha?: React.ReactNode; titulo?: string;
}) {
  const cls = `relative flex items-center gap-3 rounded-lg border transition-colors
    ${compacta ? 'w-10 h-[var(--sb-fila-c)] justify-center mx-auto' : 'w-full h-[var(--sb-fila)] px-3'}
    ${activa ? activo : 'border-transparent hover:bg-white/70 dark:hover:bg-[#1c1c1c]'}`;
  const dentro = (
    <>
      <Icon size={18} strokeWidth={1.6} className={activa ? 'text-[#111827] dark:text-white' : icono} />
      {!compacta && <span className={`flex-1 text-left text-[14.5px] truncate ${activa ? 'text-[#111827] dark:text-white font-medium' : textoFila}`}>{label}</span>}
      {derecha}
    </>
  );
  const t = compacta ? (titulo || label) : undefined;
  return href
    ? <Link href={href} title={t} className={cls}>{dentro}</Link>
    : <button onClick={onClick} title={t} className={cls}>{dentro}</button>;
}

function Bloque({ children, compacta, className = '' }: { children: React.ReactNode; compacta: boolean; className?: string }) {
  return <div className={`${compacta ? 'px-1.5' : 'px-2'} py-[var(--sb-pad)] space-y-0.5 flex-shrink-0 ${className}`}>{children}</div>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';
  const { info, actualizacion: act, api } = useEscritorio();
  const avatar = useAvatar();
  const { oscuro, setTema } = useTema();
  const notif = useNotificaciones();
  const [compacta, setCompacta] = useState(false);
  const [esOscuro, setEsOscuro] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const refUsuario = useRef<HTMLDivElement>(null);

  // Preferencia guardada; si no hay, compacta automáticamente en ventanas angostas
  useEffect(() => {
    let guardada: string | null = null;
    try { guardada = localStorage.getItem(CLAVE_COMPACTA); } catch { /* noop */ }
    if (guardada !== null) { setCompacta(guardada === '1'); return; }
    const ajustar = () => setCompacta(window.innerWidth < 1280);
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);
  useEffect(() => { setEsOscuro(document.documentElement.classList.contains('dark')); }, [oscuro]);
  useEffect(() => { document.documentElement.style.setProperty('--sidebar-ancho', compacta ? '64px' : '252px'); }, [compacta]);
  useEffect(() => {
    if (!menuUsuario) return;
    const fuera = (e: MouseEvent) => { if (!refUsuario.current?.contains(e.target as Node)) setMenuUsuario(false); };
    window.addEventListener('mousedown', fuera);
    return () => window.removeEventListener('mousedown', fuera);
  }, [menuUsuario]);

  const alternar = () => setCompacta(c => {
    try { localStorage.setItem(CLAVE_COMPACTA, c ? '0' : '1'); } catch { /* noop */ }
    return !c;
  });

  const hayAct = !!api && !!act?.nueva && ['disponible', 'descargando', 'descargada'].includes(act.fase);
  const n = notif.noLeidas;
  const contador = n ? (n > 15 ? '15+' : String(n)) : '';
  const accionAct = () => act?.fase === 'descargada' ? api!.instalarActualizacion() : act?.fase === 'disponible' ? api!.descargarActualizacion() : router.push('/programa');

  return (
    <aside className={`panel-vidrio h-full flex-shrink-0 flex flex-col rounded-xl overflow-hidden transition-[width] duration-200 ${panel} ${compacta ? 'w-[64px]' : 'w-[252px]'}`}>

      {/* Cabecera */}
      <div className={`h-[var(--sb-cab)] flex-shrink-0 flex items-center border-b ${linea} ${compacta ? 'justify-center' : 'px-4 gap-2.5'}`}>
        {compacta ? (
          <button onClick={alternar} title="Expandir barra" className="w-9 h-9 grid place-items-center rounded-lg hover:bg-white/70 dark:hover:bg-[#1c1c1c]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/idyos-icono.png" alt="IdyOS" className="w-7 h-7 rounded-[7px]" />
          </button>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/idyos-icono.png" alt="" className="w-7 h-7 rounded-[7px]" />
            <span className="flex-1 text-[17px] font-semibold tracking-tight text-[#111827] dark:text-white">IdyOS</span>
            <button onClick={alternar} title="Contraer barra" className={`w-8 h-8 grid place-items-center rounded-lg ${icono} hover:bg-white/70 dark:hover:bg-[#1c1c1c]`}>
              <PanelLeft size={18} strokeWidth={1.6} />
            </button>
          </>
        )}
      </div>

      {/* Búsqueda */}
      <Bloque compacta={compacta} className={`border-b ${linea}`}>
        <Fila icon={Search} label="Búsqueda rápida" compacta={compacta} onClick={abrirBusqueda} />
      </Bloque>

      {/* Notificaciones */}
      <Bloque compacta={compacta} className={`border-b ${linea}`}>
        <Fila icon={Bell} label="Notificaciones" compacta={compacta} activa={notif.abierto}
          onClick={() => notif.setAbierto(!notif.abierto)}
          derecha={contador ? (compacta
            ? <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--acento)]" />
            : <span className={`text-[13px] tabular-nums ${gris}`}>{contador}</span>) : null} />
      </Bloque>

      {/* Menú */}
      <nav className="flex-1 min-h-0 overflow-y-auto scroll-fino">
        {!compacta && <p className={`px-5 pt-[var(--sb-menu)] pb-1.5 text-[13.5px] ${gris}`}>Menú</p>}
        <Bloque compacta={compacta} className={compacta ? 'pt-3' : 'pt-0'}>
          {MENU.filter(i => !i.adminOnly || isAdmin).map(it => (
            <Fila key={it.href} icon={it.icon} label={it.label} href={it.href} compacta={compacta} activa={esActivo(pathname, it)} />
          ))}
        </Bloque>
      </nav>

      {/* Versión nueva */}
      {hayAct && (compacta ? (
        <div className="py-3 flex justify-center">
          <button onClick={accionAct} title={`IdyOS ${act!.nueva!.version}`}
            className="relative w-11 h-11 rounded-full grid place-items-center bg-white dark:bg-[#212121] border border-[#dfe3ec] dark:border-[#323232] shadow-sm">
            <Sparkles size={18} className="text-[var(--acento)]" />
            <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--acento)] animate-pulse" />
          </button>
        </div>
      ) : (
        <div className="p-2">
          <div className="rounded-xl border border-[#e2e5ec] dark:border-[#323232] p-3.5 bg-gradient-to-b from-[var(--acento-suave)] to-white dark:to-[#1a1a1a]">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full grid place-items-center bg-white dark:bg-[#141414] border border-[#e2e5ec] dark:border-[#323232] flex-shrink-0">
                <Sparkles size={18} className="text-[var(--acento)]" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className={`text-[12.5px] ${gris}`}>Versión nueva:</p>
                <p className="text-[14.5px] font-semibold text-[#111827] dark:text-white">IdyOS {act!.nueva!.version}</p>
              </div>
            </div>
            <p className={`text-[13px] leading-snug mt-2.5 ${gris}`}>
              {act!.fase === 'descargada' ? 'Lista para instalar con las últimas mejoras.' : act!.fase === 'descargando' ? `Descargando… ${act!.progreso}%` : 'Actualiza para tener las últimas mejoras.'}
            </p>
            {act!.fase === 'descargando' ? (
              <div className="h-1 rounded-full bg-black/5 dark:bg-white/10 mt-3 overflow-hidden">
                <div className="h-full bg-[var(--acento)] transition-all" style={{ width: `${act!.progreso}%` }} />
              </div>
            ) : (
              <button onClick={accionAct}
                className="mt-3 w-full h-9 rounded-lg bg-white dark:bg-[#141414] border border-[#dfe3ec] dark:border-[#323232] shadow-[0_1px_2px_rgba(16,24,40,0.05)] text-[14px] font-medium text-[#111827] dark:text-white flex items-center justify-center gap-2 hover:border-[var(--acento)]">
                {act!.fase === 'descargada'
                  ? <><RefreshCw size={15} className="text-[var(--acento)]" /> Reiniciar y actualizar</>
                  : <><Download size={15} className="text-[var(--acento)]" /> Descargar</>}
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Preferencias */}
      <Bloque compacta={compacta} className={`border-t ${linea}`}>
        <Fila icon={SlidersHorizontal} label="Configuración" href="/programa" compacta={compacta} activa={pathname === '/programa'} />
        <Fila icon={esOscuro ? Sun : Moon} label={esOscuro ? 'Modo claro' : 'Modo oscuro'} compacta={compacta}
          onClick={() => setTema(esOscuro ? 'claro' : 'oscuro')} />
        <Fila icon={HelpCircle} label="Ayuda" compacta={compacta} onClick={abrirAyuda} />
      </Bloque>

      {/* Usuario */}
      <div ref={refUsuario} className={`relative border-t ${linea} p-2`}>
        {menuUsuario && (
          <div className={`absolute bottom-full mb-1.5 z-30 rounded-xl border border-[#e2e5ec] dark:border-[#323232] bg-white dark:bg-[#1a1a1a] shadow-xl p-1 ${compacta ? 'left-2 w-52' : 'left-2 right-2'}`}>
            <Link href="/perfil" onClick={() => setMenuUsuario(false)} className={`flex items-center gap-2.5 px-3 h-9 rounded-lg text-[14px] ${textoFila} hover:bg-[#f5f7fb] dark:hover:bg-[#212121]`}><User size={16} className={icono} /> Mi perfil</Link>
            <div className={`my-1 border-t ${linea}`} />
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-[14px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"><LogOut size={16} /> Cerrar sesión</button>
          </div>
        )}
        <button onClick={() => setMenuUsuario(v => !v)} title={compacta ? (session?.user?.name || 'Usuario') : undefined}
          className={`w-full flex items-center gap-3 rounded-lg p-1.5 hover:bg-white/70 dark:hover:bg-[#1c1c1c] ${compacta ? 'justify-center' : ''}`}>
          <Avatar url={avatar} nombre={session?.user?.name} size={compacta ? 36 : 40} />
          {!compacta && (
            <>
              <span className="flex-1 min-w-0 text-left leading-tight">
                <span className="block text-[14.5px] font-medium text-[#111827] dark:text-white truncate">{session?.user?.name || 'Usuario'}</span>
                <span className={`block text-[12.5px] truncate ${gris}`}>{isAdmin ? 'Administrador' : 'Equipo'}{info ? ` · v${info.version}` : ''}</span>
              </span>
              <ChevronsUpDown size={16} className={icono} />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

'use client';
// Barra lateral de IdyOS.
//  • Expandida (iconos + texto) o compacta (solo iconos); se recuerda.
//  • Arriba: botones de ventana tipo Mac, logo, búsqueda rápida y notificaciones.
//  • Abajo: tarjeta de actualización (cuando hay versión nueva), configuración,
//    modo oscuro, temas y el usuario (foto → perfil).
//  • Claro y oscuro con colores propios (no depende del remapeo de globals.css).

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
  Search, Bell, Settings, Moon, Sun, Palette, LogOut, PanelLeftClose, PanelLeftOpen,
  Sparkles, RefreshCw, Download,
} from 'lucide-react';
import Logo from '@/components/ui/Logo';
import Semaforo from '@/components/shell/Semaforo';
import Avatar from '@/components/perfil/Avatar';
import { SECCIONES, esActivo } from '@/components/shell/navegacion';
import { useEscritorio } from '@/lib/desktop';
import { useAvatar } from '@/lib/avatar';
import { useTema } from '@/components/ui/Tema';
import { useNotificaciones } from '@/components/notificaciones/Notificaciones';
import { abrirBusqueda } from '@/components/shell/BusquedaRapida';

const CLAVE_COMPACTA = 'idyos:sidebar-compacta';

// Paleta de la barra (claro / oscuro)
const C = {
  panel: 'bg-[#f6f7fb] dark:bg-[#0e131d] border-[#e4e7ee] dark:border-[#1b2230]',
  texto: 'text-[#374151] dark:text-[#cbd2dd]',
  suave: 'text-[#8a93a3] dark:text-[#6f7a8c]',
  hover: 'hover:bg-white/70 dark:hover:bg-[#161d2a] hover:text-[#111827] dark:hover:text-white',
  activo: 'bg-white dark:bg-[#1a2232] text-[#111827] dark:text-white shadow-[0_1px_2px_rgba(16,24,40,0.06)] border border-[#e6e9f0] dark:border-[#263044]',
  separador: 'border-[#e4e7ee] dark:border-[#1b2230]',
};

function Fila({ icon: Icon, label, activo, compacta, onClick, href, extra, titulo }: {
  icon: any; label: string; activo?: boolean; compacta: boolean; onClick?: () => void; href?: string;
  extra?: React.ReactNode; titulo?: string;
}) {
  const cls = `relative w-full flex items-center gap-3 rounded-xl transition-colors text-[13px]
    ${compacta ? 'justify-center h-10' : 'px-3 h-9'}
    ${activo ? C.activo : `border border-transparent ${C.texto} ${C.hover}`}`;
  const contenido = (
    <>
      <Icon size={17} strokeWidth={1.8} className={activo ? 'text-[var(--acento)]' : ''} />
      {!compacta && <span className={`flex-1 text-left truncate ${activo ? 'font-semibold' : 'font-medium'}`}>{label}</span>}
      {extra}
    </>
  );
  if (href) return <Link href={href} title={compacta ? (titulo || label) : undefined} className={cls}>{contenido}</Link>;
  return <button onClick={onClick} title={compacta ? (titulo || label) : undefined} className={cls}>{contenido}</button>;
}

function Contador({ n, compacta }: { n: number; compacta: boolean }) {
  if (!n) return null;
  const txt = n > 15 ? '15+' : String(n);
  if (compacta) return <span className="absolute top-1.5 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[var(--acento)] text-[var(--acento-texto)] text-[9px] font-bold grid place-items-center">{txt}</span>;
  return <span className="text-[11px] font-semibold tabular-nums text-[#6b7280] dark:text-[#8b95a7]">{txt}</span>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';
  const { escritorio, info, actualizacion: act, api } = useEscritorio();
  const avatar = useAvatar();
  const { oscuro, setTema } = useTema();
  const notif = useNotificaciones();
  const [compacta, setCompacta] = useState(false);
  const [esOscuro, setEsOscuro] = useState(false);

  useEffect(() => {
    try { setCompacta(localStorage.getItem(CLAVE_COMPACTA) === '1'); } catch { /* noop */ }
  }, []);
  useEffect(() => { setEsOscuro(document.documentElement.classList.contains('dark')); }, [oscuro]);
  // El panel de notificaciones se coloca junto a la barra
  useEffect(() => { document.documentElement.style.setProperty('--sidebar-ancho', compacta ? '76px' : '264px'); }, [compacta]);

  const alternar = () => setCompacta(c => {
    try { localStorage.setItem(CLAVE_COMPACTA, c ? '0' : '1'); } catch { /* noop */ }
    return !c;
  });

  const hayAct = !!api && !!act?.nueva && ['disponible', 'descargando', 'descargada'].includes(act.fase);
  const rol = isAdmin ? 'Administrador' : 'Equipo';

  return (
    <aside className={`h-screen flex-shrink-0 p-2 pr-0 transition-[width] duration-200 ${compacta ? 'w-[76px]' : 'w-[264px]'}`}>
      <div className={`h-full flex flex-col rounded-2xl border ${C.panel} overflow-hidden`}>

        {/* Cabecera: semáforo + logo (zona para arrastrar la ventana) */}
        <div className={`region-arrastre px-3 pt-3 pb-2 border-b ${C.separador}`}>
          <div className={`flex items-center ${compacta ? 'justify-center' : 'justify-between'} h-4 mb-3`}>
            <Semaforo />
            {!compacta && (
              <button onClick={alternar} title="Contraer barra" className={`${C.suave} hover:text-[#111827] dark:hover:text-white`}>
                <PanelLeftClose size={16} />
              </button>
            )}
          </div>
          {compacta ? (
            <button onClick={alternar} title="Expandir barra" className="w-full h-10 grid place-items-center rounded-xl hover:bg-white/70 dark:hover:bg-[#161d2a]">
              <PanelLeftOpen size={17} className={C.suave} />
            </button>
          ) : (
            <div className="relative h-9 w-32 ml-1">
              <Logo posicion="left center" priority unoptimized />
            </div>
          )}
        </div>

        {/* Búsqueda y notificaciones */}
        <div className={`p-2 space-y-0.5 border-b ${C.separador}`}>
          <Fila icon={Search} label="Búsqueda rápida" compacta={compacta} onClick={abrirBusqueda}
            extra={!compacta && <kbd className="text-[10px] font-medium text-[#9aa3b2] border border-[#e1e5ec] dark:border-[#273044] rounded px-1.5 py-0.5">Ctrl K</kbd>} />
          <Fila icon={Bell} label="Notificaciones" compacta={compacta} activo={notif.abierto}
            onClick={() => notif.setAbierto(!notif.abierto)} extra={<Contador n={notif.noLeidas} compacta={compacta} />} />
        </div>

        {/* Menú */}
        <nav className="flex-1 overflow-y-auto scroll-fino p-2 space-y-4">
          {SECCIONES.map(sec => {
            if (sec.adminOnly && !isAdmin) return null;
            return (
              <div key={sec.label}>
                {!compacta && <p className={`px-3 mb-1 text-[11px] font-semibold ${C.suave}`}>{sec.label}</p>}
                {compacta && <div className={`mx-3 mb-1.5 border-t ${C.separador}`} />}
                <div className="space-y-0.5">
                  {sec.items.map(it => (it.adminOnly && !isAdmin) ? null : (
                    <Fila key={it.href} icon={it.icon} label={it.label} href={it.href} compacta={compacta}
                      activo={esActivo(pathname, it.href)} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Tarjeta de actualización */}
        {hayAct && (compacta ? (
          <div className="px-2 pb-2">
            <button onClick={() => act!.fase === 'descargada' ? api!.instalarActualizacion() : router.push('/programa')}
              title={act!.fase === 'descargada' ? `Instalar IdyOS ${act!.nueva!.version}` : `Descargando IdyOS ${act!.nueva!.version}`}
              className="relative mx-auto w-11 h-11 rounded-full grid place-items-center bg-white dark:bg-[#1a2232] border border-[var(--acento)] shadow-sm">
              <Sparkles size={17} className="text-[var(--acento)]" />
              <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--acento)] animate-pulse" />
            </button>
          </div>
        ) : (
          <div className="px-2 pb-2">
            <div className="rounded-2xl p-3 border border-[#e6e9f0] dark:border-[#263044] bg-gradient-to-b from-[var(--acento-suave)] to-white dark:to-[#141b28]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full grid place-items-center bg-white dark:bg-[#0e131d] border border-[#e6e9f0] dark:border-[#263044] flex-shrink-0">
                  <Sparkles size={16} className="text-[var(--acento)]" />
                </div>
                <div className="min-w-0">
                  <p className={`text-[11px] ${C.suave}`}>Nueva versión</p>
                  <p className="text-[13px] font-semibold text-[#111827] dark:text-white">IdyOS {act!.nueva!.version}</p>
                </div>
              </div>
              <p className="text-[11.5px] leading-snug text-[#4b5563] dark:text-[#a3acbb] mt-2">
                {act!.fase === 'descargada' ? 'Lista para instalar. Se reinicia en segundos.' : act!.fase === 'descargando' ? `Descargando… ${act!.progreso}%` : 'Hay mejoras disponibles para el programa.'}
              </p>
              {act!.fase === 'descargando' && (
                <div className="h-1 rounded-full bg-black/5 dark:bg-white/10 mt-2 overflow-hidden">
                  <div className="h-full bg-[var(--acento)] transition-all" style={{ width: `${act!.progreso}%` }} />
                </div>
              )}
              {act!.fase !== 'descargando' && (
                <button onClick={() => act!.fase === 'descargada' ? api!.instalarActualizacion() : api!.descargarActualizacion()}
                  className="mt-2.5 w-full h-9 rounded-xl bg-white dark:bg-[#0e131d] border border-[#e1e5ec] dark:border-[#2a3447] text-[12.5px] font-semibold text-[#111827] dark:text-white flex items-center justify-center gap-1.5 hover:border-[var(--acento)]">
                  {act!.fase === 'descargada' ? <><RefreshCw size={14} className="text-[var(--acento)]" /> Reiniciar y actualizar</> : <><Download size={14} className="text-[var(--acento)]" /> Descargar</>}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Preferencias */}
        <div className={`p-2 space-y-0.5 border-t ${C.separador}`}>
          <Fila icon={Settings} label="Configuración" href="/programa" compacta={compacta}
            activo={pathname.startsWith('/programa')}
            extra={escritorio && hayAct && compacta ? <span className="absolute top-2 right-3 w-2 h-2 rounded-full bg-[var(--acento)]" /> : undefined} />
          <Fila icon={esOscuro ? Sun : Moon} label="Modo oscuro" compacta={compacta}
            titulo={esOscuro ? 'Modo claro' : 'Modo oscuro'}
            onClick={() => setTema(esOscuro ? 'claro' : 'oscuro')}
            extra={!compacta && (
              <span className={`relative w-8 h-[18px] rounded-full transition-colors ${esOscuro ? 'bg-[var(--acento)]' : 'bg-[#d6dbe4]'}`}>
                <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${esOscuro ? 'left-[16px]' : 'left-[2px]'}`} />
              </span>
            )} />
          <Fila icon={Palette} label="Temas" href="/programa#apariencia" compacta={compacta} />
        </div>

        {/* Usuario */}
        <div className={`p-2 border-t ${C.separador}`}>
          <div className={`flex items-center gap-2 rounded-xl ${compacta ? 'flex-col' : ''}`}>
            <Link href="/perfil" title="Mi perfil"
              className={`flex items-center gap-2.5 flex-1 min-w-0 rounded-xl p-1.5 ${C.hover} ${pathname.startsWith('/perfil') ? C.activo : 'border border-transparent'}`}>
              <Avatar url={avatar} nombre={session?.user?.name} size={34} />
              {!compacta && (
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#111827] dark:text-white truncate">{session?.user?.name || 'Usuario'}</p>
                  <p className={`text-[11px] truncate ${C.suave}`}>{rol}{escritorio && info ? ` · v${info.version}` : ''}</p>
                </div>
              )}
            </Link>
            <button onClick={() => signOut({ callbackUrl: '/login' })} title="Cerrar sesión"
              className={`w-9 h-9 grid place-items-center rounded-xl ${C.suave} hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10`}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

'use client';
// Marco de la aplicación:
//   franja superior (botones de ventana tipo Mac + búsqueda/avisos, arrastrable)
//   barra lateral │ contenido (con ruta y pestañas de la sección)
import Sidebar from '@/components/Sidebar';
import Semaforo from './Semaforo';
import SubMenu from './SubMenu';
import Ayuda from './Ayuda';
import BusquedaRapida, { abrirBusqueda } from './BusquedaRapida';
import { ProveedorNotificaciones, useNotificaciones } from '@/components/notificaciones/Notificaciones';
import PanelNotificaciones from '@/components/notificaciones/PanelNotificaciones';
import SubidasDrive from './SubidasDrive';
import { Bell, Search } from 'lucide-react';

function FranjaSuperior() {
  const { noLeidas, setAbierto, abierto } = useNotificaciones();
  const btn = 'w-8 h-7 grid place-items-center rounded-md text-[#8a93a3] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#111827] dark:hover:text-white';
  return (
    <div className="region-arrastre h-9 flex-shrink-0 flex items-center gap-1 px-4">
      <Semaforo />
      <div className="flex-1" />
      <button onClick={abrirBusqueda} title="Búsqueda rápida (Ctrl K)" className={btn}><Search size={15} /></button>
      <button onClick={() => setAbierto(!abierto)} title="Notificaciones" className={`relative ${btn}`}>
        <Bell size={15} />
        {noLeidas > 0 && <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-[var(--acento)]" />}
      </button>
    </div>
  );
}

function Interior({ children }: { children: React.ReactNode }) {
  const { setAbierto } = useNotificaciones();
  return (
    <div className="marco-fondo h-screen flex flex-col overflow-hidden bg-[#eceff4] dark:bg-[#0b0b0b]">
      <FranjaSuperior />
      <div className="flex-1 min-h-0 flex gap-2 px-2 pb-2">
        <Sidebar />
        {/* El desenfoque del estilo Vidrio va en una capa HERMANA detrás del contenido:
            si estuviera en <main>, las ventanas flotantes (position: fixed) quedarían
            ancladas al panel y no a la pantalla (aparecían arriba al hacer scroll). */}
        <div className="relative flex-1 min-w-0">
          <div aria-hidden className="capa-vidrio absolute inset-0 rounded-xl pointer-events-none" />
          <main className="contenido-vidrio relative h-full overflow-y-auto scroll-fino rounded-xl border border-[#e4e7ee] dark:border-[#232323] bg-[#f9fafb] dark:bg-[#0f0f0f]">
            <SubMenu />
            {children}
          </main>
        </div>
      </div>
      <PanelNotificaciones />
      <BusquedaRapida onNotificaciones={() => setAbierto(true)} />
      <Ayuda />
      <SubidasDrive />
    </div>
  );
}

export default function Marco({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorNotificaciones>
      <Interior>{children}</Interior>
    </ProveedorNotificaciones>
  );
}

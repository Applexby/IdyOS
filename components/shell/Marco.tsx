'use client';
// Marco de la aplicación: barra lateral + barra superior (arrastrable) + contenido,
// con el centro de notificaciones y la búsqueda rápida.
import Sidebar from '@/components/Sidebar';
import BusquedaRapida, { abrirBusqueda } from './BusquedaRapida';
import { ProveedorNotificaciones, useNotificaciones } from '@/components/notificaciones/Notificaciones';
import PanelNotificaciones from '@/components/notificaciones/PanelNotificaciones';
import { Bell, Search } from 'lucide-react';

function BarraSuperior() {
  const { noLeidas, setAbierto, abierto } = useNotificaciones();
  return (
    <div className="region-arrastre h-10 flex-shrink-0 flex items-center justify-end gap-1 px-3">
      <button onClick={abrirBusqueda} title="Búsqueda rápida (Ctrl K)"
        className="w-8 h-8 grid place-items-center rounded-lg text-[#8a93a3] hover:bg-white/70 dark:hover:bg-[#161d2a] hover:text-[#111827] dark:hover:text-white">
        <Search size={15} />
      </button>
      <button onClick={() => setAbierto(!abierto)} title="Notificaciones"
        className="relative w-8 h-8 grid place-items-center rounded-lg text-[#8a93a3] hover:bg-white/70 dark:hover:bg-[#161d2a] hover:text-[#111827] dark:hover:text-white">
        <Bell size={15} />
        {noLeidas > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--acento)]" />}
      </button>
    </div>
  );
}

function Interior({ children }: { children: React.ReactNode }) {
  const { setAbierto } = useNotificaciones();
  return (
    <div className="flex h-screen overflow-hidden bg-[#eceff4] dark:bg-[#070a10]">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <BarraSuperior />
        <main className="flex-1 min-h-0 overflow-y-auto scroll-fino mx-2 mb-2 rounded-2xl border border-[#e4e7ee] dark:border-[#1b2230] bg-[#f9fafb] dark:bg-[#0b0f17]">
          {children}
        </main>
      </div>
      <PanelNotificaciones />
      <BusquedaRapida onNotificaciones={() => setAbierto(true)} />
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

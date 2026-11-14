// Server Component — valida la sesión antes de enviar HTML al cliente.
// Esto elimina el "flash" del dashboard sin datos que ocurría durante los ms
// que el cliente tardaba en hidratar la sesión con useSession().
//
// Si no hay sesión, redirige a /login server-side (HTTP 307) → el cliente
// nunca ve el shell del dashboard, ni siquiera por unos ms.

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import Sidebar from './Sidebar';
import AvisoActualizacion from './desktop/AvisoActualizacion';

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      {/* pt-14 en mobile para el header fijo, 0 en desktop */}
      <main className="flex-1 min-h-screen overflow-y-auto pt-14 lg:pt-0">
        <AvisoActualizacion />
        {children}
      </main>
    </div>
  );
}

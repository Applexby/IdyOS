// Server Component — valida la sesión antes de enviar HTML al cliente.
// Esto elimina el "flash" del dashboard sin datos que ocurría durante los ms
// que el cliente tardaba en hidratar la sesión con useSession().
//
// Si no hay sesión, redirige a /login server-side (HTTP 307) → el cliente
// nunca ve el shell del dashboard, ni siquiera por unos ms.

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import Marco from './shell/Marco';

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return <Marco>{children}</Marco>;
}

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import AjustesContent from '@/components/ajustes/AjustesContent';

export default async function AjustesPage() {
  // El menú oculta Ajustes a quien no es admin, pero la URL debe protegerse
  // también en el servidor.
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'admin') redirect('/');

  return (
    <AppShell>
      <AjustesContent />
    </AppShell>
  );
}

import AppShell from '@/components/AppShell';
import NotasContent from '@/components/notas/NotasContent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function NotasPage() {
  const session = await getServerSession(authOptions);
  return (
    <AppShell>
      <NotasContent userName={session?.user?.name || 'Usuario'} />
    </AppShell>
  );
}

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import DashboardContent from '@/components/DashboardContent';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  return (
    <AppShell>
      <DashboardContent userName={session?.user?.name || 'Usuario'} />
    </AppShell>
  );
}

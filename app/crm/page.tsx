import AppShell from '@/components/AppShell';
import CRMContent from '@/components/crm/CRMContent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function CRMPage() {
  const session = await getServerSession(authOptions);
  return (
    <AppShell>
      <CRMContent userName={session?.user?.name || 'Usuario'} />
    </AppShell>
  );
}

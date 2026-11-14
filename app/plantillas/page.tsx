import AppShell from '@/components/AppShell';
import PlantillasContent from '@/components/plantillas/PlantillasContent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function PlantillasPage() {
  const session = await getServerSession(authOptions);
  return (
    <AppShell>
      <PlantillasContent userName={session?.user?.name || 'Usuario'} />
    </AppShell>
  );
}

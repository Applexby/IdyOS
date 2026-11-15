import { Suspense } from 'react';
import AppShell from '@/components/AppShell';
import MensajesContent from '@/components/mensajes/MensajesContent';

export default function MensajesPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <MensajesContent />
      </Suspense>
    </AppShell>
  );
}

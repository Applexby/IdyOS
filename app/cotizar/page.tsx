import { Suspense } from 'react';
import AppShell from '@/components/AppShell';
import CotizacionForm from '@/components/CotizacionForm';

export default function CotizarPage() {
  return (
    <AppShell>
      <div className="px-4 pt-3 pb-4">
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" /></div>}>
          <CotizacionForm />
        </Suspense>
      </div>
    </AppShell>
  );
}

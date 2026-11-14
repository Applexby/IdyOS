import { Suspense } from 'react';
import AppShell from '@/components/AppShell';
import CotizacionForm from '@/components/CotizacionForm';

export default function CotizarPage() {
  return (
    <AppShell>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Realizar Cotización</h1>
          <p className="text-sm text-gray-500 mt-1">Genera y envía cotizaciones profesionales</p>
        </div>
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" /></div>}>
          <CotizacionForm />
        </Suspense>
      </div>
    </AppShell>
  );
}

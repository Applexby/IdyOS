import AppShell from '@/components/AppShell';
import ServiciosPanel from '@/components/ServiciosPanel';

export default function ServiciosPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6">
        <div className="mb-6">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Servicios</h1>
          <p className="text-sm text-gray-500 mt-1">Catálogo de servicios y precios</p>
        </div>
        <ServiciosPanel />
      </div>
    </AppShell>
  );
}

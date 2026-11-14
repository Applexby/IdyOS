import AppShell from '@/components/AppShell';
import EquiposPanel from '@/components/EquiposPanel';

export default function EquiposPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6">
        <div className="mb-6">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Equipos</h1>
          <p className="text-sm text-gray-500 mt-1">Inventario de equipos disponibles</p>
        </div>
        <EquiposPanel />
      </div>
    </AppShell>
  );
}

import AppShell from '@/components/AppShell';
import ClientesPanel from '@/components/ClientesPanel';

export default function ClientesPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6">
        <div className="mb-6">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">Directorio de empresas y contactos</p>
        </div>
        <ClientesPanel />
      </div>
    </AppShell>
  );
}

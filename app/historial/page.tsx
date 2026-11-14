import AppShell from '@/components/AppShell';
import HistorialTable from '@/components/HistorialTable';

// El título y el fondo los pone HistorialTable (antes salían duplicados)
export default function HistorialPage() {
  return (
    <AppShell>
      <HistorialTable />
    </AppShell>
  );
}

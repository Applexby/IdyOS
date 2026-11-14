'use client';
import Selector from '@/components/ui/Selector';

// Selector de campaña para vincular un lead. Muestra TODAS las campañas:
// primero las activas / en preparación y luego las anteriores, para poder
// atribuir un lead a una campaña ya cerrada (p. ej. un lead tardío de 260501).

export interface CampanaOpcion { id: string; nombre: string; estado?: string; canal?: string; fecha_inicio?: string | null }

const VIGENTES = ['Activa', 'Preparando'];

export default function SelectorCampana({ campanas, value, onChange, className = '' }: {
  campanas: CampanaOpcion[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const ordenar = (a: CampanaOpcion, b: CampanaOpcion) => (b.fecha_inicio || '').localeCompare(a.fecha_inicio || '');
  const vigentes = campanas.filter(c => VIGENTES.includes(c.estado || '')).sort(ordenar);
  const anteriores = campanas.filter(c => !VIGENTES.includes(c.estado || '')).sort(ordenar);
  const etiqueta = (c: CampanaOpcion) =>
    [c.nombre, c.canal, c.fecha_inicio ? c.fecha_inicio.slice(0, 7).split('-').reverse().join('/') : ''].filter(Boolean).join(' · ');

  return (
    <Selector value={value} onChange={e => onChange(e.target.value)} className={className} aria-label="Campaña">
      <option value="">Seleccionar campaña...</option>
      {vigentes.length > 0 && (
        <optgroup label="Activas / en preparación">
          {vigentes.map(c => <option key={c.id} value={c.id}>{etiqueta(c)}</option>)}
        </optgroup>
      )}
      {anteriores.length > 0 && (
        <optgroup label="Anteriores">
          {anteriores.map(c => <option key={c.id} value={c.id}>{etiqueta(c)}{c.estado ? ` (${c.estado})` : ''}</option>)}
        </optgroup>
      )}
    </Selector>
  );
}

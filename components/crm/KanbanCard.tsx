'use client';

import { Clock, Megaphone } from 'lucide-react';
import { useAvatarDe } from '@/lib/avatarEquipo';
import type { Lead, EstadoLead, AccionSeguimiento } from '@/types/crm';
import { etapaDe } from '@/types/crm';
import { diasDesde, diasHasta } from '@/lib/utils';

interface Props {
  lead: Lead;
  onUpdate: (leadId: string, accion: AccionSeguimiento, extra?: { nuevo_estado?: EstadoLead; motivo_perdida?: string; nota?: string }) => Promise<void>;
  onClick: (lead: Lead) => void;
}

// Urgencia: si el lead tiene "Próximo seguimiento", manda esa fecha
// (vencido = urgente, hoy = pronto). Si no, se usan los días sin contacto.
function urgencia(lead: Lead): 'alta' | 'media' | 'normal' {
  const etapa = etapaDe(lead.estado_lead);
  if (etapa === 'GANADO' || etapa === 'PERDIDO') return 'normal';
  const faltan = diasHasta(lead.proximo_seguimiento);
  if (faltan !== null) {
    if (faltan < 0) return 'alta';
    if (faltan === 0) return 'media';
    return 'normal';
  }
  const dias = diasDesde(lead.fecha_ultimo_contacto || lead.fecha_contactado);
  if (dias === null) return 'normal';
  if (dias >= 5) return 'alta';
  if (dias >= 2) return 'media';
  return 'normal';
}

const PRIORIDAD = {
  alta:   { label: 'Urgente', dot: 'bg-rose-500',    text: 'text-rose-600',    bg: 'bg-rose-50' },
  media:  { label: 'Pronto',  dot: 'bg-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50' },
  normal: { label: 'Al día',  dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' },
} as const;

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-fuchsia-500',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}
function iniciales(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export default function KanbanCard({ lead, onClick }: Props) {
  const nivel = urgencia(lead);
  const prio = PRIORIDAD[nivel];
  const dias = diasDesde(lead.fecha_ultimo_contacto || lead.fecha_contactado);
  // "Atendido por" (select del equipo) tiene prioridad sobre la persona de Notion
  const encargado = lead.atendido_por || lead.persona_contactado[0]?.name || '';
  const fotoEncargado = useAvatarDe(encargado);
  const faltan = diasHasta(lead.proximo_seguimiento);

  return (
    <div onClick={() => onClick(lead)}
      role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(lead); } }}
      aria-label={`Abrir lead ${lead.proyecto || ''}`}
      className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc500] bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)] hover:border-gray-200 transition-all duration-200 cursor-pointer p-3.5">

      <div className="flex items-center justify-between mb-2.5">
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md ${prio.bg} ${prio.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
          {prio.label}
        </span>
        <span className="text-[10px] font-medium text-gray-400">{etapaDe(lead.estado_lead)}</span>
      </div>

      <p className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2 mb-0.5">{lead.proyecto || '(Sin nombre)'}</p>
      {(lead.empresa || lead.cliente) && (
        <p className="text-xs text-gray-400 truncate mb-2.5">{lead.empresa || lead.cliente}</p>
      )}

      {lead.canal && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md mb-2.5">
          <Megaphone size={9} /> {lead.canal}
        </span>
      )}

      <div className="flex items-center justify-between pt-2.5 mt-0.5 border-t border-gray-50">
        <div className="flex items-center gap-1.5 min-w-0">
          {encargado ? (
            <>
              {fotoEncargado
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={fotoEncargado} alt={encargado} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                : <span className={`w-5 h-5 rounded-full ${avatarColor(encargado)} text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0`}>
                    {iniciales(encargado)}
                  </span>}
              <span className="text-[11px] text-gray-500 truncate">{encargado.split(' ')[0]}</span>
            </>
          ) : (
            <span className="text-[11px] text-gray-300">Sin asignar</span>
          )}
        </div>
        {(faltan !== null || dias !== null) && (
          <span
            title={faltan !== null ? 'Próximo seguimiento' : 'Días desde el último contacto'}
            className={`flex items-center gap-1 text-[11px] font-medium flex-shrink-0
            ${nivel === 'alta' ? 'text-rose-500' : nivel === 'media' ? 'text-amber-500' : 'text-gray-400'}`}>
            <Clock size={10} />
            {faltan !== null
              ? (faltan < 0 ? `Vencido ${-faltan}d` : faltan === 0 ? 'Seguir hoy' : `En ${faltan}d`)
              : (dias === 0 ? 'Hoy' : `${dias}d`)}
          </span>
        )}
      </div>
    </div>
  );
}

'use client';

import { ReactNode, useState } from 'react';
import { Check, ChevronDown, Search, RefreshCw, Plus } from 'lucide-react';

// Paleta de avatares determinística (igual que el CRM)
const AVATAR_COLORS = ['bg-violet-500','bg-sky-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-indigo-500','bg-teal-500','bg-fuchsia-500'];
export function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}
export function iniciales(name: string) {
  const p = (name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span className={`rounded-full ${avatarColor(name)} text-white font-bold flex items-center justify-center flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {iniciales(name)}
    </span>
  );
}

// Chip de estado con punto de color
export function Chip({ label, tone = 'gray' }: { label: string; tone?: 'gray'|'green'|'amber'|'rose'|'sky'|'violet'|'fuchsia'|'indigo'|'emerald' }) {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600', green: 'bg-emerald-50 text-emerald-600', emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600', fuchsia: 'bg-fuchsia-50 text-fuchsia-600', indigo: 'bg-indigo-50 text-indigo-600',
  };
  const dot: Record<string, string> = {
    gray: 'bg-gray-400', green: 'bg-emerald-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500',
    sky: 'bg-sky-500', violet: 'bg-violet-500', fuchsia: 'bg-fuchsia-500', indigo: 'bg-indigo-500',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${tones[tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[tone]}`} /> {label}
    </span>
  );
}

// Header de pantalla estilo CRM
export function ScreenHeader({ title, subtitle, onNew, newLabel = 'Nuevo', onRefresh, refreshing, search, onSearch, searchPlaceholder = 'Buscar...', acciones, children }: {
  title: string; subtitle?: string;
  onNew?: () => void; newLabel?: string;
  onRefresh?: () => void; refreshing?: boolean;
  search?: string; onSearch?: (v: string) => void; searchPlaceholder?: string;
  /** Botones extra junto a "Nuevo" (p. ej. Exportar) */
  acciones?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-6 pt-6 pb-4 bg-white border-b border-gray-100">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {acciones}
          {onNew && (
            <button onClick={onNew}
              className="flex items-center gap-2 bg-[#ffc500] hover:bg-[#e6b000] text-gray-900 text-[13px] font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md">
              <Plus size={16} /> <span className="hidden sm:inline">{newLabel}</span>
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {onSearch && (
          <div className="relative flex-1 min-w-44">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder={searchPlaceholder} value={search || ''}
              onChange={e => onSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-yellow-100 bg-white transition-all" />
          </div>
        )}
        {children}
        {onRefresh && (
          <button onClick={onRefresh} disabled={refreshing}
            className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
}

// Tabla estilo referencia: checkbox, cabeceras con flechita, selección violeta, barra flotante
export function DataTable<T extends { id: string }>({ rows, columns, onRowClick, emptyText = 'Sin registros', selectable = true, actions }: {
  rows: T[]; columns: Column<T>[];
  onRowClick?: (row: T) => void;
  emptyText?: string;
  selectable?: boolean;
  actions?: (selected: T[], clear: () => void) => ReactNode;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.id)));
  const clear = () => setSel(new Set());
  const selectedRows = rows.filter(r => sel.has(r.id));

  return (
    <div className="px-6 py-5">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {selectable && (
                  <th className="w-10 px-4 py-3">
                    <button onClick={toggleAll} className="flex items-center justify-center">
                      <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors ${sel.size === rows.length && rows.length > 0 ? 'bg-violet-500 border-violet-500' : 'border-gray-300 bg-white'}`}>
                        {sel.size === rows.length && rows.length > 0 && <Check size={11} className="text-white" />}
                      </span>
                    </button>
                  </th>
                )}
                {columns.map(c => (
                  <th key={c.key} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">{c.header}{c.sortable !== false && <ChevronDown size={11} className="text-gray-300" />}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const checked = sel.has(row.id);
                return (
                  <tr key={row.id} onClick={() => onRowClick?.(row)}
                    className={`border-b border-gray-50 transition-colors group ${onRowClick ? 'cursor-pointer' : ''} ${checked ? 'bg-violet-50/60' : 'hover:bg-gray-50/70'}`}>
                    {selectable && (
                      <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggle(row.id); }}>
                        <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors ${checked ? 'bg-violet-500 border-violet-500' : 'border-gray-300 bg-white group-hover:border-gray-400'}`}>
                          {checked && <Check size={11} className="text-white" />}
                        </span>
                      </td>
                    )}
                    {columns.map(c => (
                      <td key={c.key} className="px-4 py-3 align-middle">{c.render(row)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="py-16 text-center text-gray-400 text-sm">{emptyText}</div>}
      </div>

      {selectable && sel.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-gray-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl">
          <span className="text-[13px] font-medium">{sel.size} seleccionado{sel.size > 1 ? 's' : ''}</span>
          {actions?.(selectedRows, clear)}
          <button onClick={clear} className="text-[13px] text-gray-300 hover:text-white">Limpiar</button>
        </div>
      )}
    </div>
  );
}

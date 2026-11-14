'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Plus, Edit2, X, Loader2, RefreshCw, Briefcase, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ScreenHeader, DataTable } from './ui/CrmKit';
import { Toast, useToast } from './Toast';

interface Servicio {
  id: string | number; nombre: string; descripcion: string;
  precio_base: number; precio_con_igv: number; categoria: string;
}

const inp = "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#ffc500]/30 focus:border-[#ffc500] transition-all";
const labelCls = "block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5";

function ModalServicio({ servicio, onSave, onClose }: { servicio?: Servicio | null; onSave: (d: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({ nombre: servicio?.nombre || '', descripcion: servicio?.descripcion || '', precio_con_igv: String(servicio?.precio_con_igv || servicio?.precio_base || '') });
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));
  const sinIgv = form.precio_con_igv ? (Number(form.precio_con_igv) / 1.18).toFixed(2) : '0.00';

  return (
    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-5"><p className="font-bold text-gray-800">{servicio ? 'Editar servicio' : 'Nuevo servicio'}</p><button onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={18} /></button></div>
        <div className="space-y-3">
          <div><label className={labelCls}>Nombre</label><input type="text" value={form.nombre} onChange={set('nombre')} placeholder="Nombre del servicio" className={inp} /></div>
          <div><label className={labelCls}>Descripción</label><textarea value={form.descripcion} onChange={set('descripcion')} rows={2} placeholder="Descripción del servicio" className={`${inp} resize-none`} /></div>
          <div><label className={labelCls}>Precio con IGV (S/)</label><input type="number" value={form.precio_con_igv} onChange={set('precio_con_igv')} placeholder="0.00" className={inp} /></div>
          {form.precio_con_igv && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-2.5 flex justify-between text-xs">
              <span className="text-gray-500">Sin IGV (calculado)</span>
              <span className="font-bold text-[#ffc500]">S/ {sinIgv}</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => onSave({ ...form, id: servicio?.id })} className="flex-1 py-2.5 rounded-xl bg-[#ffc500] text-white text-xs font-bold hover:bg-[#e6b000] shadow-sm">Guardar en Notion</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ServiciosPanel() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Servicio | null | 'nuevo'>(null);
  const { toast, showToast, hideToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/notion/servicios');
      const d = await r.json();
      setServicios(d.servicios || []);
    } catch { showToast('Error cargando servicios', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? servicios.filter(s => s.nombre.toLowerCase().includes(search.toLowerCase()) || s.descripcion.toLowerCase().includes(search.toLowerCase()))
    : servicios;

  const handleSave = async (data: any) => {
    try {
      const isEdit = data.id && typeof data.id === 'string';
      const url = isEdit ? `/api/notion/servicios?id=${data.id}` : '/api/notion/servicios';
      const r = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const d = await r.json();
      if (d.error) { showToast(`Error: ${d.error}`, 'error'); return; }
      if (d.servicio) {
        const s = { ...d.servicio, cantidad: 1 };
        setServicios(prev => isEdit ? prev.map(x => x.id === data.id ? s : x) : [s, ...prev]);
        showToast(isEdit ? 'Servicio actualizado ✓' : 'Servicio creado ✓', 'success');
        setModal(null);
      }
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const montoTotal = servicios.reduce((acc, s) => acc + (s.precio_con_igv || s.precio_base), 0);

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {modal !== null && <ModalServicio servicio={modal === 'nuevo' ? null : modal as Servicio} onSave={handleSave} onClose={() => setModal(null)} />}

      <div className="flex flex-col h-full bg-gray-100/60 min-h-screen">
        <ScreenHeader
          title="Servicios"
          subtitle={`${servicios.length} servicios · promedio ${servicios.length ? formatCurrency(montoTotal / servicios.length) : 'S/ 0'}`}
          onNew={() => setModal('nuevo')} newLabel="Nuevo servicio"
          onRefresh={load} refreshing={loading}
          search={search} onSearch={setSearch} searchPlaceholder="Buscar servicios..." />

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <DataTable
              rows={filtered.map(s => ({ ...s, id: String(s.id) }))}
              onRowClick={(s) => setModal(s as any)}
              emptyText="Sin servicios."
              columns={[
                { key: 'nombre', header: 'Servicio', render: (s) => (
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-fuchsia-50 flex items-center justify-center flex-shrink-0"><Package size={15} className="text-fuchsia-500" /></span>
                    <p className="text-[13px] font-semibold text-gray-800">{s.nombre}</p>
                  </div>
                )},
                { key: 'desc', header: 'Descripción', render: (s) => <span className="text-[12px] text-gray-500 max-w-[240px] truncate inline-block align-middle">{s.descripcion || '—'}</span> },
                { key: 'sinigv', header: 'Sin IGV', render: (s) => <span className="text-[13px] text-gray-500">{formatCurrency(s.precio_base)}</span> },
                { key: 'conigv', header: 'Con IGV', render: (s) => <span className="text-[13px] font-bold text-gray-800">{formatCurrency(s.precio_con_igv || s.precio_base * 1.18)}</span> },
                { key: 'acciones', header: '', sortable: false, render: (s) => (
                  <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setModal(s as any)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-gray-300 hover:text-[#ffc500] transition-all"><Edit2 size={13} /></button>
                  </div>
                )},
              ]}
            />
          )}
        </div>
      </div>
    </>
  );
}

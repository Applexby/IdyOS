'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Plus, Edit2, Trash2, X, Loader2, RefreshCw, Package } from 'lucide-react';
import { Toast, useToast } from './Toast';
import { useConfirm } from './ui/Feedback';
import { ScreenHeader, DataTable } from './ui/CrmKit';

interface Equipo { id: string | number; nombre: string; }

const inp = "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#ffc500]/30 focus:border-[#ffc500] transition-all";

function ModalEquipo({ equipo, onSave, onClose }: { equipo?: Equipo | null; onSave: (d: any) => void; onClose: () => void }) {
  const [nombre, setNombre] = useState(equipo?.nombre || '');
  return (
    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-5"><p className="font-bold text-gray-800">{equipo ? 'Editar equipo' : 'Nuevo equipo'}</p><button onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={18} /></button></div>
        <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Nombre del equipo</label>
        <input autoFocus type="text" value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSave({ id: equipo?.id, nombre })} className={`${inp} mb-4`} />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
          <button onClick={() => onSave({ id: equipo?.id, nombre })} className="flex-1 py-2.5 rounded-xl bg-[#ffc500] text-white text-xs font-bold hover:bg-[#e6b000] shadow-sm">Guardar en Notion</button>
        </div>
      </div>
    </div>
  );
}

export default function EquiposPanel() {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Equipo | null | 'nuevo'>(null);
  const { toast, showToast, hideToast } = useToast();
  const confirmar = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/notion/equipos');
      const d = await r.json();
      setEquipos(d.equipos || []);
    } catch { showToast('Error cargando equipos', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = search ? equipos.filter(e => e.nombre.toLowerCase().includes(search.toLowerCase())) : equipos;

  const handleSave = async (data: any) => {
    try {
      const isEdit = data.id && typeof data.id === 'string';
      const url = isEdit ? `/api/notion/equipos?id=${data.id}` : '/api/notion/equipos';
      const r = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const d = await r.json();
      if (d.error) { showToast(`Error: ${d.error}`, 'error'); return; }
      if (d.equipo) {
        setEquipos(prev => isEdit ? prev.map(x => x.id === data.id ? d.equipo : x) : [...prev, d.equipo]);
        showToast(isEdit ? 'Equipo actualizado ✓' : 'Equipo creado ✓', 'success');
        setModal(null);
      }
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const handleDelete = async (id: any) => {
    if (!(await confirmar({ titulo: '¿Eliminar este equipo?', mensaje: 'Se archivará en Notion.', confirmar: 'Eliminar', peligro: true }))) return;
    try {
      await fetch(`/api/notion/equipos?id=${id}`, { method: 'DELETE' });
      setEquipos(prev => prev.filter(e => e.id !== id));
      showToast('Equipo eliminado ✓', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {modal !== null && <ModalEquipo equipo={modal === 'nuevo' ? null : modal as Equipo} onSave={handleSave} onClose={() => setModal(null)} />}

      <div className="flex flex-col h-full bg-gray-100/60 min-h-screen">
        <ScreenHeader
          title="Equipos"
          subtitle={`${equipos.length} equipos · ${filtered.length} en vista`}
          onNew={() => setModal('nuevo')} newLabel="Nuevo equipo"
          onRefresh={load} refreshing={loading}
          search={search} onSearch={setSearch} searchPlaceholder="Buscar equipo..." />

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <DataTable
              rows={filtered.map(e => ({ ...e, id: String(e.id) }))}
              onRowClick={(eq) => setModal(eq as any)}
              emptyText={search ? 'Sin resultados.' : 'No hay equipos en Notion.'}
              actions={(selected, clear) => (
                <button onClick={async () => { for (const eq of selected) await handleDelete(eq.id); clear(); }}
                  className="text-[13px] text-rose-300 hover:text-rose-100 flex items-center gap-1">
                  <Trash2 size={13} /> Eliminar
                </button>
              )}
              columns={[
                { key: 'nombre', header: 'Equipo', render: (eq) => (
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0"><Package size={15} className="text-[#ffc500]" /></span>
                    <p className="text-[13px] font-semibold text-gray-800">{eq.nombre}</p>
                  </div>
                )},
                { key: 'acciones', header: '', sortable: false, render: (eq) => (
                  <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setModal(eq as any)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-gray-300 hover:text-[#ffc500] transition-all"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(eq.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-rose-400 transition-all"><Trash2 size={13} /></button>
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

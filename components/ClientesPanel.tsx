'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Plus, Edit2, X, Loader2, RefreshCw, Building2, User, Trash2, ToggleLeft, ToggleRight, LayoutGrid, List, Phone, Mail, Globe, ExternalLink, Download } from 'lucide-react';
import { formatCurrency, hoyLima } from '@/lib/utils';
import { descargarXlsx } from '@/lib/xlsx';
import { Toast, useToast } from './Toast';
import { useNotify, useConfirm } from './ui/Feedback';
import { useDuplicadosCliente, invalidarClientesCache } from './crm/useDuplicadosCliente';
import { ScreenHeader, DataTable, Avatar, Chip } from './ui/CrmKit';
import Selector from '@/components/ui/Selector';

interface Cliente {
  id: string; nombre_completo: string; persona_contacto: string;
  tipo_doc: string; num_doc: string; ruc: string;
  telefono: string; email: string; estado: string; tipo: string;
}

const inp = "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#ffc500]/30 focus:border-[#ffc500] transition-all";
const labelCls = "block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5";

function ModalCliente({ cliente, onSave, onClose }: { cliente?: Cliente | null; onSave: (d: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    nombre_completo: cliente?.nombre_completo || '',
    persona_contacto: cliente?.persona_contacto || '',
    tipo_doc: cliente?.tipo_doc || 'DNI',
    num_doc: cliente?.num_doc || '',
    ruc: cliente?.ruc || '',
    telefono: cliente?.telefono || '',
    email: cliente?.email || '',
    estado: cliente?.estado || 'Activo',
  });
  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [buscandoDni, setBuscandoDni] = useState(false);
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [cargandoProy, setCargandoProy] = useState(false);
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));
  const duplicados = useDuplicadosCliente(
    { ruc: form.ruc, dni: form.tipo_doc === 'DNI' ? form.num_doc : '', telefono: form.telefono, email: form.email },
    true, cliente?.id,
  );

  // Historial de proyectos del cliente (leads/proyectos vinculados por relación Empresa)
  useEffect(() => {
    if (!cliente?.id) return;
    setCargandoProy(true);
    fetch('/api/notion/pipeline?solo_activos=false')
      .then(r => r.json())
      .then(d => {
        const propios = (d.leads || []).filter((l: any) => l.empresa_id === cliente.id);
        setProyectos(propios);
      })
      .catch(() => {})
      .finally(() => setCargandoProy(false));
  }, [cliente?.id]);

  const notify = useNotify();
  const buscarRuc = async () => {
    const rucLimpio = form.ruc.replace(/\D/g, '');
    if (rucLimpio.length !== 11) return;
    setBuscandoRuc(true);
    try {
      const r = await fetch(`/api/consulta?tipo=ruc&numero=${rucLimpio}`);
      const d = await r.json();
      if (d.ok && d.razon_social) {
        setForm(p => ({ ...p, nombre_completo: d.razon_social }));
      } else {
        notify.error(d.error || 'RUC no encontrado. Verifica el número.');
      }
    } catch (e: any) {
      notify.error('Error al consultar SUNAT: ' + e.message);
    } finally { setBuscandoRuc(false); }
  };

  const buscarDni = async () => {
    const dniLimpio = form.num_doc.replace(/\D/g, '');
    if (dniLimpio.length !== 8) return;
    setBuscandoDni(true);
    try {
      const r = await fetch(`/api/consulta?tipo=dni&numero=${dniLimpio}`);
      const d = await r.json();
      if (d.ok && d.nombre_completo) {
        setForm(p => ({ ...p, persona_contacto: d.nombre_completo }));
      } else {
        notify.error(d.error || 'DNI no encontrado. Verifica el número.');
      }
    } catch (e: any) {
      notify.error('Error al consultar RENIEC: ' + e.message);
    } finally { setBuscandoDni(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <p className="font-bold text-gray-800">{cliente ? 'Editar cliente' : 'Nuevo cliente'}</p>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {/* EMPRESA */}
          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
            <p className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider">Empresa</p>
          </div>
          <div>
            <label className={labelCls}>Razón Social *</label>
            <input type="text" value={form.nombre_completo} onChange={set('nombre_completo')} placeholder="Empresa S.A.C." className={inp} />
          </div>
          <div>
            <label className={labelCls}>RUC</label>
            <div className="flex gap-2">
              <input type="text" value={form.ruc} onChange={set('ruc')} placeholder="20123456789" maxLength={11} className={`${inp} flex-1`} />
              <button onClick={buscarRuc} disabled={buscandoRuc || form.ruc.replace(/\D/g,'').length !== 11}
                className="px-3 py-2.5 bg-[#ffc500] hover:bg-[#e6b000] disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shadow-sm">
                {buscandoRuc ? <Loader2 size={12} className="animate-spin" /> : null}
                {buscandoRuc ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>

          {/* PERSONA DE CONTACTO */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mt-1">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Persona de contacto</p>
          </div>
          <div>
            <label className={labelCls}>Nombre completo *</label>
            <input type="text" value={form.persona_contacto} onChange={set('persona_contacto')} placeholder="Nombre del responsable" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tipo documento</label>
              <Selector value={form.tipo_doc} onChange={set('tipo_doc')} className={inp}>
                <option>DNI</option><option>Carnet de Extranjería</option><option>Pasaporte</option>
              </Selector>
            </div>
            <div>
              <label className={labelCls}>N° documento</label>
              <div className="flex gap-1.5">
                <input type="text" value={form.num_doc} onChange={set('num_doc')} placeholder="12345678" maxLength={12} className={`${inp} flex-1`} />
                {form.tipo_doc === 'DNI' && (
                  <button onClick={buscarDni} disabled={buscandoDni || form.num_doc.replace(/\D/g,'').length !== 8}
                    className="px-2.5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-[10px] font-bold rounded-xl transition-all flex items-center gap-1 shadow-sm">
                    {buscandoDni ? <Loader2 size={10} className="animate-spin" /> : 'Buscar'}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div><label className={labelCls}>Teléfono</label><input type="tel" value={form.telefono} onChange={set('telefono')} placeholder="+51 999 000 000" className={inp} /></div>
          <div><label className={labelCls}>Correo electrónico</label><input type="email" value={form.email} onChange={set('email')} placeholder="contacto@empresa.com" className={inp} /></div>

          {/* Estado */}
          {cliente && (
            <div>
              <label className={labelCls}>Estado</label>
              <Selector value={form.estado} onChange={set('estado')} className={inp}>
                <option>Activo</option><option>Inactivo</option>
              </Selector>
            </div>
          )}

          {/* Historial de proyectos del cliente */}
          {cliente && (
            <div className="pt-2 border-t border-gray-100">
              <label className={labelCls}>Historial de proyectos</label>
              {cargandoProy ? (
                <p className="text-xs text-gray-400 py-2">Cargando proyectos…</p>
              ) : proyectos.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 italic">Sin proyectos asociados.</p>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {proyectos.map((p: any) => (
                    <a key={p.id} href={p.notion_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-800 truncate">{p.proyecto || '(Sin nombre)'}</p>
                        <p className="text-[11px] text-gray-400">{p.estado_lead}{p.total ? ` · ${formatCurrency(p.total)}` : ''}</p>
                      </div>
                      <ExternalLink size={12} className="text-gray-300 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {duplicados.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[12px] text-amber-800">
              <p className="font-bold mb-1">Posible cliente duplicado:</p>
              {duplicados.map(({ cliente: c, motivo }) => (
                <p key={c.id}>· {c.nombre_completo || c.persona_contacto} <span className="opacity-70">({motivo})</span></p>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => { invalidarClientesCache(); onSave({ ...form, id: cliente?.id }); }}
              className="flex-1 py-2.5 rounded-xl bg-[#ffc500] text-white text-xs font-bold hover:bg-[#e6b000] shadow-sm">
              {cliente ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientesPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtered, setFiltered] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'Activo' | 'Inactivo' | ''>('Activo');
  const [modal, setModal] = useState<Cliente | null | 'nuevo'>(null);
  const [vista, setVista] = useState<'tablero' | 'tabla'>('tablero');
  const { toast, showToast, hideToast } = useToast();
  const confirmar = useConfirm();

  const load = useCallback(async (estado = filtroEstado) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (estado) params.set('estado', estado);
      const r = await fetch(`/api/notion/clientes?${params}`);
      const d = await r.json();
      setClientes(d.clientes || []);
    } catch { showToast('Error cargando clientes', 'error'); }
    finally { setLoading(false); }
  }, [filtroEstado]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!search) { setFiltered(clientes); return; }
    const q = search.toLowerCase();
    setFiltered(clientes.filter(c =>
      c.nombre_completo.toLowerCase().includes(q) ||
      c.persona_contacto.toLowerCase().includes(q) ||
      c.ruc.includes(q) || c.num_doc.includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.telefono || '').includes(q)
    ));
  }, [search, clientes]);

  const cambiarFiltro = (estado: 'Activo' | 'Inactivo' | '') => {
    setFiltroEstado(estado);
    load(estado);
  };

  const handleSave = async (data: any) => {
    try {
      const isEdit = !!data.id;
      const url = isEdit ? `/api/notion/clientes?id=${data.id}` : '/api/notion/clientes';
      const r = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const d = await r.json();
      if (d.error) {
        // Mostrar info útil cuando hay un mismatch de campos en la BD
        if (d.campos_disponibles_en_bd) {
          console.error('Campos disponibles en la BD Contactos:', d.campos_disponibles_en_bd);
          console.error('Campos que se intentaron escribir:', d.campos_intentados || d.skipped);
        }
        showToast(`Error: ${d.error}`, 'error');
        return;
      }
      if (d.warnings) {
        console.warn('Advertencias al guardar:', d.warnings);
      }
      if (d.skipped) {
        console.warn('Campos no escritos (no existen en BD):', d.skipped);
      }
      if (d.cliente) {
        setClientes(prev => isEdit ? prev.map(x => x.id === data.id ? d.cliente : x) : [d.cliente, ...prev]);
        showToast(isEdit ? 'Cliente actualizado ✓' : 'Cliente creado en Notion ✓', 'success');
        setModal(null);
      }
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const handleToggleEstado = async (c: Cliente) => {
    const nuevoEstado = c.estado === 'Activo' ? 'Inactivo' : 'Activo';
    await handleSave({ ...c, estado: nuevoEstado });
  };

  const handleEliminar = async (id: string, nombre: string) => {
    if (!(await confirmar({ titulo: `¿Eliminar a "${nombre}"?`, mensaje: 'Se archivará en Notion y dejará de aparecer en el sistema.', confirmar: 'Eliminar', peligro: true }))) return;
    try {
      const r = await fetch(`/api/notion/clientes?id=${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.error) { showToast(`Error: ${d.error}`, 'error'); return; }
      setClientes(prev => prev.filter(c => c.id !== id));
      showToast('Cliente eliminado de Notion ✓', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  // Exporta a Excel los clientes de la vista actual (respeta búsqueda y filtro)
  function exportarExcel() {
    descargarXlsx(`Idealo-clientes-${hoyLima()}`, [{
      nombre: 'Clientes',
      columnas: [
        { titulo: 'Razón social / Empresa', ancho: 36 }, { titulo: 'Persona de contacto', ancho: 28 },
        { titulo: 'RUC', ancho: 14 }, { titulo: 'Tipo doc.', ancho: 10 }, { titulo: 'N° doc.', ancho: 14 },
        { titulo: 'Teléfono', ancho: 16 }, { titulo: 'Email', ancho: 30 }, { titulo: 'Estado', ancho: 10 }, { titulo: 'Tipo', ancho: 10 },
      ],
      filas: filtered.map(c => [c.nombre_completo, c.persona_contacto, c.ruc, c.tipo_doc, c.num_doc, c.telefono, c.email, c.estado, c.tipo]),
    }]);
    showToast(`${filtered.length} clientes exportados a Excel`, 'success');
  }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {modal !== null && (
        <ModalCliente
          cliente={modal === 'nuevo' ? null : modal as Cliente}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      <div className="flex flex-col h-full bg-gray-100/60 min-h-screen">
        <ScreenHeader
          title="Clientes"
          subtitle={`${clientes.length} cargados · ${filtered.length} en vista`}
          onNew={() => setModal('nuevo')} newLabel="Nuevo cliente"
          onRefresh={() => load(filtroEstado)} refreshing={loading}
          search={search} onSearch={setSearch}
          searchPlaceholder="Buscar por empresa, contacto, RUC, teléfono..."
          acciones={
            <button onClick={exportarExcel} disabled={filtered.length === 0} title="Exportar los clientes en vista a Excel"
              className="flex items-center gap-2 border border-gray-200 bg-white hover:border-gray-300 text-gray-700 text-[13px] font-semibold px-3.5 py-2.5 rounded-xl transition-colors disabled:opacity-40">
              <Download size={15} /> <span className="hidden sm:inline">Excel</span>
            </button>
          }>
          {/* Filtros de estado */}
          <div className="flex items-center gap-1.5">
            {[
              { valor: 'Activo', label: 'Activos' },
              { valor: 'Inactivo', label: 'Inactivos' },
              { valor: '', label: 'Todos' },
            ].map(f => (
              <button key={f.valor} onClick={() => cambiarFiltro(f.valor as any)}
                className={`px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                  filtroEstado === f.valor ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </ScreenHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <DataTable
              rows={filtered}
              onRowClick={(c) => setModal(c)}
              emptyText={search ? 'Sin resultados para tu búsqueda.' : `No hay clientes ${filtroEstado ? filtroEstado.toLowerCase() + 's' : ''} en Notion.`}
              actions={(selected, clear) => (
                <>
                  <button onClick={async () => { for (const c of selected) await handleSave({ ...c, estado: 'Activo' }); clear(); }}
                    className="text-[13px] text-emerald-300 hover:text-emerald-100 flex items-center gap-1">
                    <ToggleRight size={14} /> Activar
                  </button>
                  <button onClick={async () => { for (const c of selected) await handleSave({ ...c, estado: 'Inactivo' }); clear(); }}
                    className="text-[13px] text-gray-300 hover:text-white flex items-center gap-1">
                    <ToggleLeft size={14} /> Desactivar
                  </button>
                  <button onClick={async () => { for (const c of selected) await handleEliminar(c.id, c.nombre_completo); clear(); }}
                    className="text-[13px] text-rose-300 hover:text-rose-100 flex items-center gap-1">
                    <Trash2 size={13} /> Eliminar
                  </button>
                </>
              )}
              columns={[
                { key: 'empresa', header: 'Empresa / Contacto', render: (c) => (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.nombre_completo || c.persona_contacto || '?'} size={28} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800 truncate max-w-52">{c.nombre_completo || '—'}</p>
                      {c.persona_contacto && <p className="text-[11px] text-gray-400 truncate">{c.persona_contacto}</p>}
                    </div>
                  </div>
                )},
                { key: 'doc', header: 'RUC / DNI', render: (c) => <span className="text-[12px] text-gray-500 font-mono">{c.ruc || c.num_doc || '—'}</span> },
                { key: 'tel', header: 'Teléfono', render: (c) => <span className="text-[12px] text-gray-500">{c.telefono || '—'}</span> },
                { key: 'email', header: 'Email', render: (c) => <span className="text-[12px] text-gray-500 truncate max-w-40 inline-block align-middle">{c.email || '—'}</span> },
                { key: 'estado', header: 'Estado', render: (c) => <Chip label={c.estado || 'Activo'} tone={c.estado === 'Inactivo' ? 'gray' : 'emerald'} /> },
                { key: 'acciones', header: '', sortable: false, render: (c) => (
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setModal(c)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-gray-300 hover:text-[#ffc500] transition-all"><Edit2 size={13} /></button>
                    <button onClick={() => handleToggleEstado(c)} title={c.estado === 'Activo' ? 'Marcar inactivo' : 'Marcar activo'}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-500 transition-all">
                      {c.estado === 'Activo' ? <ToggleRight size={14} className="text-emerald-500" /> : <ToggleLeft size={14} className="text-gray-400" />}
                    </button>
                    <button onClick={() => handleEliminar(c.id, c.nombre_completo)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-rose-400 transition-all"><Trash2 size={13} /></button>
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

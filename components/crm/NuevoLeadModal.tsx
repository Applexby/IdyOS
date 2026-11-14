'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { mismaPersona } from '@/lib/equipo';
import { CANALES_LEAD } from '@/types/crm';
import { X, Search, Plus, Loader2 } from 'lucide-react';
import { hoyLima, nombreDesdeEmail } from '@/lib/utils';
import SelectorCampana from './SelectorCampana';
import { useDuplicadosCliente, invalidarClientesCache } from './useDuplicadosCliente';
import DatePicker from '@/components/ui/DatePicker';
import Selector from '@/components/ui/Selector';

interface Props {
  campanas: any[];
  usuarios?: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (lead?: any) => void;
}

const CANALES = CANALES_LEAD;

const ESTADOS_INICIALES = ['NUEVO LEAD', 'CONTACTADO'];

export default function NuevoLeadModal({ campanas, usuarios = [], onClose, onCreated }: Props) {
  const { data: session } = useSession();
  const [saving, setSaving]           = useState(false);
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('');
  const [empresas, setEmpresas]       = useState<any[]>([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<any>(null);
  const [showSugerencias, setShowSugerencias] = useState(false);
  const [error, setError]             = useState('');
  const [consultando, setConsultando] = useState<'' | 'ruc' | 'dni'>('');
  const [ignorarDuplicado, setIgnorarDuplicado] = useState(false);
  const [avisoDoc, setAvisoDoc]       = useState('');

  const [creandoCliente, setCreandoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    empresa: '', cliente: '', telefono: '', email: '', ruc: '', dni: '', sitio_web: '',
  });

  const duplicados = useDuplicadosCliente(
    { ruc: nuevoCliente.ruc, dni: nuevoCliente.dni, telefono: nuevoCliente.telefono, email: nuevoCliente.email },
    creandoCliente,
  );

  const [form, setForm] = useState({
    proyecto:    '',
    estado:      'NUEVO LEAD',
    fecha:       hoyLima(),
    canal:       '',
    origen:      'Orgánico',
    campana_id:  '',
    notas:       '',
    atendido_por: '',
  });

  // Preseleccionar al usuario que está creando el lead como "Atendido por"
  useEffect(() => {
    if (form.atendido_por || usuarios.length === 0) return;
    const corto = nombreDesdeEmail(session?.user?.email);
    const completo = session?.user?.name || '';
    const match = usuarios.find(u => mismaPersona(u.name, completo) || mismaPersona(u.name, corto));
    if (match) setForm(f => ({ ...f, atendido_por: match.name }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios, session]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // Consulta SUNAT (RUC) / RENIEC (DNI) con feedback visible
  async function consultarDoc(tipo: 'ruc' | 'dni') {
    const numero = (tipo === 'ruc' ? nuevoCliente.ruc : nuevoCliente.dni).replace(/\D/g, '');
    const largo = tipo === 'ruc' ? 11 : 8;
    if (numero.length !== largo) { setAvisoDoc(`El ${tipo.toUpperCase()} debe tener ${largo} dígitos`); return; }
    setAvisoDoc(''); setConsultando(tipo);
    try {
      const r = await fetch(`/api/consulta?tipo=${tipo}&numero=${numero}`);
      const d = await r.json();
      if (!d.ok) { setAvisoDoc(d.error || 'No se encontró el documento'); return; }
      if (tipo === 'ruc' && d.razon_social) {
        setNuevoCliente(c => ({ ...c, empresa: d.razon_social }));
        if (d.activo === false) setAvisoDoc(`Atención: RUC ${d.estado || ''} / ${d.condicion || ''}`.trim());
      }
      if (tipo === 'dni' && d.nombre_completo) setNuevoCliente(c => ({ ...c, cliente: d.nombre_completo }));
    } catch {
      setAvisoDoc('No se pudo consultar. Intenta de nuevo.');
    } finally { setConsultando(''); }
  }

  // Buscar empresas en Notion
  useEffect(() => {
    if (busquedaEmpresa.length < 2) { setEmpresas([]); return; }
    // `vigente` evita que una respuesta lenta de una búsqueda anterior
    // sobrescriba los resultados de la búsqueda actual.
    let vigente = true;
    const timer = setTimeout(async () => {
      setLoadingEmpresas(true);
      try {
        const res = await fetch(`/api/notion/clientes?incluir_leads=1&q=${encodeURIComponent(busquedaEmpresa)}`);
        const data = await res.json();
        if (vigente) setEmpresas(data.clientes || []);
      } catch {
        if (vigente) setEmpresas([]);
      } finally { if (vigente) setLoadingEmpresas(false); }
    }, 400);
    return () => { vigente = false; clearTimeout(timer); };
  }, [busquedaEmpresa]);

  async function handleSubmit() {
    if (!form.proyecto.trim()) { setError('El nombre del proyecto es obligatorio'); return; }
    if (creandoCliente && !nuevoCliente.empresa.trim() && !nuevoCliente.cliente.trim()) {
      setError('Indica la razón social o el nombre de la persona de contacto del cliente nuevo');
      return;
    }
    if (creandoCliente && duplicados.length > 0 && !ignorarDuplicado) {
      setError('Ese cliente parece existir ya. Úsalo o confirma que quieres crear uno nuevo.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      let empresaId = empresaSeleccionada?.id || null;

      // Si está creando un cliente nuevo, primero lo creamos en la BD de Clientes
      if (creandoCliente && (nuevoCliente.empresa.trim() || nuevoCliente.cliente.trim())) {
        const resCli = await fetch('/api/notion/clientes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre_completo: nuevoCliente.empresa || nuevoCliente.cliente,
            persona_contacto: nuevoCliente.cliente,
            telefono: nuevoCliente.telefono,
            email: nuevoCliente.email,
            ruc: nuevoCliente.ruc,
            num_doc: nuevoCliente.dni,
            sitio_web: nuevoCliente.sitio_web,
            tipo: 'LEAD',
            estado: 'Activo',
          }),
        });
        const dataCli = await resCli.json();
        if (dataCli.error) { setError(`Error al crear cliente: ${dataCli.error}`); setSaving(false); return; }
        empresaId = dataCli.cliente?.id || null;
        invalidarClientesCache();
      }

      const res = await fetch('/api/notion/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proyecto:         form.proyecto,
          empresa_id:       empresaId,
          estado_lead:      form.estado,
          fecha_contactado: form.fecha,
          notas:            form.notas || undefined,
          canal:            form.canal || undefined,
          origen:           form.origen || undefined,
          campana_id:       form.origen === 'Campaña' && form.campana_id ? form.campana_id : undefined,
          atendido_por:     form.atendido_por || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Error al crear el lead');
        return;
      }
      onCreated(data.lead);
    } catch (e: any) {
      setError(e.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nuevo-lead-titulo" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="nuevo-lead-titulo" className="text-base font-bold text-gray-900">Nuevo lead</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Nombre del proyecto */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Nombre del proyecto / servicio <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.proyecto}
              onChange={e => { setForm(f => ({ ...f, proyecto: e.target.value })); setError(''); }}
              placeholder="Ej: META ADS - VIDEO CORPORATIVO"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] transition-colors"
            />
          </div>

          {/* Empresa / Cliente */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Empresa / Cliente</label>
            {empresaSeleccionada ? (
              <div className="flex items-center gap-2 bg-yellow-50 border border-[#ffc500] rounded-xl px-3 py-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#ffc500] flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-white">
                    {(empresaSeleccionada.nombre_completo || empresaSeleccionada.persona_contacto)?.[0] || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{empresaSeleccionada.nombre_completo || empresaSeleccionada.persona_contacto}</p>
                  {(empresaSeleccionada.ruc || empresaSeleccionada.num_doc || empresaSeleccionada.persona_contacto) && (
                    <p className="text-[11px] text-gray-500 truncate">
                      {[empresaSeleccionada.nombre_completo && empresaSeleccionada.persona_contacto !== empresaSeleccionada.nombre_completo ? empresaSeleccionada.persona_contacto : '',
                        empresaSeleccionada.ruc ? `RUC ${empresaSeleccionada.ruc}` : (empresaSeleccionada.num_doc ? `DNI ${empresaSeleccionada.num_doc}` : '')].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <button onClick={() => { setEmpresaSeleccionada(null); setBusquedaEmpresa(''); }}
                  aria-label="Quitar cliente seleccionado"
                  className="text-gray-400 hover:text-red-500 transition-colors">
                  <X size={13} />
                </button>
              </div>
            ) : creandoCliente ? (
              <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Nuevo cliente</p>
                  <button onClick={() => setCreandoCliente(false)} className="text-[11px] text-gray-400 hover:text-gray-600">Buscar existente</button>
                </div>
                <input placeholder="Razón social / Empresa" aria-label="Razón social" value={nuevoCliente.empresa} onChange={e => setNuevoCliente(c => ({ ...c, empresa: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#ffc500]" />
                <input placeholder="Persona de contacto" value={nuevoCliente.cliente} onChange={e => setNuevoCliente(c => ({ ...c, cliente: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#ffc500]" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={e => setNuevoCliente(c => ({ ...c, telefono: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#ffc500]" />
                  <input placeholder="Email" value={nuevoCliente.email} onChange={e => setNuevoCliente(c => ({ ...c, email: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#ffc500]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex gap-1">
                    <input placeholder="RUC" aria-label="RUC" inputMode="numeric" maxLength={11} value={nuevoCliente.ruc} onChange={e => setNuevoCliente(c => ({ ...c, ruc: e.target.value.replace(/\D/g, '') }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#ffc500]" />
                    <button type="button" onClick={() => consultarDoc('ruc')} disabled={consultando !== ''}
                      className="px-2 rounded-lg bg-gray-900 text-white text-[11px] font-semibold flex-shrink-0 disabled:opacity-50 min-w-[52px] flex items-center justify-center">
                      {consultando === 'ruc' ? <Loader2 size={12} className="animate-spin" /> : 'SUNAT'}
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <input placeholder="DNI" aria-label="DNI" inputMode="numeric" maxLength={8} value={nuevoCliente.dni} onChange={e => setNuevoCliente(c => ({ ...c, dni: e.target.value.replace(/\D/g, '') }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#ffc500]" />
                    <button type="button" onClick={() => consultarDoc('dni')} disabled={consultando !== ''}
                      className="px-2 rounded-lg bg-gray-900 text-white text-[11px] font-semibold flex-shrink-0 disabled:opacity-50 min-w-[56px] flex items-center justify-center">
                      {consultando === 'dni' ? <Loader2 size={12} className="animate-spin" /> : 'RENIEC'}
                    </button>
                  </div>
                </div>
                {avisoDoc && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">{avisoDoc}</p>}
                {duplicados.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-1.5">
                    <p className="text-[11px] font-bold text-amber-800">Este cliente ya existe en Notion:</p>
                    {duplicados.map(({ cliente: c, motivo }) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 truncate">{c.nombre_completo || c.persona_contacto}</p>
                          <p className="text-[10px] text-amber-700">{motivo}{c.ruc ? ` · RUC ${c.ruc}` : ''}</p>
                        </div>
                        <button type="button" onClick={() => { setEmpresaSeleccionada(c); setCreandoCliente(false); setError(''); }}
                          className="text-[11px] font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-md px-2 py-1 flex-shrink-0">Usar este</button>
                      </div>
                    ))}
                    <label className="flex items-center gap-1.5 text-[11px] text-amber-800">
                      <input type="checkbox" checked={ignorarDuplicado} onChange={e => setIgnorarDuplicado(e.target.checked)} />
                      Crear de todas formas un cliente nuevo
                    </label>
                  </div>
                )}
                <p className="text-[11px] text-gray-400">Se creará en la base de Clientes y se enlazará a este lead. Con RUC se usa la razón social; sin RUC, el DNI y el nombre del contacto.</p>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={busquedaEmpresa}
                  onChange={e => { setBusquedaEmpresa(e.target.value); setShowSugerencias(true); }}
                  onFocus={() => setShowSugerencias(true)}
                  placeholder="Buscar empresa registrada..."
                  className="w-full pl-8 pr-4 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500]"
                />
                {showSugerencias && (busquedaEmpresa.length >= 2) && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                    {loadingEmpresas ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 size={16} className="animate-spin text-gray-400" />
                      </div>
                    ) : empresas.length === 0 ? (
                      <button onClick={() => { setCreandoCliente(true); setNuevoCliente(c => ({ ...c, empresa: busquedaEmpresa })); setShowSugerencias(false); }}
                        className="w-full px-4 py-3 text-xs text-left text-gray-500 hover:bg-yellow-50 transition-colors">
                        Sin resultados — <span className="text-[#b8890b] font-semibold">crear "{busquedaEmpresa}" como cliente nuevo</span>
                      </button>
                    ) : empresas.map(e => (
                      <button key={e.id} onClick={() => { setEmpresaSeleccionada(e); setShowSugerencias(false); setBusquedaEmpresa(''); }}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-gray-500">{(e.nombre_completo || e.persona_contacto)?.[0] || '?'}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{e.nombre_completo || e.persona_contacto || '(sin nombre)'}</p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {[e.nombre_completo && e.persona_contacto && e.persona_contacto !== e.nombre_completo ? e.persona_contacto : '',
                              e.ruc ? `RUC ${e.ruc}` : (e.num_doc ? `DNI ${e.num_doc}` : ''),
                              e.tipo === 'LEAD' ? 'Lead' : ''].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                </div>
                <button onClick={() => setCreandoCliente(true)}
                  className="mt-1.5 text-[11px] text-[#b8890b] font-semibold hover:underline">
                  + Crear cliente nuevo
                </button>
              </div>
            )}
          </div>

          {/* Fila: Estado + Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Estado inicial</label>
              <Selector value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] bg-white">
                {ESTADOS_INICIALES.map(e => <option key={e}>{e}</option>)}
              </Selector>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Fecha de primer contacto</label>
              <DatePicker value={form.fecha} onChange={v => setForm(f => ({ ...f, fecha: v }))} />
            </div>
          </div>

          {/* Atendido por */}
          {usuarios.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Atendido por</label>
              <Selector value={form.atendido_por} onChange={e => setForm(f => ({ ...f, atendido_por: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] bg-white">
                <option value="">—</option>
                {usuarios.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </Selector>
            </div>
          )}

          {/* Fila: Origen + Canal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Origen</label>
              <Selector value={form.origen} onChange={e => setForm(f => ({ ...f, origen: e.target.value, campana_id: e.target.value === 'Campaña' ? f.campana_id : '' }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] bg-white">
                <option value="Orgánico">Orgánico</option>
                <option value="Campaña">Campaña</option>
                <option value="Referido">Referido</option>
              </Selector>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Canal</label>
              <Selector value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] bg-white">
                <option value="">Seleccionar...</option>
                {CANALES.map(c => <option key={c}>{c}</option>)}
              </Selector>
            </div>
          </div>

          {/* Campaña — solo si el origen es Campaña (semi-automático) */}
          {form.origen === 'Campaña' && (
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">¿De qué campaña?</label>
              <SelectorCampana campanas={campanas} value={form.campana_id} onChange={id => setForm(f => ({ ...f, campana_id: id }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] bg-white" />
              <p className="text-[11px] text-gray-400 mt-1">Al vincularla, este lead contará en las métricas de esa campaña.</p>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Notas iniciales</label>
            <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Ej: Cliente contactó por Instagram preguntando por video corporativo..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] resize-none" />
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          <button onClick={onClose} className="flex-1 text-sm text-gray-500 hover:text-gray-700 py-2.5 border border-gray-200 rounded-xl transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !form.proyecto.trim()}
            className="flex-1 bg-[#ffc500] hover:bg-[#e6b000] text-white text-sm font-bold py-2.5 rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Creando...</> : <><Plus size={14} /> Crear lead</>}
          </button>
        </div>
      </div>
    </div>
  );
}

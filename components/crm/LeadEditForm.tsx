'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { type Lead, CANALES_LEAD } from '@/types/crm';
import SelectorCampana, { type CampanaOpcion } from './SelectorCampana';
import { mismaPersona } from '@/lib/equipo';
import DatePicker from '@/components/ui/DatePicker';
import Selector from '@/components/ui/Selector';

interface Props {
  lead: Lead;
  usuarios: { id: string; name: string }[];
  campanas?: CampanaOpcion[];
  onClose: () => void;
  onSave: (campos: any) => Promise<void>;
}

const ORIGENES = ['Orgánico', 'Campaña', 'Referido'];

const inp = 'w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-yellow-100 transition-all';
const lbl = 'block text-[11px] font-semibold text-gray-500 mb-1';

// Campos que viven en la ficha del cliente: solo se envían si cambiaron, para
// no sobrescribir la ficha con valores que el usuario no tocó.
const CAMPOS_CLIENTE = ['empresa_nombre', 'cliente_nombre', 'telefono', 'mail', 'ruc', 'dni_representante', 'sitio_web', 'canal'] as const;

export default function LeadEditForm({ lead, usuarios, campanas = [], onClose, onSave }: Props) {
  const [inicial] = useState(() => ({
    proyecto: lead.proyecto || '',
    empresa_nombre: lead.empresa || '',
    cliente_nombre: lead.cliente || '',
    telefono: lead.telefono || '',
    mail: lead.mail || '',
    ruc: lead.ruc || '',
    dni_representante: lead.dni_representante ? String(lead.dni_representante) : '',
    sitio_web: lead.sitio_web || '',
    fecha_contactado: lead.fecha_contactado?.slice(0, 10) || '',
    fecha_ultimo_contacto: lead.fecha_ultimo_contacto?.slice(0, 10) || '',
    proximo_seguimiento: lead.proximo_seguimiento?.slice(0, 10) || '',
    origen: lead.origen || '',
    canal: lead.canal || '',
    campana_id: lead.campana_vinculada_id || '',
    // Variante del mismo nombre ("Isai" → "Isai Manzanares") → opción del equipo activo
    atendido_por: usuarios.find(u => mismaPersona(u.name, lead.atendido_por))?.name || lead.atendido_por || '',
    notas_seguimiento_replace: lead.notas_seguimiento || '',
  }));
  const [form, setForm] = useState(inicial);
  const [saving, setSaving] = useState(false);
  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [buscandoDni, setBuscandoDni] = useState(false);
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));

  async function buscarRuc() {
    const ruc = form.ruc.replace(/\D/g, '');
    if (ruc.length !== 11) return;
    setBuscandoRuc(true);
    try {
      const r = await fetch(`/api/consulta?tipo=ruc&numero=${ruc}`);
      const d = await r.json();
      if (d.ok && d.razon_social) setForm(p => ({ ...p, empresa_nombre: d.razon_social }));
    } catch { /* noop */ } finally { setBuscandoRuc(false); }
  }
  async function buscarDni() {
    const dni = form.dni_representante.replace(/\D/g, '');
    if (dni.length !== 8) return;
    setBuscandoDni(true);
    try {
      const r = await fetch(`/api/consulta?tipo=dni&numero=${dni}`);
      const d = await r.json();
      if (d.ok && d.nombre_completo) setForm(p => ({ ...p, cliente_nombre: d.nombre_completo }));
    } catch { /* noop */ } finally { setBuscandoDni(false); }
  }

  async function guardar() {
    setSaving(true);
    try {
      const campos: any = {
        proyecto: form.proyecto,
        fecha_contactado: form.fecha_contactado || null,
        fecha_ultimo_contacto: form.fecha_ultimo_contacto || null,
        proximo_seguimiento: form.proximo_seguimiento || null,
        origen: form.origen || null,
        // Vincular / desvincular campaña según el origen elegido
        ...(form.origen === 'Campaña'
          ? (form.campana_id !== inicial.campana_id ? { campana_id: form.campana_id || null } : {})
          : (inicial.campana_id ? { campana_id: null } : {})),
        dni_representante: form.dni_representante || null,
        // Datos del cliente vinculado
        empresa_nombre: form.empresa_nombre,
        cliente_nombre: form.cliente_nombre,
        telefono: form.telefono,
        mail: form.mail,
        ruc: form.ruc,
        sitio_web: form.sitio_web,
        canal: form.canal || null,
        atendido_por: form.atendido_por || null,
        notas_seguimiento_replace: form.notas_seguimiento_replace,
      };
      for (const k of CAMPOS_CLIENTE) {
        if (form[k].trim() === inicial[k].trim()) delete campos[k];
      }
      await onSave(campos);
    } finally { setSaving(false); }
  }

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Editar lead</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-300 hover:text-gray-600 p-1.5 rounded-lg transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className={lbl}>Título del proyecto</label>
            <input className={inp} value={form.proyecto} onChange={set('proyecto')} />
          </div>

          <div className="pt-2 border-t border-gray-50">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Datos del cliente</p>
            <p className="text-[11px] text-gray-400 mb-3 -mt-1.5">Se guardan en la ficha del cliente vinculado.</p>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Razón social / Empresa</label>
                <input className={inp} value={form.empresa_nombre} onChange={set('empresa_nombre')} placeholder="Razón social (si tiene RUC)" />
              </div>
              <div>
                <label className={lbl}>Persona de contacto (cliente)</label>
                <input className={inp} value={form.cliente_nombre} onChange={set('cliente_nombre')} placeholder="Nombre del contacto" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Teléfono</label>
                  <input className={inp} value={form.telefono} onChange={set('telefono')} placeholder="+51 9..." />
                </div>
                <div>
                  <label className={lbl}>Email</label>
                  <input className={inp} value={form.mail} onChange={set('mail')} placeholder="correo@..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>RUC <span className="text-[#b8890b]">· SUNAT</span></label>
                  <div className="flex gap-1">
                    <input className={inp} value={form.ruc} inputMode="numeric" maxLength={11} aria-label="RUC"
                      onChange={e => setForm(p => ({ ...p, ruc: e.target.value.replace(/\D/g, '') }))} placeholder="11 dígitos" />
                    <button onClick={buscarRuc} disabled={buscandoRuc || form.ruc.replace(/\D/g,'').length !== 11}
                      className="px-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold disabled:opacity-30 flex-shrink-0">
                      {buscandoRuc ? '...' : 'Buscar'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={lbl}>DNI rep. <span className="text-[#b8890b]">· RENIEC</span></label>
                  <div className="flex gap-1">
                    <input className={inp} value={form.dni_representante} inputMode="numeric" maxLength={8} aria-label="DNI del representante"
                      onChange={e => setForm(p => ({ ...p, dni_representante: e.target.value.replace(/\D/g, '') }))} placeholder="8 dígitos" />
                    <button onClick={buscarDni} disabled={buscandoDni || form.dni_representante.replace(/\D/g,'').length !== 8}
                      className="px-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold disabled:opacity-30 flex-shrink-0">
                      {buscandoDni ? '...' : 'Buscar'}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className={lbl}>Sitio web</label>
                <input className={inp} value={form.sitio_web} onChange={set('sitio_web')} placeholder="https://" />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-50">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Seguimiento</p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={lbl}>Primer contacto</label>
                  <DatePicker value={form.fecha_contactado} onChange={v => set('fecha_contactado')({ target: { value: v } } as any)} />
                </div>
                <div>
                  <label className={lbl}>Último contacto</label>
                  <DatePicker value={form.fecha_ultimo_contacto} borrable onChange={v => set('fecha_ultimo_contacto')({ target: { value: v } } as any)} />
                </div>
                <div>
                  <label className={lbl}>Próximo seg.</label>
                  <DatePicker value={form.proximo_seguimiento} borrable onChange={v => set('proximo_seguimiento')({ target: { value: v } } as any)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Origen</label>
                  <Selector className={inp} value={form.origen} onChange={set('origen')}>
                    <option value="">—</option>
                    {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
                  </Selector>
                </div>
                <div>
                  <label className={lbl}>Atendido por</label>
                  <Selector className={inp} value={form.atendido_por} onChange={set('atendido_por')}>
                    <option value="">—</option>
                    {usuarios.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    {form.atendido_por && !usuarios.some(u => u.name === form.atendido_por) && (
                      <option value={form.atendido_por}>{form.atendido_por} (ya no está en el equipo)</option>
                    )}
                  </Selector>
                </div>
                <div>
                  <label className={lbl}>Canal</label>
                  <Selector className={inp} value={form.canal} onChange={set('canal')} disabled={!lead.empresa_id}
                    title={lead.empresa_id ? 'Se guarda en la ficha del cliente' : 'Vincula primero un cliente al lead'}>
                    <option value="">—</option>
                    {CANALES_LEAD.map(c => <option key={c} value={c}>{c}</option>)}
                    {form.canal && !CANALES_LEAD.includes(form.canal) && <option value={form.canal}>{form.canal}</option>}
                  </Selector>
                </div>
              {form.origen === 'Campaña' && (
                <div>
                  <label className={lbl}>Campaña</label>
                  <SelectorCampana campanas={campanas} value={form.campana_id} onChange={id => setForm(p => ({ ...p, campana_id: id }))} className={inp} />
                  <p className="text-[10px] text-gray-400 mt-1">El lead contará en las métricas de esa campaña.</p>
                </div>
              )}
              </div>
              <div>
                <label className={lbl}>Historial de seguimiento</label>
                <textarea className={`${inp} resize-none font-mono text-[12px]`} rows={5}
                  value={form.notas_seguimiento_replace} onChange={set('notas_seguimiento_replace')}
                  placeholder="Bitácora de seguimiento..." />
                <p className="text-[10px] text-gray-400 mt-1">Puedes corregir o reescribir el historial. Cada línea es un registro.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-[#ffc500] hover:bg-[#e6b000] text-gray-900 rounded-xl transition-colors disabled:opacity-50">
            <Save size={15} /> {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

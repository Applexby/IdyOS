'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Servicio, Equipo } from '@/types';
import { formatCurrency, hoyLima } from '@/lib/utils';
import {
  Plus, Minus, CheckSquare, Square, FileDown, Loader2,
  Briefcase, Package, ChevronDown, ChevronUp, RefreshCw,
  MessageSquare, Search, X, Copy, Check, Send, Edit2,
  Trash2, FolderOpen, ExternalLink, Link2, Building2, User,
  Phone, Mail, Hash, CreditCard, Eye, EyeOff, Save, ChevronLeft, ChevronRight,
  CalendarDays, Coins, ClipboardList,
} from 'lucide-react';
import { Toast, useToast } from './Toast';
import { useNotify, useConfirm, useUnaVez } from '@/components/ui/Feedback';
import Selector from '@/components/ui/Selector';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface EmpresaNotion {
  id: string; nombre_empresa: string; persona_contacto: string;
  email: string; telefono: string; ruc: string; tipo_doc: string; num_doc: string;
}
interface ProyectoNotion {
  id: string; nombre: string; estado_lead: string; fecha: string;
  empresa_id: string | null; cotizacion_url: string | null;
  cliente_rollup: string; telefono_rollup: string; mail_rollup: string; ruc_rollup: string;
}
interface FormState {
  nombre: string; documento_identidad: string; razon_social: string;
  correo: string; telefono: string; notas: string; forma_pago: string;
}

const inp = "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#ffc500]/30 focus:border-[#ffc500] transition-all";
const labelCls = "block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5";

// ── Modal resultado con WhatsApp ──────────────────────────────────────────────
function ModalResultado({ url, numero, cliente, onClose, onNueva, usuario }: {
  url: string; numero: string; cliente: FormState; onClose: () => void; onNueva: () => void; usuario: string;
}) {
  const [copied, setCopied] = useState(false);
  const [bajando, setBajando] = useState(false);
  const tel = cliente.telefono.replace(/\D/g, '');
  const msg = encodeURIComponent(
    `Hola ${cliente.nombre}, le hacemos llegar la *Cotización COT-${numero}* de Idealo Films S.A.C.\n\n` +
    `Puede visualizarla aquí: ${url}\n\nQuedamos atentos ante cualquier consulta. 🎬`
  );

  // Descarga forzada: trae el PDF como blob y lo dispara con <a download>.
  // Cloudinary por defecto sirve los PDFs con Content-Disposition: inline,
  // por eso el navegador los abre. Acá los convertimos en blob local y
  // forzamos descarga.
  const descargarPDF = async () => {
    setBajando(true);
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `Cotizacion_${numero}_${cliente.nombre.replace(/\s+/g, '_').slice(0, 20)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      // Fallback si fetch falla (CORS u otro motivo): abre en pestaña nueva.
      window.open(url, '_blank');
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center"><Check size={16} className="text-green-600" /></div>
            <div><p className="text-sm font-bold text-gray-900">Cotización generada</p><p className="text-[10px] text-gray-400">COT-{numero}</p></div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs border border-gray-100">
            <div className="flex justify-between"><span className="text-gray-500">N° Cotización</span><span className="text-[#ffc500] font-bold font-mono">COT-{numero}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="text-gray-800 font-medium truncate max-w-[200px]">{cliente.nombre}</span></div>
            {cliente.documento_identidad && <div className="flex justify-between"><span className="text-gray-500">RUC / DNI</span><span className="text-gray-600 font-mono">{cliente.documento_identidad}</span></div>}
            {cliente.razon_social && <div className="flex justify-between"><span className="text-gray-500">Contacto</span><span className="text-gray-600">{cliente.razon_social}</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">Generado por</span><span className="text-gray-600 font-medium">{usuario}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Notion</span><span className="text-green-600 font-medium">✓ guardado</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#ffc500] hover:bg-[#e6b000] text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-sm">
              <ExternalLink size={13} /> Ver PDF
            </a>
            <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2.5 rounded-xl transition-all">
              {copied ? <><Check size={13} className="text-green-500" /> Copiado</> : <><Copy size={13} /> Copiar enlace</>}
            </button>
            <button onClick={descargarPDF} disabled={bajando}
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {bajando ? <><Loader2 size={13} className="animate-spin" /> Bajando...</> : <><FileDown size={13} /> Descargar</>}
            </button>
            {/* WhatsApp — siempre visible, con número si está disponible */}
            <a href={tel ? `https://wa.me/${tel}?text=${msg}` : `https://wa.me/?text=${msg}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-sm">
              {/* Ícono WhatsApp SVG */}
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>
          </div>
          <button onClick={onNueva} className="flex items-center gap-2 w-full justify-center text-gray-400 hover:text-gray-600 text-xs py-2 transition-colors">
            <RefreshCw size={12} /> Nueva cotización
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal actualizar datos cliente ────────────────────────────────────────────
function ModalActualizarCliente({ empresa, onSave, onClose }: {
  empresa: EmpresaNotion; onSave: (d: any) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    nombre_completo: empresa.nombre_empresa,
    persona_contacto: empresa.persona_contacto,
    tipo_doc: empresa.tipo_doc || 'DNI',
    num_doc: empresa.num_doc,
    ruc: empresa.ruc,
    telefono: empresa.telefono,
    email: empresa.email,
  });
  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [buscandoDni, setBuscandoDni] = useState(false);
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));
  const notify = useNotify();

  const buscarRuc = async () => {
    if (form.ruc.replace(/\D/g,'').length !== 11) return;
    setBuscandoRuc(true);
    try {
      const r = await fetch(`/api/consulta?tipo=ruc&numero=${form.ruc.replace(/\D/g,'')}`);
      const d = await r.json();
      if (d.ok && d.razon_social) {
        setForm(p => ({ ...p, nombre_completo: d.razon_social }));
      } else {
        notify.error(d.error || 'RUC no encontrado en SUNAT.');
      }
    } catch (e: any) {
      notify.error('Error consultando SUNAT: ' + e.message);
    } finally { setBuscandoRuc(false); }
  };

  const buscarDni = async () => {
    if (form.num_doc.replace(/\D/g,'').length !== 8) return;
    setBuscandoDni(true);
    try {
      const r = await fetch(`/api/consulta?tipo=dni&numero=${form.num_doc.replace(/\D/g,'')}`);
      const d = await r.json();
      if (d.ok && d.nombre_completo) {
        setForm(p => ({ ...p, persona_contacto: d.nombre_completo }));
      } else {
        notify.error(d.error || 'DNI no encontrado en RENIEC.');
      }
    } catch (e: any) {
      notify.error('Error consultando RENIEC: ' + e.message);
    } finally { setBuscandoDni(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <p className="font-bold text-gray-800">Actualizar datos del cliente</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Los cambios se guardarán en Notion Contactos</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
            <p className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider">Empresa</p>
          </div>
          <div><label className={labelCls}>Razón Social</label>
            <input type="text" value={form.nombre_completo} onChange={set('nombre_completo')} className={inp} /></div>
          <div><label className={labelCls}>RUC</label>
            <div className="flex gap-2">
              <input type="text" value={form.ruc} onChange={set('ruc')} maxLength={11} className={`${inp} flex-1`} />
              <button onClick={buscarRuc} disabled={buscandoRuc || form.ruc.replace(/\D/g,'').length !== 11}
                className="px-3 py-2.5 bg-[#ffc500] hover:bg-[#e6b000] disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm whitespace-nowrap">
                {buscandoRuc ? <Loader2 size={11} className="animate-spin" /> : null}
                Buscar
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Persona de contacto</p>
          </div>
          <div><label className={labelCls}>Nombre completo</label>
            <input type="text" value={form.persona_contacto} onChange={set('persona_contacto')} className={inp} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Tipo doc.</label>
              <Selector value={form.tipo_doc} onChange={set('tipo_doc')} className={inp}>
                <option>DNI</option><option>Carnet de Extranjería</option><option>Pasaporte</option>
              </Selector></div>
            <div><label className={labelCls}>N° documento</label>
              <div className="flex gap-1.5">
                <input type="text" value={form.num_doc} onChange={set('num_doc')} maxLength={12} className={`${inp} flex-1`} />
                {form.tipo_doc === 'DNI' && (
                  <button onClick={buscarDni} disabled={buscandoDni || form.num_doc.replace(/\D/g,'').length !== 8}
                    className="px-2 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-[10px] font-bold rounded-xl flex items-center gap-1 shadow-sm">
                    {buscandoDni ? <Loader2 size={10} className="animate-spin" /> : 'Buscar'}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div><label className={labelCls}>Teléfono</label><input type="tel" value={form.telefono} onChange={set('telefono')} className={inp} /></div>
          <div><label className={labelCls}>Correo</label><input type="email" value={form.email} onChange={set('email')} className={inp} /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => onSave({ ...form, id: empresa.id })}
              className="flex-1 py-2.5 rounded-xl bg-[#ffc500] text-white text-xs font-bold hover:bg-[#e6b000] shadow-sm">
              Guardar en Notion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal CRUD servicio ───────────────────────────────────────────────────────
function ModalServicio({ servicio, onSave, onClose }: { servicio?: Servicio | null; onSave: (s: any) => void; onClose: () => void; }) {
  const [form, setForm] = useState({ nombre: servicio?.nombre || '', descripcion: servicio?.descripcion || '', precio_con_igv: String(servicio?.precio_con_igv || servicio?.precio_base || '') });
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));
  const sinIgv = form.precio_con_igv ? (Number(form.precio_con_igv) / 1.18).toFixed(2) : '0.00';
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-3"><p className="font-bold text-gray-800">{servicio ? 'Editar servicio' : 'Nuevo servicio'}</p><button onClick={onClose}><X size={18} className="text-gray-300 hover:text-gray-600" /></button></div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-3">
          <p className="text-[10px] text-blue-700 leading-relaxed">Los cambios son <strong>solo para esta cotización</strong>. La base de datos de servicios no se modifica.</p>
        </div>
        <div className="space-y-3">
          {[['Nombre', 'nombre'], ['Descripción', 'descripcion']].map(([l, k]) => (<div key={k}><label className={labelCls}>{l}</label><input type="text" value={(form as any)[k]} onChange={set(k)} className={inp} /></div>))}
          <div><label className={labelCls}>Precio con IGV (S/)</label><input type="number" value={form.precio_con_igv} onChange={set('precio_con_igv')} className={inp} /></div>
          {form.precio_con_igv && <div className="bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-2.5 flex justify-between text-xs"><span className="text-gray-500">Sin IGV (calculado)</span><span className="font-bold text-[#ffc500]">S/ {sinIgv}</span></div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => onSave({ ...form, id: servicio?.id })} className="flex-1 py-2.5 rounded-xl bg-[#ffc500] text-white text-xs font-bold hover:bg-[#e6b000] shadow-sm">Aplicar a esta cotización</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal CRUD equipo ─────────────────────────────────────────────────────────
function ModalEquipo({ equipo, onSave, onClose }: { equipo?: Equipo | null; onSave: (e: any) => void; onClose: () => void; }) {
  const [nombre, setNombre] = useState(equipo?.nombre || '');
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-5"><p className="font-bold text-gray-800">{equipo ? 'Editar equipo' : 'Nuevo equipo'}</p><button onClick={onClose}><X size={18} className="text-gray-300 hover:text-gray-600" /></button></div>
        <label className={labelCls}>Nombre del equipo</label>
        <input autoFocus type="text" value={nombre} onChange={e => setNombre(e.target.value)} className={`${inp} mb-4`} />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
          <button onClick={() => onSave({ id: equipo?.id, nombre })} className="flex-1 py-2.5 rounded-xl bg-[#ffc500] text-white text-xs font-bold hover:bg-[#e6b000] shadow-sm">Guardar en Notion</button>
        </div>
      </div>
    </div>
  );
}

// ── Tarjeta de datos del cliente cargado ──────────────────────────────────────
function TarjetaCliente({ empresa, form, onActualizar, onLimpiar }: {
  empresa: EmpresaNotion | null; form: FormState;
  onActualizar: () => void; onLimpiar: () => void;
}) {
  // Mostramos cada campo tal cual viene de Notion, sin fallbacks ni duplicados.
  // Si un campo está vacío en Notion, simplemente no aparece esa fila.
  // La lógica de "si no hay RUC usa el DNI" vive SOLO en el PDF, no aquí.
  const campos = [
    { icon: Building2,  label: 'Razón social', value: empresa?.nombre_empresa },
    { icon: Hash,       label: 'RUC',          value: empresa?.ruc },
    { icon: User,       label: 'Contacto',     value: empresa?.persona_contacto },
    { icon: CreditCard, label: empresa?.tipo_doc || 'DNI', value: empresa?.num_doc },
    { icon: Phone,      label: 'Teléfono',     value: empresa?.telefono },
    { icon: Mail,       label: 'Correo',       value: empresa?.email },
  ].filter(c => c.value);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
          {empresa ? 'Datos desde Notion Contactos' : 'Datos ingresados'}
        </p>
        <div className="flex gap-1.5">
          {empresa && (
            <button onClick={onActualizar}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1.5 rounded-lg transition-all">
              <Edit2 size={10} /> Actualizar datos
            </button>
          )}
          <button onClick={onLimpiar}
            className="text-amber-400 hover:text-amber-600 p-1 rounded-lg hover:bg-amber-100 transition-all">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {campos.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon size={10} className="text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">{label}</p>
              <p className="text-xs text-gray-800 font-medium truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ num, title, sub, action }: { num: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-7 h-7 rounded-xl bg-[#ffc500]/10 flex items-center justify-center flex-shrink-0">
        <span className="text-[11px] font-bold text-[#ffc500]">{num}</span>
      </div>
      <div className="flex-1">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">{title}</h2>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function CotizacionForm() {
  const { data: session } = useSession();
  const usuarioNombre = session?.user?.name || 'Usuario';
  const searchParams = useSearchParams();

  // Prefill desde CRM vía query params
  const prefillNombre   = searchParams.get('nombre') || '';
  const prefillEmpresaId = searchParams.get('empresa_id') || '';
  const prefillEmpresaNombre = searchParams.get('empresa_nombre') || '';
  const prefillTelefono = searchParams.get('telefono') || '';
  const prefillMail     = searchParams.get('mail') || '';
  const prefillRuc      = searchParams.get('ruc') || '';
  const prefillDni      = searchParams.get('dni') || '';
  const prefillProyectoId = searchParams.get('proyecto_id') || '';

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [selectedServicios, setSelectedServicios] = useState<Servicio[]>([]);
  const [busqServicio, setBusqServicio] = useState('');
  const [selectedEquipos, setSelectedEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [generado, setGenerado] = useState<{ url: string; numero: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { toast, showToast, hideToast } = useToast();
  const confirmar = useConfirm();
  const unaVez = useUnaVez();

  const [modalServicio, setModalServicio] = useState<Servicio | null | 'nuevo'>(null);
  const [modalEquipo, setModalEquipo] = useState<Equipo | null | 'nuevo'>(null);
  const [modalActualizar, setModalActualizar] = useState(false);

  // Proyecto
  const [busqProyecto, setBusqProyecto] = useState('');
  const [resultadosProyecto, setResultadosProyecto] = useState<ProyectoNotion[]>([]);
  const [buscandoProyecto, setBuscandoProyecto] = useState(false);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<ProyectoNotion | null>(null);
  const [cargandoEmpresa, setCargandoEmpresa] = useState(false);
  const debProy = useRef<NodeJS.Timeout | null>(null);

  // Empresa
  const [busqEmpresa, setBusqEmpresa] = useState('');
  const [resultadosEmpresa, setResultadosEmpresa] = useState<EmpresaNotion[]>([]);
  const [buscandoEmpresa, setBuscandoEmpresa] = useState(false);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<EmpresaNotion | null>(null);
  const debEmp = useRef<NodeJS.Timeout | null>(null);

  const [form, setForm] = useState<FormState>({ nombre: '', documento_identidad: '', razon_social: '', correo: '', telefono: '', notas: '', forma_pago: 'Contado' });

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [rS, rE] = await Promise.all([fetch('/api/notion/servicios'), fetch('/api/notion/equipos')]);
      const [dS, dE] = await Promise.all([rS.json().catch(() => ({})), rE.json().catch(() => ({}))]);
      if (dS.error || dE.error || !rS.ok || !rE.ok) {
        showToast(`No se pudo cargar el catálogo desde Notion${dS.error || dE.error ? `: ${dS.error || dE.error}` : ''}`, 'error');
      }
      if (dS.servicios) setServicios(dS.servicios.map((s: any) => ({ ...s, cantidad: 1 })));
      if (dE.equipos) setEquipos(dE.equipos);
    } catch (e: any) { showToast(`Error: ${e.message}`, 'error'); }
    finally { setLoadingData(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  // Precargar empresa Y proyecto desde CRM si vienen query params
  useEffect(() => {
    if (!prefillEmpresaId && !prefillEmpresaNombre && !prefillProyectoId) return;
    if (prefillEmpresaId) {
      // Relleno provisional con lo que llega por URL, aplicando la misma regla
      // que rellenarDesdeEmpresa: razón social + RUC; si no hay, nombre de
      // contacto + DNI. Luego se reemplaza por la ficha completa de Notion.
      const contacto = prefillNombre !== prefillEmpresaNombre ? prefillNombre : '';
      rellenarDesdeEmpresa({
        id: prefillEmpresaId,
        nombre_empresa: prefillEmpresaNombre,
        persona_contacto: contacto,
        tipo_doc: prefillRuc ? 'RUC' : (prefillDni ? 'DNI' : ''),
        num_doc: prefillDni,
        ruc: prefillRuc,
        telefono: prefillTelefono,
        email: prefillMail,
      });
      setCargandoEmpresa(true);
      fetch(`/api/notion/proyectos?empresa_id=${encodeURIComponent(prefillEmpresaId)}`)
        .then(r => r.json())
        .then(d => {
          if (!d.empresa) return;
          rellenarDesdeEmpresa({
            id: d.empresa.id,
            nombre_empresa: d.empresa.nombre_empresa,
            persona_contacto: d.empresa.persona_contacto,
            email: d.empresa.email || prefillMail,
            telefono: d.empresa.telefono || prefillTelefono,
            ruc: d.empresa.ruc,
            tipo_doc: d.empresa.tipo_doc,
            num_doc: d.empresa.num_doc || prefillDni,
          });
        })
        .catch(() => { /* nos quedamos con los datos de la URL */ })
        .finally(() => setCargandoEmpresa(false));
    } else if (prefillEmpresaNombre || prefillNombre) {
      // Lead sin empresa enlazada: precargar solo los campos del formulario
      setForm(f => ({
        ...f,
        nombre: prefillEmpresaNombre || prefillNombre,
        razon_social: prefillNombre !== prefillEmpresaNombre ? prefillNombre : '',
        documento_identidad: prefillRuc || prefillDni,
        correo: prefillMail,
        telefono: prefillTelefono,
      }));
    }
    // Precargar proyecto si viene proyecto_id desde el CRM
    if (prefillProyectoId) {
      const proyectoNombre = new URLSearchParams(window.location.search).get('proyecto_nombre') || '';
      setProyectoSeleccionado({
        id: prefillProyectoId,
        nombre: proyectoNombre || prefillEmpresaNombre || 'Proyecto desde CRM',
        estado_lead: '',
        fecha: '',
        empresa_id: prefillEmpresaId || null,
        cotizacion_url: null,
        cliente_rollup: prefillEmpresaNombre || '',
        telefono_rollup: prefillTelefono,
        mail_rollup: prefillMail,
        ruc_rollup: prefillRuc,
      });
      if (proyectoNombre) setBusqProyecto(proyectoNombre);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce proyectos
  useEffect(() => {
    if (busqProyecto.length < 1) { setResultadosProyecto([]); return; }
    if (debProy.current) clearTimeout(debProy.current);
    debProy.current = setTimeout(async () => {
      setBuscandoProyecto(true);
      try { const r = await fetch(`/api/notion/proyectos?q=${encodeURIComponent(busqProyecto)}`); const d = await r.json(); setResultadosProyecto(d.proyectos || []); }
      catch { setResultadosProyecto([]); } finally { setBuscandoProyecto(false); }
    }, 400);
  }, [busqProyecto]);

  // Debounce empresas
  useEffect(() => {
    if (busqEmpresa.length < 2) { setResultadosEmpresa([]); return; }
    if (debEmp.current) clearTimeout(debEmp.current);
    debEmp.current = setTimeout(async () => {
      setBuscandoEmpresa(true);
      try {
        const r = await fetch(`/api/notion/clientes?q=${encodeURIComponent(busqEmpresa)}&estado=Activo`);
        const d = await r.json();
        setResultadosEmpresa((d.clientes || []).map((c: any) => ({
          id: c.id, nombre_empresa: c.nombre_completo, persona_contacto: c.persona_contacto,
          email: c.email, telefono: c.telefono, ruc: c.ruc, tipo_doc: c.tipo_doc, num_doc: c.num_doc,
        })));
      } catch { setResultadosEmpresa([]); } finally { setBuscandoEmpresa(false); }
    }, 400);
  }, [busqEmpresa]);

  const rellenarDesdeEmpresa = (e: EmpresaNotion) => {
    setEmpresaSeleccionada(e);
    setBusqEmpresa(e.nombre_empresa);
    setResultadosEmpresa([]);
    setForm(prev => ({
      ...prev,
      // Si no hay razón social (cliente persona natural), usar el nombre del representante
      nombre: e.nombre_empresa || e.persona_contacto || '',
      // Si no hay RUC, caer al DNI/documento del representante
      documento_identidad: e.ruc || e.num_doc || '',
      razon_social: e.persona_contacto || '',
      correo: e.email,
      telefono: e.telefono,
    }));
  };

  const seleccionarProyecto = async (p: ProyectoNotion) => {
    setProyectoSeleccionado(p); setBusqProyecto(p.nombre); setResultadosProyecto([]);
    if (p.empresa_id) {
      setCargandoEmpresa(true);
      try {
        const r = await fetch(`/api/notion/proyectos?empresa_id=${p.empresa_id}`);
        const d = await r.json();
        if (d.empresa) rellenarDesdeEmpresa({ id: d.empresa.id, nombre_empresa: d.empresa.nombre_empresa, persona_contacto: d.empresa.persona_contacto, email: d.empresa.email, telefono: d.empresa.telefono, ruc: d.empresa.ruc, tipo_doc: d.empresa.tipo_doc, num_doc: d.empresa.num_doc });
      } catch (e: any) { showToast(`Error: ${e.message}`, 'error'); }
      finally { setCargandoEmpresa(false); }
    } else if (p.cliente_rollup || p.mail_rollup) {
      setForm(prev => ({ ...prev, nombre: p.cliente_rollup || prev.nombre, correo: p.mail_rollup || prev.correo, telefono: p.telefono_rollup || prev.telefono }));
    }
  };

  const limpiarProyecto = () => { setProyectoSeleccionado(null); setBusqProyecto(''); limpiarEmpresa(); };
  const limpiarEmpresa = () => {
    setEmpresaSeleccionada(null); setBusqEmpresa('');
    setForm(p => ({ ...p, nombre: '', documento_identidad: '', razon_social: '', correo: '', telefono: '' }));
  };

  const actualizarEmpresaEnNotion = async (data: any) => {
    try {
      const r = await fetch(`/api/notion/clientes?id=${data.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const d = await r.json();
      if (d.error) { showToast(`Error: ${d.error}`, 'error'); return; }
      if (d.cliente) {
        rellenarDesdeEmpresa({ id: d.cliente.id, nombre_empresa: d.cliente.nombre_completo, persona_contacto: d.cliente.persona_contacto, email: d.cliente.email, telefono: d.cliente.telefono, ruc: d.cliente.ruc, tipo_doc: d.cliente.tipo_doc, num_doc: d.cliente.num_doc });
        showToast('Datos del cliente actualizados en Notion ✓', 'success');
        setModalActualizar(false);
      }
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  // CRUD servicios
  // Edición LOCAL de servicios (no escribe a Notion).
  // Las modificaciones que se hagan aquí viven solo en la memoria del
  // formulario: sirven para generar el PDF con valores ajustados, pero
  // al recargar/empezar otra cotización los servicios vuelven a verse
  // tal cual están en Notion. La BD oficial se edita desde "Servicios"
  // en la barra lateral.
  const handleSaveServicio = (data: any) => {
    const isEdit = data.id && typeof data.id === 'string';
    const precioConIgv = parseFloat(data.precio_con_igv) || 0;
    const precioBase = precioConIgv / 1.18;

    if (isEdit) {
      // Editar uno existente: solo en memoria de esta cotización
      const actualizado: Servicio = {
        ...(servicios.find(x => x.id === data.id) as Servicio),
        nombre: data.nombre,
        descripcion: data.descripcion,
        precio_base: precioBase,
        precio_con_igv: precioConIgv,
      };
      setServicios(prev => prev.map(x => x.id === data.id ? actualizado : x));
      // Si el servicio editado ya estaba seleccionado, refrescar en la selección
      setSelectedServicios(prev => prev.map(x => x.id === data.id ? { ...actualizado, cantidad: x.cantidad } : x));
      showToast('Servicio editado solo para esta cotización ✓', 'success');
    } else {
      // Crear uno nuevo temporal (solo en esta cotización).
      // ID negativo aleatorio para no chocar con IDs reales de Notion.
      const tempId = `local-${Date.now()}`;
      const nuevo: Servicio = {
        id: tempId as any,
        nombre: data.nombre,
        descripcion: data.descripcion,
        precio_base: precioBase,
        precio_con_igv: precioConIgv,
        categoria: 'Personalizado',
        cantidad: 1,
      };
      setServicios(prev => [...prev, nuevo]);
      showToast('Servicio creado solo para esta cotización ✓', 'success');
    }
    setModalServicio(null);
  };

  // CRUD equipos
  const handleSaveEquipo = async (data: any) => {
    try {
      const isEdit = data.id && typeof data.id === 'string';
      const r = await fetch(isEdit ? `/api/notion/equipos?id=${data.id}` : '/api/notion/equipos', { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const d = await r.json();
      if (d.error) { showToast(`Error: ${d.error}`, 'error'); return; }
      if (d.equipo) { setEquipos(prev => isEdit ? prev.map(x => x.id === data.id ? d.equipo : x) : [...prev, d.equipo]); showToast(isEdit ? 'Actualizado ✓' : 'Creado ✓', 'success'); }
    } catch (e: any) { showToast(e.message, 'error'); }
    setModalEquipo(null);
  };

  const handleDeleteEquipo = async (id: any) => {
    if (!(await confirmar({ titulo: '¿Eliminar este equipo?', mensaje: 'Se archivará en Notion.', confirmar: 'Eliminar', peligro: true }))) return;
    await fetch(`/api/notion/equipos?id=${id}`, { method: 'DELETE' });
    setEquipos(prev => prev.filter(e => e.id !== id));
    showToast('Equipo eliminado ✓', 'success');
  };

  const toggleServicio = (s: Servicio) => setSelectedServicios(prev => prev.find(x => x.id === s.id) ? prev.filter(x => x.id !== s.id) : [...prev, { ...s, cantidad: 1 }]);
  const updateCantidad = (id: any, d: number) => setSelectedServicios(prev => prev.map(s => s.id === id ? { ...s, cantidad: Math.max(1, s.cantidad + d) } : s));
  const toggleEquipo = (e: Equipo) => setSelectedEquipos(prev => prev.find(x => x.id === e.id) ? prev.filter(x => x.id !== e.id) : [...prev, e]);
  const toggleSection = (cat: string) => setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));

  const resetForm = () => {
    setForm({ nombre: '', documento_identidad: '', razon_social: '', correo: '', telefono: '', notas: '', forma_pago: 'Contado' });
    setSelectedServicios([]); setSelectedEquipos([]); setGenerado(null); setPaso(1); setFecha(hoyLima()); setMoneda('PEN');
    setPrevia(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    setEmpresaSeleccionada(null); setBusqEmpresa(''); setProyectoSeleccionado(null); setBusqProyecto('');
  };

  // Total CON IGV (priorizamos precio_con_igv del servicio si está disponible)
  const totalConIgv = selectedServicios.reduce(
    (acc, s) => acc + (s.precio_con_igv || s.precio_base * 1.18) * s.cantidad, 0
  );
  const total = totalConIgv / 1.18; // total sin IGV (referencia)

  const handleGenerar = () => unaVez('generar', generarCotizacion);
  const generarCotizacion = async () => {
    if (!form.nombre.trim()) { showToast('Ingresa el nombre del cliente.', 'error'); return; }
    if (selectedServicios.length === 0) { showToast('Selecciona al menos un servicio.', 'error'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/notion/cotizaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cuerpoCotizacion(),
          empresa_notion_id: empresaSeleccionada?.id || null,
          proyecto_notion_id: proyectoSeleccionado?.id || null,
          usuario: usuarioNombre, // ← nombre real del usuario logueado
        }),
      });
      const d = await r.json();
      if (d.success) { setGenerado({ url: d.url_pdf, numero: d.numero_cotizacion }); if (d.warning) showToast(d.warning, 'error'); else showToast(`¡COT-${d.numero_cotizacion} generada!`, 'success'); }
      else showToast(`Error: ${d.error}`, 'error');
    } catch (e: any) { showToast(`Error: ${e.message}`, 'error'); }
    finally { setLoading(false); }
  };

  const categorias = [...new Set(servicios.map(s => s.categoria))];
  // Búsqueda local de servicios (sin llamar a la API): filtra por nombre,
  // descripción o categoría sobre lo ya cargado en memoria.
  const busqServNorm = busqServicio.trim().toLowerCase();
  const serviciosFiltrados = busqServNorm
    ? servicios.filter(s =>
        s.nombre?.toLowerCase().includes(busqServNorm) ||
        s.descripcion?.toLowerCase().includes(busqServNorm) ||
        s.categoria?.toLowerCase().includes(busqServNorm)
      )
    : [];
  const clienteCargado = empresaSeleccionada || (form.nombre ? true : false);

  // ── Pasos, fecha, moneda y vista previa ────────────────────────────────────
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [fecha, setFecha] = useState<string>(hoyLima());
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [verPrevia, setVerPrevia] = useState(true);
  const [previa, setPrevia] = useState<{ url: string; numero: string } | null>(null);
  const [cargandoPrevia, setCargandoPrevia] = useState(false);
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const simbolo = moneda === 'USD' ? 'US$' : 'S/';
  const fmt = (n: number) => `${simbolo} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Cuerpo común para vista previa, borrador y generación
  const cuerpoCotizacion = () => ({
    // form.nombre = razón social/título del cliente; form.razon_social = persona de contacto
    cliente: {
      nombre: form.nombre,
      documento_identidad: form.documento_identidad,
      razon_social: form.razon_social,
      correo: form.correo,
      telefono: form.telefono,
      tipo_doc: empresaSeleccionada?.tipo_doc || '',
    },
    servicios: selectedServicios, equipos: selectedEquipos, notas: form.notas,
    forma_pago: form.forma_pago, fecha, moneda,
  });

  // Vista previa en vivo (mismo PDF que se generará), con un pequeño retardo
  useEffect(() => {
    if (!verPrevia || (!form.nombre && selectedServicios.length === 0)) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setCargandoPrevia(true);
      try {
        const r = await fetch('/api/notion/cotizaciones', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
          body: JSON.stringify({ ...cuerpoCotizacion(), modo: 'preview' }),
        });
        if (!r.ok) return;
        const url = URL.createObjectURL(await r.blob());
        setPrevia(prev => { if (prev) URL.revokeObjectURL(prev.url); return { url, numero: r.headers.get('X-Numero-Cotizacion') || '' }; });
      } catch { /* cancelada */ }
      finally { if (!ctrl.signal.aborted) setCargandoPrevia(false); }
    }, 900);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verPrevia, form, selectedServicios, selectedEquipos, fecha, moneda, empresaSeleccionada]);

  // Guardar borrador: descarga el PDF a este PC (no sube nada ni toca Notion)
  const guardarBorrador = async () => {
    if (!form.nombre.trim() && selectedServicios.length === 0) { showToast('Agrega un cliente o servicios para el borrador.', 'error'); return; }
    setGuardandoBorrador(true);
    try {
      const r = await fetch('/api/notion/cotizaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cuerpoCotizacion(), modo: 'borrador' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo crear el borrador');
      const numero = r.headers.get('X-Numero-Cotizacion') || 'borrador';
      const nombre = (form.nombre || 'cliente').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob());
      a.download = `BORRADOR-COT-${numero}-${nombre}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      showToast('Borrador guardado en tu PC', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setGuardandoBorrador(false); }
  };

  const pasoCompleto = { 1: !!form.nombre.trim(), 2: selectedServicios.length > 0, 3: true } as const;

  // Render de una tarjeta de servicio (reutilizado en modo categorías y en búsqueda)
  const renderServicio = (s: Servicio) => {
    const sel = selectedServicios.find(x => x.id === s.id);
    return (
      <div key={s.id} className={`group flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${sel ? 'border-amber-200 bg-amber-50/70 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/50'}`}>
        <div className="flex items-start gap-3 flex-1 min-w-0" onClick={() => toggleServicio(s)}>
          <div className={`mt-0.5 flex-shrink-0 ${sel ? 'text-[#ffc500]' : 'text-gray-200 group-hover:text-gray-300'}`}>{sel ? <CheckSquare size={15} /> : <Square size={15} />}</div>
          <div className="min-w-0"><p className={`text-sm font-semibold truncate ${sel ? 'text-gray-900' : 'text-gray-700'}`}>{s.nombre}</p><p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{s.descripcion}</p></div>
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          {sel && (<div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <button onClick={() => updateCantidad(s.id, -1)} className="w-6 h-6 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-yellow-100 hover:text-[#ffc500] transition-all"><Minus size={10} /></button>
            <span className="text-xs font-bold text-gray-700 w-4 text-center">{sel.cantidad}</span>
            <button onClick={() => updateCantidad(s.id, 1)} className="w-6 h-6 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-yellow-100 hover:text-[#ffc500] transition-all"><Plus size={10} /></button>
          </div>)}
          <div className="text-right min-w-[80px]" onClick={() => toggleServicio(s)}>
            <p className={`text-sm font-bold ${sel ? 'text-[#ffc500]' : 'text-gray-600'}`}>{formatCurrency(sel ? s.precio_base * sel.cantidad * 1.18 : (s.precio_con_igv || s.precio_base * 1.18))}</p>
            <p className="text-[10px] text-gray-400">{formatCurrency(sel ? s.precio_base * sel.cantidad : s.precio_base)} s/IGV</p>
          </div>
          <button onClick={e => { e.stopPropagation(); setModalServicio(s); }} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-[#ffc500] p-1 transition-all"><Edit2 size={12} /></button>
        </div>
      </div>
    );
  };

  if (loadingData) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-amber-200 border-t-[#ffc500] rounded-full animate-spin mx-auto" />
        <p className="text-xs text-gray-400 uppercase tracking-widest">Conectando con Notion...</p>
      </div>
    </div>
  );

  const PASOS = [
    { n: 1 as const, titulo: 'Cliente', sub: 'Proyecto y datos', icon: Building2 },
    { n: 2 as const, titulo: 'Servicios', sub: 'Servicios y equipos', icon: Briefcase },
    { n: 3 as const, titulo: 'Condiciones', sub: 'Fecha, moneda y pago', icon: ClipboardList },
  ];
  const tarjeta = 'bg-white rounded-2xl border border-gray-100 shadow-sm p-6';
  const puedeGenerar = !loading && !!form.nombre && selectedServicios.length > 0;

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {generado && <ModalResultado url={generado.url} numero={generado.numero} cliente={form} usuario={usuarioNombre} onClose={() => setGenerado(null)} onNueva={resetForm} />}
      {modalServicio !== null && <ModalServicio servicio={modalServicio === 'nuevo' ? null : modalServicio as Servicio} onSave={handleSaveServicio} onClose={() => setModalServicio(null)} />}
      {modalEquipo !== null && <ModalEquipo equipo={modalEquipo === 'nuevo' ? null : modalEquipo as Equipo} onSave={handleSaveEquipo} onClose={() => setModalEquipo(null)} />}
      {modalActualizar && empresaSeleccionada && <ModalActualizarCliente empresa={empresaSeleccionada} onSave={actualizarEmpresaEnNotion} onClose={() => setModalActualizar(false)} />}

      {/* Cabecera: pasos + acciones */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-2xl p-1 shadow-sm">
          {PASOS.map(({ n, titulo, icon: Icon }) => (
            <button key={n} onClick={() => setPaso(n)}
              className={`flex items-center gap-2 px-3.5 h-9 rounded-xl text-[13px] font-medium transition-all
                ${paso === n ? 'bg-[var(--acento)] text-[var(--acento-texto)] shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
              {pasoCompleto[n] && paso !== n ? <Check size={14} className="text-emerald-500" /> : <Icon size={14} />}
              <span>{n}. {titulo}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => setVerPrevia(v => !v)}
          className="flex items-center gap-2 h-9 px-3 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-gray-300">
          {verPrevia ? <EyeOff size={14} /> : <Eye size={14} />} {verPrevia ? 'Ocultar vista previa' : 'Ver vista previa'}
        </button>
        <button onClick={guardarBorrador} disabled={guardandoBorrador}
          className="flex items-center gap-2 h-9 px-4 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-50">
          {guardandoBorrador ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar borrador
        </button>
        <button onClick={handleGenerar} disabled={!puedeGenerar}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-[var(--acento)] hover:brightness-95 text-[var(--acento-texto)] text-xs font-bold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? <><Loader2 size={14} className="animate-spin" /> Generando…</> : <><FileDown size={14} /> Generar cotización</>}
        </button>
      </div>

      <div className={`grid grid-cols-1 gap-5 ${verPrevia ? '2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]' : 'xl:grid-cols-[minmax(0,1fr)_340px]'}`}>
        <div className="space-y-4 min-w-0">

          {/* ═══ PASO 1 · CLIENTE ═══ */}
          {paso === 1 && (<>
            {/* PROYECTO */}
            <div className={tarjeta}>
              <SectionHeader num="01" title="Proyecto Notion" sub="Vincula a un proyecto del CRM — autocompleta datos"
                action={proyectoSeleccionado ? <button onClick={limpiarProyecto} className="text-gray-300 hover:text-gray-500"><X size={14} /></button> : undefined} />
              {proyectoSeleccionado ? (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2"><Link2 size={12} className="text-[#ffc500]" /><p className="text-sm font-semibold text-gray-800">{proyectoSeleccionado.nombre}</p>{proyectoSeleccionado.cotizacion_url && <span className="ml-auto text-[9px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">ya cotizado</span>}</div>
                  <p className="text-[10px] text-gray-500 mt-1">Estado: {proyectoSeleccionado.estado_lead || '—'}{proyectoSeleccionado.fecha && ` · ${proyectoSeleccionado.fecha}`}</p>
                  {proyectoSeleccionado.cotizacion_url && (
                    <p className="text-[10.5px] text-amber-700 mt-1.5 leading-snug">
                      Este proyecto ya tiene cotización. La nueva quedará como <strong>principal</strong> y la anterior se guarda como versión:
                      podrás volver a elegirla desde el lead, Contabilidad o Producción.
                    </p>
                  )}
                  {cargandoEmpresa && <p className="text-[10px] text-[#ffc500] mt-1 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Cargando datos...</p>}
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input type="text" placeholder="Buscar en Proyectos 2026..." value={busqProyecto} onChange={e => setBusqProyecto(e.target.value)} className={`${inp} pl-9`} />
                    {buscandoProyecto && <Loader2 size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
                    {resultadosProyecto.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl z-20 shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                        {resultadosProyecto.map(p => (
                          <button key={p.id} onClick={() => seleccionarProyecto(p)} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                            <div className="flex items-center justify-between"><p className="text-sm text-gray-800 font-medium">{p.nombre}</p>{p.cotizacion_url && <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">ya cotizado</span>}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">{p.estado_lead || '—'}{p.fecha && ` · ${p.fecha}`}{p.cliente_rollup && ` · ${p.cliente_rollup}`}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">Opcional — deja vacío para crear proyecto nuevo</p>
                </div>
              )}
            </div>

            {/* EMPRESA / CLIENTE — precargado de Notion, editable para esta cotización */}
            <div className={tarjeta}>
              <SectionHeader num="02" title="Empresa / Cliente"
                sub={empresaSeleccionada ? 'Precargado desde Notion — puedes ajustarlo para esta cotización' : 'Busca en Contactos o ingresa manualmente'}
                action={empresaSeleccionada ? (
                  <div className="flex gap-1.5">
                    <button onClick={() => setModalActualizar(true)} title="Guardar cambios de la ficha en Notion"
                      className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg">
                      <Edit2 size={10} /> Actualizar en Notion
                    </button>
                    <button onClick={limpiarEmpresa} title="Quitar cliente" className="text-gray-300 hover:text-gray-500 p-1"><X size={14} /></button>
                  </div>
                ) : undefined} />

              {empresaSeleccionada ? (
                <div className="flex items-center gap-2 mb-4 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <Building2 size={13} className="text-amber-600" />
                  <p className="text-xs text-gray-700 truncate"><span className="font-semibold">{empresaSeleccionada.nombre_empresa || form.nombre}</span>{empresaSeleccionada.ruc && ` · RUC ${empresaSeleccionada.ruc}`}</p>
                  <span className="ml-auto text-[9px] font-bold text-amber-700 uppercase tracking-wider">Notion</span>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="relative">
                    <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input type="text" placeholder="Buscar empresa o contacto en Notion..." value={busqEmpresa}
                      onChange={e => setBusqEmpresa(e.target.value)} className={`${inp} pl-9`} />
                    {buscandoEmpresa && <Loader2 size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
                    {resultadosEmpresa.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl z-20 shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                        {resultadosEmpresa.map(e => (
                          <button key={e.id} onClick={() => rellenarDesdeEmpresa(e)} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                            <p className="text-sm text-gray-800 font-medium">{e.nombre_empresa || '(sin nombre)'}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{e.persona_contacto && `${e.persona_contacto} · `}{e.ruc && `RUC: ${e.ruc}`}{e.telefono && ` · ${e.telefono}`}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {busqEmpresa.length > 1 && !buscandoEmpresa && resultadosEmpresa.length === 0 && (
                    <p className="text-[10px] text-gray-400 mt-2">Sin resultados en Notion — ingresa manualmente</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={labelCls}>Razón Social / Nombre *</label><input type="text" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Empresa S.A.C." className={inp} /></div>
                <div><label className={labelCls}>RUC / DNI</label><input type="text" value={form.documento_identidad} onChange={e => setForm(p => ({ ...p, documento_identidad: e.target.value }))} placeholder="20123456789" className={inp} /></div>
                <div><label className={labelCls}>Persona de contacto</label><input type="text" value={form.razon_social} onChange={e => setForm(p => ({ ...p, razon_social: e.target.value }))} placeholder="Nombre del responsable" className={inp} /></div>
                <div><label className={labelCls}>Correo</label><input type="email" value={form.correo} onChange={e => setForm(p => ({ ...p, correo: e.target.value }))} placeholder="cliente@empresa.com" className={inp} /></div>
                <div><label className={labelCls}>Teléfono</label><input type="tel" value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} placeholder="+51 999 000 000" className={inp} /></div>
              </div>
            </div>
          </>)}

          {/* ═══ PASO 2 · SERVICIOS ═══ */}
          {paso === 2 && (<>
            <div className={tarjeta}>
              <SectionHeader num="03" title="Servicios" sub="Selecciona y ajusta cantidades"
                action={
                  <div className="flex items-center gap-2">
                    {selectedServicios.length > 0 && <span className="text-[10px] bg-yellow-50 text-[#ffc500] border border-yellow-200 px-2 py-0.5 rounded-full font-semibold">{selectedServicios.length} sel.</span>}
                    <button onClick={() => setModalServicio('nuevo')} className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-[#ffc500] border border-gray-200 hover:border-yellow-300 px-2 py-1 rounded-lg transition-all"><Plus size={11} /> Nuevo</button>
                  </div>
                } />
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={busqServicio} onChange={e => setBusqServicio(e.target.value)}
                  placeholder="Buscar servicio por nombre, descripción o categoría..." className={`${inp} w-full pl-9`} autoFocus />
                {busqServicio && (
                  <button onClick={() => setBusqServicio('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X size={14} /></button>
                )}
              </div>
              {busqServNorm ? (
                <div className="space-y-2">
                  {serviciosFiltrados.length === 0
                    ? <p className="text-center text-xs text-gray-400 py-6">Sin servicios que coincidan con “{busqServicio}”.</p>
                    : serviciosFiltrados.map(s => renderServicio(s))}
                </div>
              ) : selectedServicios.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Servicios elegidos</p>
                  {selectedServicios.map(s => renderServicio(servicios.find(x => x.id === s.id) || s))}
                </div>
              ) : (
                <div className="text-center py-10 px-4 border border-dashed border-gray-200 rounded-xl">
                  <Search size={20} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-xs text-gray-400">Escribe en el buscador para encontrar servicios.</p>
                  <p className="text-[10px] text-gray-300 mt-1">Por ejemplo: “edición”, “locución”, “fotografía”.</p>
                </div>
              )}
            </div>

            <div className={tarjeta}>
              <SectionHeader num="04" title="Equipos" sub="Opcional — se incluyen en el PDF"
                action={<button onClick={() => setModalEquipo('nuevo')} className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-[#ffc500] border border-gray-200 hover:border-yellow-300 px-2 py-1 rounded-lg transition-all"><Plus size={11} /> Nuevo</button>} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {equipos.map(eq => {
                  const sel = selectedEquipos.find(x => x.id === eq.id);
                  return (
                    <div key={eq.id} className={`group flex items-center gap-2 p-3 rounded-xl border transition-all ${sel ? 'border-amber-200 bg-amber-50/70' : 'border-gray-100 hover:border-gray-200'}`}>
                      <div onClick={() => toggleEquipo(eq)} className={`flex-shrink-0 cursor-pointer ${sel ? 'text-[#ffc500]' : 'text-gray-200 group-hover:text-gray-300'}`}>{sel ? <CheckSquare size={13} /> : <Square size={13} />}</div>
                      <p onClick={() => toggleEquipo(eq)} className={`text-xs flex-1 font-medium cursor-pointer ${sel ? 'text-gray-800' : 'text-gray-500'}`}>{eq.nombre}</p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => setModalEquipo(eq)} className="text-gray-300 hover:text-[#ffc500] p-1"><Edit2 size={11} /></button>
                        <button onClick={() => handleDeleteEquipo(eq.id)} className="text-gray-300 hover:text-red-400 p-1"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>)}

          {/* ═══ PASO 3 · CONDICIONES ═══ */}
          {paso === 3 && (<>
            <div className={tarjeta}>
              <SectionHeader num="05" title="Fecha y moneda" sub="La fecha de emisión parte de hoy; la validez es de 15 días" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}><CalendarDays size={11} className="inline -mt-0.5 mr-1" />Fecha de emisión</label>
                  <div className="flex gap-2">
                    <input type="date" value={fecha} onChange={e => setFecha(e.target.value || hoyLima())} className={inp} />
                    {fecha !== hoyLima() && (
                      <button onClick={() => setFecha(hoyLima())} className="px-3 rounded-xl border border-gray-200 text-[11px] font-semibold text-gray-500 hover:border-gray-300 whitespace-nowrap">Hoy</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className={labelCls}><Coins size={11} className="inline -mt-0.5 mr-1" />Moneda</label>
                  <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1">
                    {([['PEN', 'S/ Soles'], ['USD', 'US$ Dólares']] as const).map(([m, l]) => (
                      <button key={m} onClick={() => setMoneda(m)}
                        className={`h-9 rounded-lg text-[13px] font-semibold transition-all ${moneda === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{l}</button>
                    ))}
                  </div>
                  {moneda === 'USD' && <p className="text-[10px] text-amber-600 mt-1.5">Los precios del catálogo se muestran tal cual, con el símbolo US$.</p>}
                </div>
              </div>
            </div>

            <div className={tarjeta}>
              <SectionHeader num="06" title="Forma de pago" sub="Aparece en el PDF, en Métodos de pago" />
              <Selector value={form.forma_pago} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value }))} className={inp}>
                <option value="Contado">Contado</option>
                <optgroup label="Cheque">
                  <option value="Cheque a 15 días">Cheque a 15 días</option>
                  <option value="Cheque a 30 días">Cheque a 30 días</option>
                  <option value="Cheque a 60 días">Cheque a 60 días</option>
                </optgroup>
                <optgroup label="Factura">
                  <option value="Factura a 15 días">Factura a 15 días</option>
                  <option value="Factura a 30 días">Factura a 30 días</option>
                  <option value="Factura a 60 días">Factura a 60 días</option>
                  <option value="Factura a 180 días">Factura a 180 días</option>
                </optgroup>
              </Selector>
            </div>

            <div className={tarjeta}>
              <SectionHeader num="07" title="Notas adicionales" sub="Condiciones especiales, observaciones" />
              <textarea rows={3} value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} placeholder="Ej: Incluye 4 horas de grabación..." className={`${inp} resize-none`} />
            </div>
          </>)}

          {/* Navegación entre pasos */}
          <div className="flex items-center justify-between">
            <button onClick={() => setPaso(p => (p > 1 ? (p - 1) as 1 | 2 | 3 : p))} disabled={paso === 1}
              className="flex items-center gap-1.5 h-10 px-4 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 disabled:opacity-0">
              <ChevronLeft size={14} /> Anterior
            </button>
            {paso < 3 ? (
              <button onClick={() => setPaso(p => (p + 1) as 1 | 2 | 3)}
                className="flex items-center gap-1.5 h-10 px-5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-black">
                Siguiente: {PASOS[paso].titulo} <ChevronRight size={14} />
              </button>
            ) : (
              <button onClick={handleGenerar} disabled={!puedeGenerar}
                className="flex items-center gap-2 h-10 px-5 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-xs font-bold disabled:opacity-40">
                {loading ? <><Loader2 size={14} className="animate-spin" /> Generando…</> : <><FileDown size={14} /> Generar cotización</>}
              </button>
            )}
          </div>
        </div>

        {/* ═══ COLUMNA DERECHA: vista previa o resumen ═══ */}
        <div className="min-w-0">
          <div className="sticky top-4 space-y-4">
            {verPrevia && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 h-11 border-b border-gray-100">
                  <Eye size={14} className="text-[var(--acento)]" />
                  <p className="text-xs font-bold text-gray-700 flex-1">Vista previa {previa?.numero && <span className="text-gray-400 font-medium">· COT-{previa.numero}</span>}</p>
                  {cargandoPrevia && <Loader2 size={13} className="animate-spin text-gray-400" />}
                </div>
                {previa && (form.nombre || selectedServicios.length > 0) ? (
                  <iframe key={previa.url} src={`${previa.url}#toolbar=0&navpanes=0&view=FitH`} title="Vista previa de la cotización"
                    className="w-full h-[calc(100vh-230px)] min-h-[480px] bg-gray-100" />
                ) : (
                  <div className="h-[calc(100vh-230px)] min-h-[480px] grid place-items-center text-center px-8">
                    <div>
                      <FileDown size={28} className="mx-auto text-gray-200 mb-3" />
                      <p className="text-sm font-semibold text-gray-500">Aquí verás la cotización</p>
                      <p className="text-xs text-gray-400 mt-1">Elige el cliente y los servicios: el PDF se actualiza solo, con el mismo diseño de siempre.</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 h-11 border-t border-gray-100 text-xs">
                  <span className="text-gray-400">{selectedServicios.length} servicio{selectedServicios.length === 1 ? '' : 's'} · IGV incluido</span>
                  <span className="font-bold text-gray-900">{fmt(totalConIgv)}</span>
                </div>
              </div>
            )}

            {!verPrevia && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Resumen</h3>
                  <span className="text-[9px] text-gray-400 bg-gray-50 px-2 py-1 rounded-lg font-medium">Por: {usuarioNombre.split(' ')[0]}</span>
                </div>
                {form.nombre && <p className="text-sm font-bold text-gray-800 truncate mb-3">{form.nombre}</p>}
                {selectedServicios.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Sin servicios seleccionados</p>
                ) : (
                  <div className="space-y-2.5">
                    {selectedServicios.map(s => (
                      <div key={s.id} className="flex justify-between gap-2">
                        <div className="flex-1 min-w-0"><p className="text-xs font-medium text-gray-700">{s.nombre}</p>{s.cantidad > 1 && <p className="text-[10px] text-gray-400">× {s.cantidad}</p>}</div>
                        <p className="text-xs font-bold text-gray-800">{fmt((s.precio_con_igv || s.precio_base * 1.18) * s.cantidad)}</p>
                      </div>
                    ))}
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                      <div className="flex justify-between text-xs"><span className="text-gray-500">Subtotal (sin IGV)</span><span className="font-medium text-gray-700">{fmt(total)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-500">IGV 18%</span><span className="font-medium text-gray-700">{fmt(total * 0.18)}</span></div>
                      <div className="flex justify-between text-sm font-bold pt-1 border-t border-gray-100"><span className="text-gray-800">Total</span><span className="text-[var(--acento)] text-base">{fmt(totalConIgv)}</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="text-[10.5px] text-gray-400 leading-relaxed px-1">
              <strong className="text-gray-500">Guardar borrador</strong> descarga el PDF en tu PC sin subir nada.{' '}
              <strong className="text-gray-500">Generar</strong> lo sube a Cloudinary y lo registra en Notion como siempre.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

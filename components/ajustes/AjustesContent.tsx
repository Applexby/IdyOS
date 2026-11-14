'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Users, Shield, Key, Copy, CheckCheck,
  Lock, Eye, EyeOff, Target, Edit2, Save, X,
  RefreshCw, CalendarClock, AlertTriangle, Plus,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Selector from '@/components/ui/Selector';

// Lista de usuarios del sistema (sin hashes — solo info pública)
const USUARIOS_SISTEMA = [
  { nombre: 'Isai Manzanares',   email: 'isai.manzanares@idealofilms.com',   rol: 'admin' },
  { nombre: 'Administración',    email: 'administracion@idealofilms.com',     rol: 'admin' },
  { nombre: 'Rebeca Acosta',     email: 'rebeca.acosta@idealofilms.com',      rol: 'user' },
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── Sección: Usuarios del sistema ────────────────────────────────────────────
function SeccionUsuarios() {
  const iniciales = (n: string) => n.split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
        <Users size={15} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800">Usuarios del sistema</h3>
        <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
          {USUARIOS_SISTEMA.length} usuarios
        </span>
      </div>
      <div className="divide-y divide-gray-50">
        {USUARIOS_SISTEMA.map(u => (
          <div key={u.email} className="flex items-center gap-3 px-5 py-3.5">
            <div className="w-9 h-9 rounded-xl bg-[#ffc500]/15 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-[#ffc500]">{iniciales(u.nombre)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{u.nombre}</p>
              <p className="text-xs text-gray-400 truncate">{u.email}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0
              ${u.rol === 'admin'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-100 text-gray-500'}`}>
              <Shield size={9} className="inline mr-0.5" />
              {u.rol === 'admin' ? 'Admin' : 'Usuario'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sección: Generador de hash ────────────────────────────────────────────────
function SeccionHash() {
  const [usuario, setUsuario]   = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [hash, setHash]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [copied, setCopied]     = useState(false);
  const [error, setError]       = useState('');

  async function generar() {
    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/usuario/hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.hash) setHash(data.hash);
    } catch { setError('Error generando hash'); }
    finally { setLoading(false); }
  }

  function copiar() {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
        <Key size={15} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800">Cambiar contraseña de usuario</h3>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          💡 Genera el hash de la nueva contraseña, cópialo y actualiza la variable en{' '}
          <a href="https://vercel.com" target="_blank" className="font-semibold text-amber-700 hover:underline">
            Vercel → Environment Variables → lib/auth.ts
          </a>
        </p>

        {/* Selector de usuario */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Usuario</label>
          <Selector
            value={usuario}
            onChange={e => setUsuario(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffc500] bg-white text-gray-700"
          >
            <option value="">Selecciona un usuario</option>
            {USUARIOS_SISTEMA.map(u => (
              <option key={u.email} value={u.email}>{u.nombre} — {u.email}</option>
            ))}
          </Selector>
        </div>

        {/* Nueva contraseña */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nueva contraseña</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setHash(''); setError(''); }}
              placeholder="Mínimo 6 caracteres"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 pr-10 focus:outline-none focus:border-[#ffc500]"
            />
            <button onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        <button
          onClick={generar}
          disabled={loading || !password || !usuario}
          className="w-full bg-[#ffc500] hover:bg-[#e6b000] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Lock size={14} />
          {loading ? 'Generando...' : 'Generar hash'}
        </button>

        {/* Resultado */}
        {hash && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600">Hash generado para <strong>{usuario}</strong>:</p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
              <code className="text-xs text-gray-700 flex-1 break-all font-mono">{hash}</code>
              <button onClick={copiar} className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors">
                {copied ? <CheckCheck size={15} className="text-green-500" /> : <Copy size={15} />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Copia este hash y reemplázalo en <code className="bg-gray-100 px-1 rounded">lib/auth.ts</code> en el array USUARIOS, en el campo <code className="bg-gray-100 px-1 rounded">hash</code> del usuario <strong>{USUARIOS_SISTEMA.find(u=>u.email===usuario)?.nombre}</strong>. Luego haz push a GitHub para que Vercel redespliegue.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sección: Metas mensuales ─────────────────────────────────────────────────
function SeccionMetas() {
  const [metas, setMetas]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor]       = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    fetch(`/api/notion/metas?ano=${new Date().getFullYear()}`)
      .then(r => r.json())
      .then(d => { if (d.metas) setMetas(d.metas); })
      .finally(() => setLoading(false));
  }, []);

  async function guardar(meta: any) {
    setSaving(true);
    try {
      await fetch('/api/notion/metas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: meta.id, meta_mensual: Number(valor) }),
      });
      setMetas(prev => prev.map(m => m.id === meta.id ? { ...m, meta_mensual: Number(valor) } : m));
      setEditando(null);
      setValor('');
    } finally { setSaving(false); }
  }

  const totalAnual = metas.reduce((a, m) => a + (m.meta_mensual || 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
        <Target size={15} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800">Metas mensuales {new Date().getFullYear()}</h3>
        {totalAnual > 0 && (
          <span className="ml-auto text-xs text-gray-500">
            Total anual: <strong className="text-gray-800">{formatCurrency(totalAnual)}</strong>
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {metas.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3">
              <span className="text-xs font-semibold text-gray-400 w-24">{MESES[i]}</span>
              {editando === m.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">S/</span>
                    <input
                      type="number"
                      value={valor}
                      onChange={e => setValor(e.target.value)}
                      placeholder="0"
                      autoFocus
                      className="w-full text-sm border border-[#ffc500] rounded-xl pl-8 pr-3 py-1.5 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => guardar(m)}
                    disabled={saving}
                    className="p-1.5 bg-[#ffc500] text-white rounded-lg hover:bg-[#e6b000] transition-colors"
                  >
                    <Save size={13} />
                  </button>
                  <button
                    onClick={() => { setEditando(null); setValor(''); }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <>
                  <span className={`flex-1 text-sm font-semibold ${m.meta_mensual > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                    {m.meta_mensual > 0 ? formatCurrency(m.meta_mensual) : 'Sin definir'}
                  </span>
                  <button
                    onClick={() => { setEditando(m.id); setValor(m.meta_mensual > 0 ? String(m.meta_mensual) : ''); }}
                    className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sección: Calibración de cadencia (uso único) ────────────────────────────
function SeccionCalibracion() {
  const [estado, setEstado] = useState<'idle' | 'simulando' | 'aplicando' | 'listo'>('idle');
  const [resultado, setResultado] = useState<any | null>(null);
  const [error, setError] = useState('');

  async function ejecutar(dryRun: boolean) {
    setError('');
    setEstado(dryRun ? 'simulando' : 'aplicando');
    try {
      const res = await fetch('/api/notion/pipeline/calibrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al calibrar'); setEstado('idle'); return; }
      setResultado(data);
      setEstado('listo');
    } catch (e: any) {
      setError(e.message || 'Error de red');
      setEstado('idle');
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock size={18} className="text-[#ffc500]" />
        <h2 className="text-lg font-bold text-gray-900">Calibrar cadencia de seguimiento</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Uso único. Calcula el próximo hito (3/7/14/30 días) de cada lead activo según su
        fecha de contacto y rellena «Próximo seguimiento». Útil para encarrilar los leads
        antiguos. No toca leads ganados ni perdidos.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => ejecutar(true)} disabled={estado === 'simulando' || estado === 'aplicando'}
          className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <Eye size={14} /> {estado === 'simulando' ? 'Simulando…' : 'Simular (no escribe)'}
        </button>
        <button onClick={() => ejecutar(false)} disabled={estado === 'simulando' || estado === 'aplicando'}
          className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-[#ffc500] text-white hover:bg-[#e6b200] transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={estado === 'aplicando' ? 'animate-spin' : ''} />
          {estado === 'aplicando' ? 'Aplicando…' : 'Aplicar calibración'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {resultado && (
        <div className="space-y-3 text-sm">
          <div className={`p-3 rounded-xl ${resultado.dry_run ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
            {resultado.dry_run ? 'Simulación: ' : '✓ Aplicado: '}
            {resultado.actualizados} lead{resultado.actualizados !== 1 ? 's' : ''} {resultado.dry_run ? 'se actualizarían' : 'actualizados'}
            {' '}de {resultado.total_activos} activos.
          </div>

          {resultado.agotados_mas_30_dias?.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="font-semibold text-amber-700 flex items-center gap-1 mb-1.5">
                <AlertTriangle size={14} /> {resultado.agotados_mas_30_dias.length} lead(s) pasaron el día 30 — revísalos
              </p>
              <ul className="space-y-1">
                {resultado.agotados_mas_30_dias.map((l: any) => (
                  <li key={l.id} className="text-xs text-amber-800">
                    <a href={l.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {l.nombre} — {l.dias} días
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resultado.sin_fecha_contacto?.length > 0 && (
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
              <p className="font-semibold text-gray-600 mb-1">
                {resultado.sin_fecha_contacto.length} lead(s) sin fecha de contacto (no calibrados)
              </p>
              <ul className="space-y-1">
                {resultado.sin_fecha_contacto.map((l: any) => (
                  <li key={l.id} className="text-xs text-gray-500">{l.nombre}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sección: Motivos de pérdida ──────────────────────────────────────────────
function SeccionMotivos() {
  const [motivos, setMotivos] = useState<{ name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const r = await fetch('/api/notion/motivos');
      const d = await r.json();
      setMotivos(d.motivos || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, []);

  async function agregar() {
    if (!nuevo.trim() || busy) return;
    setBusy(true);
    try {
      await fetch('/api/notion/motivos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nuevo.trim() }) });
      setNuevo(''); await cargar();
    } finally { setBusy(false); }
  }
  async function renombrar(oldName: string) {
    if (!editName.trim() || busy) return;
    setBusy(true);
    try {
      await fetch('/api/notion/motivos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldName, newName: editName.trim() }) });
      setEditando(null); setEditName(''); await cargar();
    } finally { setBusy(false); }
  }
  async function eliminar(name: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/notion/motivos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      await cargar();
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={18} className="text-[#ffc500]" />
        <h2 className="text-lg font-bold text-gray-900">Motivos de pérdida</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Gestiona las opciones del selector de motivo cuando un lead se marca como perdido.
        Al renombrar uno, se actualiza en todos los leads que lo usan.
      </p>

      <div className="flex gap-2 mb-4">
        <input value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregar()}
          placeholder="Nuevo motivo..."
          className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] focus:ring-2 focus:ring-yellow-100" />
        <button onClick={agregar} disabled={busy || !nuevo.trim()}
          className="flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-xl bg-[#ffc500] hover:bg-[#e6b000] text-gray-900 transition-colors disabled:opacity-50">
          <Plus size={15} /> Añadir
        </button>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center"><div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-1.5">
          {motivos.length === 0 && <p className="text-sm text-gray-400 italic">Sin motivos aún.</p>}
          {motivos.map(m => (
            <div key={m.name} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              {editando === m.name ? (
                <>
                  <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                    onKeyDown={e => e.key === 'Enter' && renombrar(m.name)}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#ffc500]" />
                  <button onClick={() => renombrar(m.name)} disabled={busy} className="text-emerald-600 hover:text-emerald-700 p-1"><Save size={14} /></button>
                  <button onClick={() => { setEditando(null); setEditName(''); }} className="text-gray-400 hover:text-gray-600 p-1"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-700">{m.name}</span>
                  <button onClick={() => { setEditando(m.name); setEditName(m.name); }} className="text-gray-300 hover:text-[#ffc500] p-1 transition-colors"><Edit2 size={13} /></button>
                  <button onClick={() => eliminar(m.name)} disabled={busy} className="text-gray-300 hover:text-rose-500 p-1 transition-colors"><X size={14} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AjustesContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === 'admin';

  useEffect(() => {
    if (session && !isAdmin) router.replace('/dashboard');
  }, [session, isAdmin, router]);

  if (!isAdmin) return null;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ajustes</h1>
        <p className="text-sm text-gray-500 mt-0.5">Administración del sistema — solo acceso para admins</p>
      </div>

      <SeccionUsuarios />
      <SeccionHash />
      <SeccionMetas />
      <SeccionMotivos />
    </div>
  );
}

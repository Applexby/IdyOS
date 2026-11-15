'use client';
// Formulario para crear un lead desde el chat abierto. Viene rellenado con lo
// leído del chat (nombre, publicación de Marketplace, primer mensaje) y TODO
// se puede editar antes de guardar.
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2, X, UserPlus, Sparkles } from 'lucide-react';
import type { ChatLeido, CanalMensajes } from '@/lib/desktop';
import { hoyLima, nombreDesdeEmail } from '@/lib/utils';
import { mismaPersona } from '@/lib/equipo';

const inp = 'w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[var(--acento)] focus:ring-2 focus:ring-[var(--acento-suave)]';
const lbl = 'block text-[11px] font-semibold text-gray-500 mb-1';

export default function LeadDesdeChat({ chat, canal, onClose, onCreado }: {
  chat: ChatLeido | null; canal: CanalMensajes; onClose: () => void; onCreado: () => void;
}) {
  const { data: session } = useSession();
  const esIG = canal === 'instagram';
  const esMarketplace = !esIG && (!!chat?.publicacion || /marketplace/i.test((chat?.lineas || []).join(' ')));
  const [f, setF] = useState({
    nombre: chat?.nombre || '',
    telefono: '',
    // "Marketplace · Video corporativo · S/ 1,500" → "Video corporativo"
    proyecto: (esIG ? '' : chat?.publicacion || '')
      .replace(/^\s*marketplace\s*[·•|-]\s*/i, '')
      .replace(/\s*[·•|-]\s*(S\/|US\$|\$|PEN|USD)\s*[\d.,]+.*$/i, '')
      .trim(),
    canal: canal === 'instagram' ? 'Instagram' : (esMarketplace ? 'Facebook' : 'Messenger'),
    notas: [
      `Llegó por ${canal === 'instagram' ? 'Instagram' : esMarketplace ? 'Facebook Marketplace' : 'Messenger'}.`,
      !esIG && chat?.publicacion ? `Publicación: ${chat.publicacion}` : '',
      chat?.mensajes?.[0] ? `Mensaje: ${chat.mensajes[0]}` : '',
    ].filter(Boolean).join('\n'),
  });
  const [atendido, setAtendido] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // "Atendido por": la persona que está creando el lead
  useEffect(() => {
    fetch('/api/notion/usuarios').then(r => r.json()).then(d => {
      const corto = nombreDesdeEmail(session?.user?.email);
      const u = (d.usuarios || []).find((x: any) => mismaPersona(x.name, session?.user?.name) || mismaPersona(x.name, corto));
      if (u) setAtendido(u.name);
    }).catch(() => {});
  }, [session]);

  const set = (k: keyof typeof f) => (e: any) => setF(p => ({ ...p, [k]: e.target.value }));
  const sugerencias = [...new Set([...(chat?.lineas || []), ...(chat?.mensajes || [])])].filter(t => t && t !== f.nombre).slice(0, 10);

  async function guardar() {
    if (!f.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setGuardando(true); setError('');
    try {
      const rc = await fetch('/api/notion/clientes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_completo: f.nombre.trim(), persona_contacto: f.nombre.trim(), telefono: f.telefono, tipo: 'LEAD', estado: 'Activo' }),
      });
      const dc = await rc.json();
      if (dc.error) throw new Error(`Cliente: ${dc.error}`);
      const rl = await fetch('/api/notion/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proyecto: f.proyecto.trim() || `Consulta de ${f.nombre.trim()}`,
          empresa_id: dc.cliente?.id || null,
          estado_lead: 'NUEVO LEAD',
          fecha_contactado: hoyLima(),
          notas: f.notas || undefined,
          canal: f.canal,
          origen: 'Orgánico',
          atendido_por: atendido || undefined,
        }),
      });
      const dl = await rl.json().catch(() => ({}));
      if (!rl.ok) throw new Error(dl.error || 'No se pudo crear el lead');
      onCreado();
    } catch (e: any) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-100 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 h-14 border-b border-gray-100">
          <UserPlus size={16} className="text-[var(--acento)]" />
          <h3 className="flex-1 text-[15px] font-semibold text-gray-900">Crear lead desde el chat</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3.5">
          {!chat?.nombre && (
            <p className="text-[12px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2">No pude leer el nombre del chat. Escríbelo abajo (abre primero la conversación en la izquierda).</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={lbl}>Nombre del cliente *</label><input className={inp} value={f.nombre} onChange={set('nombre')} /></div>
            <div><label className={lbl}>Teléfono (opcional)</label><input className={inp} value={f.telefono} onChange={set('telefono')} placeholder="+51 9…" /></div>
            <div><label className={lbl}>Canal</label>
              <select className={inp} value={f.canal} onChange={set('canal')}>
                <option value="Facebook">Facebook (Marketplace)</option><option value="Messenger">Messenger</option><option value="Instagram">Instagram</option>
              </select>
            </div>
            <div className="col-span-2"><label className={lbl}>Proyecto / servicio de interés</label><input className={inp} value={f.proyecto} onChange={set('proyecto')} placeholder={esIG ? '¿Qué servicio le interesa? Ej: Video corporativo' : 'Ej: Video corporativo'} /></div>
            <div className="col-span-2"><label className={lbl}>Descripción</label><textarea rows={4} className={`${inp} resize-none`} value={f.notas} onChange={set('notas')} /></div>
          </div>
          {sugerencias.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1"><Sparkles size={11} /> Del chat (clic para añadir a la descripción)</p>
              <div className="flex flex-wrap gap-1.5">
                {sugerencias.map(t => (
                  <button key={t} onClick={() => setF(p => ({ ...p, notas: (p.notas ? p.notas + '\n' : '') + t }))}
                    className="text-[11.5px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 max-w-full truncate hover:border-[var(--acento)]">{t}</button>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-gray-400">Se crea como cliente y como lead "Nuevo" en el CRM{atendido ? `, atendido por ${atendido}` : ''}.</p>
          {error && <p className="text-[12.5px] text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">Cancelar</button>
            <button onClick={guardar} disabled={guardando}
              className="px-4 py-2 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Crear lead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

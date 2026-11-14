'use client';

import { useState, useEffect } from 'react';
import { X, MessageCircle, Copy, CheckCheck, ChevronDown, Send, Clock } from 'lucide-react';
import type { Lead, EstadoLead, AccionSeguimiento } from '@/types/crm';
import { etapaDe } from '@/types/crm';
import { diasDesde } from '@/lib/utils';

interface Props {
  lead: Lead;
  userName: string;
  onClose: () => void;
  onAccion: (leadId: string, accion: AccionSeguimiento, extra?: any) => Promise<void>;
}

// Seleccionar plantilla según estado del lead
function plantillaPorEstado(estado: string, nombreCliente: string, nombreUsuario: string): string {
  const nombre = nombreCliente || 'cliente';
  const usuario = nombreUsuario.split(' ')[0];
  switch (estado) {
    case 'NUEVO LEAD':
    case 'CONTACTADO':
      return `Hola ${nombre}, soy ${usuario} de Idealo Films 🎬\n\nVi que tienes interés en nuestros servicios audiovisuales. Me da gusto contactarte.\n\n¿Tienes unos minutos para contarme sobre el proyecto que tienes en mente? Con gusto te preparo una propuesta 💪`;
    case 'SEGUIMIENTO':
    case 'SEGUIMIENTO DIA 3':
      return `Hola ${nombre} 👋\n\nSolo quería saber si tuviste oportunidad de revisar nuestra propuesta. Estoy disponible para resolver cualquier duda que tengas 😊`;
    case 'SEGUIMIENTO DIA 7':
      return `Hola ${nombre} 🙌\n\nPasé a saludarte nuevamente. ¿Pudiste revisar la cotización que te enviamos?\n\nSi necesitas algún ajuste en el servicio o el precio, con gusto lo conversamos.`;
    case 'SEGUIMIENTO DIA 14':
      return `Hola ${nombre}, espero que estés bien 😊\n\nHace unos días te compartimos nuestra propuesta y quería saber si hay algo en lo que podamos ayudarte o aclarar. Estamos aquí para lo que necesites.`;
    case 'SEGUIMIENTO DIA 30':
      return `Hola ${nombre}, ¿cómo va todo? 👋\n\nEs nuestro último intento de contacto antes de cerrar este expediente. Si en algún momento necesitas producción audiovisual, estamos aquí.\n\nQueda abierto el canal, ¡mucho éxito!`;
    case 'COTIZACION ENVIADA':
      return `Hola ${nombre} 😊\n\nTe escribo para hacer seguimiento sobre la cotización que te enviamos. ¿Pudiste revisarla?\n\nSi tienes alguna pregunta o necesitas ajustes, con gusto lo atendemos 🙌`;
    case 'Negociacion':
      return `Hola ${nombre} 👋\n\nQuería seguir con nuestra conversación. ¿Llegaste a evaluar nuestra propuesta?\n\nEstamos dispuestos a encontrar la mejor opción para tu proyecto 💪`;
    default:
      return `Hola ${nombre}, soy ${usuario} de Idealo Films. Quería hacerle seguimiento sobre su consulta. ¿Tiene unos minutos?`;
  }
}

const MOTIVOS_PERDIDA = ['Cotización rechazada por fuera de presupuesto', 'No firmo contrato', 'No respondio mensajes de seguimiento', 'No podia añadir personal al evento', 'Respuesta a ultimo momento', 'Sin respuesta'];
const ESTADOS_RESPONDIO: EstadoLead[] = ['SEGUIMIENTO', 'COTIZACION ENVIADA', 'Negociacion'];

export default function PanelSeguimiento({ lead, userName, onClose, onAccion }: Props) {
  const [copied, setCopied]               = useState(false);
  const [loading, setLoading]             = useState(false);
  const [fase, setFase]                   = useState<'main' | 'respondio' | 'perdido'>('main');
  const [nota, setNota]                   = useState('');
  const [motivoPerdida, setMotivoPerdida] = useState('');

  const mensaje = plantillaPorEstado(lead.estado_lead, lead.empresa || lead.cliente || lead.proyecto, userName);
  const numLimpio = lead.telefono?.replace(/\D/g, '') || '';
  const numWA = numLimpio.startsWith('51') ? numLimpio : numLimpio ? '51' + numLimpio : '';

  const [marcadoEnviado, setMarcadoEnviado] = useState(false);

  // Marca manual: el usuario decide cuándo dar por hecho el contacto del día.
  // Copiar/WhatsApp ya NO marcan solos (evita confusión si se pulsa varias veces).
  async function marcarHecho() {
    if (marcadoEnviado) return;
    setMarcadoEnviado(true);
    try { await onAccion(lead.id, 'mensaje_enviado', { nota: nota || undefined }); }
    catch { setMarcadoEnviado(false); }
  }

  function copiar() {
    navigator.clipboard.writeText(mensaje);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }

  function openWA() {
    window.open(`https://wa.me/${numWA}?text=${encodeURIComponent(mensaje)}`, '_blank');
  }

  async function handleAccion(accion: AccionSeguimiento, extra?: any) {
    setLoading(true);
    try {
      await onAccion(lead.id, accion, { ...extra, nota: nota || undefined });
      onClose();
    } finally { setLoading(false); }
  }

  const diasSinContacto = diasDesde(lead.fecha_ultimo_contacto || lead.fecha_contactado);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                {etapaDe(lead.estado_lead)}
              </span>
              {diasSinContacto !== null && (
                <span className={`text-[11px] font-medium flex items-center gap-1
                  ${diasSinContacto >= 5 ? 'text-red-500' : diasSinContacto >= 2 ? 'text-amber-500' : 'text-gray-400'}`}>
                  <Clock size={10} /> {diasSinContacto === 0 ? 'Hoy' : `${diasSinContacto}d`}
                </span>
              )}
            </div>
            <p className="text-base font-bold text-gray-900 truncate">{lead.proyecto}</p>
            <p className="text-xs text-gray-500">{lead.empresa || lead.cliente || '—'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors mt-1">
            <X size={18} />
          </button>
        </div>

        {fase === 'main' && (
          <div className="p-5 space-y-4">
            {/* Mensaje sugerido */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Mensaje sugerido</p>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {mensaje}
              </div>
            </div>

            {/* Nota opcional */}
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Nota interna opcional..."
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffc500] resize-none text-gray-700 placeholder-gray-300"
            />

            {/* Botones de envío */}
            <div className="flex gap-2">
              <button onClick={copiar}
                className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl border transition-all
                  ${copied ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-transparent'}`}>
                {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              {numWA && (
                <button onClick={openWA}
                  className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-colors">
                  <MessageCircle size={14} /> WhatsApp
                </button>
              )}
            </div>

            {/* Marca manual del contacto del día (el usuario decide cuándo) */}
            <button onClick={marcarHecho} disabled={marcadoEnviado}
              className={`w-full flex items-center justify-center gap-2 text-sm font-bold py-2.5 rounded-xl border transition-all
                ${marcadoEnviado
                  ? 'bg-green-50 text-green-700 border-green-200 cursor-default'
                  : 'bg-[#ffc500]/10 text-[#a07c00] border-[#ffc500]/40 hover:bg-[#ffc500]/20'}`}>
              <CheckCheck size={15} />
              {marcadoEnviado ? 'Contactado hoy ✓ (reaparecerá mañana)' : 'Marcar como contactado hoy'}
            </button>

            {marcadoEnviado && (
              <p className="text-[11px] text-gray-500 px-1">
                Este lead sale de tu lista de hoy. Mañana reaparece para registrar si respondió o no.
              </p>
            )}

            <div className="h-px bg-gray-100" />

            {/* Acciones de seguimiento */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">¿Qué pasó?</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setFase('respondio')} disabled={loading}
                  className="flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
                  ✅ Respondió
                </button>
                <button onClick={() => handleAccion('no_respondio')} disabled={loading}
                  className="flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
                  {loading ? '...' : '⏳ No respondió'}
                </button>
                <button onClick={() => handleAccion('cotizacion_enviada')} disabled={loading}
                  className="flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors">
                  📄 Cotización
                </button>
                <button onClick={() => handleAccion('ganado')} disabled={loading}
                  className="flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl bg-[#ffc500] text-white hover:bg-[#e6b000] transition-colors">
                  🎉 Ganado
                </button>
              </div>
              <button onClick={() => setFase('perdido')} disabled={loading}
                className="w-full mt-2 text-xs text-red-400 hover:text-red-600 py-1.5 border border-dashed border-red-200 rounded-xl transition-colors">
                ❌ Marcar como perdido
              </button>
            </div>
          </div>
        )}

        {/* Fase: respondió → elegir estado */}
        {fase === 'respondio' && (
          <div className="p-5 space-y-3">
            <p className="text-sm font-bold text-gray-800">¡Respondió! ¿A qué estado pasa?</p>
            <div className="space-y-1.5">
              {ESTADOS_RESPONDIO.map(e => (
                <button key={e} onClick={() => handleAccion('respondio', { nuevo_estado: e })} disabled={loading}
                  className="w-full text-left px-4 py-2.5 text-sm rounded-xl border border-gray-100 hover:border-[#ffc500] hover:bg-yellow-50 transition-colors font-medium text-gray-700">
                  {e}
                </button>
              ))}
            </div>
            <button onClick={() => setFase('main')} className="w-full text-xs text-gray-400 hover:text-gray-600 py-2">← Volver</button>
          </div>
        )}

        {/* Fase: perdido → motivo */}
        {fase === 'perdido' && (
          <div className="p-5 space-y-3">
            <p className="text-sm font-bold text-gray-800">¿Por qué no se concretó?</p>
            <div className="space-y-1.5">
              {MOTIVOS_PERDIDA.map(m => (
                <button key={m} onClick={() => setMotivoPerdida(m)}
                  className={`w-full text-left px-4 py-2.5 text-sm rounded-xl border transition-colors font-medium
                    ${motivoPerdida === m ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-100 text-gray-700 hover:border-red-200 hover:bg-red-50'}`}>
                  {m}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setFase('main')} className="flex-1 text-xs text-gray-500 border border-gray-200 rounded-xl py-2">← Volver</button>
              <button onClick={() => handleAccion('perdido', { motivo_perdida: motivoPerdida })}
                disabled={!motivoPerdida || loading}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-2 rounded-xl transition-colors disabled:opacity-40">
                Confirmar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

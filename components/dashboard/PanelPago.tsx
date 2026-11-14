'use client';

import { useState } from 'react';
import { X, AlertTriangle, CheckCircle, MessageCircle } from 'lucide-react';
import RegistrarPago, { type DatosPago } from '@/components/contabilidad/RegistrarPago';
import { formatCurrency } from '@/lib/utils';

interface Props {
  alerta: any;
  onClose: () => void;
  onGuardar: (contId: string, data: any) => Promise<boolean | void>;
}

export default function PanelPago({ alerta, onClose, onGuardar }: Props) {
  const [montoPagado, setMontoPagado] = useState<number>(Number(alerta.monto_pagado) || 0);
  const [saved, setSaved]             = useState(false);

  const montoTotal     = alerta.monto_total ?? 0;
  const montoPendiente = montoTotal - montoPagado;
  const pagado100      = montoPendiente <= 0;

  // Registra un abono con su fecha real (antes se sobrescribía el total pagado
  // y el ingreso quedaba sin fecha → se asignaba a un solo mes).
  async function registrar(d: DatosPago): Promise<boolean> {
    try {
      const r = await onGuardar(alerta.id, { registrar_pago: d });
      if (r === false) return false;
    } catch { return false; } // el error ya se mostró en un aviso
    setMontoPagado(v => v + d.monto);
    setSaved(true);
    setTimeout(() => onClose(), 1200);
    return true;
  }

  const colorAlerta = alerta.alerta_pago === 'vencido'
    ? { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-500', label: '¡Pago vencido!' }
    : alerta.alerta_pago === 'urgente'
    ? { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: 'text-orange-500', label: 'Pago urgente (3 días)' }
    : { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-500', label: 'Pago próximo (7 días)' };

  // Mensaje de cobranza según el estado (vencido vs recordatorio previo)
  function mensajeCobranza(): string {
    const nombre = alerta.cliente || alerta.nombre || 'cliente';
    const monto = Math.max(montoPendiente, 0);
    const venc = alerta.fecha_limite || alerta.fecha_entrega || '';
    if (alerta.alerta_pago === 'vencido') {
      return `Hola ${nombre} 👋\n\nTe escribo de Idealo Films. Notamos que el pago de tu proyecto${venc ? `, que vencía el ${venc},` : ''} aún figura como pendiente.\n\nMonto pendiente: S/ ${monto}\n\n¿Pudiste realizar el pago? Si ya lo hiciste, por favor compártenos el comprobante. Si necesitas coordinar algo, con gusto lo conversamos. 🙏`;
    }
    return `Hola ${nombre} 😊\n\nTe escribo de Idealo Films para recordarte amablemente que el pago de tu proyecto${venc ? ` vence el ${venc}` : ' está próximo'}.\n\nMonto pendiente: S/ ${monto}\n\nCualquier consulta estoy a tu disposición. ¡Gracias por confiar en nosotros! 🙌`;
  }

  function enviarRecordatorio() {
    const tel = (alerta.telefono || '').replace(/\D/g, '');
    const num = tel.startsWith('51') ? tel : tel ? '51' + tel : '';
    const url = num
      ? `https://wa.me/${num}?text=${encodeURIComponent(mensajeCobranza())}`
      : '';
    if (url) window.open(url, '_blank');
    else { navigator.clipboard.writeText(mensajeCobranza()); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-center gap-3 ${colorAlerta.bg} ${colorAlerta.border}`}>
          <AlertTriangle size={16} className={colorAlerta.icon} />
          <div className="flex-1">
            <p className={`text-sm font-bold ${colorAlerta.text}`}>{colorAlerta.label}</p>
            <p className="text-xs text-gray-600 truncate mt-0.5">{alerta.nombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {saved ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle size={32} className="text-green-500" />
              <p className="text-sm font-semibold text-gray-700">¡Pago registrado!</p>
            </div>
          ) : (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total', value: formatCurrency(montoTotal) },
                  { label: 'Pagado', value: formatCurrency(montoPagado) },
                  { label: 'Pendiente', value: formatCurrency(Math.max(montoPendiente, 0)) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <p className="text-xs font-bold text-gray-800">{value}</p>
                    <p className="text-[10px] text-gray-400">{label}</p>
                  </div>
                ))}
              </div>

              {/* Barra */}
              <div>
                <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                  <span>Progreso</span>
                  <span>{montoTotal > 0 ? Math.round((montoPagado/montoTotal)*100) : 0}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${montoTotal > 0 ? Math.min((montoPagado/montoTotal)*100, 100) : 0}%`,
                      backgroundColor: pagado100 ? '#10b981' : '#f59e0b',
                    }} />
                </div>
              </div>

              {pagado100 ? (
                <p className="text-xs text-green-600 font-semibold text-center">✓ Pago completado</p>
              ) : (
                <RegistrarPago pendiente={Math.max(montoPendiente, 0)} onRegistrar={registrar} />
              )}

              {alerta.fecha_limite && (
                <p className="text-xs text-gray-500 text-center">
                  Fecha límite: <strong>{alerta.fecha_limite.slice(0, 10).split('-').reverse().join('/')}</strong>
                </p>
              )}

              {/* Enviar recordatorio de cobranza por WhatsApp */}
              <button onClick={enviarRecordatorio}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-colors">
                <MessageCircle size={14} /> Enviar recordatorio por WhatsApp
              </button>

              <button onClick={onClose}
                className="w-full text-sm text-gray-500 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors">
                Cerrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

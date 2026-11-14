'use client';

// Formulario para registrar un abono con su FECHA REAL, medio y nº de operación.
// El servidor suma el monto al "Monto Pagado" del proyecto y anota la línea en
// su "Historial de pagos" (ver lib/pagos.ts). Se usa en el dashboard, en
// Contabilidad y en la conciliación bancaria (precargado con el movimiento).

import { useState } from 'react';
import { Loader2, PlusCircle } from 'lucide-react';
import { hoyLima, formatCurrency } from '@/lib/utils';
import { MEDIOS_PAGO } from '@/lib/pagos';
import DatePicker from '@/components/ui/DatePicker';
import Selector from '@/components/ui/Selector';

export interface DatosPago { monto: number; fecha: string; medio: string; operacion: string; nota: string }

export default function RegistrarPago({ pendiente, inicial, onRegistrar, compacto = false, textoBoton = 'Registrar pago' }: {
  pendiente?: number;
  inicial?: Partial<DatosPago>;
  onRegistrar: (d: DatosPago) => Promise<boolean | void>;
  compacto?: boolean;
  textoBoton?: string;
}) {
  const [monto, setMonto] = useState(inicial?.monto ? String(inicial.monto) : '');
  const [fecha, setFecha] = useState(inicial?.fecha || hoyLima());
  const [medio, setMedio] = useState(inicial?.medio || 'Transferencia');
  const [operacion, setOperacion] = useState(inicial?.operacion || '');
  const [nota, setNota] = useState(inicial?.nota || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Sin N° de operación se avisa una vez: es lo que usa contabilidad para ubicar el pago en el banco
  const [avisoOp, setAvisoOp] = useState(false);

  const valor = Number(monto);
  const excede = pendiente !== undefined && valor > pendiente + 0.5;

  async function enviar() {
    if (!(valor > 0)) { setError('Ingresa el monto del pago'); return; }
    if (!fecha) { setError('Indica la fecha en que entró el dinero'); return; }
    if (guardando) return;
    if (!operacion.trim() && medio !== 'Efectivo' && !avisoOp) { setAvisoOp(true); setError(''); return; }
    setError(''); setGuardando(true);
    try {
      const ok = await onRegistrar({ monto: Math.round(valor * 100) / 100, fecha, medio, operacion: operacion.trim(), nota: nota.trim() });
      if (ok !== false) { setMonto(''); setOperacion(''); setNota(''); setAvisoOp(false); }
    } finally { setGuardando(false); }
  }

  const inp = 'w-full text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#ffc500]';
  const lbl = 'text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 block';

  return (
    <div className={`space-y-2.5 ${compacto ? '' : 'bg-amber-50/60 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/20 rounded-xl p-3'}`}
      onClick={e => e.stopPropagation()}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl}>Monto (S/)</label>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
            placeholder={pendiente ? String(Math.max(0, Math.round(pendiente * 100) / 100)) : '0.00'} className={inp} aria-label="Monto del pago" />
        </div>
        <div>
          <label className={lbl}>Fecha en que entró</label>
          <DatePicker value={fecha} onChange={v => setFecha(v)} max={hoyLima()} aria-label="Fecha del pago" />
        </div>
        <div>
          <label className={lbl}>Medio</label>
          <Selector value={medio} onChange={e => setMedio(e.target.value)} className={`${inp} bg-white`} aria-label="Medio de pago">
            {MEDIOS_PAGO.map(m => <option key={m}>{m}</option>)}
          </Selector>
        </div>
        <div>
          <label className={lbl}>N° de operación <span className="font-normal text-gray-400">(del voucher)</span></label>
          <input value={operacion} onChange={e => { setOperacion(e.target.value); setAvisoOp(false); }} placeholder={medio === 'Efectivo' ? 'No aplica' : 'Ej. 2151259'}
            inputMode="numeric" className={`${inp} font-mono ${avisoOp ? '!border-amber-400 ring-2 ring-amber-200' : ''}`} aria-label="Número de operación" />
        </div>
      </div>
      <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional): adelanto 50%, pago final…" className={inp} aria-label="Nota del pago" />
      {pendiente !== undefined && pendiente > 0 && !monto && (
        <button type="button" onClick={() => setMonto(String(Math.round(pendiente * 100) / 100))}
          className="text-[11px] font-semibold text-[#b8890b] hover:underline">
          Usar saldo pendiente ({formatCurrency(pendiente)})
        </button>
      )}
      {excede && <p className="text-[11px] text-amber-700">El monto supera el saldo pendiente ({formatCurrency(pendiente || 0)}).</p>}
      {avisoOp && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
          Falta el <strong>N° de operación</strong> del voucher: con él contabilidad ubica el pago en el Libro Bancos.
          Escríbelo, o vuelve a pulsar el botón para registrar sin él.
        </p>
      )}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      <button type="button" onClick={enviar} disabled={guardando}
        className="w-full bg-[#ffc500] hover:bg-[#e6b000] text-white text-sm font-bold py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
        {guardando ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />} {avisoOp ? 'Registrar sin N° de operación' : textoBoton}
      </button>
    </div>
  );
}

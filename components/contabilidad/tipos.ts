import type { PagoProyecto } from '@/lib/pagos';

export interface ProyectoCont {
  id: string; notion_url: string; proyecto: string; cliente: string;
  telefono: string; mail: string; ruc: string;
  total: number; gravado: number | null; igv: number | null;
  monto_pagado: number; monto_pendiente: number; estado_pago: string;
  historial_pagos: string;
  pagos: PagoProyecto[];
  cotizacion_url: string | null; factura_url: string | null;
  contrato_url: string | null; drive_url: string | null;
  encargado: string;
  fecha_cobro: string | null; fecha_inicio: string | null; fecha_entrega: string | null;
  alerta_pago: 'vencido' | 'urgente' | 'proximo' | null;
  cobranza_oculta?: boolean;
  recordatorio_pago?: string | null;
  created_time: string;
  last_edited_time: string;
}

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/** Fecha con la que un proyecto cuenta como "vendido": inicio, primer pago o creación. */
export function fechaVenta(p: ProyectoCont): string {
  return (p.fecha_inicio || p.pagos?.[0]?.fecha || p.fecha_cobro || p.created_time || '').slice(0, 10);
}

/** "2026-06" → "Junio 2026"; "2026" → "Año 2026"; '' → "Histórico". */
export function etiquetaPeriodo(periodo: string): string {
  if (!periodo) return 'Histórico';
  if (/^\d{4}$/.test(periodo)) return `Año ${periodo}`;
  const [y, m] = periodo.split('-');
  return `${MESES[Number(m) - 1]} ${y}`;
}

export const enPeriodo = (fecha: string, periodo: string) => !periodo || fecha.startsWith(periodo);

export function fechaCorta(f: string | null | undefined): string {
  if (!f) return '—';
  const [y, m, d] = f.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// lib/pagos.ts
// Pagos (abonos) de los proyectos, repartidos por la FECHA REAL en que entraron.
//
// Cada proyecto guarda en Notion un único "Monto Pagado" y el texto
// "Historial de pagos", con una línea por abono (la más reciente arriba):
//
//   08/10/2026 · Isai · S/500 · Transferencia · Op 123456 · Adelanto 50%
//   fecha        quién   monto   medio (opc.)    nº operación (opc.)  nota (opc.)
//
// Antes el ingreso entero se asignaba al mes de "Fecha de cobro": un proyecto
// pagado mitad en junio y mitad en julio aparecía completo en un solo mes.
// Aquí cada abono cuenta en su mes. Si "Monto Pagado" es mayor que la suma del
// historial (pagos anotados a mano sin detalle), la diferencia se registra
// como un pago "sin detalle" en la Fecha de cobro (o inicio) del proyecto.
//
// Isomórfico: se usa en el servidor y en el navegador.

export const MEDIOS_PAGO = ['Transferencia', 'Yape', 'Plin', 'Efectivo', 'Tarjeta', 'Depósito'] as const;

export interface Pago {
  fecha: string;          // YYYY-MM-DD (fecha en que entró el dinero)
  monto: number;
  usuario: string;
  medio: string;
  operacion: string;      // nº de operación bancaria, si se anotó
  nota: string;
  linea: string;          // línea original del historial ('' si es estimado)
  estimado: boolean;      // true = diferencia sin detalle (no hay línea en el historial)
}

export interface PagoProyecto extends Pago {
  proyecto_id: string;
  proyecto: string;
  cliente: string;
}

const RE_LINEA = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*·\s*(.*?)\s*·\s*S\/\s*([\d.,]+)\s*(?:·\s*(.*))?$/;

/** Convierte "1,234.50" / "1234,5" / "1234" en número. */
export function parseMonto(txt: string): number {
  let t = String(txt ?? '').replace(/[^\d.,-]/g, '');
  if (!t) return NaN;
  const ultComa = t.lastIndexOf(','), ultPunto = t.lastIndexOf('.');
  if (ultComa > ultPunto) {
    // "1.234,56" o "1234,5" → coma decimal
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    // "1,234.56" o "1234" → punto decimal
    t = t.replace(/,/g, '');
  }
  return parseFloat(t);
}

/** Lee el texto "Historial de pagos" y devuelve los abonos con su fecha. */
export function parseHistorialPagos(texto: string | null | undefined): Pago[] {
  if (!texto) return [];
  const pagos: Pago[] = [];
  for (const linea of texto.split('\n')) {
    const m = linea.match(RE_LINEA);
    if (!m) continue;
    const [, d, mo, y, usuario, montoTxt, resto = ''] = m;
    const monto = parseMonto(montoTxt);
    if (!(monto > 0)) continue;
    let medio = '', operacion = '';
    const notas: string[] = [];
    for (const parte of resto.split('·').map(x => x.trim()).filter(Boolean)) {
      const op = parte.match(/^(?:op(?:eraci[oó]n)?\.?|n[°º]\s*op\.?)\s*[:#]?\s*(\S+)$/i);
      if (op && !operacion) { operacion = op[1]; continue; }
      const med = MEDIOS_PAGO.find(x => x.toLowerCase() === parte.toLowerCase());
      if (med && !medio) { medio = med; continue; }
      notas.push(parte);
    }
    pagos.push({
      fecha: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`,
      monto: Math.round(monto * 100) / 100,
      usuario: usuario.trim(),
      medio, operacion,
      nota: notas.join(' · '),
      linea: linea.trim(),
      estimado: false,
    });
  }
  return pagos;
}

/** Línea de historial para un abono nuevo. `fecha` en YYYY-MM-DD. */
export function lineaPago(p: { fecha: string; usuario: string; monto: number; medio?: string; operacion?: string; nota?: string }): string {
  const [y, m, d] = p.fecha.slice(0, 10).split('-');
  const partes = [`${d}/${m}/${y}`, p.usuario || 'OS', `S/${Math.round(p.monto * 100) / 100}`];
  if (p.medio) partes.push(p.medio);
  if (p.operacion) partes.push(`Op ${String(p.operacion).replace(/\s+/g, '')}`);
  if (p.nota) partes.push(p.nota.replace(/[·\n]/g, ' ').trim());
  return partes.join(' · ');
}

/**
 * Pagos de un proyecto. Usa el historial y, si "Monto Pagado" supera la suma
 * del historial, añade la diferencia como pago estimado en la fecha de cobro
 * (o de inicio / creación) del proyecto.
 */
export function pagosDeProyecto(p: {
  id: string; proyecto?: string; cliente?: string;
  monto_pagado?: number | null; historial_pagos?: string | null;
  fecha_cobro?: string | null; fecha_inicio?: string | null; created_time?: string | null;
}): PagoProyecto[] {
  const base = { proyecto_id: p.id, proyecto: p.proyecto || '', cliente: p.cliente || '' };
  const pagos: PagoProyecto[] = parseHistorialPagos(p.historial_pagos).map(x => ({ ...x, ...base }));
  const suma = pagos.reduce((a, x) => a + x.monto, 0);
  const pagado = Number(p.monto_pagado) || 0;
  const diferencia = Math.round((pagado - suma) * 100) / 100;
  if (diferencia >= 1) {
    const fecha = (p.fecha_cobro || p.fecha_inicio || p.created_time || '').slice(0, 10);
    if (fecha) {
      pagos.push({
        fecha, monto: diferencia, usuario: '', medio: '', operacion: '',
        nota: 'Pago sin detalle en el historial', linea: '', estimado: true, ...base,
      });
    }
  }
  return pagos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Suma de pagos por mes ("YYYY-MM" → monto). */
export function cobradoPorMes(pagos: Pago[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const p of pagos) {
    const k = p.fecha.slice(0, 7);
    r[k] = Math.round(((r[k] || 0) + p.monto) * 100) / 100;
  }
  return r;
}

/**
 * Texto para la columna "DETALLE DE LA OPERACIÓN" del Libro Bancos, con el
 * mismo estilo que usa contabilidad: "ADELANTO 50% VIDEO CORPORATIVO - SBS".
 * Deduce el tipo de abono según los pagos del proyecto y su total.
 */
export function detalleLibroBancos(pago: PagoProyecto, pagosProyecto: Pago[], total: number): string {
  const orden = [...pagosProyecto].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const idx = orden.findIndex(p => p.fecha === pago.fecha && p.monto === pago.monto && p.linea === pago.linea);
  const acumulado = orden.slice(0, idx + 1).reduce((a, p) => a + p.monto, 0);
  let tipo = 'ABONO';
  if (total > 0) {
    if (idx === 0 && pago.monto >= total - 1) tipo = 'PAGO TOTAL';
    else if (idx === 0) {
      const pct = Math.round((pago.monto / total) * 100);
      tipo = pct >= 45 && pct <= 55 ? 'ADELANTO 50%' : 'ADELANTO';
    } else if (acumulado >= total - 1) tipo = 'PAGO RESTANTE';
  }
  const partes = [`${tipo} ${pago.proyecto}`.trim(), pago.cliente].filter(Boolean).join(' - ');
  // Notas como "Adelanto 50%" o "Pago final" ya las dice el tipo: no se repiten
  const notaUtil = pago.nota && !pago.estimado
    && !/^(adelanto|pago|abono|saldo|restante|final|total|del|\d+\s*%|\s)+$/i.test(pago.nota);
  return (notaUtil ? `${partes} | ${pago.nota}` : partes).toUpperCase();
}

/** Valor para la columna "RELACIÓN" del libro (medio de pago). */
export function relacionLibroBancos(p: Pago): string {
  if (p.medio === 'Transferencia') return 'TRANSFERENCIA';
  return (p.medio || 'TRANSFERENCIA').toUpperCase();
}

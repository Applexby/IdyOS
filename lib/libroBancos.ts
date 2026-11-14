// lib/libroBancos.ts
// Extracto de los cobros del OS con el MISMO formato que el "Libro Auxiliar
// Bancos" que lleva contabilidad (solo ingresos):
//
//   N° · FECHA DE LA OPERACIÓN · OPERACIÓN · DETALLE DE LA OPERACIÓN · DEUDOR
//
// Contabilidad sigue llenando su libro en Excel; este extracto sirve para
// revisarlo al lado y encontrar de qué proyecto es cada ingreso. La
// comparativa pone cada fila del libro junto al pago del OS que le corresponde.
// La columna RELACIÓN del libro (texto del estado de cuenta) no se usa.

import type { Hoja, Celda } from './xlsx';
import type { MovimientoBanco, ResultadoConciliacion } from './conciliacion';
import { detalleLibroBancos, type PagoProyecto } from './pagos';

export const EMPRESA = { razonSocial: 'IDEALO FILMS S.A.C', ruc: '20611785381' };

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** "2026-09" → "SETIEMBRE 2026"; "2026" → "AÑO 2026"; '' → "HISTÓRICO" (como en el libro). */
export function periodoLibro(periodo: string): string {
  if (/^\d{4}-\d{2}$/.test(periodo)) return `${MESES[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)}`;
  if (/^\d{4}$/.test(periodo)) return `AÑO ${periodo}`;
  return 'HISTÓRICO';
}

interface ProyectoConPagos { id: string; total: number; pagos?: PagoProyecto[] }

export interface FilaExtracto {
  n: number;
  fecha: string;          // YYYY-MM-DD
  operacion: string;
  detalle: string;        // DETALLE DE LA OPERACIÓN
  deudor: number;         // ingreso
  pago: PagoProyecto;
}

/** Detalle con el estilo del libro: "ADELANTO 50% VIDEO CORPORATIVO - SBS". */
export function detallePago(pago: PagoProyecto, proyectos: ProyectoConPagos[]): string {
  const p = proyectos.find(x => x.id === pago.proyecto_id);
  return detalleLibroBancos(pago, p?.pagos || [pago], p?.total || 0);
}

/** Cobros del periodo ("YYYY-MM", "YYYY" o '' = todo) en orden de fecha, numerados. */
export function extractoLibroBancos(proyectos: ProyectoConPagos[], periodo: string): FilaExtracto[] {
  return proyectos
    .flatMap(p => p.pagos || [])
    .filter(p => !periodo || p.fecha.startsWith(periodo))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.proyecto.localeCompare(b.proyecto))
    .map((pago, i) => ({ n: i + 1, fecha: pago.fecha, operacion: pago.operacion, detalle: detallePago(pago, proyectos), deudor: pago.monto, pago }));
}

const COLS_LIBRO: Hoja['columnas'] = [
  { titulo: 'N°', ancho: 6 },
  { titulo: 'FECHA DE LA OPERACIÓN', formato: 'fecha', ancho: 14 },
  { titulo: 'OPERACION', formato: 'texto', ancho: 14 },
  { titulo: 'DETALLE DE LA OPERACION', ancho: 62 },
  { titulo: 'DEUDOR', formato: 'moneda', ancho: 14 },
];

const encabezadoLibro = (periodo: string, fuente: string): [string, string][] => [
  ['PERIODO:', periodoLibro(periodo)],
  ['RUC:', EMPRESA.ruc],
  ['RAZON SOCIAL:', EMPRESA.razonSocial],
  ['FUENTE:', fuente],
];

/** Hoja de Excel del extracto, con la cabecera y columnas del Libro Bancos. */
export function hojaExtracto(filas: FilaExtracto[], periodo: string): Hoja {
  return {
    nombre: 'Libro Bancos (OS)',
    encabezado: encabezadoLibro(periodo, 'Pagos registrados en el OS (solo ingresos)'),
    columnas: [...COLS_LIBRO, { titulo: 'OBSERVACIÓN', ancho: 34 }],
    filas: filas.map(f => [f.n, f.fecha, f.operacion, f.detalle, f.deudor,
      f.pago.estimado ? 'Pago sin detalle: confirmar fecha y N° op.' : !f.operacion ? 'Falta N° de operación' : '']),
    totales: ['', '', '', 'TOTAL INGRESOS', filas.reduce((a, f) => a + f.deudor, 0), ''],
  };
}

// ── Comparativa libro de contabilidad ↔ OS ───────────────────────────────────

export type EstadoComparativa = 'cuadra' | 'falta_os' | 'falta_libro' | 'excluido';

export const ETIQUETA_ESTADO: Record<EstadoComparativa, string> = {
  cuadra: 'Cuadra',
  falta_os: 'No registrado en el OS',
  falta_libro: 'No está en el libro',
  excluido: 'No es cobro',
};

export interface FilaComparativa {
  n: number;
  fecha: string;
  estado: EstadoComparativa;
  libro?: { operacion: string; detalle: string; deudor: number; mov: MovimientoBanco };
  os?: { operacion: string; detalle: string; deudor: number; proyecto: string; pago: PagoProyecto };
  nota: string;
}

export function comparativa(
  r: ResultadoConciliacion, excluidos: MovimientoBanco[], proyectos: ProyectoConPagos[],
): FilaComparativa[] {
  const libro = (m: MovimientoBanco) => ({ operacion: m.operacion, detalle: m.descripcion || m.relacion, deudor: m.monto, mov: m });
  const os = (p: PagoProyecto) => ({ operacion: p.operacion, detalle: detallePago(p, proyectos), deudor: p.monto, proyecto: p.proyecto, pago: p });
  const filas: Omit<FilaComparativa, 'n'>[] = [
    ...r.conciliados.map(c => {
      const notas: string[] = [];
      if (Math.abs(c.banco.monto - c.pago.monto) >= 0.01) notas.push(`Monto distinto (OS ${c.pago.monto.toFixed(2)})`);
      if (c.banco.fecha !== c.pago.fecha) notas.push('Fecha distinta');
      if (!c.pago.operacion && c.banco.operacion) notas.push('Falta el N° op. en el OS');
      return { fecha: c.banco.fecha, estado: 'cuadra' as const, libro: libro(c.banco), os: os(c.pago), nota: notas.join(' · ') };
    }),
    ...r.soloBanco.map(m => ({ fecha: m.fecha, estado: 'falta_os' as const, libro: libro(m), nota: 'Asígnalo a su proyecto' })),
    ...r.soloSistema.map(p => ({ fecha: p.fecha, estado: 'falta_libro' as const, os: os(p), nota: p.medio === 'Efectivo' ? 'Pago en efectivo' : 'Revisar' })),
    ...excluidos.map(m => ({ fecha: m.fecha, estado: 'excluido' as const, libro: libro(m), nota: m.excluido || '' })),
  ];
  return filas
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((f, i) => ({ ...f, n: i + 1 }));
}

/** Hoja de la comparativa: columnas del libro a la izquierda y del OS a la derecha. */
export function hojaComparativa(filas: FilaComparativa[], desde: string, hasta: string): Hoja {
  const periodo = desde.slice(0, 7) === hasta.slice(0, 7) ? desde.slice(0, 7) : '';
  const fila = (f: FilaComparativa): Celda[] => [
    f.n, f.fecha,
    f.libro?.operacion ?? '', f.libro?.detalle ?? '', f.libro ? f.libro.deudor : '',
    f.os?.operacion ?? '', f.os?.detalle ?? '', f.os ? f.os.deudor : '',
    ETIQUETA_ESTADO[f.estado], f.nota,
  ];
  const suma = (k: 'libro' | 'os') => filas.filter(f => f.estado !== 'excluido').reduce((a, f) => a + (f[k]?.deudor || 0), 0);
  return {
    nombre: 'Comparativa',
    encabezado: [
      ['PERIODO:', periodo ? periodoLibro(periodo) : `${desde} a ${hasta}`],
      ['RUC:', EMPRESA.ruc],
      ['RAZON SOCIAL:', EMPRESA.razonSocial],
      ['FUENTE:', 'Libro Bancos de contabilidad comparado con los pagos del OS'],
    ],
    columnas: [
      { titulo: 'N°', ancho: 6 },
      { titulo: 'FECHA DE LA OPERACIÓN', formato: 'fecha', ancho: 14 },
      { titulo: 'OPERACION (LIBRO)', formato: 'texto', ancho: 14 },
      { titulo: 'DETALLE DE LA OPERACION (LIBRO)', ancho: 46 },
      { titulo: 'DEUDOR (LIBRO)', formato: 'moneda', ancho: 14 },
      { titulo: 'OPERACION (OS)', formato: 'texto', ancho: 14 },
      { titulo: 'DETALLE (OS)', ancho: 46 },
      { titulo: 'DEUDOR (OS)', formato: 'moneda', ancho: 14 },
      { titulo: 'ESTADO', ancho: 22 },
      { titulo: 'OBSERVACIÓN', ancho: 30 },
    ],
    filas: filas.map(fila),
    totales: ['', '', '', 'TOTAL INGRESOS (sin excluidos)', suma('libro'), '', '', suma('os'), '', ''],
  };
}

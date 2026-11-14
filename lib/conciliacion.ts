// lib/conciliacion.ts
// Conciliación del estado de cuenta del banco con los pagos registrados en el OS.
//
// 1. interpretarEstadoCuenta(): toma las filas del Excel/CSV del banco (o
//    pegadas desde Excel), detecta las columnas (fecha, descripción, monto o
//    abono/cargo, nº de operación) y devuelve los INGRESOS del periodo.
// 2. conciliar(): empareja cada ingreso del banco con un pago del sistema por
//    monto (±S/1) y fecha (±4 días), priorizando el nº de operación si coincide.
//    Lo que no empareja queda como "en banco, falta en el sistema" o
//    "en el sistema, no aparece en el banco".

import { parseMonto, type PagoProyecto } from '@/lib/pagos';

export interface MovimientoBanco {
  id: string;            // índice estable dentro del archivo
  fecha: string;         // YYYY-MM-DD
  descripcion: string;
  monto: number;         // positivo = ingreso
  operacion: string;
  relacion: string;      // columna "Relación" del libro bancos (p. ej. "Yape Rita Mor")
  medio: string;         // medio deducido: Yape, Plin, Transferencia…
  fechaEstimada?: boolean; // la celda de fecha tenía un error (#VALUE!): se usó la fecha anterior
  excluido?: string;     // motivo si no es un cobro de proyecto (préstamos, etc.)
}

export interface ColumnasEstado {
  fecha: number; descripcion: number; operacion: number; relacion: number;
  monto: number;         // columna única con signo (o -1)
  abono: number;         // columna de ingresos (o -1)
  cargo: number;         // columna de egresos (o -1)
  filaEncabezado: number;
}

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Detecta en qué fila está el encabezado y qué columna es cada dato.
 *  Las claves se prueban en orden de prioridad y una columna no se reutiliza
 *  (p. ej. "Fecha valor" no puede ser el monto, ni "Descripción operación" el nº). */
export function detectarColumnas(filas: (string | number)[][]): ColumnasEstado | null {
  for (let f = 0; f < Math.min(filas.length, 25); f++) {
    const cab = filas[f].map(norm);
    const usadas = new Set<number>();
    const buscar = (claves: string[], excluir: string[] = []) => {
      for (const k of claves) {
        const exacta = cab.findIndex((c, i) => !usadas.has(i) && c === k);
        const i = exacta >= 0 ? exacta : cab.findIndex((c, j) => !usadas.has(j) && c.includes(k) && !excluir.some(x => c.includes(x)));
        if (i >= 0) { usadas.add(i); return i; }
      }
      return -1;
    };
    const fecha = buscar(['fecha de operacion', 'fecha operacion', 'f. operacion', 'f operacion', 'fecha', 'f. valor', 'fecha proceso']);
    if (fecha < 0) continue;
    // Las demás columnas de fecha no pueden ser ni monto ni operación
    cab.forEach((c, i) => { if (c.includes('fecha') || /^f\.? ?(valor|proceso|operacion)/.test(c)) usadas.add(i); });
    const sinFecha = ['fecha', 'saldo', 'hora'];
    // "OPERACION" exacto es el nº en el Libro Auxiliar Bancos; "Detalle de la operación" NO.
    const operacion = buscar(['operacion', 'n° operacion', 'nro. de operacion', 'nro de operacion', 'nro operacion', 'numero de operacion', 'num operacion',
      'operacion - numero', 'n° op', 'nro. op', 'n. doc', 'nº. doc', 'documento', 'referencia'], sinFecha.concat(['descripcion', 'detalle']));
    // Libro Auxiliar Bancos: DEUDOR = entra dinero a la cuenta; ACREEDOR = sale.
    const abono = buscar(['deudor', 'abono', 'abonos', 'ingreso', 'ingresos', 'haber', 'credito', 'deposito'], sinFecha);
    const cargo = buscar(['acreedor', 'acrededor', 'acredor', 'cargo', 'cargos', 'egreso', 'egresos', 'debe', 'debito', 'retiro'], sinFecha);
    const monto = buscar(['monto', 'importe', 'valor'], sinFecha);
    if (abono < 0 && monto < 0) continue;
    const descripcion = buscar(['detalle de la operacion', 'descripcion operacion', 'descripcion', 'concepto', 'detalle', 'glosa', 'movimiento'], ['fecha']);
    const relacion = buscar(['relacion'], ['fecha']);
    return { fecha, descripcion, operacion, relacion, monto, abono, cargo, filaEncabezado: f };
  }
  return null;
}

/** Fecha del banco ("15/06/2026", "15-06-26", "2026-06-15" o nº de serie de Excel) → YYYY-MM-DD. */
export function parseFechaBanco(v: string | number): string | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function montoCelda(v: string | number): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (!s) return NaN;
  const negativo = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[^\d,.()-]/g, '')) || /-$/.test(s);
  const n = parseMonto(s.replace(/-/g, ''));
  return negativo ? -n : n;
}

/** Medio de pago a partir de la columna "Relación" o la descripción del banco. */
export function medioDesde(texto: string): string {
  const t = norm(texto);
  if (t.includes('yape')) return 'Yape';
  if (t.includes('plin')) return 'Plin';
  if (t.includes('efectivo') || t.includes('deposito')) return 'Depósito';
  if (t.includes('tarjeta') || t.includes('pos ')) return 'Tarjeta';
  return 'Transferencia';
}

/** Ingresos que NO son cobros de proyectos (no se concilian). */
const EXCLUSIONES: { re: RegExp; motivo: string }[] = [
  { re: /prestamo|pagred/, motivo: 'Préstamo' },
  { re: /devolucion|reembolso de banco/, motivo: 'Devolución' },
];
export function motivoExclusion(texto: string): string | undefined {
  const t = norm(texto);
  return EXCLUSIONES.find(e => e.re.test(t))?.motivo;
}

/** Ingresos del estado de cuenta o del libro bancos (descarta cargos/egresos).
 *  Si una fila tiene la fecha con error (#VALUE!), usa la fecha de la fila anterior. */
export function interpretarEstadoCuenta(filas: (string | number)[][], cols?: ColumnasEstado | null): MovimientoBanco[] {
  const c = cols ?? detectarColumnas(filas);
  if (!c) return [];
  const movs: MovimientoBanco[] = [];
  let ultimaFecha: string | null = null;
  for (let i = c.filaEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i];
    let fecha = parseFechaBanco(fila[c.fecha]);
    let fechaEstimada = false;
    const celdaFecha = String(fila[c.fecha] ?? '').trim();
    if (!fecha && ultimaFecha && /^#|error/i.test(celdaFecha)) { fecha = ultimaFecha; fechaEstimada = true; }
    if (!fecha) continue;
    ultimaFecha = fecha;
    let monto = NaN;
    if (c.abono >= 0) {
      monto = montoCelda(fila[c.abono]);
      if (!(monto > 0) && c.monto >= 0) monto = montoCelda(fila[c.monto]);
    } else if (c.monto >= 0) {
      monto = montoCelda(fila[c.monto]);
    }
    if (!(monto > 0)) continue; // solo ingresos
    const descripcion = c.descripcion >= 0 ? String(fila[c.descripcion] ?? '').trim() : '';
    const relacion = c.relacion >= 0 ? String(fila[c.relacion] ?? '').trim() : '';
    let operacion = c.operacion >= 0 ? String(fila[c.operacion] ?? '').trim().replace(/\.0$/, '') : '';
    if (!operacion) operacion = (descripcion.match(/(?:op(?:eracion)?|nro|n°)\.?\s*[:#]?\s*(\d{4,})/i) || [])[1] || '';
    movs.push({
      id: `b${i}`, fecha, descripcion, monto: Math.round(monto * 100) / 100, operacion, relacion,
      medio: medioDesde(`${relacion} ${descripcion}`), fechaEstimada,
      excluido: motivoExclusion(`${relacion} ${descripcion}`),
    });
  }
  return movs;
}

export interface ResultadoConciliacion {
  conciliados: { banco: MovimientoBanco; pago: PagoProyecto }[];
  soloBanco: MovimientoBanco[];      // entró al banco pero no está registrado en el OS
  soloSistema: PagoProyecto[];       // registrado en el OS pero no aparece en el banco
  totalBanco: number;
  totalSistema: number;
}

const diasEntre = (a: string, b: string) =>
  Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000;

/** Empareja ingresos del banco con pagos del sistema dentro del mismo periodo. */
export function conciliar(todos: MovimientoBanco[], pagos: PagoProyecto[], toleranciaDias = 4): ResultadoConciliacion {
  const banco = todos.filter(m => !m.excluido); // préstamos, etc. no son cobros de proyectos
  const libres = new Set(pagos.map((_, i) => i));
  const conciliados: ResultadoConciliacion['conciliados'] = [];
  const soloBanco: MovimientoBanco[] = [];

  // Primero los que coinciden por nº de operación, luego por monto + fecha cercana
  const ordenados = [...banco].sort((a, b) => Number(!!b.operacion) - Number(!!a.operacion));
  for (const mov of ordenados) {
    let mejor = -1, mejorPuntaje = Infinity;
    for (const i of Array.from(libres)) {
      const p = pagos[i];
      const sinCeros = (x: string) => x.replace(/\D/g, '').replace(/^0+/, '');
      const mismaOp = !!sinCeros(mov.operacion) && !!sinCeros(p.operacion) && sinCeros(mov.operacion).endsWith(sinCeros(p.operacion));
      const difMonto = Math.abs(p.monto - mov.monto);
      const difDias = diasEntre(p.fecha, mov.fecha);
      if (mismaOp && difMonto <= 1) { mejor = i; mejorPuntaje = -1; break; }
      if (difMonto <= 1 && difDias <= toleranciaDias) {
        const puntaje = difDias + difMonto;
        if (puntaje < mejorPuntaje) { mejor = i; mejorPuntaje = puntaje; }
      }
    }
    if (mejor >= 0) { conciliados.push({ banco: mov, pago: pagos[mejor] }); libres.delete(mejor); }
    else soloBanco.push(mov);
  }
  const soloSistema = Array.from(libres).map(i => pagos[i]);
  const suma = (xs: { monto: number }[]) => Math.round(xs.reduce((a, x) => a + x.monto, 0) * 100) / 100;
  return {
    conciliados: conciliados.sort((a, b) => a.banco.fecha.localeCompare(b.banco.fecha)),
    soloBanco: soloBanco.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    soloSistema: soloSistema.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    totalBanco: suma(banco),
    totalSistema: suma(pagos),
  };
}

/**
 * Sugiere a qué proyectos puede corresponder un ingreso del banco: con saldo
 * pendiente >= monto, y mejor si el nombre del cliente aparece en la descripción.
 */
export function sugerirProyectos<T extends { id: string; proyecto: string; cliente: string; monto_pendiente: number }>(
  mov: MovimientoBanco, proyectos: T[],
): T[] {
  const desc = norm(`${mov.descripcion} ${mov.relacion}`);
  const palabras = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  return proyectos
    .map(p => {
      let puntos = 0;
      if (p.monto_pendiente >= mov.monto - 1) puntos += 2;
      if (Math.abs(p.monto_pendiente - mov.monto) <= 1) puntos += 3;
      if (palabras(p.cliente).some(w => desc.includes(w))) puntos += 4;
      if (palabras(p.proyecto).some(w => desc.includes(w))) puntos += 1;
      return { p, puntos };
    })
    .filter(x => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .map(x => x.p);
}

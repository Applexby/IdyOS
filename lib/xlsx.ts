// lib/xlsx.ts
// Excel (.xlsx) sin dependencias externas: escritura (exportar reportes) y
// lectura básica (importar estados de cuenta). Pensado para el navegador.
//
// Un .xlsx es un ZIP con XML dentro. Para escribir usamos ZIP sin compresión
// (método "store", válido y que Excel/Google Sheets abren sin problema).
// Para leer usamos DecompressionStream('deflate-raw'), disponible en los
// navegadores actuales.

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type Celda = string | number | Date | null | undefined | { valor: number; formato: 'moneda' } ;
export interface Hoja {
  nombre: string;
  columnas: { titulo: string; ancho?: number; formato?: 'moneda' | 'fecha' | 'texto' }[];
  filas: Celda[][];
  /** Fila final en negrita (p. ej. totales) */
  totales?: Celda[];
  /** Filas de datos generales encima de la tabla, p. ej. [['PERIODO:', 'SETIEMBRE 2026']] */
  encabezado?: [string, string][];
}

// ── CRC32 (necesario para el ZIP) ─────────────────────────────────────────────
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── ZIP (store) ───────────────────────────────────────────────────────────────
function zip(archivos: { nombre: string; contenido: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const datos = enc.encode(a.contenido);
    const crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true); cd.setUint32(16, crc, true);
    cd.setUint32(20, datos.length, true); cd.setUint32(24, datos.length, true);
    cd.setUint16(28, nombre.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nombre);
    offset += 30 + nombre.length + datos.length;
  }
  const tamCentral = central.reduce((a, x) => a + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const total = todo.reduce((a, x) => a + x.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const x of todo) { out.set(x, p); p += x.length; }
  return out;
}

// ── Escritura ─────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Caracteres de control no válidos en XML
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function colLetra(i: number): string {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

/** Fecha → número de serie de Excel (días desde 1899-12-30). Acepta "YYYY-MM-DD". */
function serialExcel(f: Date | string): number | null {
  if (typeof f === 'string') {
    const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569;
  }
  if (isNaN(f.getTime())) return null;
  return Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()) / 86400000 + 25569;
}

// Estilos: 0 normal · 1 encabezado · 2 fecha · 3 moneda · 4 total texto · 5 total moneda
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;S/&quot; #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC500"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function celdaXML(ref: string, v: Celda, formato: string | undefined, negrita: boolean): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object' && !(v instanceof Date)) { v = v.valor; formato = 'moneda'; }
  if (formato === 'fecha' && (v instanceof Date || typeof v === 'string')) {
    const n = serialExcel(v as any);
    if (n !== null) return `<c r="${ref}" s="2"><v>${n}</v></c>`;
  }
  if (v instanceof Date) {
    const n = serialExcel(v);
    return n !== null ? `<c r="${ref}" s="2"><v>${n}</v></c>` : '';
  }
  if (typeof v === 'number' && isFinite(v)) {
    const s = formato === 'moneda' ? (negrita ? 5 : 3) : (negrita ? 4 : 0);
    return `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${v}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${negrita ? ' s="4"' : ''}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function hojaXML(h: Hoja): string {
  const filas: string[] = [];
  // Datos generales (PERIODO, RUC…) arriba, una fila en blanco y luego la tabla
  const enc = h.encabezado || [];
  enc.forEach(([k, v], i) => {
    filas.push(`<row r="${i + 1}">${celdaXML(`A${i + 1}`, k, undefined, true)}${celdaXML(`B${i + 1}`, v, undefined, false)}</row>`);
  });
  const fCab = enc.length ? enc.length + 2 : 1; // fila de los títulos de columna
  const cab = h.columnas.map((c, i) => `<c r="${colLetra(i)}${fCab}" t="inlineStr" s="1"><is><t>${esc(c.titulo)}</t></is></c>`).join('');
  filas.push(`<row r="${fCab}">${cab}</row>`);
  const todas = h.totales ? [...h.filas, h.totales] : h.filas;
  todas.forEach((fila, fi) => {
    const r = fi + fCab + 1;
    const negrita = !!h.totales && fi === todas.length - 1;
    const celdas = fila.map((v, ci) => celdaXML(`${colLetra(ci)}${r}`, v, h.columnas[ci]?.formato, negrita)).join('');
    filas.push(`<row r="${r}">${celdas}</row>`);
  });
  const cols = h.columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 16}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${fCab}" topLeftCell="A${fCab + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${filas.join('')}</sheetData>
${h.filas.length ? `<autoFilter ref="A${fCab}:${colLetra(h.columnas.length - 1)}${h.filas.length + fCab}"/>` : ''}
</worksheet>`;
}

/** Genera un libro .xlsx con varias hojas. */
export function crearXlsx(hojas: Hoja[]): Uint8Array {
  const nombres = hojas.map((h, i) => (h.nombre || `Hoja${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const archivos = [
    { nombre: '[Content_Types].xml', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>` },
    { nombre: '_rels/.rels', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
    { nombre: 'xl/workbook.xml', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { nombre: 'xl/styles.xml', contenido: ESTILOS },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXML(h) })),
  ];
  return zip(archivos);
}

/** Genera y descarga un .xlsx en el navegador. */
export function descargarXlsx(nombreArchivo: string, hojas: Hoja[]) {
  const datos = crearXlsx(hojas);
  const blob = new Blob([datos as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Lectura (estados de cuenta) ───────────────────────────────────────────────
// Devuelve la primera hoja como matriz de celdas (texto o número).

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const ds = new (globalThis as any).DecompressionStream('deflate-raw');
  const stream = new Blob([datos as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function leerZip(buf: ArrayBuffer): Promise<Record<string, string>> {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // Buscar el fin del directorio central
  let fin = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx) válido');
  const n = dv.getUint16(fin + 10, true);
  let p = dv.getUint32(fin + 16, true);
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  for (let k = 0; k < n; k++) {
    const metodo = dv.getUint16(p + 10, true);
    const tamComp = dv.getUint32(p + 20, true);
    const lnNombre = dv.getUint16(p + 28, true), lnExtra = dv.getUint16(p + 30, true), lnCom = dv.getUint16(p + 32, true);
    const offLocal = dv.getUint32(p + 42, true);
    const nombre = dec.decode(u8.subarray(p + 46, p + 46 + lnNombre));
    p += 46 + lnNombre + lnExtra + lnCom;
    if (!/^xl\/(sharedStrings\.xml|workbook\.xml|worksheets\/sheet\d+\.xml|_rels\/workbook\.xml\.rels)$/.test(nombre)) continue;
    const ini = offLocal + 30 + dv.getUint16(offLocal + 26, true) + dv.getUint16(offLocal + 28, true);
    const comp = u8.subarray(ini, ini + tamComp);
    const datos = metodo === 0 ? comp : await inflar(comp);
    out[nombre] = dec.decode(datos);
  }
  return out;
}

function refCol(ref: string): number {
  const letras = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const desEsc = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Lee la primera hoja de un .xlsx como filas de celdas. */
export async function leerXlsx(buf: ArrayBuffer): Promise<(string | number)[][]> {
  const f = await leerZip(buf);
  const compartidas: string[] = [];
  const ss = f['xl/sharedStrings.xml'] || '';
  for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) || []) {
    compartidas.push(desEsc((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')));
  }
  const nombreHoja = Object.keys(f).filter(k => /worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!nombreHoja) throw new Error('El Excel no tiene hojas');
  const xml = f[nombreHoja];
  const filas: (string | number)[][] = [];
  for (const row of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
    const fila: (string | number)[] = [];
    for (const c of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = (c.match(/ r="([A-Z]+\d+)"/) || [])[1];
      const tipo = (c.match(/ t="([^"]+)"/) || [])[1];
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let valor: string | number = '';
      if (tipo === 's' && v !== undefined) valor = compartidas[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = desEsc(((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || '');
      else if (tipo === 'str' || tipo === 'e') valor = desEsc(v || '');
      else if (v !== undefined) valor = isNaN(Number(v)) ? desEsc(v) : Number(v);
      const col = ref ? refCol(ref) : fila.length;
      while (fila.length < col) fila.push('');
      fila[col] = valor;
    }
    filas.push(fila);
  }
  return filas;
}

/** Lee CSV / texto pegado desde Excel (tabulado, ; o ,). */
export function leerTextoTabla(texto: string): string[][] {
  const lineas = texto.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lineas.length) return [];
  const muestra = lineas.slice(0, 5).join('\n');
  const sep = muestra.includes('\t') ? '\t' : (muestra.split(';').length > muestra.split(',').length ? ';' : ',');
  return lineas.map(l => {
    const celdas: string[] = [];
    let actual = '', comillas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (comillas && l[i + 1] === '"') { actual += '"'; i++; } else comillas = !comillas; }
      else if (ch === sep && !comillas) { celdas.push(actual.trim()); actual = ''; }
      else actual += ch;
    }
    celdas.push(actual.trim());
    return celdas;
  });
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFData } from '@/types';

// ── Colores corporativos ─────────────────────────────────────────────────────
const GOLD   = '#ffc500';
const DARK   = '#1a1a1a';
const WHITE  = '#ffffff';
const LIGHT  = '#f4f4f4';
const GRAY   = '#555555';

// ── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
function setFill(doc: jsPDF, hex: string)  { doc.setFillColor(...hexToRgb(hex)); }
function setColor(doc: jsPDF, hex: string) { doc.setTextColor(...hexToRgb(hex)); }
function setDraw(doc: jsPDF, hex: string)  { doc.setDrawColor(...hexToRgb(hex)); }

// Logo con fondo BLANCO (versión para PDF claro, no la versión oscura)
const LOGO_LIGHT_URL = 'https://res.cloudinary.com/dnprz5iie/image/upload/v1773951904/Recurso_10_i38u5g.png';

let logoEnMemoria: string | null = null;
async function getLogoBase64(): Promise<string | null> {
  if (logoEnMemoria) return logoEnMemoria; // la vista previa genera el PDF muchas veces
  try {
    const res = await fetch(LOGO_LIGHT_URL);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    logoEnMemoria = Buffer.from(buffer).toString('base64');
    return logoEnMemoria;
  } catch {
    return null;
  }
}

// Moneda de la cotización (por defecto soles)
export type Moneda = 'PEN' | 'USD';
const SIMBOLO: Record<Moneda, string> = { PEN: 'S/', USD: 'US$' };
const EN_LETRAS: Record<Moneda, string> = { PEN: 'SOLES', USD: 'DÓLARES AMERICANOS' };
const NOMBRE_MONEDA: Record<Moneda, string> = { PEN: 'SOLES', USD: 'DÓLARES' };

/** dd/mm/aaaa de una fecha YYYY-MM-DD (sin desfases de zona horaria). */
function fechaDMY(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function sumarDias(iso: string, dias: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

// Convierte número a letras en español (para la línea "SON {monto} SOLES")
function numeroALetras(num: number, moneda: Moneda = 'PEN'): string {
  const entero = Math.floor(num);
  const centavos = Math.round((num - entero) * 100);
  const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const decenas = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const especiales: Record<number, string> = {
    10: 'DIEZ', 11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
    16: 'DIECISEIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE', 20: 'VEINTE',
  };
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function tres(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    let r = '';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    if (c > 0) r += centenas[c] + ' ';
    if (resto <= 20 && especiales[resto]) r += especiales[resto];
    else if (resto < 30 && resto > 20) r += 'VEINTI' + unidades[resto - 20];
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      r += decenas[d];
      if (d > 2 && u > 0) r += ' Y ' + unidades[u];
      else if (d <= 1 && u > 0) r += unidades[u];
    }
    return r.trim();
  }

  let res = '';
  if (entero === 0) res = 'CERO';
  else if (entero < 1000) res = tres(entero);
  else {
    const miles = Math.floor(entero / 1000);
    const r = entero % 1000;
    if (miles === 1) res = 'MIL';
    else res = tres(miles) + ' MIL';
    if (r > 0) res += ' ' + tres(r);
  }

  return `SON ${res.trim()} Y ${centavos.toString().padStart(2, '0')}/100 ${EN_LETRAS[moneda]}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// GENERADOR PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
export async function generateCotizacionPDF(data: PDFData): Promise<jsPDF> {
  const { cliente, servicios, equipos, bancos, numero_cotizacion, notas, forma_pago } = data;
  const moneda: Moneda = data.moneda === 'USD' ? 'USD' : 'PEN';
  const simbolo = SIMBOLO[moneda];

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const W = 210;
  const H = 297;
  const M = 14;
  const contenido = W - M * 2;
  let y = M;

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CABECERA — Logo a la izquierda, caja con código a la derecha
  // ─────────────────────────────────────────────────────────────────────────
  const HEADER_TOP_H = 38;

  // Logo (izquierda) — respeta proporción original usando las dimensiones reales del PNG
  const logoB64 = await getLogoBase64();
  if (logoB64) {
    // Limitamos por altura (la caja del header tiene 38mm); el ancho se calcula
    // a partir de la proporción real del PNG para que no se vea estirado.
    const logoMaxH = 18;  // alto máximo del logo en mm (reducido para que no se vea grande)
    const dataUri = `data:image/png;base64,${logoB64}`;
    const props = doc.getImageProperties(dataUri);
    const aspect = props.width / props.height;
    const logoH = logoMaxH;
    const logoW = logoH * aspect;
    // Centrado vertical dentro de la caja del header (BOX_H = 30)
    const logoY = y + (30 - logoH) / 2;
    doc.addImage(dataUri, 'PNG', M, logoY, logoW, logoH, undefined, 'FAST');
  } else {
    setColor(doc, DARK);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('IDEALO', M + 3, y + 18);
  }

  // ─── Caja a la derecha con borde negro ───────────────────────────────────
  // Diseño: tres secciones separadas por líneas horizontales.
  // - Arriba: RUC (fondo blanco)
  // - Centro: banda gris recubriendo de borde a borde del recuadro, con "COTIZACIÓN"
  // - Abajo: código ID01-NNNNNNN (fondo blanco)
  const BOX_W = 60;
  const BOX_X = W - M - BOX_W;
  const BOX_H = 30;

  // 1) Banda gris central
  const bandY = y + 9;
  const bandH = 11;
  setFill(doc, '#dadada');
  doc.rect(BOX_X, bandY, BOX_W, bandH, 'F');

  // 2) Borde exterior (negro grueso)
  setDraw(doc, DARK);
  doc.setLineWidth(0.8);
  doc.rect(BOX_X, y, BOX_W, BOX_H, 'S');

  // 3) Líneas separadoras horizontales (delimitan la banda gris)
  doc.setLineWidth(0.5);
  doc.line(BOX_X, bandY,         BOX_X + BOX_W, bandY);
  doc.line(BOX_X, bandY + bandH, BOX_X + BOX_W, bandY + bandH);

  // RUC arriba
  setColor(doc, DARK);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('RUC 20611785381', BOX_X + BOX_W / 2, y + 5.5, { align: 'center' });

  // COTIZACIÓN — centrada en la banda gris
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('COTIZACIÓN', BOX_X + BOX_W / 2, bandY + bandH / 2 + 1.5, { align: 'center' });

  // Código de cotización (ID01-YYMMDD-NN) abajo
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  // Código de cotización abajo. Formato: ID01-YYMMDDNN (todo junto)
  // numero_cotizacion llega como "YYMMDD-NN"; quitamos el guion interno
  // para el código mostrado en el PDF.
  const codigo = `ID01-${(numero_cotizacion || '000000-01').replace('-', '')}`;
  doc.text(codigo, BOX_X + BOX_W / 2, y + BOX_H - 3, { align: 'center' });

  y += HEADER_TOP_H + 8;

  // ─────────────────────────────────────────────────────────────────────────
  // 2. DATOS DEL CLIENTE (izq) Y FECHAS (der)
  //
  // Prioridad: si hay RUC + razón social, usamos esos.
  // Caso contrario (solo hay DNI o nombre), usamos el documento como DNI y
  // el nombre del cliente. La detección es por longitud del documento:
  //   11 dígitos = RUC (empresa)   →  "RUC" + razón social
  //   8 dígitos  = DNI (persona)   →  "DNI" + nombre del cliente
  //   otro       = fallback a documento como viene + nombre
  // ─────────────────────────────────────────────────────────────────────────
  setColor(doc, DARK);
  doc.setFontSize(9);

  const docNumLimpio = (cliente.documento_identidad || '').replace(/\D/g, '');
  // OJO con la semántica del payload (que parece invertida):
  //  - cliente.nombre        → es la RAZÓN SOCIAL (form.nombre, label "Razón Social / Nombre")
  //  - cliente.razon_social  → es el NOMBRE DE CONTACTO (persona de contacto)
  // Renombramos para evitar confusión y prioridad correcta.
  const razonSocialReal = cliente.nombre || '';
  const personaContacto = (cliente as any).razon_social || '';
  const tipoDoc = ((cliente as any).tipo_doc || '').toLowerCase();

  // Reglas para la etiqueta del documento:
  //  - Si el número tiene 11 dígitos → es un RUC (empresa). Siempre.
  //  - Si el usuario eligió un tipo de documento en Notion (Pasaporte, C. Ext, DNI, RUC)
  //    lo respetamos.
  //  - Si no hay nada de eso, deducimos por el largo: 8 dígitos = DNI.
  //  - Resto: etiqueta genérica DOCUMENTO.
  let tipoDocLabel = 'DOCUMENTO';
  if (docNumLimpio.length === 11) {
    tipoDocLabel = 'RUC';
  } else if (tipoDoc.includes('pasap')) {
    tipoDocLabel = 'PASAPORTE';
  } else if (tipoDoc.includes('carnet') || tipoDoc.includes('extranj') || tipoDoc === 'ce') {
    tipoDocLabel = 'C. EXTRANJERÍA';
  } else if (tipoDoc.includes('ruc')) {
    tipoDocLabel = 'RUC';
  } else if (tipoDoc.includes('dni')) {
    tipoDocLabel = 'DNI';
  } else if (docNumLimpio.length === 8) {
    tipoDocLabel = 'DNI';
  }

  // Cómo se muestra el número del documento:
  //  - RUC/DNI: solo dígitos (limpio).
  //  - Pasaporte/Carnet: tal cual lo escribieron (puede tener letras/guiones).
  //  - Otro: lo que haya.
  const docOriginal = (cliente.documento_identidad || '').trim();
  const docMostrado = (tipoDocLabel === 'RUC' || tipoDocLabel === 'DNI')
    ? docNumLimpio
    : (docOriginal || docNumLimpio);

  // Nombre a mostrar: SIEMPRE la razón social si existe; caemos al nombre de
  // contacto solo cuando no hay razón social.
  const nombreMostrar = razonSocialReal || personaContacto;

  // Columna izquierda: DOCUMENTO / CLIENTE
  doc.setFont('helvetica', 'bold');
  doc.text(tipoDocLabel, M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(docMostrado, M + 28, y);

  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', M, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(nombreMostrar, M + 28, y + 5);

  // MÉTODO DE PAGO — debajo de CLIENTE (solo si se especificó)
  if (forma_pago) {
    doc.setFont('helvetica', 'bold');
    doc.text('MÉTODO DE PAGO', M, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(forma_pago, M + 33, y + 10);
  }

  // Columna derecha: FECHA EMISIÓN / FECHA VENCIMIENTO / MONEDA
  const colDerX = W / 2 + 10;
  // En hora de Perú: el PDF se genera en el servidor (UTC)
  // La fecha de emisión se puede elegir en el formulario (por defecto, hoy)
  const fechaISO = data.fecha && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha)
    ? data.fecha
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const fechaHoy = fechaDMY(fechaISO);
  const venceISO = data.vence && /^\d{4}-\d{2}-\d{2}$/.test(data.vence) && data.vence >= fechaISO ? data.vence : sumarDias(fechaISO, 15);
  const fechaVencimiento = fechaDMY(venceISO);

  doc.setFont('helvetica', 'bold');
  doc.text('FECHA EMISIÓN', colDerX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fechaHoy, colDerX + 38, y);

  doc.setFont('helvetica', 'bold');
  doc.text('FECHA VENCIMIENTO', colDerX, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(fechaVencimiento, colDerX + 38, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('MONEDA', colDerX, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(NOMBRE_MONEDA[moneda], colDerX + 38, y + 10);

  y += 18;

  // ─────────────────────────────────────────────────────────────────────────
  // 3. TABLA DE SERVICIOS — encabezado negro + filas + cuerpo grande vacío
  // ─────────────────────────────────────────────────────────────────────────
  const totalConIgv = Math.round(servicios.reduce((acc, s) => acc + (s.precio_con_igv || s.precio_base * 1.18) * s.cantidad, 0) * 100) / 100;
  const totalSinIgv = Math.round((totalConIgv / 1.18) * 100) / 100;
  const igvMonto    = Math.round((totalConIgv - totalSinIgv) * 100) / 100;

  // Filas: nombre arriba + descripción debajo, con Total a la derecha
  const COL_TOTAL = 30; // mm de ancho de la columna Total
  const COL_DESC  = contenido - COL_TOTAL;

  const tableBody: any[] = [];
  servicios.forEach((s) => {
    const precioConIgv = s.precio_con_igv || s.precio_base * 1.18;
    const total = Math.round(precioConIgv * s.cantidad * 100) / 100;
    tableBody.push([
      { content: s.nombre.toUpperCase(), styles: { fontStyle: 'bold', cellPadding: { top: 3, right: 3, bottom: 0.5, left: 3 } } },
      { content: total.toFixed(2), rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold', fontSize: 14 } },
    ]);
    tableBody.push([
      // Descripción: SIN negrita para que se distinga del título
      { content: (s.descripcion || '').toUpperCase(), styles: { fontStyle: 'normal', cellPadding: { top: 0.5, right: 3, bottom: 3, left: 3 } } },
    ]);
  });

  autoTable(doc, {
    startY: y,
    head: [['DESCRIPCIÓN:', 'TOTAL']],
    body: tableBody,
    theme: 'plain',
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      overflow: 'linebreak',
      font: 'helvetica',
      lineColor: hexToRgb(DARK),
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: hexToRgb(DARK),
      textColor: hexToRgb(WHITE),
      fontStyle: 'bold',
      fontSize: 9.5,
      halign: 'left',
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      lineWidth: 0.4,
      lineColor: hexToRgb(DARK),
    },
    bodyStyles: {
      fillColor: hexToRgb(WHITE),
      textColor: hexToRgb(DARK),
      lineColor: hexToRgb(DARK),
      lineWidth: 0.4,
    },
    columnStyles: {
      0: { cellWidth: COL_DESC },
      1: { cellWidth: COL_TOTAL, halign: 'center', valign: 'middle' },
    },
    margin: { left: M, right: M },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) {
        const rowIdx = data.row.index;
        if (rowIdx % 2 === 1) {
          // Fila de descripción: sin borde superior
          data.cell.styles.lineWidth = { top: 0, right: 0.4, bottom: 0.4, left: 0.4 } as any;
        } else {
          // Fila de nombre: sin borde inferior
          data.cell.styles.lineWidth = { top: 0.4, right: 0.4, bottom: 0, left: 0.4 } as any;
        }
      }
    },
    // El encabezado "TOTAL" debe ir centrado
    willDrawCell: (data) => {
      if (data.section === 'head' && data.column.index === 1) {
        data.cell.styles.halign = 'center';
      }
    },
  });

  const tableEndY = (doc as any).lastAutoTable.finalY;

  // ─────────────────────────────────────────────────────────────────────────
  // CÁLCULO DEL BLOQUE INFERIOR (Métodos / Equipos / Términos)
  //
  // Lo calculamos ANTES de dibujar la caja vacía, porque su altura determina
  // hasta dónde puede llegar la caja vacía. Luego anclamos el bloque inferior
  // pegado arriba del footer.
  // ─────────────────────────────────────────────────────────────────────────
  const FOOTER_H = 22;
  const footerTop = H - FOOTER_H;
  const PAD_BLOCK_FOOTER = 5;   // separación mínima del bloque al footer

  // Altura del bloque "Métodos de pago + Equipos" (cualquiera de las dos cols)
  let bancosH = 0;
  if (bancos && bancos.length > 0) {
    bancosH = 5 + bancos.length * (4 * 4.2 + 5);
  }
  let equiposH = 0;
  if (equipos && equipos.length > 0) {
    equiposH = 5 + equipos.length * 4.5;
  }
  const metodosEquiposH = Math.max(bancosH, equiposH);

  // Altura de términos y condiciones
  doc.setFontSize(8.5);
  const terminos = notas
    ? notas.split('\n').filter(Boolean)
    : [
        'Modificaciones de lo solicitado puede tener un coste adicional al prespuesto establecido',
        'Se requiere el 50% del pago total como anticipo para iniciar el proyecto.',
      ];
  let terminosTextH = 0;
  terminos.forEach(t => {
    const lines = doc.splitTextToSize(`- ${t}`, contenido - 3);
    terminosTextH += lines.length * 4.2;
  });
  const terminosH = 5 + 5 + terminosTextH;  // sep + título + texto

  const bloqueInferiorH = (metodosEquiposH > 0 ? metodosEquiposH + 8 : 0) + terminosH;

  // ─────────────────────────────────────────────────────────────────────────
  // CAJA VACÍA con bordes + zona "SON …" + GRAVADO/IGV/TOTAL
  // Todo unido a la tabla con bordes para que se vea como una sola estructura.
  //
  // Layout:
  //   [tableEndY]
  //   ┌─────────────────────────────┬──────────┐
  //   │  (espacio vacío para        │          │  ← caja vacía
  //   │   más servicios)            │          │
  //   ├─────────────────────────────┴──────────┤
  //   │      SON NOVENTA Y 00/100 SOLES        │  ← fila "SON ..."
  //   ├────────────────────────────┬───────────┤
  //   │                            │ GRAVADO   │
  //   │                            │ IGV 18%   │  ← totales finales
  //   │                            │ TOTAL     │
  //   └────────────────────────────┴───────────┘
  //
  // La caja vacía termina justo arriba de la fila "SON ...", que a su vez
  // está justo arriba del bloque de totales. El bloque entero termina X mm
  // arriba del bloque inferior (Métodos / Equipos).
  // ─────────────────────────────────────────────────────────────────────────
  const TOTS_H  = 16;   // alto del bloque GRAVADO/IGV/TOTAL
  const SON_H   = 6;    // alto de la fila "SON …"
  const SEP_TOTALS_BLOCK = 14;  // separación entre los totales y el bloque inferior

  const bloqueInferiorStartY = footerTop - PAD_BLOCK_FOOTER - bloqueInferiorH;
  const totsEndY = bloqueInferiorStartY - SEP_TOTALS_BLOCK;
  const totsTopY = totsEndY - TOTS_H;
  const sonBottomY = totsTopY;
  const sonTopY = sonBottomY - SON_H;
  const emptyBottomY = sonTopY;
  const emptyTopY = tableEndY;

  setDraw(doc, DARK);
  doc.setLineWidth(0.4);

  // ─── Caja vacía con bordes ─────────────────────────────────────────────
  if (emptyBottomY > emptyTopY) {
    // izquierda
    doc.line(M, emptyTopY, M, emptyBottomY);
    // divisor central
    doc.line(M + COL_DESC, emptyTopY, M + COL_DESC, emptyBottomY);
    // derecha
    doc.line(W - M, emptyTopY, W - M, emptyBottomY);
    // inferior (cierra la caja vacía)
    doc.line(M, emptyBottomY, W - M, emptyBottomY);
  }

  // ─── Fila "SON … SOLES" — caja con bordes ──────────────────────────────
  doc.line(M, sonTopY, M, sonBottomY);
  doc.line(W - M, sonTopY, W - M, sonBottomY);
  doc.line(M, sonBottomY, W - M, sonBottomY);

  setColor(doc, DARK);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(numeroALetras(totalConIgv, moneda), W / 2, sonTopY + 4, { align: 'center' });

  // ─── Bloque de totales — caja con bordes, derecha alineada ─────────────
  doc.line(M, totsTopY, M, totsEndY);
  doc.line(W - M, totsTopY, W - M, totsEndY);
  doc.line(M, totsEndY, W - M, totsEndY);

  doc.setFontSize(10);
  const labelX = W - M - 40;
  const monedaX = W - M - 18;
  const valueX = W - M - 2;
  const rowY = totsTopY + 4.5;

  doc.setFont('helvetica', 'bold');
  doc.text('GRAVADO', labelX, rowY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(simbolo, monedaX, rowY, { align: 'right' });
  doc.text(totalSinIgv.toFixed(2), valueX, rowY, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text('I.G.V. 18%', labelX, rowY + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(simbolo, monedaX, rowY + 5, { align: 'right' });
  doc.text(igvMonto.toFixed(2), valueX, rowY + 5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', labelX, rowY + 10, { align: 'right' });
  doc.text(simbolo, monedaX, rowY + 10, { align: 'right' });
  doc.text(totalConIgv.toFixed(2), valueX, rowY + 10, { align: 'right' });

  // ─────────────────────────────────────────────────────────────────────────
  // BLOQUE INFERIOR — anclado al pie de la página
  // (Métodos de pago + Equipos en 2 columnas, luego Términos)
  // ─────────────────────────────────────────────────────────────────────────
  y = bloqueInferiorStartY;

  const colW = contenido / 2;
  const colIzqX = M;
  const colDerX2 = M + colW;

  let yIzq = y;
  let yDer = y;

  // Métodos de pago (izquierda)
  if (bancos && bancos.length > 0) {
    setColor(doc, GOLD);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('METODOS DE PAGO', colIzqX, yIzq);
    yIzq += 5;
    setColor(doc, DARK);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    bancos.forEach(b => {
      doc.text(`${b.tipo_cuenta} ${b.nombre}`, colIzqX + 3, yIzq); yIzq += 4.2;
      doc.text(`Numero de cuenta: ${b.numero}.`, colIzqX + 3, yIzq); yIzq += 4.2;
      doc.text(`Número de cuenta interbancaria: ${b.cci}.`, colIzqX + 3, yIzq); yIzq += 4.2;
      doc.text(`Titular: ${b.titular}`, colIzqX + 3, yIzq); yIzq += 5;
    });
  }

  // Equipos a trabajar (derecha)
  if (equipos && equipos.length > 0) {
    setColor(doc, GOLD);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('EQUIPOS A TRABAJAR', colDerX2, yDer);
    yDer += 5;
    setColor(doc, DARK);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    equipos.forEach(eq => {
      doc.text(`- ${eq.nombre}`, colDerX2 + 3, yDer);
      yDer += 4.5;
    });
  }

  y = Math.max(yIzq, yDer);
  // Separación antes de términos (solo si hubo métodos/equipos arriba)
  if (metodosEquiposH > 0) y += 8;

  // Separador horizontal antes de términos
  setDraw(doc, '#cccccc');
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 5;

  setColor(doc, DARK);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TÉRMINOS Y CONDICIONES', M, y);
  y += 5;

  doc.setFontSize(8.5);
  terminos.forEach(t => {
    const lines = doc.splitTextToSize(`- ${t}`, contenido - 3);
    doc.text(lines, M + 3, y);
    y += lines.length * 4.2;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. FOOTER NEGRO con 3 columnas (íconos + datos)
  // (FOOTER_H y footerTop ya están definidos arriba)
  // ─────────────────────────────────────────────────────────────────────────
  const footerY = footerTop;

  setFill(doc, DARK);
  doc.rect(0, footerY, W, FOOTER_H, 'F');

  const iconY = footerY + 11;
  const textY = footerY + 12.5;

  const footItems = [
    { type: 'globe', text: 'idealofilms.com' },
    { type: 'mail',  text: 'administracion@idealofilms.com' },
    { type: 'phone', text: '+51 907 789 967' },
  ];

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const footColW = W / 3;
  const iconRadius = 2.6;
  const gapIconText = 3;

  footItems.forEach((item, i) => {
    const colCenterX = footColW * i + footColW / 2;
    const textWidth = doc.getStringUnitWidth(item.text) * 8.5 / doc.internal.scaleFactor;
    const groupWidth = iconRadius * 2 + gapIconText + textWidth;
    const groupStartX = colCenterX - groupWidth / 2;
    const iconCenterX = groupStartX + iconRadius;
    const textX = iconCenterX + iconRadius + gapIconText;
    drawFooterIcon(doc, item.type, iconCenterX, iconY);
    setColor(doc, WHITE);
    doc.text(item.text, textX, textY);
  });

  return doc;
}

// ── Íconos vectoriales del footer ────────────────────────────────────────────
function drawFooterIcon(doc: jsPDF, type: string, x: number, y: number) {
  const r = 2.6;
  setFill(doc, GOLD);
  doc.circle(x, y, r, 'F');
  doc.setDrawColor(...hexToRgb(DARK));
  doc.setLineWidth(0.35);
  if (type === 'globe') {
    doc.circle(x, y, 1.6, 'S');
    doc.line(x - 1.6, y, x + 1.6, y);
    doc.line(x, y - 1.6, x, y + 1.6);
    doc.ellipse(x, y, 0.8, 1.6, 'S');
  } else if (type === 'mail') {
    const w = 3.2; const h = 2.2;
    doc.rect(x - w / 2, y - h / 2, w, h, 'S');
    doc.line(x - w / 2, y - h / 2, x, y + 0.2);
    doc.line(x + w / 2, y - h / 2, x, y + 0.2);
  } else if (type === 'phone') {
    doc.setFillColor(...hexToRgb(DARK));
    doc.roundedRect(x - 1.2, y - 1.6, 2.4, 3.2, 0.4, 0.4, 'F');
    doc.setFillColor(...hexToRgb(GOLD));
    doc.rect(x - 0.8, y - 1.1, 1.6, 2.0, 'F');
  }
}

export interface Cliente {
  nombre: string;
  documento_identidad: string;
  razon_social: string;
  correo?: string;
  telefono?: string;
  tipo_doc?: string;
}

// id es string porque Notion usa UUIDs
export interface Servicio {
  id: string | number;
  nombre: string;
  descripcion: string;
  precio_base: number;
  precio_con_igv?: number;
  categoria: string;
  cantidad: number;
  notion_id?: string;
}

export interface Equipo {
  id: string | number;
  nombre: string;
  descripcion?: string;
  notion_id?: string;
}

export interface Banco {
  id: number;
  nombre: string;
  tipo_cuenta: string;
  numero: string;
  cci: string;
  titular: string;
}

export interface Cotizacion {
  id: string;
  numero_cotizacion: string;
  cliente_nombre: string;
  documento_identidad: string;
  razon_social: string;
  monto_total: number;
  fecha_emision: string;
  url_pdf: string | null;
  estado: string;
  creado_por: string;
  cliente_notion_id?: string | null;
}

export interface PDFData {
  cliente: Cliente;
  servicios: Servicio[];
  equipos: Equipo[];
  bancos: Banco[];
  numero_cotizacion: string;
  notas?: string;
  forma_pago?: string;
  /** Fecha de emisión YYYY-MM-DD (por defecto, hoy en Lima) */
  fecha?: string;
  /** Moneda: 'PEN' (S/, por defecto) o 'USD' (US$) */
  moneda?: 'PEN' | 'USD';
}

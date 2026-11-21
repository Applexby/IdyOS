// lib/serviciosVendidos.ts
// "Servicios vendidos" de un proyecto (campo de texto en PROYECTOS). Una línea
// por servicio, legible también desde Notion:
//   nombre | cantidad | precio unitario con IGV | descripción
// Lo escribe la cotización al generarse y se edita desde la ficha de Producción.
// Isomórfico: se usa en el servidor y en el navegador.

export interface ServicioVendido {
  nombre: string;
  cantidad: number;
  precio: number;      // unitario, con IGV (lo que paga el cliente)
  descripcion: string;
}

const limpio = (t: unknown) => String(t ?? '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = (t: unknown) => { const n = parseFloat(String(t ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };

export function serializarServicios(lista: ServicioVendido[]): string {
  return lista
    .filter(s => limpio(s.nombre))
    .map(s => [limpio(s.nombre), String(num(s.cantidad) || 1), String(Math.round(num(s.precio) * 100) / 100), limpio(s.descripcion)].join(' | '))
    .join('\n');
}

export function parsearServicios(texto: string | null | undefined): ServicioVendido[] {
  return (texto || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [nombre = '', cantidad = '1', precio = '0', ...resto] = l.split(' | ');
    return { nombre: nombre.trim(), cantidad: num(cantidad) || 1, precio: num(precio), descripcion: resto.join(' | ').trim() };
  });
}

export function totalServicios(lista: ServicioVendido[]): number {
  return Math.round(lista.reduce((acc, s) => acc + num(s.cantidad) * num(s.precio), 0) * 100) / 100;
}

/** Desde los servicios de una cotización (precio_base sin IGV o precio_con_igv). */
export function desdeCotizacion(servicios: any[]): ServicioVendido[] {
  return (servicios || []).map(s => ({
    nombre: limpio(s?.nombre),
    cantidad: num(s?.cantidad) || 1,
    precio: Math.round((num(s?.precio_con_igv) || num(s?.precio_base) * 1.18) * 100) / 100,
    descripcion: limpio(s?.descripcion),
  }));
}

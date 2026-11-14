// lib/equipo.ts
// Equipo activo del OS (las mismas personas que pueden iniciar sesión en
// lib/auth.ts). Se usa para el campo "Atendido por" de los leads, que en
// Notion es el select "OS creador de la cotizacion". Ese select guarda también
// a personas que ya no están y variantes del mismo nombre ("Isai" /
// "Isai Manzanares", "Administracion" / "Administración"); aquí se decide a quién
// se muestra y cómo se reconoce a la misma persona.
//
// Isomórfico (sin secretos): se usa en el servidor y en el navegador.

export const EQUIPO = [
  { nombre: 'Isai Manzanares', email: 'isai.manzanares@idealofilms.com' },
  { nombre: 'Rebeca Acosta',   email: 'rebeca.acosta@idealofilms.com' },
  { nombre: 'Administración',  email: 'administracion@idealofilms.com' },
] as const;

/** Clave de persona: primer nombre en minúsculas y sin tildes ("Isai Manzanares" → "isai"). */
export function clavePersona(nombre?: string | null): string {
  return (nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().split(/\s+/)[0] || '';
}

/** ¿Los dos textos se refieren a la misma persona? ("Isai" y "Isai Manzanares" → sí) */
export function mismaPersona(a?: string | null, b?: string | null): boolean {
  const ka = clavePersona(a);
  return !!ka && ka === clavePersona(b);
}

/**
 * Opción del select de Notion que corresponde a cada miembro activo. Si hay
 * varias variantes se prefiere el nombre completo exacto; si no hay ninguna,
 * se usa el nombre del equipo (Notion crea la opción al guardarlo).
 */
export function opcionesEquipo(opcionesNotion: string[]): { id: string; name: string }[] {
  return EQUIPO.map(m => {
    const variantes = opcionesNotion.filter(o => mismaPersona(o, m.nombre));
    const name = variantes.find(o => o === m.nombre) || variantes.sort((x, y) => y.length - x.length)[0] || m.nombre;
    return { id: name, name };
  });
}

/** Nombre (opción de Notion) del miembro activo que corresponde a un texto o correo. */
export function opcionDePersona(texto: string | null | undefined, opcionesNotion: string[]): string | null {
  if (!texto) return null;
  const base = texto.includes('@') ? EQUIPO.find(m => m.email === texto.toLowerCase())?.nombre || texto.split('@')[0].split('.')[0] : texto;
  return opcionesEquipo(opcionesNotion).find(o => mismaPersona(o.name, base))?.name || null;
}

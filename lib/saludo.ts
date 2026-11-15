// Cómo se presenta cada persona del equipo en los mensajes ({{nombre_usuario}}).
// "Isai Manzanares" → "Isai". La cuenta compartida de administración la usa Diana.
const POR_CORREO: Record<string, string> = {
  'administracion@idealofilms.com': 'Diana',
};

export function nombreSaludo(nombre?: string | null, email?: string | null): string {
  const porCorreo = email ? POR_CORREO[email.toLowerCase()] : undefined;
  if (porCorreo) return porCorreo;
  const primero = (nombre || '').trim().split(/\s+/)[0] || '';
  if (/^administraci[oó]n$/i.test(primero)) return 'Diana';
  return primero;
}

/** Reemplaza las variables de una plantilla. Las que no se conocen se quitan con cuidado. */
export function rellenarPlantilla(cuerpo: string, vars: Record<string, string | undefined>): string {
  let t = cuerpo.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => (vars[k.toLowerCase()] ?? '').trim());
  // "Hola , ¿cómo estás?" → "Hola, ¿cómo estás?" cuando falta el nombre
  t = t.replace(/ +([,.!?])/g, '$1').replace(/[ \t]{2,}/g, ' ');
  return t;
}

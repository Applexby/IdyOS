// electron/remoto.js
// Configuración remota: el programa NO lleva claves. Las pide al sistema web
// de Idealo (Vercel), donde ya están como variables de entorno:
//   • primera vez: con el correo y contraseña del usuario,
//   • cada arranque: con un token guardado (cifrado) para refrescarlas.
// Así, cambiar una clave o un usuario en Vercel llega a todos los PCs solo.

const config = require('./config');
const servidorConfig = process.env.IDYOS_SERVIDOR_CONFIG || (require('../package.json').idyos || {}).servidorConfig;

const RUTA = '/api/idyos/config';

async function pedir(cuerpo, ms) {
  if (!servidorConfig) throw new Error('No hay servidor de configuración definido.');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(servidorConfig.replace(/\/$/, '') + RUTA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: ctrl.signal,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { const e = new Error(d.error || 'Correo o contraseña incorrectos'); e.noAutorizado = true; throw e; }
    if (!r.ok || !d.env) throw new Error(d.error || `El servidor de configuración respondió ${r.status}`);
    return d;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Sin respuesta del servidor de configuración. Revisa tu conexión a internet.');
    if (e.noAutorizado || e.message?.startsWith('El servidor')) throw e;
    throw new Error(e.message?.includes('fetch') ? 'No se pudo conectar. Revisa tu conexión a internet.' : e.message);
  } finally { clearTimeout(t); }
}

function aplicar(d) {
  config.setConexion({ ...d.env, usuarios: d.usuarios || [] });
  config.setTokenRemoto(d.token || '');
}

/** Primera vez: inicia sesión y guarda la configuración. */
async function entrar(email, password) {
  const d = await pedir({ email, password }, 20_000);
  aplicar(d);
  return d.usuario;
}

/** En cada arranque: refresca la configuración si hay internet. Nunca bloquea el inicio. */
async function refrescar() {
  const token = config.getTokenRemoto();
  if (!token) return { ok: false };
  try {
    aplicar(await pedir({ token }, 8_000));
    return { ok: true };
  } catch (e) {
    // Acceso retirado o sesión vencida (90 días): se borran las claves de este PC
    // y se vuelve a pedir el inicio de sesión.
    if (e.noAutorizado) config.borrarConexion();
    return { ok: false, error: e.message };
  }
}

module.exports = { disponible: !!servidorConfig, servidorConfig, entrar, refrescar };

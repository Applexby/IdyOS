// electron/config.js
// Configuración local de IdyOS en %APPDATA%/IdyOS/config.json.
//
// • Credenciales (tokens de Notion, Cloudinary, CODART, usuarios) se cifran con
//   safeStorage (DPAPI de Windows: solo se pueden leer con la cuenta de Windows
//   que las guardó). Nunca van dentro del .exe ni en el repositorio.
// • Preferencias del programa (actualizaciones, ventana…) en texto plano.

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Campos de conexión que se pasan como variables de entorno al servidor local. */
const CAMPOS = [
  { key: 'NOTION_TOKEN', grupo: 'Notion', label: 'Token de integración', secreto: true, requerido: true },
  { key: 'NOTION_DB_CLIENTES', grupo: 'Notion', label: 'BD Clientes', requerido: true },
  { key: 'NOTION_DB_SERVICIOS', grupo: 'Notion', label: 'BD Servicios', requerido: true },
  { key: 'NOTION_DB_EQUIPOS', grupo: 'Notion', label: 'BD Equipos', requerido: true },
  { key: 'NOTION_DB_COTIZACIONES', grupo: 'Notion', label: 'BD Cotizaciones', requerido: true },
  { key: 'NOTION_DB_PIPELINE', grupo: 'Notion', label: 'BD Proyectos / Pipeline' },
  { key: 'NOTION_DB_CAMPANAS', grupo: 'Notion', label: 'BD Campañas' },
  { key: 'NOTION_DB_CAJA', grupo: 'Notion', label: 'BD Caja chica' },
  { key: 'NOTION_DB_METAS', grupo: 'Notion', label: 'BD Metas' },
  { key: 'NOTION_DB_NOTAS', grupo: 'Notion', label: 'BD Notas' },
  { key: 'CLOUDINARY_CLOUD_NAME', grupo: 'Cloudinary (PDFs)', label: 'Cloud name', requerido: true },
  { key: 'CLOUDINARY_API_KEY', grupo: 'Cloudinary (PDFs)', label: 'API key', requerido: true },
  { key: 'CLOUDINARY_API_SECRET', grupo: 'Cloudinary (PDFs)', label: 'API secret', secreto: true, requerido: true },
  { key: 'CODART_API_TOKEN', grupo: 'CODART (SUNAT / RENIEC)', label: 'Token', secreto: true },
];

const PREFERENCIAS_POR_DEFECTO = {
  iniciarConWindows: true,   // abrir IdyOS (en la bandeja) al iniciar Windows
  segundoPlano: true,        // al cerrar la ventana, seguir abierto en la bandeja
  mensajesSegundoPlano: true, // Messenger/Instagram siguen cargados para avisar
  mensajesCanales: [],       // canales de Mensajes ya usados (se precargan al abrir)
  autoBuscar: true,          // buscar actualizaciones automáticamente
  intervaloHoras: 6,         // cada cuántas horas
  autoDescargar: true,       // descargar en segundo plano al encontrarla
  canal: 'latest',           // 'latest' (estable) | 'beta'
  notificaciones: true,      // notificación de Windows al haber versión nueva
  ultimaBusqueda: 0,
  ventana: null,             // { x, y, width, height, maximizada }
};

const archivo = () => path.join(app.getPath('userData'), 'config.json');

let datos = null;

function leer() {
  if (datos) return datos;
  try { datos = JSON.parse(fs.readFileSync(archivo(), 'utf8')); }
  catch { datos = {}; }
  datos.preferencias = { ...PREFERENCIAS_POR_DEFECTO, ...(datos.preferencias || {}) };
  datos.cifrado = datos.cifrado || {};
  return datos;
}

function guardar() {
  fs.mkdirSync(path.dirname(archivo()), { recursive: true });
  const tmp = archivo() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 2));
  fs.renameSync(tmp, archivo());
}

function cifrar(texto) {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(texto).toString('base64');
  }
  return 'b64:' + Buffer.from(texto, 'utf8').toString('base64');
}

function descifrar(valor) {
  if (!valor) return '';
  try {
    if (valor.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(valor.slice(4), 'base64'));
    if (valor.startsWith('b64:')) return Buffer.from(valor.slice(4), 'base64').toString('utf8');
  } catch { /* otra cuenta de Windows o archivo dañado */ }
  return '';
}

/** Conexión (credenciales) descifrada: { NOTION_TOKEN: '...', ..., usuarios: [...] } */
function getConexion() {
  const d = leer();
  if (!d.cifrado.conexion) return { usuarios: [] };
  try {
    const c = JSON.parse(descifrar(d.cifrado.conexion) || '{}');
    return { usuarios: [], ...c };
  } catch { return { usuarios: [] }; }
}

function setConexion(conexion) {
  const d = leer();
  const limpio = {};
  for (const { key } of CAMPOS) {
    const v = String(conexion[key] ?? '').trim();
    if (v) limpio[key] = v;
  }
  limpio.usuarios = (conexion.usuarios || [])
    .filter(u => u && u.email && u.hash)
    .map(u => ({
      nombre: String(u.nombre || u.email).trim(),
      email: String(u.email).trim().toLowerCase(),
      hash: String(u.hash),
      rol: u.rol === 'admin' ? 'admin' : 'user',
    }));
  d.cifrado.conexion = cifrar(JSON.stringify(limpio));
  guardar();
}

function faltantes() {
  const c = getConexion();
  const f = CAMPOS.filter(x => x.requerido && !c[x.key]).map(x => x.label);
  if (!c.usuarios.length) f.push('al menos un usuario');
  return f;
}

/** Secreto de sesión propio de esta instalación (firma las cookies de NextAuth). */
function getSecretoSesion() {
  const d = leer();
  let s = descifrar(d.cifrado.secretoSesion);
  if (!s) {
    s = crypto.randomBytes(32).toString('base64');
    d.cifrado.secretoSesion = cifrar(s);
    guardar();
  }
  return s;
}

/** Token para refrescar la configuración remota (ver remoto.js). */
function getTokenRemoto() { return descifrar(leer().cifrado.tokenRemoto); }
function setTokenRemoto(token) {
  const d = leer();
  if (token) d.cifrado.tokenRemoto = cifrar(token); else delete d.cifrado.tokenRemoto;
  guardar();
}
function borrarConexion() {
  const d = leer();
  delete d.cifrado.conexion;
  delete d.cifrado.tokenRemoto;
  guardar();
}

function getPreferencias() { return { ...leer().preferencias }; }

function setPreferencias(cambios) {
  const d = leer();
  const p = { ...d.preferencias };
  for (const k of Object.keys(PREFERENCIAS_POR_DEFECTO)) if (k in cambios) p[k] = cambios[k];
  p.intervaloHoras = Math.min(48, Math.max(1, Number(p.intervaloHoras) || 6));
  p.canal = p.canal === 'beta' ? 'beta' : 'latest';
  d.preferencias = p;
  guardar();
  return { ...p };
}

/** Variables de entorno para el servidor local de Next.js. */
function entornoServidor() {
  const c = getConexion();
  const env = {};
  for (const { key } of CAMPOS) if (c[key]) env[key] = c[key];
  env.IDYOS_USUARIOS = JSON.stringify(c.usuarios || []);
  env.NEXTAUTH_SECRET = getSecretoSesion();
  return env;
}

module.exports = {
  CAMPOS, getConexion, setConexion, faltantes,
  getTokenRemoto, setTokenRemoto, borrarConexion,
  getPreferencias, setPreferencias, entornoServidor,
};

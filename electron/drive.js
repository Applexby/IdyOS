// electron/drive.js
// Google Drive para contratos y facturas (sin Cloudinary).
//
// • Conexión: una sola vez por PC, con la cuenta de Google de la empresa. Se
//   abre el navegador (exigencia de Google para apps de escritorio), se acepta
//   y el permiso queda cifrado en este PC (safeStorage). La credencial de la
//   app (GOOGLE_DRIVE_CLIENT_ID / _SECRET) viene de Vercel como las demás.
// • Subida: el archivo va a la carpeta configurada, p. ej.
//     IDEALO/1. AREA CONTABLE/FACTURA DE VENTAS/{año}/{MES}
//   Las carpetas fijas deben existir; las de {año} y {MES} se crean si faltan
//   con el mismo estilo de nombre (MAYÚSCULAS, "SETIEMBRE").
// • Ver: IdyOS descarga el PDF con su permiso y lo abre en su visor, sin
//   depender de tener la sesión de Google abierta.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { shell } = require('electron');
const config = require('./config');

const SCOPE = 'https://www.googleapis.com/auth/drive';
const API = 'https://www.googleapis.com/drive/v3';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files';
const CARPETA = 'application/vnd.google-apps.folder';
const ATAJO = 'application/vnd.google-apps.shortcut';

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

const credencial = () => {
  const c = config.getConexion();
  return { id: c.GOOGLE_DRIVE_CLIENT_ID || '', secreto: c.GOOGLE_DRIVE_CLIENT_SECRET || '' };
};

let acceso = null; // { token, vence }

function estado() {
  const d = config.getDrive();
  return { disponible: !!credencial().id, conectado: !!d.refresh, email: d.email || '', rutas: config.getPreferencias().driveRutas };
}

// ── Conexión (OAuth para apps de escritorio: navegador + 127.0.0.1 + PKCE) ──
let conectando = null;
function conectar() {
  if (conectando) return conectando;
  const { id, secreto } = credencial();
  if (!id) return Promise.reject(new Error('Falta la credencial de Google Drive (GOOGLE_DRIVE_CLIENT_ID en Vercel).'));
  const verificador = crypto.randomBytes(48).toString('base64url');
  const reto = crypto.createHash('sha256').update(verificador).digest('base64url');
  const estadoOAuth = crypto.randomBytes(16).toString('hex');

  conectando = new Promise((resolve, reject) => {
    let terminado = false;
    const servidor = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
      const codigo = u.searchParams.get('code');
      const ok = codigo && u.searchParams.get('state') === estadoOAuth;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>IdyOS</title><body style="font-family:system-ui;display:grid;place-items:center;height:90vh;color:#222">
        <div style="text-align:center"><h2>${ok ? 'Google Drive conectado ✓' : 'No se pudo conectar'}</h2><p>${ok ? 'Ya puedes cerrar esta pestaña y volver a IdyOS.' : 'Vuelve a IdyOS e inténtalo otra vez.'}</p></div></body>`);
      if (terminado) return;
      terminado = true;
      servidor.close();
      clearTimeout(limite);
      if (!ok) { reject(new Error(u.searchParams.get('error') === 'access_denied' ? 'Cancelaste el permiso en Google.' : 'Google no devolvió el permiso.')); return; }
      try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code: codigo, client_id: id, client_secret: secreto, code_verifier: verificador, grant_type: 'authorization_code', redirect_uri: redireccion }),
        });
        const t = await r.json();
        if (!r.ok || !t.refresh_token) throw new Error(t.error_description || t.error || 'Google no entregó el permiso permanente.');
        acceso = { token: t.access_token, vence: Date.now() + (t.expires_in - 60) * 1000 };
        const yo = await api('/about?fields=user(emailAddress)').catch(() => null);
        config.setDrive({ refresh: t.refresh_token, email: yo?.user?.emailAddress || '' });
        resolve(estado());
      } catch (e) { reject(e); }
    });
    let redireccion = '';
    const limite = setTimeout(() => { if (!terminado) { terminado = true; servidor.close(); reject(new Error('Se agotó el tiempo para conectar (5 minutos).')); } }, 5 * 60_000);
    servidor.listen(0, '127.0.0.1', () => {
      redireccion = `http://127.0.0.1:${servidor.address().port}`;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: id, redirect_uri: redireccion, response_type: 'code', scope: SCOPE,
        access_type: 'offline', prompt: 'consent', code_challenge: reto, code_challenge_method: 'S256', state: estadoOAuth,
      });
      shell.openExternal(url);
    });
  }).finally(() => { conectando = null; });
  return conectando;
}

async function desconectar() {
  const d = config.getDrive();
  if (d.refresh) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(d.refresh), { method: 'POST' }).catch(() => {});
  config.setDrive(null);
  acceso = null;
  return estado();
}

async function token() {
  if (acceso && acceso.vence > Date.now()) return acceso.token;
  const { id, secreto } = credencial();
  const { refresh } = config.getDrive();
  if (!refresh) throw new Error('Google Drive no está conectado (Configuración → Google Drive).');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secreto, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (t.error === 'invalid_grant') { config.setDrive(null); throw new Error('El permiso de Google Drive venció o se retiró. Vuelve a conectarlo en Configuración.'); }
    throw new Error(t.error_description || 'No se pudo renovar el permiso de Google Drive.');
  }
  acceso = { token: t.access_token, vence: Date.now() + (t.expires_in - 60) * 1000 };
  return acceso.token;
}

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta.startsWith('http') ? ruta : API + ruta, {
    ...opciones, headers: { Authorization: `Bearer ${await token()}`, ...(opciones.headers || {}) },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error?.message || `Google Drive respondió ${r.status}`);
  }
  return opciones.crudo ? r : r.json();
}

// ── Carpetas ────────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const cache = new Map(); // ruta normalizada → id

async function hijas(padre) {
  const q = `'${esc(padre)}' in parents and trashed = false and (mimeType = '${CARPETA}' or mimeType = '${ATAJO}')`;
  const d = await api('/files?' + new URLSearchParams({
    q, fields: 'files(id,name,mimeType,shortcutDetails)', pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
  }));
  return (d.files || []).map(f => f.mimeType === ATAJO
    ? (f.shortcutDetails?.targetMimeType === CARPETA ? { id: f.shortcutDetails.targetId, name: f.name } : null)
    : { id: f.id, name: f.name }).filter(Boolean);
}

/** Primera carpeta: en "Mi unidad" o, si no está ahí, entre "Compartido conmigo". */
async function raiz(nombre) {
  const enMiUnidad = (await hijas('root')).find(f => norm(f.name) === norm(nombre));
  if (enMiUnidad) return enMiUnidad.id;
  const d = await api('/files?' + new URLSearchParams({
    q: `sharedWithMe = true and mimeType = '${CARPETA}' and name = '${esc(nombre)}' and trashed = false`,
    fields: 'files(id,name)', pageSize: '10', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
  }));
  return d.files?.[0]?.id || null;
}

function segmentos(ruta, fecha) {
  const [anio, mes] = [fecha.slice(0, 4), Number(fecha.slice(5, 7))];
  return String(ruta || '').split('/').map(s => s.trim()).filter(Boolean).map(s => ({
    nombre: s.replace(/\{a(ñ|n)o\}/gi, anio).replace(/\{mes\}/gi, MESES[mes - 1]),
    crear: /\{(a(ñ|n)o|mes)\}/i.test(s), // solo las carpetas de año/mes se crean solas
  }));
}

async function carpetaDestino(ruta, fecha) {
  const partes = segmentos(ruta, fecha);
  if (!partes.length) throw new Error('No hay carpeta configurada para este documento.');
  const clave = norm(partes.map(p => p.nombre).join('/'));
  if (cache.has(clave)) return cache.get(clave);
  // La ruta empieza en la primera carpeta que esté en "Mi unidad" (o su acceso
  // directo) o en "Compartido conmigo"; si la primera no está, se prueba con
  // la siguiente (así sirve tanto la ruta completa como la del acceso directo).
  let id = null, desde = 0;
  for (; desde < partes.length && !partes[desde].crear; desde++) {
    id = await raiz(partes[desde].nombre);
    if (id) break;
  }
  if (!id) throw new Error(`No encontré la carpeta "${partes[0].nombre}" en tu Drive (ni en Mi unidad ni en Compartido conmigo).`);
  for (const p of partes.slice(desde + 1)) {
    const lista = await hijas(id);
    const objetivo = norm(p.nombre);
    // "SETIEMBRE" y "SEPTIEMBRE" se tratan como la misma carpeta
    const hallada = lista.find(f => norm(f.name) === objetivo || norm(f.name).replace('SEPTIEMBRE', 'SETIEMBRE') === objetivo);
    if (hallada) { id = hallada.id; continue; }
    if (!p.crear) throw new Error(`No encontré la carpeta "${p.nombre}" dentro de la ruta configurada.`);
    const nueva = await api('/files?supportsAllDrives=true', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: p.nombre, mimeType: CARPETA, parents: [id] }),
    });
    id = nueva.id;
  }
  cache.set(clave, id);
  return id;
}

// ── Subir y ver ─────────────────────────────────────────────────────────────
const hoyLima = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/** tipo: 'contrato' | 'factura'. datos: ArrayBuffer/Uint8Array. */
async function subir({ tipo, nombre, mime, datos, fecha }) {
  const rutas = config.getPreferencias().driveRutas || {};
  const ruta = rutas[tipo];
  if (!ruta) throw new Error(`No hay carpeta configurada para ${tipo}.`);
  const f = /^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? fecha : hoyLima();
  const padre = await carpetaDestino(ruta, f);
  const cuerpo = Buffer.from(datos);
  if (!cuerpo.length) throw new Error('El archivo está vacío.');
  if (cuerpo.length > 200 * 1024 * 1024) throw new Error('El archivo pesa más de 200 MB.');
  const tipoMime = mime || 'application/pdf';
  // Subida reanudable (sirve para archivos grandes y conexiones inestables)
  const inicio = await api(`${SUBIDA}?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink`, {
    method: 'POST', crudo: true,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': tipoMime, 'X-Upload-Content-Length': String(cuerpo.length) },
    body: JSON.stringify({ name: String(nombre || 'documento.pdf').slice(0, 200), parents: [padre] }),
  });
  const destino = inicio.headers.get('location');
  if (!destino) throw new Error('Google Drive no aceptó la subida.');
  let ultimo = null;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(destino, { method: 'PUT', headers: { 'Content-Type': tipoMime, 'Content-Length': String(cuerpo.length) }, body: cuerpo });
      if (r.ok) {
        const d = await r.json();
        return { id: d.id, nombre: d.name, url: d.webViewLink || `https://drive.google.com/file/d/${d.id}/view`, carpeta: segmentos(ruta, f).map(s => s.nombre).join(' › ') };
      }
      ultimo = new Error(`Google Drive respondió ${r.status}`);
    } catch (e) { ultimo = e; }
    await new Promise(r => setTimeout(r, 1000 * (intento + 1)));
  }
  throw ultimo || new Error('No se pudo subir el archivo.');
}

/** Id de archivo de un enlace de Drive (o null si no es de Drive). */
function idDeEnlace(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/d\/([\w-]{10,})/);
    return m ? m[1] : u.searchParams.get('id');
  } catch { return null; }
}

/** Descarga un archivo de Drive a una carpeta temporal y devuelve su ruta. */
async function descargar(url) {
  const id = idDeEnlace(url);
  if (!id || !config.getDrive().refresh) return null;
  const meta = await api(`/files/${id}?fields=name,mimeType&supportsAllDrives=true`);
  if (meta.mimeType?.startsWith('application/vnd.google-apps')) return null; // Docs/Sheets: se abren en el navegador
  const r = await api(`/files/${id}?alt=media&supportsAllDrives=true`, { crudo: true });
  const dir = path.join(os.tmpdir(), 'idyos-drive');
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `${id}-${String(meta.name || 'documento').replace(/[\\/:*?"<>|]+/g, '_')}`);
  fs.writeFileSync(archivo, Buffer.from(await r.arrayBuffer()));
  return { archivo, esPdf: meta.mimeType === 'application/pdf' };
}

module.exports = { estado, conectar, desconectar, subir, descargar, idDeEnlace, MESES };

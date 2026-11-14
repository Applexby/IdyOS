// electron/updater.js
// Actualizaciones automáticas desde GitHub Releases (repo Applexby/IdyOS).
//
// • Búsqueda manual (botón en Ajustes del programa / menú).
// • Búsqueda automática cada N horas (6 por defecto). Se comprueba cada 15 min
//   si ya pasó el intervalo, así funciona aunque el PC haya estado suspendido.
// • Estado único que se envía a la interfaz (punto en el engranaje, barra de
//   aviso) y notificación de Windows.

const { app, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const config = require('./config');

let estado = {
  fase: 'inactivo', // inactivo | buscando | disponible | descargando | descargada | al-dia | error | no-soportado
  version: app.getVersion(),
  nueva: null,      // { version, fecha, notas }
  progreso: 0,      // 0-100
  error: null,
  ultimaBusqueda: 0,
};

let emitir = () => {};
let reloj = null;
let notificada = null;

function set(cambios) {
  estado = { ...estado, ...cambios };
  emitir(estado);
}

function notasTexto(info) {
  const n = info?.releaseNotes;
  if (!n) return '';
  if (Array.isArray(n)) return n.map(x => x.note || '').join('\n\n');
  return String(n);
}

function avisar(titulo, cuerpo) {
  if (!config.getPreferencias().notificaciones || !Notification.isSupported()) return;
  new Notification({ title: titulo, body: cuerpo }).show();
}

function aplicarPreferencias() {
  const p = config.getPreferencias();
  autoUpdater.autoDownload = !!p.autoDescargar;
  autoUpdater.allowPrerelease = p.canal === 'beta';
  autoUpdater.channel = p.canal === 'beta' ? 'beta' : 'latest';
}

async function buscar({ manual = false } = {}) {
  if (!app.isPackaged) {
    set({ fase: 'no-soportado', error: 'Las actualizaciones solo funcionan en el programa instalado (no en modo desarrollo).' });
    return estado;
  }
  if (['buscando', 'descargando'].includes(estado.fase)) return estado;
  aplicarPreferencias();
  const ahora = Date.now();
  config.setPreferencias({ ultimaBusqueda: ahora });
  set({ fase: 'buscando', error: null, ultimaBusqueda: ahora, manual });
  try {
    let reloj;
    const limite = new Promise((_, rej) => { reloj = setTimeout(() => rej(new Error('TIEMPO')), 60_000); });
    await Promise.race([autoUpdater.checkForUpdates(), limite]).finally(() => clearTimeout(reloj));
  } catch (e) {
    set({ fase: 'error', error: mensajeError(e) });
  }
  return estado;
}

function mensajeError(e) {
  const m = e?.message || String(e);
  if (m === 'TIEMPO' || /ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|net::ERR/.test(m)) {
    return 'No se pudo conectar con el servidor de actualizaciones. Revisa tu conexión a internet.';
  }
  if (/404|latest\.yml|Cannot find/i.test(m)) {
    return 'Aún no hay versiones publicadas en GitHub (o el repositorio no es público).';
  }
  return m.split('\n')[0].slice(0, 300);
}

// Para probar la interfaz sin publicar nada: IDYOS_SIMULAR_ACTUALIZACION=1
function simular() {
  const nueva = { version: '9.9.9', fecha: new Date().toISOString(), notas: '<p>Versión simulada para pruebas.</p>' };
  set({ fase: 'descargando', nueva, progreso: 0 });
  let p = 0;
  const t = setInterval(() => {
    p += 25;
    if (p >= 100) { clearInterval(t); set({ fase: 'descargada', progreso: 100 }); avisar('IdyOS listo para actualizar', 'Versión 9.9.9 (simulada).'); }
    else set({ progreso: p });
  }, 800);
}

async function descargar() {
  if (estado.fase !== 'disponible') return estado;
  set({ fase: 'descargando', progreso: 0 });
  try { await autoUpdater.downloadUpdate(); }
  catch (e) { set({ fase: 'error', error: mensajeError(e) }); }
  return estado;
}

function instalar() {
  if (estado.fase !== 'descargada') return;
  if (process.env.IDYOS_SIMULAR_ACTUALIZACION) return;
  // Cierra, instala en silencio y vuelve a abrir el programa.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

function programar() {
  clearInterval(reloj);
  reloj = setInterval(() => {
    const p = config.getPreferencias();
    if (!p.autoBuscar) return;
    if (Date.now() - (p.ultimaBusqueda || 0) >= p.intervaloHoras * 3600_000) buscar();
  }, 15 * 60_000);
}

function iniciar(enviar) {
  emitir = enviar;
  estado.ultimaBusqueda = config.getPreferencias().ultimaBusqueda || 0;

  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('update-available', info => {
    const nueva = { version: info.version, fecha: info.releaseDate, notas: notasTexto(info) };
    set({ fase: autoUpdater.autoDownload ? 'descargando' : 'disponible', nueva, progreso: 0 });
    if (notificada !== info.version) {
      notificada = info.version;
      avisar('Nueva versión de IdyOS', `La versión ${info.version} está disponible.`);
    }
  });
  autoUpdater.on('update-not-available', () => set({ fase: 'al-dia', nueva: null }));
  autoUpdater.on('download-progress', p => set({ fase: 'descargando', progreso: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', info => {
    set({ fase: 'descargada', progreso: 100, nueva: { ...(estado.nueva || {}), version: info.version } });
    avisar('IdyOS listo para actualizar', `Reinicia el programa para instalar la versión ${info.version}.`);
  });
  autoUpdater.on('error', e => set({ fase: 'error', error: mensajeError(e) }));

  programar();
  if (process.env.IDYOS_SIMULAR_ACTUALIZACION) { setTimeout(simular, 3000); return; }

  // Al abrir el programa se comprueba una vez (unos segundos después de arrancar)
  setTimeout(() => { if (config.getPreferencias().autoBuscar) buscar(); }, 8000);
}

module.exports = {
  iniciar, buscar, descargar, instalar,
  getEstado: () => estado,
  alCambiarPreferencias: () => { aplicarPreferencias(); programar(); },
};

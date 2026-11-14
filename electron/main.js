// electron/main.js
// Proceso principal de IdyOS (programa de escritorio de Idealo Films).
//
//   splash → (¿falta configuración? → ventana "Conexión y usuarios")
//          → servidor local (Next.js + API Notion/Cloudinary) en 127.0.0.1
//          → ventana principal
//
// Las funciones de escritorio (actualizaciones, caché, conexión) llegan a la
// interfaz por electron/preload.js como window.idyos.

const {
  app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeTheme, screen,
} = require('electron');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const config = require('./config');
const servidor = require('./server');
const updater = require('./updater');
const remoto = require('./remoto');

const ICONO = path.join(__dirname, 'icon.png');
const FONDO = () => (nativeTheme.shouldUseDarkColors ? '#0b0b0c' : '#f9fafb');

let splash = null;
let principal = null;
let ventanaConexion = null;
let conexionDesbloqueada = false;
let saliendo = false;
let loginPendiente = null; // { email, password } solo en memoria, para el login automático

// ── Una sola instancia ──────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = principal || ventanaConexion || splash;
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
}

app.commandLine.appendSwitch('lang', 'es-PE'); // fechas y textos del sistema en español
app.setAppUserModelId('com.idealofilms.idyos'); // notificaciones de Windows con nombre/ícono

// ── Ventanas ────────────────────────────────────────────────────────────────
function crearSplash() {
  splash = new BrowserWindow({
    width: 340, height: 260, frame: false, resizable: false, show: false,
    backgroundColor: '#0b0b0c', icon: ICONO, skipTaskbar: false,
    webPreferences: { sandbox: true },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash?.show());
  splash.on('closed', () => { splash = null; });
}

function cerrarSplash() { if (splash) { splash.destroy(); splash = null; } }

function estadoVentanaValido(v) {
  if (!v || !v.width || !v.height) return false;
  return screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return v.x >= a.x - 50 && v.y >= a.y - 50 && v.x < a.x + a.width && v.y < a.y + a.height;
  });
}

function crearPrincipal(url) {
  const guardada = config.getPreferencias().ventana;
  const v = estadoVentanaValido(guardada) ? guardada : { width: 1440, height: 900 };

  principal = new BrowserWindow({
    ...v, minWidth: 1024, minHeight: 640, show: false,
    title: 'IdyOS', icon: ICONO, backgroundColor: FONDO(),
    autoHideMenuBar: true,
    frame: false,             // sin barra de Windows: la interfaz dibuja los botones tipo Mac
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      spellcheck: true,
      plugins: true,            // visor de PDF (vista previa de cotizaciones)
    },
  });
  if (guardada?.maximizada) principal.maximize();

  const origen = new URL(url).origin;
  // Enlaces externos (WhatsApp, Notion, etc.) → navegador / app del sistema.
  // PDFs de Cloudinary → visor dentro del programa.
  principal.webContents.setWindowOpenHandler(({ url: destino }) => {
    if (destino.startsWith(origen)) return { action: 'allow' };
    if (esPdf(destino)) { abrirVisorPdf(destino); return { action: 'deny' }; }
    shell.openExternal(destino);
    return { action: 'deny' };
  });
  principal.webContents.on('will-navigate', (e, destino) => {
    if (!destino.startsWith(origen)) { e.preventDefault(); shell.openExternal(destino); }
  });

  // La ventana principal solo se muestra con sesión iniciada. Si la app está en
  // /login (sin sesión o tras cerrar sesión) se oculta y se abre la ventanita
  // de login (transparente, ver abrirLogin).
  let lista = false;
  const visibilidad = () => {
    if (!principal) return;
    const url = principal.webContents.getURL();
    if (esPaginaLogin(url)) {
      if (principal.isVisible()) principal.hide();
      if (!loginPendiente) abrirLogin(origen);
    } else {
      cerrarLogin();
      if (lista && !principal.isVisible()) { cerrarSplash(); principal.show(); }
    }
  };
  principal.once('ready-to-show', () => { lista = true; visibilidad(); });
  principal.webContents.on('did-navigate', visibilidad);
  principal.webContents.on('did-navigate-in-page', visibilidad);
  const avisarMax = () => principal?.webContents.send('idyos:ventana', { maximizada: principal.isMaximized(), pantallaCompleta: principal.isFullScreen() });
  principal.on('maximize', avisarMax);
  principal.on('unmaximize', avisarMax);
  principal.on('enter-full-screen', avisarMax);
  principal.on('leave-full-screen', avisarMax);

  // Inicio de sesión automático justo después de la bienvenida (un solo login)
  principal.webContents.on('did-finish-load', () => {
    if (!loginPendiente || !principal) return;
    if (!principal.webContents.getURL().includes('/login')) return;
    const { email, password } = loginPendiente;
    loginPendiente = null;
    principal.webContents.executeJavaScript(`(async () => {
      try {
        const { csrfToken } = await (await fetch('/api/auth/csrf')).json();
        const r = await fetch('/api/auth/callback/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ csrfToken, email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)}, json: 'true' }),
        });
        if (r.ok) { location.href = '/'; return true; }
      } catch (e) {}
      return false;
    })()`).then(ok => { if (!ok) abrirLogin(origen); }).catch(() => abrirLogin(origen));
  });
  principal.on('close', () => {
    const b = principal.getNormalBounds();
    config.setPreferencias({ ventana: { ...b, maximizada: principal.isMaximized() } });
  });
  principal.on('closed', () => { principal = null; });
  principal.loadURL(url);
}

// ── Ventana de login: pequeña, sin marco y transparente (vidrio real) ──────
let ventanaLogin = null;
let loginCompletado = false;

function esPaginaLogin(u) {
  try { return new URL(u).pathname.startsWith('/login'); } catch { return false; }
}

function abrirLogin(origen) {
  if (ventanaLogin) { ventanaLogin.show(); ventanaLogin.focus(); return; }
  loginCompletado = false;
  ventanaLogin = new BrowserWindow({
    width: 420, height: 580, resizable: false, maximizable: false, fullscreenable: false,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: true,
    show: false, title: 'IdyOS', icon: ICONO, center: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  // Windows 11: vidrio acrílico (difumina lo que hay detrás de la ventana)
  if (process.platform === 'win32') { try { ventanaLogin.setBackgroundMaterial('acrylic'); } catch { /* Windows 10 */ } }
  ventanaLogin.loadURL(`${origen}/login?ventana=1`);
  ventanaLogin.once('ready-to-show', () => { cerrarSplash(); ventanaLogin?.show(); });
  ventanaLogin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  const esta = ventanaLogin;
  esta.on('closed', () => {
    if (ventanaLogin === esta) ventanaLogin = null;
    // La cerró el usuario sin entrar y no hay nada más abierto → salir
    if (!loginCompletado && !saliendo && !(principal && principal.isVisible())) app.quit();
  });
}

function cerrarLogin() {
  if (!ventanaLogin) return;
  loginCompletado = true;
  const w = ventanaLogin;
  ventanaLogin = null;
  w.close();
}

function esPdf(u) {
  try {
    const x = new URL(u);
    return x.hostname === 'res.cloudinary.com' || x.pathname.toLowerCase().endsWith('.pdf');
  } catch { return false; }
}

function abrirVisorPdf(url) {
  const w = new BrowserWindow({
    width: 1000, height: 1100, title: 'IdyOS · PDF', icon: ICONO, autoHideMenuBar: true,
    parent: principal || undefined,
    webPreferences: { sandbox: true, plugins: true },
  });
  w.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' }; });
  w.loadURL(url);
}

function abrirConexion() {
  if (ventanaConexion) { ventanaConexion.focus(); return; }
  conexionDesbloqueada = false;
  ventanaConexion = new BrowserWindow({
    width: 860, height: 820, minWidth: 700, title: 'IdyOS · Conexión y usuarios',
    icon: ICONO, backgroundColor: FONDO(), autoHideMenuBar: true, frame: false,
    parent: principal || undefined, modal: false,
    webPreferences: { preload: path.join(__dirname, 'setup-preload.js'), contextIsolation: true, sandbox: true },
  });
  ventanaConexion.loadFile(path.join(__dirname, 'setup.html'));
  ventanaConexion.once('ready-to-show', () => cerrarSplash());
  const esta = ventanaConexion;
  esta.on('closed', () => {
    // Si al cerrarse ya no es "la" ventana de conexión, la cerró el propio
    // programa tras guardar/entrar (y está arrancando): no hay que salir.
    const cerradaPorElPrograma = ventanaConexion !== esta;
    if (!cerradaPorElPrograma) ventanaConexion = null;
    conexionDesbloqueada = false;
    // Primera vez sin configurar y el usuario la cierra: no queda nada abierto → salir
    if (!cerradaPorElPrograma && !principal && !saliendo) app.quit();
  });
}

// ── Arranque ────────────────────────────────────────────────────────────────
async function arrancar({ refrescar = true } = {}) {
  // Claves al día desde el sistema web (si hay internet); si no, las guardadas.
  if (refrescar && config.getTokenRemoto()) {
    if (!splash && !principal) crearSplash();
    await remoto.refrescar();
  }
  if (config.faltantes().length) { abrirConexion(); cerrarSplash(); return; }
  if (!splash && !principal) crearSplash();
  try {
    const url = await servidor.iniciar(config.entornoServidor());
    if (principal) principal.loadURL(url);
    else crearPrincipal(url);
  } catch (e) {
    const r = await dialog.showMessageBox({
      type: 'error', title: 'IdyOS', message: 'No se pudo iniciar IdyOS',
      detail: e?.message || String(e), buttons: ['Reintentar', 'Abrir registros', 'Salir'],
    });
    if (r.response === 0) return arrancar();
    if (r.response === 1) await shell.openPath(servidor.rutaLogs());
    cerrarSplash();
    app.quit();
  }
}

function enviarATodos(canal, dato) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(canal, dato);
  }
}

function menu() {
  const plantilla = [
    {
      label: 'IdyOS',
      submenu: [
        { label: 'Ajustes del programa', accelerator: 'CmdOrCtrl+,', click: () => principal?.webContents.executeJavaScript("location.href='/programa'") },
        { label: 'Buscar actualizaciones', click: () => updater.buscar({ manual: true }) },
        { label: 'Conexión y usuarios…', click: abrirConexion },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
      ],
    },
    { label: 'Editar', submenu: [{ role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

// ── IPC: la ventanita de login avisa que la sesión se inició ───────────────
ipcMain.handle('idyos:login-ok', () => {
  loginCompletado = true;
  if (principal) {
    const origen = new URL(principal.webContents.getURL()).origin;
    principal.loadURL(`${origen}/`); // al llegar a "/" se muestra y se cierra el login
  }
});

// ── IPC: botones de ventana (rojo / amarillo / verde) ──────────────────────
ipcMain.handle('idyos:ventana', (e, accion) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return null;
  if (accion === 'cerrar') w.close();
  else if (accion === 'minimizar') w.minimize();
  else if (accion === 'maximizar') {
    if (w.isFullScreen()) w.setFullScreen(false);
    else if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  }
  return { maximizada: w.isMaximized(), pantallaCompleta: w.isFullScreen() };
});

// ── IPC: interfaz principal (window.idyos) ─────────────────────────────────
ipcMain.handle('idyos:info', () => ({
  version: app.getVersion(),
  plataforma: process.platform,
  empaquetado: app.isPackaged,
  preferencias: config.getPreferencias(),
  actualizacion: updater.getEstado(),
  rutaDatos: app.getPath('userData'),
}));
ipcMain.handle('idyos:buscar', () => updater.buscar({ manual: true }));
ipcMain.handle('idyos:descargar', () => updater.descargar());
ipcMain.handle('idyos:instalar', () => { saliendo = true; updater.instalar(); });
ipcMain.handle('idyos:preferencias', (_e, cambios) => {
  const permitidas = ['autoBuscar', 'intervaloHoras', 'autoDescargar', 'canal', 'notificaciones'];
  const limpio = Object.fromEntries(Object.entries(cambios || {}).filter(([k]) => permitidas.includes(k)));
  const p = config.setPreferencias(limpio);
  updater.alCambiarPreferencias();
  return p;
});
ipcMain.handle('idyos:abrir-conexion', () => abrirConexion());
ipcMain.handle('idyos:limpiar-cache', async () => {
  await servidor.detener();
  servidor.limpiarCache();
  await principal?.webContents.session.clearCache();
  const url = await servidor.iniciar(config.entornoServidor());
  principal?.loadURL(url);
  return true;
});
ipcMain.handle('idyos:abrir-carpeta', (_e, cual) =>
  shell.openPath(cual === 'logs' ? servidor.rutaLogs() : app.getPath('userData')));
ipcMain.handle('idyos:reiniciar', () => { saliendo = true; app.relaunch(); app.exit(0); });

// ── IPC: ventana "Conexión y usuarios" ─────────────────────────────────────
const soloConexion = (e) => ventanaConexion && e.sender === ventanaConexion.webContents;
const requiereAdmin = () => config.getConexion().usuarios.some(u => u.rol === 'admin');

ipcMain.handle('setup:estado', (e) => {
  if (!soloConexion(e)) return {};
  return {
    requiereAdmin: requiereAdmin() && !conexionDesbloqueada,
    primeraVez: config.faltantes().length > 0,
    remoto: remoto.disponible,
    servidor: remoto.servidorConfig,
    sincronizado: !!config.getTokenRemoto(),
  };
});
ipcMain.handle('setup:entrar-remoto', async (e, email, password) => {
  if (!soloConexion(e)) return { ok: false };
  try {
    await remoto.entrar(String(email || '').trim(), String(password || ''));
    loginPendiente = { email: String(email || '').trim(), password: String(password || '') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (config.faltantes().length) return { ok: false, error: 'El sistema web no devolvió todas las claves: ' + config.faltantes().join(', ') };
  if (!principal && !splash) crearSplash();
  const w = ventanaConexion;
  ventanaConexion = null;
  w?.close();
  await arrancar({ refrescar: false });
  return { ok: true };
});
ipcMain.handle('setup:desbloquear', async (e, email, password) => {
  if (!soloConexion(e)) return { ok: false };
  const u = config.getConexion().usuarios.find(x => x.email === String(email || '').trim().toLowerCase());
  if (u && u.rol === 'admin' && await bcrypt.compare(String(password || ''), u.hash)) {
    conexionDesbloqueada = true;
    return { ok: true };
  }
  await new Promise(r => setTimeout(r, 800));
  return { ok: false, error: 'Credenciales incorrectas o el usuario no es administrador.' };
});
ipcMain.handle('setup:cargar', (e) => {
  if (!soloConexion(e) || (requiereAdmin() && !conexionDesbloqueada)) return { ok: false };
  return { ok: true, campos: config.CAMPOS, conexion: config.getConexion(), faltantes: config.faltantes() };
});
ipcMain.handle('setup:hash', (e, password) => (soloConexion(e) ? bcrypt.hash(String(password), 12) : null));
ipcMain.handle('setup:probar-notion', async (e, token) => {
  if (!soloConexion(e)) return { ok: false };
  try {
    const r = await fetch('https://api.notion.com/v1/users/me', {
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' },
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.message || `Error ${r.status}` };
    return { ok: true, nombre: d.name || d.bot?.workspace_name || 'integración' };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('setup:guardar', async (e, conexion) => {
  if (!soloConexion(e) || (requiereAdmin() && !conexionDesbloqueada)) return { ok: false, error: 'Sin permiso' };
  config.setConexion(conexion || {});
  const f = config.faltantes();
  if (f.length) return { ok: false, error: 'Falta: ' + f.join(', ') };
  if (!principal && !splash) crearSplash(); // que siempre quede una ventana abierta
  const w = ventanaConexion;
  ventanaConexion = null; // evita que "closed" cierre el programa
  w?.close();
  await arrancar({ refrescar: false });
  return { ok: true };
});
ipcMain.handle('setup:exportar', async (e, conexion) => {
  if (!soloConexion(e) || (requiereAdmin() && !conexionDesbloqueada)) return { ok: false };
  const r = await dialog.showSaveDialog(ventanaConexion, {
    title: 'Exportar configuración de IdyOS', defaultPath: 'idyos-configuracion.json',
    filters: [{ name: 'Configuración IdyOS', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, JSON.stringify({ idyos: 1, ...conexion }, null, 2));
  return { ok: true };
});
ipcMain.handle('setup:importar', async (e) => {
  if (!soloConexion(e) || (requiereAdmin() && !conexionDesbloqueada)) return { ok: false };
  const r = await dialog.showOpenDialog(ventanaConexion, {
    title: 'Importar configuración de IdyOS', properties: ['openFile'],
    filters: [{ name: 'Configuración IdyOS', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try {
    const d = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    delete d.idyos;
    return { ok: true, conexion: d };
  } catch { return { ok: false, error: 'El archivo no es una configuración válida.' }; }
});
ipcMain.handle('setup:cerrar', (e) => { if (soloConexion(e)) ventanaConexion?.close(); });

// ── Ciclo de vida ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  menu();
  updater.iniciar(estado => enviarATodos('idyos:actualizacion', estado));
  arrancar();
});

app.on('before-quit', () => { saliendo = true; });
app.on('window-all-closed', async () => {
  await servidor.detener();
  app.quit();
});
app.on('will-quit', () => { servidor.detener(); });

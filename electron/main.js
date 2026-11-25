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
  app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeTheme, screen, desktopCapturer, Tray, nativeImage, Notification,
} = require('electron');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const config = require('./config');
const servidor = require('./server');
const updater = require('./updater');
const remoto = require('./remoto');
const mensajes = require('./mensajes');
const drive = require('./drive');

const ICONO = path.join(__dirname, 'icon.png');
const FONDO = () => (nativeTheme.shouldUseDarkColors ? '#0b0b0c' : '#f9fafb');

let splash = null;
let principal = null;
let ventanaConexion = null;
let conexionDesbloqueada = false;
let saliendo = false;
// Abierto por Windows al iniciar sesión (--oculto): arranca directo en la bandeja
const INICIO_OCULTO = process.argv.includes('--oculto');
let ocultaEnBandeja = INICIO_OCULTO;
let bandeja = null;
let loginPendiente = null;
let mensajesPrecargados = false; // { email, password } solo en memoria, para el login automático

// ── Una sola instancia ──────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => mostrarPrincipal());
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
// Seguro: la ventanita de arranque nunca se queda junto a una ventana ya abierta
// (a veces la principal se mostraba por otro camino y el splash quedaba pegado).
setInterval(() => {
  if (!splash) return;
  const otra = (principal && !principal.isDestroyed() && principal.isVisible())
    || (ventanaLogin && !ventanaLogin.isDestroyed() && ventanaLogin.isVisible())
    || (ventanaConexion && !ventanaConexion.isDestroyed() && ventanaConexion.isVisible());
  if (otra) cerrarSplash();
}, 1500).unref?.();

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
      autoplayPolicy: "no-user-gesture-required", // el sonido de los avisos suena aunque no hayas tocado la ventana
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
  // Enlaces de WhatsApp (wa.me, api.whatsapp.com…) → el WhatsApp de IdyOS
  const abrirEnWhatsapp = (destino) => {
    let u; try { u = new URL(destino); } catch { return false; }
    const host = u.hostname.replace(/^www\./, '');
    let telefono = '';
    if (host === 'wa.me') telefono = u.pathname.replace(/\D/g, '');
    else if (host === 'api.whatsapp.com' || (host === 'web.whatsapp.com' && u.pathname.startsWith('/send'))) telefono = (u.searchParams.get('phone') || '').replace(/\D/g, '');
    else return false;
    mostrarPrincipal();
    principal?.webContents.send('idyos:abrir-whatsapp', { telefono, texto: u.searchParams.get('text') || '' });
    return true;
  };
  principal.webContents.setWindowOpenHandler(({ url: destino }) => {
    if (destino.startsWith(origen)) return { action: 'allow' };
    if (abrirEnWhatsapp(destino)) return { action: 'deny' };
    if (destino.startsWith('blob:')) {
      // "Ampliar" la vista previa de la cotización
      return { action: 'allow', overrideBrowserWindowOptions: {
        width: 900, height: 1050, frame: true, autoHideMenuBar: true, title: 'IdyOS · Vista previa', icon: ICONO,
        webPreferences: { sandbox: true, plugins: true },
      } };
    }
    if (esPdf(destino)) { abrirVisorPdf(destino); return { action: 'deny' }; }
    if (drive.idDeEnlace(destino) && drive.estado().conectado) { abrirDeDrive(destino); return { action: 'deny' }; }
    shell.openExternal(destino);
    return { action: 'deny' };
  });
  principal.webContents.on('will-navigate', (e, destino) => {
    if (!destino.startsWith(origen)) { e.preventDefault(); if (!abrirEnWhatsapp(destino)) shell.openExternal(destino); }
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
      if (!mensajesPrecargados) {
        mensajesPrecargados = true;
        const p = config.getPreferencias();
        if (p.mensajesSegundoPlano) mensajes.precargar(p.mensajesCanales);
      }
      if (lista && !principal.isVisible() && !ocultaEnBandeja) { cerrarSplash(); principal.show(); }
      if (lista && ocultaEnBandeja) cerrarSplash();
    }
  };
  principal.once('ready-to-show', () => { lista = true; visibilidad(); });
  principal.on('show', cerrarSplash);
  mensajes.setVistaLimpia(config.getPreferencias().mensajesVistaLimpia !== false);
  mensajes.iniciar(principal, (evento, datos) => {
    // Al cerrar IdyOS la ventana ya no existe: no hay a quién avisar
    if (!principal || principal.isDestroyed() || principal.webContents.isDestroyed()) return;
    if (evento === 'abrir') { mostrarPrincipal(); principal?.webContents.send('idyos:mensajes', { evento: 'abrir', ...datos }); return; }
    principal?.webContents.send('idyos:mensajes', { evento, ...datos });
  });
  principal.webContents.on('did-navigate', visibilidad);
  principal.webContents.on('did-navigate-in-page', visibilidad);
  // Al salir de Mensajes, quitar Messenger/Instagram/TikTok de encima siempre
  const salirDeMensajes = () => { if (!enMensajes()) mensajes.ocultar(); };
  principal.webContents.on('did-navigate', salirDeMensajes);
  principal.webContents.on('did-navigate-in-page', salirDeMensajes);
  principal.webContents.on('did-start-navigation', (ev, url, _enPagina, principalFrame) => {
    const u = ev?.url || url, mf = ev?.isMainFrame ?? principalFrame;
    try { if (mf !== false && !new URL(u).pathname.startsWith('/mensajes')) mensajes.ocultar(); } catch { /* noop */ }
  });
  const avisarMax = () => principal?.webContents.send('idyos:ventana', { maximizada: principal.isMaximized(), pantallaCompleta: principal.isFullScreen() });
  principal.on('maximize', avisarMax);
  principal.on('unmaximize', avisarMax);
  principal.on('enter-full-screen', avisarMax);
  principal.on('leave-full-screen', avisarMax);

  // Personalización elegida en el primer arranque (color, tema, vidrio, foto)
  principal.webContents.on('did-finish-load', () => {
    const p = personalizacionPendiente;
    if (!p || !principal) return;
    const enLogin = esPaginaLogin(principal.webContents.getURL());
    const js = `(() => { try {
      localStorage.setItem('os_tema', ${JSON.stringify(p.tema || 'claro')});
      localStorage.setItem('os_acento', ${JSON.stringify(p.acento || 'idealo')});
      localStorage.setItem('os_vidrio', ${JSON.stringify(p.vidrio ? '1' : '0')});
      document.documentElement.classList.toggle('dark', ${JSON.stringify(p.tema)} === 'oscuro');
      document.documentElement.dataset.acento = ${JSON.stringify(p.acento || 'idealo')};
      document.documentElement.dataset.vidrio = ${JSON.stringify(p.vidrio ? '1' : '0')};
      window.dispatchEvent(new Event('idyos:tema'));
    } catch (e) {} })()`;
    principal.webContents.executeJavaScript(js).catch(() => {});
    if (enLogin) return; // la foto se sube cuando ya hay sesión
    personalizacionPendiente = null;
    if (p.foto) {
      principal.webContents.executeJavaScript(`fetch('/api/perfil/foto', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen: ${JSON.stringify(p.foto)} }) }).then(r => r.json()).then(d => {
          if (d.url) { localStorage.setItem('idyos:avatar', d.url); window.dispatchEvent(new Event('idyos:avatar')); }
        }).catch(() => {})`).catch(() => {});
    }
  });

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
  principal.on('close', (e) => {
    const b = principal.getNormalBounds();
    config.setPreferencias({ ventana: { ...b, maximizada: principal.isMaximized() } });
    // Con "segundo plano" activado, cerrar solo oculta la ventana: sigue en la bandeja
    if (!saliendo && config.getPreferencias().segundoPlano && bandeja) {
      e.preventDefault();
      ocultarEnBandeja();
    }
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
  ocultaEnBandeja = false; // tras iniciar sesión la ventana principal debe verse
  if (ventanaLogin) { ventanaLogin.show(); ventanaLogin.focus(); return; }
  loginCompletado = false;
  ventanaLogin = new BrowserWindow({
    width: 860, height: 520, resizable: false, maximizable: false, fullscreenable: false,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    show: false, title: 'IdyOS', icon: ICONO, center: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  // Sin material acrílico de Windows: rellena todo el rectángulo de la ventana y
  // dejaba un borde cuadrado alrededor de las esquinas redondeadas. Con la
  // ventana transparente, la tarjeta redondeada es toda la ventana y el lado de
  // vidrio deja ver lo que hay detrás.
  // Vidrio gaussiano: captura de lo que hay detrás (antes de mostrar la
  // ventana) que la página dibuja desenfocada en el lado izquierdo.
  const fondo = capturarFondo(ventanaLogin.getBounds()).catch(() => null);
  // La imagen se envía una vez; al mover la ventana solo la posición
  const enviarFondo = async (soloPosicion) => {
    const f = await fondo;
    if (!f || !ventanaLogin) return;
    const b = ventanaLogin.getBounds();
    const pos = { dx: b.x - f.x, dy: b.y - f.y };
    ventanaLogin.webContents.send('idyos:fondo-login', soloPosicion ? pos : { ...f, ...pos });
  };
  ventanaLogin.webContents.on('did-finish-load', () => enviarFondo(false));
  ventanaLogin.on('move', () => enviarFondo(true));
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

async function capturarFondo(bounds) {
  const d = screen.getDisplayMatching(bounds);
  // Media resolución basta: la imagen se muestra desenfocada
  const fuentes = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(d.size.width * d.scaleFactor / 2), height: Math.round(d.size.height * d.scaleFactor / 2) },
  });
  const f = fuentes.find(x => String(x.display_id) === String(d.id)) || fuentes[0];
  if (!f || f.thumbnail.isEmpty()) return null;
  return {
    imagen: 'data:image/jpeg;base64,' + f.thumbnail.toJPEG(65).toString('base64'),
    x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height,
  };
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

// Archivo de Google Drive: se descarga con el permiso de IdyOS y se abre en su
// visor (o con el programa del sistema si no es PDF). Si falla, en el navegador.
async function abrirDeDrive(url) {
  try {
    const d = await drive.descargar(url);
    if (!d) { shell.openExternal(url); return; }
    if (d.esPdf) abrirVisorPdf(require('url').pathToFileURL(d.archivo).href);
    else shell.openPath(d.archivo);
  } catch { shell.openExternal(url); }
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

let modoVista = false; // vista previa del primer arranque: no guarda ni cambia nada

function abrirConexion({ vista = false } = {}) {
  if (ventanaConexion) { ventanaConexion.focus(); return; }
  conexionDesbloqueada = false;
  modoVista = vista;
  const grande = vista || config.faltantes().length;
  ventanaConexion = new BrowserWindow({
    width: grande ? 1000 : 860, height: grande ? 660 : 820, minWidth: 700, title: 'IdyOS · Conexión y usuarios',
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
function mostrarPrincipal() {
  ocultaEnBandeja = false;
  if (ventanaLogin) { ventanaLogin.show(); ventanaLogin.focus(); return; }
  if (principal) {
    if (esPaginaLogin(principal.webContents.getURL())) { abrirLogin(new URL(principal.webContents.getURL()).origin); return; }
    if (principal.isMinimized()) principal.restore();
    principal.show(); principal.focus();
  } else if (ventanaConexion) ventanaConexion.focus();
}

function ocultarEnBandeja() {
  ocultaEnBandeja = true;
  principal?.hide();
}

function cerrarSesionDesdeBandeja() {
  if (!principal) return;
  principal.webContents.executeJavaScript(`(async () => {
    try {
      const { csrfToken } = await (await fetch('/api/auth/csrf')).json();
      await fetch('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken }) });
    } catch (e) {}
    location.href = '/login';
  })()`).catch(() => {});
  ocultaEnBandeja = false;
}

function crearBandeja() {
  if (bandeja) return;
  const icono = nativeImage.createFromPath(ICONO).resize({ width: 16, height: 16 });
  bandeja = new Tray(icono);
  bandeja.setToolTip('IdyOS');
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mostrar IdyOS', click: mostrarPrincipal },
    { label: 'Buscar actualizaciones', click: () => updater.buscar({ manual: true }) },
    { type: 'separator' },
    { label: 'Cerrar sesión', click: cerrarSesionDesdeBandeja },
    { label: 'Salir', click: () => { saliendo = true; app.quit(); } },
  ]));
  bandeja.on('click', mostrarPrincipal);
  bandeja.on('double-click', mostrarPrincipal);
}

/** Abrir IdyOS (en la bandeja) al iniciar Windows. */
function aplicarInicioConWindows() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  app.setLoginItemSettings({ openAtLogin: !!config.getPreferencias().iniciarConWindows, args: ['--oculto'] });
}

async function arrancar({ refrescar = true } = {}) {
  // Claves al día desde el sistema web (si hay internet); si no, las guardadas.
  if (refrescar && config.getTokenRemoto()) {
    if (!splash && !principal && !ocultaEnBandeja) crearSplash();
    await remoto.refrescar();
  }
  if (config.faltantes().length) { ocultaEnBandeja = false; abrirConexion(); cerrarSplash(); return; }
  if (!splash && !principal && !ocultaEnBandeja) crearSplash();
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

// ── IPC: Mensajes (Messenger / Instagram dentro de IdyOS) ───────────────────
const esPrincipal = (e) => principal && e.sender === principal.webContents;
// La vista solo puede verse en la pantalla Mensajes: si llega tarde una orden
// de mostrar (al cambiar rápido de pantalla), se ignora.
const enMensajes = () => { try { return new URL(principal.webContents.getURL()).pathname.startsWith('/mensajes'); } catch { return false; } };
ipcMain.handle('meta:mostrar', (e, canal, limites, modo) => {
  if (!esPrincipal(e) || !mensajes.CANALES[canal] || !enMensajes()) return;
  mensajes.mostrar(canal, limites, modo === 'avisos' ? 'avisos' : 'chats');
  const usados = config.getPreferencias().mensajesCanales || [];
  if (!usados.includes(canal)) config.setPreferencias({ mensajesCanales: [...usados, canal] });
});
ipcMain.handle('meta:mover', (e, limites) => { if (esPrincipal(e)) mensajes.moverA(limites); });
ipcMain.handle('meta:ocultar', (e) => {
  if (!esPrincipal(e)) return;
  mensajes.ocultar();
  mensajes.cerrarAvisos();
  if (!config.getPreferencias().mensajesSegundoPlano) mensajes.cerrarTodo();
});
ipcMain.handle('meta:recargar', (e, canal, modo) => { if (esPrincipal(e)) mensajes.recargar(canal, modo); });
ipcMain.handle('meta:leer', (e, canal) => (esPrincipal(e) ? mensajes.leerChat(canal) : null));
ipcMain.handle('meta:pegar', (e, canal, texto) => (esPrincipal(e) ? mensajes.pegar(canal, String(texto || '')) : false));
ipcMain.handle('meta:chat-actual', (e, canal) => (esPrincipal(e) && mensajes.CANALES[canal] ? mensajes.chatActual(canal) : null));
ipcMain.handle('meta:abrir-chat', (e, canal, telefono, texto) => (esPrincipal(e) ? mensajes.abrirChat(canal, telefono, texto) : false));

// ── Número de avisos sobre el icono de la barra de tareas
ipcMain.on('idyos:insignia', (e, imagen, total) => {
  if (!esPrincipal(e) || !principal) return;
  const n = Math.max(0, Number(total) || 0);
  try { app.setBadgeCount(n); } catch { /* no soportado */ }
  if (process.platform === 'win32') {
    const img = n && typeof imagen === 'string' && imagen.startsWith('data:image/png') ? nativeImage.createFromDataURL(imagen) : null;
    principal.setOverlayIcon(img, n ? `${n} avisos` : '');
  }
});

// ── Adjuntos de plantillas: se descargan una vez a esta PC y se arrastran al chat
const carpetaAdjuntos = () => { const d = path.join(app.getPath('userData'), 'adjuntos'); fs.mkdirSync(d, { recursive: true }); return d; };
const nombreSeguro = n => String(n || 'archivo').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'archivo';
ipcMain.handle('idyos:adjunto', async (e, url, nombre) => {
  if (!esPrincipal(e)) return null;
  let u; try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== 'https:' || !/(^|\.)cloudinary\.com$/.test(u.hostname)) return null;
  const destino = path.join(carpetaAdjuntos(), nombreSeguro(nombre || decodeURIComponent(u.pathname.split('/').pop())));
  try { if (fs.statSync(destino).size > 0) return destino; } catch { /* no existe */ }
  const { net } = require('electron');
  const r = await net.fetch(u.toString());
  if (!r.ok) return null;
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  return destino;
});
// Arrastrar un archivo descargado (al chat de WhatsApp, al Explorador…)
ipcMain.on('idyos:arrastrar', (e, archivo) => {
  if (!esPrincipal(e) || !archivo || !String(archivo).startsWith(carpetaAdjuntos())) return;
  let icono = /\.(png|jpe?g|webp|gif)$/i.test(archivo) ? nativeImage.createFromPath(archivo) : nativeImage.createFromPath(ICONO);
  if (!icono.isEmpty()) icono = icono.resize({ width: 64 });
  e.sender.startDrag({ file: archivo, icon: icono });
});
ipcMain.handle('idyos:mostrar-archivo', (e, archivo) => {
  if (esPrincipal(e) && archivo && String(archivo).startsWith(carpetaAdjuntos())) shell.showItemInFolder(archivo);
});
ipcMain.handle('meta:captura', (e) => (esPrincipal(e) ? mensajes.captura() : null));
ipcMain.handle('meta:memoria', (e) => (esPrincipal(e) ? mensajes.memoriaMB() : {}));
ipcMain.handle('meta:liberar', (e) => { if (esPrincipal(e)) mensajes.liberarMemoria(); return true; });
ipcMain.handle('meta:no-leidos', (e) => (esPrincipal(e) ? mensajes.getNoLeidos() : {}));
ipcMain.handle('meta:tema', (e, t) => {
  if (!esPrincipal(e)) return null;
  // t: { activo, acento, oscuro }
  if (t && typeof t.activo === 'boolean') config.setPreferencias({ mensajesTema: t.activo });
  const activo = config.getPreferencias().mensajesTema;
  mensajes.setTema(activo && t?.acento ? { acento: t.acento, oscuro: !!t.oscuro, acentoTexto: t.acentoTexto } : null);
  return activo;
});
ipcMain.handle('meta:vista-limpia', (e, v) => {
  if (!esPrincipal(e)) return null;
  if (typeof v === 'boolean') { config.setPreferencias({ mensajesVistaLimpia: v }); mensajes.setVistaLimpia(v); }
  return mensajes.getVistaLimpia();
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
  const permitidas = ['autoBuscar', 'intervaloHoras', 'autoDescargar', 'canal', 'notificaciones', 'iniciarConWindows', 'segundoPlano', 'mensajesSegundoPlano'];
  const limpio = Object.fromEntries(Object.entries(cambios || {}).filter(([k]) => permitidas.includes(k)));
  const p = config.setPreferencias(limpio);
  updater.alCambiarPreferencias();
  aplicarInicioConWindows();
  return p;
});
// Google Drive (contratos y facturas)
ipcMain.handle('drive:estado', (e) => (esPrincipal(e) ? drive.estado() : null));
ipcMain.handle('drive:conectar', async (e) => {
  if (!esPrincipal(e)) return null;
  try { return { ok: true, ...(await drive.conectar()) }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('drive:desconectar', async (e) => (esPrincipal(e) ? drive.desconectar() : null));
ipcMain.handle('drive:rutas', (e, rutas) => {
  if (!esPrincipal(e)) return null;
  config.setPreferencias({ driveRutas: { ...config.getPreferencias().driveRutas, ...(rutas || {}) } });
  return drive.estado();
});
ipcMain.handle('drive:subir', async (e, datos) => {
  if (!esPrincipal(e)) return { ok: false, error: 'No permitido' };
  try { return { ok: true, ...(await drive.subir(datos || {})) }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('drive:ver', (e, url) => { if (esPrincipal(e)) abrirDeDrive(String(url || '')); return true; });

ipcMain.handle('idyos:abrir-conexion', () => abrirConexion());
ipcMain.handle('idyos:ver-bienvenida', () => abrirConexion({ vista: true }));
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
    primeraVez: modoVista || config.faltantes().length > 0,
    vista: modoVista,
    remoto: remoto.disponible,
    servidor: remoto.servidorConfig,
    sincronizado: !!config.getTokenRemoto(),
  };
});
ipcMain.handle('setup:entrar-remoto', async (e, email, password) => {
  if (!soloConexion(e)) return { ok: false };
  if (modoVista) return { ok: true }; // vista previa: no se inicia sesión de verdad
  try {
    await remoto.entrar(String(email || '').trim(), String(password || ''));
    loginPendiente = { email: String(email || '').trim(), password: String(password || '') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (config.faltantes().length) return { ok: false, error: 'El sistema web no devolvió todas las claves: ' + config.faltantes().join(', ') };
  return { ok: true }; // el arranque lo hace setup:finalizar, tras verificar y personalizar
});

// Verifica que las conexiones funcionen antes de entrar al sistema
// Google Drive desde la primera configuración (opcional)
ipcMain.handle('setup:drive-estado', (e) => (soloConexion(e) ? drive.estado() : null));
ipcMain.handle('setup:drive-conectar', async (e) => {
  if (!soloConexion(e)) return { ok: false };
  if (modoVista) return { ok: false, error: 'En la vista previa no se conecta nada.' };
  try { return { ok: true, ...(await drive.conectar()) }; } catch (err) { return { ok: false, error: err.message }; }
});

// Cuentas de Mensajes desde la primera configuración (opcional)
ipcMain.handle('setup:cuentas-estado', (e) => (soloConexion(e) ? mensajes.estadoCuentas() : {}));
ipcMain.handle('setup:conectar-cuenta', async (e, red) => {
  if (!soloConexion(e)) return { ok: false };
  if (modoVista) return { ok: false, error: 'En la vista previa no se conecta nada.' };
  return mensajes.conectarCuenta(String(red), ventanaConexion);
});
// …y desde el programa (Configuración)
ipcMain.handle('meta:cuentas', (e) => (esPrincipal(e) ? mensajes.estadoCuentas() : {}));
ipcMain.handle('meta:etiqueta', (e, canal, datos) => (esPrincipal(e) ? mensajes.etiqueta(String(canal), datos || null) : false));
ipcMain.handle('meta:conectar-cuenta', (e, red) => (esPrincipal(e) ? mensajes.conectarCuenta(String(red), principal) : { ok: false }));

ipcMain.handle('setup:validar', async (e) => {
  if (!soloConexion(e)) return [];
  const c = config.getConexion();
  const conTiempo = (url, opciones = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    return fetch(url, { ...opciones, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };
  const notion = { Authorization: `Bearer ${c.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' };
  const prueba = async (id, nombre, fn) => {
    try { const detalle = await fn(); return { id, nombre, ok: true, detalle: detalle || 'Conectado' }; }
    catch (err) { return { id, nombre, ok: false, detalle: err.name === 'AbortError' ? 'Sin respuesta' : err.message }; }
  };
  const bases = [['NOTION_DB_CLIENTES', 'Clientes'], ['NOTION_DB_COTIZACIONES', 'Cotizaciones'], ['NOTION_DB_SERVICIOS', 'Servicios'], ['NOTION_DB_EQUIPOS', 'Equipos']];
  return Promise.all([
    prueba('notion', 'Notion', async () => {
      const r = await conTiempo('https://api.notion.com/v1/users/me', { headers: notion });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || `Error ${r.status}`);
      return d.bot?.workspace_name ? `Espacio: ${d.bot.workspace_name}` : 'Token válido';
    }),
    prueba('bases', 'Bases de datos', async () => {
      const malas = [];
      for (const [k, n] of bases) {
        if (!c[k]) { malas.push(n); continue; }
        const r = await conTiempo(`https://api.notion.com/v1/databases/${c[k]}`, { headers: notion });
        if (!r.ok) malas.push(n);
      }
      if (malas.length) throw new Error('Sin acceso a: ' + malas.join(', '));
      return `${bases.length} bases accesibles`;
    }),
    prueba('cloudinary', 'Cloudinary (PDFs y fotos)', async () => {
      const auth = Buffer.from(`${c.CLOUDINARY_API_KEY}:${c.CLOUDINARY_API_SECRET}`).toString('base64');
      const r = await conTiempo(`https://api.cloudinary.com/v1_1/${c.CLOUDINARY_CLOUD_NAME}/usage`, { headers: { Authorization: `Basic ${auth}` } });
      if (!r.ok) throw new Error(r.status === 401 ? 'Claves no válidas' : `Error ${r.status}`);
      return 'Conectado';
    }),
    prueba('codart', 'CODART (SUNAT / RENIEC)', async () => {
      if (!c.CODART_API_TOKEN) throw new Error('No configurado (opcional)');
      // Consulta real con el RUC de Idealo Films
      const r = await conTiempo('https://api-codart.cgrt.org/api/v1/consultas/sunat/ruc/20611785381', { headers: { Authorization: `Bearer ${c.CODART_API_TOKEN}` } });
      if (r.ok) return 'Conectado';
      let msg = ''; try { const j = await r.json(); msg = j.message || j.error || ''; } catch { /* sin cuerpo */ }
      throw new Error((r.status === 401 || r.status === 403 ? 'Token no válido o vencido' : r.status === 402 || r.status === 429 ? 'Sin consultas disponibles en el plan' : `Error ${r.status}`) + (msg ? ` · ${String(msg).slice(0, 80)}` : ''));
    }),
  ]);
});

// Termina la primera configuración: guarda la personalización y arranca
let personalizacionPendiente = null;
ipcMain.handle('setup:finalizar', async (e, pers) => {
  if (!soloConexion(e)) return { ok: false };
  if (modoVista) { ventanaConexion?.close(); return { ok: true }; }
  if (config.faltantes().length) return { ok: false, error: 'Falta: ' + config.faltantes().join(', ') };
  personalizacionPendiente = pers || null;
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
  crearBandeja();
  aplicarInicioConWindows();
  updater.iniciar(estado => enviarATodos('idyos:actualizacion', estado));
  arrancar();
});

app.on('before-quit', () => { saliendo = true; });
app.on('window-all-closed', async () => {
  await servidor.detener();
  app.quit();
});
app.on('will-quit', () => { servidor.detener(); });

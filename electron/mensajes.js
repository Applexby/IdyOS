// electron/mensajes.js
// Messenger (facebook.com/messages, incluye Marketplace) e Instagram Direct
// dentro de IdyOS, como un navegador normal con la sesión guardada.
//
// Reglas para no arriesgar la cuenta (ver conversación de diseño):
//   • Nada automático contra Meta: no abre chats, no recorre conversaciones,
//     no envía mensajes. Solo muestra la página.
//   • Lo único que se lee es el chat que la persona tiene abierto, y solo
//     cuando pulsa "Crear lead".
//   • Las plantillas se pegan en la caja de texto; el Enter lo da la persona.
//
// Avisos: se envuelve la Notification de la página para avisar también a la
// campana de IdyOS; el contador de no leídos sale del título "(3) Facebook".

const { WebContentsView, session, shell } = require('electron');

const CANALES = {
  messenger: { url: 'https://www.facebook.com/messages/', nombre: 'Messenger', dominios: ['facebook.com', 'messenger.com', 'fbcdn.net'] },
  instagram: { url: 'https://www.instagram.com/direct/inbox/', nombre: 'Instagram', dominios: ['instagram.com', 'cdninstagram.com', 'facebook.com'] },
};

let ventana = null;       // ventana principal
let emitir = () => {};    // (canal, evento, datos) → interfaz
const vistas = {};        // canal → WebContentsView
const noLeidos = { messenger: 0, instagram: 0 };
let visible = null;       // canal mostrado ahora
let limites = null;       // { x, y, width, height } en px de la página

function sesionMeta() {
  const s = session.fromPartition('persist:meta');
  if (!s.__idyos) {
    s.__idyos = true;
    // Agente de usuario de Chrome normal (sin la marca "Electron")
    s.setUserAgent(s.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?idyos\/\S+/i, ''));
    s.setPermissionRequestHandler((_wc, permiso, cb) => cb(['notifications', 'clipboard-sanitized-write', 'clipboard-read', 'media', 'fullscreen'].includes(permiso)));
    s.setPermissionCheckHandler((_wc, permiso) => ['notifications', 'clipboard-sanitized-write'].includes(permiso));
  }
  return s;
}

// Se ejecuta dentro de la página de Meta: avisa (por la consola) de cada notificación
const ENVOLVER_AVISOS = `(() => {
  if (window.__idyosAvisos) return; window.__idyosAvisos = true;
  const Orig = window.Notification;
  if (!Orig) return;
  function N(titulo, opciones) {
    try { console.log('__IDYOS_AVISO__' + JSON.stringify({ titulo: String(titulo || ''), cuerpo: String((opciones && opciones.body) || '') })); } catch (e) {}
    const n = new Orig(titulo, opciones);
    try { n.addEventListener('click', () => console.log('__IDYOS_CLIC__')); } catch (e) {}
    return n;
  }
  N.prototype = Orig.prototype;
  Object.defineProperty(N, 'permission', { get: () => Orig.permission });
  N.requestPermission = (...a) => Orig.requestPermission(...a);
  window.Notification = N;
})()`;

function crearVista(canal) {
  if (vistas[canal]) return vistas[canal];
  const cfg = process.env.IDYOS_META_PRUEBA
    ? { ...CANALES[canal], url: process.env.IDYOS_META_PRUEBA, dominios: ['localhost', '127.0.0.1', ''] }
    : CANALES[canal];
  const vista = new WebContentsView({
    webPreferences: { session: sesionMeta(), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  const wc = vista.webContents;
  wc.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => {
    try {
      const host = new URL(url).hostname;
      if (!cfg.dominios.some(d => host === d || host.endsWith('.' + d))) { e.preventDefault(); shell.openExternal(url); }
    } catch { /* noop */ }
  });
  wc.on('dom-ready', () => wc.executeJavaScript(ENVOLVER_AVISOS).catch(() => {}));
  wc.on('console-message', (...args) => {
    // Electron 45: (evento) con .message; versiones anteriores: (evento, nivel, mensaje)
    const msg = typeof args[0]?.message === 'string' ? args[0].message : String(args[2] || '');
    if (msg.startsWith('__IDYOS_AVISO__')) {
      try { emitir('aviso', { canal, nombre: cfg.nombre, ...JSON.parse(msg.slice(15)) }); } catch { /* noop */ }
    } else if (msg === '__IDYOS_CLIC__') {
      emitir('abrir', { canal });
    }
  });
  wc.on('page-title-updated', (_e, titulo) => {
    const m = /^\((\d+)\+?\)/.exec(titulo || '');
    noLeidos[canal] = m ? Number(m[1]) : 0;
    emitir('no-leidos', { ...noLeidos });
  });
  wc.loadURL(cfg.url);
  vistas[canal] = vista;
  return vista;
}

function aplicarLimites() {
  if (!ventana || !visible || !limites) return;
  const z = ventana.webContents.getZoomFactor() || 1;
  vistas[visible]?.setBounds({
    x: Math.round(limites.x * z), y: Math.round(limites.y * z),
    width: Math.max(0, Math.round(limites.width * z)), height: Math.max(0, Math.round(limites.height * z)),
  });
}

function mostrar(canal, nuevosLimites) {
  if (!ventana || !CANALES[canal]) return;
  if (nuevosLimites) limites = nuevosLimites;
  if (visible && visible !== canal && vistas[visible]) ventana.contentView.removeChildView(vistas[visible]);
  const vista = crearVista(canal);
  if (visible !== canal) ventana.contentView.addChildView(vista);
  visible = canal;
  aplicarLimites();
}

function ocultar() {
  if (ventana && visible && vistas[visible]) ventana.contentView.removeChildView(vistas[visible]);
  visible = null;
}

function moverA(nuevosLimites) { limites = nuevosLimites; aplicarLimites(); }

/** Carga los canales ya usados para recibir avisos aunque no se abra la pantalla. */
function precargar(canales) { (canales || []).forEach(c => CANALES[c] && crearVista(c)); }

/** Cierra todo (al desactivar Mensajes en segundo plano). */
function cerrarTodo() {
  ocultar();
  for (const c of Object.keys(vistas)) { try { vistas[c].webContents.close(); } catch { /* noop */ } delete vistas[c]; }
}

function recargar(canal) { vistas[canal]?.webContents.reload(); }

/**
 * Lee el chat ABIERTO (solo al pulsar "Crear lead"): nombre del contacto,
 * líneas de la cabecera (en Marketplace, la publicación) y los primeros
 * mensajes visibles. Heurística sobre la página: si Meta cambia su diseño,
 * el formulario sigue siendo editable a mano.
 */
async function leerChat(canal) {
  const wc = vistas[canal]?.webContents;
  if (!wc) return null;
  return wc.executeJavaScript(`(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0; };
    const limpia = t => (t || '').replace(/\\s+/g, ' ').trim();
    const main = document.querySelector('[role="main"]') || document.body;
    const caja = main.getBoundingClientRect();
    // Cabecera de la conversación: textos visibles en la franja superior del panel
    const cab = [];
    main.querySelectorAll('h1, h2, h3, span[dir="auto"], a[role="link"] span').forEach(el => {
      if (!vis(el) || el.children.length > 2) return;
      const r = el.getBoundingClientRect();
      if (r.top < caja.top - 2 || r.top > caja.top + 110) return;
      const t = limpia(el.innerText);
      if (!t || t.length > 120) return;
      cab.push({ t, tam: parseFloat(getComputedStyle(el).fontSize) || 0, peso: parseInt(getComputedStyle(el).fontWeight) || 400, y: r.top, x: r.left });
    });
    cab.sort((a, b) => (b.tam - a.tam) || (b.peso - a.peso) || (a.y - b.y));
    const vistos = new Set(); const lineas = [];
    for (const c of cab) { if (!vistos.has(c.t)) { vistos.add(c.t); lineas.push(c.t); } }
    const ruido = /^(activo|activa|en línea|active|online|visto|seen|mensajes?|messages?|ver perfil|view profile|·)$/i;
    const utiles = lineas.filter(t => !ruido.test(t) && !/^activ[oa] hace/i.test(t));
    const nombre = utiles[0] || '';
    const publicacion = utiles.slice(1).find(t => /marketplace|·|s\\/|\\$|usd|pen|precio/i.test(t)) || utiles[1] || '';
    // Primeros mensajes visibles de la conversación
    const filas = [...main.querySelectorAll('[role="row"], [role="gridcell"]')].filter(vis)
      .map(r => limpia(r.innerText)).filter(t => t && t.length < 600);
    const mensajes = [...new Set(filas)].slice(0, 6);
    return { nombre, publicacion, lineas: utiles.slice(0, 8), mensajes, url: location.href, titulo: document.title };
  })()`).catch(() => null);
}

/** Pega un texto en la caja del chat abierto (NO lo envía: el Enter lo da la persona). */
async function pegar(canal, texto) {
  const wc = vistas[canal]?.webContents;
  if (!wc) return false;
  const ok = await wc.executeJavaScript(`(() => {
    const caja = document.querySelector('[role="main"] [contenteditable="true"][role="textbox"]')
      || document.querySelector('[contenteditable="true"][role="textbox"]')
      || document.querySelector('textarea');
    if (!caja) return false;
    caja.focus();
    return true;
  })()`).catch(() => false);
  if (!ok) return false;
  wc.focus();
  wc.insertText(texto);
  return true;
}

function iniciar(win, enviar) {
  ventana = win;
  emitir = enviar;
  win.on('resize', aplicarLimites);
  win.webContents.on('zoom-changed', () => setTimeout(aplicarLimites, 50));
  win.on('closed', () => { ventana = null; cerrarTodo(); });
}

module.exports = {
  iniciar, mostrar, ocultar, moverA, precargar, cerrarTodo, recargar, leerChat, pegar,
  getNoLeidos: () => ({ ...noLeidos }), CANALES,
};

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
let vistaLimpia = true;   // ocultar barra superior de Facebook / menú lateral de Instagram

// Solo cambia lo que se ve en este PC (como un bloqueador de anuncios): no
// toca nada de la cuenta ni envía nada a Meta. Si Meta cambia su diseño,
// puede dejar de ocultarse y se corrige con una actualización.
const LIMPIAR_COMUN = `
  // Reacomoda lo que quedaba desplazado por la barra oculta:
  //   dx = ancho ocultado a la izquierda (Instagram), dy = alto ocultado arriba (Facebook)
  window.__idyosReacomodar = (dx, dy) => {
    const W = innerWidth, H = innerHeight;
    document.querySelectorAll('div, section, main').forEach(d => {
      if (d.dataset.idyosAjuste) return;
      const cs = getComputedStyle(d), r = d.getBoundingClientRect();
      if (r.width < 200 && r.height < 200) return;
      const cambios = {};
      if (dx) {
        // El hueco puede ser algo menor que el ancho del menú (bordes, rellenos)
        const cerca = v => v > 40 && v >= dx * 0.7 && v <= dx + 6;
        if (cerca(parseFloat(cs.marginLeft))) cambios['margin-left'] = '0';
        if (cerca(parseFloat(cs.paddingLeft))) cambios['padding-left'] = '0';
        if ((cs.position === 'fixed' || cs.position === 'absolute') && cerca(parseFloat(cs.left))) cambios['left'] = '0';
        // Bloques que empezaban tras el menú: ocupar todo el ancho
        if (cerca(r.left) && (Math.abs(r.right - W) < 6 || Math.abs(r.width - (W - dx)) < 6 || Math.abs(r.width - (W - r.left)) < 6)) { cambios['width'] = '100%'; cambios['max-width'] = 'none'; }
        // Contenedores con ancho máximo que dejan la conversación angosta
        if (r.left < 6 && parseFloat(cs.maxWidth) > 0 && parseFloat(cs.maxWidth) < W - 20 && r.height > H * 0.6) cambios['max-width'] = 'none';
      }
      if (dy) {
        if ((cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky') && Math.abs(parseFloat(cs.top) - dy) < 4) cambios['top'] = '0';
        if (Math.abs(parseFloat(cs.marginTop) - dy) < 4) cambios['margin-top'] = '0';
        if (Math.abs(parseFloat(cs.paddingTop) - dy) < 4 && r.height > H * 0.5) cambios['padding-top'] = '0';
        if (Math.abs(r.height - (H - dy)) < 6 && r.width > W * 0.5) { cambios['height'] = '100vh'; cambios['max-height'] = '100vh'; }
        if (Math.abs(parseFloat(cs.minHeight) - (H - dy)) < 6) cambios['min-height'] = '100vh';
      }
      const claves = Object.keys(cambios);
      if (!claves.length) return;
      d.dataset.idyosAjuste = claves.join(',');
      claves.forEach(k => d.style.setProperty(k, cambios[k], 'important'));
    });
  };
`;
// Solo cambia lo que se ve en este PC (como un bloqueador de anuncios): no
// toca nada de la cuenta ni envía nada a Meta. Si Meta cambia su diseño,
// puede dejar de ocultarse y se corrige con una actualización.
const LIMPIAR = {
  messenger: `(() => {
    window.__idyosLimpia = true;
    ${LIMPIAR_COMUN}
    if (!document.getElementById('idyos-limpia')) {
      const st = document.createElement('style'); st.id = 'idyos-limpia';
      st.textContent = 'div[role="banner"]{display:none!important} :root,html,body{--header-height:0px!important} html,body{scrollbar-width:none!important} html::-webkit-scrollbar,body::-webkit-scrollbar{width:0!important;height:0!important}';
      document.head.appendChild(st);
    }
    if (window.__idyosLimpiaFB) return; window.__idyosLimpiaFB = true;
    let alto = 56;
    const paso = () => {
      if (!window.__idyosLimpia) return;
      const b = document.querySelector('div[role="banner"]');
      if (b && b.dataset.idyosAlto) alto = Number(b.dataset.idyosAlto);
      window.__idyosReacomodar(0, alto);
    };
    // Medir la barra antes de que el estilo la oculte (si ya estaba oculta, 56 px)
    const b = document.querySelector('div[role="banner"]');
    if (b) { b.style.removeProperty('display'); const h = b.getBoundingClientRect().height; if (h > 20) { alto = h; b.dataset.idyosAlto = String(h); } }
    paso(); setInterval(paso, 2000);
  })()`,
  instagram: `(() => {
    window.__idyosLimpia = true;
    ${LIMPIAR_COMUN}
    if (!document.getElementById('idyos-limpia')) {
      const st = document.createElement('style'); st.id = 'idyos-limpia';
      st.textContent = 'html,body{scrollbar-width:none!important} html::-webkit-scrollbar,body::-webkit-scrollbar{width:0!important;height:0!important}';
      document.head.appendChild(st);
    }
    if (window.__idyosLimpiaIG) return; window.__idyosLimpiaIG = true;
    let ancho = 0;
    const paso = () => {
      if (!window.__idyosLimpia) return;
      // Menú lateral: bloque fijo a la izquierda con los enlaces de Inicio/Explorar/Reels
      const enlace = document.querySelector('a[href="/explore/"], a[href="/reels/"]');
      let el = enlace;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        if ((cs.position === 'fixed' || cs.position === 'sticky') && r.left <= 2 && r.width < 420 && r.height > innerHeight * 0.6) break;
        el = el.parentElement;
      }
      if (el && el !== document.body && !el.dataset.idyosOculto) {
        ancho = el.getBoundingClientRect().width;
        el.dataset.idyosOculto = '1';
        el.style.setProperty('display', 'none', 'important');
      }
      if (ancho) window.__idyosReacomodar(ancho, 0);
    };
    paso(); setInterval(paso, 1500);
  })()`,
};
const RESTAURAR = `(() => {
  window.__idyosLimpia = false;
  document.getElementById('idyos-limpia')?.remove();
  document.querySelectorAll('[data-idyos-oculto]').forEach(e => { e.style.removeProperty('display'); delete e.dataset.idyosOculto; });
  document.querySelectorAll('[data-idyos-ajuste]').forEach(e => { e.dataset.idyosAjuste.split(',').forEach(k => e.style.removeProperty(k)); delete e.dataset.idyosAjuste; });
  window.__idyosLimpiaIG = false; window.__idyosLimpiaFB = false;
})()`;

// ── Tema IdyOS (experimental) ──────────────────────────────────────────────
// Facebook e Instagram pintan con variables CSS; se sustituyen por la paleta
// de IdyOS (gris neutro + color de acento). Solo visual y local.
let tema = null; // { acento: '#ffc500', oscuro: true } o null
function cssTema(t) {
  // Paleta de IdyOS: gris neutro (sin azul) y el color de acento elegido
  const o = t.oscuro;
  const fondo = o ? '#141414' : '#f6f7fb', tarjeta = o ? '#1b1b1b' : '#ffffff', elevado = o ? '#202020' : '#ffffff';
  const hover = o ? '#242424' : '#eef1f5', texto = o ? '#f2f2f2' : '#111827', texto2 = o ? '#a3a3a3' : '#6b7280';
  const linea = o ? 'rgba(255,255,255,.07)' : '#e4e7ee', entrante = o ? '#262626' : '#eef1f5';
  const a = t.acento, aTexto = t.acentoTexto || '#111827';
  return `:root, html, body, .__fb-dark-mode, .__fb-light-mode {
    --accent:${a}!important; --primary-button-background:${a}!important; --primary-button-text:${aTexto}!important; --blue-link:${a}!important;
    --primary-deemphasized-button-text:${a}!important; --primary-icon:${texto}!important; --secondary-icon:${texto2}!important;
    --web-wash:${fondo}!important; --surface-background:${tarjeta}!important; --card-background:${tarjeta}!important; --comment-background:${hover}!important;
    --primary-text:${texto}!important; --secondary-text:${texto2}!important; --placeholder-text:${texto2}!important; --divider:${linea}!important;
    --hover-overlay:rgba(127,127,127,.10)!important; --messenger-card-background:${tarjeta}!important; --nav-bar-background:${tarjeta}!important;
    --ig-primary-background:${fondo}!important; --ig-secondary-background:${tarjeta}!important; --ig-elevated-background:${elevado}!important;
    --ig-elevated-highlight-background:${hover}!important; --ig-highlight-background:${hover}!important; --ig-hover-overlay:rgba(127,127,127,.10)!important;
    --ig-primary-text:${texto}!important; --ig-secondary-text:${texto2}!important; --ig-tertiary-text:${texto2}!important;
    --ig-separator:${linea}!important; --ig-elevated-separator:${linea}!important; --ig-stroke:${linea}!important;
    --ig-primary-button:${a}!important; --ig-primary-button-hover:${a}!important; --ig-link:${a}!important; --ig-focus-stroke:${a}!important;
    --idyos-acento:${a}; --idyos-acento-texto:${aTexto}; --idyos-entrante:${entrante}; --idyos-texto:${texto};
  }
  html, body { background:${fondo}!important; }
  body, input, textarea, button, [contenteditable] { font-family:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif!important; }
  /* Burbujas propias: color sólido del acento (sin degradado) */
  [data-idyos-burbuja="propia"] { background:${a}!important; background-image:none!important; color:${aTexto}!important; border-radius:16px!important; }
  [data-idyos-burbuja="propia"] * { color:${aTexto}!important; }
  [data-idyos-burbuja="propia"] a { color:${aTexto}!important; text-decoration:underline!important; }
  [data-idyos-burbuja="ajena"] { background:${entrante}!important; background-image:none!important; border-radius:16px!important; }
  [data-idyos-icono] { color:${a}!important; fill:${a}!important; }
  /* Barras de desplazamiento como las de IdyOS */
  * { scrollbar-width:thin; scrollbar-color:rgba(148,163,184,.35) transparent; }
  ::-webkit-scrollbar { width:6px!important; height:6px!important; }
  ::-webkit-scrollbar-track { background:transparent!important; }
  ::-webkit-scrollbar-thumb { background:rgba(148,163,184,.35)!important; border-radius:6px!important; }
  ::-webkit-scrollbar-thumb:hover { background:${a}!important; }
  ::-webkit-scrollbar-button { display:none!important; height:0!important; }
  ::selection { background:${a}55; }`;
}

// Las burbujas y los iconos de Meta no usan variables: se detectan por su
// color (azul / morado / degradado) y se marcan para que el CSS los pinte.
const MARCAR_COLORES = `(() => {
  if (window.__idyosColores) return; window.__idyosColores = true;
  const rgb = s => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; };
  const llamativo = c => { if (!c) return false; const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx > 120 && (mx - mn) > 90 && b >= r - 40 && b > g; }; // azules, violetas, morados
  const paso = () => {
    if (!document.getElementById('idyos-tema')) return;
    const W = innerWidth;
    document.querySelectorAll('div, span, a').forEach(el => {
      if (el.dataset.idyosBurbuja) return;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 18 || r.width > W * 0.75) return;
      const radio = parseFloat(cs.borderTopLeftRadius) || 0;
      if (radio < 8) return;
      const grad = (cs.backgroundImage || '').includes('gradient');
      if (grad || llamativo(rgb(cs.backgroundColor))) {
        if (el.querySelector('[data-idyos-burbuja]')) return;
        el.dataset.idyosBurbuja = 'propia';
      }
    });
    document.querySelectorAll('svg, svg path, svg circle, svg rect, svg polygon, svg use, svg g').forEach(el => {
      if (el.dataset.idyosIcono) return;
      const cs = getComputedStyle(el);
      if (llamativo(rgb(cs.fill)) || llamativo(rgb(cs.color))) el.dataset.idyosIcono = '1';
    });
  };
  paso(); setInterval(paso, 1200);
})()`;

function aplicarTema(canal) {
  const wc = vistas[canal]?.webContents;
  if (!wc) return;
  const js = tema
    ? `(() => { let st = document.getElementById('idyos-tema'); if (!st) { st = document.createElement('style'); st.id = 'idyos-tema'; document.head.appendChild(st); } st.textContent = ${JSON.stringify(cssTema(tema))}; })()`
    : `(() => { document.getElementById('idyos-tema')?.remove(); document.querySelectorAll('[data-idyos-burbuja],[data-idyos-icono]').forEach(e => { delete e.dataset.idyosBurbuja; delete e.dataset.idyosIcono; }); window.__idyosColores = false; })()`;
  wc.executeJavaScript(js).then(() => { if (tema) wc.executeJavaScript(MARCAR_COLORES).catch(() => {}); }).catch(() => {});
}
function setTema(t) { tema = t && t.acento ? t : null; Object.keys(vistas).forEach(aplicarTema); }

function aplicarVistaLimpia(canal) {
  const wc = vistas[canal]?.webContents;
  if (!wc) return;
  wc.executeJavaScript(vistaLimpia ? LIMPIAR[canal] : RESTAURAR).catch(() => {});
}

function setVistaLimpia(v) {
  vistaLimpia = !!v;
  Object.keys(vistas).forEach(aplicarVistaLimpia);
}
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
    ? { ...CANALES[canal], url: process.env.IDYOS_META_PRUEBA + canal + '.html', dominios: ['localhost', '127.0.0.1', ''] }
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
  wc.on('dom-ready', () => { wc.executeJavaScript(ENVOLVER_AVISOS).catch(() => {}); aplicarVistaLimpia(canal); aplicarTema(canal); });
  // Facebook e Instagram cambian de "página" sin recargar: volver a aplicar
  wc.on('did-navigate-in-page', () => { aplicarVistaLimpia(canal); aplicarTema(canal); });
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
    const CANAL = ${JSON.stringify(canal)};
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0; };
    const limpia = t => (t || '').replace(/\\s+/g, ' ').trim();
    const W = window.innerWidth, H = window.innerHeight;

    // 1) Columna de la conversación: la que tiene la caja para escribir.
    //    Así se ignora la lista de chats (y tu propio usuario, que está encima).
    const caja = [...document.querySelectorAll('[contenteditable="true"][role="textbox"], textarea')].filter(vis).pop();
    let izq = W * 0.3, der = W, tope = caja ? caja.getBoundingClientRect().top : H;
    if (caja) {
      let el = caja;
      while (el.parentElement && el.parentElement !== document.body) {
        const r = el.parentElement.getBoundingClientRect();
        if (r.width > W * 0.9 || r.height > H * 0.95) break;
        el = el.parentElement;
      }
      const r = el.getBoundingClientRect();
      if (r.width > 150) { izq = r.left; der = r.right; }
    }

    // 2) Textos de la cabecera: dentro de esa columna, por encima de la caja,
    //    y que NO sean mensajes del chat (filas, burbujas, artículos).
    const dentroDeMensaje = el => !!el.closest('[role="row"], [role="gridcell"], [role="article"], [role="log"], [role="grid"], [data-scope="messages_table"]');
    const cand = [];
    document.querySelectorAll('h1, h2, h3, h4, span[dir="auto"], div[dir="auto"], a[role="link"] span').forEach(el => {
      if (!vis(el) || dentroDeMensaje(el)) return;
      if (el.querySelector('h1, h2, h3, span[dir="auto"], div[dir="auto"]')) return; // solo el texto más interno
      const r = el.getBoundingClientRect();
      if (r.left < izq - 4 || r.left > der || r.top < 0 || r.top > tope - 20) return;
      const t = limpia(el.innerText);
      if (!t || t.length > 140) return;
      const cs = getComputedStyle(el);
      cand.push({ t, y: r.top, tam: parseFloat(cs.fontSize) || 0, peso: parseInt(cs.fontWeight) || 400 });
    });
    cand.sort((a, b) => a.y - b.y);
    // Banda de la cabecera: los textos más altos de la columna (unos 120 px)
    const y0 = cand.length ? cand[0].y : 0;
    const banda = cand.filter(c => c.y <= y0 + 120);
    const ruido = /^(activ[oa]|en línea|active|online|visto|seen|mensajes?|messages?|ver perfil|view profile|view buyer|ver comprador|more options|más opciones|·)$/i;
    const utiles = [];
    for (const c of banda) if (!ruido.test(c.t) && !/^activ[oa] hace|^active \\d/i.test(c.t) && !utiles.some(u => u.t === c.t)) utiles.push(c);
    const principal = [...utiles].sort((a, b) => (b.tam - a.tam) || (b.peso - a.peso) || (a.y - b.y))[0];
    let nombre = principal ? principal.t : '';

    // 3) Marketplace: "Nombre · Producto" y la línea "PEN0 - Producto"
    let delTitulo = '';
    if (CANAL === 'messenger' && nombre.includes(' · ')) { const p = nombre.split(' · '); nombre = p.shift().trim(); delTitulo = p.join(' · ').trim(); }
    const textos = utiles.map(u => u.t);
    const precio = /^\\s*(PEN|USD|S\\/|US\\$|\\$)\\s*[\\d.,]*\\s*[-–·]\\s*/i;
    const conPrecio = textos.find(t => precio.test(t));
    const publicacion = CANAL === 'instagram' ? ''
      : (conPrecio ? conPrecio.replace(precio, '').trim() : delTitulo);

    // 4) Algunos mensajes visibles, como referencia para la descripción
    const filas = [...document.querySelectorAll('[role="row"], [role="gridcell"]')].filter(vis)
      .filter(r => { const b = r.getBoundingClientRect(); return b.left >= izq - 4 && b.top < tope; })
      .map(r => limpia(r.innerText)).filter(t => t && t.length < 600);
    const mensajes = [...new Set(filas)].slice(-6);
    return { nombre, publicacion, lineas: textos.slice(0, 8), mensajes, url: location.href, titulo: document.title };
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
  setVistaLimpia, getVistaLimpia: () => vistaLimpia, setTema, getTema: () => tema,
  iniciar, mostrar, ocultar, moverA, precargar, cerrarTodo, recargar, leerChat, pegar,
  getNoLeidos: () => ({ ...noLeidos }), CANALES,
};

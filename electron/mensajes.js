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

const { WebContentsView, session, shell, app } = require('electron');

const CANALES = {
  whatsapp: { url: 'https://web.whatsapp.com/', nombre: 'WhatsApp', dominios: ['whatsapp.com', 'whatsapp.net'] },
  messenger: { url: 'https://www.facebook.com/messages/', nombre: 'Messenger', dominios: ['facebook.com', 'messenger.com', 'fbcdn.net'] },
  instagram: { url: 'https://www.instagram.com/direct/inbox/', nombre: 'Instagram', dominios: ['instagram.com', 'cdninstagram.com', 'facebook.com'] },
  tiktok: { url: 'https://www.tiktok.com/messages', nombre: 'TikTok', dominios: ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'ttwstatic.com', 'tiktokcdn-us.com'] },
};
// Notificaciones (comentarios, menciones, reacciones): solo Facebook tiene
// una página propia; en Instagram y TikTok se usan solo los chats.
const AVISOS = {
  messenger: { url: 'https://www.facebook.com/notifications' },
};
// Clave de cada vista: "messenger" (chats) o "messenger:avisos" (notificaciones)
const canalDe = clave => String(clave).split(':')[0];
const esAvisos = clave => String(clave).endsWith(':avisos');
const claveDe = (canal, modo) => (modo === 'avisos' && AVISOS[canal] ? canal + ':avisos' : canal);

let ventana = null;       // ventana principal
let emitir = () => {};    // (canal, evento, datos) → interfaz
const vistas = {};        // canal → WebContentsView
const noLeidos = { whatsapp: 0, messenger: 0, instagram: 0, tiktok: 0 };
// Messenger mezcla chats personales con Marketplace: no se cuentan sus no
// leídos (los avisos sí llegan).
const SIN_CONTADOR = ['messenger'];
let visible = null;       // canal mostrado ahora
let vistaLimpia = true;   // ocultar barra superior de Facebook / menú lateral de Instagram

// Solo cambia lo que se ve en este PC (como un bloqueador de anuncios): no
// toca nada de la cuenta ni envía nada a Meta. Si Meta cambia su diseño,
// puede dejar de ocultarse y se corrige con una actualización.
const LIMPIAR_COMUN = `
  window.__idyosAjustar = (el, cambios) => {
    const previas = (el.dataset.idyosAjuste || '').split(',').filter(Boolean);
    Object.keys(cambios).forEach(k => el.style.setProperty(k, cambios[k], 'important'));
    el.dataset.idyosAjuste = [...new Set([...previas, ...Object.keys(cambios)])].join(',');
  };
  // La conversación abierta llega casi hasta abajo (sin el hueco que dejaba la barra)
  window.__idyosEstirar = () => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const caja = [...document.querySelectorAll('[contenteditable="true"][role="textbox"], textarea')].filter(vis).pop();
    if (!caja) return;
    const H = innerHeight;
    for (let i = 0; i < 6; i++) {
      let el = caja, objetivo = null;
      while (el && el !== document.body) {
        const r = el.getBoundingClientRect();
        if (r.width > 200 && r.height > 160 && H - r.bottom > 28 && r.top < H * 0.45) objetivo = el;
        el = el.parentElement;
      }
      if (!objetivo) return;
      const antes = objetivo.getBoundingClientRect().bottom;
      const r = objetivo.getBoundingClientRect();
      window.__idyosAjustar(objetivo, { height: 'calc(100vh - ' + Math.round(r.top + 12) + 'px)', 'max-height': 'none', 'min-height': '0' });
      if (Math.abs(objetivo.getBoundingClientRect().bottom - antes) < 2) return; // no cedió
    }
  };
  // Quita el hueco que dejaba el menú oculto a la izquierda (márgenes, rellenos o espaciadores)
  window.__idyosIzquierda = (ancho) => {
    if (!ancho) return;
    const H = innerHeight;
    document.querySelectorAll('div').forEach(d => {
      if (d.dataset.idyosOculto) return;
      const r = d.getBoundingClientRect();
      if (r.left <= 2 && r.width > 30 && Math.abs(r.width - ancho) < 12 && r.height > H * 0.6 && !(d.innerText || '').trim() && !d.querySelector('img, svg, input, textarea, [role="textbox"]')) {
        d.dataset.idyosOculto = '1'; d.style.setProperty('display', 'none', 'important');
      }
    });
    for (let i = 0; i < 5; i++) {
      let el = document.elementFromPoint(Math.min(innerWidth - 4, Math.min(ancho, 300) + 40), H * 0.5);
      let cambio = false;
      while (el && el.parentElement && el !== document.body) {
        const pa = el.parentElement, r = el.getBoundingClientRect(), rp = pa.getBoundingClientRect();
        const desfase = r.left - rp.left;
        if (desfase > 20 && r.height > H * 0.5) {
          const cs = getComputedStyle(el), cp = getComputedStyle(pa);
          if (parseFloat(cs.marginLeft) > 20) { window.__idyosAjustar(el, { 'margin-left': '0' }); cambio = true; }
          else if (parseFloat(cp.paddingLeft) > 20) { window.__idyosAjustar(pa, { 'padding-left': '0' }); cambio = true; }
          else if ((cs.position === 'absolute' || cs.position === 'fixed') && parseFloat(cs.left) > 20) { window.__idyosAjustar(el, { left: '0' }); cambio = true; }
          else if (cp.display.includes('grid') && /^\s*\d/.test(cp.gridTemplateColumns)) {
            const pistas = cp.gridTemplateColumns.split(/\s+/);
            if (pistas.length > 1 && Math.abs(parseFloat(pistas[0]) - desfase) < 12) { window.__idyosAjustar(pa, { 'grid-template-columns': '0px ' + pistas.slice(1).join(' ') }); cambio = true; }
          } else {
            // Hermanos vacíos a la izquierda que solo reservaban sitio
            for (const h of pa.children) {
              if (h === el) break;
              const rh = h.getBoundingClientRect();
              if (rh.width > 20 && !(h.innerText || '').trim() && !h.dataset.idyosOculto) { h.dataset.idyosOculto = '1'; h.style.setProperty('display', 'none', 'important'); cambio = true; }
            }
          }
          if (!cambio) {
            // Último recurso: correr el bloque a la izquierda y alargarlo lo mismo
            const cs2 = getComputedStyle(el);
            window.__idyosAjustar(el, { position: cs2.position === 'static' ? 'relative' : cs2.position, left: (parseFloat(cs2.left) || 0) - desfase + 'px', width: 'calc(' + r.width + 'px + ' + desfase + 'px)', 'max-width': 'none' });
            return;
          }
          if (cambio) { const r2 = el.getBoundingClientRect(); if (r2.right < innerWidth - 4 && r2.width < rp.width - 4) window.__idyosAjustar(el, { width: 'auto', 'max-width': 'none', flex: '1 1 auto' }); break; }
        }
        el = pa;
      }
      if (!cambio) return;
    }
  };
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
      if (Object.keys(cambios).length) window.__idyosAjustar(d, cambios);
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
      window.__idyosEstirar();
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
      if (ancho) { window.__idyosReacomodar(ancho, 0); window.__idyosIzquierda(ancho); }
    };
    paso(); setInterval(paso, 1500);
  })()`,
  tiktok: `(() => {
    window.__idyosLimpia = true;
    if (window.__idyosLimpiaTT) return; window.__idyosLimpiaTT = true;
    const paso = () => {
      if (!window.__idyosLimpia) return;
      // Columna de iconos: bloque angosto (< 120 px) pegado a la izquierda con
      // Explorar/Siguiendo/LIVE. Nada más: la lista de chats se acomoda sola.
      // 1) El grupo más pequeño que reúne 3 o más enlaces del menú de TikTok
      const NAV = 'a[href*="/explore"], a[href*="/following"], a[href*="/friends"], a[href*="/live"], a[href*="/upload"], a[href*="/foryou"], a[href="/"], a[href*="/messages"]';
      const enlace = document.querySelector(NAV);
      let el = enlace, nav = null;
      while (el && el !== document.body && el.querySelectorAll(NAV).length < 3) el = el.parentElement;
      // 2) Subir solo mientras siga siendo una columna angosta de iconos, sin
      //    la lista de chats (que tiene fotos y mucho texto) ni la caja de texto
      const esColumna = e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.width < 120 && r.left <= 2 && e.querySelectorAll('img').length <= 2
          && (e.innerText || '').length < 300 && !e.querySelector('[contenteditable="true"], textarea');
      };
      const grupo = el && el !== document.body && esColumna(el) ? el : null;
      while (el && el !== document.body && esColumna(el)) {
        if (el.getBoundingClientRect().height > innerHeight * 0.6) nav = el;
        el = el.parentElement;
      }
      nav = nav || grupo;
      // Seguro: si lo oculto acabó conteniendo la lista de chats (fotos o
      // mucho texto), se devuelve y no se vuelve a ocultar nada en TikTok
      document.querySelectorAll('[data-idyos-oculto]').forEach(o => {
        if (o.querySelectorAll('img').length > 2 || (o.textContent || '').length > 400) {
          o.style.removeProperty('display'); delete o.dataset.idyosOculto; window.__idyosTTNo = true;
        }
      });
      if (window.__idyosTTNo) return;
      if (nav && !nav.dataset.idyosOculto) { nav.dataset.idyosOculto = '1'; nav.style.setProperty('display', 'none', 'important'); }
    };
    paso(); setInterval(paso, 1500);
  })()`,
};
const RESTAURAR = `(() => {
  window.__idyosLimpia = false;
  document.getElementById('idyos-limpia')?.remove();
  document.querySelectorAll('[data-idyos-oculto]').forEach(e => { e.style.removeProperty('display'); delete e.dataset.idyosOculto; });
  document.querySelectorAll('[data-idyos-ajuste]').forEach(e => { e.dataset.idyosAjuste.split(',').forEach(k => e.style.removeProperty(k)); delete e.dataset.idyosAjuste; });
  window.__idyosLimpiaIG = false; window.__idyosLimpiaFB = false; window.__idyosLimpiaTT = false;
})()`;

// ── Tema IdyOS (experimental) ──────────────────────────────────────────────
// Facebook e Instagram pintan con variables CSS; se sustituyen por la paleta
// de IdyOS (gris neutro + color de acento). Solo visual y local.
let tema = null; // { acento: '#ffc500', oscuro: true, acentoTexto } o null
const hexATriplete = h => { const m = /^#([0-9a-f]{6})$/i.exec(h); if (!m) return h; const n = parseInt(m[1], 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
function paleta(t) {
  const o = t.oscuro;
  return {
    o, a: t.acento, aTexto: t.acentoTexto || '#111827',
    fondo: o ? '#161616' : '#f6f7fb', tarjeta: o ? '#1c1c1c' : '#ffffff', elevado: o ? '#222222' : '#ffffff',
    hover: o ? '#262626' : '#eef1f5', texto: o ? '#f2f2f2' : '#111827', texto2: o ? '#a3a3a3' : '#6b7280',
    linea: o ? '#262626' : '#e4e7ee', entrante: o ? '#2a2a2a' : '#eef1f5',
  };
}
/**
 * CSS del tema. Instagram define sus colores unas veces como "#rrggbb" y
 * otras como "r,g,b" (para usarlos dentro de rgb(...)): se generan las dos
 * versiones y la página elige la que corresponde.
 */
function cssTema(t, canal, triplete) {
  const p = paleta(t), c = triplete ? hexATriplete : (x => x);
  const sel = ':root, html, body, [class*="-mode"], [class*="__fb-"], [class*="__ig-"]';
  const fb = canal === 'messenger' ? `
    --accent:${p.a}!important; --primary-button-background:${p.a}!important; --primary-button-text:${p.aTexto}!important; --blue-link:${p.texto}!important;
    --primary-deemphasized-button-text:${p.texto}!important; --primary-icon:${p.texto}!important; --secondary-icon:${p.texto2}!important;
    --web-wash:${p.fondo}!important; --surface-background:${p.tarjeta}!important; --card-background:${p.tarjeta}!important; --comment-background:${p.hover}!important;
    --primary-text:${p.texto}!important; --secondary-text:${p.texto2}!important; --placeholder-text:${p.texto2}!important; --divider:${p.linea}!important;
    --hover-overlay:rgba(127,127,127,.10)!important; --messenger-card-background:${p.tarjeta}!important; --nav-bar-background:${p.tarjeta}!important;
    --secondary-button-background:${p.hover}!important; --secondary-button-text:${p.texto}!important; --secondary-button-background-floating:${p.elevado}!important;
    --chat-incoming-message-bubble-background-color:${p.entrante}!important; --chat-incoming-message-bubble-text-color:${p.texto}!important;
    --wash:${p.hover}!important; --media-inner-border:${p.linea}!important; --scroll-thumb:rgba(148,163,184,.4)!important;
    --filter-accent:brightness(0) invert(${p.o ? '.9' : '.15'})!important; --filter-blue-link:brightness(0) invert(${p.o ? '.9' : '.15'})!important;` : `
    --ig-primary-background:${c(p.fondo)}!important; --ig-secondary-background:${c(p.tarjeta)}!important; --ig-elevated-background:${c(p.elevado)}!important;
    --ig-elevated-highlight-background:${c(p.hover)}!important; --ig-highlight-background:${c(p.hover)}!important;
    --ig-primary-text:${c(p.texto)}!important; --ig-secondary-text:${c(p.texto2)}!important; --ig-tertiary-text:${c(p.texto2)}!important;
    --ig-separator:${c(p.linea)}!important; --ig-elevated-separator:${c(p.linea)}!important; --ig-stroke:${c(p.linea)}!important;
    --ig-primary-button:${c(p.a)}!important; --ig-primary-button-hover:${c(p.a)}!important; --ig-link:${c(p.texto)}!important; --ig-focus-stroke:${c(p.a)}!important;`;
  // Barras finas solo en Instagram: en Messenger cambiar su ancho dejaba ver
  // el degradado del chat por el borde (la "barra morada").
  const barras = canal === 'instagram' ? `
  * { scrollbar-width:thin; scrollbar-color:rgba(148,163,184,.35) transparent; }
  ::-webkit-scrollbar { width:6px!important; height:6px!important; }
  ::-webkit-scrollbar-track { background:transparent!important; }
  ::-webkit-scrollbar-thumb { background:rgba(148,163,184,.35)!important; border-radius:6px!important; }
  ::-webkit-scrollbar-thumb:hover { background:${p.a}!important; }
  ::-webkit-scrollbar-button { display:none!important; height:0!important; }` : '';
  return `${sel} {${fb}}
  html, body { background:${p.fondo}!important; color-scheme:${p.o ? 'dark' : 'light'}!important; }
  /* Mensajes del cliente: gris del modo elegido, con texto legible */
  [data-idyos-burbuja="ajena"] { background:${p.entrante}!important; background-image:none!important; color:${p.texto}!important; }
  [data-idyos-burbuja="ajena"] * { color:${p.texto}!important; }
  body, input, textarea, button, [contenteditable] { font-family:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif!important; }
  /* Mensajes propios: color sólido del acento (sin degradado) */
  [data-idyos-burbuja="propia"] { background:${p.a}!important; background-image:none!important; color:${p.aTexto}!important; }
  [data-idyos-burbuja="propia"] * { color:${p.aTexto}!important; }
  [data-idyos-burbuja="propia"] a { text-decoration:underline!important; }
  [data-idyos-burbuja="fondo"] { background-color:${p.a}!important; background-image:none!important; }
  [data-idyos-pseudo]::before, [data-idyos-pseudo]::after { background:${p.a}!important; background-image:none!important; }
  [data-idyos-icono] { color:${p.a}!important; fill:${p.a}!important; }
  [data-idyos-texto] { color:${p.texto}!important; }
  [data-idyos-borde] { border-color:${p.linea}!important; }${barras}
  ::selection { background:${p.a}55; }`;
}

// Lo que Meta no pinta con variables se detecta por su color y se marca.
// Solo dentro de la conversación abierta (no en la lista de chats), y cada
// marca se revisa: Meta reutiliza los elementos al cambiar de chat, así que
// si el elemento cambia de clases la marca se quita y se vuelve a evaluar.
const MARCAR_COLORES = `(() => {
  if (window.__idyosColores) return; window.__idyosColores = true;
  const rgb = s => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/.exec(s || ''); return m && (m[4] === undefined || +m[4] > 0.3) ? [+m[1], +m[2], +m[3]] : null; };
  const hex = s => { const m = /^\\s*#([0-9a-f]{6}|[0-9a-f]{3})\\s*$/i.exec(s || ''); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const llamativo = c => { if (!c) return false; const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx > 110 && (mx - mn) > 80 && b >= r - 40 && b > g; }; // azules, violetas, morados
  const casiNegro = c => c && Math.max(...c) < 20;
  const firma = el => (el.getAttribute('class') || '') + '|' + (el.getAttribute('style') || '').replace(/--[^;]+;?/g, '');
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const MARCAS = ['idyosBurbuja', 'idyosPseudo', 'idyosIcono', 'idyosTexto', 'idyosBorde'];
  const quitar = el => MARCAS.forEach(k => delete el.dataset[k]);
  const columna = () => {
    const caja = [...document.querySelectorAll('[contenteditable="true"][role="textbox"], textarea')].filter(vis).pop();
    if (!caja) return null;
    let el = caja;
    while (el.parentElement && el.parentElement !== document.body) {
      const r = el.parentElement.getBoundingClientRect();
      if (r.width > innerWidth * 0.85) break; // ya incluiría la lista de chats
      el = el.parentElement;
    }
    return { el, caja, r: el.getBoundingClientRect() };
  };
  const dentro = (r, c) => r.left >= c.left - 2 && r.right <= c.right + 2 && r.top >= c.top - 2 && r.bottom <= c.bottom + 2;
  const paso = () => {
    if (!document.getElementById('idyos-tema')) return;
    const raiz = getComputedStyle(document.documentElement);
    const acento = raiz.getPropertyValue('--idyos-acento').trim();
    const oscuro = raiz.getPropertyValue('--idyos-oscuro').trim() === '1';
    // Meta tiene su propio modo claro/oscuro (de la cuenta): se usa el de IdyOS
    const [quita, pone] = oscuro ? ['light', 'dark'] : ['dark', 'light'];
    document.querySelectorAll('[class*="__fb-' + quita + '-mode"], [class*="__ig-' + quita + '-mode"]').forEach(el => {
      [...el.classList].forEach(c => { if (c === '__fb-' + quita + '-mode' || c === '__ig-' + quita + '-mode') { el.classList.remove(c); el.classList.add(c.replace(quita, pone)); } });
    });
    if (window.__idyosModo !== oscuro) {
      window.__idyosModo = oscuro;
      document.querySelectorAll('[data-idyos-burbuja="ajena"], [data-idyos-borde]').forEach(e => { delete e.dataset.idyosBurbuja; delete e.dataset.idyosBorde; });
    }
    const lum = c => c ? (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) : null;
    const col = columna();
    // 1) Revisar marcas antiguas (cambio de chat, elementos reutilizados)
    document.querySelectorAll('[data-idyos-burbuja], [data-idyos-pseudo], [data-idyos-icono], [data-idyos-texto]').forEach(el => {
      const enChat = el.dataset.idyosIcono || (col && dentro(el.getBoundingClientRect(), col.r));
      if (el.__idyosFirma !== firma(el) || !enChat) quitar(el);
    });
    // 2) Variables de color del chat (Messenger pinta el tema de cada chat así)
    if (col) {
      const conVars = [...document.querySelectorAll('[style*="--"]')].filter(el => el.contains(col.caja) || col.el.contains(el));
      conVars.forEach(el => {
        // Se recuerda qué variables eran del tema del chat, para seguir el
        // acento aunque cambie (y poder devolverlas al quitar el tema)
        const reg = el.__idyosVars || (el.__idyosVars = {});
        for (let i = 0; i < el.style.length; i++) {
          const n = el.style[i]; if (!n.startsWith('--')) continue;
          const v = el.style.getPropertyValue(n), imp = el.style.getPropertyPriority(n);
          if (!imp) { // valor puesto por Meta (nuevo o de otro chat)
            if (/gradient\\(/.test(v)) reg[n] = { orig: v, grad: true };
            else if (llamativo(hex(v) || rgb(v))) reg[n] = { orig: v, grad: false };
            else { delete reg[n]; continue; }
          }
          const r = reg[n]; if (!r) continue;
          const nuevo = r.grad ? 'linear-gradient(' + acento + ',' + acento + ')' : acento;
          if (v !== nuevo || !imp) el.style.setProperty(n, nuevo, 'important');
        }
      });
    }
    // 3) Burbujas propias y fondos en degradado, solo en la conversación
    if (col) col.el.querySelectorAll('div, span, a').forEach(el => {
      if (el.dataset.idyosBurbuja || el.dataset.idyosPseudo) return;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 16 || !dentro(r, col.r) || el.contains(col.caja)) return;
      const cs = getComputedStyle(el);
      const grad = (cs.backgroundImage || '').includes('gradient');
      if (grad || llamativo(rgb(cs.backgroundColor))) {
        // Un bloque grande con el degradado es el fondo por el que "asoman" las burbujas
        el.dataset.idyosBurbuja = r.height > col.r.height * 0.4 ? 'fondo' : 'propia';
        el.__idyosFirma = firma(el); return;
      }
      const fondo = rgb(cs.backgroundColor), radio = parseFloat(cs.borderTopLeftRadius) || 0;
      if (fondo && radio >= 8 && r.height < col.r.height * 0.4 && !el.closest('[data-idyos-burbuja="propia"]')) {
        const l = lum(fondo);
        if ((!oscuro && l < 90) || (oscuro && l > 200)) { el.dataset.idyosBurbuja = 'ajena'; el.__idyosFirma = firma(el); return; }
      }
      for (const ps of ['::before', '::after']) {
        const p = getComputedStyle(el, ps);
        if (p.content !== 'none' && ((p.backgroundImage || '').includes('gradient') || llamativo(rgb(p.backgroundColor)))) { el.dataset.idyosPseudo = '1'; el.__idyosFirma = firma(el); return; }
      }
      // Textos azules (nombres, enlaces) fuera de tus mensajes: color normal
      if (!el.closest('[data-idyos-burbuja="propia"]') && llamativo(rgb(cs.color)) && (el.innerText || '').trim()) { el.dataset.idyosTexto = '1'; el.__idyosFirma = firma(el); }
    });
    // 4) Iconos azules o morados (cualquier parte)
    document.querySelectorAll('svg, svg path, svg circle, svg rect, svg polygon, svg use, svg g').forEach(el => {
      if (el.dataset.idyosIcono) return;
      const cs = getComputedStyle(el);
      if (llamativo(rgb(cs.fill)) || llamativo(rgb(cs.color))) { el.dataset.idyosIcono = '1'; el.__idyosFirma = firma(el); }
    });
    // 5) En oscuro, líneas negras muy marcadas → la línea suave de IdyOS
    document.querySelectorAll('div, section, header, footer, hr, nav').forEach(el => {
      if (el.dataset.idyosBorde) return;
      const cs = getComputedStyle(el);
      const lados = ['Top', 'Right', 'Bottom', 'Left'].filter(l => parseFloat(cs['border' + l + 'Width']) >= 1 && cs['border' + l + 'Style'] !== 'none');
      if (lados.some(l => { const c = rgb(cs['border' + l + 'Color']); return oscuro ? casiNegro(c) : (c && lum(c) < 70); })) el.dataset.idyosBorde = '1';
    });
  };
  paso(); setInterval(paso, 1200);
})()`;

const QUITAR_TEMA = `(() => {
  document.getElementById('idyos-tema')?.remove();
  document.querySelectorAll('[data-idyos-burbuja],[data-idyos-pseudo],[data-idyos-icono],[data-idyos-texto],[data-idyos-borde]').forEach(e => {
    ['idyosBurbuja', 'idyosPseudo', 'idyosIcono', 'idyosTexto', 'idyosBorde'].forEach(k => delete e.dataset[k]);
  });
  document.querySelectorAll('[style*="--"]').forEach(el => {
    if (!el.__idyosVars) return;
    Object.entries(el.__idyosVars).forEach(([n, r]) => el.style.setProperty(n, r.orig));
    el.__idyosVars = null;
  });
  window.__idyosColores = false;
})()`;

function aplicarTema(clave) {
  const wc = vistas[clave]?.webContents, canal = canalDe(clave);
  if (!wc || canal === 'whatsapp') return;
  if (!tema) { wc.executeJavaScript(QUITAR_TEMA).catch(() => {}); return; }
  const variantes = { hex: cssTema(tema, canal, false), triplete: cssTema(tema, canal, true) };
  const js = `(() => {
    const V = ${JSON.stringify(variantes)};
    let st = document.getElementById('idyos-tema');
    if (st) st.disabled = true;
    // ¿Cómo escribe Instagram sus colores? "r,g,b" o "#hex"
    const orig = getComputedStyle(document.body).getPropertyValue('--ig-primary-background').trim();
    const formato = /^\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+$/.test(orig) ? 'triplete' : 'hex';
    if (!st) { st = document.createElement('style'); st.id = 'idyos-tema'; document.head.appendChild(st); }
    st.textContent = V[formato] + ' :root{--idyos-acento:${tema.acento};--idyos-oscuro:${tema.oscuro ? 1 : 0}}';
    st.disabled = false;
  })()`;
  wc.executeJavaScript(js).then(() => wc.executeJavaScript(MARCAR_COLORES)).catch(() => {});
}
function setTema(t) { tema = t && t.acento ? t : null; Object.keys(vistas).forEach(aplicarTema); }

function aplicarVistaLimpia(clave) {
  const wc = vistas[clave]?.webContents, canal = canalDe(clave);
  // En notificaciones de Instagram/TikTok el panel vive en su menú: no se oculta
  if (!wc || !LIMPIAR[canal] || (esAvisos(clave) && canal !== 'messenger')) return;
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

function crearVista(clave) {
  if (vistas[clave]) return vistas[clave];
  const canal = canalDe(clave), avisos = esAvisos(clave);
  const base = { ...CANALES[canal], ...(avisos ? { url: AVISOS[canal].url } : {}) };
  const cfg = process.env.IDYOS_META_PRUEBA
    ? { ...base, url: process.env.IDYOS_META_PRUEBA + canal + (avisos ? '-avisos' : '') + '.html', dominios: ['localhost', '127.0.0.1', ''] }
    : base;
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
  wc.on('dom-ready', () => {
    // Los avisos de Windows salen solo de la vista de chats (evita duplicados)
    if (!avisos) wc.executeJavaScript(ENVOLVER_AVISOS).catch(() => {});
    aplicarVistaLimpia(clave); aplicarTema(clave);
  });
  // Cambian de "página" sin recargar: volver a aplicar
  wc.on('did-navigate-in-page', () => { aplicarVistaLimpia(clave); aplicarTema(clave); });
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
    if (avisos) return;
    const m = /^\((\d+)\+?\)/.exec(titulo || '');
    noLeidos[canal] = m && !SIN_CONTADOR.includes(canal) ? Number(m[1]) : 0;
    emitir('no-leidos', { ...noLeidos });
  });
  if (avisos) wc.setAudioMuted(true); // el inicio de TikTok/Instagram reproduce videos
  wc.loadURL(cfg.url);
  vistas[clave] = vista;
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

// ── Ahorro de memoria ─────────────────────────────────────────────────────
// • WhatsApp y Messenger quedan cargados (para los avisos).
// • Instagram y TikTok se cargan al entrar y se cierran a los 3 min sin verlos.
// • Si WhatsApp/Messenger llevan 30 min sin verse y pasan de 600 MB, se
//   recargan en segundo plano (la sesión se mantiene; libera lo acumulado).
const SIEMPRE_CARGADOS = ['whatsapp', 'messenger'];
const CERRAR_TRAS_MS = 3 * 60 * 1000;
const RECICLAR_TRAS_MS = 30 * 60 * 1000;
const RECICLAR_MB = 600;
const ocultoDesde = {}; // clave → momento en que dejó de verse

function memoriaMB() {
  const porPid = {};
  for (const m of app.getAppMetrics()) porPid[m.pid] = Math.round((m.memory?.workingSetSize || 0) / 1024);
  const r = {};
  for (const [c, v] of Object.entries(vistas)) {
    try { r[c] = porPid[v.webContents.getOSProcessId()] || 0; } catch { r[c] = 0; }
  }
  return r;
}

function cerrarVista(clave) {
  const v = vistas[clave];
  if (!v) return;
  if (visible === clave) ocultar();
  try { v.webContents.close(); } catch { /* noop */ }
  delete vistas[clave]; delete ocultoDesde[clave];
  const canal = canalDe(clave);
  if (!esAvisos(clave) && noLeidos[canal]) { noLeidos[canal] = 0; emitir('no-leidos', { ...noLeidos }); }
}

function revisarMemoria() {
  const ahora = Date.now();
  let mem = null;
  for (const clave of Object.keys(vistas)) {
    if (clave === visible) continue;
    const desde = ocultoDesde[clave] || (ocultoDesde[clave] = ahora);
    const canal = canalDe(clave);
    if (!SIEMPRE_CARGADOS.includes(canal) || esAvisos(clave)) {
      if (ahora - desde > CERRAR_TRAS_MS) cerrarVista(clave);
    } else if (ahora - desde > RECICLAR_TRAS_MS) {
      mem = mem || memoriaMB();
      if ((mem[clave] || 0) > RECICLAR_MB) { vistas[clave].webContents.reload(); ocultoDesde[clave] = ahora; }
    }
  }
}
setInterval(revisarMemoria, 60 * 1000).unref?.();

/** Libera memoria ya: cierra lo que no está a la vista y recarga WhatsApp/Messenger ocultos. */
function liberarMemoria() {
  for (const clave of Object.keys(vistas)) {
    if (clave === visible) continue;
    if (SIEMPRE_CARGADOS.includes(canalDe(clave)) && !esAvisos(clave)) vistas[clave].webContents.reload();
    else cerrarVista(clave);
  }
}

function mostrar(canal, nuevosLimites, modo) {
  if (!ventana || !CANALES[canal]) return;
  const clave = claveDe(canal, modo);
  if (nuevosLimites) limites = nuevosLimites;
  if (visible && visible !== clave) ocultoDesde[visible] = Date.now();
  delete ocultoDesde[clave];
  if (visible && visible !== clave && vistas[visible]) ventana.contentView.removeChildView(vistas[visible]);
  const vista = crearVista(clave);
  if (visible !== clave) ventana.contentView.addChildView(vista);
  visible = clave;
  aplicarLimites();
}

function ocultar() {
  if (visible) ocultoDesde[visible] = Date.now();
  if (ventana && visible && vistas[visible]) ventana.contentView.removeChildView(vistas[visible]);
  visible = null;
}

function moverA(nuevosLimites) { limites = nuevosLimites; aplicarLimites(); }

/** Carga los canales ya usados para recibir avisos aunque no se abra la pantalla. */
function precargar(canales) { (canales || []).forEach(c => CANALES[c] && SIEMPRE_CARGADOS.includes(c) && crearVista(c)); }

/** Cierra las vistas de notificaciones (no hace falta tenerlas cargadas). */
function cerrarAvisos() {
  for (const c of Object.keys(vistas)) if (esAvisos(c)) { try { vistas[c].webContents.close(); } catch { /* noop */ } delete vistas[c]; }
}

/** Cierra todo (al desactivar Mensajes en segundo plano). */
function cerrarTodo() {
  ocultar();
  for (const c of Object.keys(vistas)) { try { vistas[c].webContents.close(); } catch { /* noop */ } delete vistas[c]; }
}

function recargar(canal, modo) { vistas[claveDe(canal, modo)]?.webContents.reload(); }

/**
 * Lee el chat ABIERTO (solo al pulsar "Crear lead"): nombre del contacto,
 * líneas de la cabecera (en Marketplace, la publicación) y los primeros
 * mensajes visibles. Heurística sobre la página: si Meta cambia su diseño,
 * el formulario sigue siendo editable a mano.
 */
// WhatsApp Web: nombre de la cabecera y teléfono (del propio nombre si no está
// guardado, o del identificador de los mensajes "51987654321@c.us").
const LEER_WHATSAPP = `(() => {
  const limpia = t => (t || '').replace(/\\s+/g, ' ').trim();
  const main = document.querySelector('#main');
  if (!main) return null;
  const cab = main.querySelector('header');
  const tit = cab && (cab.querySelector('span[title]') || cab.querySelector('span[dir="auto"]'));
  const nombre = limpia(tit ? (tit.getAttribute('title') || tit.innerText) : '');
  let telefono = '';
  const delNombre = nombre.replace(/[^\\d+]/g, '');
  if (/^\\+?\\d{8,15}$/.test(delNombre)) telefono = delNombre.replace(/^\\+/, '');
  if (!telefono) {
    const conId = main.querySelector('[data-id*="@c.us"]');
    const m = conId && /_(\\d{8,15})@c\\.us/.exec(conId.getAttribute('data-id') || '');
    if (m) telefono = m[1];
  }
  const filas = [...main.querySelectorAll('[data-pre-plain-text], .copyable-text[data-pre-plain-text]')].slice(-6)
    .map(e => limpia(e.innerText)).filter(Boolean);
  return { nombre: /^\\+?[\\d\\s-]{8,}$/.test(nombre) ? '' : nombre, telefono, publicacion: '', lineas: [nombre].filter(Boolean), mensajes: filas, url: location.href, titulo: document.title };
})()`;

/** Datos mínimos del chat abierto (para el panel de seguimiento). */
async function chatActual(canal) {
  const wc = vistas[canal]?.webContents;
  if (!wc) return null;
  if (canal === 'whatsapp') return wc.executeJavaScript(LEER_WHATSAPP).catch(() => null);
  const c = await leerChat(canal);
  return c ? { ...c, telefono: '' } : null;
}

/** WhatsApp: abre la conversación de un número (enlace oficial de WhatsApp Web). */
function abrirChat(canal, telefono, texto) {
  const wc = canal === 'whatsapp' ? crearVista(canal).webContents : vistas[canal]?.webContents;
  const num = String(telefono || '').replace(/\D/g, '');
  if (!wc || canal !== 'whatsapp' || num.length < 8) return false;
  // El texto queda escrito en la caja del chat; enviarlo lo decide la persona
  wc.loadURL('https://web.whatsapp.com/send?phone=' + (num.length === 9 ? '51' + num : num) + (texto ? '&text=' + encodeURIComponent(String(texto)) : ''));
  return true;
}

async function leerChat(canal) {
  const wc = vistas[canal]?.webContents;
  if (!wc) return null;
  if (canal === 'whatsapp') return wc.executeJavaScript(LEER_WHATSAPP).catch(() => null);
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
    const publicacion = CANAL !== 'messenger' ? ''
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
      || document.querySelector('textarea')
      || [...document.querySelectorAll('[contenteditable="true"]')].pop();
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
  iniciar, mostrar, ocultar, moverA, precargar, cerrarTodo, cerrarAvisos, chatActual, abrirChat, memoriaMB, liberarMemoria, recargar, leerChat, pegar,
  getNoLeidos: () => ({ ...noLeidos }), CANALES,
};

// electron/preload.js
// Puente seguro entre la interfaz (Next.js) y el programa de escritorio.
// La interfaz lo usa como window.idyos (ver lib/desktop.ts). En el navegador
// no existe, y la interfaz simplemente oculta las funciones de escritorio.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('idyos', {
  esEscritorio: true,
  info: () => ipcRenderer.invoke('idyos:info'),

  // Actualizaciones
  buscarActualizacion: () => ipcRenderer.invoke('idyos:buscar'),
  descargarActualizacion: () => ipcRenderer.invoke('idyos:descargar'),
  instalarActualizacion: () => ipcRenderer.invoke('idyos:instalar'),
  alCambiarActualizacion: (fn) => {
    const h = (_e, estado) => fn(estado);
    ipcRenderer.on('idyos:actualizacion', h);
    return () => ipcRenderer.removeListener('idyos:actualizacion', h);
  },

  // Preferencias y mantenimiento
  guardarPreferencias: (cambios) => ipcRenderer.invoke('idyos:preferencias', cambios),
  abrirConexion: () => ipcRenderer.invoke('idyos:abrir-conexion'),
  verBienvenida: () => ipcRenderer.invoke('idyos:ver-bienvenida'),
  limpiarCache: () => ipcRenderer.invoke('idyos:limpiar-cache'),
  abrirCarpeta: (cual) => ipcRenderer.invoke('idyos:abrir-carpeta', cual),
  reiniciar: () => ipcRenderer.invoke('idyos:reiniciar'),

  // Google Drive (contratos y facturas)
  drive: {
    estado: () => ipcRenderer.invoke('drive:estado'),
    conectar: () => ipcRenderer.invoke('drive:conectar'),
    desconectar: () => ipcRenderer.invoke('drive:desconectar'),
    rutas: (rutas) => ipcRenderer.invoke('drive:rutas', rutas),
    subir: (datos) => ipcRenderer.invoke('drive:subir', datos),
    ver: (url) => ipcRenderer.invoke('drive:ver', url),
  },

  // Mensajes (Messenger / Instagram)
  alAbrirWhatsapp: (fn) => { const h = (_e, d) => fn(d); ipcRenderer.on('idyos:abrir-whatsapp', h); return () => ipcRenderer.removeListener('idyos:abrir-whatsapp', h); },
  insignia: (imagen, total) => ipcRenderer.send('idyos:insignia', imagen, total),
  adjunto: (url, nombre) => ipcRenderer.invoke('idyos:adjunto', url, nombre),
  arrastrar: (archivo) => ipcRenderer.send('idyos:arrastrar', archivo),
  mostrarArchivo: (archivo) => ipcRenderer.invoke('idyos:mostrar-archivo', archivo),
  meta: {
    mostrar: (canal, limites, modo) => ipcRenderer.invoke('meta:mostrar', canal, limites, modo),
    mover: (limites) => ipcRenderer.invoke('meta:mover', limites),
    ocultar: () => ipcRenderer.invoke('meta:ocultar'),
    recargar: (canal, modo) => ipcRenderer.invoke('meta:recargar', canal, modo),
    leer: (canal) => ipcRenderer.invoke('meta:leer', canal),
    pegar: (canal, texto) => ipcRenderer.invoke('meta:pegar', canal, texto),
    noLeidos: () => ipcRenderer.invoke('meta:no-leidos'),
    memoria: () => ipcRenderer.invoke('meta:memoria'),
    captura: () => ipcRenderer.invoke('meta:captura'),
    liberar: () => ipcRenderer.invoke('meta:liberar'),
    chatActual: (canal) => ipcRenderer.invoke('meta:chat-actual', canal),
    abrirChat: (canal, telefono, texto) => ipcRenderer.invoke('meta:abrir-chat', canal, telefono, texto),
    vistaLimpia: (v) => ipcRenderer.invoke('meta:vista-limpia', v),
    cuentas: () => ipcRenderer.invoke('meta:cuentas'),
    etiqueta: (canal, datos) => ipcRenderer.invoke('meta:etiqueta', canal, datos),
    conectarCuenta: (red) => ipcRenderer.invoke('meta:conectar-cuenta', red),
    tema: (t) => ipcRenderer.invoke('meta:tema', t),
    alEvento: (fn) => {
      const h = (_e, d) => fn(d);
      ipcRenderer.on('idyos:mensajes', h);
      return () => ipcRenderer.removeListener('idyos:mensajes', h);
    },
  },

  // Login en ventana propia: avisa al programa que ya hay sesión
  loginOk: () => ipcRenderer.invoke('idyos:login-ok'),
  alFondoLogin: (fn) => {
    const h = (_e, f) => fn(f);
    ipcRenderer.on('idyos:fondo-login', h);
    return () => ipcRenderer.removeListener('idyos:fondo-login', h);
  },

  // Ventana (botones tipo Mac)
  ventana: (accion) => ipcRenderer.invoke('idyos:ventana', accion),
  alCambiarVentana: (fn) => {
    const h = (_e, estado) => fn(estado);
    ipcRenderer.on('idyos:ventana', h);
    return () => ipcRenderer.removeListener('idyos:ventana', h);
  },
});

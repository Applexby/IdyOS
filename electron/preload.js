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

  // Mensajes (Messenger / Instagram)
  meta: {
    mostrar: (canal, limites, modo) => ipcRenderer.invoke('meta:mostrar', canal, limites, modo),
    mover: (limites) => ipcRenderer.invoke('meta:mover', limites),
    ocultar: () => ipcRenderer.invoke('meta:ocultar'),
    recargar: (canal, modo) => ipcRenderer.invoke('meta:recargar', canal, modo),
    leer: (canal) => ipcRenderer.invoke('meta:leer', canal),
    pegar: (canal, texto) => ipcRenderer.invoke('meta:pegar', canal, texto),
    noLeidos: () => ipcRenderer.invoke('meta:no-leidos'),
    vistaLimpia: (v) => ipcRenderer.invoke('meta:vista-limpia', v),
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

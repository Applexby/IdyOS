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
  limpiarCache: () => ipcRenderer.invoke('idyos:limpiar-cache'),
  abrirCarpeta: (cual) => ipcRenderer.invoke('idyos:abrir-carpeta', cual),
  reiniciar: () => ipcRenderer.invoke('idyos:reiniciar'),
});

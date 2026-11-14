// electron/setup-preload.js — puente de la ventana "Conexión y usuarios"
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  estado: () => ipcRenderer.invoke('setup:estado'),
  entrarRemoto: (email, password) => ipcRenderer.invoke('setup:entrar-remoto', email, password),
  desbloquear: (email, password) => ipcRenderer.invoke('setup:desbloquear', email, password),
  cargar: () => ipcRenderer.invoke('setup:cargar'),
  guardar: (conexion) => ipcRenderer.invoke('setup:guardar', conexion),
  hash: (password) => ipcRenderer.invoke('setup:hash', password),
  probarNotion: (token) => ipcRenderer.invoke('setup:probar-notion', token),
  exportar: (conexion) => ipcRenderer.invoke('setup:exportar', conexion),
  importar: () => ipcRenderer.invoke('setup:importar'),
  cerrar: () => ipcRenderer.invoke('setup:cerrar'),
  // Actualizaciones (también aquí: así un PC sin configurar puede actualizarse)
  ventana: (accion) => ipcRenderer.invoke('idyos:ventana', accion),
  info: () => ipcRenderer.invoke('idyos:info'),
  instalarActualizacion: () => ipcRenderer.invoke('idyos:instalar'),
  alCambiarActualizacion: (fn) => ipcRenderer.on('idyos:actualizacion', (_e, estado) => fn(estado)),
});

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', { track: (e) => ipcRenderer.invoke('track', e) });

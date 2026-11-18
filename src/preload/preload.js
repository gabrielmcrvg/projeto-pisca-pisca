const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('quadra', {
  command: (cmd, value) => ipcRenderer.invoke('command', cmd, value),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state)),
  onUi: callback => ipcRenderer.on('ui', (_event, message) => callback(message))
});

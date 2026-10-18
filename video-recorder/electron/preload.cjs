const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('__ELECTRON_OVERLAY__', {
  send(channel, payload) {
    ipcRenderer.send(channel, payload);
  },
  invoke(channel, payload) {
    return ipcRenderer.invoke(channel, payload);
  },
  getPathForFile(file) {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch {}
    return file?.path || '';
  },
  on(channel, callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
});

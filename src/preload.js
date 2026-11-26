const { contextBridge, ipcRenderer } = require('electron');

const liteMode = process.argv.includes('--physics-lite');
if (liteMode) {
  const markLite = () => document.documentElement?.classList.add('physics-lite');
  markLite();
  window.addEventListener('DOMContentLoaded', markLite, { once: true });
}

contextBridge.exposeInMainWorld('physicsBridge', {
  liteMode,
  listSerialPorts: () => ipcRenderer.invoke('serial:list'),
  connectSerial: (options) => ipcRenderer.invoke('serial:connect', options),
  disconnectSerial: () => ipcRenderer.invoke('serial:disconnect'),
  connectEsp32: (address) => ipcRenderer.invoke('esp32:connect', address),
  getEsp32Status: (since) => ipcRenderer.invoke('esp32:status', since),
  sendEsp32Command: (command) => ipcRenderer.invoke('esp32:command', command),
  disconnectEsp32: () => ipcRenderer.invoke('esp32:disconnect'),
  onEsp32Event: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('esp32:event', listener);
    return () => ipcRenderer.removeListener('esp32:event', listener);
  },
  onSensorData: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('sensor:data', listener);
    return () => ipcRenderer.removeListener('sensor:data', listener);
  },
  onSensorConnection: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('sensor:connection', listener);
    return () => ipcRenderer.removeListener('sensor:connection', listener);
  },
  onSensorError: (callback) => ipcRenderer.on('sensor:error', (_event, message) => callback(message)),
  onSensorWarning: (callback) => ipcRenderer.on('sensor:warning', (_event, message) => callback(message))
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('physicsBridge', {
  listSerialPorts: () => ipcRenderer.invoke('serial:list'),
  connectSerial: (options) => ipcRenderer.invoke('serial:connect', options),
  disconnectSerial: () => ipcRenderer.invoke('serial:disconnect'),
  onSensorData: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('sensor:data', listener);
    return () => ipcRenderer.removeListener('sensor:data', listener);
  },
  onSensorError: (callback) => ipcRenderer.on('sensor:error', (_event, message) => callback(message)),
  onSensorWarning: (callback) => ipcRenderer.on('sensor:warning', (_event, message) => callback(message))
});

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');

let mainWindow;
let serialPort;
let serialBuffer = '';

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const isPi = process.platform === 'linux' && ['arm', 'arm64'].includes(process.arch);

  mainWindow = new BrowserWindow({
    width: Math.min(1024, display.workAreaSize.width),
    height: Math.min(600, display.workAreaSize.height),
    minWidth: 800,
    minHeight: 480,
    fullscreen: isPi && !process.argv.includes('--dev'),
    autoHideMenuBar: true,
    backgroundColor: '#07111f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

async function listSerialPorts() {
  try {
    const { SerialPort } = require('serialport');
    return await SerialPort.list();
  } catch (error) {
    return [];
  }
}

async function connectSerial(_event, options) {
  try {
    const { SerialPort } = require('serialport');
    if (serialPort?.isOpen) await new Promise((resolve) => serialPort.close(resolve));
    serialBuffer = '';
    serialPort = new SerialPort({ path: options.path, baudRate: options.baudRate || 115200 });

    serialPort.on('data', (chunk) => {
      serialBuffer += chunk.toString('utf8');
      const lines = serialBuffer.split(/\r?\n/);
      serialBuffer = lines.pop() || '';
      for (const line of lines) {
        try {
          const payload = JSON.parse(line);
          mainWindow?.webContents.send('sensor:data', payload);
        } catch {
          mainWindow?.webContents.send('sensor:warning', `Dữ liệu không hợp lệ: ${line}`);
        }
      }
    });
    serialPort.on('error', (error) => mainWindow?.webContents.send('sensor:error', error.message));
    await new Promise((resolve, reject) => {
      serialPort.once('open', resolve);
      serialPort.once('error', reject);
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

ipcMain.handle('serial:list', listSerialPorts);
ipcMain.handle('serial:connect', connectSerial);
ipcMain.handle('serial:disconnect', async () => {
  if (!serialPort?.isOpen) return { ok: true };
  await new Promise((resolve) => serialPort.close(resolve));
  return { ok: true };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});


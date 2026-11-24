const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

let mainWindow;
let serialPort;
let serialBuffer = '';
let serialConnecting = false;
let reconnectTimer;
let esp32BaseUrl = '';
const DEFAULT_FORCE_PORT = '/dev/ttyUSB0';
const SERIAL_BAUD_RATE = 115200;
const RECONNECT_DELAY_MS = 3000;
const ESP32_TIMEOUT_MS = 4000;

function normalizeEsp32Address(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Vui lòng nhập IP của xe ESP32');
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
  const parts = url.hostname.split('.').map(Number);
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) && parts.every((part) => part <= 255);
  const isPrivate = isIpv4 && (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254));
  const isLocalName = /^[a-z0-9-]+\.local$/i.test(url.hostname);
  if (url.protocol !== 'http:' || (!isPrivate && !isLocalName) || url.username || url.password) {
    throw new Error('Hãy nhập IP nội bộ của ESP32, ví dụ 192.168.1.50');
  }
  return `${url.protocol}//${url.host}`;
}

async function requestEsp32(pathname, method = 'GET') {
  if (!esp32BaseUrl) throw new Error('Xe ESP32 chưa kết nối');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ESP32_TIMEOUT_MS);
  try {
    const response = await fetch(`${esp32BaseUrl}${pathname}`, { method, cache: 'no-store', signal: controller.signal });
    // /status có thể kèm tới 64 lần đo (~120 byte/lần) nên cho phép tới 16 KB.
    const body = (await response.text()).slice(0, 16384);
    if (!response.ok) throw new Error(`ESP32 trả về HTTP ${response.status}`);
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('ESP32 không phản hồi trong 4 giây');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function configureLinuxSerial(serialPath, baudRate) {
  return new Promise((resolve, reject) => {
    execFile('stty', ['-F', serialPath, String(baudRate), 'cs8', '-cstopb', '-parenb', '-ixon', '-ixoff', 'raw', '-echo'], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function sendSerialChunk(chunk) {
  serialBuffer += chunk.toString('utf8');
  const lines = serialBuffer.split(/\r?\n/);
  serialBuffer = lines.pop() || '';
  for (const line of lines) {
    const input = line.trim();
    if (!input) continue;
    try {
      const decoded = JSON.parse(input);
      const payload = typeof decoded === 'number' ? { type: 'force', value: decoded } : decoded;
      mainWindow?.webContents.send('sensor:data', payload);
    } catch {
      const forceMatch = input.match(/^value\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*N?$/i);
      if (forceMatch) {
        mainWindow?.webContents.send('sensor:data', { type: 'force', value: Number(forceMatch[1]) });
      } else {
        mainWindow?.webContents.send('sensor:warning', `Dữ liệu không hợp lệ: ${line}`);
      }
    }
  }
}

async function closeSerialPort() {
  if (!serialPort?.isOpen) return;
  serialPort.intentionalClose = true;
  await new Promise((resolve) => serialPort.close(resolve));
}

async function openLinuxSerial(serialPath, baudRate, options) {
  await configureLinuxSerial(serialPath, baudRate);
  const stream = fs.createReadStream(serialPath, { flags: 'r', autoClose: true });
  const port = {
    path: serialPath,
    intentionalClose: false,
    get isOpen() { return !stream.destroyed; },
    close(callback) {
      stream.once('close', callback);
      stream.destroy();
    }
  };
  serialPort = port;
  stream.on('data', sendSerialChunk);
  stream.on('error', (error) => {
    if (port.isOpen) mainWindow?.webContents.send('sensor:error', error.message);
  });
  stream.on('close', () => {
    if (options?.automatic && !port.intentionalClose) {
      scheduleSerialReconnect(new Error('Cổng serial đã ngắt kết nối'));
    }
  });
  await new Promise((resolve, reject) => {
    stream.once('open', resolve);
    stream.once('error', reject);
  });
}

function scheduleSerialReconnect(error) {
  clearTimeout(reconnectTimer);
  mainWindow?.webContents.send('sensor:connection', {
    connected: false,
    path: DEFAULT_FORCE_PORT,
    error: error?.message || String(error),
    retrying: true
  });
  reconnectTimer = setTimeout(() => {
    connectSerial(null, { path: DEFAULT_FORCE_PORT, baudRate: SERIAL_BAUD_RATE, automatic: true });
  }, RECONNECT_DELAY_MS);
  reconnectTimer.unref?.();
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const isPi = process.platform === 'linux' && ['arm', 'arm64'].includes(process.arch);
  // Chế độ nhẹ: trên Pi 3 Chromium không dùng được GPU (VC4 chỉ có GLES 2.0) nên
  // mọi hiệu ứng blur/bóng đổ/animation đều do CPU vẽ. PHYSICS_LITE=1/0 để ép bật/tắt.
  const liteMode = process.env.PHYSICS_LITE ? process.env.PHYSICS_LITE === '1' : isPi;

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
      nodeIntegration: false,
      additionalArguments: liteMode ? ['--physics-lite'] : []
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => {
    if (process.platform === 'linux') {
      connectSerial(null, { path: DEFAULT_FORCE_PORT, baudRate: SERIAL_BAUD_RATE, automatic: true });
    }
  });
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
  const serialPath = options?.path || DEFAULT_FORCE_PORT;
  if (serialConnecting) return { ok: false, error: 'Đang kết nối cổng serial' };
  if (serialPort?.isOpen && serialPort.path === serialPath) return { ok: true, path: serialPath };

  serialConnecting = true;
  clearTimeout(reconnectTimer);
  try {
    await closeSerialPort();
    serialBuffer = '';
    const baudRate = options?.baudRate || SERIAL_BAUD_RATE;
    if (process.platform === 'linux' && serialPath.startsWith('/dev/')) {
      await openLinuxSerial(serialPath, baudRate, options);
    } else {
      const { SerialPort } = require('serialport');
      serialPort = new SerialPort({ path: serialPath, baudRate });
      serialPort.on('data', sendSerialChunk);
      await new Promise((resolve, reject) => {
        serialPort.once('open', resolve);
        serialPort.once('error', reject);
      });
    }
    mainWindow?.webContents.send('sensor:connection', { connected: true, path: serialPath });
    return { ok: true, path: serialPath };
  } catch (error) {
    if (options?.automatic) scheduleSerialReconnect(error);
    return { ok: false, error: error.message };
  } finally {
    serialConnecting = false;
  }
}

ipcMain.handle('serial:list', listSerialPorts);
ipcMain.handle('serial:connect', connectSerial);
ipcMain.handle('serial:disconnect', async () => {
  await closeSerialPort();
  return { ok: true };
});
ipcMain.handle('esp32:connect', async (_event, address) => {
  try {
    esp32BaseUrl = normalizeEsp32Address(address);
    const telemetry = JSON.parse(await requestEsp32('/status?since=0'));
    if (telemetry?.type !== 'speed') throw new Error('Dữ liệu /status không hợp lệ');
    return { ok: true, address: esp32BaseUrl, telemetry };
  } catch (error) {
    esp32BaseUrl = '';
    return { ok: false, error: error.message };
  }
});
ipcMain.handle('esp32:status', async (_event, since) => {
  try {
    // since = số thứ tự lần đo cuối Pi đã nhận; ESP32 chỉ trả các lần đo mới hơn.
    const sinceSeq = Number.isSafeInteger(since) && since > 0 ? since : 0;
    return { ok: true, telemetry: JSON.parse(await requestEsp32(`/status?since=${sinceSeq}`)) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
ipcMain.handle('esp32:command', async (_event, command) => {
  if (!['start', 'stop', 'reset'].includes(command)) return { ok: false, error: 'Lệnh không hợp lệ' };
  try {
    await requestEsp32(`/${command}`, 'POST');
    return { ok: true, command };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
ipcMain.handle('esp32:disconnect', async () => {
  esp32BaseUrl = '';
  return { ok: true };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  clearTimeout(reconnectTimer);
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});


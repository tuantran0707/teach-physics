const { spawn } = require('node:child_process');
const electronPath = require('electron');

const forwarded = process.argv.slice(2);
const entry = forwarded[0]?.endsWith('.js') ? forwarded.shift() : '.';
const environment = { ...process.env };

// Some coding/CI environments set this globally. It makes Electron run as
// plain Node.js, where APIs such as app, BrowserWindow and ipcMain do not exist.
delete environment.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [entry, ...forwarded], {
  cwd: process.cwd(),
  env: environment,
  stdio: 'inherit',
  windowsHide: false
});

child.on('error', (error) => {
  console.error(`Không thể khởi động Electron: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

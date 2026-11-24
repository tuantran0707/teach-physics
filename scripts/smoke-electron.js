const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

app.disableHardwareAcceleration();
ipcMain.handle('serial:list', async () => []);
ipcMain.handle('serial:connect', async () => ({ ok: true }));
ipcMain.handle('serial:disconnect', async () => ({ ok: true }));
let esp32Running = false;
ipcMain.handle('esp32:connect', async (_event, address) => ({ ok: true, address: `http://${address}`, telemetry: { type: 'speed', value: 0, elapsed_s: 0, running: false } }));
ipcMain.handle('esp32:status', async () => ({ ok: true, telemetry: { type: 'speed', value: esp32Running ? 6.4 : 0, elapsed_s: esp32Running ? 1 : 0, running: esp32Running } }));
ipcMain.handle('esp32:command', async (_event, command) => { esp32Running = command === 'start'; return { ok: true, command }; });
ipcMain.handle('esp32:disconnect', async () => ({ ok: true }));

async function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1024, height: 600, show: false, resizable: false,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const audioOnly = process.argv.includes('--audio-only');
  const pages = audioOnly ? ['displacement'] : ['home', 'displacement', 'force', 'speed'];
  const results = [];
  for (const page of pages) {
    console.log(`Kiểm tra: ${page}`);
    if (page !== 'home') {
      await window.webContents.executeJavaScript(`document.querySelector('[data-lesson="${page}"]').click()`);
      await wait(180);
    }
    let audioPlayback = null;
    if (page === 'displacement' && audioOnly) {
      audioPlayback = await window.webContents.executeJavaScript(`(async () => {
        const audio = document.querySelector('#garden-song');
        await Promise.race([new Promise(resolve => audio.addEventListener('loadedmetadata', resolve, { once: true })), new Promise(resolve => setTimeout(resolve, 1800))]);
        const metadataLoaded = audio.readyState >= 1;
        let advanced = false;
        let playError = null;
        if (metadataLoaded) {
          try {
            await audio.play();
            const startedAt = audio.currentTime;
            await new Promise(resolve => setTimeout(resolve, 1000));
            advanced = audio.currentTime > startedAt;
          } catch (error) { playError = error.name; }
        }
        audio.pause();
        document.querySelector('#song-start-game').click();
        document.querySelector('.guide-overlay [data-guide-close]')?.click();
        return { metadataLoaded, advanced, playError, duration: Number.isFinite(audio.duration) ? audio.duration : null };
      })()`, true);
      await wait(180);
    }
    if (page === 'displacement' && !audioOnly) {
      await window.webContents.executeJavaScript(`document.querySelector('#garden-song').pause();document.querySelector('#song-start-game').click();document.querySelector('.guide-overlay [data-guide-close]')?.click()`);
      await wait(180);
    }
    if (audioOnly) {
      console.log(JSON.stringify({ audioPlayback }, null, 2));
      await window.close();
      app.quit();
      return;
    }
    const metrics = await window.webContents.executeJavaScript(`(() => ({
      page: ${JSON.stringify(page)},
      viewport: { width: innerWidth, height: innerHeight },
      body: { width: document.body.scrollWidth, height: document.body.scrollHeight },
      interactive: [...document.querySelectorAll('button, input, select')].map(e => ({
        label: (e.textContent || e.getAttribute('aria-label') || e.id).trim().slice(0, 40),
        width: Math.round(e.getBoundingClientRect().width), height: Math.round(e.getBoundingClientRect().height),
        visible: !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length)
      })).filter(x => x.visible)
    }))()`);
    if (audioPlayback) metrics.audioPlayback = audioPlayback;

    if (page === 'displacement') {
      metrics.interaction = await window.webContents.executeJavaScript(`(async () => {
        const waitFor = async (check, timeout = 10000) => {
          const started = Date.now();
          while (Date.now() - started < timeout) {
            if (check()) return true;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          return false;
        };
        const layoutSignature = () => [...document.querySelectorAll('.fruit-cell,.hazard-cell')]
          .map(cell => cell.dataset.x + ',' + cell.dataset.y + ':' + (cell.dataset.fruitType || cell.dataset.hazard)).sort().join('|');
        const firstLayout = layoutSignature();
        document.querySelector('#shuffle-map').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const mapRandomized = firstLayout !== layoutSignature();
        const hazards = new Set([...document.querySelectorAll('.hazard-cell')].map(cell => cell.dataset.x + ',' + cell.dataset.y));
        hazards.add('12,0');
        const fruits = new Set([...document.querySelectorAll('.fruit-cell')].map(cell => cell.dataset.x + ',' + cell.dataset.y));
        const queue = [{ x: 2, y: 4, path: [] }];
        const visited = new Set(['2,4']);
        const directionList = [
          { key: 'north', dx: 0, dy: -1 }, { key: 'east', dx: 1, dy: 0 },
          { key: 'south', dx: 0, dy: 1 }, { key: 'west', dx: -1, dy: 0 }
        ];
        let fruitRoute = null;
        while (queue.length && !fruitRoute) {
          const current = queue.shift();
          if (current.path.length > 0 && fruits.has(current.x + ',' + current.y)) { fruitRoute = current; break; }
          if (current.path.length >= 6) continue;
          for (const direction of directionList) {
            const x = current.x + direction.dx; const y = current.y + direction.dy; const key = x + ',' + y;
            if (x < 0 || x >= 13 || y < 0 || y >= 9 || hazards.has(key) || visited.has(key)) continue;
            visited.add(key); queue.push({ x, y, path: [...current.path, direction.key] });
          }
        }
        if (!fruitRoute) throw new Error('Không tìm thấy trái cây trong tối đa 6 bước');
        const values = [(fruitRoute.path.length - .5) / 6];
        Math.random = () => values.length ? values.shift() : .20;
        document.querySelector('#garden-roll').click();
        await new Promise(resolve => setTimeout(resolve, 160));
        const popupVisible = !!document.querySelector('.garden-roll-overlay');
        await new Promise(resolve => setTimeout(resolve, 1850));
        const roll = document.querySelector('#step-status').textContent;
        fruitRoute.path.forEach(direction => document.querySelector('[data-direction="' + direction + '"]').click());
        const routeVisible = document.querySelectorAll('.route-arrows').length > 0;
        const executeEnabled = !document.querySelector('#execute-route').disabled;
        document.querySelector('#execute-route').click();
        const quizVisible = await waitFor(() => !!document.querySelector('.physics-quiz-overlay'), 6000);
        const quizRect = document.querySelector('.physics-quiz-card')?.getBoundingClientRect();
        const quizFitsViewport = !!quizRect && quizRect.top >= 58 && quizRect.bottom <= innerHeight && quizRect.left >= 0 && quizRect.right <= innerWidth;
        const quizOptions = [...document.querySelectorAll('.quiz-option')];
        const quizAnswersStacked = quizOptions.length === 3 && quizOptions[0].getBoundingClientRect().top < quizOptions[1].getBoundingClientRect().top && quizOptions[1].getBoundingClientRect().top < quizOptions[2].getBoundingClientRect().top;
        document.querySelector('.quiz-option[data-correct="true"]')?.click();
        const opponentTurnStarted = await waitFor(() => document.querySelector('#garden-player-name').textContent === 'Robot Làm Vườn', 4000);
        const pawnCell = document.querySelector('.squirrel-1').parentElement;
        const fruitCollected = document.querySelector('[data-x="' + fruitRoute.x + '"][data-y="' + fruitRoute.y + '"]')?.classList.contains('collected-by-1');
        const pawnRect = document.querySelector('.squirrel-1').getBoundingClientRect();
        const cellRect = pawnCell.getBoundingClientRect();
        const cpuReturnedTurn = await waitFor(() => document.querySelector('#garden-player-name').textContent === 'Sóc Nâu', 10000);
        return {
          popupVisible,
          mapRandomized,
          roll,
          routeVisible,
          executeEnabled,
          quizVisible,
          quizFitsViewport,
          quizAnswersStacked,
          fruitCollected,
          squirrelPosition: { x: Number(pawnCell.dataset.x), y: Number(pawnCell.dataset.y) },
          opponentTurnStarted,
          cpuReturnedTurn,
          pawnInsideCell: pawnRect.left >= cellRect.left && pawnRect.right <= cellRect.right && pawnRect.top >= cellRect.top && pawnRect.bottom <= cellRect.bottom,
          pawnRect: { width: Math.round(pawnRect.width), height: Math.round(pawnRect.height), top: Math.round(pawnRect.top), bottom: Math.round(pawnRect.bottom) },
          cellRect: { width: Math.round(cellRect.width), height: Math.round(cellRect.height), top: Math.round(cellRect.top), bottom: Math.round(cellRect.bottom) },
          mapCells: document.querySelectorAll('.garden-cell').length,
          fruitCells: document.querySelectorAll('.fruit-cell').length,
          fruitTypes: new Set([...document.querySelectorAll('.fruit-cell')].map(cell => cell.dataset.fruitType)).size,
          hazardCells: document.querySelectorAll('.hazard-cell').length,
          customMud: document.querySelectorAll('.mud-art').length,
          customHole: document.querySelectorAll('.hole-art').length,
          robotSprite: document.querySelector('.robot-pawn img')?.getAttribute('src'),
          mapWidth: Math.round(document.querySelector('.garden-board-panel').getBoundingClientRect().width),
          sideWidth: Math.round(document.querySelector('.garden-sidebar').getBoundingClientRect().width)
        };
      })()`);
    }
    if (page === 'force') {
      metrics.interaction = await window.webContents.executeJavaScript(`(() => {
        const slider = document.querySelector('#force-slider'); slider.value = 75; slider.dispatchEvent(new Event('input'));
        document.querySelector('#toggle-values').click();
        return { status: document.querySelector('#force-status').textContent, valuesHidden: document.querySelector('.measured').classList.contains('hidden-value') };
      })()`);
    }
    if (page === 'speed') {
      await window.webContents.executeJavaScript(`document.querySelector('#esp32-connect').click();document.querySelector('#esp32-ip').value='192.168.1.50';document.querySelector('#esp32-submit').click()`);
      await wait(100);
      await window.webContents.executeJavaScript(`document.querySelector('#car-start').click()`);
      await wait(1600);
      metrics.interaction = await window.webContents.executeJavaScript(`({ rows: document.querySelectorAll('#speed-rows tr').length, columns: document.querySelectorAll('.data-table th').length, speed: document.querySelector('#speed-value').textContent, connected: document.querySelector('#esp32-connect').classList.contains('connected'), controlsVisible: !document.querySelector('#car-start').hidden && !document.querySelector('#car-stop').hidden })`);
      await window.webContents.executeJavaScript(`document.querySelector('#car-stop').click()`);
    }
    results.push(metrics);
    if (page !== 'home') {
      await window.webContents.executeJavaScript(`document.querySelector('[data-home]').click()`);
      await wait(100);
    }
  }
  console.log(JSON.stringify({ results }, null, 2));
  await window.close();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

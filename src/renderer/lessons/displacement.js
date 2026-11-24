(() => {
  const COLS = 13;
  const ROWS = 9;
  const METERS_PER_CELL = 1;
  const FAIR = { x: 12, y: 0 };
  const REQUIRED_FRUIT_TYPES = 3;
  const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const DIRECTIONS = {
    north: { key: 'north', name: 'Bắc', icon: '↑', dx: 0, dy: -1 },
    east: { key: 'east', name: 'Đông', icon: '→', dx: 1, dy: 0 },
    south: { key: 'south', name: 'Nam', icon: '↓', dx: 0, dy: 1 },
    west: { key: 'west', name: 'Tây', icon: '←', dx: -1, dy: 0 }
  };
  const FRUIT_TYPES = [
    { id: 'apple', name: 'Táo đỏ', icon: '🍎' },
    { id: 'orange', name: 'Cam vàng', icon: '🍊' },
    { id: 'grapes', name: 'Nho tím', icon: '🍇' },
    { id: 'strawberry', name: 'Dâu tây', icon: '🍓' }
  ];
  const DEFAULT_FRUITS = [
    { instance: 'apple-1', type: 'apple', name: 'Táo đỏ', icon: '🍎', x: 0, y: 0 },
    { instance: 'apple-2', type: 'apple', name: 'Táo đỏ', icon: '🍎', x: 5, y: 1 },
    { instance: 'apple-3', type: 'apple', name: 'Táo đỏ', icon: '🍎', x: 10, y: 7 },
    { instance: 'orange-1', type: 'orange', name: 'Cam vàng', icon: '🍊', x: 12, y: 8 },
    { instance: 'orange-2', type: 'orange', name: 'Cam vàng', icon: '🍊', x: 8, y: 1 },
    { instance: 'orange-3', type: 'orange', name: 'Cam vàng', icon: '🍊', x: 1, y: 6 },
    { instance: 'grapes-1', type: 'grapes', name: 'Nho tím', icon: '🍇', x: 0, y: 8 },
    { instance: 'grapes-2', type: 'grapes', name: 'Nho tím', icon: '🍇', x: 4, y: 6 },
    { instance: 'grapes-3', type: 'grapes', name: 'Nho tím', icon: '🍇', x: 11, y: 3 },
    { instance: 'strawberry-1', type: 'strawberry', name: 'Dâu tây', icon: '🍓', x: 12, y: 4 },
    { instance: 'strawberry-2', type: 'strawberry', name: 'Dâu tây', icon: '🍓', x: 6, y: 8 },
    { instance: 'strawberry-3', type: 'strawberry', name: 'Dâu tây', icon: '🍓', x: 2, y: 1 }
  ];
  const { QUESTIONS: PHYSICS_QUESTIONS, voiceClips } = window.PhysicsQuestions;

  // Giọng đọc tiếng Việt: phát file giọng AI thu sẵn assets/voice/<clip>.mp3 (tạo bằng
  // `npm run voice`); nếu thiếu file thì thử giọng tiếng Việt của hệ điều hành (Web Speech API).
  // read() trả về Promise, xong khi đọc hết (hoặc bị dừng / lỗi).
  const VoiceReader = (() => {
    let audio = null;
    let finishCurrent = null;
    function pickVoice() {
      const voices = window.speechSynthesis?.getVoices() || [];
      const vietnamese = voices.filter((voice) => /^vi/i.test(voice.lang));
      return vietnamese.find((voice) => /natural|neural|online|google/i.test(voice.name)) || vietnamese[0] || null;
    }
    function speakText(text, done) {
      const synth = window.speechSynthesis;
      const voice = pickVoice();
      if (!synth || !voice) { done(); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.92;
      utterance.voice = voice;
      utterance.onend = done;
      utterance.onerror = done;
      synth.speak(utterance);
    }
    function stop() {
      window.speechSynthesis?.cancel();
      if (audio) { audio.pause(); audio = null; }
      finishCurrent?.();
    }
    function read(text, clipId) {
      stop();
      return new Promise((resolve) => {
        let settled = false;
        const done = () => { if (settled) return; settled = true; if (finishCurrent === done) finishCurrent = null; resolve(); };
        finishCurrent = done;
        if (!clipId) { speakText(text, done); return; }
        const clip = new Audio(`assets/voice/${clipId}.mp3`);
        audio = clip;
        clip.addEventListener('ended', done, { once: true });
        clip.addEventListener('error', () => {
          if (audio !== clip) return;
          audio = null;
          speakText(text, done);
        }, { once: true });
        clip.play().catch(() => {});
      });
    }
    window.speechSynthesis?.getVoices();
    return { read, stop };
  })();
  const DEFAULT_HAZARDS = [
    { x: 3, y: 1, type: 'mud', icon: '🟤', name: 'vũng bùn' },
    { x: 7, y: 2, type: 'thorn', icon: '🌵', name: 'bụi gai' },
    { x: 10, y: 1, type: 'hole', icon: '🕳️', name: 'hố sâu' },
    { x: 5, y: 4, type: 'mud', icon: '🟤', name: 'vũng bùn' },
    { x: 9, y: 4, type: 'thorn', icon: '🌵', name: 'bụi gai' },
    { x: 3, y: 6, type: 'hole', icon: '🕳️', name: 'hố sâu' },
    { x: 7, y: 7, type: 'mud', icon: '🟤', name: 'vũng bùn' },
    { x: 10, y: 6, type: 'thorn', icon: '🌵', name: 'bụi gai' }
  ];
  const HAZARD_TYPES = [
    { type: 'mud', icon: '', name: 'vũng bùn' },
    { type: 'mud', icon: '', name: 'vũng bùn' },
    { type: 'mud', icon: '', name: 'vũng bùn' },
    { type: 'thorn', icon: '🌵', name: 'bụi gai' },
    { type: 'thorn', icon: '🌵', name: 'bụi gai' },
    { type: 'thorn', icon: '🌵', name: 'bụi gai' },
    { type: 'hole', icon: '', name: 'hố sâu' },
    { type: 'hole', icon: '', name: 'hố sâu' }
  ];
  let FRUITS = DEFAULT_FRUITS.map((fruit) => ({ ...fruit }));
  let HAZARDS = DEFAULT_HAZARDS.map((hazard) => ({ ...hazard }));

  function mount() {
    window.ui.lessonShell('Khu vườn trên mây', 'Bài 01 · Quãng đường, độ dịch chuyển và vận tốc', `
      <div class="garden-layout">
        <section class="garden-board-panel">
          <div class="garden-board-head">
            <div class="garden-turn" id="garden-turn"></div>
            <div class="sunset"><span>☀️</span><div><i id="sun-progress"></i></div><span>🌙</span></div>
            <div class="fair-label">🎪 Hội chợ</div>
          </div>
          <div class="game-caption" id="game-caption" aria-live="polite"><span>🧭</span><strong>Gieo xúc xắc để bắt đầu hành trình</strong></div>
          <div class="garden-grid" id="garden-grid"></div>
          <div class="garden-legend"><span>🍎🍊🍇🍓 TRÁI CÂY · Cần đủ 3 loại</span><span class="legend-hazard">⚠ CHƯỚNG NGẠI · Bùn · Gai · Hố sâu</span><span>🎪 ĐÍCH</span></div>
        </section>
        <aside class="garden-sidebar">
          <div class="garden-player-card" id="garden-player-card">
            <img src="assets/garden/squirrel.svg" alt="Sóc Nâu">
            <div><small>ĐANG ĐẾN LƯỢT</small><strong id="garden-player-name">Sóc Nâu</strong></div>
            <span class="turn-token" id="turn-token">1</span>
          </div>
          <label class="opponent-control">Đối thủ
            <select id="opponent-mode"><option value="cpu">🤖 Đấu với máy</option><option value="human">👥 Hai học sinh</option></select>
          </label>
          <div class="fruit-basket"><span>🧺</span><div><small>GIỎ TRÁI CÂY · CẦN 3 LOẠI</small><strong id="fruit-basket">○ ○ ○ ○</strong></div></div>
          <div class="garden-dice-row">
            <div class="garden-dice" id="garden-dice">?</div>
            <div><small>SỐ BƯỚC</small><strong id="step-status">Chưa gieo</strong><span id="plan-status">Hãy gieo xúc xắc</span></div>
          </div>
          <button class="primary wide" id="garden-roll">🎲 Gieo xúc xắc</button>
          <div class="direction-panel" id="direction-panel">
            <small>VẠCH ĐƯỜNG ĐI TỐI ƯU</small>
            <div class="direction-pad">
              <button data-direction="north" aria-label="Bắc">↑<small>BẮC</small></button>
              <button data-direction="west" aria-label="Tây">←<small>TÂY</small></button>
              <button class="center" id="undo-step" aria-label="Hoàn tác">↶<small>XÓA</small></button>
              <button data-direction="east" aria-label="Đông">→<small>ĐÔNG</small></button>
              <button data-direction="south" aria-label="Nam">↓<small>NAM</small></button>
            </div>
            <button class="garden-go" id="execute-route" disabled>Cho Sóc đi</button>
          </div>
          <div class="garden-stats">
            <div><strong id="garden-distance">0 m</strong><small>QUÃNG ĐƯỜNG</small></div>
            <div><strong id="garden-speed">0.00</strong><small>TỐC ĐỘ TB (m/s)</small></div>
            <div><strong id="garden-velocity">0.00</strong><small>VẬN TỐC TB (m/s)</small></div>
          </div>
        </aside>
      </div>`, '<button class="chip" id="shuffle-map">🔀 Đổi bản đồ</button><button class="chip" id="sound-toggle">🔊 Hiệu ứng</button>');

    const state = {
      players: [
        { name: 'Sóc Nâu', image: 'assets/garden/squirrel.svg', x: 2, y: 4, startX: 2, startY: 4, distance: 0, collected: new Set(), lastFruit: null, history: [{ x: 2, y: 4 }], color: '#ff9e42' },
        { name: 'Robot Làm Vườn', image: 'assets/garden/robot.svg', x: 2, y: 5, startX: 2, startY: 5, distance: 0, collected: new Set(), lastFruit: null, history: [{ x: 2, y: 5 }], color: '#72c7ff' }
      ],
      turn: 0,
      mode: 'cpu',
      phase: 'await-roll',
      roll: 0,
      plan: [],
      startedAt: Date.now(),
      alive: true,
      finished: false,
      sound: true,
      timers: new Set(),
      pawns: [],
      audioContext: null,
      activeQuizResolve: null,
      questionDeck: [],
      lastQuestionId: null
    };
    const grid = document.querySelector('#garden-grid');
    grid.style.setProperty('--garden-cols', COLS);
    grid.style.setProperty('--garden-rows', ROWS);

    function wait(ms) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => { state.timers.delete(timer); resolve(); }, ms);
        state.timers.add(timer);
      });
    }
    function key(x, y) { return `${x},${y}`; }
    function cellAt(x, y) { return grid.querySelector(`[data-x="${x}"][data-y="${y}"]`); }
    function currentPlayer() { return state.players[state.turn]; }
    function fruitAt(x, y) { return FRUITS.find((fruit) => fruit.x === x && fruit.y === y); }
    function hazardAt(x, y) { return HAZARDS.find((hazard) => hazard.x === x && hazard.y === y); }
    function inside(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

    function shuffled(items) {
      const result = [...items];
      for (let index = result.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
      }
      return result;
    }

    function layoutIsPlayable(fruits, hazards) {
      const blocked = new Set(hazards.map((hazard) => key(hazard.x, hazard.y)));
      const targets = [FAIR, ...fruits];
      const starts = [{ x: 2, y: 4 }, { x: 2, y: 5 }];
      return starts.every((start) => {
        const visited = new Set([key(start.x, start.y)]);
        const distances = new Map([[key(start.x, start.y), 0]]);
        const queue = [{ ...start, distance: 0 }];
        while (queue.length) {
          const current = queue.shift();
          for (const direction of Object.values(DIRECTIONS)) {
            const x = current.x + direction.dx;
            const y = current.y + direction.dy;
            const positionKey = key(x, y);
            if (!inside(x, y) || blocked.has(positionKey) || visited.has(positionKey)) continue;
            visited.add(positionKey);
            distances.set(positionKey, current.distance + 1);
            queue.push({ x, y, distance: current.distance + 1 });
          }
        }
        const hasNearbyFruit = fruits.some((fruit) => (distances.get(key(fruit.x, fruit.y)) ?? Infinity) <= 5);
        return hasNearbyFruit && targets.every((target) => visited.has(key(target.x, target.y)));
      });
    }

    function generateMapLayout() {
      const reserved = new Set([key(FAIR.x, FAIR.y), key(2, 4), key(2, 5)]);
      const positions = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (!reserved.has(key(x, y))) positions.push({ x, y });
        }
      }
      for (let attempt = 0; attempt < 80; attempt++) {
        const available = shuffled(positions);
        const fruitPositions = available.slice(0, 12);
        const hazardPositions = available.slice(12, 20);
        const fruits = fruitPositions.map((position, index) => {
          const fruitType = FRUIT_TYPES[index % FRUIT_TYPES.length];
          return { type: fruitType.id, name: fruitType.name, icon: fruitType.icon, instance: `${fruitType.id}-${Math.floor(index / FRUIT_TYPES.length) + 1}`, ...position };
        });
        const hazards = hazardPositions.map((position, index) => ({ ...HAZARD_TYPES[index], ...position }));
        if (!layoutIsPlayable(fruits, hazards)) continue;
        FRUITS = fruits;
        HAZARDS = hazards;
        return;
      }
      FRUITS = DEFAULT_FRUITS.map((fruit) => ({ ...fruit }));
      HAZARDS = DEFAULT_HAZARDS.map((hazard) => ({ ...hazard }));
    }

    function createMap() {
      grid.replaceChildren();
      state.pawns = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const cell = document.createElement('div');
          cell.className = 'garden-cell';
          cell.dataset.x = x;
          cell.dataset.y = y;
          const fruit = fruitAt(x, y);
          const hazard = hazardAt(x, y);
          if (x === FAIR.x && y === FAIR.y) {
            cell.classList.add('fair-cell');
            cell.innerHTML = '<b class="fair-flag">ĐÍCH</b><span class="map-object fair-tent">🎪</span><small>HỘI CHỢ</small>';
          } else if (fruit) {
            cell.classList.add('fruit-cell');
            cell.dataset.fruit = fruit.instance;
            cell.dataset.fruitType = fruit.type;
            cell.setAttribute('aria-label', `Trái cây: ${fruit.name}`);
            cell.innerHTML = `<span class="map-object fruit-object">${fruit.icon}</span>`;
          } else if (hazard) {
            cell.classList.add('hazard-cell', hazard.type);
            cell.dataset.hazard = hazard.type;
            cell.setAttribute('aria-label', `Chướng ngại vật: ${hazard.name}`);
            const hazardArt = hazard.type === 'mud'
              ? '<span class="map-object hazard-object mud-art"><i></i><i></i><i></i></span>'
              : hazard.type === 'hole'
                ? '<span class="map-object hazard-object hole-art"></span>'
                : `<span class="map-object hazard-object thorn-art">${hazard.icon}</span>`;
            cell.innerHTML = `<b class="hazard-warning">!</b>${hazardArt}`;
          } else if ((x === 2 && y === 4) || (x === 2 && y === 5)) {
            cell.classList.add('cave-cell');
            cell.innerHTML = '<span class="map-object">🪵</span><small>HANG SÓC</small>';
          } else {
            cell.innerHTML = '<span class="garden-flower">✦</span>';
          }
          grid.appendChild(cell);
        }
      }
      state.players.forEach((player, index) => {
        const pawn = document.createElement('div');
        pawn.className = `squirrel-pawn squirrel-${index + 1}${index === 1 && state.mode === 'cpu' ? ' robot-pawn' : ''}`;
        pawn.dataset.shortName = index === 0 ? 'SÓC NÂU' : 'ROBOT';
        pawn.innerHTML = `<img src="${player.image}" alt="${player.name}"><span>${index + 1}</span>`;
        state.pawns.push(pawn);
      });
    }

    function placePawns(animateIndex = -1) {
      state.players.forEach((player, index) => {
        const pawn = state.pawns[index];
        const cell = cellAt(player.x, player.y);
        if (cell && pawn.parentElement !== cell) {
          pawn.classList.remove('active');
          cell.appendChild(pawn);
        }
        pawn.classList.toggle('active', index === state.turn);
        if (index === animateIndex) {
          pawn.classList.remove('hopping');
          requestAnimationFrame(() => pawn.classList.add('hopping'));
        }
      });
    }

    function getAudioContext() {
      if (!state.audioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) state.audioContext = new AudioContext();
      }
      return state.audioContext;
    }

    function playClack(pitch = 140) {
      if (!state.sound) return;
      const context = getAudioContext();
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(pitch, context.currentTime);
      gain.gain.setValueAtTime(.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .055);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + .06);
    }

    function showCaption(message, tone = 'info') {
      const caption = document.querySelector('#game-caption');
      if (!caption) return;
      const icons = { info: '🧭', success: '✨', danger: '⚠️', review: '📍' };
      caption.className = `game-caption visible ${tone}`;
      caption.querySelector('span').textContent = icons[tone] || icons.info;
      caption.querySelector('strong').textContent = message;
    }

    function speak(message, tone = 'info') {
      showCaption(message, tone);
    }

    async function showDicePopup(value, playerName) {
      const overlay = document.createElement('div');
      overlay.className = 'garden-roll-overlay';
      overlay.innerHTML = `<div class="garden-roll-popup"><small>${playerName} ĐANG LẮC XÚC XẮC</small><strong>⚀</strong><span>Cộc · cộc · cộc…</span></div>`;
      document.querySelector('.lesson-page').appendChild(overlay);
      const face = overlay.querySelector('strong');
      for (let i = 0; i < 9; i++) {
        face.textContent = DICE[Math.floor(Math.random() * 6)];
        face.classList.toggle('tilt', i % 2 === 0);
        playClack(110 + Math.random() * 90);
        await wait(85 + i * 7);
        if (!state.alive) return;
      }
      face.textContent = DICE[value - 1];
      overlay.querySelector('small').textContent = 'KẾT QUẢ';
      overlay.querySelector('span').textContent = `${value} bước`;
      overlay.querySelector('.garden-roll-popup').classList.add('done');
      playClack(230);
      await wait(600);
      overlay.classList.add('closing');
      await wait(160);
      overlay.remove();
    }

    // Chỉ ghi vào DOM khi giá trị thay đổi, tránh vẽ lại thừa (rất tốn CPU trên Raspberry Pi).
    function setText(selector, value) {
      const node = document.querySelector(selector);
      if (node && node.textContent !== String(value)) node.textContent = value;
    }

    function setHTML(selector, value) {
      const node = document.querySelector(selector);
      if (node && node.dataset.rendered !== value) {
        node.innerHTML = value;
        node.dataset.rendered = value;
      }
    }

    function updateStats() {
      const player = currentPlayer();
      const elapsed = Math.max(1, (Date.now() - state.startedAt) / 1000);
      const displacement = Math.hypot(player.x - player.startX, player.y - player.startY) * METERS_PER_CELL;
      setText('#garden-distance', `${player.distance} m`);
      setText('#garden-speed', (player.distance / elapsed).toFixed(2));
      setText('#garden-velocity', (displacement / elapsed).toFixed(2));
    }

    function updateUI() {
      const player = currentPlayer();
      const isCpu = state.mode === 'cpu' && state.turn === 1;
      setHTML('#garden-turn', `<i style="background:${player.color}"></i><span>Lượt của <strong>${player.name}</strong></span>`);
      setText('#garden-player-name', player.name);
      const playerAvatar = document.querySelector('#garden-player-card img');
      if (playerAvatar.getAttribute('src') !== player.image) playerAvatar.setAttribute('src', player.image);
      playerAvatar.alt = player.name;
      setText('#turn-token', state.turn + 1);
      document.querySelector('#garden-player-card').style.setProperty('--player-color', player.color);
      setHTML('#fruit-basket', FRUIT_TYPES.map((fruit) => `<span class="${player.collected.has(fruit.id) ? 'collected' : ''}">${fruit.icon}</span>`).join(' '));
      updateStats();
      document.querySelector('#garden-roll').disabled = state.phase !== 'await-roll' || isCpu || state.finished;
      document.querySelector('#opponent-mode').disabled = state.players.some((item) => item.distance > 0) || state.phase !== 'await-roll';
      document.querySelector('#shuffle-map').disabled = state.players.some((item) => item.distance > 0) || state.phase !== 'await-roll' || state.turn !== 0;
      updatePlanningControls();
      placePawns();
    }

    // Đường đi đã chạm ô Hội chợ thì dừng ở đó (thắng nếu đủ 3 loại quả, nếu chưa thì cổng chặn lại),
    // nên không bắt học sinh phải chọn cho hết số bước của xúc xắc.
    function planReachesFair() {
      const last = state.plan[state.plan.length - 1];
      return Boolean(last && last.toX === FAIR.x && last.toY === FAIR.y);
    }

    function planReady() {
      return state.plan.length > 0 && (state.plan.length === state.roll || planReachesFair());
    }

    function updatePlanningControls() {
      const manualTurn = !(state.mode === 'cpu' && state.turn === 1);
      const planning = state.phase === 'planning' && manualTurn;
      const remaining = planReachesFair() ? 0 : Math.max(0, state.roll - state.plan.length);
      document.querySelector('#garden-dice').textContent = state.roll ? DICE[state.roll - 1] : '?';
      document.querySelector('#step-status').textContent = state.roll ? `${state.roll} bước` : 'Chưa gieo';
      document.querySelector('#plan-status').textContent = planning
        ? (remaining ? `Còn chọn ${remaining} bước` : (planReachesFair() ? 'Tới Hội chợ · dừng tại đây' : 'Đường đi đã sẵn sàng'))
        : (state.phase === 'moving' || state.phase === 'cpu' ? 'Sóc đang di chuyển…' : 'Hãy gieo xúc xắc');
      document.querySelectorAll('[data-direction]').forEach((button) => { button.disabled = !planning || remaining === 0; });
      document.querySelector('#undo-step').disabled = !planning || state.plan.length === 0;
      document.querySelector('#execute-route').disabled = !planning || !planReady();
    }

    function clearRoute() {
      document.querySelectorAll('.route-arrows').forEach((node) => node.remove());
      document.querySelectorAll('.garden-cell.route-target').forEach((cell) => cell.classList.remove('route-target'));
    }

    function renderRoute() {
      clearRoute();
      for (const step of state.plan) {
        const source = cellAt(step.fromX, step.fromY);
        const target = cellAt(step.toX, step.toY);
        let arrows = source.querySelector('.route-arrows');
        if (!arrows) {
          arrows = document.createElement('span');
          arrows.className = 'route-arrows';
          source.appendChild(arrows);
        }
        arrows.textContent += step.direction.icon;
        target?.classList.add('route-target');
      }
      updatePlanningControls();
    }

    function addDirection(directionKey) {
      if (state.phase !== 'planning' || state.plan.length >= state.roll) return;
      if (planReachesFair()) {
        window.ui.showToast('Đã tới Hội chợ · Bấm “Cho Sóc đi”', 'success');
        return;
      }
      const direction = DIRECTIONS[directionKey];
      const player = currentPlayer();
      const previous = state.plan[state.plan.length - 1];
      const fromX = previous ? previous.toX : player.x;
      const fromY = previous ? previous.toY : player.y;
      const toX = fromX + direction.dx;
      const toY = fromY + direction.dy;
      if (!inside(toX, toY)) {
        window.ui.showToast('Hướng này đi ra ngoài khu vườn', 'error');
        playClack(80);
        return;
      }
      state.plan.push({ direction, fromX, fromY, toX, toY });
      renderRoute();
    }

    function undoDirection() {
      if (state.phase !== 'planning' || !state.plan.length) return;
      state.plan.pop();
      renderRoute();
    }

    async function rollForCurrentPlayer() {
      if (state.phase !== 'await-roll' || state.finished) return;
      state.phase = 'rolling';
      document.querySelector('#opponent-mode').disabled = true;
      document.querySelector('#garden-roll').disabled = true;
      const value = Math.floor(Math.random() * 6) + 1;
      await showDicePopup(value, currentPlayer().name);
      if (!state.alive) return;
      state.roll = value;
      state.plan = [];
      state.phase = 'planning';
      updateUI();
    }

    // Bốc câu hỏi từ một "bộ bài" đã xáo: hết cả bộ mới xáo lại, nên không bị lặp câu
    // (và câu đầu bộ mới không trùng câu vừa hỏi).
    function nextQuestion() {
      if (!state.questionDeck.length) {
        const deck = [...PHYSICS_QUESTIONS];
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        if (deck.length > 1 && deck[deck.length - 1].id === state.lastQuestionId) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
        state.questionDeck = deck;
      }
      const question = state.questionDeck.pop();
      state.lastQuestionId = question.id;
      return question;
    }

    async function askPhysicsQuestion(player, fruit) {
      const isCpu = state.mode === 'cpu' && state.turn === 1;
      if (isCpu) {
        await wait(350);
        if (state.alive) window.ui.showToast(`${player.name} đã trả lời đúng để hái ${fruit.name}!`, 'success');
        return state.alive;
      }
      const question = nextQuestion();
      const clips = voiceClips(question);
      const overlay = document.createElement('div');
      overlay.className = 'physics-quiz-overlay';
      overlay.innerHTML = `<div class="physics-quiz-card" role="dialog" aria-modal="true" aria-label="Câu hỏi thu hoạch trái cây">
        <div class="quiz-header"><div class="quiz-fruit">${fruit.icon}</div><div><small>THỬ THÁCH THU HOẠCH</small><strong>Trả lời đúng để hái ${fruit.name}</strong></div></div>
        <div class="quiz-question"><span>CÂU HỎI VẬT LÝ</span><button type="button" class="quiz-voice" data-voice aria-label="Nghe lại câu hỏi">🔊 Nghe</button><h2>${question.text}</h2></div>
        <div class="quiz-options">${question.answers.map((answer, index) => `<button class="quiz-option" data-answer="${index}" data-correct="${index === question.correct}"><b>${String.fromCharCode(65 + index)}</b><span>${answer}</span></button>`).join('')}</div>
        <p class="quiz-feedback" aria-live="polite">Chọn một đáp án</p>
      </div>`;
      document.querySelector('.lesson-page').appendChild(overlay);
      speak(question.text);
      const readQuestion = () => VoiceReader.read(clips[question.id], question.id);
      overlay.querySelector('[data-voice]').addEventListener('click', readQuestion);
      readQuestion();
      return new Promise((resolve) => {
        let answered = false;
        const finish = (correct) => {
          if (answered) return;
          answered = true;
          state.activeQuizResolve = null;
          overlay.classList.add('closing');
          setTimeout(() => overlay.remove(), 160);
          resolve(correct);
        };
        state.activeQuizResolve = () => finish(false);
        overlay.querySelectorAll('.quiz-option').forEach((button) => {
          button.addEventListener('click', async () => {
            if (answered || !state.alive) return;
            const correct = Number(button.dataset.answer) === question.correct;
            overlay.querySelectorAll('.quiz-option').forEach((item) => {
              item.disabled = true;
              if (Number(item.dataset.answer) === question.correct) item.classList.add('correct');
            });
            button.classList.add(correct ? 'selected-correct' : 'wrong');
            const feedback = overlay.querySelector('.quiz-feedback');
            feedback.textContent = correct ? `Chính xác! ${question.explain}` : `Chưa đúng. ${question.explain}`;
            feedback.classList.add(correct ? 'success' : 'error');
            playClack(correct ? 320 : 75);
            speak(feedback.textContent);
            // Đợi đọc xong lời giải thích (tối đa 9 giây) để học sinh kịp nghe và đọc.
            const feedbackClip = `${question.id}-${correct ? 'dung' : 'sai'}`;
            await Promise.all([wait(900), Promise.race([VoiceReader.read(clips[feedbackClip], feedbackClip), wait(9000)])]);
            if (!state.alive) return;
            finish(correct);
          });
        });
      });
    }

    async function moveOneStep(player, direction, progress = {}) {
      const nextX = player.x + direction.dx;
      const nextY = player.y + direction.dy;
      if (!inside(nextX, nextY)) return { stopped: true };
      if (nextX === FAIR.x && nextY === FAIR.y && player.collected.size < REQUIRED_FRUIT_TYPES) {
        window.ui.showToast('Cổng Hội chợ cần đủ 3 loại trái cây!', 'error');
        speak('Cổng chưa mở · Cần thu hoạch đủ 3 loại trái cây', 'danger');
        await wait(750);
        return { stopped: true };
      }
      const targetCell = cellAt(nextX, nextY);
      targetCell?.classList.add('step-preview');
      const stepText = progress.index && progress.total ? ` · Bước ${progress.index}/${progress.total}` : '';
      speak(`${player.name}: hướng ${direction.name}${stepText} · 1 m`, 'info');
      playClack(180);
      await wait(320);
      if (!state.alive) return { stopped: true };
      player.x = nextX;
      player.y = nextY;
      player.distance += METERS_PER_CELL;
      player.history.push({ x: nextX, y: nextY });
      updateUI();
      placePawns(state.turn);
      targetCell?.classList.remove('step-preview');
      targetCell?.classList.add('step-landed');
      await wait(620);
      targetCell?.classList.remove('step-landed');
      const fruit = fruitAt(player.x, player.y);
      if (fruit && !player.collected.has(fruit.type)) {
        const correct = await askPhysicsQuestion(player, fruit);
        if (!state.alive) return { stopped: true };
        if (correct) collectFruit(player, fruit);
        else window.ui.showToast(`Chưa hái được ${fruit.name}. Hãy thử ở cây khác!`, 'error');
      }
      if (player.x === FAIR.x && player.y === FAIR.y && player.collected.size >= REQUIRED_FRUIT_TYPES) {
        await finishGame(player);
        return { stopped: true, won: true };
      }
      const hazard = hazardAt(player.x, player.y);
      if (hazard) {
        cellAt(player.x, player.y)?.classList.add('hazard-hit');
        window.ui.showToast(`${player.name} gặp ${hazard.name} và bị mất lượt!`, 'error');
        speak(`${player.name} gặp ${hazard.name} · Mất lượt!`, 'danger');
        await wait(900);
        cellAt(player.x, player.y)?.classList.remove('hazard-hit');
        return { stopped: true, hazard: true };
      }
      return { stopped: false };
    }

    function collectFruit(player, fruit) {
      player.collected.add(fruit.type);
      player.lastFruit = { x: fruit.x, y: fruit.y, name: fruit.name };
      cellAt(fruit.x, fruit.y)?.classList.add(`collected-by-${state.turn + 1}`);
      cellAt(fruit.x, fruit.y)?.classList.add('fruit-burst');
      window.ui.showToast(`${player.name} đã hái ${fruit.name}!`, 'success');
      speak(`Chính xác · ${player.name} đã thu hoạch ${fruit.name}!`, 'success');
      if (player.collected.size === REQUIRED_FRUIT_TYPES) {
        window.ui.showToast('Đã đủ 3 loại quả! Cổng Hội chợ đã mở.', 'success');
        speak('Đã đủ 3 loại quả · Cổng Hội chợ đã mở!', 'success');
      }
      updateUI();
    }

    function gridPoint(position) {
      const gridRect = grid.getBoundingClientRect();
      const rect = cellAt(position.x, position.y).getBoundingClientRect();
      return { x: rect.left - gridRect.left + rect.width / 2, y: rect.top - gridRect.top + rect.height / 2 };
    }

    async function drawJourneyReview(player, displacement) {
      grid.querySelector('.journey-svg')?.remove();
      grid.querySelector('.journey-map-summary')?.remove();
      const gridRect = grid.getBoundingClientRect();
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('journey-svg');
      svg.setAttribute('viewBox', `0 0 ${gridRect.width} ${gridRect.height}`);
      svg.innerHTML = `<defs><marker id="journey-arrow-head" markerWidth="11" markerHeight="11" refX="8" refY="4" orient="auto"><path d="M0,0 L0,8 L9,4 z" fill="#d29cff"/></marker></defs><polyline class="journey-route" points=""/>`;
      grid.appendChild(svg);
      const route = svg.querySelector('.journey-route');
      const points = [];
      const replayDelay = Math.max(70, Math.min(170, Math.round(2400 / Math.max(1, player.history.length - 1))));
      for (let index = 0; index < player.history.length; index++) {
        const position = player.history[index];
        const point = gridPoint(position);
        points.push(`${point.x},${point.y}`);
        route.setAttribute('points', points.join(' '));
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', point.x);
        dot.setAttribute('cy', point.y);
        dot.setAttribute('r', index === 0 || index === player.history.length - 1 ? '5' : '2.5');
        dot.classList.add(index === 0 ? 'journey-start' : index === player.history.length - 1 ? 'journey-end' : 'journey-dot');
        svg.appendChild(dot);
        if (index > 0) {
          const previous = player.history[index - 1];
          const direction = Object.values(DIRECTIONS).find((item) => item.dx === position.x - previous.x && item.dy === position.y - previous.y);
          showCaption(`Xem lại hành trình · Bước ${index}/${player.history.length - 1} · Hướng ${direction?.name || ''}`, 'review');
          const pulseCell = cellAt(position.x, position.y);
          pulseCell?.classList.add('journey-pulse');
          await wait(replayDelay);
          pulseCell?.classList.remove('journey-pulse');
          if (!state.alive) return null;
        }
      }
      const start = gridPoint(player.history[0]);
      const end = gridPoint(player.history[player.history.length - 1]);
      const vector = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vector.classList.add('journey-displacement');
      vector.setAttribute('x1', start.x);
      vector.setAttribute('y1', start.y);
      vector.setAttribute('x2', end.x);
      vector.setAttribute('y2', end.y);
      vector.setAttribute('marker-end', 'url(#journey-arrow-head)');
      svg.appendChild(vector);
      const summary = document.createElement('div');
      summary.className = 'journey-map-summary';
      summary.innerHTML = `<span><i class="route-swatch"></i><b>Quãng đường Sóc đã đi:</b> ${player.distance.toFixed(0)} m</span><span><i class="vector-swatch"></i><b>Độ dịch chuyển Hang → Hội chợ:</b> ${displacement.toFixed(1)} m</span><button type="button" data-show-result>Kết quả</button>`;
      grid.appendChild(summary);
      showCaption(`Hành trình hoàn tất · Quãng đường ${player.distance.toFixed(0)} m · Độ dịch chuyển ${displacement.toFixed(1)} m`, 'success');
      await wait(900);
      return summary;
    }

    async function executeHumanRoute() {
      if (state.phase !== 'planning' || !planReady()) return;
      state.phase = 'moving';
      updatePlanningControls();
      const player = currentPlayer();
      const plannedSteps = [...state.plan];
      clearRoute();
      showCaption(`${player.name} chuẩn bị đi ${plannedSteps.length} bước`, 'info');
      await wait(650);
      for (let index = 0; index < plannedSteps.length; index++) {
        const step = plannedSteps[index];
        const result = await moveOneStep(player, step.direction, { index: index + 1, total: plannedSteps.length });
        if (!state.alive || state.finished || result.stopped) break;
      }
      if (!state.finished) await endTurn();
    }

    function findPath(start, target) {
      const queue = [{ x: start.x, y: start.y, path: [] }];
      const visited = new Set([key(start.x, start.y)]);
      const blocked = new Set(HAZARDS.map((hazard) => key(hazard.x, hazard.y)));
      while (queue.length) {
        const current = queue.shift();
        if (current.x === target.x && current.y === target.y) return current.path;
        for (const direction of Object.values(DIRECTIONS)) {
          const x = current.x + direction.dx;
          const y = current.y + direction.dy;
          const positionKey = key(x, y);
          if (!inside(x, y) || visited.has(positionKey) || blocked.has(positionKey)) continue;
          visited.add(positionKey);
          queue.push({ x, y, path: [...current.path, direction] });
        }
      }
      return [];
    }

    function chooseCpuTarget(player) {
      if (player.collected.size >= REQUIRED_FRUIT_TYPES) return FAIR;
      const candidates = FRUITS.filter((fruit) => !player.collected.has(fruit.type))
        .map((fruit) => ({ fruit, length: findPath(player, fruit).length }))
        .filter((entry) => entry.length > 0)
        .sort((a, b) => a.length - b.length);
      return candidates[0]?.fruit || FAIR;
    }

    async function runCpuTurn() {
      if (!state.alive || state.finished || state.mode !== 'cpu' || state.turn !== 1) return;
      state.phase = 'cpu';
      updateUI();
      await wait(450);
      const player = currentPlayer();
      const roll = Math.floor(Math.random() * 6) + 1;
      await showDicePopup(roll, player.name);
      if (!state.alive) return;
      state.roll = roll;
      updateUI();
      for (let step = 0; step < roll; step++) {
        const target = chooseCpuTarget(player);
        const path = findPath(player, target);
        if (!path.length) break;
        const result = await moveOneStep(player, path[0], { index: step + 1, total: roll });
        if (!state.alive || state.finished || result.stopped) break;
      }
      if (!state.finished) await endTurn();
    }

    async function endTurn() {
      const endingPlayer = currentPlayer();
      state.plan = [];
      state.roll = 0;
      clearRoute();
      showCaption(`Hết lượt của ${endingPlayer.name}`, 'info');
      await wait(450);
      if (!state.alive || state.finished) return;
      state.turn = state.turn ? 0 : 1;
      state.phase = 'await-roll';
      updateUI();
      showCaption(`Đến lượt ${currentPlayer().name}`, 'success');
      await wait(450);
      if (!state.alive || state.finished) return;
      if (state.mode === 'cpu' && state.turn === 1) runCpuTurn();
    }

    function describeDirection(east, north) {
      if (!east && !north) return 'không có hướng (về chỗ cũ)';
      const vertical = north > 0 ? 'Bắc' : 'Nam';
      const horizontal = east > 0 ? 'Đông' : 'Tây';
      if (!north) return `hướng ${horizontal}`;
      if (!east) return `hướng ${vertical}`;
      const angle = Math.atan2(Math.abs(north), Math.abs(east)) * 180 / Math.PI;
      return `hướng ${horizontal}–${vertical}, lệch ${angle.toFixed(0)}° về ${vertical} so với hướng ${horizontal}`;
    }

    async function finishGame(winner) {
      if (state.finished) return;
      state.finished = true;
      state.phase = 'reviewing';
      const elapsed = Math.max(1, (Date.now() - state.startedAt) / 1000);
      const displacement = Math.hypot(winner.x - winner.startX, winner.y - winner.startY) * METERS_PER_CELL;
      const averageSpeed = winner.distance / elapsed;
      const averageVelocity = displacement / elapsed;
      const velocityEast = (winner.x - winner.startX) * METERS_PER_CELL / elapsed;
      const velocityNorth = (winner.startY - winner.y) * METERS_PER_CELL / elapsed;
      updateUI();
      showCaption(`${winner.name} đã tới Hội chợ · Bắt đầu xem lại hành trình`, 'success');
      await wait(750);
      const mapSummary = await drawJourneyReview(winner, displacement);
      if (!state.alive || !mapSummary) return;
      state.phase = 'finished';
      const distance = winner.distance;
      const detour = Math.max(0, distance - displacement);
      const ratio = displacement > 0 ? distance / displacement : 0;
      const eastMeters = (winner.x - winner.startX) * METERS_PER_CELL;
      const northMeters = (winner.startY - winner.y) * METERS_PER_CELL;
      const directionText = describeDirection(eastMeters, northMeters);
      const sameValue = Math.abs(detour) < 0.05;
      const overlay = document.createElement('div');
      overlay.className = 'result-overlay garden-result';
      overlay.innerHTML = `<div class="result-card garden-result-card"><div class="trophy">🏆🐿️🎪</div><h2>${winner.name} chiến thắng!</h2>
        <p>Đã mang đủ 3 loại trái cây tới Hội chợ trước khi trời lặn · Thời gian t = ${elapsed.toFixed(0)} s</p>
        <div class="compare-grid">
          <section class="compare-block">
            <h3>📏 Quãng đường <em>s</em> và độ dịch chuyển <em>d</em></h3>
            <div class="compare-pair">
              <div class="route"><small>Quãng đường s</small><strong>${distance.toFixed(0)} m</strong><span>Đo dọc theo đường đi (đường xanh)</span></div>
              <b>${sameValue ? '=' : '&gt;'}</b>
              <div class="vector"><small>Độ dịch chuyển d</small><strong>${displacement.toFixed(1)} m</strong><span>Đoạn thẳng Hang → Hội chợ (mũi tên tím) · ${directionText}</span></div>
            </div>
            <p>${sameValue ? 'Sóc đi thẳng một hướng nên s = d.' : `Sóc đi vòng thêm <b>${detour.toFixed(1)} m</b>, quãng đường gấp <b>${ratio.toFixed(1)} lần</b> độ dịch chuyển.`} Quãng đường chỉ có độ lớn; độ dịch chuyển có cả độ lớn và hướng. Luôn có s ≥ d.</p>
          </section>
          <section class="compare-block">
            <h3>⚡ Tốc độ trung bình và vận tốc trung bình</h3>
            <div class="compare-pair">
              <div class="route"><small>Tốc độ TB = s / t</small><strong>${averageSpeed.toFixed(2)} m/s</strong><span>${distance.toFixed(0)} m ÷ ${elapsed.toFixed(0)} s</span></div>
              <b>${sameValue ? '=' : '&gt;'}</b>
              <div class="vector"><small>Vận tốc TB = d / t</small><strong>${averageVelocity.toFixed(2)} m/s</strong><span>${displacement.toFixed(1)} m ÷ ${elapsed.toFixed(0)} s · ${directionText}</span></div>
            </div>
            <p>Vận tốc TB có hướng: ${velocityEast.toFixed(2)} m/s về Đông, ${velocityNorth.toFixed(2)} m/s về Bắc. Vì s ≥ d nên tốc độ TB luôn ≥ độ lớn vận tốc TB${sameValue ? '' : ` (ở đây gấp ${ratio.toFixed(1)} lần)`}.</p>
          </section>
        </div>
        <p class="lesson-note">Đường màu xanh là toàn bộ hành trình của Sóc. Mũi tên tím là độ dịch chuyển có hướng, nối thẳng từ Hang Sóc tới Hội chợ.</p>
        <div class="result-actions"><button class="secondary" data-review>🗺️ Xem lại quá trình</button><button class="primary" data-replay>Chơi lại</button></div></div>`;
      document.querySelector('.lesson-page').appendChild(overlay);
      const backButton = document.createElement('button');
      backButton.type = 'button';
      backButton.className = 'primary garden-back-result';
      backButton.textContent = '📊 Quay lại kết quả';
      document.querySelector('.garden-board-panel').appendChild(backButton);
      const showResult = () => {
        overlay.classList.remove('review-hidden');
        backButton.classList.remove('visible');
      };
      overlay.querySelector('[data-review]').addEventListener('click', async () => {
        overlay.classList.add('review-hidden');
        backButton.classList.add('visible');
        if (state.replaying) return;
        state.replaying = true;
        await drawJourneyReview(winner, displacement);
        state.replaying = false;
      });
      backButton.addEventListener('click', showResult);
      grid.addEventListener('click', (event) => {
        if (event.target.closest('[data-show-result]')) showResult();
      });
      overlay.querySelector('[data-replay]').addEventListener('click', () => {
        cleanup();
        window.ui.goHome();
        requestAnimationFrame(() => document.querySelector('[data-lesson="displacement"]')?.click());
      });
      updateUI();
    }

    function handleKey(event) {
      if (event.key === 'ArrowUp') addDirection('north');
      if (event.key === 'ArrowRight') addDirection('east');
      if (event.key === 'ArrowDown') addDirection('south');
      if (event.key === 'ArrowLeft') addDirection('west');
      if (event.key === 'Backspace') undoDirection();
      if (event.key === 'Enter') executeHumanRoute();
    }

    generateMapLayout();
    createMap();
    document.querySelector('#garden-roll').addEventListener('click', rollForCurrentPlayer);
    document.querySelectorAll('[data-direction]').forEach((button) => button.addEventListener('click', () => addDirection(button.dataset.direction)));
    document.querySelector('#undo-step').addEventListener('click', undoDirection);
    document.querySelector('#execute-route').addEventListener('click', executeHumanRoute);
    document.querySelector('#shuffle-map').addEventListener('click', () => {
      if (state.players.some((player) => player.distance > 0) || state.phase !== 'await-roll' || state.turn !== 0) return;
      generateMapLayout();
      createMap();
      state.startedAt = Date.now();
      showCaption('Khu vườn mới đã sẵn sàng · Các vị trí đã được thay đổi', 'success');
      updateUI();
    });
    document.querySelector('#opponent-mode').addEventListener('change', (event) => {
      state.mode = event.target.value;
      const opponent = state.players[1];
      opponent.name = state.mode === 'cpu' ? 'Robot Làm Vườn' : 'Sóc Nâu 2';
      opponent.image = state.mode === 'cpu' ? 'assets/garden/robot.svg' : 'assets/garden/squirrel.svg';
      const pawn = state.pawns[1];
      pawn.classList.toggle('robot-pawn', state.mode === 'cpu');
      pawn.dataset.shortName = state.mode === 'cpu' ? 'ROBOT' : 'SÓC 2';
      const image = pawn.querySelector('img');
      image.src = opponent.image;
      image.alt = opponent.name;
      updateUI();
    });
    document.querySelector('#sound-toggle').addEventListener('click', (event) => {
      state.sound = !state.sound;
      event.currentTarget.textContent = state.sound ? '🔊 Hiệu ứng' : '🔇 Đã tắt';
    });
    window.addEventListener('keydown', handleKey);
    const statsTimer = setInterval(() => {
      if (!state.alive || state.finished) return;
      const elapsed = (Date.now() - state.startedAt) / 1000;
      const progress = Math.min(100, elapsed / 600 * 100);
      const sun = document.querySelector('#sun-progress');
      if (sun) sun.style.width = `${progress.toFixed(1)}%`;
      updateStats();
    }, 1000);
    updateUI();

    function cleanup() {
      state.alive = false;
      state.activeQuizResolve?.();
      VoiceReader.stop();
      clearInterval(statsTimer);
      state.timers.forEach(clearTimeout);
      state.timers.clear();
      window.removeEventListener('keydown', handleKey);
      document.querySelector('.garden-roll-overlay')?.remove();
      document.querySelector('.physics-quiz-overlay')?.remove();
      state.audioContext?.close().catch(() => {});
    }
    return cleanup;
  }

  window.DisplacementLesson = { mount };
})();

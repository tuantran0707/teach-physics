(() => {
  function mount() {
    window.ui.lessonShell('Bảng điều khiển xe', 'Bài 03 · Vận tốc theo thời gian', `
      <div class="speed-layout">
        <section class="speed-main">
          <div class="dashboard-icons"><span class="indicator" id="left-signal">⇦</span><span>⛽ <small id="fuel">82%</small></span><span class="indicator" id="right-signal">⇨</span></div>
          <div class="gauge" id="gauge"><div class="gauge-value"><strong id="speed-value">0.0</strong><span>km/h</span></div></div>
          <div class="speed-controls">
            <button class="secondary" id="signal">Xi nhan</button>
            <button class="primary" id="trip-toggle">Bắt đầu chạy</button>
            <button class="primary" id="car-start" hidden>▶ Bắt đầu</button>
            <button class="danger" id="car-stop" hidden disabled>■ Dừng lại</button>
            <button class="secondary" id="trip-reset">Đặt lại</button>
          </div>
        </section>
        <section class="telemetry">
          <div class="telemetry-head"><div><h3>Vận tốc theo thời gian</h3><small style="color:var(--muted)" id="chart-note">Mỗi điểm đo cách nhau 1 giây</small></div><strong class="timer" id="trip-time">00:00</strong></div>
          <div class="chart-wrap"><canvas id="speed-chart"></canvas></div>
          <div class="table-wrap"><table class="data-table"><thead id="speed-head"><tr><th>Thời gian (s)</th><th>Tốc độ (km/h)</th></tr></thead><tbody id="speed-rows"><tr><td colspan="2" style="text-align:center;color:var(--muted)">Kết nối xe hoặc bắt đầu mô phỏng để đo</td></tr></tbody></table></div>
        </section>
      </div>`, '<button class="chip" id="esp32-connect">📶 Kết nối xe</button>');

    const state = { running: false, speed: 0, samples: [], seconds: 0, distanceM: 0, realSensorAt: 0, signal: 0, alive: true, carConnected: false, carBusy: false, carLastSeq: 0, carBootId: null, carPolling: false };
    // Xe robot chạy chậm (vài phần mười m/s) nên khi nối xe, mọi số liệu hiển thị theo m/s.
    const CAR_GAUGE_MAX_MPS = 2;
    const canvas = document.querySelector('#speed-chart');
    const context = canvas.getContext('2d');

    function setSpeed(value) {
      const max = state.carConnected ? CAR_GAUGE_MAX_MPS : 60;
      state.speed = Math.max(0, Number(value) || 0);
      if (!state.carConnected) state.speed = Math.min(60, state.speed);
      document.querySelector('#speed-value').textContent = state.speed.toFixed(state.carConnected ? 2 : 1);
      document.querySelector('#gauge').style.setProperty('--gauge', `${Math.min(state.speed, max) / max * 270}deg`);
    }

    function simulatedSpeed(t) {
      if (t < 6) return t * 3.1;
      if (t < 14) return 18.6 + Math.sin(t * .75) * 3;
      if (t < 22) return Math.max(0, 21 - (t - 14) * 2.4);
      return 0;
    }

    function sample() {
      if (!state.running || state.carConnected) return;
      state.seconds += 1;
      if (Date.now() - state.realSensorAt > 1800) setSpeed(simulatedSpeed(state.seconds));
      state.distanceM += state.speed / 3.6;
      state.samples.push({ t: state.seconds, v: state.speed, s: state.distanceM });
      document.querySelector('#trip-time').textContent = `${String(Math.floor(state.seconds / 60)).padStart(2,'0')}:${String(state.seconds % 60).padStart(2,'0')}`;
      renderTable(); drawChart();
      document.querySelector('#fuel').textContent = `${Math.max(0, 82 - state.distanceM / 800).toFixed(0)}%`;
    }

    function renderTable() {
      const rows = document.querySelector('#speed-rows');
      if (state.carConnected) {
        rows.innerHTML = state.samples.length
          ? state.samples.slice().reverse().map((item) => `<tr><td>${item.line ?? '–'}</td><td>${item.t.toFixed(3)}</td><td>${item.dt != null ? item.dt.toFixed(3) : '–'}</td><td><strong>${item.v.toFixed(3)}</strong></td></tr>`).join('')
          : '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Bấm Bắt đầu · xe qua vạch thứ 2 sẽ có số đo đầu tiên</td></tr>';
        return;
      }
      rows.innerHTML = state.samples.length
        ? state.samples.slice().reverse().map((item) => `<tr><td>${item.t.toFixed(1)}</td><td>${item.v.toFixed(2)}</td></tr>`).join('')
        : '<tr><td colspan="2" style="text-align:center;color:var(--muted)">Chưa có dữ liệu đo</td></tr>';
    }

    function drawChart() {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, rect.width * ratio); canvas.height = Math.max(1, rect.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const w = rect.width, h = rect.height, pad = { l: 32, r: 10, t: 9, b: 22 };
      context.clearRect(0, 0, w, h);
      context.strokeStyle = 'rgba(255,255,255,.1)'; context.fillStyle = '#7890aa'; context.font = '10px Segoe UI';
      const visible = state.samples.slice(-30);
      // Xe thật: trục dọc tự co giãn theo vận tốc lớn nhất (m/s). Mô phỏng: cố định 0–60 km/h.
      const yMax = state.carConnected ? Math.max(0.5, Math.ceil(Math.max(0, ...visible.map((item) => item.v)) * 1.2 * 4) / 4) : 60;
      for (let step = 0; step <= 3; step++) {
        const v = yMax * step / 3;
        const y = pad.t + (1 - v / yMax) * (h - pad.t - pad.b);
        context.beginPath(); context.moveTo(pad.l, y); context.lineTo(w - pad.r, y); context.stroke(); context.fillText(state.carConnected ? v.toFixed(2) : String(Math.round(v)), 3, y + 3);
      }
      if (!visible.length) return;
      const maxT = Math.max(10, visible[visible.length - 1].t);
      const minT = Math.max(0, maxT - 30);
      context.beginPath();
      let firstX = pad.l, lastX = pad.l;
      visible.forEach((item, index) => {
        const x = pad.l + ((item.t - minT) / Math.max(10, maxT - minT)) * (w - pad.l - pad.r);
        const y = pad.t + (1 - item.v / yMax) * (h - pad.t - pad.b);
        index ? context.lineTo(x, y) : context.moveTo(x, y);
        if (!index) firstX = x;
        lastX = x;
      });
      context.strokeStyle = '#20d5da'; context.lineWidth = 3; context.stroke();
      // Chỉ tô vùng dưới phần có dữ liệu (không kéo về mép trái/phải gây hiểu nhầm là giảm tốc).
      context.lineTo(lastX, h - pad.b); context.lineTo(firstX, h - pad.b); context.closePath();
      const gradient = context.createLinearGradient(0, pad.t, 0, h - pad.b); gradient.addColorStop(0, 'rgba(32,213,218,.3)'); gradient.addColorStop(1, 'rgba(32,213,218,0)'); context.fillStyle = gradient; context.fill();
      context.fillStyle = '#7890aa'; context.fillText(`${Math.round(minT)}s`, pad.l, h - 5); context.fillText(`${Math.round(maxT)}s`, w - pad.r - 20, h - 5);
    }

    function toggleTrip() {
      state.running = !state.running;
      const button = document.querySelector('#trip-toggle');
      button.textContent = state.running ? 'Tạm dừng' : (state.samples.length ? 'Tiếp tục' : 'Bắt đầu chạy');
      button.classList.toggle('primary', !state.running); button.classList.toggle('secondary', state.running);
      if (!state.running && Date.now() - state.realSensorAt > 1800) setSpeed(0);
    }

    function setCarButtons(running) {
      state.running = Boolean(running);
      document.querySelector('#car-start').disabled = state.carBusy || state.running;
      document.querySelector('#car-stop').disabled = state.carBusy || !state.running;
    }

    // Mỗi lần đo của xe = một vạch đen: v = 0,10 m ÷ thời gian giữa 2 vạch, tính ngay trên ESP32.
    // Pi gửi kèm số thứ tự lần đo cuối đã nhận (since) nên không bỏ sót vạch nào.
    function applyCarTelemetry(data, record = false) {
      if (data?.type !== 'speed') return;
      state.realSensorAt = Date.now();
      if (data.boot_id !== undefined && data.boot_id !== state.carBootId) {
        // Lần đầu kết nối: bỏ qua số đo cũ. ESP32 vừa khởi động lại: đọc lại từ đầu.
        state.carLastSeq = state.carBootId === null ? Number(data.seq) || 0 : 0;
        state.carBootId = data.boot_id;
      }
      setSpeed(data.speed_mps ?? (Number(data.value) || 0) / 3.6);
      state.seconds = Math.max(0, Number(data.elapsed_s) || 0);
      document.querySelector('#trip-time').textContent = `${String(Math.floor(state.seconds / 60)).padStart(2,'0')}:${String(Math.floor(state.seconds % 60)).padStart(2,'0')}`;
      setCarButtons(data.running);
      if (!record) return;
      let added = false;
      if (Array.isArray(data.events)) {
        added = addCarEvents(data.events);
      } else if (data.running) {
        // Firmware cũ (không có danh sách lần đo): lấy mẫu mỗi giây như trước.
        const previous = state.samples[state.samples.length - 1];
        if (!previous || previous.t !== state.seconds) {
          state.samples.push({ t: state.seconds, v: state.speed });
          added = true;
        }
      }
      if (added) {
        if (state.samples.length > 500) state.samples.splice(0, state.samples.length - 500);
        renderTable();
        drawChart();
      }
    }

    function addCarEvents(list) {
      let added = false;
      for (const event of list) {
        if (!(event.seq > state.carLastSeq)) continue;
        state.carLastSeq = event.seq;
        state.samples.push({ t: Number(event.t_s), v: Number(event.speed_mps), line: event.line, dt: Number(event.interval_s) });
        added = true;
      }
      return added;
    }

    // Xe gửi ngay qua UDP khi đo xong một vạch. Chỉ nhận gói liền kề số thứ tự đã có;
    // nếu lỡ mất gói ở giữa, lần hỏi /status kế tiếp sẽ lấy bù đầy đủ.
    function applyCarPush(event) {
      if (!state.alive || !state.carConnected || event.boot_id !== state.carBootId) return;
      if (event.seq !== state.carLastSeq + 1) return;
      state.realSensorAt = Date.now();
      addCarEvents([event]);
      setSpeed(event.speed_mps);
      if (state.samples.length > 500) state.samples.splice(0, state.samples.length - 500);
      renderTable();
      drawChart();
    }

    function showCarUnits() {
      document.querySelector('.gauge-value span').textContent = 'm/s';
      document.querySelector('#speed-head').innerHTML = '<tr><th>Vạch</th><th>Thời điểm (s)</th><th>Δt giữa 2 vạch (s)</th><th>v = 0,1 m ÷ Δt (m/s)</th></tr>';
      document.querySelector('#chart-note').textContent = 'Mỗi điểm là một vạch đen · các vạch cách nhau 10 cm';
    }

    function clearSamples() {
      state.samples = [];
      renderTable();
      drawChart();
    }

    // IP mặc định của xe trong mạng Wi-Fi "iot"; app nhớ IP kết nối thành công gần nhất.
    const DEFAULT_CAR_IP = '192.168.137.35';
    function loadCarIp() {
      try { return localStorage.getItem('esp32-ip') || DEFAULT_CAR_IP; } catch { return DEFAULT_CAR_IP; }
    }
    function saveCarIp(ip) {
      try { localStorage.setItem('esp32-ip', ip); } catch { /* bỏ qua */ }
    }

    function showConnectDialog() {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay esp32-overlay';
      overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><div><h2>Kết nối xe ESP32</h2><p>Pi và xe phải kết nối cùng mạng WiFi.</p></div><button class="icon-btn" data-close>×</button></div>
        <label>Địa chỉ IP của xe<input id="esp32-ip" value="${loadCarIp()}" inputmode="decimal" autocomplete="off"></label>
        <div class="ip-keypad" aria-label="Bàn phím số">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((key) => `<button type="button" data-key="${key}">${key}</button>`).join('')}
          <button type="button" data-key="back" aria-label="Xóa một ký tự">⌫</button>
          <button type="button" class="wide-key" data-key="clear">Xóa hết</button>
          <button type="button" class="wide-key" data-key="default">Mặc định ${DEFAULT_CAR_IP}</button>
        </div>
        <p class="esp32-error" role="alert"></p>
        <button class="primary wide" id="esp32-submit">Kết nối</button>
      </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#esp32-ip');
      // Bàn phím số trên màn hình cảm ứng (Pi không có bàn phím thật).
      overlay.querySelector('.ip-keypad').addEventListener('click', (event) => {
        const key = event.target.closest('[data-key]')?.dataset.key;
        if (!key) return;
        if (key === 'back') input.value = input.value.slice(0, -1);
        else if (key === 'clear') input.value = '';
        else if (key === 'default') input.value = DEFAULT_CAR_IP;
        else if (input.value.length < 15) input.value += key;
        overlay.querySelector('.esp32-error').textContent = '';
      });
      const submit = overlay.querySelector('#esp32-submit');
      const error = overlay.querySelector('.esp32-error');
      const close = () => overlay.remove();
      const connect = async () => {
        submit.disabled = true;
        submit.textContent = 'Đang kết nối…';
        error.textContent = '';
        const result = await window.physicsBridge.connectEsp32(input.value);
        if (!result.ok) {
          error.textContent = result.error;
          submit.disabled = false;
          submit.textContent = 'Thử lại';
          return;
        }
        state.carConnected = true;
        saveCarIp(input.value.trim());
        document.querySelector('#esp32-connect').textContent = `● ${result.address.replace(/^https?:\/\//, '')}`;
        document.querySelector('#esp32-connect').classList.add('connected');
        document.querySelector('#trip-toggle').hidden = true;
        document.querySelector('#car-start').hidden = false;
        document.querySelector('#car-stop').hidden = false;
        showCarUnits();
        clearSamples();
        applyCarTelemetry(result.telemetry);
        window.ui.showToast('Đã kết nối xe ESP32', 'success');
        close();
      };
      overlay.querySelector('[data-close]').addEventListener('click', close);
      overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
      submit.addEventListener('click', connect);
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') connect(); });
    }

    async function sendCarCommand(command) {
      if (!state.carConnected || state.carBusy) return;
      if (command === 'start') clearSamples();
      state.carBusy = true;
      setCarButtons(state.running);
      const result = await window.physicsBridge.sendEsp32Command(command);
      state.carBusy = false;
      if (!result.ok) {
        setCarButtons(state.running);
        window.ui.showToast(result.error, 'error');
        return;
      }
      setCarButtons(command === 'start');
      if (command === 'stop') setSpeed(0);
      window.ui.showToast(command === 'start' ? 'Xe bắt đầu chạy' : 'Xe đã dừng', 'success');
    }

    document.querySelector('#trip-toggle').addEventListener('click', toggleTrip);
    document.querySelector('#esp32-connect').addEventListener('click', showConnectDialog);
    document.querySelector('#car-start').addEventListener('click', () => sendCarCommand('start'));
    document.querySelector('#car-stop').addEventListener('click', () => sendCarCommand('stop'));
    document.querySelector('#trip-reset').addEventListener('click', () => {
      if (state.carConnected) window.physicsBridge.sendEsp32Command('reset');
      state.running = false; state.samples = []; state.seconds = 0; state.distanceM = 0; setSpeed(0);
      document.querySelector('#trip-toggle').textContent = 'Bắt đầu chạy'; document.querySelector('#trip-time').textContent = '00:00';
      renderTable(); drawChart();
    });
    document.querySelector('#signal').addEventListener('click', () => {
      state.signal = (state.signal + 1) % 3;
      document.querySelector('#left-signal').classList.toggle('on', state.signal === 1);
      document.querySelector('#right-signal').classList.toggle('on', state.signal === 2);
    });
    const unsubscribePush = window.physicsBridge.onEsp32Event?.(applyCarPush);
    const unsubscribe = window.physicsBridge.onSensorData((data) => {
      if (!state.alive || data?.type !== 'speed') return;
      state.realSensorAt = Date.now(); setSpeed(data.value);
    });
    const pollCar = async () => {
      if (!state.alive || !state.carConnected || state.carPolling) return;
      state.carPolling = true;
      try {
        const result = await window.physicsBridge.getEsp32Status(state.carLastSeq);
        if (result.ok && state.alive) applyCarTelemetry(result.telemetry, true);
      } finally {
        state.carPolling = false;
      }
    };
    const interval = setInterval(sample, 1000);
    const carInterval = setInterval(pollCar, 300);
    const resize = () => drawChart(); window.addEventListener('resize', resize); drawChart();
    return () => {
      state.alive = false;
      document.querySelector('.esp32-overlay')?.remove();
      if (state.carConnected && state.running) window.physicsBridge.sendEsp32Command('stop');
      if (state.carConnected) window.physicsBridge.disconnectEsp32();
      clearInterval(interval);
      clearInterval(carInterval);
      window.removeEventListener('resize', resize);
      if (typeof unsubscribe === 'function') unsubscribe();
      if (typeof unsubscribePush === 'function') unsubscribePush();
    };
  }
  window.SpeedLesson = { mount };
})();

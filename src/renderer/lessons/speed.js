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
            <button class="secondary" id="trip-reset">Đặt lại</button>
          </div>
        </section>
        <section class="telemetry">
          <div class="telemetry-head"><div><h3>Vận tốc theo thời gian</h3><small style="color:var(--muted)">Mỗi điểm đo cách nhau 1 giây</small></div><strong class="timer" id="trip-time">00:00</strong></div>
          <div class="speed-http-connect"><label for="speed-http-url">ESP32 qua HTTP</label><input id="speed-http-url" type="url" placeholder="http://192.168.137.x" aria-label="Địa chỉ HTTP của ESP32"><button class="secondary" id="speed-http-connect">Kết nối</button><span id="speed-http-status" aria-live="polite">Chưa kết nối</span></div>
          <div class="chart-wrap"><canvas id="speed-chart"></canvas></div>
          <div class="table-wrap"><table class="data-table speed-matrix"><thead id="speed-columns"><tr><th>Đại lượng</th></tr></thead><tbody id="speed-rows"><tr><th>Thời gian (s)</th><td colspan="3">Nhấn “Bắt đầu chạy” để thu thập dữ liệu</td></tr></tbody></table></div>
          <div class="speed-conclusion" id="speed-conclusion" hidden><strong>KẾT LUẬN</strong><span id="speed-conclusion-text"></span></div>
        </section>
      </div>`);

    const state = { running: false, completed: false, speed: 0, samples: [], seconds: 0, distanceM: 0, realSensorAt: 0, signal: 0, alive: true, httpBase: '', httpOnline: false, httpTelemetry: null, httpPolling: false };
    const canvas = document.querySelector('#speed-chart');
    const context = canvas.getContext('2d');

    function setSpeed(value) {
      state.speed = Math.max(0, Math.min(60, Number(value) || 0));
      document.querySelector('#speed-value').textContent = state.speed.toFixed(1);
      document.querySelector('#gauge').style.setProperty('--gauge', `${state.speed / 60 * 270}deg`);
    }

    function simulatedSpeed(t) {
      if (t < 6) return t * 3.1;
      if (t < 14) return 18.6 + Math.sin(t * .75) * 3;
      if (t < 22) return Math.max(0, 21 - (t - 14) * 2.4);
      return 0;
    }

    function updateTripButton() {
      const button = document.querySelector('#trip-toggle');
      button.textContent = state.running ? (state.httpBase ? 'Dừng xe' : 'Tạm dừng') : (state.completed ? 'Chạy lại' : (state.samples.length ? 'Tiếp tục' : 'Bắt đầu chạy'));
      button.classList.toggle('primary', !state.running); button.classList.toggle('secondary', state.running);
    }

    function finishTrip() {
      if (state.completed || state.samples.length === 0) return;
      state.running = false;
      state.completed = true;
      const previous = state.samples[state.samples.length - 2];
      const latest = state.samples[state.samples.length - 1];
      const intervalSeconds = previous ? latest.t - previous.t : 0;
      const instantaneous = previous && intervalSeconds > 0 ? (latest.s - previous.s) / intervalSeconds : null;
      const average = state.seconds > 0 ? state.distanceM / state.seconds : 0;
      document.querySelector('#speed-conclusion-text').textContent = instantaneous === null
        ? `Tốc độ trung bình = ${state.distanceM.toFixed(2)} m / ${state.seconds} s = ${average.toFixed(2)} m/s. Cần ít nhất hai mốc đo để tính vận tốc tức thời.`
        : `Tốc độ trung bình = ${state.distanceM.toFixed(2)} m / ${state.seconds} s = ${average.toFixed(2)} m/s. Tại ${latest.t} s, vận tốc tức thời ≈ Δs/Δt = (${latest.s.toFixed(2)} − ${previous.s.toFixed(2)}) / ${intervalSeconds} = ${instantaneous.toFixed(2)} m/s theo chiều xe chạy.`;
      document.querySelector('#speed-conclusion').hidden = false;
      updateTripButton();
    }

    function applyHttpTelemetry(data) {
      if (!data || data.type !== 'speed') throw new Error('Sai định dạng dữ liệu ESP32');
      state.httpTelemetry = data;
      state.httpOnline = true;
      state.realSensorAt = Date.now();
      setSpeed(data.value);
      if (Number.isFinite(Number(data.elapsed_s))) state.seconds = Number(data.elapsed_s);
      if (Number.isFinite(Number(data.distance_m))) state.distanceM = Number(data.distance_m);
      const nextRunning = Boolean(data.running);
      if (nextRunning && state.samples.length === 0) {
        state.samples.push({ t: state.seconds, v: state.speed, s: state.distanceM });
        renderTable(); drawChart();
      }
      if (state.running !== nextRunning) {
        const stoppedAfterRun = state.running && !nextRunning;
        state.running = nextRunning;
        updateTripButton();
        if (stoppedAfterRun) finishTrip();
      }
      document.querySelector('#speed-http-status').textContent = nextRunning ? 'Đã nối · xe đang chạy' : 'Đã nối · xe đang dừng';
    }

    async function connectHttpSensor() {
      const input = document.querySelector('#speed-http-url');
      let base = input.value.trim();
      if (!base) return;
      if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
      base = base.replace(/\/+$/, '');
      document.querySelector('#speed-http-status').textContent = 'Đang kết nối...';
      try {
        const response = await fetch(`${base}/api/speed`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        state.httpBase = base;
        input.value = base;
        applyHttpTelemetry(data);
      } catch (error) {
        state.httpOnline = false;
        document.querySelector('#speed-http-status').textContent = `Không kết nối: ${error.message}`;
      }
    }

    async function pollHttpSensor() {
      if (!state.alive || !state.httpBase || state.httpPolling) return;
      state.httpPolling = true;
      try {
        const response = await fetch(`${state.httpBase}/api/speed`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        applyHttpTelemetry(await response.json());
      } catch (error) {
        state.httpOnline = false;
        document.querySelector('#speed-http-status').textContent = 'Mất kết nối ESP32';
      } finally {
        state.httpPolling = false;
      }
    }

    function sample() {
      if (!state.running) return;
      if (state.httpBase) {
        if (!state.httpOnline || !state.httpTelemetry) return;
        state.seconds = Number(state.httpTelemetry.elapsed_s) || 0;
        state.distanceM = Number(state.httpTelemetry.distance_m) || 0;
        setSpeed(state.httpTelemetry.value);
      } else {
        state.seconds += 1;
        if (Date.now() - state.realSensorAt > 1800) setSpeed(simulatedSpeed(state.seconds));
        state.distanceM += state.speed / 3.6;
      }
      state.samples.push({ t: state.seconds, v: state.speed, s: state.distanceM });
      document.querySelector('#trip-time').textContent = `${String(Math.floor(state.seconds / 60)).padStart(2,'0')}:${String(state.seconds % 60).padStart(2,'0')}`;
      renderTable(); drawChart();
      document.querySelector('#fuel').textContent = `${Math.max(0, 82 - state.distanceM / 800).toFixed(0)}%`;
      if (!state.httpBase && state.seconds >= 23) finishTrip();
    }

    function renderTable() {
      const columns = document.querySelector('#speed-columns');
      const rows = document.querySelector('#speed-rows');
      if (!state.samples.length) return;
      columns.innerHTML = `<tr><th scope="col">Đại lượng</th>${state.samples.map((item) => `<th scope="col">${item.t}</th>`).join('')}</tr>`;
      const speedCells = state.samples.map((item) => `<td>${item.v.toFixed(1)}</td>`).join('');
      const distanceCells = state.samples.map((item) => `<td>${item.s.toFixed(2)}</td>`).join('');
      const instantaneousCells = state.samples.map((item, index) => {
        if (index === 0) return '<td>—</td>';
        const previous = state.samples[index - 1];
        const elapsed = item.t - previous.t;
        return `<td>${elapsed > 0 ? ((item.s - previous.s) / elapsed).toFixed(2) : '—'}</td>`;
      }).join('');
      rows.innerHTML = `<tr><th scope="row">Tốc độ (km/h)</th>${speedCells}</tr><tr><th scope="row">Quãng đường (m)</th>${distanceCells}</tr><tr><th scope="row">Vận tốc tức thời (m/s)</th>${instantaneousCells}</tr>`;
    }

    function drawChart() {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, rect.width * ratio); canvas.height = Math.max(1, rect.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const w = rect.width, h = rect.height, pad = { l: 32, r: 10, t: 9, b: 22 };
      context.clearRect(0, 0, w, h);
      context.strokeStyle = 'rgba(255,255,255,.1)'; context.fillStyle = '#7890aa'; context.font = '10px Segoe UI';
      for (let v = 0; v <= 60; v += 20) {
        const y = pad.t + (1 - v / 60) * (h - pad.t - pad.b);
        context.beginPath(); context.moveTo(pad.l, y); context.lineTo(w - pad.r, y); context.stroke(); context.fillText(String(v), 5, y + 3);
      }
      const visible = state.samples.slice(-30);
      if (!visible.length) return;
      const maxT = Math.max(10, visible[visible.length - 1].t);
      const minT = Math.max(0, maxT - 30);
      context.beginPath();
      visible.forEach((item, index) => {
        const x = pad.l + ((item.t - minT) / Math.max(10, maxT - minT)) * (w - pad.l - pad.r);
        const y = pad.t + (1 - item.v / 60) * (h - pad.t - pad.b);
        index ? context.lineTo(x, y) : context.moveTo(x, y);
      });
      context.strokeStyle = '#20d5da'; context.lineWidth = 3; context.stroke();
      context.lineTo(w - pad.r, h - pad.b); context.lineTo(pad.l, h - pad.b); context.closePath();
      const gradient = context.createLinearGradient(0, pad.t, 0, h - pad.b); gradient.addColorStop(0, 'rgba(32,213,218,.3)'); gradient.addColorStop(1, 'rgba(32,213,218,0)'); context.fillStyle = gradient; context.fill();
      context.fillStyle = '#7890aa'; context.fillText(`${minT}s`, pad.l, h - 5); context.fillText(`${maxT}s`, w - pad.r - 20, h - 5);
    }

    async function toggleTrip() {
      const nextRunning = !state.running;
      if (state.httpBase) {
        try {
          const response = await fetch(`${state.httpBase}/${nextRunning ? 'start' : 'stop'}`, { method: 'POST' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (nextRunning) { state.samples = []; state.seconds = 0; state.distanceM = 0; }
        } catch (error) {
          document.querySelector('#speed-http-status').textContent = `Không gửi được lệnh: ${error.message}`;
          return;
        }
      }
      if (nextRunning && state.completed) {
        state.completed = false; state.samples = []; state.seconds = 0; state.distanceM = 0;
        document.querySelector('#speed-conclusion').hidden = true;
        document.querySelector('#speed-rows').innerHTML = '<tr><th>Thời gian (s)</th><td colspan="3">Đang chờ dữ liệu</td></tr>';
        drawChart();
      }
      if (nextRunning && state.samples.length === 0) {
        state.samples.push({ t: state.seconds, v: state.speed, s: state.distanceM });
        renderTable(); drawChart();
      }
      state.running = nextRunning;
      updateTripButton();
      if (!state.running) {
        if (Date.now() - state.realSensorAt > 1800) setSpeed(0);
        finishTrip();
      }
    }

    document.querySelector('#trip-toggle').addEventListener('click', toggleTrip);
    document.querySelector('#speed-http-connect').addEventListener('click', connectHttpSensor);
    document.querySelector('#speed-http-url').addEventListener('keydown', (event) => { if (event.key === 'Enter') connectHttpSensor(); });
    document.querySelector('#trip-reset').addEventListener('click', async () => {
      if (state.httpBase) {
        try {
          const response = await fetch(`${state.httpBase}/reset`, { method: 'POST' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (error) {
          document.querySelector('#speed-http-status').textContent = `Không gửi được lệnh dừng: ${error.message}`;
          return;
        }
      }
      state.running = false; state.completed = false; state.samples = []; state.seconds = 0; state.distanceM = 0; setSpeed(0);
      document.querySelector('#speed-conclusion').hidden = true;
      updateTripButton(); document.querySelector('#trip-time').textContent = '00:00';
      document.querySelector('#speed-rows').innerHTML = '<tr><th>Thời gian (s)</th><td colspan="3">Nhấn “Bắt đầu chạy” để thu thập dữ liệu</td></tr>'; drawChart();
    });
    document.querySelector('#signal').addEventListener('click', () => {
      state.signal = (state.signal + 1) % 3;
      document.querySelector('#left-signal').classList.toggle('on', state.signal === 1);
      document.querySelector('#right-signal').classList.toggle('on', state.signal === 2);
    });
    const unsubscribe = window.physicsBridge.onSensorData((data) => {
      if (!state.alive || data?.type !== 'speed') return;
      state.realSensorAt = Date.now(); setSpeed(data.value);
    });
    const interval = setInterval(sample, 1000);
    const httpInterval = setInterval(pollHttpSensor, 1000);
    const resize = () => drawChart(); window.addEventListener('resize', resize); drawChart();
    return () => { state.alive = false; clearInterval(interval); clearInterval(httpInterval); window.removeEventListener('resize', resize); if (typeof unsubscribe === 'function') unsubscribe(); };
  }
  window.SpeedLesson = { mount };
})();

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
          <div class="chart-wrap"><canvas id="speed-chart"></canvas></div>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>Lần đo</th><th>Thời gian (s)</th><th>Vận tốc (km/h)</th><th>Quãng đường (m)</th></tr></thead><tbody id="speed-rows"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Nhấn “Bắt đầu chạy” để thu thập dữ liệu</td></tr></tbody></table></div>
        </section>
      </div>`);

    const state = { running: false, speed: 0, samples: [], seconds: 0, distanceM: 0, realSensorAt: 0, signal: 0, alive: true };
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

    function sample() {
      if (!state.running) return;
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
      rows.innerHTML = state.samples.slice().reverse().map((item, index) => `<tr><td>${state.samples.length - index}</td><td>${item.t}</td><td>${item.v.toFixed(1)}</td><td>${item.s.toFixed(2)}</td></tr>`).join('');
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

    function toggleTrip() {
      state.running = !state.running;
      const button = document.querySelector('#trip-toggle');
      button.textContent = state.running ? 'Tạm dừng' : (state.samples.length ? 'Tiếp tục' : 'Bắt đầu chạy');
      button.classList.toggle('primary', !state.running); button.classList.toggle('secondary', state.running);
      if (!state.running && Date.now() - state.realSensorAt > 1800) setSpeed(0);
    }

    document.querySelector('#trip-toggle').addEventListener('click', toggleTrip);
    document.querySelector('#trip-reset').addEventListener('click', () => {
      state.running = false; state.samples = []; state.seconds = 0; state.distanceM = 0; setSpeed(0);
      document.querySelector('#trip-toggle').textContent = 'Bắt đầu chạy'; document.querySelector('#trip-time').textContent = '00:00';
      document.querySelector('#speed-rows').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Nhấn “Bắt đầu chạy” để thu thập dữ liệu</td></tr>'; drawChart();
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
    const resize = () => drawChart(); window.addEventListener('resize', resize); drawChart();
    return () => { state.alive = false; clearInterval(interval); window.removeEventListener('resize', resize); if (typeof unsubscribe === 'function') unsubscribe(); };
  }
  window.SpeedLesson = { mount };
})();

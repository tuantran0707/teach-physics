(() => {
  function mount() {
    window.ui.lessonShell('Vượt qua lực ma sát', 'Bài 02 · Trọng lực, phản lực và ma sát', `
      <div class="force-layout">
        <section class="force-stage">
          <div class="scene">
            <div class="box-object" id="box">P = 50 N</div>
            <div class="force-arrow" id="force-arrow"><span id="force-label">F = 0 N</span></div>
            <div class="vector-vertical vector-up"><span>N = 50 N</span></div>
            <div class="vector-vertical vector-down"><span>P = 50 N</span></div>
          </div>
          <div class="force-control">
            <label><span>Lực kéo từ cảm biến</span><strong id="force-readout">0 N</strong></label>
            <input id="force-slider" type="range" min="0" max="100" value="0" step="1">
            <div>Trạng thái: <span class="force-status still" id="force-status">ĐỨNG YÊN</span></div>
          </div>
        </section>
        <aside class="force-data">
          <h3>Phân tích lực</h3>
          <div class="metric-row"><span>Trọng lực P</span><strong class="measured">50 N</strong></div>
          <div class="metric-row"><span>Phản lực N</span><strong class="measured">50 N</strong></div>
          <div class="metric-row"><span>Ma sát nghỉ cực đại</span><strong class="measured">60 N</strong></div>
          <div class="metric-row"><span>Lực tác dụng F</span><strong class="measured" id="side-force">0 N</strong></div>
          <button class="secondary wide" id="toggle-values">🙈 Ẩn các giá trị</button>
          <div class="explain" id="force-explain">Khi F ≤ 60 N, ma sát nghỉ cân bằng lực tác dụng nên vật vẫn đứng yên.</div>
          <button class="primary wide" id="force-reset">Đặt lại thí nghiệm</button>
        </aside>
      </div>`);

    let value = 0;
    let x = 43;
    let moving = false;
    let alive = true;
    let lastTime = performance.now();
    const slider = document.querySelector('#force-slider');
    const box = document.querySelector('#box');

    function setForce(next) {
      value = Math.max(0, Math.min(100, Number(next) || 0));
      slider.value = value;
      document.querySelector('#force-readout').textContent = `${value.toFixed(0)} N`;
      document.querySelector('#side-force').textContent = `${value.toFixed(0)} N`;
      document.querySelector('#force-label').textContent = `F = ${value.toFixed(0)} N`;
      document.querySelector('#force-arrow').style.width = `${45 + value * .9}px`;
      moving = value > 60;
      const status = document.querySelector('#force-status');
      status.textContent = moving ? 'ĐANG CHUYỂN ĐỘNG' : 'ĐỨNG YÊN';
      status.className = `force-status ${moving ? 'moving' : 'still'}`;
      document.querySelector('#force-explain').innerHTML = moving
        ? `<strong>F = ${value.toFixed(0)} N &gt; 60 N:</strong> lực kéo thắng ma sát nghỉ cực đại, vật bắt đầu chuyển động.`
        : `<strong>F = ${value.toFixed(0)} N ≤ 60 N:</strong> ma sát nghỉ cân bằng lực tác dụng nên vật vẫn đứng yên.`;
    }

    function animate(now) {
      if (!alive) return;
      const dt = Math.min(.05, (now - lastTime) / 1000); lastTime = now;
      if (moving) {
        x += (value - 60) * .45 * dt;
        if (x > 78) x = 43;
        box.style.left = `${x}%`;
        document.querySelector('#force-arrow').style.left = `calc(${x}% + 112px)`;
      }
      requestAnimationFrame(animate);
    }

    slider.addEventListener('input', () => setForce(slider.value));
    document.querySelector('#toggle-values').addEventListener('click', (event) => {
      const hidden = !document.querySelector('.measured').classList.contains('hidden-value');
      document.querySelectorAll('.measured').forEach((node) => node.classList.toggle('hidden-value', hidden));
      event.currentTarget.textContent = hidden ? '👁 Hiện các giá trị' : '🙈 Ẩn các giá trị';
    });
    document.querySelector('#force-reset').addEventListener('click', () => { x = 43; box.style.left = '43%'; setForce(0); });
    const unsubscribe = window.physicsBridge.onSensorData((data) => {
      if (alive && data?.type === 'force') setForce(data.value);
    });
    setForce(0); requestAnimationFrame(animate);
    return () => { alive = false; if (typeof unsubscribe === 'function') unsubscribe(); };
  }
  window.ForceLesson = { mount };
})();

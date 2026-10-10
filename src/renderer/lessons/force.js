(() => {
  const WEIGHT = 50;
  const NORMAL = 50;
  const FRICTION = 50;

  function mount() {
    window.ui.lessonShell('Đẩy xe vượt lực ma sát', 'Bài 02 · Trọng lực, phản lực, lực ma sát và lực tác dụng', `
      <div class="force-layout">
        <section class="force-stage">
          <div class="force-scene" id="force-scene">
            <div class="force-scene-head"><span>🧪 MÔ PHỎNG LỰC</span><strong>Các vectơ lực luôn gắn với xe</strong></div>
            <div class="force-rig" id="force-rig">
              <img class="force-character-art" src="assets/force/person-pushing-cart.png" alt="Người đang tác dụng lực đẩy lên xe">
              <span class="force-origin cart-center-origin" aria-hidden="true"></span>
              <span class="force-origin cart-ground-origin" aria-hidden="true"></span>
              <div class="attached-force force-applied" id="applied-vector">
                <span class="force-tag"><b>F</b><em class="scene-measured" id="scene-force-value">0 N</em><small>Lực tay đẩy</small></span><i class="force-line"></i>
              </div>
              <div class="attached-force force-friction" id="friction-vector">
                <i class="force-line"></i><span class="force-tag"><b>Fms</b><em class="scene-measured" id="scene-friction-value">${FRICTION} N</em><small>Ma sát</small></span>
              </div>
              <div class="attached-force force-normal">
                <span class="force-tag"><b>N</b><em class="scene-measured">${NORMAL} N</em><small>Phản lực</small></span><i class="force-line"></i>
              </div>
              <div class="attached-force force-weight">
                <i class="force-line"></i><span class="force-tag"><b>P</b><em class="scene-measured">${WEIGHT} N</em><small>Trọng lực</small></span>
              </div>
            </div>
            <div class="force-ground"><span></span></div>
          </div>
          <div class="force-control">
            <div class="sensor-readout"><div><small>DỮ LIỆU CẢM BIẾN LỰC</small><strong>Lực tay đang đẩy xe</strong></div><output class="measured" id="force-readout">0 N</output></div>
            <div class="force-slider-wrap">
              <input id="force-slider" type="range" min="0" max="100" value="0" step="1" aria-label="Lực tác dụng mô phỏng">
              <div class="friction-threshold"><i></i><span>Xe chuyển động khi lực đẩy vượt Fms = ${FRICTION} N</span></div>
            </div>
            <div class="force-state-row"><span>Trạng thái của xe</span><strong class="force-status still" id="force-status">● ĐỨNG YÊN</strong></div>
          </div>
        </section>
        <aside class="force-data">
          <div class="force-data-head"><span>📐</span><div><small>SƠ ĐỒ LỰC</small><h3>Phân tích lực tác dụng lên xe</h3></div></div>
          <div class="metric-row force-p"><span><i>P</i> Trọng lực</span><strong class="measured">${WEIGHT} N</strong></div>
          <div class="metric-row force-n"><span><i>N</i> Phản lực</span><strong class="measured">${NORMAL} N</strong></div>
          <div class="metric-row force-fms"><span><i>Fms</i> Lực ma sát</span><strong class="measured" id="side-friction">${FRICTION} N</strong></div>
          <div class="metric-row force-f"><span><i>F</i> Lực tay đẩy</span><strong class="measured" id="side-force">0 N</strong></div>
          <div class="force-limit">Fms luôn cố định: <strong class="measured">${FRICTION} N</strong></div>
          <button class="secondary wide" id="toggle-values">🙈 Ẩn tất cả giá trị</button>
          <div class="explain" id="force-explain">Trong mô hình này, Fms luôn bằng 50 N. Xe đứng yên khi lực đẩy chưa vượt qua lực ma sát.</div>
          <button class="primary wide" id="force-reset">↺ Đặt lại thí nghiệm</button>
        </aside>
      </div>`);

    let value = 0;
    let x = 6;
    let moving = false;
    let alive = true;
    let valuesHidden = false;
    let lastTime = performance.now();
    const slider = document.querySelector('#force-slider');
    const rig = document.querySelector('#force-rig');

    function updateExplanation(friction) {
      if (valuesHidden) {
        document.querySelector('#force-explain').innerHTML = moving
          ? '<strong>Lực tay đẩy đã lớn hơn lực ma sát:</strong> xe bắt đầu chuyển động.'
          : '<strong>Lực tay đẩy chưa vượt lực ma sát:</strong> xe vẫn đứng yên.';
        return;
      }
      document.querySelector('#force-explain').innerHTML = moving
        ? `<strong>F = ${value.toFixed(0)} N &gt; Fms = ${friction.toFixed(0)} N:</strong> hợp lực hướng sang phải nên xe bắt đầu chuyển động.`
        : `<strong>F = ${value.toFixed(0)} N ≤ Fms = ${friction.toFixed(0)} N:</strong> lực đẩy chưa thắng được lực ma sát nên xe vẫn đứng yên.`;
    }

    function setForce(next) {
      value = Math.max(0, Math.min(100, Number(next) || 0));
      const friction = FRICTION;
      slider.value = value;
      document.querySelector('#force-readout').textContent = `${value.toFixed(0)} N`;
      document.querySelector('#side-force').textContent = `${value.toFixed(0)} N`;
      document.querySelector('#side-friction').textContent = `${friction.toFixed(0)} N`;
      document.querySelector('#scene-force-value').textContent = `${value.toFixed(0)} N`;
      document.querySelector('#scene-friction-value').textContent = `${friction.toFixed(0)} N`;
      document.querySelector('#applied-vector').style.setProperty('--force-length', `${44 + value * .72}px`);
      document.querySelector('#friction-vector').style.setProperty('--friction-length', '86px');
      document.querySelector('.friction-threshold i').style.width = `${value}%`;
      moving = value > FRICTION;
      const status = document.querySelector('#force-status');
      status.textContent = moving ? '● ĐANG CHUYỂN ĐỘNG' : '● ĐỨNG YÊN';
      status.className = `force-status ${moving ? 'moving' : 'still'}`;
      rig.classList.toggle('moving', moving);
      updateExplanation(friction);
    }

    function animate() {
      if (!alive) return;
      const now = performance.now();
      const dt = Math.min(.05, (now - lastTime) / 1000);
      lastTime = now;
      if (moving) {
        x += (value - FRICTION) * .42 * dt;
        if (x > 48) x = 6;
        rig.style.left = `${x}%`;
      }
      requestAnimationFrame(animate);
    }

    slider.addEventListener('input', () => setForce(slider.value));
    document.querySelector('#toggle-values').addEventListener('click', (event) => {
      valuesHidden = !valuesHidden;
      document.querySelectorAll('.measured,.scene-measured').forEach((node) => node.classList.toggle('hidden-value', valuesHidden));
      document.querySelector('#force-scene').classList.toggle('values-hidden', valuesHidden);
      event.currentTarget.textContent = valuesHidden ? '👁 Hiện tất cả giá trị' : '🙈 Ẩn tất cả giá trị';
      updateExplanation(FRICTION);
    });
    document.querySelector('#force-reset').addEventListener('click', () => {
      x = 6;
      rig.style.left = '6%';
      setForce(0);
    });
    const unsubscribe = window.physicsBridge.onSensorData((data) => {
      if (alive && data?.type === 'force') setForce(data.value);
    });
    setForce(0);
    const animationTimer = setInterval(animate, 50);
    return () => {
      alive = false;
      clearInterval(animationTimer);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }

  window.ForceLesson = { mount };
})();

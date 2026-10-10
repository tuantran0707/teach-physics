(() => {
  function mount() {
    window.ui.lessonShell('Đẩy xe vượt lực ma sát', 'Bài 02 · Trọng lực, phản lực, lực ma sát và lực tác dụng', `
      <div class="force-layout">
        <section class="force-stage">
          <div class="force-stage-heading"><div class="force-stage-title"><span>↗</span><strong>MÔ PHỎNG LỰC</strong></div><span>Các véc-tơ lực luôn gắn với xe</span></div>
          <div class="scene">
            <svg class="force-person" viewBox="0 0 200 220" aria-hidden="true">
              <defs>
                <linearGradient id="shopper-jacket" x2="0" y2="1"><stop stop-color="#45d4d0"/><stop offset="1" stop-color="#168b9c"/></linearGradient>
                <linearGradient id="shopper-jeans" x2="0" y2="1"><stop stop-color="#526b9b"/><stop offset="1" stop-color="#293b63"/></linearGradient>
              </defs>
              <ellipse cx="99" cy="208" rx="72" ry="8" fill="#020914" opacity=".36"/>
              <path d="m82 139-9 48 18 3 18-43 11 43 19-3-6-55" fill="url(#shopper-jeans)" stroke="#243451" stroke-width="4" stroke-linejoin="round"/>
              <path d="m74 184 17 3-1 15-31 4q-8-1-4-7zM119 184l19-2 10 16q2 6-6 7l-28-5z" fill="#f2f0e7" stroke="#c6cbd0" stroke-width="3" stroke-linejoin="round"/>
              <path d="m53 68q8-12 24-13h34q18 5 23 22l9 65q-38 17-84 0l7-46-22 31-14-10 25-43" fill="url(#shopper-jacket)" stroke="#126c78" stroke-width="4" stroke-linejoin="round"/>
              <path d="M116 72 138 82 157 103M105 82l25 10 21 18" fill="none" stroke="#45b8ad" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M145 91 160 107 183 112M132 99l17 13 34 0" fill="none" stroke="#f0bd91" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="m64 83-20 27" fill="none" stroke="#f0bd91" stroke-width="8" stroke-linecap="round"/>
              <path d="M79 53q-5-17 5-30 8-11 25-8 18 4 19 22l-5 20-37 3z" fill="#f0bd91" stroke="#9d6e57" stroke-width="3"/>
              <path d="M77 36q-1-25 20-30 25-5 34 15l-3 16-9-10-23-5-8 14-7-6-4 17-6-2z" fill="#49342e" stroke="#30241f" stroke-width="3" stroke-linejoin="round"/>
              <path d="M102 39q4 3 8 0m10-1q4 3 7 0" fill="none" stroke="#49342e" stroke-width="2.5" stroke-linecap="round"/>
              <circle cx="108" cy="39" r="1.8" fill="#30241f"/><circle cx="124" cy="38" r="1.8" fill="#30241f"/>
              <path d="m116 49q6 4 11-1" fill="none" stroke="#a85c54" stroke-width="2.5" stroke-linecap="round"/>
              <path d="m91 57 18 4-5 10-11-2z" fill="#e8ad80"/>
              <path d="m97 79 12 2-3 34-13 0z" fill="#d8f2ed" opacity=".9"/>
              <path d="m102 116 4 0" stroke="#f1c35d" stroke-width="4" stroke-linecap="round"/>
              <path d="m181 111 7 1m-8 5 8-2" stroke="#f0bd91" stroke-width="8" stroke-linecap="round"/>
            </svg>
            <div class="box-object" id="box" aria-label="Xe đẩy hàng, trọng lực P bằng 50 niutơn">
              <svg class="trolley-art" viewBox="0 0 180 130" aria-hidden="true">
                <defs><linearGradient id="basket-fill" x2="0" y2="1"><stop stop-color="#d8eef0"/><stop offset="1" stop-color="#789ca5"/></linearGradient></defs>
                <path d="M10 16h17l16 72q2 8 11 8h83" fill="none" stroke="#d3e0e1" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M39 34h121l-17 48H50z" fill="url(#basket-fill)" stroke="#435c6c" stroke-width="5" stroke-linejoin="round"/>
                <path d="m57 38 9 39m23-39 1 39m24-39-5 39m24-39-12 39M47 55h105m-99 15h89" fill="none" stroke="#7895a0" stroke-width="3" opacity=".8"/>
                <rect x="70" y="48" width="58" height="23" rx="6" fill="#fff" opacity=".92"/>
                <text x="99" y="64" fill="#274255" font-size="13" font-weight="700" text-anchor="middle">P = 50 N</text>
                <path d="m58 89-7 15m76-15 7 15" stroke="#435c6c" stroke-width="7" stroke-linecap="round"/>
                <circle cx="48" cy="111" r="10" fill="#273b4a" stroke="#b9c9cd" stroke-width="4"/>
                <circle cx="132" cy="111" r="10" fill="#273b4a" stroke="#b9c9cd" stroke-width="4"/>
              </svg>
              <div class="force-vectors" aria-hidden="true">
                <div class="force-arrow" id="force-arrow"><i></i><span id="force-label">F = 0 N</span></div>
                <div class="force-vector force-normal"><i></i><span>N = 50 N</span></div>
                <div class="force-vector force-weight"><i></i><span>P = 50 N</span></div>
                <div class="force-vector force-friction" id="friction-arrow"><i></i><span id="friction-label">Fms = 0 N</span></div>
              </div>
            </div>
          </div>
          <div class="force-control">
            <div class="force-control-heading"><label for="force-slider"><small>DỮ LIỆU CẢM BIẾN LỰC</small><strong>Lực tay đang đẩy xe</strong></label><strong id="force-readout">0 N</strong></div>
            <input id="force-slider" type="range" min="0" max="100" value="0" step="1" aria-label="Điều chỉnh lực đẩy">
            <div class="force-control-footer"><span class="force-threshold">Xe chuyển động khi lực đẩy vượt Fms = 60 N</span><span class="force-status still" id="force-status">● ĐỨNG YÊN</span></div>
          </div>
        </section>
        <aside class="force-data">
          <div class="force-data-heading"><span class="force-diagram-icon">◢</span><div><small>SƠ ĐỒ LỰC</small><h3>Phân tích lực tác dụng lên xe</h3></div></div>
          <div class="metric-row"><span class="force-symbol weight">P</span><span class="metric-label">Trọng lực</span><strong class="measured">50 N</strong></div>
          <div class="metric-row"><span class="force-symbol normal">N</span><span class="metric-label">Phản lực</span><strong class="measured">50 N</strong></div>
          <div class="metric-row"><span class="force-symbol friction">Fms</span><span class="metric-label">Lực ma sát</span><strong class="measured" id="friction-readout">0 N</strong></div>
          <div class="metric-row"><span class="force-symbol applied">F</span><span class="metric-label">Lực tay đẩy</span><strong class="measured" id="side-force">0 N</strong></div>
          <div class="friction-limit"><span>Ma sát nghỉ cực đại</span><strong>60 N</strong></div>
          <button class="secondary wide" id="toggle-values">🙈 Ẩn các giá trị</button>
          <div class="explain" id="force-explain">Khi F ≤ 60 N, ma sát nghỉ cân bằng lực tác dụng nên vật vẫn đứng yên.</div>
          <button class="primary wide" id="force-reset">Đặt lại thí nghiệm</button>
        </aside>
      </div>`);

    let value = 0;
    let x = 34;
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
      const friction = Math.min(value, 60);
      document.querySelector('#friction-readout').textContent = `${friction.toFixed(0)} N`;
      document.querySelector('#friction-label').textContent = `Fms = ${friction.toFixed(0)} N`;
      document.querySelector('#force-label').textContent = `F = ${value.toFixed(0)} N`;
      document.querySelector('#force-arrow').style.width = `${45 + value * .9}px`;
      document.querySelector('#friction-arrow').style.width = `${Math.max(24, 38 + friction * .55)}px`;
      document.querySelector('#friction-arrow').classList.toggle('inactive', friction === 0);
      moving = value > 60;
      const status = document.querySelector('#force-status');
      status.textContent = moving ? '● ĐANG CHUYỂN ĐỘNG' : '● ĐỨNG YÊN';
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
        if (x > 78) x = 34;
        box.style.left = `${x}%`;
      }
      requestAnimationFrame(animate);
    }

    slider.addEventListener('input', () => setForce(slider.value));
    document.querySelector('#toggle-values').addEventListener('click', (event) => {
      const hidden = !document.querySelector('.measured').classList.contains('hidden-value');
      document.querySelectorAll('.measured').forEach((node) => node.classList.toggle('hidden-value', hidden));
      event.currentTarget.textContent = hidden ? '👁 Hiện các giá trị' : '🙈 Ẩn các giá trị';
    });
    document.querySelector('#force-reset').addEventListener('click', () => { x = 34; box.style.left = '34%'; setForce(0); });
    const unsubscribe = window.physicsBridge.onSensorData((data) => {
      if (alive && data?.type === 'force') setForce(data.value);
    });
    setForce(0); requestAnimationFrame(animate);
    return () => { alive = false; if (typeof unsubscribe === 'function') unsubscribe(); };
  }
  window.ForceLesson = { mount };
})();

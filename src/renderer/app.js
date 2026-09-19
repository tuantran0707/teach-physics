(() => {
  const app = document.querySelector('#app');
  const toast = document.querySelector('#toast');
  let currentCleanup = null;

  const lessons = [
    { id: 'displacement', no: '01', title: 'Khu vườn trên mây', subtitle: 'Thu hoạch và tới Hội chợ', icon: '🐿️', color: 'cyan' },
    { id: 'force', no: '02', title: 'Lực ma sát', subtitle: 'Kéo vật vượt ngưỡng', icon: '📦', color: 'orange' },
    { id: 'speed', no: '03', title: 'Vận tốc', subtitle: 'Bảng điều khiển xe', icon: '🏎️', color: 'purple' },
    { id: 'future', no: '04', title: 'Bài học mới', subtitle: 'Sẵn sàng mở rộng', icon: '⚗️', color: 'green' }
  ];

  window.ui = {
    showToast(message, type = 'info') {
      toast.textContent = message;
      toast.className = `toast show ${type}`;
      clearTimeout(window.ui.toastTimer);
      window.ui.toastTimer = setTimeout(() => toast.className = 'toast', 2600);
    },
    goHome: renderHome,
    lessonShell(title, subtitle, content, actions = '') {
      app.innerHTML = `
        <main class="lesson-page">
          <header class="topbar">
            <button class="icon-btn" data-home aria-label="Về trang chủ">←</button>
            <div class="topbar-title"><strong>${title}</strong><span>${subtitle}</span></div>
            <div class="topbar-actions">${actions}</div>
          </header>
          <section class="lesson-content">${content}</section>
        </main>`;
      app.querySelector('[data-home]').addEventListener('click', renderHome);
    }
  };

  function cleanup() {
    if (typeof currentCleanup === 'function') currentCleanup();
    currentCleanup = null;
  }

  function renderHome() {
    cleanup();
    app.innerHTML = `
      <main class="home">
        <header class="hero">
          <div>
            <p class="eyebrow">PHÒNG THÍ NGHIỆM TƯƠNG TÁC</p>
            <h1>Chạm để khám phá<br><span>Vật lý quanh ta</span></h1>
          </div>
          <button class="connection-pill" id="connection-button"><i></i><span>Chế độ mô phỏng</span> ⚙</button>
        </header>
        <section class="lesson-grid">
          ${lessons.map((lesson) => `
            <button class="lesson-card ${lesson.color}" data-lesson="${lesson.id}">
              <span class="lesson-no">${lesson.no}</span>
              <span class="lesson-icon">${lesson.icon}</span>
              <span class="lesson-copy"><strong>${lesson.title}</strong><small>${lesson.subtitle}</small></span>
              <span class="arrow">→</span>
            </button>`).join('')}
        </section>
        <footer><span>● Sẵn sàng</span><span>Thiết kế cho màn hình cảm ứng 7 inch</span></footer>
      </main>`;

    app.querySelectorAll('[data-lesson]').forEach((button) => button.addEventListener('click', () => openLesson(button.dataset.lesson)));
    app.querySelector('#connection-button').addEventListener('click', renderConnectionDialog);
  }

  function openLesson(id) {
    cleanup();
    if (id === 'displacement') currentCleanup = window.DisplacementLesson.mount();
    if (id === 'force') currentCleanup = window.ForceLesson.mount();
    if (id === 'speed') currentCleanup = window.SpeedLesson.mount();
    if (id === 'future') {
      window.ui.lessonShell('Bài học 04', 'Mô-đun mở rộng', `
        <div class="empty-state"><span>⚗️</span><h2>Không gian cho bài học tiếp theo</h2>
        <p>Cấu trúc ứng dụng đã sẵn sàng để thêm cảm biến, trò chơi và nội dung mới.</p>
        <button class="primary" data-back>Chọn bài khác</button></div>`);
      app.querySelector('[data-back]').addEventListener('click', renderHome);
    }
  }

  async function renderConnectionDialog() {
    const ports = await window.physicsBridge.listSerialPorts();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">
      <div class="modal-head"><div><h2>Kết nối cảm biến</h2><p>USB Serial · JSON mỗi dòng · 115200 baud</p></div><button class="icon-btn" data-close>×</button></div>
      <label>Cổng thiết bị<select id="serial-port">
        <option value="">Chế độ mô phỏng</option>
        ${ports.map((port) => `<option value="${port.path}">${port.friendlyName || port.path} — ${port.path}</option>`).join('')}
      </select></label>
      <div class="code-hint"><code>{"type":"force","value":72.4}</code><br><code>{"type":"speed","value":3.6}</code></div>
      <button class="primary wide" data-connect>${ports.length ? 'Kết nối' : 'Không tìm thấy thiết bị — tiếp tục mô phỏng'}</button>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-connect]').addEventListener('click', async () => {
      const path = overlay.querySelector('#serial-port').value;
      if (!path) { close(); return; }
      const result = await window.physicsBridge.connectSerial({ path, baudRate: 115200 });
      if (result.ok) {
        document.querySelector('#connection-button span').textContent = `Đã nối ${path}`;
        document.querySelector('#connection-button').classList.add('connected');
        window.ui.showToast('Đã kết nối cảm biến', 'success');
        close();
      } else window.ui.showToast(result.error, 'error');
    });
  }

  window.physicsBridge.onSensorError((message) => window.ui.showToast(`Lỗi cảm biến: ${message}`, 'error'));
  window.physicsBridge.onSensorWarning((message) => console.warn(message));
  renderHome();
})();

(() => {
  const app = document.querySelector('#app');
  const toast = document.querySelector('#toast');
  let currentCleanup = null;
  let activeGuide = null;
  let sensorConnection = null;
  let lastSensorError = '';

  const lessonGuides = {
    displacement: {
      title: 'Thu hoạch và tới Hội chợ',
      intro: 'Dẫn Sóc Nâu qua khu vườn, học cách phân biệt quãng đường và độ dịch chuyển trên từng chặng.',
      steps: [
        'Chọn đấu với máy hoặc hai học sinh trước khi bắt đầu lượt đầu tiên.',
        'Gieo xúc xắc để biết số bước, rồi chọn hướng đi đủ đúng số bước đó.',
        'Gặp trái cây, trả lời câu hỏi Vật lý để thu hoạch; tránh bùn, bụi gai và hố sâu.',
        'Thu thập ít nhất 3 loại trái cây rồi đi tới Hội chợ để hoàn thành hành trình.'
      ],
      takeaway: 'Quãng đường là tổng độ dài đã đi; độ dịch chuyển phụ thuộc vị trí đầu và cuối. Bảng bên cạnh hiển thị thêm tốc độ và vận tốc trung bình.'
    },
    force: {
      title: 'Khám phá lực ma sát',
      intro: 'Thay đổi lực kéo và quan sát thời điểm xe đẩy bắt đầu chuyển động.',
      steps: [
        'Kéo thanh “Lực kéo từ cảm biến” hoặc dùng cảm biến lực đã kết nối.',
        'Khi lực kéo không vượt quá 30 N, vật đứng yên vì lực ma sát cân bằng lực kéo.',
        'Khi lực kéo lớn hơn 30 N, vật bắt đầu chuyển động.',
        'Ẩn hoặc hiện các giá trị để tự dự đoán kết quả, rồi chọn “Đặt lại thí nghiệm” để thử lại.'
      ],
      takeaway: 'Quan sát mối quan hệ giữa lực kéo, ma sát nghỉ cực đại và trạng thái chuyển động của vật.'
    },
    speed: {
      title: 'Theo dõi vận tốc của xe',
      intro: 'Đo vận tốc của xe robot khi đi qua các vạch đen cách nhau 10 cm, hoặc xem một chuyến đi mô phỏng.',
      steps: [
        'Xe thật: bấm “📶 Kết nối xe”, IP đã điền sẵn (sửa bằng bàn phím số nếu cần), bấm “Kết nối”.',
        'Đặt xe trên mặt bàn trước vạch đầu tiên, bấm “▶ Bắt đầu”. Xe chạy chậm rồi nhanh dần; bấm “■ Dừng” khi xe qua hết các vạch.',
        'Mỗi khi xe chạm một vạch đen (từ vạch thứ 2), bảng thêm một dòng: Δt giữa hai vạch và v = 0,1 m ÷ Δt (m/s).',
        'Chưa có xe: bấm “Bắt đầu chạy” để xem chuyến đi mô phỏng (km/h, mỗi giây một điểm). “Đặt lại” để xóa dữ liệu.'
      ],
      takeaway: 'Vận tốc tại mỗi vạch bằng quãng đường 10 cm chia cho thời gian đi giữa hai vạch; quan sát vận tốc tăng dần khi xe nhanh dần.'
    },
    future: {
      title: 'Bài học mới',
      intro: 'Đây là khu vực dành cho mô-đun Vật lý tiếp theo.',
      steps: [
        'Chọn “Bắt đầu” để xem trạng thái hiện tại của mô-đun.',
        'Quay về trang chủ để chọn một bài học đang hoạt động.'
      ],
      takeaway: 'Các bài học hiện có: hành trình và độ dịch chuyển, lực ma sát, vận tốc theo thời gian.'
    }
  };

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
            <div class="topbar-actions">${actions}<button class="chip" data-guide>ⓘ Hướng dẫn</button></div>
          </header>
          <section class="lesson-content">${content}</section>
        </main>`;
      app.querySelector('[data-home]').addEventListener('click', renderHome);
      app.querySelector('[data-guide]').addEventListener('click', showGuide);
    }
  };

  function showGuide() {
    if (!activeGuide) return;
    document.querySelector('.guide-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'guide-overlay';
    overlay.innerHTML = `
      <section class="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div class="guide-heading"><div><span class="guide-kicker">HƯỚNG DẪN BÀI HỌC</span><h2 id="guide-title">${activeGuide.title}</h2></div><button class="icon-btn" data-guide-close aria-label="Đóng hướng dẫn">×</button></div>
        <p class="guide-intro">${activeGuide.intro}</p>
        <ol class="guide-steps">${activeGuide.steps.map((step) => `<li>${step}</li>`).join('')}</ol>
        <div class="guide-takeaway"><strong>Điều cần khám phá</strong><p>${activeGuide.takeaway}</p></div>
        <button class="primary wide" data-guide-close>Bắt đầu</button>
      </section>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-guide-close]').forEach((button) => button.addEventListener('click', close));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    overlay.querySelector('[data-guide-close]').focus();
  }

  function cleanup() {
    document.querySelector('.guide-overlay')?.remove();
    if (typeof currentCleanup === 'function') currentCleanup();
    currentCleanup = null;
  }

  function renderHome() {
    cleanup();
    activeGuide = null;
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
    const connectionButton = app.querySelector('#connection-button');
    if (sensorConnection?.connected) {
      connectionButton.querySelector('span').textContent = `Đã nối ${sensorConnection.path}`;
      connectionButton.classList.add('connected');
    } else if (sensorConnection?.retrying) {
      connectionButton.querySelector('span').textContent = `Đang chờ ${sensorConnection.path}`;
    }
    connectionButton.addEventListener('click', renderConnectionDialog);
  }

  function openLesson(id) {
    cleanup();
    activeGuide = lessonGuides[id];
    if (id === 'displacement') {
      currentCleanup = renderGardenSongIntro();
      return;
    }
    if (id === 'force') currentCleanup = window.ForceLesson.mount();
    if (id === 'speed') currentCleanup = window.SpeedLesson.mount();
    if (id === 'future') {
      window.ui.lessonShell('Bài học 04', 'Mô-đun mở rộng', `
        <div class="empty-state"><span>⚗️</span><h2>Không gian cho bài học tiếp theo</h2>
        <p>Cấu trúc ứng dụng đã sẵn sàng để thêm cảm biến, trò chơi và nội dung mới.</p>
        <button class="primary" data-back>Chọn bài khác</button></div>`);
      app.querySelector('[data-back]').addEventListener('click', renderHome);
    }
    showGuide();
  }

  function renderGardenSongIntro() {
    const lyrics = [
      'Khỉ Vàng thích chạy vòng quanh,',
      '<em>(Vòng quanh! Vòng quanh!)</em>',
      'Đi qua đi lại, đường uốn quanh co.',
      'Đếm hết bước chân, dài bao nhiêu mét?',
      'Đó là <strong>QUÃNG ĐƯỜNG</strong>, Khỉ Vàng đi qua!',
      '<em>(Đi nhanh! Đi chậm!)</em>',
      'Chạy nhanh như gió, hay đi thật chậm,',
      'Nhanh chậm thế nào, gọi là <strong>TỐC ĐỘ</strong>!',
      'Voi Lam không thích vòng quanh,',
      '<em>(Đi thẳng! Đi thẳng!)</em>',
      'Nhìn từ điểm <strong>ĐẦU</strong>, nhìn tới điểm <strong>CUỐI</strong>.',
      'Vẽ một mũi tên, lao thẳng một mạch,',
      'Đó là <strong>DỊCH CHUYỂN</strong>, từ Đầu đến Cuối thôi!',
      '<em>(Đi thẳng! Tới đích!)</em>',
      'Cứ hướng mũi tên, Voi Lam bước tới,',
      'Đi thẳng nhanh vèo, <strong>VẬN TỐC</strong> về đích thôi!'
    ];
    const audioSource = 'assets/garden/song.wav';

    app.innerHTML = `
      <main class="song-intro-page">
        <header class="song-intro-topbar">
          <button class="icon-btn" id="song-intro-home" aria-label="Về trang chủ">←</button>
          <div class="song-intro-title"><small>TRƯỚC KHI BẮT ĐẦU</small><strong>Khu Vườn Trên Mây</strong></div>
          <span class="song-intro-edition">BÀI 01 · HÁT VÀ KHÁM PHÁ</span>
        </header>
        <section class="song-intro-content">
          <div class="song-visual-column">
            <div class="song-scene" aria-label="Hoạt cảnh Khỉ Vàng chạy quanh vườn và Voi Lam đi thẳng tới hội chợ">
              <div class="song-scene-sun"></div><div class="song-cloud song-cloud-one"></div><div class="song-cloud song-cloud-two"></div>
              <div class="song-hill song-hill-back"></div><div class="song-hill song-hill-front"></div>
              <div class="song-winding-path"></div><div class="song-straight-path"></div>
              <div class="song-fair"><span>🎪</span><small>HỘI CHỢ</small></div>
              <span class="song-fruit song-fruit-one">🍎</span><span class="song-fruit song-fruit-two">🍊</span><span class="song-fruit song-fruit-three">🍇</span>
              <img class="song-character song-monkey" src="assets/garden/song-monkey.svg" alt="Khỉ Vàng">
              <img class="song-character song-elephant" src="assets/garden/song-elephant.svg" alt="Voi Lam">
              <div class="song-scene-caption"><small>MỘT BÀI HÁT · BỐN KHÁI NIỆM</small><strong>Quãng đường · Tốc độ · Dịch chuyển · Vận tốc</strong></div>
            </div>
            <div class="song-player">
              <span class="song-note" aria-hidden="true">♫</span>
              <div class="song-track-info"><strong>Khỉ Vàng và Voi Lam</strong><span id="song-playback-status">Đang chuẩn bị phát</span></div>
              <input id="song-seek" type="range" min="0" max="1000" value="0" aria-label="Tua bài hát">
              <button class="icon-btn" id="song-play-toggle" aria-label="Tạm dừng bài hát" title="Tạm dừng bài hát">Ⅱ</button>
            </div>
            <audio id="garden-song" src="${audioSource}" preload="auto"></audio>
          </div>
          <aside class="song-lyrics-panel">
            <div class="song-lyrics-heading"><div><span>LỜI BÀI HÁT</span><h1>Khỉ Vàng<br>và Voi Lam</h1></div><span class="song-lyrics-mark">♪</span></div>
            <div class="song-lyrics" id="song-lyrics" aria-live="polite">${lyrics.map((line, index) => `<p data-lyric="${index}">${line}</p>`).join('')}</div>
            <button class="primary song-start-button" id="song-start-game">Vào trò chơi <span>→</span></button>
          </aside>
        </section>
      </main>`;

    const audio = app.querySelector('#garden-song');
    const playbackStatus = app.querySelector('#song-playback-status');
    const playToggle = app.querySelector('#song-play-toggle');
    const seek = app.querySelector('#song-seek');
    const lyricLines = [...app.querySelectorAll('[data-lyric]')];
    let activeLyric = -1;

    function updatePlayback() {
      const playing = !audio.paused;
      playToggle.textContent = playing ? 'Ⅱ' : '▶';
      playToggle.setAttribute('aria-label', playing ? 'Tạm dừng bài hát' : 'Phát bài hát');
      playToggle.title = playing ? 'Tạm dừng bài hát' : 'Phát bài hát';
      playbackStatus.textContent = playing ? 'Đang phát' : 'Đã tạm dừng';
    }

    function updateLyrics() {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const nextLyric = Math.min(lyrics.length - 1, Math.floor(audio.currentTime / audio.duration * lyrics.length));
      seek.value = String(Math.round(audio.currentTime / audio.duration * 1000));
      if (nextLyric === activeLyric) return;
      lyricLines[activeLyric]?.classList.remove('active');
      activeLyric = nextLyric;
      lyricLines[activeLyric]?.classList.add('active');
      lyricLines[activeLyric]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    const stopIntro = () => {
      audio.pause();
      audio.currentTime = 0;
      audio.removeEventListener('play', updatePlayback);
      audio.removeEventListener('pause', updatePlayback);
      audio.removeEventListener('timeupdate', updateLyrics);
      audio.removeEventListener('loadedmetadata', updateLyrics);
    };

    audio.volume = 0.75;
    audio.addEventListener('play', updatePlayback);
    audio.addEventListener('pause', updatePlayback);
    audio.addEventListener('timeupdate', updateLyrics);
    audio.addEventListener('loadedmetadata', updateLyrics);
    audio.play().catch(() => { playbackStatus.textContent = 'Nhấn nút phát để nghe bài hát'; });
    playToggle.addEventListener('click', () => {
      if (audio.paused) audio.play().catch(() => { playbackStatus.textContent = 'Không phát được tệp nhạc'; });
      else audio.pause();
    });
    seek.addEventListener('input', () => {
      if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) / 1000 * audio.duration;
    });
    app.querySelector('#song-intro-home').addEventListener('click', renderHome);
    app.querySelector('#song-start-game').addEventListener('click', () => {
      stopIntro();
      currentCleanup = window.DisplacementLesson.mount();
      showGuide();
    });

    return stopIntro;
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
  window.physicsBridge.onSensorConnection((status) => {
    sensorConnection = status;
    const button = document.querySelector('#connection-button');
    if (status?.connected) {
      lastSensorError = '';
      if (button) {
        button.querySelector('span').textContent = `Đã nối ${status.path}`;
        button.classList.add('connected');
      }
      window.ui.showToast(`Đã tự động kết nối ${status.path}`, 'success');
      return;
    }
    if (button) {
      button.querySelector('span').textContent = `Đang chờ ${status.path}`;
      button.classList.remove('connected');
    }
    if (status?.error && status.error !== lastSensorError) {
      lastSensorError = status.error;
      window.ui.showToast(`Chưa mở được ${status.path}: ${status.error}`, 'error');
    }
  });
  renderHome();
})();

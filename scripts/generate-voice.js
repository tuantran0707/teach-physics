// Tạo file giọng đọc AI tiếng Việt cho các câu hỏi (src/renderer/assets/voice/*.mp3).
// Dùng edge-tts (giọng neural của Microsoft) — cần Python và mạng LÚC TẠO; app chạy offline.
//   py -3 -m pip install --user edge-tts      (chỉ cần một lần)
//   npm run voice                              (tạo file còn thiếu)
//   npm run voice -- --force                   (tạo lại tất cả)
// Đổi giọng: VOICE=vi-VN-NamMinhNeural npm run voice -- --force
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { QUESTIONS, voiceClips } = require('../src/renderer/lessons/questions.js');

const OUT_DIR = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'voice');
const VOICE = process.env.VOICE || 'vi-VN-HoaiMyNeural';
const RATE = process.env.RATE || '-8%';
const force = process.argv.includes('--force');
const python = process.platform === 'win32' ? ['py', ['-3']] : ['python3', []];

fs.mkdirSync(OUT_DIR, { recursive: true });
const clips = Object.assign({}, ...QUESTIONS.map(voiceClips));
const expected = new Set(Object.keys(clips).map((id) => `${id}.mp3`));
let made = 0;
const failed = [];
for (const [id, text] of Object.entries(clips)) {
  const file = path.join(OUT_DIR, `${id}.mp3`);
  if (!force && fs.existsSync(file) && fs.statSync(file).size > 1000) continue;
  // Truyền chữ qua file UTF-8 để tránh lỗi mã hóa/dấu ngoặc của tham số dòng lệnh.
  const textFile = path.join(os.tmpdir(), `voice-${id}.txt`);
  fs.writeFileSync(textFile, text, 'utf8');
  try {
    try {
    // Dịch vụ thỉnh thoảng trả lỗi "No audio received" ngẫu nhiên → thử lại tối đa 8 lần.
    for (let attempt = 1; ; attempt++) {
      try {
        execFileSync(python[0], [...python[1], '-m', 'edge_tts', '--voice', VOICE, `--rate=${RATE}`, '--file', textFile, '--write-media', file], { stdio: 'pipe' });
        if (fs.statSync(file).size > 1000) break;
      } catch (error) {
        if (attempt >= 8) fs.rmSync(file, { force: true });
        if (attempt >= 8) throw new Error(`Không tạo được ${id}.mp3: ${String(error.stderr || error.message).trim().split('\n').pop()}`);
      }
      fs.rmSync(file, { force: true });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000 * attempt);
    }
    } catch (error) {
      console.log(`✗ ${error.message}`);
      failed.push(id);
      continue;
    }
  } finally {
    fs.rmSync(textFile, { force: true });
  }
  console.log(`✓ ${id}.mp3  ←  ${text}`);
  made++;
}
const stale = fs.readdirSync(OUT_DIR).filter((name) => name.endsWith('.mp3') && !expected.has(name));
stale.forEach((name) => console.log(`! File không còn dùng (có thể xóa): ${name}`));
if (failed.length) {
  console.log(`Chưa tạo được ${failed.length} file (dịch vụ từ chối) — chạy lại: npm run voice`);
  process.exitCode = 1;
}
console.log(`Xong: tạo ${made} file, tổng ${expected.size} file giọng đọc (${VOICE}).`);

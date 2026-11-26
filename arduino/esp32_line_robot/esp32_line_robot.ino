// Xe ESP32 đo vận tốc bằng vạch đen cách nhau 10 cm (Bài 03 · Vận tốc).
//
// Nguyên lý: cảm biến dò line nhìn xuống sàn. Mỗi lần xe đi từ nền trắng vào một vạch
// đen, ESP32 ghi lại thời điểm (độ chính xác micro giây). Từ vạch thứ 2 trở đi:
//     v = s / t = 0,10 m / (thời điểm vạch này − thời điểm vạch trước)
// Giá trị được tính NGAY tại vạch, đánh số thứ tự và lưu vào bộ đệm; Raspberry Pi đọc
// qua Wi-Fi cục bộ (GET /status?since=<số thứ tự>) nên không bỏ sót lần đo nào.
// Vì thời điểm được đo trên ESP32, độ trễ mạng không làm sai kết quả.
//
// Log qua Wi-Fi: mọi sự kiện (khởi động, Wi-Fi, lệnh, cảm biến, vạch, động cơ) được ghi vào
// bộ đệm trong RAM và in ra Serial. Xem tại http://<IP-xe>/logs, không cần cắm dây UART.
//
// Phần cứng: ESP32 DevKit + L298N (không encoder) + 1 cảm biến hồng ngoại dò line.
// Thông tin Wi-Fi và cảm biến đặt trong robot_config.h (xem README.md).

#include "robot_config.h"
#include "speed_event.h"

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiUdp.h>
#include <Preferences.h>
#include <esp_arduino_version.h>
#include <esp_random.h>
#include <esp_system.h>
#include <esp_timer.h>
#include <stdarg.h>

// ---------- Tham số có thể ghi đè trong robot_config.h ----------
#ifndef LINE_SPACING_M
#define LINE_SPACING_M 0.10f          // Khoảng cách giữa hai vạch đen (m)
#endif
#ifndef LINE_SENSOR_HYSTERESIS
#define LINE_SENSOR_HYSTERESIS 150    // Vùng đệm quanh ngưỡng analog, chống nháy
#endif
#ifndef LINE_SENSOR_FLOOR_MAX
// Với cảm biến "vạch đen cho ADC cao": ADC lớn hơn giá trị này nghĩa là cảm biến không nhìn thấy
// mặt sàn (xe bị nhấc lên, mép bàn), KHÔNG tính là vạch. 0 = tắt.
#define LINE_SENSOR_FLOOR_MAX 0
#endif
#ifndef LINE_CONFIRM_SAMPLES
#define LINE_CONFIRM_SAMPLES 3        // Số mẫu liên tiếp (1 ms/mẫu) để xác nhận vạch đen
#endif
#ifndef WHITE_CONFIRM_SAMPLES
#define WHITE_CONFIRM_SAMPLES 5       // Số mẫu trắng liên tiếp để xác nhận đã ra khỏi vạch
#endif
#ifndef MIN_LINE_INTERVAL_MS
#define MIN_LINE_INTERVAL_MS 40       // Bỏ qua 2 vạch gần nhau hơn (giới hạn ~2,5 m/s)
#endif
#ifndef LINE_TIMEOUT_MS
#define LINE_TIMEOUT_MS 0             // Tự dừng nếu quá lâu không thấy vạch (0 = tắt: chỉ dừng khi bấm Dừng)
#endif
#ifndef MAX_LINES
#define MAX_LINES 0                   // Tự dừng sau N vạch, ví dụ cuối đường đua (0 = tắt)
#endif
#ifndef PWM_MIN
#define PWM_MIN 160                   // PWM lúc bắt đầu chạy (thấp nhất mà xe vẫn lăn được)
#endif
#ifndef PWM_MAX
#define PWM_MAX 255
#endif
#ifndef ACCELERATION_MS
#define ACCELERATION_MS 6000          // Thời gian tăng đều từ PWM_MIN lên PWM_MAX
#endif
#ifndef LOG_CAPACITY
#define LOG_CAPACITY 250              // Số dòng log giữ trong RAM
#endif

// ---------- Chân L298N ----------
constexpr uint8_t PIN_ENB = 5;
constexpr uint8_t PIN_IN4 = 18;
constexpr uint8_t PIN_IN3 = 19;
constexpr uint8_t PIN_IN2 = 21;
constexpr uint8_t PIN_IN1 = 22;
constexpr uint8_t PIN_ENA = 23;

constexpr uint8_t PWM_CHANNEL_A = 0;
constexpr uint8_t PWM_CHANNEL_B = 1;
constexpr uint32_t PWM_FREQUENCY = 2000;
constexpr uint8_t PWM_RESOLUTION = 8;
constexpr uint32_t RAMP_UPDATE_MS = 20;
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint32_t HEARTBEAT_RUNNING_MS = 2000;
constexpr uint32_t HEARTBEAT_IDLE_MS = 15000;
constexpr size_t EVENT_CAPACITY = 64;   // Số lần đo gần nhất giữ lại cho Pi đọc
constexpr size_t LOG_TEXT_LEN = 240;

WebServer httpServer(80);
WiFiUDP pushUdp;
IPAddress pushIp;
uint16_t pushPort = 0;           // 0 = chưa có máy nào đăng ký nhận số đo qua UDP
Preferences prefs;

// ======================================================================
// LOG: bộ đệm vòng trong RAM + Serial. An toàn khi gọi từ nhiều tác vụ.
// ======================================================================
struct LogLine {
  uint32_t seq;
  uint32_t ms;
  char level;           // I thông tin, W cảnh báo, E lỗi, D chi tiết cảm biến
  char text[LOG_TEXT_LEN];
};

LogLine logLines[LOG_CAPACITY];
uint32_t logSeq = 0;
portMUX_TYPE logMux = portMUX_INITIALIZER_UNLOCKED;

// Cắt chuỗi UTF-8 bị vsnprintf cắt dở giữa một ký tự có dấu.
void trimUtf8(char *text) {
  size_t len = strlen(text);
  size_t i = len;
  while (i > 0 && (static_cast<uint8_t>(text[i - 1]) & 0xC0) == 0x80) i--;
  if (i == 0) return;
  const uint8_t lead = static_cast<uint8_t>(text[i - 1]);
  const size_t need = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1;
  if (len - (i - 1) < need) text[i - 1] = '\0';
}

void logf(char level, const char *fmt, ...) {
  char text[LOG_TEXT_LEN];
  va_list args;
  va_start(args, fmt);
  vsnprintf(text, sizeof(text), fmt, args);
  va_end(args);
  trimUtf8(text);
  const uint32_t ms = millis();
  portENTER_CRITICAL(&logMux);
  const uint32_t seq = ++logSeq;
  LogLine &line = logLines[seq % LOG_CAPACITY];
  line.seq = seq;
  line.ms = ms;
  line.level = level;
  memcpy(line.text, text, sizeof(text));
  portEXIT_CRITICAL(&logMux);
  Serial.printf("[%6lu.%03lu] %c %s\n", static_cast<unsigned long>(ms / 1000),
    static_cast<unsigned long>(ms % 1000), level, text);
}

#define LOGI(...) logf('I', __VA_ARGS__)
#define LOGW(...) logf('W', __VA_ARGS__)
#define LOGE(...) logf('E', __VA_ARGS__)
#define LOGD(...) logf('D', __VA_ARGS__)

bool readLogLine(uint32_t seq, LogLine &out) {
  portENTER_CRITICAL(&logMux);
  out = logLines[seq % LOG_CAPACITY];
  portEXIT_CRITICAL(&logMux);
  return out.seq == seq;
}

uint32_t latestLogSeq() {
  portENTER_CRITICAL(&logMux);
  const uint32_t seq = logSeq;
  portEXIT_CRITICAL(&logMux);
  return seq;
}

uint32_t firstLogSeq(uint32_t since, uint32_t newest) {
  uint32_t first = since + 1;
  if (newest >= LOG_CAPACITY && first <= newest - LOG_CAPACITY) first = newest - LOG_CAPACITY + 1;
  return first;
}

// ======================================================================
// Dữ liệu dùng chung giữa tác vụ cảm biến và loop()
// ======================================================================

// Ghi chú từ tác vụ cảm biến gửi sang loop() để ghi log (tác vụ cảm biến không in trực tiếp,
// tránh bị chậm vì Serial).
enum NoteKind : uint8_t { NOTE_BLACK_IDLE, NOTE_LINE_FIRST, NOTE_LINE_TOO_CLOSE, NOTE_LINE_MEASURED, NOTE_WHITE };
struct SensorNote {
  uint8_t kind;
  int raw;
  uint32_t value;       // TOO_CLOSE: khoảng cách ms; WHITE: thời gian trên vạch ms
};

portMUX_TYPE dataMux = portMUX_INITIALIZER_UNLOCKED;
SpeedEvent events[EVENT_CAPACITY];
volatile uint32_t eventSeq = 0;         // Số thứ tự của lần đo mới nhất
volatile bool running = false;
volatile int64_t runStartUs = 0;
volatile int64_t lastLineUs = 0;        // 0 = chưa qua vạch nào trong lần chạy này
volatile uint32_t lineCount = 0;
volatile float lastSpeedMps = 0.0f;
volatile int lastRawReading = 0;
volatile bool sensorOnLine = false;
volatile int rawMin = INT32_MAX;        // Giá trị ADC nhỏ nhất / lớn nhất từ lần log trước
volatile int rawMax = INT32_MIN;
volatile uint32_t glitchCount = 0;      // Số lần thấy đen nhưng chưa đủ mẫu để xác nhận
volatile uint32_t notesDropped = 0;

// Cấu hình cảm biến lúc chạy (chỉnh qua /config, lưu trong bộ nhớ flash NVS).
volatile int sensorThreshold = LINE_SENSOR_THRESHOLD;
volatile int sensorHysteresis = LINE_SENSOR_HYSTERESIS;
volatile int sensorFloorMax = LINE_SENSOR_FLOOR_MAX;   // 0 = tắt
volatile uint32_t noFloorSamples = 0;                  // Số mẫu (ms) không thấy mặt sàn từ lần log trước
#if LINE_SENSOR_ANALOG
volatile bool sensorBlackHigh = !LINE_BLACK_BELOW_THRESHOLD;
#else
volatile bool sensorBlackHigh = !LINE_DIGITAL_BLACK_LOW;
#endif

QueueHandle_t sensorNotes = nullptr;
TaskHandle_t sensorTaskHandle = nullptr;
uint32_t bootId = 0;                    // Đổi mỗi lần ESP32 khởi động lại → Pi biết để đọc lại từ đầu
int64_t runStoppedUs = 0;
bool hasRun = false;
bool rampDoneLogged = false;
// Thông số động cơ lúc chạy (chỉnh qua /motor, lưu trong flash).
int motorPwmMin = PWM_MIN;
int motorPwmMax = PWM_MAX;
int motorAccelMs = ACCELERATION_MS;
uint8_t currentPwm = 0;
uint32_t lastRampAt = 0;
uint32_t lastWifiAttemptAt = 0;
uint32_t lastHeartbeatAt = 0;
uint32_t lastPrintedSeq = 0;
uint32_t wifiDisconnects = 0;
const char *stopReason = "";

// Đọc biến 64 bit dùng chung với tác vụ cảm biến. ESP32 là CPU 32 bit nên phải đọc trong
// vùng găng, tránh tác vụ cảm biến chen vào giữa hai nửa của giá trị.
int64_t readShared(const volatile int64_t &value) {
  portENTER_CRITICAL(&dataMux);
  const int64_t copy = value;
  portEXIT_CRITICAL(&dataMux);
  return copy;
}

// ======================================================================
// Trang web
// ======================================================================
const char DASHBOARD_HTML[] PROGMEM = R"rawliteral(
<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 · Xe đo vận tốc</title><style>
*{box-sizing:border-box}body{margin:0;background:#0c1821;color:#edf4f2;font:16px system-ui,sans-serif}.page{max-width:620px;margin:0 auto;padding:22px 16px}.eyebrow{color:#94c9b5;font-size:12px;font-weight:800;letter-spacing:.12em}.title{margin:5px 0 18px;font-size:26px}.status{display:flex;align-items:center;gap:9px;color:#9bb2b5;font-size:14px}.dot{width:9px;height:9px;border-radius:50%;background:#e2aa58}.dot.on{background:#55d69a;box-shadow:0 0 10px #55d69a}.speed{margin:14px 0 2px;font-size:64px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}.unit{color:#9bb2b5}.actions{display:flex;gap:10px;margin:20px 0}.actions button{min-height:50px;flex:1;border:0;border-radius:10px;font-size:16px;font-weight:800}.start{background:#83d8b1;color:#0a261d}.stop{background:#f07d79;color:#32100f}.reset{background:#2a4450;color:#edf4f2}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:7px 6px;border-bottom:1px solid #263b42;text-align:right}th{color:#9bb2b5;font-size:12px}.hint{margin-top:14px;color:#8ca3a8;font-size:13px;line-height:1.6}a{color:#83d8b1}details{margin-top:16px;padding:10px 12px;border:1px solid #263b42;border-radius:10px}summary{cursor:pointer;font-weight:700}details label{display:block;margin:8px 0;font-size:14px}details input,details select{margin-left:6px;padding:5px;background:#12232c;color:#edf4f2;border:1px solid #35505a;border-radius:6px}details button{padding:7px 14px;border:0;border-radius:8px;background:#83d8b1;color:#0a261d;font-weight:700}
</style><main class="page"><div class="eyebrow">BÀI 03 · ĐO VẬN TỐC</div><h1 class="title">Xe robot qua vạch 10 cm</h1><div class="status"><i id="dot" class="dot"></i><span id="state">Đang kết nối...</span></div><div id="speed" class="speed">0.00</div><div class="unit">m/s · vận tốc tại vạch gần nhất (v = 0,10 m ÷ t)</div><div class="actions"><button class="start" onclick="cmd('start')">Bắt đầu</button><button class="stop" onclick="cmd('stop')">Dừng xe</button><button class="reset" onclick="cmd('reset')">Đặt lại</button></div><table><thead><tr><th>Vạch</th><th>Thời điểm (s)</th><th>t giữa 2 vạch (s)</th><th>v (m/s)</th></tr></thead><tbody id="rows"></tbody></table><p class="hint">Cảm biến: <b id="raw">–</b></p>
<details><summary>Hiệu chuẩn cảm biến</summary><p class="hint">Đặt cảm biến lên nền trắng rồi lên vạch đen, ghi lại hai giá trị ở dòng "Cảm biến" phía trên. Đặt ngưỡng ở giữa hai giá trị.</p><label>Ngưỡng ADC<input id="thr" type="number" min="0" max="4095"></label><label>Vùng đệm ±<input id="hyst" type="number" min="0" max="1000"></label><label>Không thấy mặt sàn khi ADC &gt;<input id="floor" type="number" min="0" max="4095"> (0 = tắt)</label><label>Vạch đen cho giá trị<select id="black"><option value="high">cao hơn ngưỡng</option><option value="low">thấp hơn ngưỡng</option></select></label><button onclick="saveCfg()">Lưu</button> <span id="cfgmsg" class="hint"></span></details>
<details><summary>Tăng tốc của xe</summary><p class="hint">Xe bắt đầu ở PWM thấp rồi tăng đều tới PWM tối đa, giữ nguyên tới khi bấm Dừng.</p><label>PWM lúc bắt đầu<input id="pmin" type="number" min="0" max="255"></label><label>PWM tối đa<input id="pmax" type="number" min="0" max="255"></label><label>Thời gian tăng (ms)<input id="acc" type="number" min="0" max="60000" step="500"></label><button onclick="saveMotor()">Lưu</button> <span id="motormsg" class="hint"></span></details>
<p class="hint"><a href="/logs">Xem log</a> · <a href="/diag">Chẩn đoán (JSON)</a></p></main><script>
let since=0,boot=0,rows=[];
async function cmd(n){try{await fetch('/'+n,{method:'POST'});if(n!=='stop'){rows=[];draw()}}catch(e){}}
function draw(){document.querySelector('#rows').innerHTML=rows.slice(-12).reverse().map(e=>`<tr><td>${e.line}</td><td>${e.t_s.toFixed(3)}</td><td>${e.interval_s.toFixed(3)}</td><td><b>${e.speed_mps.toFixed(3)}</b></td></tr>`).join('')}
async function poll(){try{const r=await fetch('/status?since='+since,{cache:'no-store'});const d=await r.json();if(d.boot_id!==boot){boot=d.boot_id;since=0;rows=[]}for(const e of d.events){rows.push(e);since=e.seq}if(d.events.length)draw();document.querySelector('#speed').textContent=Number(d.speed_mps).toFixed(2);document.querySelector('#raw').textContent=d.sensor_raw+(d.on_line?' (đen)':' (trắng)');document.querySelector('#state').textContent=d.running?`Đang chạy · ${d.line_count} vạch · PWM ${d.pwm}`:`Đã dừng${d.stop_reason?' · '+d.stop_reason:''} · ${d.line_count} vạch`;document.querySelector('#dot').classList.toggle('on',d.running)}catch(e){document.querySelector('#state').textContent='Mất kết nối ESP32';document.querySelector('#dot').classList.remove('on')}}
async function loadCfg(){try{const c=await(await fetch('/config')).json();document.querySelector('#thr').value=c.threshold;document.querySelector('#hyst').value=c.hysteresis;document.querySelector('#floor').value=c.floor_max;document.querySelector('#black').value=c.black}catch(e){}}
async function saveCfg(){const t=document.querySelector('#thr').value,h=document.querySelector('#hyst').value,fl=document.querySelector('#floor').value,b=document.querySelector('#black').value;try{const r=await fetch(`/config?threshold=${t}&hysteresis=${h}&floor=${fl}&black=${b}`);const c=await r.json();document.querySelector('#cfgmsg').textContent=r.ok?'Đã lưu':(c.message||'Lỗi')}catch(e){document.querySelector('#cfgmsg').textContent='Không gửi được'}}
async function loadMotor(){try{const m=await(await fetch('/motor')).json();document.querySelector('#pmin').value=m.pwm_min;document.querySelector('#pmax').value=m.pwm_max;document.querySelector('#acc').value=m.accel_ms}catch(e){}}
async function saveMotor(){const q=s=>document.querySelector(s).value;try{const r=await fetch(`/motor?pwm_min=${q('#pmin')}&pwm_max=${q('#pmax')}&accel_ms=${q('#acc')}`);const m=await r.json();document.querySelector('#motormsg').textContent=r.ok?'Đã lưu':(m.message||'Lỗi')}catch(e){document.querySelector('#motormsg').textContent='Không gửi được'}}
poll();loadCfg();loadMotor();setInterval(poll,300)
</script></html>
)rawliteral";

const char LOGS_HTML[] PROGMEM = R"rawliteral(
<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 · Log</title><style>
body{margin:0;background:#0c1821;color:#dfe9ec;font:13px/1.45 ui-monospace,Consolas,monospace}header{position:sticky;top:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;background:#12232c;border-bottom:1px solid #263b42}header b{font:700 15px system-ui,sans-serif}button,label,a{font:13px system-ui,sans-serif}button{padding:6px 10px;border:1px solid #35505a;border-radius:6px;background:#1a313c;color:#edf4f2;cursor:pointer}a{color:#83d8b1}#diag{width:100%;color:#9bb2b5;font-size:12px}#log{padding:8px 12px;white-space:pre-wrap;word-break:break-word}.W{color:#f3c36f}.E{color:#ff8c87;font-weight:700}.D{color:#7f97a0}
</style><header><b>Log ESP32</b><button id="pause">Tạm dừng</button><label><input type="checkbox" id="debug" checked> Chi tiết cảm biến (D)</label><label><input type="checkbox" id="follow" checked> Tự cuộn</label><button id="save">Tải file log</button><button id="clear">Xóa màn hình</button><button id="reboot">Khởi động lại ESP32</button><a href="/">Bảng điều khiển</a><div id="diag">Đang tải…</div></header><div id="log"></div><script>
let since=0,boot=null,paused=false,all=[];const box=document.querySelector('#log'),$=s=>document.querySelector(s);
const fmt=l=>`#${l.seq} [${(l.ms/1000).toFixed(3)}] ${l.level} ${l.text}`;
function add(l){all.push(l);if(all.length>5000)all.shift();const d=document.createElement('div');d.className=l.level;d.textContent=fmt(l);d.hidden=l.level==='D'&&!$('#debug').checked;box.appendChild(d);while(box.childElementCount>3000)box.firstChild.remove()}
function note(t){add({seq:'-',ms:Date.now()%1e7,level:'W',text:t})}
async function poll(){if(paused)return;try{const d=await(await fetch('/log.json?since='+since,{cache:'no-store'})).json();if(d.boot_id!==boot){if(boot!==null){note('--- ESP32 đã khởi động lại ---');boot=d.boot_id;since=0;return}boot=d.boot_id}if(d.lines.length&&since>0&&d.lines[0].seq>since+1)note(`--- Mất ${d.lines[0].seq-since-1} dòng (bộ đệm đầy) ---`);for(const l of d.lines){add(l);since=l.seq}if(d.lines.length&&$('#follow').checked)window.scrollTo(0,document.body.scrollHeight)}catch(e){}}
async function diag(){try{const d=await(await fetch('/diag',{cache:'no-store'})).json();$('#diag').textContent=`IP ${d.ip} · Wi-Fi "${d.ssid}" ${d.rssi} dBm · chạy ${d.uptime_s} s · khởi động do: ${d.reset_reason} · RAM trống ${d.heap_free} B (thấp nhất ${d.heap_min}) · cảm biến GPIO${d.sensor.pin} ${d.sensor.analog?'analog':'digital'}, ngưỡng ${d.sensor.threshold}, vạch đen ${d.sensor.black==='high'?'cao':'thấp'} · hiện tại ${d.sensor.raw} (${d.sensor.on_line?'đen':'trắng'}) · firmware ${d.build}`}catch(e){$('#diag').textContent='Mất kết nối ESP32'}}
$('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'Tiếp tục':'Tạm dừng'};
$('#debug').onchange=e=>box.querySelectorAll('.D').forEach(d=>d.hidden=!e.target.checked);
$('#clear').onclick=()=>{box.innerHTML=''};
$('#save').onclick=()=>{const b=new Blob([all.map(fmt).join('\n')+'\n'],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='esp32-log-'+new Date().toISOString().replace(/[:.]/g,'-')+'.txt';a.click()};
$('#reboot').onclick=async()=>{if(confirm('Khởi động lại ESP32?')){try{await fetch('/reboot',{method:'POST'})}catch(e){}note('--- Đã gửi lệnh khởi động lại ---')}};
poll();diag();setInterval(poll,1000);setInterval(diag,3000)
</script></html>
)rawliteral";

// ======================================================================
// Cảm biến
// ======================================================================
int readSensorRaw() {
#if LINE_SENSOR_ANALOG
  return analogRead(LINE_SENSOR_PIN);
#else
  return digitalRead(LINE_SENSOR_PIN);
#endif
}

// Trả về 1 = chắc chắn đen, 0 = chắc chắn trắng, -1 = đang ở vùng đệm (giữ trạng thái cũ).
bool readingHasNoFloor(int raw) {
#if LINE_SENSOR_ANALOG
  const int floorMax = sensorFloorMax;
  return sensorBlackHigh && floorMax > 0 && raw > floorMax;
#else
  return false;
#endif
}

int classifyReading(int raw) {
#if LINE_SENSOR_ANALOG
  // Không thấy mặt sàn (nhấc xe, mép bàn): coi như trắng để không đếm thành vạch.
  if (readingHasNoFloor(raw)) return 0;
  const int threshold = sensorThreshold;
  const int hysteresis = sensorHysteresis;
  const bool high = raw > threshold + hysteresis;
  const bool low = raw < threshold - hysteresis;
  if (!high && !low) return -1;
  return (high == sensorBlackHigh) ? 1 : 0;
#else
  return ((raw == HIGH) == sensorBlackHigh) ? 1 : 0;
#endif
}

void pushNote(uint8_t kind, int raw, uint32_t value) {
  const SensorNote note{kind, raw, value};
  if (xQueueSend(sensorNotes, &note, 0) != pdTRUE) notesDropped = notesDropped + 1;
}

// Gọi khi đã xác nhận xe vừa vào một vạch đen; edgeUs là thời điểm mẫu đen ĐẦU TIÊN.
uint8_t recordLine(int64_t edgeUs, uint32_t &intervalMs) {  // trả về NoteKind
  portENTER_CRITICAL(&dataMux);
  if (!running) {
    portEXIT_CRITICAL(&dataMux);
    return NOTE_BLACK_IDLE;
  }
  const int64_t previous = lastLineUs;
  if (previous != 0 && edgeUs - previous < static_cast<int64_t>(MIN_LINE_INTERVAL_MS) * 1000) {
    portEXIT_CRITICAL(&dataMux);
    intervalMs = static_cast<uint32_t>((edgeUs - previous) / 1000);
    return NOTE_LINE_TOO_CLOSE;
  }
  lineCount = lineCount + 1;
  lastLineUs = edgeUs;
  if (previous == 0) {
    portEXIT_CRITICAL(&dataMux);
    return NOTE_LINE_FIRST;
  }
  const uint32_t intervalUs = static_cast<uint32_t>(edgeUs - previous);
  const float speed = LINE_SPACING_M / (intervalUs / 1000000.0f);
  const uint32_t seq = eventSeq + 1;
  SpeedEvent &event = events[seq % EVENT_CAPACITY];
  event.seq = seq;
  event.line = lineCount;
  event.atMs = static_cast<uint32_t>((edgeUs - runStartUs) / 1000);
  event.intervalUs = intervalUs;
  event.speedMps = speed;
  lastSpeedMps = speed;
  eventSeq = seq;
  portEXIT_CRITICAL(&dataMux);
  return NOTE_LINE_MEASURED;
}

// Tác vụ riêng đọc cảm biến mỗi 1 ms, ưu tiên cao hơn loop() nên không bị web server làm trễ.
void sensorTask(void *) {
  bool onLine = false;
  int streak = 0;
  int64_t firstBlackUs = 0;
  int64_t enteredLineUs = 0;
  TickType_t wake = xTaskGetTickCount();
  for (;;) {
    vTaskDelayUntil(&wake, pdMS_TO_TICKS(1));
    const int raw = readSensorRaw();
    lastRawReading = raw;
    if (raw < rawMin) rawMin = raw;
    if (raw > rawMax) rawMax = raw;
    if (readingHasNoFloor(raw)) noFloorSamples = noFloorSamples + 1;
    const int reading = classifyReading(raw);
    const int64_t nowUs = esp_timer_get_time();
    if (!onLine) {
      if (reading == 1) {
        if (streak == 0) firstBlackUs = nowUs;
        if (++streak >= LINE_CONFIRM_SAMPLES) {
          onLine = true;
          sensorOnLine = true;
          streak = 0;
          enteredLineUs = firstBlackUs;
          uint32_t intervalMs = 0;
          const uint8_t kind = recordLine(firstBlackUs, intervalMs);
          pushNote(kind, raw, intervalMs);
        }
      } else if (reading == 0) {
        if (streak > 0) glitchCount = glitchCount + 1;
        streak = 0;
      }
    } else {
      if (reading == 0) {
        if (++streak >= WHITE_CONFIRM_SAMPLES) {
          onLine = false;
          sensorOnLine = false;
          streak = 0;
          pushNote(NOTE_WHITE, raw, static_cast<uint32_t>((nowUs - enteredLineUs) / 1000));
        }
      } else if (reading == 1) {
        streak = 0;
      }
    }
  }
}

// ======================================================================
// Động cơ
// ======================================================================
void writeMotorPwm(uint8_t left, uint8_t right) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(PIN_ENA, left);
  ledcWrite(PIN_ENB, right);
#else
  ledcWrite(PWM_CHANNEL_A, left);
  ledcWrite(PWM_CHANNEL_B, right);
#endif
}

void stopMotors() {
  writeMotorPwm(0, 0);
  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);
  digitalWrite(PIN_IN4, LOW);
  currentPwm = 0;
}

void driveForward(uint8_t pwm) {
  // OUT1/OUT3 nối dây đỏ động cơ; OUT2/OUT4 nối dây đen.
  digitalWrite(PIN_IN1, HIGH);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, HIGH);
  digitalWrite(PIN_IN4, LOW);
  writeMotorPwm(pwm, pwm);
  currentPwm = pwm;
}

// ======================================================================
// Điều khiển lần chạy
// ======================================================================
uint32_t elapsedRunMs() {
  if (!hasRun) return 0;
  const int64_t end = running ? esp_timer_get_time() : runStoppedUs;
  return static_cast<uint32_t>((end - readShared(runStartUs)) / 1000);
}

void startRun(const char *source) {
  if (running) {
    LOGW("Lệnh Bắt đầu (%s) bị bỏ qua: xe đang chạy", source);
    return;
  }
  portENTER_CRITICAL(&dataMux);
  runStartUs = esp_timer_get_time();
  lastLineUs = 0;
  lineCount = 0;
  lastSpeedMps = 0.0f;
  running = true;
  portEXIT_CRITICAL(&dataMux);
  hasRun = true;
  rampDoneLogged = false;
  stopReason = "";
  lastRampAt = millis();
  lastHeartbeatAt = 0;
  driveForward(motorPwmMin);
  LOGI("Bắt đầu chạy (%s): PWM %d tăng đều lên %d trong %.1f s, cảm biến đang thấy %s (ADC=%d)", source,
    motorPwmMin, motorPwmMax, motorAccelMs / 1000.0f,
    sensorOnLine ? "đen" : "trắng", lastRawReading);
}

void stopRun(const char *reason) {
  if (!running) return;
  portENTER_CRITICAL(&dataMux);
  running = false;
  portEXIT_CRITICAL(&dataMux);
  runStoppedUs = esp_timer_get_time();
  stopMotors();
  stopReason = reason;
  LOGI("Dừng xe: %s. Đã qua %lu vạch (%.2f m) trong %.2f s", reason,
    static_cast<unsigned long>(lineCount), lineCount * LINE_SPACING_M, elapsedRunMs() / 1000.0f);
}

void resetRun() {
  stopRun("đặt lại");
  portENTER_CRITICAL(&dataMux);
  lineCount = 0;
  lastLineUs = 0;
  lastSpeedMps = 0.0f;
  portEXIT_CRITICAL(&dataMux);
  hasRun = false;
  stopReason = "";
  LOGI("Đặt lại: xóa số vạch");
}

void updateMotorRamp(uint32_t now) {
  if (!running || now - lastRampAt < RAMP_UPDATE_MS) return;
  lastRampAt = now;
  const uint32_t elapsed = elapsedRunMs();
  // Nhanh dần đều: PWM tăng tuyến tính theo thời gian từ mức thấp lên mức tối đa.
  const float progress = motorAccelMs > 0 ? min(1.0f, elapsed / static_cast<float>(motorAccelMs)) : 1.0f;
  const uint8_t pwm = static_cast<uint8_t>(motorPwmMin + (motorPwmMax - motorPwmMin) * progress + 0.5f);
  if (pwm != currentPwm) driveForward(pwm);
  if (progress >= 1.0f && !rampDoneLogged) {
    rampDoneLogged = true;
    LOGI("Động cơ đạt PWM tối đa %d sau %.2f s, giữ tốc độ này tới khi bấm Dừng", motorPwmMax, elapsed / 1000.0f);
  }
}

// Dừng an toàn khi xe chạy hết đường đua hoặc lệch khỏi vạch.
void checkAutoStop() {
  if (!running) return;
  if (MAX_LINES > 0 && lineCount >= MAX_LINES) {
    stopRun("đủ số vạch");
    return;
  }
  if (LINE_TIMEOUT_MS > 0) {
    const int64_t lastLine = readShared(lastLineUs);
    const int64_t reference = lastLine != 0 ? lastLine : readShared(runStartUs);
    if (esp_timer_get_time() - reference > static_cast<int64_t>(LINE_TIMEOUT_MS) * 1000) {
      if (lastLine == 0) {
        LOGW("Chạy %d ms mà chưa thấy vạch nào. Kiểm tra ngưỡng cảm biến và chiều đen/trắng (ADC gần nhất=%d)",
          LINE_TIMEOUT_MS, lastRawReading);
      }
      stopRun("không thấy vạch");
    }
  }
}

// ======================================================================
// Ghi log từ dữ liệu của tác vụ cảm biến
// ======================================================================
void drainSensorNotes() {
  SensorNote note;
  while (xQueueReceive(sensorNotes, &note, 0) == pdTRUE) {
    switch (note.kind) {
      case NOTE_BLACK_IDLE: LOGD("Thấy vạch đen (xe đang dừng), ADC=%d", note.raw); break;
      case NOTE_LINE_FIRST: LOGI("Vạch 1: bắt đầu tính giờ, ADC=%d", note.raw); break;
      case NOTE_LINE_TOO_CLOSE:
        LOGW("Bỏ qua vạch: chỉ cách vạch trước %lu ms (nhỏ hơn %d ms), ADC=%d",
          static_cast<unsigned long>(note.value), MIN_LINE_INTERVAL_MS, note.raw);
        break;
      case NOTE_LINE_MEASURED: LOGD("Vào vạch, ADC=%d", note.raw); break;
      case NOTE_WHITE: LOGD("Ra khỏi vạch sau %lu ms, ADC=%d", static_cast<unsigned long>(note.value), note.raw); break;
    }
  }
  const uint32_t dropped = notesDropped;
  if (dropped) {
    notesDropped = 0;
    LOGW("Mất %lu ghi chú cảm biến (hàng đợi đầy)", static_cast<unsigned long>(dropped));
  }
}

// Gửi ngay số đo tới máy đã đăng ký (Raspberry Pi) qua UDP; Pi vẫn hỏi /status để lấy bù nếu mất gói.
void pushSpeedEvent(const SpeedEvent &event) {
  if (pushPort == 0 || WiFi.status() != WL_CONNECTED) return;
  char buffer[200];
  const int len = snprintf(buffer, sizeof(buffer),
    "{\"type\":\"speed_event\",\"boot_id\":%lu,\"seq\":%lu,\"line\":%lu,\"t_s\":%.3f,\"interval_s\":%.4f,\"speed_mps\":%.4f,\"speed_kmh\":%.3f}",
    static_cast<unsigned long>(bootId), static_cast<unsigned long>(event.seq), static_cast<unsigned long>(event.line),
    event.atMs / 1000.0f, event.intervalUs / 1000000.0f, event.speedMps, event.speedMps * 3.6f);
  if (!pushUdp.beginPacket(pushIp, pushPort) || pushUdp.write(reinterpret_cast<const uint8_t *>(buffer), len) != static_cast<size_t>(len) || !pushUdp.endPacket()) {
    LOGW("Không gửi được UDP tới %s:%u", pushIp.toString().c_str(), pushPort);
  }
}

void logNewSpeedEvents() {
  while (lastPrintedSeq < eventSeq) {
    if (eventSeq - lastPrintedSeq > EVENT_CAPACITY) lastPrintedSeq = eventSeq - EVENT_CAPACITY;
    portENTER_CRITICAL(&dataMux);
    const SpeedEvent event = events[(lastPrintedSeq + 1) % EVENT_CAPACITY];
    portEXIT_CRITICAL(&dataMux);
    lastPrintedSeq = event.seq;
    pushSpeedEvent(event);
    LOGI("Vạch %lu: t=%.3f s, Δt=%.4f s, v=%.3f m/s", static_cast<unsigned long>(event.line),
      event.atMs / 1000.0f, event.intervalUs / 1000000.0f, event.speedMps);
  }
}

// Tóm tắt định kỳ: 2 s khi xe chạy, 15 s khi đứng yên.
void heartbeat(uint32_t now) {
  const uint32_t period = running ? HEARTBEAT_RUNNING_MS : HEARTBEAT_IDLE_MS;
  if (lastHeartbeatAt != 0 && now - lastHeartbeatAt < period) return;
  lastHeartbeatAt = now;
  const int minRaw = rawMin, maxRaw = rawMax;
  rawMin = INT32_MAX;
  rawMax = INT32_MIN;
  const uint32_t glitches = glitchCount;
  glitchCount = 0;
  const uint32_t noFloor = noFloorSamples;
  noFloorSamples = 0;
  if (noFloor > 0) {
    LOGW("Cảm biến không thấy mặt sàn trong %lu ms (ADC > %d): xe bị nhấc lên hoặc ra ngoài mép bàn, không tính là vạch",
      static_cast<unsigned long>(noFloor), static_cast<int>(sensorFloorMax));
  }
  LOGI("%s: %lu vạch, PWM %u, ADC %d–%d, nhiễu %lu, Wi-Fi %d dBm, RAM trống %u B",
    running ? "Đang chạy" : "Đứng yên", static_cast<unsigned long>(lineCount), currentPwm,
    minRaw == INT32_MAX ? -1 : minRaw, maxRaw == INT32_MIN ? -1 : maxRaw,
    static_cast<unsigned long>(glitches), WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0,
    static_cast<unsigned>(ESP.getFreeHeap()));
}

// ======================================================================
// Thông tin chẩn đoán
// ======================================================================
const char *resetReasonText(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "bật nguồn";
    case ESP_RST_EXT: return "chân reset";
    case ESP_RST_SW: return "khởi động lại bằng phần mềm";
    case ESP_RST_PANIC: return "lỗi chương trình (panic)";
    case ESP_RST_INT_WDT: return "watchdog ngắt";
    case ESP_RST_TASK_WDT: return "watchdog tác vụ";
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_DEEPSLEEP: return "thức dậy từ deep sleep";
    case ESP_RST_BROWNOUT: return "sụt áp (brownout)";
    default: return "không rõ";
  }
}

const char *wifiReasonText(uint8_t reason) {
  switch (reason) {
    case 2: return "hết hạn xác thực";
    case 8: return "chủ động ngắt";
    case 15: return "bắt tay 4 bước hết giờ (sai mật khẩu?)";
    case 200: return "mất tín hiệu từ router";
    case 201: return "không tìm thấy mạng (sai tên hoặc ngoài vùng phủ sóng)";
    case 202: return "xác thực thất bại (sai mật khẩu?)";
    case 203: return "liên kết thất bại";
    case 204: return "bắt tay hết giờ (sai mật khẩu?)";
    case 205: return "kết nối thất bại";
    default: return "lý do khác";
  }
}

void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  static uint8_t lastReason = 0;
  static uint32_t lastLoggedAt = 0;
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      LOGI("Wi-Fi: đã liên kết với \"%s\"", WIFI_SSID);
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      LOGI("Wi-Fi: nhận IP %s, tín hiệu %d dBm. Log: http://%s/logs", WiFi.localIP().toString().c_str(),
        WiFi.RSSI(), WiFi.localIP().toString().c_str());
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
      wifiDisconnects++;
      const uint8_t reason = info.wifi_sta_disconnected.reason;
      // Router không có thì sự kiện này lặp liên tục: chỉ ghi khi đổi lý do hoặc sau 30 s.
      if (reason != lastReason || millis() - lastLoggedAt > 30000) {
        LOGW("Wi-Fi: mất kết nối, mã %u: %s", reason, wifiReasonText(reason));
        lastReason = reason;
        lastLoggedAt = millis();
      }
      break;
    }
    default:
      break;
  }
}

String jsonEscape(const char *text) {
  String out;
  out.reserve(strlen(text) + 8);
  for (const char *p = text; *p; p++) {
    const char c = *p;
    if (c == '"' || c == '\\') { out += '\\'; out += c; }
    else if (static_cast<uint8_t>(c) < 0x20) { char buf[8]; snprintf(buf, sizeof(buf), "\\u%04x", c); out += buf; }
    else out += c;
  }
  return out;
}

String makeDiag() {
  const int raw = lastRawReading;
  char buffer[900];
  snprintf(buffer, sizeof(buffer),
    "{\"boot_id\":%lu,\"build\":\"%s %s\",\"uptime_s\":%lu,\"reset_reason\":\"%s\",\"heap_free\":%u,\"heap_min\":%u,"
    "\"ip\":\"%s\",\"ssid\":\"%s\",\"wifi_connected\":%s,\"rssi\":%d,\"wifi_disconnects\":%lu,"
    "\"sensor\":{\"pin\":%d,\"analog\":%s,\"threshold\":%d,\"hysteresis\":%d,\"floor_max\":%d,\"black\":\"%s\",\"raw\":%d,\"on_line\":%s},"
    "\"sensor_task_stack_free\":%u,\"running\":%s,\"pwm\":%u,\"line_count\":%lu,\"speed_seq\":%lu,\"log_seq\":%lu}",
    static_cast<unsigned long>(bootId), __DATE__, __TIME__, static_cast<unsigned long>(millis() / 1000),
    resetReasonText(esp_reset_reason()), static_cast<unsigned>(ESP.getFreeHeap()), static_cast<unsigned>(ESP.getMinFreeHeap()),
    WiFi.localIP().toString().c_str(), WIFI_SSID, WiFi.status() == WL_CONNECTED ? "true" : "false",
    WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0, static_cast<unsigned long>(wifiDisconnects),
    LINE_SENSOR_PIN, LINE_SENSOR_ANALOG ? "true" : "false", static_cast<int>(sensorThreshold), static_cast<int>(sensorHysteresis), static_cast<int>(sensorFloorMax),
    sensorBlackHigh ? "high" : "low", raw, classifyReading(raw) == 1 ? "true" : "false",
    sensorTaskHandle ? static_cast<unsigned>(uxTaskGetStackHighWaterMark(sensorTaskHandle)) : 0u,
    running ? "true" : "false", currentPwm, static_cast<unsigned long>(lineCount),
    static_cast<unsigned long>(eventSeq), static_cast<unsigned long>(latestLogSeq()));
  return String(buffer);
}

// ======================================================================
// HTTP
// ======================================================================
// JSON trạng thái + các lần đo có seq > since. Trường cũ (value km/h, distance_m, …) giữ nguyên
// để tương thích; value là vận tốc tại vạch gần nhất.
String makeStatus(uint32_t since) {
  portENTER_CRITICAL(&dataMux);
  const uint32_t newest = eventSeq;
  const uint32_t lines = lineCount;
  const float speed = lastSpeedMps;
  const bool isRunning = running;
  portEXIT_CRITICAL(&dataMux);
  const int raw = lastRawReading;
  const bool onLine = classifyReading(raw) == 1;

  String json;
  json.reserve(700 + EVENT_CAPACITY * 120);
  char buffer[220];
  snprintf(buffer, sizeof(buffer),
    "{\"type\":\"speed\",\"boot_id\":%lu,\"seq\":%lu,\"value\":%.3f,\"unit\":\"km/h\",\"speed_mps\":%.4f,"
    "\"segment_speed_mps\":%.4f,\"distance_m\":%.2f,",
    static_cast<unsigned long>(bootId), static_cast<unsigned long>(newest), speed * 3.6f, speed, speed,
    lines * LINE_SPACING_M);
  json += buffer;
  snprintf(buffer, sizeof(buffer),
    "\"line_count\":%lu,\"line_spacing_m\":%.3f,\"elapsed_s\":%.2f,\"pwm\":%u,\"running\":%s,"
    "\"stop_reason\":\"%s\",\"sensor_raw\":%d,\"on_line\":%s,\"log_seq\":%lu,\"events\":[",
    static_cast<unsigned long>(lines), LINE_SPACING_M, elapsedRunMs() / 1000.0f, currentPwm,
    isRunning ? "true" : "false", stopReason, raw, onLine ? "true" : "false",
    static_cast<unsigned long>(latestLogSeq()));
  json += buffer;

  uint32_t first = since + 1;
  if (newest >= EVENT_CAPACITY && first <= newest - EVENT_CAPACITY) first = newest - EVENT_CAPACITY + 1;
  bool comma = false;
  for (uint32_t seq = first; seq <= newest && newest > 0; seq++) {
    portENTER_CRITICAL(&dataMux);
    const SpeedEvent event = events[seq % EVENT_CAPACITY];
    portEXIT_CRITICAL(&dataMux);
    if (event.seq != seq) continue;
    snprintf(buffer, sizeof(buffer),
      "%s{\"seq\":%lu,\"line\":%lu,\"t_s\":%.3f,\"interval_s\":%.4f,\"speed_mps\":%.4f,\"speed_kmh\":%.3f}",
      comma ? "," : "", static_cast<unsigned long>(event.seq), static_cast<unsigned long>(event.line),
      event.atMs / 1000.0f, event.intervalUs / 1000000.0f, event.speedMps, event.speedMps * 3.6f);
    json += buffer;
    comma = true;
  }
  json += "]}";
  return json;
}

uint32_t argSince() {
  return httpServer.hasArg("since") ? strtoul(httpServer.arg("since").c_str(), nullptr, 10) : 0;
}

String clientIp() {
  return httpServer.client().remoteIP().toString();
}

void addCors() {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  httpServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  httpServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  httpServer.sendHeader("Cache-Control", "no-store");
}

void sendJsonResponse(int status, const String &payload) {
  addCors();
  httpServer.send(status, "application/json; charset=utf-8", payload);
}

void sendCommandResponse(int status, const char *message) {
  sendJsonResponse(status, String("{\"ok\":") + (status == 200 ? "true" : "false") + ",\"message\":\"" + message + "\"}");
}

void sendNoContent() {
  addCors();
  httpServer.send(204);
}

// /log: văn bản thuần, mỗi dòng "#seq [giây] mức nội dung"; /log.json: cho trang /logs.
void handleLogText() {
  const uint32_t newest = latestLogSeq();
  String out;
  out.reserve(8192);
  LogLine line;
  char head[40];
  for (uint32_t seq = firstLogSeq(argSince(), newest); seq <= newest && newest > 0; seq++) {
    if (!readLogLine(seq, line)) continue;
    snprintf(head, sizeof(head), "#%lu [%lu.%03lu] %c ", static_cast<unsigned long>(line.seq),
      static_cast<unsigned long>(line.ms / 1000), static_cast<unsigned long>(line.ms % 1000), line.level);
    out += head;
    out += line.text;
    out += '\n';
  }
  addCors();
  httpServer.send(200, "text/plain; charset=utf-8", out);
}

void handleLogJson() {
  const uint32_t newest = latestLogSeq();
  String out;
  out.reserve(8192);
  char head[80];
  snprintf(head, sizeof(head), "{\"boot_id\":%lu,\"seq\":%lu,\"lines\":[", static_cast<unsigned long>(bootId),
    static_cast<unsigned long>(newest));
  out += head;
  LogLine line;
  bool comma = false;
  for (uint32_t seq = firstLogSeq(argSince(), newest); seq <= newest && newest > 0; seq++) {
    if (!readLogLine(seq, line)) continue;
    snprintf(head, sizeof(head), "%s{\"seq\":%lu,\"ms\":%lu,\"level\":\"%c\",\"text\":\"", comma ? "," : "",
      static_cast<unsigned long>(line.seq), static_cast<unsigned long>(line.ms), line.level);
    out += head;
    out += jsonEscape(line.text);
    out += "\"}";
    comma = true;
  }
  out += "]}";
  sendJsonResponse(200, out);
}

String configJson() {
  char buffer[240];
  snprintf(buffer, sizeof(buffer),
    "{\"pin\":%d,\"analog\":%s,\"threshold\":%d,\"hysteresis\":%d,\"floor_max\":%d,\"black\":\"%s\"}",
    LINE_SENSOR_PIN, LINE_SENSOR_ANALOG ? "true" : "false", static_cast<int>(sensorThreshold),
    static_cast<int>(sensorHysteresis), static_cast<int>(sensorFloorMax), sensorBlackHigh ? "high" : "low");
  return String(buffer);
}

bool readIntArg(const char *name, int minValue, int maxValue, int &value) {
  if (!httpServer.hasArg(name)) return true;
  value = httpServer.arg(name).toInt();
  if (value >= minValue && value <= maxValue) return true;
  char message[80];
  snprintf(message, sizeof(message), "%s phải trong khoảng %d–%d", name, minValue, maxValue);
  sendCommandResponse(400, message);
  return false;
}

// /config?threshold=240&hysteresis=20&floor=1500&black=high|low: đổi cấu hình cảm biến, lưu vào flash.
void handleConfig() {
  const bool hasThreshold = httpServer.hasArg("threshold");
  const bool hasBlack = httpServer.hasArg("black");
  if (hasThreshold || hasBlack || httpServer.hasArg("hysteresis") || httpServer.hasArg("floor")) {
    int threshold = sensorThreshold;
    int hysteresis = sensorHysteresis;
    int floorMax = sensorFloorMax;
    bool blackHigh = sensorBlackHigh;
    if (!readIntArg("threshold", 0, 4095, threshold)) return;
    if (!readIntArg("hysteresis", 0, 1000, hysteresis)) return;
    if (!readIntArg("floor", 0, 4095, floorMax)) return;
    if (hasBlack) {
      const String black = httpServer.arg("black");
      if (black != "high" && black != "low") {
        sendCommandResponse(400, "black phải là high hoặc low");
        return;
      }
      blackHigh = black == "high";
    }
    if (blackHigh && floorMax > 0 && floorMax <= threshold + hysteresis) {
      sendCommandResponse(400, "floor phải lớn hơn threshold + hysteresis");
      return;
    }
    sensorThreshold = threshold;
    sensorHysteresis = hysteresis;
    sensorFloorMax = floorMax;
    sensorBlackHigh = blackHigh;
    prefs.putInt("thr", threshold);
    prefs.putInt("hyst", hysteresis);
    prefs.putInt("floor", floorMax);
    prefs.putBool("blackHigh", blackHigh);
    prefs.putInt("pin", LINE_SENSOR_PIN);
    prefs.putBool("analog", LINE_SENSOR_ANALOG);
    LOGI("Đổi cấu hình cảm biến (%s): ngưỡng %d ± %d, vạch đen %s ngưỡng, không thấy mặt sàn khi ADC > %d",
      clientIp().c_str(), threshold, hysteresis, blackHigh ? "cao hơn" : "thấp hơn", floorMax);
  }
  sendJsonResponse(200, configJson());
}

String motorJson() {
  char buffer[120];
  snprintf(buffer, sizeof(buffer), "{\"pwm_min\":%d,\"pwm_max\":%d,\"accel_ms\":%d}", motorPwmMin, motorPwmMax, motorAccelMs);
  return String(buffer);
}

// /motor?pwm_min=160&pwm_max=255&accel_ms=6000: PWM lúc bắt đầu, PWM tối đa, thời gian tăng đều.
void handleMotor() {
  if (httpServer.hasArg("pwm_min") || httpServer.hasArg("pwm_max") || httpServer.hasArg("accel_ms")) {
    int pwmMin = motorPwmMin, pwmMax = motorPwmMax, accelMs = motorAccelMs;
    if (!readIntArg("pwm_min", 0, 255, pwmMin)) return;
    if (!readIntArg("pwm_max", 0, 255, pwmMax)) return;
    if (!readIntArg("accel_ms", 0, 60000, accelMs)) return;
    if (pwmMin > pwmMax) {
      sendCommandResponse(400, "pwm_min phải nhỏ hơn hoặc bằng pwm_max");
      return;
    }
    motorPwmMin = pwmMin;
    motorPwmMax = pwmMax;
    motorAccelMs = accelMs;
    prefs.putInt("pwmMin", pwmMin);
    prefs.putInt("pwmMax", pwmMax);
    prefs.putInt("accelMs", accelMs);
    LOGI("Đổi thông số động cơ (%s): PWM %d → %d trong %.1f s", clientIp().c_str(), pwmMin, pwmMax, accelMs / 1000.0f);
  }
  sendJsonResponse(200, motorJson());
}

void setupHttp() {
  httpServer.on("/", HTTP_GET, []() { httpServer.send_P(200, "text/html; charset=utf-8", DASHBOARD_HTML); });
  httpServer.on("/logs", HTTP_GET, []() { httpServer.send_P(200, "text/html; charset=utf-8", LOGS_HTML); });
  auto startHandler = []() {
    startRun(("HTTP " + clientIp()).c_str());
    sendCommandResponse(200, "started");
  };
  auto stopHandler = []() {
    LOGI("Lệnh Dừng từ %s", clientIp().c_str());
    stopRun("lệnh dừng");
    sendCommandResponse(200, "stopped");
  };
  auto resetHandler = []() {
    LOGI("Lệnh Đặt lại từ %s", clientIp().c_str());
    resetRun();
    sendCommandResponse(200, "reset");
  };
  auto statusHandler = []() {
    if (httpServer.hasArg("udp")) {
      const long port = httpServer.arg("udp").toInt();
      const IPAddress ip = httpServer.client().remoteIP();
      if (port >= 1024 && port <= 65535 && (ip != pushIp || port != pushPort)) {
        pushIp = ip;
        pushPort = static_cast<uint16_t>(port);
        LOGI("Gửi ngay số đo vận tốc qua UDP tới %s:%u", ip.toString().c_str(), pushPort);
      }
    }
    sendJsonResponse(200, makeStatus(argSince()));
  };
  auto optionsHandler = []() { sendNoContent(); };
  httpServer.on("/start", HTTP_GET, startHandler);
  httpServer.on("/start", HTTP_POST, startHandler);
  httpServer.on("/stop", HTTP_GET, stopHandler);
  httpServer.on("/stop", HTTP_POST, stopHandler);
  httpServer.on("/reset", HTTP_POST, resetHandler);
  httpServer.on("/status", HTTP_GET, statusHandler);
  httpServer.on("/api/speed", HTTP_GET, statusHandler);
  httpServer.on("/log", HTTP_GET, handleLogText);
  httpServer.on("/log.json", HTTP_GET, handleLogJson);
  httpServer.on("/diag", HTTP_GET, []() { sendJsonResponse(200, makeDiag()); });
  httpServer.on("/config", HTTP_GET, handleConfig);
  httpServer.on("/motor", HTTP_GET, handleMotor);
  httpServer.on("/reboot", HTTP_POST, []() {
    LOGW("Khởi động lại theo lệnh từ %s", clientIp().c_str());
    sendCommandResponse(200, "rebooting");
    delay(300);
    ESP.restart();
  });
  for (const char *path : {"/start", "/stop", "/reset", "/status", "/api/speed", "/log", "/log.json", "/diag", "/config", "/motor", "/reboot"}) {
    httpServer.on(path, HTTP_OPTIONS, optionsHandler);
  }
  httpServer.on("/command", HTTP_POST, []() {
    String command = httpServer.arg("plain");
    command.trim();
    command.toLowerCase();
    command.replace(" ", "");
    if (command == "start" || command.indexOf("\"cmd\":\"start\"") >= 0) startRun(("HTTP " + clientIp()).c_str());
    else if (command == "stop" || command.indexOf("\"cmd\":\"stop\"") >= 0) stopRun("lệnh dừng");
    else if (command == "reset" || command.indexOf("\"cmd\":\"reset\"") >= 0) resetRun();
    else {
      LOGW("Lệnh /command không hợp lệ từ %s: %s", clientIp().c_str(), command.c_str());
      sendCommandResponse(400, "use start, stop or reset");
      return;
    }
    sendCommandResponse(200, "accepted");
  });
  httpServer.on("/command", HTTP_OPTIONS, optionsHandler);
  httpServer.onNotFound([]() {
    LOGW("HTTP 404: %s từ %s", httpServer.uri().c_str(), clientIp().c_str());
    sendCommandResponse(404, "not found");
  });
  httpServer.begin();
  LOGI("HTTP server chạy ở cổng 80");
}

void maintainWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) return;
  if (running) stopRun("mất Wi-Fi");
  if (now - lastWifiAttemptAt < WIFI_RETRY_MS) return;
  lastWifiAttemptAt = now;
  LOGW("Wi-Fi: thử kết nối lại \"%s\"", WIFI_SSID);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loadSensorConfig() {
  prefs.begin("robot", false);
  motorPwmMin = prefs.getInt("pwmMin", PWM_MIN);
  motorPwmMax = prefs.getInt("pwmMax", PWM_MAX);
  motorAccelMs = prefs.getInt("accelMs", ACCELERATION_MS);
  LOGI("Động cơ: PWM %d tăng đều lên %d trong %.1f s; chỉ dừng khi có lệnh Dừng", motorPwmMin, motorPwmMax, motorAccelMs / 1000.0f);
  // Chỉ dùng cấu hình đã lưu nếu cùng chân và cùng kiểu đọc (đổi dây thì quay về mặc định).
  if (prefs.isKey("thr") && prefs.getInt("pin", -1) == LINE_SENSOR_PIN && prefs.getBool("analog", !LINE_SENSOR_ANALOG) == LINE_SENSOR_ANALOG) {
    sensorThreshold = prefs.getInt("thr", LINE_SENSOR_THRESHOLD);
    sensorHysteresis = prefs.getInt("hyst", LINE_SENSOR_HYSTERESIS);
    sensorFloorMax = prefs.getInt("floor", LINE_SENSOR_FLOOR_MAX);
    sensorBlackHigh = prefs.getBool("blackHigh", sensorBlackHigh);
    LOGI("Cảm biến: dùng cấu hình đã lưu trong flash");
  }
}

void setup() {
  Serial.begin(115200);
  bootId = esp_random() & 0x7fffffff;
  const esp_reset_reason_t reason = esp_reset_reason();
  LOGI("Khởi động firmware %s %s, lý do: %s", __DATE__, __TIME__, resetReasonText(reason));
  if (reason == ESP_RST_BROWNOUT) {
    LOGE("ESP32 vừa khởi động lại do SỤT ÁP. Kiểm tra pin và nguồn; động cơ có thể kéo sụt nguồn của ESP32");
  } else if (reason == ESP_RST_PANIC || reason == ESP_RST_TASK_WDT || reason == ESP_RST_INT_WDT || reason == ESP_RST_WDT) {
    LOGE("ESP32 vừa khởi động lại do lỗi (%s)", resetReasonText(reason));
  }

  pinMode(PIN_IN1, OUTPUT);
  pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_IN3, OUTPUT);
  pinMode(PIN_IN4, OUTPUT);
  pinMode(LINE_SENSOR_PIN, INPUT);

#if LINE_SENSOR_ANALOG
  analogReadResolution(12);
  analogSetPinAttenuation(LINE_SENSOR_PIN, ADC_11db);
#endif

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(PIN_ENA, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcAttach(PIN_ENB, PWM_FREQUENCY, PWM_RESOLUTION);
#else
  ledcSetup(PWM_CHANNEL_A, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcSetup(PWM_CHANNEL_B, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcAttachPin(PIN_ENA, PWM_CHANNEL_A);
  ledcAttachPin(PIN_ENB, PWM_CHANNEL_B);
#endif
  stopMotors();

  loadSensorConfig();
  const int raw = readSensorRaw();
  LOGI("Cảm biến: GPIO%d %s, ngưỡng %d ± %d, vạch đen %s ngưỡng, đọc lúc khởi động=%d (%s), không thấy mặt sàn khi ADC > %d",
    LINE_SENSOR_PIN, LINE_SENSOR_ANALOG ? "analog" : "digital", static_cast<int>(sensorThreshold),
    static_cast<int>(sensorHysteresis), sensorBlackHigh ? "cao hơn" : "thấp hơn", raw, classifyReading(raw) == 1 ? "đen" : "trắng",
    static_cast<int>(sensorFloorMax));
#if LINE_SENSOR_ANALOG
  if (LINE_SENSOR_PIN != 32 && LINE_SENSOR_PIN != 33 && (LINE_SENSOR_PIN < 34 || LINE_SENSOR_PIN > 39)) {
    LOGE("GPIO%d không thuộc ADC1, không đọc analog được khi Wi-Fi bật. Dùng GPIO32–39", LINE_SENSOR_PIN);
  }
#endif

  WiFi.onEvent(onWifiEvent);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // Tắt tiết kiệm điện Wi-Fi để trả lời Pi nhanh, đều
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptAt = millis();
  LOGI("Wi-Fi: đang kết nối \"%s\"", WIFI_SSID);

  setupHttp();

  sensorNotes = xQueueCreate(32, sizeof(SensorNote));
  // Lõi 1, ưu tiên 3 (> loop() = 1): đọc cảm biến đúng nhịp 1 ms.
  xTaskCreatePinnedToCore(sensorTask, "line-sensor", 4096, nullptr, 3, &sensorTaskHandle, 1);
}

void loop() {
  const uint32_t now = millis();
  httpServer.handleClient();
  maintainWifi(now);
  updateMotorRamp(now);
  checkAutoStop();
  logNewSpeedEvents();
  drainSensorNotes();
  heartbeat(now);
  delay(1);
}

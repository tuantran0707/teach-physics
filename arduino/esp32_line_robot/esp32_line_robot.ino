// Xe ESP32 đo vận tốc bằng vạch đen cách nhau 10 cm (Bài 03 · Vận tốc).
//
// Nguyên lý: cảm biến dò line nhìn xuống sàn. Mỗi lần xe đi từ nền trắng vào một vạch
// đen, ESP32 ghi lại thời điểm (độ chính xác micro giây). Từ vạch thứ 2 trở đi:
//     v = s / t = 0,10 m / (thời điểm vạch này − thời điểm vạch trước)
// Giá trị được tính NGAY tại vạch, đánh số thứ tự và lưu vào bộ đệm; Raspberry Pi đọc
// qua Wi-Fi cục bộ (GET /status?since=<số thứ tự>) nên không bỏ sót lần đo nào.
// Vì thời điểm được đo trên ESP32, độ trễ mạng không làm sai kết quả.
//
// Phần cứng: ESP32 DevKit + L298N (không encoder) + 1 cảm biến hồng ngoại dò line.
// Thông tin Wi-Fi và cảm biến đặt trong robot_config.h (xem README.md).

#include "robot_config.h"

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <esp_arduino_version.h>
#include <esp_random.h>
#include <esp_timer.h>

// ---------- Tham số có thể ghi đè trong robot_config.h ----------
#ifndef LINE_SPACING_M
#define LINE_SPACING_M 0.10f          // Khoảng cách giữa hai vạch đen (m)
#endif
#ifndef LINE_SENSOR_HYSTERESIS
#define LINE_SENSOR_HYSTERESIS 150    // Vùng đệm quanh ngưỡng analog, chống nháy
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
#define LINE_TIMEOUT_MS 4000          // Tự dừng nếu quá lâu không thấy vạch (0 = tắt)
#endif
#ifndef MAX_LINES
#define MAX_LINES 0                   // Tự dừng sau N vạch, ví dụ cuối đường đua (0 = tắt)
#endif
#ifndef PWM_MIN
#define PWM_MIN 160                   // L298N + động cơ DC bị ì ở PWM thấp
#endif
#ifndef PWM_MAX
#define PWM_MAX 255
#endif
#ifndef ACCELERATION_MS
#define ACCELERATION_MS 4000          // Thời gian tăng từ PWM_MIN lên PWM_MAX
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
constexpr size_t EVENT_CAPACITY = 64;   // Số lần đo gần nhất giữ lại cho Pi đọc

WebServer httpServer(80);

// ---------- Dữ liệu dùng chung giữa tác vụ cảm biến và loop() ----------
struct SpeedEvent {
  uint32_t seq;         // Số thứ tự tăng dần (không reset khi chạy lại)
  uint32_t line;        // Vạch thứ mấy trong lần chạy này (2, 3, …)
  uint32_t atMs;        // Thời điểm qua vạch, tính từ lúc bấm Bắt đầu (ms)
  uint32_t intervalUs;  // Thời gian giữa vạch trước và vạch này (µs)
  float speedMps;       // v = LINE_SPACING_M / thời gian
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

uint32_t bootId = 0;                    // Đổi mỗi lần ESP32 khởi động lại → Pi biết để đọc lại từ đầu
int64_t runStoppedUs = 0;
bool hasRun = false;
uint8_t currentPwm = 0;
uint32_t lastRampAt = 0;
uint32_t lastWifiAttemptAt = 0;
uint32_t lastPrintedSeq = 0;
bool ipReported = false;
const char *stopReason = "";

const char DASHBOARD_HTML[] PROGMEM = R"rawliteral(
<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 · Xe đo vận tốc</title><style>
*{box-sizing:border-box}body{margin:0;background:#0c1821;color:#edf4f2;font:16px system-ui,sans-serif}.page{max-width:620px;margin:0 auto;padding:22px 16px}.eyebrow{color:#94c9b5;font-size:12px;font-weight:800;letter-spacing:.12em}.title{margin:5px 0 18px;font-size:26px}.status{display:flex;align-items:center;gap:9px;color:#9bb2b5;font-size:14px}.dot{width:9px;height:9px;border-radius:50%;background:#e2aa58}.dot.on{background:#55d69a;box-shadow:0 0 10px #55d69a}.speed{margin:14px 0 2px;font-size:64px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}.unit{color:#9bb2b5}.actions{display:flex;gap:10px;margin:20px 0}.actions button{min-height:50px;flex:1;border:0;border-radius:10px;font-size:16px;font-weight:800}.start{background:#83d8b1;color:#0a261d}.stop{background:#f07d79;color:#32100f}.reset{background:#2a4450;color:#edf4f2}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:7px 6px;border-bottom:1px solid #263b42;text-align:right}th{color:#9bb2b5;font-size:12px}.hint{margin-top:14px;color:#8ca3a8;font-size:12px;line-height:1.5}
</style><main class="page"><div class="eyebrow">BÀI 03 · ĐO VẬN TỐC</div><h1 class="title">Xe robot qua vạch 10 cm</h1><div class="status"><i id="dot" class="dot"></i><span id="state">Đang kết nối...</span></div><div id="speed" class="speed">0.00</div><div class="unit">m/s · vận tốc tại vạch gần nhất (v = 0,10 m ÷ t)</div><div class="actions"><button class="start" onclick="cmd('start')">Bắt đầu</button><button class="stop" onclick="cmd('stop')">Dừng xe</button><button class="reset" onclick="cmd('reset')">Đặt lại</button></div><table><thead><tr><th>Vạch</th><th>Thời điểm (s)</th><th>t giữa 2 vạch (s)</th><th>v (m/s)</th></tr></thead><tbody id="rows"></tbody></table><p id="hint" class="hint">Cảm biến ADC: <b id="raw">–</b></p></main><script>
let since=0,boot=0,rows=[];
async function cmd(n){try{await fetch('/'+n,{method:'POST'});if(n!=='stop'){rows=[];draw()}}catch(e){}}
function draw(){document.querySelector('#rows').innerHTML=rows.slice(-12).reverse().map(e=>`<tr><td>${e.line}</td><td>${e.t_s.toFixed(3)}</td><td>${e.interval_s.toFixed(3)}</td><td><b>${e.speed_mps.toFixed(3)}</b></td></tr>`).join('')}
async function poll(){try{const r=await fetch('/status?since='+since,{cache:'no-store'});const d=await r.json();if(d.boot_id!==boot){boot=d.boot_id;since=0;rows=[]}for(const e of d.events){rows.push(e);since=e.seq}if(d.events.length)draw();document.querySelector('#speed').textContent=Number(d.speed_mps).toFixed(2);document.querySelector('#raw').textContent=d.sensor_raw+(d.on_line?' (đen)':' (trắng)');document.querySelector('#state').textContent=d.running?`Đang chạy · ${d.line_count} vạch · PWM ${d.pwm}`:`Đã dừng${d.stop_reason?' · '+d.stop_reason:''} · ${d.line_count} vạch`;document.querySelector('#dot').classList.toggle('on',d.running)}catch(e){document.querySelector('#state').textContent='Mất kết nối ESP32';document.querySelector('#dot').classList.remove('on')}}
poll();setInterval(poll,300)
</script></html>
)rawliteral";

// ---------- Cảm biến ----------
int readSensorRaw() {
#if LINE_SENSOR_ANALOG
  return analogRead(LINE_SENSOR_PIN);
#else
  return digitalRead(LINE_SENSOR_PIN);
#endif
}

// Trả về 1 = chắc chắn đen, 0 = chắc chắn trắng, -1 = đang ở vùng đệm (giữ trạng thái cũ).
int classifyReading(int raw) {
#if LINE_SENSOR_ANALOG
#if LINE_BLACK_BELOW_THRESHOLD
  if (raw < LINE_SENSOR_THRESHOLD - LINE_SENSOR_HYSTERESIS) return 1;
  if (raw > LINE_SENSOR_THRESHOLD + LINE_SENSOR_HYSTERESIS) return 0;
#else
  if (raw > LINE_SENSOR_THRESHOLD + LINE_SENSOR_HYSTERESIS) return 1;
  if (raw < LINE_SENSOR_THRESHOLD - LINE_SENSOR_HYSTERESIS) return 0;
#endif
  return -1;
#else
#if LINE_DIGITAL_BLACK_LOW
  return raw == LOW ? 1 : 0;
#else
  return raw == HIGH ? 1 : 0;
#endif
#endif
}

// Gọi khi đã xác nhận xe vừa vào một vạch đen; edgeUs là thời điểm mẫu đen ĐẦU TIÊN.
void recordLine(int64_t edgeUs) {
  portENTER_CRITICAL(&dataMux);
  if (!running) {
    portEXIT_CRITICAL(&dataMux);
    return;
  }
  const int64_t previous = lastLineUs;
  if (previous != 0 && edgeUs - previous < static_cast<int64_t>(MIN_LINE_INTERVAL_MS) * 1000) {
    portEXIT_CRITICAL(&dataMux);
    return;
  }
  lineCount = lineCount + 1;
  lastLineUs = edgeUs;
  if (previous != 0) {
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
  }
  portEXIT_CRITICAL(&dataMux);
}

// Tác vụ riêng đọc cảm biến mỗi 1 ms, ưu tiên cao hơn loop() nên không bị web server làm trễ.
void sensorTask(void *) {
  bool onLine = false;
  int streak = 0;
  int64_t firstBlackUs = 0;
  TickType_t wake = xTaskGetTickCount();
  for (;;) {
    vTaskDelayUntil(&wake, pdMS_TO_TICKS(1));
    const int raw = readSensorRaw();
    lastRawReading = raw;
    const int reading = classifyReading(raw);
    const int64_t nowUs = esp_timer_get_time();
    if (!onLine) {
      if (reading == 1) {
        if (streak == 0) firstBlackUs = nowUs;
        if (++streak >= LINE_CONFIRM_SAMPLES) {
          onLine = true;
          streak = 0;
          recordLine(firstBlackUs);
        }
      } else if (reading == 0) {
        streak = 0;
      }
    } else {
      if (reading == 0) {
        if (++streak >= WHITE_CONFIRM_SAMPLES) {
          onLine = false;
          streak = 0;
        }
      } else if (reading == 1) {
        streak = 0;
      }
    }
  }
}

// ---------- Động cơ ----------
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

// ---------- Điều khiển lần chạy ----------
uint32_t elapsedRunMs() {
  if (!hasRun) return 0;
  const int64_t end = running ? esp_timer_get_time() : runStoppedUs;
  return static_cast<uint32_t>((end - runStartUs) / 1000);
}

void startRun() {
  if (running) return;
  portENTER_CRITICAL(&dataMux);
  runStartUs = esp_timer_get_time();
  lastLineUs = 0;
  lineCount = 0;
  lastSpeedMps = 0.0f;
  running = true;
  portEXIT_CRITICAL(&dataMux);
  hasRun = true;
  stopReason = "";
  lastRampAt = millis();
  driveForward(PWM_MIN);
  Serial.println("{\"type\":\"robot_status\",\"state\":\"started\"}");
}

void stopRun(const char *reason) {
  if (!running) return;
  portENTER_CRITICAL(&dataMux);
  running = false;
  portEXIT_CRITICAL(&dataMux);
  runStoppedUs = esp_timer_get_time();
  stopMotors();
  stopReason = reason;
  Serial.printf("{\"type\":\"robot_status\",\"state\":\"stopped\",\"reason\":\"%s\",\"line_count\":%lu}\n",
    reason, static_cast<unsigned long>(lineCount));
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
}

void updateMotorRamp(uint32_t now) {
  if (!running || now - lastRampAt < RAMP_UPDATE_MS) return;
  lastRampAt = now;
  const float progress = min(1.0f, elapsedRunMs() / static_cast<float>(ACCELERATION_MS));
  // Tăng ngay từ đầu nhưng lực tăng mạnh dần về cuối.
  const float ramp = 0.35f * progress + 0.65f * progress * progress;
  const uint8_t pwm = static_cast<uint8_t>(PWM_MIN + (PWM_MAX - PWM_MIN) * ramp + 0.5f);
  if (pwm != currentPwm) driveForward(pwm);
}

// Dừng an toàn khi xe chạy hết đường đua hoặc lệch khỏi vạch.
void checkAutoStop() {
  if (!running) return;
  if (MAX_LINES > 0 && lineCount >= MAX_LINES) {
    stopRun("đủ số vạch");
    return;
  }
  if (LINE_TIMEOUT_MS > 0) {
    const int64_t reference = lastLineUs != 0 ? lastLineUs : runStartUs;
    if (esp_timer_get_time() - reference > static_cast<int64_t>(LINE_TIMEOUT_MS) * 1000) {
      stopRun("không thấy vạch");
    }
  }
}

// In mỗi lần đo ra Serial (tiện kiểm tra bằng Serial Monitor).
void printNewEvents() {
  while (lastPrintedSeq < eventSeq) {
    if (eventSeq - lastPrintedSeq > EVENT_CAPACITY) lastPrintedSeq = eventSeq - EVENT_CAPACITY;
    portENTER_CRITICAL(&dataMux);
    const SpeedEvent event = events[(lastPrintedSeq + 1) % EVENT_CAPACITY];
    portEXIT_CRITICAL(&dataMux);
    lastPrintedSeq = event.seq;
    Serial.printf("{\"type\":\"line\",\"line\":%lu,\"t_s\":%.3f,\"interval_s\":%.4f,\"speed_mps\":%.4f}\n",
      static_cast<unsigned long>(event.line), event.atMs / 1000.0f, event.intervalUs / 1000000.0f, event.speedMps);
  }
}

// ---------- HTTP ----------
// JSON trạng thái + các lần đo có seq > since. Trường cũ (value km/h, distance_m, …) giữ nguyên
// để tương thích; value giờ là vận tốc tại vạch gần nhất.
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
  char buffer[200];
  snprintf(buffer, sizeof(buffer),
    "{\"type\":\"speed\",\"boot_id\":%lu,\"seq\":%lu,\"value\":%.3f,\"unit\":\"km/h\",\"speed_mps\":%.4f,"
    "\"segment_speed_mps\":%.4f,\"distance_m\":%.2f,",
    static_cast<unsigned long>(bootId), static_cast<unsigned long>(newest), speed * 3.6f, speed, speed,
    lines * LINE_SPACING_M);
  json += buffer;
  snprintf(buffer, sizeof(buffer),
    "\"line_count\":%lu,\"line_spacing_m\":%.3f,\"elapsed_s\":%.2f,\"pwm\":%u,\"running\":%s,"
    "\"stop_reason\":\"%s\",\"sensor_raw\":%d,\"on_line\":%s,\"events\":[",
    static_cast<unsigned long>(lines), LINE_SPACING_M, elapsedRunMs() / 1000.0f, currentPwm,
    isRunning ? "true" : "false", stopReason, raw, onLine ? "true" : "false");
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

void sendJsonResponse(int status, const String &payload) {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  httpServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  httpServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  httpServer.sendHeader("Cache-Control", "no-store");
  httpServer.send(status, "application/json", payload);
}

void sendCommandResponse(int status, const char *message) {
  sendJsonResponse(status, String("{\"ok\":") + (status == 200 ? "true" : "false") + ",\"message\":\"" + message + "\"}");
}

void sendNoContent() {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  httpServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  httpServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  httpServer.send(204);
}

bool handleCommand(String command) {
  command.trim();
  command.toLowerCase();
  command.replace(" ", "");
  if (command == "start" || command.indexOf("\"cmd\":\"start\"") >= 0) {
    startRun();
    return true;
  }
  if (command == "stop" || command.indexOf("\"cmd\":\"stop\"") >= 0) {
    stopRun("lệnh dừng");
    return true;
  }
  if (command == "reset" || command.indexOf("\"cmd\":\"reset\"") >= 0) {
    resetRun();
    return true;
  }
  return false;
}

void setupHttpCommands() {
  httpServer.on("/", HTTP_GET, []() {
    httpServer.send_P(200, "text/html; charset=utf-8", DASHBOARD_HTML);
  });
  auto startHandler = []() {
    startRun();
    sendCommandResponse(200, "started");
  };
  auto stopHandler = []() {
    stopRun("lệnh dừng");
    sendCommandResponse(200, "stopped");
  };
  auto resetHandler = []() {
    resetRun();
    sendCommandResponse(200, "reset");
  };
  auto statusHandler = []() {
    const uint32_t since = httpServer.hasArg("since") ? strtoul(httpServer.arg("since").c_str(), nullptr, 10) : 0;
    sendJsonResponse(200, makeStatus(since));
  };
  auto optionsHandler = []() { sendNoContent(); };
  httpServer.on("/start", HTTP_GET, startHandler);
  httpServer.on("/start", HTTP_POST, startHandler);
  httpServer.on("/stop", HTTP_GET, stopHandler);
  httpServer.on("/stop", HTTP_POST, stopHandler);
  httpServer.on("/reset", HTTP_POST, resetHandler);
  httpServer.on("/start", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/stop", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/reset", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/status", HTTP_GET, statusHandler);
  httpServer.on("/status", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/api/speed", HTTP_GET, statusHandler);
  httpServer.on("/api/speed", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/command", HTTP_POST, []() {
    if (handleCommand(httpServer.arg("plain"))) sendCommandResponse(200, "accepted");
    else sendCommandResponse(400, "use start, stop or reset");
  });
  httpServer.on("/command", HTTP_OPTIONS, optionsHandler);
  httpServer.onNotFound([]() { sendCommandResponse(404, "not found"); });
  httpServer.begin();
}

void maintainWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) {
    if (!ipReported) {
      Serial.printf("{\"type\":\"robot_status\",\"ip\":\"%s\"}\n", WiFi.localIP().toString().c_str());
      ipReported = true;
    }
    return;
  }
  ipReported = false;
  if (running) stopRun("mất Wi-Fi");
  if (now - lastWifiAttemptAt < WIFI_RETRY_MS) return;
  lastWifiAttemptAt = now;
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void setup() {
  Serial.begin(115200);
  bootId = esp_random() & 0x7fffffff;

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

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // Tắt tiết kiệm điện Wi-Fi để trả lời Pi nhanh, đều
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptAt = millis();

  setupHttpCommands();

  // Lõi 1, ưu tiên 3 (> loop() = 1): đọc cảm biến đúng nhịp 1 ms.
  xTaskCreatePinnedToCore(sensorTask, "line-sensor", 4096, nullptr, 3, nullptr, 1);
}

void loop() {
  const uint32_t now = millis();
  httpServer.handleClient();
  maintainWifi(now);
  updateMotorRamp(now);
  checkAutoStop();
  printNewEvents();
  delay(1);
}

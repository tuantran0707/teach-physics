#include "robot_config.h"

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <esp_arduino_version.h>

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
constexpr uint8_t PWM_MIN = 105;
constexpr uint8_t PWM_MAX = 205;
constexpr uint32_t ACCELERATION_MS = 10000;

constexpr float DISTANCE_PER_LINE_M = 0.10f;
constexpr uint32_t SENSOR_SAMPLE_MS = 2;
constexpr uint32_t SENSOR_DEBOUNCE_MS = 25;
constexpr uint32_t MIN_LINE_INTERVAL_MS = 120;
constexpr uint32_t TELEMETRY_INTERVAL_MS = 1000;
constexpr uint32_t WIFI_RETRY_MS = 10000;

WebServer httpServer(80);

bool running = false;
bool stableBlack = false;
bool candidateBlack = false;
uint32_t candidateSince = 0;
uint32_t lastSensorSample = 0;
uint32_t lastLineAt = 0;
uint32_t runStartedAt = 0;
uint32_t runStoppedAt = 0;
uint32_t lastTelemetryAt = 0;
uint32_t lastWifiAttemptAt = 0;
uint32_t lineCount = 0;
float segmentSpeedMps = 0.0f;
uint8_t currentPwm = 0;
bool hasRun = false;
bool ipReported = false;

const char DASHBOARD_HTML[] PROGMEM = R"rawliteral(
<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 · Xe dò vạch</title><style>
*{box-sizing:border-box}body{margin:0;background:#0c1821;color:#edf4f2;font:16px system-ui,sans-serif}.page{max-width:620px;margin:0 auto;padding:24px 18px}.eyebrow{color:#94c9b5;font-size:12px;font-weight:800;letter-spacing:.12em}.title{margin:5px 0 22px;font-size:28px}.status{display:flex;align-items:center;gap:9px;color:#9bb2b5;font-size:14px}.dot{width:9px;height:9px;border-radius:50%;background:#e2aa58}.dot.on{background:#55d69a;box-shadow:0 0 10px #55d69a}.speed{margin:17px 0 4px;font-size:68px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}.unit{color:#9bb2b5}.actions{display:flex;gap:10px;margin:24px 0}.actions button{min-height:50px;flex:1;border:0;border-radius:10px;font-size:16px;font-weight:800}.start{background:#83d8b1;color:#0a261d}.stop{background:#f07d79;color:#32100f}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stat{padding:14px 10px;border:1px solid #263b42;border-radius:10px;background:#12232c}.stat strong,.stat span{display:block}.stat strong{font-size:20px;font-variant-numeric:tabular-nums}.stat span{margin-top:4px;color:#9bb2b5;font-size:11px}.hint{margin-top:18px;color:#8ca3a8;font-size:12px;line-height:1.5}
</style><main class="page"><div class="eyebrow">BÀI 03 · ĐO TỐC ĐỘ</div><h1 class="title">Xe robot dò vạch</h1><div class="status"><i id="dot" class="dot"></i><span id="state">Đang kết nối...</span></div><div id="speed" class="speed">0.0</div><div class="unit">km/h · tốc độ trung bình</div><div class="actions"><button class="start" onclick="command('start')">Bắt đầu</button><button class="stop" onclick="command('stop')">Dừng xe</button></div><div class="stats"><div class="stat"><strong id="distance">0.00 m</strong><span>QUÃNG ĐƯỜNG</span></div><div class="stat"><strong id="lines">0</strong><span>VẠCH ĐÃ ĐẾM</span></div><div class="stat"><strong id="elapsed">0.0 s</strong><span>THỜI GIAN</span></div></div><p id="error" class="hint">Số liệu cập nhật mỗi giây. Mỗi vạch đen được quy đổi thành 10 cm.</p></main><script>
async function command(name){try{await fetch('/'+name,{method:'POST'});await update()}catch(e){document.querySelector('#error').textContent='Không gửi được lệnh tới ESP32.'}}
async function update(){try{const r=await fetch('/status',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();document.querySelector('#speed').textContent=Number(d.value).toFixed(2);document.querySelector('#distance').textContent=Number(d.distance_m).toFixed(2)+' m';document.querySelector('#lines').textContent=d.line_count;document.querySelector('#elapsed').textContent=Number(d.elapsed_s).toFixed(1)+' s';document.querySelector('#state').textContent=d.running?'Đang chạy · PWM '+d.pwm:'Đã dừng';document.querySelector('#dot').classList.toggle('on',d.running);document.querySelector('#error').textContent='Đang cập nhật mỗi giây · tốc độ đoạn gần nhất '+Number(d.segment_speed_mps).toFixed(2)+' m/s'}catch(e){document.querySelector('#state').textContent='Mất kết nối ESP32';document.querySelector('#dot').classList.remove('on')}}update();setInterval(update,1000)
</script></html>
)rawliteral";

bool readBlackLine() {
#if LINE_SENSOR_ANALOG
  const int raw = analogRead(LINE_SENSOR_PIN);
#if LINE_BLACK_BELOW_THRESHOLD
  return raw < LINE_SENSOR_THRESHOLD;
#else
  return raw > LINE_SENSOR_THRESHOLD;
#endif
#else
  const int raw = digitalRead(LINE_SENSOR_PIN);
#if LINE_DIGITAL_BLACK_LOW
  return raw == LOW;
#else
  return raw == HIGH;
#endif
#endif
}

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
  // OUT1/OUT3 are the red motor leads; OUT2/OUT4 are the black leads.
  digitalWrite(PIN_IN1, HIGH);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, HIGH);
  digitalWrite(PIN_IN4, LOW);
  writeMotorPwm(pwm, pwm);
  currentPwm = pwm;
}

uint32_t elapsedRunMs(uint32_t now) {
  if (!hasRun) return 0;
  return (running ? now : runStoppedAt) - runStartedAt;
}

float averageSpeedMps(uint32_t now) {
  const uint32_t elapsed = elapsedRunMs(now);
  if (elapsed == 0) return 0.0f;
  return (lineCount * DISTANCE_PER_LINE_M) / (elapsed / 1000.0f);
}

String makeTelemetry(uint32_t now) {
  const float elapsedSeconds = elapsedRunMs(now) / 1000.0f;
  const float distanceM = lineCount * DISTANCE_PER_LINE_M;
  const float averageMps = averageSpeedMps(now);
  const float averageKmh = averageMps * 3.6f;
  char payload[320];
  snprintf(payload, sizeof(payload),
    "{\"type\":\"speed\",\"value\":%.3f,\"unit\":\"km/h\",\"average_speed_mps\":%.4f,\"segment_speed_mps\":%.4f,\"distance_m\":%.2f,\"line_count\":%lu,\"elapsed_s\":%.2f,\"pwm\":%u,\"running\":%s}",
    averageKmh, averageMps, segmentSpeedMps, distanceM,
    static_cast<unsigned long>(lineCount), elapsedSeconds, currentPwm,
    running ? "true" : "false");
  return String(payload);
}

void sendTelemetry(uint32_t now) {
  const String payload = makeTelemetry(now);
  Serial.println(payload);
}

void startRun() {
  if (running) return;
  const uint32_t now = millis();
  lineCount = 0;
  segmentSpeedMps = 0.0f;
  lastLineAt = 0;
  runStartedAt = now;
  runStoppedAt = now;
  hasRun = true;
  lastTelemetryAt = now;
  running = true;
  driveForward(PWM_MIN);
}

void stopRun() {
  if (!running) return;
  const uint32_t now = millis();
  runStoppedAt = now;
  running = false;
  stopMotors();
  sendTelemetry(now);
}

void resetRun() {
  stopRun();
  running = false;
  hasRun = false;
  lineCount = 0;
  segmentSpeedMps = 0.0f;
  lastLineAt = 0;
  runStartedAt = 0;
  runStoppedAt = 0;
  stopMotors();
  sendTelemetry(millis());
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
    stopRun();
    return true;
  }
  return false;
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

void setupHttpCommands() {
  httpServer.on("/", HTTP_GET, []() {
    httpServer.send_P(200, "text/html; charset=utf-8", DASHBOARD_HTML);
  });
  auto startHandler = []() {
    startRun();
    sendCommandResponse(200, "started");
  };
  auto stopHandler = []() {
    stopRun();
    sendCommandResponse(200, "stopped");
  };
  auto statusHandler = []() { sendJsonResponse(200, makeTelemetry(millis())); };
  auto optionsHandler = []() { sendNoContent(); };
  httpServer.on("/start", HTTP_GET, startHandler);
  httpServer.on("/start", HTTP_POST, startHandler);
  httpServer.on("/stop", HTTP_GET, stopHandler);
  httpServer.on("/stop", HTTP_POST, stopHandler);
  httpServer.on("/reset", HTTP_POST, []() {
    resetRun();
    sendCommandResponse(200, "reset");
  });
  httpServer.on("/start", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/stop", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/reset", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/status", HTTP_GET, statusHandler);
  httpServer.on("/status", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/api/speed", HTTP_GET, statusHandler);
  httpServer.on("/api/speed", HTTP_OPTIONS, optionsHandler);
  httpServer.on("/command", HTTP_POST, []() {
    if (handleCommand(httpServer.arg("plain"))) sendCommandResponse(200, "accepted");
    else sendCommandResponse(400, "use start or stop");
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
  if (running) stopRun();
  if (now - lastWifiAttemptAt < WIFI_RETRY_MS) return;
  lastWifiAttemptAt = now;
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void updateLineCounter(uint32_t now) {
  if (!running || now - lastSensorSample < SENSOR_SAMPLE_MS) return;
  lastSensorSample = now;
  const bool readingBlack = readBlackLine();
  if (readingBlack != candidateBlack) {
    candidateBlack = readingBlack;
    candidateSince = now;
    return;
  }
  if (candidateBlack == stableBlack || now - candidateSince < SENSOR_DEBOUNCE_MS) return;
  stableBlack = candidateBlack;
  if (!stableBlack || (lastLineAt != 0 && now - lastLineAt < MIN_LINE_INTERVAL_MS)) return;
  if (lastLineAt != 0 && now > lastLineAt) {
    segmentSpeedMps = DISTANCE_PER_LINE_M / ((now - lastLineAt) / 1000.0f);
  }
  lastLineAt = now;
  lineCount++;
}

void updateMotorRamp(uint32_t now) {
  if (!running) return;
  const uint32_t elapsed = elapsedRunMs(now);
  const float progress = min(1.0f, elapsed / static_cast<float>(ACCELERATION_MS));
  const uint8_t pwm = static_cast<uint8_t>(PWM_MIN + (PWM_MAX - PWM_MIN) * progress);
  if (pwm != currentPwm) driveForward(pwm);
}

void setup() {
  Serial.begin(115200);

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

  stableBlack = readBlackLine();
  candidateBlack = stableBlack;
  candidateSince = millis();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptAt = millis();

  setupHttpCommands();
}

void loop() {
  const uint32_t now = millis();
  httpServer.handleClient();
  maintainWifi(now);

  updateLineCounter(now);
  updateMotorRamp(now);

  if (running && now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    sendTelemetry(now);
  }
}
/*
 * ESP32 + FSR402 -> Raspberry Pi qua UART
 * Du lieu gui moi dong co dang: value:10.00N
 *
 * Mach phan ap:
 *   3V3 --- FSR402 ---+--- GPIO34 (ADC)
 *                     |
 *                    10k ohm
 *                     |
 *                    GND
 *
 * Ket noi ESP32 voi Raspberry Pi bang cap USB. Cap USB vua cap nguon,
 * vua tao cong serial de Raspberry Pi doc du lieu.
 */

#include <Arduino.h>
#include <math.h>

constexpr uint8_t FSR_PIN = 34;
constexpr uint32_t UART_BAUD = 115200;
// Gui 5 mau moi giay de giao dien phan hoi muot va van on dinh.
constexpr uint32_t SEND_INTERVAL_MS = 200;
constexpr uint8_t ADC_SAMPLES = 16;

constexpr uint16_t ADC_SATURATION = 4090;
constexpr uint16_t ADC_ZERO = 20;

// Gioi han dau ra phu hop voi bai thi nghiem: 0-60 N.
constexpr float MAX_FORCE_N = 60.0f;
constexpr float FILTER_ALPHA = 0.30f;
constexpr float UPDATE_DEADBAND_N = 3.00f;
constexpr float OUTPUT_STEP_N = 0.50f;

uint16_t readAveragedAdc() {
  uint32_t total = 0;
  for (uint8_t i = 0; i < ADC_SAMPLES; ++i) {
    total += analogRead(FSR_PIN);
    delayMicroseconds(500);
  }
  return static_cast<uint16_t>(total / ADC_SAMPLES);
}

float adcToForceNewton(uint16_t adcValue) {
  if (adcValue <= ADC_ZERO) {
    return 0.0f;
  }

  // Chia tuyen tinh toan bo dai ADC thanh 0-60 N. Cach nay giup cac khoang
  // 0-10, 10-20 ... 50-60 N co do rong tin hieu gan nhu bang nhau, thay vi
  // vung 25-60 N tang qua nhanh theo duong cong luy thua cua FSR402.
  if (adcValue >= ADC_SATURATION) {
    return MAX_FORCE_N;
  }

  const float normalized = static_cast<float>(adcValue - ADC_ZERO) /
                           static_cast<float>(ADC_SATURATION - ADC_ZERO);
  return constrain(normalized * MAX_FORCE_N, 0.0f, MAX_FORCE_N);
}

void setup() {
  pinMode(FSR_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(FSR_PIN, ADC_11db);

  // Serial mac dinh di qua mach USB-UART tren board ESP32.
  Serial.begin(UART_BAUD);
}

void loop() {
  static uint32_t lastSend = 0;
  static bool filterInitialized = false;
  static float filteredForce = 0.0f;
  static float reportedForce = 0.0f;
  const uint32_t now = millis();
  if (now - lastSend < SEND_INTERVAL_MS) {
    return;
  }
  lastSend = now;

  const uint16_t adcValue = readAveragedAdc();
  const float measuredForce = adcToForceNewton(adcValue);

  if (!filterInitialized) {
    filteredForce = measuredForce;
    reportedForce = measuredForce;
    filterInitialized = true;
  } else {
    // Loc EMA lam mem nhieu trong khi van phan hoi sau moi 200 ms.
    filteredForce += FILTER_ALPHA * (measuredForce - filteredForce);
  }

  // Dua nhanh ve 0 khi da nha cam bien, tranh gia tri nho giam cham.
  if (measuredForce == 0.0f && filteredForce < UPDATE_DEADBAND_N) {
    filteredForce = 0.0f;
  }

  // Chi thay doi gia tri gui khi sai lech du 3 N. Sau do lam tron theo
  // buoc 0.5 N de cac dao dong ADC nho khong lam giao dien nhay lien tuc.
  if (fabsf(filteredForce - reportedForce) >= UPDATE_DEADBAND_N) {
    reportedForce = roundf(filteredForce / OUTPUT_STEP_N) * OUTPUT_STEP_N;
  }
  reportedForce = constrain(reportedForce, 0.0f, MAX_FORCE_N);

  Serial.printf("value:%.2fN\n", reportedForce);
}

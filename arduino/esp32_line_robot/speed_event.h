#pragma once
#include <stdint.h>

// Một lần đo vận tốc tại một vạch (khai báo riêng để Arduino IDE sinh prototype hàm đúng thứ tự).
struct SpeedEvent {
  uint32_t seq;         // Số thứ tự tăng dần (không reset khi chạy lại)
  uint32_t line;        // Vạch thứ mấy trong lần chạy này (2, 3, …)
  uint32_t atMs;        // Thời điểm qua vạch, tính từ lúc bấm Bắt đầu (ms)
  uint32_t intervalUs;  // Thời gian giữa vạch trước và vạch này (µs)
  float speedMps;       // v = LINE_SPACING_M / thời gian
};

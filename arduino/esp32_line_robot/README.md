# ESP32 robot đo vận tốc qua vạch 10 cm

Firmware cho ESP32 DevKit, L298N (không encoder) và một cảm biến hồng ngoại dò line. Xe chạy thẳng trên đường có các vạch đen ngang cách nhau **10 cm**. Mỗi khi qua một vạch, ESP32 tính ngay vận tốc:

```
v = s / t = 0,10 m / (thời điểm qua vạch này − thời điểm qua vạch trước)
```

Vạch đầu tiên chỉ dùng để bắt đầu tính giờ; từ vạch thứ 2 trở đi, mỗi vạch cho một số đo. Raspberry Pi đọc các số đo qua Wi-Fi cục bộ và vẽ bảng, biểu đồ trong Bài 3.

Một cảm biến chỉ đếm được vạch ngang, không tự lái theo đường cong — đặt xe chạy thẳng dọc theo dãy vạch.

## Chân kết nối

| L298N / cảm biến | ESP32 |
| --- | --- |
| ENA | GPIO23 |
| IN1 | GPIO22 |
| IN2 | GPIO21 |
| IN3 | GPIO19 |
| IN4 | GPIO18 |
| ENB | GPIO5 |
| A0 analog của cảm biến | GPIO34 (mặc định, khuyến nghị) |
| GND cảm biến, L298N, ESP32 | Nối chung |

Động cơ trái: OUT1 nối dây đỏ, OUT2 nối dây đen. Động cơ phải: OUT3 nối dây đỏ, OUT4 nối dây đen. Nếu hai bánh quay ngược chiều nhau khi chạy tới, đảo dây của một động cơ.

**Lưu ý GPIO4:** GPIO4 là ADC2, xung đột với Wi-Fi nên không dùng được `analogRead()` ổn định. Firmware mặc định đọc A0 ở GPIO34 (ADC1). Nếu chỉ dùng chân DO digital (đã chỉnh ngưỡng bằng biến trở trên module) thì có thể dùng GPIO4: đặt `LINE_SENSOR_PIN` = `4`, `LINE_SENSOR_ANALOG` = `0`. Không đưa tín hiệu 5 V vào GPIO ESP32.

Tháo jumper ENA/ENB trên L298N để GPIO23 và GPIO5 điều khiển PWM tốc độ.

## Cài đặt

1. Cài Arduino IDE và board package **esp32 by Espressif Systems** (đã thử biên dịch với bản 3.3.10).
2. Tạo `robot_config.h` cạnh file `.ino` (file này chứa mật khẩu Wi-Fi, không commit):

   ```c
   #pragma once
   #define WIFI_SSID "ten-wifi"
   #define WIFI_PASSWORD "mat-khau"

   #define LINE_SENSOR_PIN 34
   #define LINE_SENSOR_ANALOG 1
   #define LINE_SENSOR_THRESHOLD 1800
   #define LINE_BLACK_BELOW_THRESHOLD 1
   #define LINE_DIGITAL_BLACK_LOW 1
   ```

3. Kết nối Pi và ESP32 vào **cùng một mạng Wi-Fi**.
4. Chọn board **ESP32 Dev Module**, nạp `esp32_line_robot.ino`, mở Serial Monitor 115200 baud để xem IP của xe.

## Cách đo chính xác

- Cảm biến được đọc trong một **tác vụ riêng mỗi 1 ms**, ưu tiên cao hơn web server, nên việc Pi hỏi dữ liệu không làm lệch thời điểm qua vạch.
- Thời điểm qua vạch lấy từ **mẫu đen đầu tiên** (đồng hồ micro giây), sau khi đã xác nhận đủ `LINE_CONFIRM_SAMPLES` mẫu đen liên tiếp (chống nhiễu). Xe phải ra khỏi vạch (`WHITE_CONFIRM_SAMPLES` mẫu trắng) mới đếm vạch tiếp theo.
- Vận tốc được tính **trên ESP32 ngay tại vạch**. Pi nhận chậm vài trăm ms cũng không ảnh hưởng kết quả.
- Mỗi số đo có số thứ tự (`seq`). Pi gửi `since=<seq cuối đã nhận>` nên **không bỏ sót vạch nào**, kể cả khi xe qua nhiều vạch giữa hai lần hỏi. ESP32 giữ 64 số đo gần nhất.

## Dữ liệu gửi cho Raspberry Pi (HTTP, cổng 80)

```bash
curl -X POST http://<IP-ESP32>/start     # xe chạy, bắt đầu một lần đo mới
curl -X POST http://<IP-ESP32>/stop      # dừng xe
curl -X POST http://<IP-ESP32>/reset     # dừng và xóa số vạch
curl "http://<IP-ESP32>/status?since=0"  # trạng thái + các số đo có seq > since
```

Ví dụ `/status`:

```json
{"type":"speed","boot_id":184467,"seq":3,"value":1.237,"unit":"km/h","speed_mps":0.3436,
 "segment_speed_mps":0.3436,"distance_m":0.40,"line_count":4,"line_spacing_m":0.100,
 "elapsed_s":1.62,"pwm":205,"running":true,"stop_reason":"","sensor_raw":3120,"on_line":false,
 "events":[
  {"seq":1,"line":2,"t_s":0.807,"interval_s":0.3910,"speed_mps":0.2558,"speed_kmh":0.921},
  {"seq":2,"line":3,"t_s":1.181,"interval_s":0.3740,"speed_mps":0.2674,"speed_kmh":0.963},
  {"seq":3,"line":4,"t_s":1.472,"interval_s":0.2910,"speed_mps":0.3436,"speed_kmh":1.237}]}
```

| Trường | Ý nghĩa |
| --- | --- |
| `events[]` | Mỗi phần tử là một vạch: `line` vạch thứ mấy, `t_s` thời điểm qua vạch (tính từ lúc Bắt đầu), `interval_s` thời gian giữa 2 vạch, `speed_mps` = 0,10 ÷ `interval_s` |
| `speed_mps`, `value` | Vận tốc tại vạch gần nhất (m/s và km/h) |
| `seq` | Số thứ tự số đo mới nhất; `boot_id` đổi khi ESP32 khởi động lại |
| `sensor_raw`, `on_line` | Giá trị ADC hiện tại của cảm biến và đang thấy đen hay trắng — dùng để hiệu chuẩn |
| `stop_reason` | Lý do dừng: lệnh dừng, không thấy vạch, đủ số vạch, mất Wi-Fi |

Mỗi số đo cũng được in ra Serial dạng `{"type":"line","line":3,"t_s":1.181,"interval_s":0.3740,"speed_mps":0.2674}`.

Trang `http://<IP-ESP32>/` mở được trên điện thoại/laptop cùng Wi-Fi: có nút Bắt đầu/Dừng/Đặt lại, bảng các vạch và giá trị ADC của cảm biến.

Trong ứng dụng trên Pi: vào **Bài 3 · Vận tốc** → **📶 Kết nối xe** → nhập IP của xe → **Kết nối** → **▶ Bắt đầu**. Đồng hồ, biểu đồ và bảng hiển thị theo m/s; mỗi dòng bảng là một vạch với Δt và v = 0,1 m ÷ Δt.

## Hiệu chuẩn và tùy chỉnh

1. Mở trang `http://<IP-ESP32>/`, đặt cảm biến lên nền trắng rồi lên vạch đen, ghi lại hai giá trị **Cảm biến ADC**.
2. Đặt `LINE_SENSOR_THRESHOLD` ở giữa hai giá trị đó. Nếu vạch đen cho giá trị **cao hơn** nền trắng, đặt `LINE_BLACK_BELOW_THRESHOLD` = `0`.
3. Các tham số sau có giá trị mặc định trong `.ino`; muốn đổi thì thêm `#define` tương ứng vào `robot_config.h`:

| Tham số | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `LINE_SPACING_M` | `0.10f` | Khoảng cách giữa hai vạch (m) |
| `LINE_SENSOR_HYSTERESIS` | `150` | Vùng đệm quanh ngưỡng analog, chống nháy ở mép vạch |
| `LINE_CONFIRM_SAMPLES` | `3` | Số ms liên tục thấy đen để xác nhận vạch |
| `WHITE_CONFIRM_SAMPLES` | `5` | Số ms liên tục thấy trắng để xác nhận đã qua vạch |
| `MIN_LINE_INTERVAL_MS` | `40` | Bỏ qua hai vạch gần nhau hơn (giới hạn đo ~2,5 m/s) |
| `LINE_TIMEOUT_MS` | `4000` | Tự dừng nếu quá thời gian này không thấy vạch, ví dụ xe chạy hết đường (0 = tắt) |
| `MAX_LINES` | `0` | Tự dừng sau N vạch (0 = tắt) |
| `PWM_MIN`, `PWM_MAX`, `ACCELERATION_MS` | `160`, `255`, `4000` | Xe khởi động ở PWM 160 rồi tăng dần tới 255 trong 4 s, nên vận tốc đo được tăng dần |

**Vạch đen nên rộng 1,5–2 cm.** Cảm biến cần thấy đen ít nhất 3 ms: ở 1 m/s xe đi 3 mm trong 3 ms, nên vạch quá mảnh hoặc xe quá nhanh có thể bị bỏ sót.

Mạch L298N sụt áp và nóng khi tải lớn. Dùng nguồn động cơ riêng, nối chung GND với ESP32, không cấp động cơ từ chân 3V3 của ESP32. Không có encoder nên vận tốc thực tế phụ thuộc pin và mặt sàn — chính vì vậy mới cần đo bằng vạch.

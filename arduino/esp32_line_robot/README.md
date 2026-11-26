# ESP32 robot đo vận tốc qua vạch 10 cm

Firmware cho ESP32 DevKit, L298N (không encoder) và một cảm biến hồng ngoại dò line. Xe chạy thẳng trên đường có các vạch băng keo đen ngang cách nhau **10 cm**. Mỗi khi qua một vạch, ESP32 tính ngay vận tốc:

```
v = s / t = 0,10 m / (thời điểm qua vạch này − thời điểm qua vạch trước)
```

Vạch đầu tiên chỉ dùng để bắt đầu tính giờ; từ vạch thứ 2 trở đi, mỗi vạch cho một số đo. Số đo được **gửi ngay qua UDP** cho Raspberry Pi, đồng thời Pi vẫn hỏi định kỳ qua HTTP để không bỏ sót.

Xe **chỉ chạy khi bấm Bắt đầu và chỉ dừng khi bấm Dừng** (tự dừng duy nhất khi mất Wi-Fi). Xe **chạy chậm rồi nhanh dần đều**: PWM tăng tuyến tính từ PWM lúc bắt đầu tới PWM tối đa.

Một cảm biến chỉ đếm được vạch ngang, không tự lái theo đường cong: đặt xe chạy thẳng dọc theo dãy vạch.

## Tệp

| Tệp | Nội dung |
| --- | --- |
| `esp32_line_robot.ino` | Firmware |
| `speed_event.h` | Kiểu `SpeedEvent` (tách riêng để Arduino IDE sinh khai báo hàm đúng thứ tự) |
| `robot_config.h` | Tự tạo, chứa Wi-Fi và giá trị mặc định; **không đưa lên Git** |

## Chân kết nối

| L298N / cảm biến | ESP32 |
| --- | --- |
| ENA | GPIO23 |
| IN1 | GPIO22 |
| IN2 | GPIO21 |
| IN3 | GPIO19 |
| IN4 | GPIO18 |
| ENB | GPIO5 |
| A0 analog của cảm biến | GPIO34 |
| GND cảm biến, L298N, ESP32 | Nối chung |

Động cơ trái: OUT1 nối dây đỏ, OUT2 nối dây đen. Động cơ phải: OUT3 nối dây đỏ, OUT4 nối dây đen. Nếu hai bánh quay ngược chiều nhau khi chạy tới, đảo dây của một động cơ.

**Chân analog phải thuộc ADC1 (GPIO32–39).** Các chân ADC2 như GPIO4 không đọc analog được khi Wi-Fi bật (luôn ra 0). Nếu buộc dùng GPIO4 thì nối chân DO digital của module và đặt `LINE_SENSOR_ANALOG` = `0`. Không đưa tín hiệu 5 V vào GPIO ESP32.

Tháo jumper ENA/ENB trên L298N để GPIO23 và GPIO5 điều khiển PWM tốc độ.

## Cài đặt

1. Cài Arduino IDE và board package **esp32 by Espressif Systems** (đã thử với bản 3.3.10).
2. Tạo `robot_config.h` cạnh file `.ino`. Giá trị đang dùng:

   ```c
   #pragma once
   #define WIFI_SSID "iot"
   #define WIFI_PASSWORD "mat-khau-wifi"

   #define LINE_SENSOR_PIN 34
   #define LINE_SENSOR_ANALOG 1
   #define LINE_SENSOR_THRESHOLD 85
   #define LINE_SENSOR_HYSTERESIS 30
   #define LINE_SENSOR_FLOOR_MAX 1500
   #define LINE_BLACK_BELOW_THRESHOLD 0   // 0: vạch đen cho ADC cao hơn ngưỡng
   #define LINE_DIGITAL_BLACK_LOW 0

   #define PWM_MIN 60
   #define PWM_MAX 160
   #define ACCELERATION_MS 8000
   ```

3. Kết nối Pi và ESP32 vào **cùng một mạng Wi-Fi**.
4. Chọn board **ESP32 Dev Module**, nạp `esp32_line_robot.ino`. Mở Serial Monitor 115200 baud để xem dòng "Wi-Fi: nhận IP …". Sau đó xem log qua Wi-Fi tại `http://<IP-ESP32>/logs`.

Bằng dòng lệnh:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 .
arduino-cli upload  --fqbn esp32:esp32:esp32 -p COM17 .
```

Ngưỡng cảm biến và thông số động cơ chỉnh qua web được lưu trong flash (NVS); nạp lại firmware không xóa chúng.

## Cách đo chính xác

- Cảm biến được đọc trong một **tác vụ riêng mỗi 1 ms**, ưu tiên cao hơn web server, nên việc Pi hỏi dữ liệu không làm lệch thời điểm qua vạch.
- Mỗi mẫu được phân loại: ADC > ngưỡng + vùng đệm là đen; ADC < ngưỡng − vùng đệm là trắng; ở giữa là vùng đệm (giữ trạng thái cũ); ADC > `LINE_SENSOR_FLOOR_MAX` là **không thấy mặt sàn** (xe bị nhấc lên, ra ngoài mép bàn), coi như trắng để không đếm thành vạch.
- Thời điểm qua vạch lấy từ **mẫu đen đầu tiên** (đồng hồ micro giây), sau khi đã xác nhận đủ `LINE_CONFIRM_SAMPLES` mẫu đen liên tiếp. Xe phải ra khỏi vạch (`WHITE_CONFIRM_SAMPLES` mẫu trắng) mới đếm vạch tiếp theo. Hai vạch cách nhau dưới `MIN_LINE_INTERVAL_MS` bị bỏ qua.
- Vận tốc được tính **trên ESP32 ngay tại vạch**; độ trễ mạng không ảnh hưởng kết quả.
- Mỗi số đo có số thứ tự (`seq`). ESP32 giữ 64 số đo gần nhất.

## Truyền dữ liệu cho Raspberry Pi

### HTTP, cổng 80

```bash
curl -X POST http://<IP-ESP32>/start                # xe chạy, bắt đầu một lần đo mới
curl -X POST http://<IP-ESP32>/stop                 # dừng xe
curl -X POST http://<IP-ESP32>/reset                # dừng và xóa số vạch
curl "http://<IP-ESP32>/status?since=0"             # trạng thái + các số đo có seq > since
curl "http://<IP-ESP32>/status?since=0&udp=4210"    # như trên, đăng ký nhận UDP ở cổng 4210
```

Ví dụ `/status`:

```json
{"type":"speed","boot_id":184467,"seq":3,"value":1.237,"unit":"km/h","speed_mps":0.3436,
 "segment_speed_mps":0.3436,"distance_m":0.40,"line_count":4,"line_spacing_m":0.100,
 "elapsed_s":1.62,"pwm":110,"running":true,"stop_reason":"","sensor_raw":18,"on_line":false,"log_seq":152,
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
| `sensor_raw`, `on_line` | Giá trị ADC hiện tại và đang thấy đen hay trắng |
| `stop_reason` | Lý do dừng: lệnh dừng, mất Wi-Fi |
| `log_seq` | Số thứ tự dòng log mới nhất |

### UDP

Sau khi một máy gọi `/status?...&udp=<cổng>`, ESP32 ghi nhớ IP của máy đó và gửi một gói UDP ngay khi đo xong mỗi vạch:

```json
{"type":"speed_event","boot_id":184467,"seq":3,"line":4,"t_s":1.472,"interval_s":0.2910,"speed_mps":0.3436,"speed_kmh":1.237}
```

Ứng dụng trên Pi nghe ở cổng 4210 và chỉ nhận gói có `seq` liền sau số đo cuối đã có; gói bị mất được lấy bù qua `/status?since=n`.

## Trang web, log và chẩn đoán

| Địa chỉ | Nội dung |
| --- | --- |
| `http://<IP-ESP32>/` | Nút Bắt đầu/Dừng/Đặt lại, bảng các vạch, giá trị cảm biến, khung **Hiệu chuẩn cảm biến** và **Tăng tốc của xe** |
| `http://<IP-ESP32>/logs` | Xem log trực tiếp, cập nhật mỗi giây: tạm dừng, ẩn/hiện chi tiết cảm biến, tải file log, khởi động lại ESP32 |
| `GET /log?since=n` | Log dạng văn bản, mỗi dòng `#số [giây] mức nội dung` |
| `GET /log.json?since=n` | Log dạng JSON |
| `GET /diag` | Chẩn đoán: lý do khởi động, thời gian chạy, RAM, Wi-Fi (RSSI, số lần mất kết nối), cấu hình và giá trị cảm biến |
| `GET /config?threshold=85&hysteresis=30&floor=1500&black=high` | Đổi cấu hình cảm biến; `black=high`: đen cho ADC cao hơn ngưỡng. Lưu vào flash |
| `GET /motor?pwm_min=60&pwm_max=160&accel_ms=8000` | Đổi PWM lúc bắt đầu, PWM tối đa, thời gian tăng đều. Lưu vào flash |
| `POST /reboot` | Khởi động lại ESP32 |

Không cần cắm dây UART: firmware ghi mọi sự kiện vào bộ đệm 250 dòng trong RAM (đồng thời in ra Serial 115200 baud). Log lúc khởi động, trước khi có Wi-Fi, vẫn được giữ.

Mức log: `I` thông tin, `W` cảnh báo, `E` lỗi, `D` chi tiết cảm biến. Những gì được ghi:

- Khởi động: phiên bản firmware, **lý do khởi động lại** (bật nguồn, sụt áp, lỗi chương trình, watchdog), cấu hình cảm biến và động cơ.
- Wi-Fi: liên kết, nhận IP, mất kết nối kèm lý do (sai mật khẩu, không tìm thấy mạng…).
- Lệnh từ Pi hoặc trình duyệt (Bắt đầu, Dừng, Đặt lại, đổi cấu hình) kèm IP người gửi; máy đăng ký nhận UDP; HTTP 404.
- Cảm biến: vào/ra vạch kèm giá trị ADC và thời gian nằm trên vạch; vạch bị bỏ qua vì quá gần vạch trước; thời gian không thấy mặt sàn.
- Mỗi vạch đo được: thời điểm, Δt, vận tốc. Động cơ: PWM lúc chạy, lúc đạt tối đa; lý do dừng và tổng kết lần chạy.
- Tóm tắt định kỳ (2 s khi chạy, 15 s khi đứng yên): số vạch, PWM, khoảng ADC nhỏ nhất–lớn nhất, số lần nhiễu, tín hiệu Wi-Fi, RAM trống.

## Hiệu chuẩn và tùy chỉnh

1. Đặt xe trên đường chạy, mở `http://<IP-ESP32>/`, đọc dòng **Cảm biến** khi đặt trên mặt bàn và trên băng đen. Giá trị lúc xe chạy (xem các dòng `D Vào vạch … ADC=` trong `/logs`) là chính xác nhất.
2. Trong **Hiệu chuẩn cảm biến**, đặt ngưỡng ở giữa hai giá trị, vùng đệm khoảng 1/4 khoảng cách giữa hai giá trị, chọn chiều vạch đen, bấm **Lưu**. Cấu hình đã lưu tự bị bỏ qua nếu đổi chân hoặc kiểu đọc cảm biến trong `robot_config.h`.
3. Trong **Tăng tốc của xe**, chỉnh PWM lúc bắt đầu, PWM tối đa, thời gian tăng.

Số đo ngày 26/11/2026 với cảm biến cách mặt bàn khoảng 1 cm: mặt bàn 16–30, băng đen 145–191 khi xe chạy; xe bị nhấc lên 400–4 095. Ngưỡng chọn 85 ± 30.

Các tham số chỉ đổi được khi nạp lại firmware (thêm `#define` vào `robot_config.h`):

| Tham số | Mặc định trong `.ino` | Ý nghĩa |
| --- | --- | --- |
| `LINE_SPACING_M` | `0.10f` | Khoảng cách giữa hai vạch (m) |
| `LINE_SENSOR_THRESHOLD`, `LINE_SENSOR_HYSTERESIS` | `1800`, `150` | Ngưỡng, vùng đệm mặc định (khi chưa lưu cấu hình qua web) |
| `LINE_SENSOR_FLOOR_MAX` | `0` (tắt) | ADC lớn hơn giá trị này là không thấy mặt sàn |
| `LINE_CONFIRM_SAMPLES` | `3` | Số ms liên tục thấy đen để xác nhận vạch |
| `WHITE_CONFIRM_SAMPLES` | `5` | Số ms liên tục thấy trắng để xác nhận đã qua vạch |
| `MIN_LINE_INTERVAL_MS` | `40` | Bỏ qua hai vạch gần nhau hơn (giới hạn đo ~2,5 m/s) |
| `LINE_TIMEOUT_MS` | `0` (tắt) | Tự dừng nếu quá thời gian này không thấy vạch |
| `MAX_LINES` | `0` (tắt) | Tự dừng sau N vạch |
| `PWM_MIN`, `PWM_MAX`, `ACCELERATION_MS` | `160`, `255`, `6000` | PWM lúc bắt đầu, PWM tối đa, thời gian tăng đều mặc định (khi chưa lưu qua web) |
| `LOG_CAPACITY` | `250` | Số dòng log giữ trong RAM |

**Vạch đen nên rộng 1,5–2 cm.** Cảm biến cần thấy đen ít nhất 3 ms: ở 1 m/s xe đi 3 mm trong 3 ms, nên vạch quá mảnh hoặc xe quá nhanh có thể bị bỏ sót.

Mạch L298N sụt áp và nóng khi tải lớn. Dùng nguồn động cơ riêng, nối chung GND với ESP32, không cấp động cơ từ chân 3V3 của ESP32. Ở PWM thấp (dưới khoảng 90) động cơ chưa đủ lực để lăn; xe sẽ lăn khi PWM tăng tới. Không có encoder nên vận tốc thực tế phụ thuộc pin và mặt sàn, vì vậy mới cần đo bằng vạch.

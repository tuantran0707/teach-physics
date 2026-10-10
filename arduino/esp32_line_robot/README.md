# ESP32 robot dò vạch 10 cm

Firmware cho ESP32 DevKit, L298N và một cảm biến phản xạ hồng ngoại. Cảm biến dùng để đếm các vạch đen ngang cách nhau 10 cm; một cảm biến không thể tự xác định xe lệch trái hay phải để bám một đường line uốn cong.

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

Động cơ trái: OUT1 nối dây đỏ, OUT2 nối dây đen. Động cơ phải: OUT3 nối dây đỏ, OUT4 nối dây đen. Nếu hai bánh quay ngược chiều nhau khi lệnh chạy tới được gửi, đảo dây của một động cơ hoặc đảo cặp IN tương ứng.

**Lưu ý GPIO4:** Trên ESP32 thường, GPIO4 là ADC2; ADC2 xung đột với Wi-Fi nên không dùng ổn định cho `analogRead()` khi Wi-Fi đang bật. Vì vậy firmware mặc định yêu cầu chuyển dây A0 sang GPIO34 (ADC1). Nếu cảm biến có chân DO digital và đã chỉnh được ngưỡng trên module, có thể giữ tín hiệu tại GPIO4: sửa `LINE_SENSOR_PIN` thành `4`, `LINE_SENSOR_ANALOG` thành `0` trong `robot_config.h` và dùng DO thay cho A0. Không đưa tín hiệu 5 V vào GPIO ESP32.

Tháo jumper ENA/ENB trên module L298N nếu module có jumper cố định enable; GPIO23 và GPIO5 sẽ điều khiển PWM tốc độ.

## Cài đặt

1. Cài Arduino IDE và board package **esp32 by Espressif Systems**.
2. Sao chép `robot_config.h.example` thành `robot_config.h` trong thư mục sketch và điền thông tin Wi-Fi cục bộ.
3. Kết nối Pi và ESP32 vào cùng một mạng Wi-Fi.
4. Chọn board ESP32 Dev Module, nạp `esp32_line_robot.ino` và mở Serial Monitor ở 115200 baud.

`robot_config.h` bị loại khỏi Git vì có thể chứa mật khẩu Wi-Fi. Không commit thông tin đăng nhập thật.

## Điều khiển và dữ liệu HTTP

ESP32 tự mở HTTP server ở cổng 80; không cần Mosquitto hoặc HTTP server riêng trên Pi. Khi kết nối Wi-Fi, Serial Monitor in JSON có trường `ip`; mở địa chỉ đó trên laptop/Pi để vào dashboard. Có thể xem IP trong danh sách thiết bị DHCP của hotspot/router nếu không dùng Serial Monitor.

```bash
curl -X POST http://<IP-ESP32>/start
curl -X POST http://<IP-ESP32>/stop
curl -X POST http://<IP-ESP32>/reset
curl http://<IP-ESP32>/status
```

Trang `http://<IP-ESP32>/` có nút **Bắt đầu**, **Dừng xe** và tự đọc dữ liệu mỗi giây. `/start` và `/stop` nhận GET hoặc POST; `/command` nhận POST body `start`, `stop`, `{"cmd":"start"}` hoặc `{"cmd":"stop"}`. `/status` và `/api/speed` trả JSON hiện tại, có thể gọi từ Pi, laptop hoặc ứng dụng cùng Wi-Fi.

Khi xe chạy, ESP32 cập nhật và in một dòng JSON ra Serial mỗi giây. Dashboard cùng các client HTTP đọc cùng schema:

```json
{"type":"speed","value":0.72,"unit":"km/h","average_speed_mps":0.2,"segment_speed_mps":0.25,"distance_m":0.1,"line_count":1,"elapsed_s":0.5,"pwm":110,"running":true}
```

`value` là tốc độ trung bình km/h, đúng đơn vị Bài 3 đang hiển thị; `average_speed_mps` là cùng giá trị theo m/s. `segment_speed_mps` tính từ thời gian giữa hai vạch gần nhất. Xe đếm mỗi lần chuyển từ nền trắng sang vạch đen thành 0,10 m; tốc độ trung bình bằng tổng quãng đường đã đếm chia thời gian từ lúc nhận lệnh START. Đây là tốc độ vô hướng; một cảm biến đơn không xác định được vector hướng.

Trong Bài 3 của ứng dụng Electron, nhập `http://<IP-ESP32>` vào ô **ESP32 qua HTTP** rồi nhấn **Kết nối**. Biểu đồ sẽ lấy mẫu mỗi giây từ `/api/speed`; nút chạy/dừng và đặt lại điều khiển robot qua HTTP. Dashboard của ESP32 tại `/` vẫn có thể mở độc lập trên Pi hoặc laptop.

## Hiệu chuẩn

- Mặc định vạch đen cho giá trị analog thấp hơn ngưỡng 1800. Nếu cảm biến cho giá trị cao hơn trên vạch đen, đặt `LINE_BLACK_BELOW_THRESHOLD` thành `0`.
- Đặt `LINE_SENSOR_THRESHOLD` giữa giá trị đo trên nền trắng và trên vạch đen. Có thể kiểm tra số ADC tạm thời bằng một sketch đọc `analogRead(34)` trước khi nạp firmware này.
- `PWM_MIN` và `PWM_MAX` nằm trong file `.ino`; chỉnh hai mức này theo động cơ, pin và mặt sàn. Mặc định xe tăng tuyến tính từ PWM 105 lên 205 trong 10 giây.
- Bánh xe phải chạm nền ổn định; vạch đen rộng vừa đủ để cảm biến nhận rõ. Firmware debounce 25 ms và bỏ qua các lần đếm cách nhau dưới 120 ms.

Mạch L298N có sụt áp và nóng khi tải lớn. Dùng nguồn động cơ riêng phù hợp, nối chung GND với ESP32, và không cấp động cơ từ chân 3V3 của ESP32.
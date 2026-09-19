# Giao thức và hiệu chuẩn cảm biến

## 1. Cảm biến lực

Phần cứng gợi ý: load cell phù hợp dải lực + HX711 + Arduino/ESP32. Không cấp tín hiệu 5 V trực tiếp vào GPIO của Raspberry Pi.

Quy trình hiệu chuẩn:

1. Đọc giá trị khi không tải làm `rawZero`.
2. Đặt một vật có khối lượng chuẩn `m` (kg), lực chuẩn là `F = m × 9,81` N.
3. Đọc `rawKnown`, tính `scale = (rawKnown - rawZero) / F`.
4. Khi đo: `forceN = (raw - rawZero) / scale`.
5. Gửi `{"type":"force","value":forceN}` mỗi 50–100 ms.

Trong bài học, ma sát nghỉ **không luôn bằng 60 N**. Nó tự cân bằng lực kéo từ 0 đến tối đa 60 N. Chỉ khi lực tác dụng vượt 60 N, vật mới bắt đầu chuyển động.

## 2. Cảm biến vận tốc

Gắn nam châm lên bánh xe và dùng cảm biến Hall, hoặc dùng encoder. Với bán kính bánh `r` (m), chu vi là `C = 2πr`. Nếu đo được `p` xung trong khoảng `Δt`, cảm biến có `k` xung/vòng:

```text
speed_kmh = (p / k) × C / Δt × 3.6
```

Gửi `{"type":"speed","value":speed_kmh}` khoảng 5–10 lần/giây. Giao diện lấy một mẫu vào bảng mỗi giây.

## 3. Kiểm thử không có phần cứng

- Bài lực: kéo thanh trượt từ 0 đến 100 N.
- Bài vận tốc: nhấn **Bắt đầu chạy**. Ứng dụng tạo một hành trình mẫu tăng tốc, chạy đều rồi giảm tốc.
- Khi dữ liệu thật đến, dữ liệu mô phỏng vận tốc tự ngừng và đồng hồ dùng giá trị cảm biến.


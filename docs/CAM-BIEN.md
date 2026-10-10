# Giao thức và hiệu chuẩn cảm biến

## 1. Cảm biến lực

Phần cứng gợi ý: load cell phù hợp dải lực + HX711 + Arduino/ESP32. Không cấp tín hiệu 5 V trực tiếp vào GPIO của Raspberry Pi.

Quy trình hiệu chuẩn:

1. Đọc giá trị khi không tải làm `rawZero`.
2. Đặt một vật có khối lượng chuẩn `m` (kg), lực chuẩn là `F = m × 9,81` N.
3. Đọc `rawKnown`, tính `scale = (rawKnown - rawZero) / F`.
4. Khi đo: `forceN = (raw - rawZero) / scale`.
5. Gửi dữ liệu lực mỗi 200 ms, giới hạn trong dải 0–60 N.

Trong mô hình bài học, lực ma sát được đặt ở mức **30 N**. Khi lực tác dụng vượt 30 N, xe bắt đầu chuyển động. Giá trị lực cảm biến được giới hạn tối đa ở 60 N.

Firmware FSR402 ánh xạ tuyến tính dải ADC từ `ADC_ZERO` tới `ADC_SATURATION` thành 0–60 N. Cách này ưu tiên khả năng điều khiển đồng đều trên giao diện; FSR402 không phải load cell nên giá trị Newton chỉ mang tính mô phỏng nếu chưa hiệu chuẩn bằng tải chuẩn.

Để số đo ổn định, firmware lọc EMA với hệ số `0,30`, dùng vùng chết `3 N` và làm tròn đầu ra theo bước `0,5 N`. Dữ liệu vẫn được gửi mỗi 200 ms nhưng giá trị hiển thị chỉ thay đổi khi lực lệch ít nhất 3 N.

## 2. Cảm biến vận tốc

Gắn nam châm lên bánh xe và dùng cảm biến Hall, hoặc dùng encoder. Với bán kính bánh `r` (m), chu vi là `C = 2πr`. Nếu đo được `p` xung trong khoảng `Δt`, cảm biến có `k` xung/vòng:

```text
speed_kmh = (p / k) × C / Δt × 3.6
```

Gửi `{"type":"speed","value":speed_kmh}` khoảng 5–10 lần/giây. Giao diện lấy một mẫu vào bảng mỗi giây.

## 3. Kiểm thử không có phần cứng

- Bài lực: kéo thanh trượt từ 0 đến 60 N.
- Bài vận tốc: nhấn **Bắt đầu chạy**. Ứng dụng tạo một hành trình mẫu tăng tốc, chạy đều rồi giảm tốc.
- Khi dữ liệu thật đến, dữ liệu mô phỏng vận tốc tự ngừng và đồng hồ dùng giá trị cảm biến.


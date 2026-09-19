# Phòng thí nghiệm Vật lý tương tác

Ứng dụng Electron tối ưu cho Raspberry Pi 4 và màn hình cảm ứng 7 inch (khuyến nghị độ phân giải 1024×600). Bản MVP gồm:

- Bài 1: trò chơi **Khu vườn trên mây**. Sóc Nâu đấu với Robot hoặc học sinh thứ hai; bản đồ sinh ngẫu nhiên có kiểm tra đường đi, gồm bốn loại quả, mỗi loại xuất hiện ba lần và người chơi cần trả lời câu hỏi Vật lý để thu hoạch đủ ba loại. Sóc di chuyển từng bước có chú thích hướng; khi tới đích, trò chơi phát lại toàn bộ hành trình và so sánh quãng đường với vectơ độ dịch chuyển từ Hang Sóc tới Hội chợ.
- Bài 2: mô phỏng vật có `P = 50 N`, `N = 50 N`, ma sát nghỉ cực đại `60 N`; hỗ trợ ẩn/hiện số liệu và nhận lực đo từ cảm biến.
- Bài 3: bảng đồng hồ xe, tốc độ tức thời, xi nhan, thời gian, đồ thị và bảng vận tốc–thời gian.
- Bài 4: vị trí mô-đun trống để bổ sung giáo án sau.

Ứng dụng tự chạy mô phỏng khi chưa cắm cảm biến.

## Chạy thử trên máy tính

Yêu cầu Node.js 22 trở lên.

```bash
npm install
npm start
```

Chế độ phát triển có DevTools:

```bash
npm run dev
```

## Cài trên Raspberry Pi 4

Nên dùng **Raspberry Pi OS 64-bit**. Electron 44 không còn phát hành gói Linux ARM 32-bit, vì vậy hệ điều hành `armv7l` không phù hợp với phiên bản này.

```bash
sudo apt update
sudo apt install -y nodejs npm libgtk-3-0 libnss3 libasound2t64
cd /duong-dan/den/teach-physics
npm install
npm start
```

Ứng dụng tự toàn màn hình khi phát hiện Linux ARM/ARM64. Để tự khởi động sau khi đăng nhập desktop:

```bash
mkdir -p ~/.config/autostart
cp deploy/vat-ly-tuong-tac.desktop ~/.config/autostart/
nano ~/.config/autostart/vat-ly-tuong-tac.desktop
```

Sửa đường dẫn trong dòng `Exec` cho đúng thư mục thực tế trên Pi. Có thể tắt screen blanking trong phần cấu hình Raspberry Pi để thiết bị luôn hiển thị.

## Kết nối phần cứng

Giải pháp ổn định nhất là để Arduino/ESP32 đọc HX711 (load cell) và cảm biến Hall/encoder, rồi gửi dữ liệu tới Raspberry Pi qua USB. Nhấn nút **Chế độ mô phỏng** trên màn hình chính để chọn cổng.

Thiết bị gửi UTF-8, tốc độ `115200 baud`, mỗi dòng là một JSON hoàn chỉnh:

```text
{"type":"force","value":72.4}
{"type":"speed","value":8.6}
```

- `force.value`: lực tác dụng, đơn vị N.
- `speed.value`: vận tốc tức thời, đơn vị km/h.

Xem chi tiết hiệu chuẩn và công thức trong [docs/CAM-BIEN.md](docs/CAM-BIEN.md).

## Kiến trúc để nâng cấp

- `src/main.js`: cửa sổ Electron và USB serial.
- `src/preload.js`: cầu nối IPC an toàn, không bật Node.js trong giao diện.
- `src/renderer/lessons/`: mỗi bài là một mô-đun độc lập.
- Nhận diện giọng nói sau này có thể phát sự kiện trả lời `true/false` vào bài 1.
- Âm thanh có thể thêm bằng Web Audio hoặc file âm thanh cục bộ, không cần đổi giao thức cảm biến.

## Tài sản nhân vật

Bài Khu vườn trên mây sử dụng hình Sóc Nâu và Robot từ OpenMoji theo giấy phép CC BY-SA 4.0. Nguồn và thông tin ghi công được lưu tại [docs/TAI-SAN-HINH-ANH.md](docs/TAI-SAN-HINH-ANH.md).

## Kiểm tra mã

```bash
npm run check
```

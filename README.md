# Phòng thí nghiệm Vật lý tương tác

Ứng dụng Electron dành cho Raspberry Pi 3B+/4 và màn hình cảm ứng 7 inch (khuyến nghị độ phân giải 1024×600). Bản MVP gồm:

- Bài 1: trò chơi **Khu vườn trên mây**. Sóc Nâu đấu với Robot hoặc học sinh thứ hai; bản đồ sinh ngẫu nhiên có kiểm tra đường đi, gồm bốn loại quả, mỗi loại xuất hiện ba lần và người chơi cần trả lời câu hỏi Vật lý để thu hoạch đủ ba loại. Sóc di chuyển từng bước có chú thích hướng; khi tới đích, trò chơi phát lại toàn bộ hành trình và so sánh quãng đường với vectơ độ dịch chuyển từ Hang Sóc tới Hội chợ.
- Bài 2: mô phỏng vật có `P = 50 N`, `N = 50 N`, lực ma sát `30 N`; hỗ trợ ẩn/hiện số liệu và nhận lực đo từ cảm biến trong dải `0-60 N`.
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

## Cài trên Raspberry Pi 3B+ hoặc 4

Pi 3B+ với Raspberry Pi OS 64-bit là cấu hình khuyến nghị. Với Raspberry Pi OS 32-bit (`armv7l`), dự án dùng Electron 39.8.10 để tương thích với gói Node.js 20 của Raspbian và dùng được bản Electron Linux ARM 32-bit. Electron 39 đã cũ và không còn được cập nhật bảo mật; đây chỉ là phương án tương thích tạm thời, không phù hợp để phơi ứng dụng ra Internet. Pi 3B+ chỉ có 1 GB RAM; nên đóng các ứng dụng khác trong lúc cài và chạy thử với màn hình thực tế.

### 1. Kiểm tra Raspberry Pi qua SSH

Từ PowerShell trên máy Windows, thay `<user>` và `<pi-ip>` bằng tài khoản và địa chỉ của Pi (SSH sẽ hỏi mật khẩu):

```powershell
ssh <user>@<pi-ip>
```

Sau khi đăng nhập, kiểm tra kiến trúc, phiên bản hệ điều hành và bộ nhớ:

```bash
uname -m
cat /etc/os-release
free -h
```

`uname -m` trả về `aarch64` cho OS 64-bit hoặc `armv7l` cho OS 32-bit.

### 2. Cài Node.js và thư viện hệ thống

Cài Node.js và npm từ kho Raspberry Pi OS:

```bash
sudo apt update
sudo apt install -y nodejs npm libgtk-3-0 libnss3 libgbm1 libasound2t64 \
  fonts-noto-color-emoji libudev-dev build-essential python3
node --version
npm --version
```

Node.js 20 có sẵn trong Raspberry Pi OS 13 (Trixie) armhf đáp ứng yêu cầu của Electron 39.8.10. Nếu tên gói `libasound2t64` không tồn tại trên phiên bản Raspberry Pi OS đang dùng, thay bằng `libasound2`.

Trên Raspberry Pi OS Desktop, cài `fonts-noto-color-emoji` để hiển thị các biểu tượng emoji trái cây và chướng ngại vật trong trò chơi; sau khi cài font, thoát hẳn và mở lại ứng dụng.

### 3. Chép mã nguồn và chạy ứng dụng

Đưa mã nguồn dự án lên Pi (ví dụ clone repository của bạn vào `/home/<user>/teach-physics`), sau đó cài và chạy trên Pi:

```bash
cd /home/<user>/teach-physics
npm install
```

`npm install` tải bản Electron phù hợp với kiến trúc Pi (`armv7l` hoặc `arm64`) và cài các gói tùy chọn như `serialport`. Hãy chạy lệnh này trên Pi, không sao chép `node_modules` đã cài trên Windows. Cần kết nối Internet trong lần cài đầu tiên.

Nếu `npm start` báo `spawn .../electron.exe EACCES`, thư mục `node_modules` đang chứa Electron bản Windows. Cài lại đúng binary Linux ngay trên Pi, không xóa `package-lock.json`:

```bash
rm -rf node_modules
npm install
npm start
```

Để thử chạy, mở Terminal trên desktop của Pi, vào thư mục dự án rồi chạy `npm start`. Ứng dụng cần phiên desktop đồ họa; chạy từ SSH thông thường sẽ không có màn hình để hiển thị. Ứng dụng tự toàn màn hình khi phát hiện Linux ARM/ARM64. Để tự khởi động sau khi đăng nhập desktop:

```bash
mkdir -p ~/.config/autostart
cp deploy/vat-ly-tuong-tac.desktop ~/.config/autostart/
nano ~/.config/autostart/vat-ly-tuong-tac.desktop
```

Sửa đường dẫn `/home/pi/teach-physics` trong các dòng `Exec` và `Path` thành thư mục cài thực tế (ví dụ `/home/<user>/teach-physics`). Tự khởi động yêu cầu đăng nhập vào desktop; có thể tắt screen blanking trong phần cấu hình Raspberry Pi để thiết bị luôn hiển thị.

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

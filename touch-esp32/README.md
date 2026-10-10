# ESP32 doc FSR402 va gui UART

Sketch `fsr402_uart.ino` doc cam bien luc FSR402 moi 200 ms va gui cho
Raspberry Pi theo tung dong:

```text
value:10.00N
value:10.12N
```

## Dau noi

- `3V3 -> FSR402 -> GPIO34`.
- Dien tro `10 kohm` tu `GPIO34 -> GND`.
- Cam cap USB tu ESP32 vao Raspberry Pi. Cap nay vua cap nguon cho ESP32,
  vua truyen du lieu serial; khong can noi GPIO16/17 hay chan UART cua Pi.

Nap file `.ino` bang Arduino IDE, chon board ESP32. Tren Raspberry Pi, cong
thuong la `/dev/ttyUSB0` (board dung chip USB-UART) hoac `/dev/ttyACM0`
(board co USB native). Baud rate la `115200`.

## Luu y hieu chuan

FSR402 khong phai load cell va sai so giua cac cam bien kha lon. Anh xa tuyen
tinh uu tien cam giac dieu khien deu tren toan dai hon la do luc vat ly chinh
xac. Co the chinh `ADC_ZERO` va `ADC_SATURATION` theo gia tri ADC thuc te cua
tung cam bien.

Sketch gioi han dau ra trong dai `0-60 N`. Khi ADC dat nguong bao hoa
4090-4095, ket qua duoc giu o `60 N`, khong nhay ve `0 N`.

Dai ADC tu `ADC_ZERO = 20` den `ADC_SATURATION = 4090` duoc anh xa tuyen
tinh thanh `0-60 N`. Vi vay moi khoang 10 N chiem mot phan bang nhau tren
dai tin hieu. Chu ky gui du lieu la 200 ms (5 mau/giay).

Gia tri duoc loc EMA voi `FILTER_ALPHA = 0.30`, sau do ap dung vung chet
`3.00 N` va lam tron theo buoc `0.50 N`. Gia tri gui len giao dien chi thay
doi khi luc da lech it nhat 3 N so voi gia tri dang hien thi.

Vi du doc tren Raspberry Pi bang Python/pyserial:

```python
import serial

with serial.Serial("/dev/ttyUSB0", 115200, timeout=1) as uart:
    while True:
        line = uart.readline().decode("ascii", errors="ignore").strip()
        if line.startswith("value:") and line.endswith("N"):
            print(line)
```

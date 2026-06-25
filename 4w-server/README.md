# 4W Workspace — Hướng dẫn cài đặt

## Cấu trúc thư mục

```
4W-FULL/
├── 4w-pwa/          ← App web (cài lên điện thoại)
│   ├── index.html
│   ├── manifest.json
│   └── sw.js
└── 4w-server/       ← Server gửi Telegram (deploy lên Render)
    ├── server.js
    └── package.json
```

---

## BƯỚC 1 — Deploy Server lên Render.com (miễn phí)

1. Tạo tài khoản tại https://render.com (dùng GitHub login)
2. Tạo repo GitHub mới → upload toàn bộ thư mục `4w-server/` vào
3. Vào Render → **New → Web Service** → kết nối repo vừa tạo
4. Cấu hình:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Thêm **Environment Variables:**
   - `TELEGRAM_BOT_TOKEN` = token bot Telegram của bạn
   - `TELEGRAM_CHAT_ID`   = 8762337019
6. Nhấn **Deploy** → chờ ~2 phút
7. Render cấp URL dạng: `https://ten-server.onrender.com`

---

## BƯỚC 2 — Deploy App PWA lên Netlify

1. Vào https://app.netlify.com/drop
2. Kéo thả thư mục `4w-pwa/` vào
3. Netlify cấp URL dạng: `https://abc123.netlify.app`

---

## BƯỚC 3 — Kết nối App với Server

1. Mở app trên điện thoại (Chrome → URL Netlify)
2. Kéo xuống phần **"Cài đặt Telegram Server"**
3. Nhập URL Render vào ô → nhấn **Lưu & Đồng bộ**
4. Nhấn **Test Telegram** → kiểm tra có nhận được tin nhắn không

---

## Cài app lên màn hình điện thoại

1. Mở Chrome trên Android
2. Vào URL Netlify
3. Nhấn menu ⋮ → "Thêm vào màn hình chính"
4. App xuất hiện như app thật, chạy offline hoàn toàn

---

## Lịch thông báo Telegram tự động

| Thời điểm | Nội dung |
|---|---|
| 7:00 sáng mỗi ngày | Tổng kết lịch trong ngày |
| 21:00 tối hôm trước | Nhắc sự kiện ngày mai |
| 3 tiếng trước sự kiện | Nhắc chuẩn bị |
| Ngay khi thêm sự kiện | Xác nhận + lịch thông báo |

---

## Lưu ý bảo mật

- **KHÔNG** để Bot Token trong file HTML hay code public
- Chỉ nhập Token vào Environment Variables của Render (được mã hóa)
- Nếu lộ token: vào BotFather → /revoke → lấy token mới → cập nhật Render

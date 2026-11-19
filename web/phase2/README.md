# Hex Arena — Phase 2

## Lệnh chạy nhanh

```bash
cd web/phase2
npm install
npm start
```

> **Lưu ý khi chạy lần đầu (để mở link chơi online qua ngrok):**
> 1. Sao chép `.env.example` thành `.env` và điền `NGROK_AUTHTOKEN` cùng `NGROK_DOMAIN`.
> 2. Chạy `npm start` để khởi động đồng thời:
>    - Máy chủ PvP 60Hz + Tài khoản SQLite (`ws://localhost:3001/ws`)
>    - Giao diện Web Vite (`http://localhost:5173`)
>    - Tunnel ngrok công khai (`https://hexarena.ngrok.app`)
> 3. Nhấn `Ctrl + C` để tắt toàn bộ.

## Các lệnh khác

```bash
# Chỉ chạy nội bộ (không mở ngrok)
node start.mjs --local

# Kiểm tra TypeScript
npm run typecheck

# Chạy toàn bộ unit test
npm test

# Build bản production
npm run build
```

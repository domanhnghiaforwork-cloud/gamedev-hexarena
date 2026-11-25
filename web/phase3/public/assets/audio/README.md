# Audio Assets

Thư mục này dùng để lưu trữ file hiệu ứng âm thanh (`.ogg`, `.mp3`, `.wav`) và nhạc nền (BGM) cho Phase 3.
Khai báo đường dẫn `assetUrl: '/assets/audio/<ten-file>'` trong `src/audio/sfxRegistry.ts`; nếu chưa có file hoặc đang offline, `AudioManager` tự động fallback sang bộ tổng hợp Web Audio (`synthEngine.ts`).

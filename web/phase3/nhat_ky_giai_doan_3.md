# NHẬT KÝ PHÁT TRIỂN — GIAI ĐOẠN 3 (HEX ARENA WEB PHASE 3)

Tài liệu ghi nhận quá trình phát triển nhánh **Giai đoạn 3** trong thư mục `web/phase3/` (kế thừa nền tảng từ `web/phase2/` ở bản `v2.13`, giữ nguyên tuyệt đối mã nguồn `web/phase1/` và `web/phase2/`).

---

## v3.0 — 25/11/2026: Khởi tạo môi trường phát triển Giai đoạn 3 (Baseline từ Phase 2 v2.13)

* **Tách lập môi trường `web/phase3/` độc lập với `web/phase2/`:**
  * Xóa nhật ký phát triển riêng của Giai đoạn 2 (`nhat_ky_giai_doan_2.md`), thư mục build cũ (`dist/`), bộ nhớ đệm Vite (`node_modules/.vite*`) và dữ liệu SQLite/session secret cũ của Giai đoạn 2 (`server/data/`).
  * Cập nhật thông tin gói (`package.json`, `package-lock.json` sang `hex-arena-web-phase3` v`3.0.0`), tài liệu hướng dẫn (`README.md`), chú thích script/CSS (`start_ngrok.ps1`, `src/styles/main.css`).
  * Tách riêng toàn bộ khóa lưu trữ trình duyệt `localStorage` sang tiền tố `hex_arena_p3_*` (`src/storage/profiles.ts`, `src/net/authClient.ts`, `src/main.ts`) để tránh xung đột dữ liệu phiên đăng nhập, vũ khí và cấu hình phím với Giai đoạn 2.
  * Giữ nguyên tệp cấu hình `.env` cục bộ và toàn bộ kiến trúc lõi mô-đun (`src/core/`, `src/ai/`, `src/render/`, `src/input/`, `src/ui/`, `src/net/`, `server/`, `tests/`).
* **Kiểm chứng baseline:**
  * Xác nhận `npm run typecheck`, `npm test` (29/29 unit tests qua 6 bộ kiểm thử) và `npm run build` hoạt động sạch sẽ trên môi trường Giai đoạn 3.

---

## v3.1 — 25/11/2026: Tái cấu trúc thư mục phân cấp sâu, chuẩn hóa Font tiếng Việt & Kiến trúc Registry 1-N cho Phương thức Tấn công / Kỹ năng Đặc biệt

* **Chuẩn hóa Font tiếng Việt toàn dự án (`index.html`, `src/config/typography.ts`, `src/styles/base/tokens.css`, `src/styles/base/reset.css`):**
  * Nạp cặp font hỗ trợ đầy đủ dấu tiếng Việt **`Be Vietnam Pro`** (400–900) và **`JetBrains Mono`**, đồng bộ giữa CSS (`--font-ui`, `--font-mono`, kế thừa trên toàn bộ `button/input/select/textarea`) và Canvas 2D thông qua helper duy nhất `canvasFont()` + `ensureFontsLoaded()` (thay thế toàn bộ 28 chỗ dùng `system-ui, sans-serif` rời rạc trước đây).
* **Kiến trúc Registry 1-N cho Phương thức Tấn công & Kỹ năng Đặc biệt (`src/core/attacks/`):**
  * Tách `skills.ts` nguyên khối thành thư mục phân cấp theo từng phương thức (`loose/`, `ranged/`, `melee/`, `defense/`), mỗi thư mục chứa `attack.ts` và thư mục `specials/` cho phép 1 phương thức tấn công gắn nhiều kỹ năng đặc biệt khác nhau.
  * Bổ sung `src/core/attacks/registry.ts` (`registerAttackMode`, `registerSpecialSkill`, `resolveFighterSpecialSkill`, `executeFighterAttack`, `triggerFighterSpecial`, `updateActiveSpecialSkill`) cùng trường tùy chọn `specialSkillId` trong `WeaponBlueprint` và `skillId` trong `SpecialActiveState`.
* **Phân cấp sâu `core/`, `audio/`, `render/`, `ui/`, `styles/` & `public/assets/`:**
  * `src/core/` tách thành `math/`, `world/`, `attacks/`, `physics/` (100% thuần logic dùng chung Client + Server PvP).
  * Thay `src/feedback/` bằng `src/audio/` (`synthEngine.ts`, `sfxRegistry.ts`, `audioManager.ts`, `haptics.ts`) sẵn sàng mở rộng file âm thanh `.ogg/.mp3` + fallback synth.
  * `src/render/` phân cấp `world/`, `effects/`, `hud/`, `assets/assetLoader.ts`; `src/ui/` phân cấp `common/`, `screens/`, `hud/`, `modals/`; `src/styles/main.css` tách thành 7 tầng CSS giữ nguyên thứ tự cascade.
* **Kiểm thử & Xác minh:**
  * Bổ sung `tests/attackRegistry.test.ts` kiểm chứng đăng ký & chạy thực tế kỹ năng mở rộng thứ 2 cho nhánh `melee` cùng cấu hình font tiếng Việt.

---

## v3.2 — 25/11/2026: Nâng tầm Cảm giác Game (SFX WAV theo vật liệu, Nhạc nền động theo HP, VFX 2.5D, Bảng tổng kết trận & Cá nhân hóa lưu SQLite)

* **Âm thanh có chiều sâu & Nhạc nền thích ứng (`scripts/generateAudioAssets.mjs`, `public/assets/audio/sfx/`, `src/audio/`):**
  * Tạo 16 file `.wav` đa lớp cho toàn bộ `SfxKind` với fallback tự động về `SynthEngine` và biến thiên nhẹ cao độ (`playbackRate 0.96–1.04`).
  * Phân biệt âm va chạm theo chất liệu mảnh (`clashHeavy` kim loại trầm, `clash` thép cân bằng, `clashSharp` tinh thể sắc bén), âm gió chém `meleeWhoosh` và hiệu ứng `gravityField`.
  * Bổ sung `BgmEngine` phát nhạc Sảnh (`96 BPM`) và nhạc Trận đấu (`118 BPM` tự tăng nhịp tối đa `136 BPM` + tầng trống/giai điệu căng thẳng khi HP một trong hai bên xuống $\le 30\%$).
  * Thêm 3 thanh trượt **Âm lượng tổng / SFX / Nhạc nền** kèm nút `Thử âm` trong Cài đặt (`localStorage`).
* **Thị giác 2.5D, VFX & Bảng tổng kết trận đấu chi tiết (`src/render/`, `src/core/`, `src/ui/hud/topBar.ts`, `index.html`):**
  * Nâng cấp bóng đổ 2 lớp cho vật cản/nhân vật/mảnh bay cao, đường hàn năng lượng 2 lớp phát sáng mượt, dải vệt chuyển động thuôn, cung chém sáng cho Đánh gần và dấu hiệu nhận diện riêng từng Ulti.
  * Mở rộng `MatchStats` (đồng bộ đảo ghế PvP qua `src/net/protocol.ts` & `pvpInterpolator.ts`) và thiết kế lại bảng kết thúc trận hiển thị **Sát thương (Bạn vs Đối thủ)**, **Mảnh phá**, **Độ chính xác (%)**, **MVP Dạng / Ulti** và thanh **Phân bổ sát thương theo 4 phương thức**.
* **Cá nhân hóa Ngoại hình & Lưu SQLite (`src/config/cosmetics.ts`, `src/ui/modals/cosmeticsModal.ts`, `server/db.ts`, `server/index.ts`, `src/net/authClient.ts`):**
  * Cho phép tùy chỉnh **5 bộ màu Neon** (giữ nguyên phe địch Đỏ san hô `#fb7185` để đọc tình huống $0.2\text{s}$), **4 kiểu hạt vỡ mảnh** và **4 hiệu ứng Lướt**, kèm Canvas xem trước động (`Thử Lướt` / `Thử Vỡ mảnh`).
  * Mở rộng bảng SQLite `users` thêm cột `cosmetics_json` và API `PUT /api/cosmetics` để đồng bộ đa thiết bị.
* **Kiểm thử:** Bổ sung `tests/phase3Polish.test.ts` xác minh 16 file WAV hợp lệ, sanitize cấu hình, lưu SQLite và telemetry chiến đấu.
* **Cân bằng Ulti Đơn lẻ (*Trường Trọng Lực*):** Tăng phạm vi vùng ảnh hưởng thêm **+40%** (`LOOSE_GRAVITY_RANGE_MULT = 1.82`) và tăng mức làm chậm mọi thực thể vật lý địch lên **80%** (`LOOSE_GRAVITY_SLOW_FACTOR = 0.20`).
* **Cập nhật 3 cơ chế chiến đấu:**
  * **Mảnh Đơn lẻ mặc định chọn hết:** Mọi mảnh tự động `selected = true` ngay khi vào trận hoặc khi chuyển về trạng thái Đơn lẻ.
  * **Ulti Đánh gần (*Phản Chém Tước Mảnh*):** Tự động phóng to kích thước **150%** trong suốt 8s nhưng vẫn giữ nguyên độ cứng/độ bền như kích thước **100%**, tự hoàn lại kích thước cũ khi hết chiêu.
  * **Ulti Phòng thủ (*Pháo Đài Phản Xung*):** Tự phát sóng xung kích phản đòn nhỏ gây sát thương mỗi khi bị tấn công trong thời gian duy trì (`miniPulseCd = 0.30s`), đồng thời mở rộng tầm & tăng lực đẩy lùi của Sóng Phản Xung cuối.

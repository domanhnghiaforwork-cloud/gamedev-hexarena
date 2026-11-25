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

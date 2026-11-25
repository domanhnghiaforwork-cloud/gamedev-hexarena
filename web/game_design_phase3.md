# GAME DESIGN DOCUMENT (GDD) — HEX ARENA WEB (PHASE 3)

* **Tên dự án:** Hex Arena — Đấu trường Lục giác
* **Nhánh phát triển:** `web/phase3/` (kế thừa toàn bộ lõi mô phỏng `60Hz`, Xưởng Vũ Khí 5–10 mảnh, Bot AI khắc chế và PvP 1v1 SQLite từ Phase 2 `v2.13`).
* **Trạng thái kiến trúc nền (`v3.1`):**
  * Tách phân cấp module sâu (`src/config/`, `src/core/{math,world,attacks,physics}`, `src/audio/`, `src/render/{world,effects,hud,assets}`, `src/ui/{common,screens,hud,modals}`, `src/styles/{base,components,screens}`).
  * Chuẩn hóa Font chữ tiếng Việt toàn dự án (`Be Vietnam Pro` + `JetBrains Mono`) đồng bộ qua `src/config/typography.ts` cho cả DOM và Canvas 2D.
  * Xây dựng **Kiến trúc Registry 1-N (`src/core/attacks/`)** cho phép mỗi Phương thức Tấn công sở hữu nhiều Kỹ năng Đặc biệt (Ulti) độc lập.

---

## GIAI ĐOẠN 3.1 (`v3.2`) — NÂNG TẦM CẢM GIÁC GAME (AUDIO, VFX, TỔNG KẾT & CÁ NHÂN HÓA)

### 1. Âm thanh có chiều sâu & Nhạc nền thích ứng (Adaptive Audio)
* **SFX WAV thực tế + Fallback Web Audio Synth:**
  * Nạp trước 16 file `.wav` đa lớp đặt tại `public/assets/audio/sfx/`, tự động fallback mượt sang bộ tổng hợp Web Audio (`synthEngine.ts`) nếu thiết bị offline hoặc chưa giải mã xong.
  * **Phân biệt âm thanh theo chất liệu vật lý:**
    * *Va chạm Mảnh Nặng (`clashHeavy`):* Tiếng kim loại rèn trầm, lực va đập đầm.
    * *Va chạm Mảnh Base/Nhẹ (`clash`):* Tiếng thép va chạm cân bằng.
    * *Va chạm Mảnh Sắc (`clashSharp`):* Tiếng tinh thể/lưỡi thép bén vang cao.
    * *Vỡ mảnh (`shatter`):* Nhiều lớp mảnh kính/tinh thể vỡ giòn.
    * *Chém Đánh gần (`meleeWhoosh`):* Tiếng gió rít khi vung cung kiếm.
    * *Trường Trọng Lực (`gravityField`):* Âm trầm hút không gian khi kích hoạt Ulti Đơn lẻ.
  * Biến thiên nhẹ cao độ (`playbackRate ±4%`) khi va chạm liên tiếp để tránh lặp đơn điệu.
* **Nhạc nền động (Procedural BGM Engine):**
  * **Nhạc Sảnh (`lobby`):** Nhịp 96 BPM êm dịu, âm nền chiến thuật công nghệ.
  * **Nhạc Trận đấu (`match`):** Nhịp 118 BPM giàu năng lượng. Khi HP của một trong hai chiến binh giảm xuống **$\le 30\%$**, hệ số căng thẳng kích hoạt tăng dần tốc độ lên tối đa **136 BPM**, mở sáng bộ lọc tần số và thêm nhịp trống dồn dập.
* **Điều chỉnh âm lượng chi tiết:** 3 thanh trượt độc lập **Âm lượng tổng (Master)**, **Hiệu ứng (SFX)** và **Nhạc nền (BGM)** kèm nút bật/tắt nhanh và nút thử âm trong phần Cài đặt, lưu bền vững trên `localStorage`.

### 2. Thị giác 2.5D, VFX & Bảng tổng kết trận đấu chi tiết
* **Đổ bóng 2.5D & Đường hàn mượt hơn:**
  * Vật cản, khối cầu nhân vật và mảnh lục giác có bóng đổ hai lớp (bóng mềm lan rộng + bóng tiếp xúc đậm, tự giãn khi mảnh bay cao thu hồi).
  * Các cạnh ghép trong trạng thái **Cầm vũ khí** hiển thị đường hàn năng lượng 2 lớp phát sáng mượt mà theo nhịp trận đấu; vệt bay mảnh sử dụng dải sáng thuôn dần (*tapered ribbon*), và đòn Đánh gần vẽ cung quét sáng (*cleave arc*).
* **Nhận diện trực quan riêng từng Ulti:**
  * *Trường Trọng Lực (Đơn lẻ):* Vòng xoáy kép nghịch chiều + các hạt năng lượng bị hút vào tâm.
  * *Ngự Thương Độc Lập (Đánh xa):* Hào quang tím Plasma + tâm khóa mục tiêu hình thoi xoay quanh điểm điều hướng.
  * *Phản Chém Tước Mảnh (Đánh gần):* Vòng hào quang vàng kim với các khấc phản đòn xoay quanh thân & viền kiếm rực sáng.
  * *Pháo Đài Phản Xung (Phòng thủ):* Khiên năng lượng ngọc lục bảo + vòng tích động năng đổi màu từ Ngọc → Vàng hổ phách → Vàng rực theo mức năng lượng phản xung.
* **Bảng Tổng kết trận đấu chi tiết:**
  * Hiển thị ngay khi kết thúc trận: Kết quả thắng/thua/hòa, thời gian đấu, **Sát thương gây ra (Bạn vs Đối thủ)**, **Số mảnh phá (Bạn vs Đối thủ)**, **Độ chính xác (% · trúng/tổng đòn)**, **MVP Chiêu / Dạng** (dạng gây sát thương cao nhất + số lần dùng Ulti) và thanh phân bổ sát thương theo 4 dạng (*Đơn lẻ / Đánh xa / Đánh gần / Phòng thủ*).

### 3. Cá nhân hóa (Cosmetics) — Lưu tài khoản SQLite
* Người chơi tự chọn trong modal **Ngoại hình & Hiệu ứng** (kèm Canvas xem trước động và nút *Thử Lướt* / *Thử Vỡ mảnh*):
  1. **Bộ màu Neon (5 bộ):** *Xanh Lam Cổ Điển (`cyan`)*, *Băng Bạch Kim (`ice`)*, *Lục Bảo (`emerald`)*, *Tử Tinh (`violet`)*, *Hoàng Kim (`gold`)*.
     * *Quy tắc đọc tình huống $0.2\text{s}$:* Phe địch luôn giữ tông Đỏ san hô `#fb7185` độc lập để không bao giờ lẫn phe trong PvP.
  2. **Kiểu hạt vỡ mảnh (4 kiểu):** *Mảnh Tinh Thể*, *Tia Điện Cao Thế*, *Vòng Xung Lượng Tử*, *Bùng Nổ Sao Neon*.
  3. **Hiệu ứng Lướt (4 kiểu):** *Ảnh Mờ Cổ Điển*, *Quang Phổ Lăng Kính*, *Tia Sét Chớp*, *Dấu Ấn Lục Giác*.
* Đồng bộ tự động lên SQLite (`users.cosmetics_json`) qua API `PUT /api/cosmetics` khi đăng nhập / khôi phục phiên.

---

## LỘ TRÌNH TIẾP THEO TRONG PHASE 3 (`v3.3+`)
* **Giai đoạn 3.2 — Mở rộng Ulti 1-N:** Bổ sung kỹ năng đặc biệt thứ 2 cho mỗi trong 4 phương thức tấn công, chọn trực tiếp trong Xưởng Vũ Khí và hiển thị rõ trên HUD.
* **Giai đoạn 3.3 — Bản đồ đấu trường & Anti-Stall:** Thêm 3–4 kiểu bố cục vật cản lựa chọn trước trận và cơ chế vòng bo chống câu giờ.
* **Giai đoạn 3.4 — Phòng tập, Quick Match & Xếp hạng:** Chế độ tập luyện tự do, ghép trận PvP 1 nút và bảng xếp hạng ELO trên SQLite.

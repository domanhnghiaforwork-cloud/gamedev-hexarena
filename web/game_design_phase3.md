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

## GIAI ĐOẠN 3.2 (`v3.3`) — BẠN BÈ, MỜI ĐẤU PVP & XEM TRỰC TIẾP THỜI GIAN THỰC

### 1. Hệ thống Bạn bè & Hiện diện Thời gian thực (Real-Time Presence)
* Lưu quan hệ bạn bè trong SQLite (`friendships`: `pending` / `accepted`), hỗ trợ gửi lời mời theo `username`, chấp nhận/từ chối và xóa bạn.
* Giao diện **Bạn bè** đặt ở cạnh trái Sảnh chờ (dạng cột thu gọn được trên PC, dạng ngăn kéo trượt bên trái trên Mobile landscape) sắp xếp theo ưu tiên hoạt động: `Đang đấu PvP` → `Đang đấu Bot` → `Trong phòng PvP` → `Ở sảnh` → `Đang xem trận` → `Ngoại tuyến`.

### 2. Mời đấu PvP 1v1 trực tiếp (`Mời`)
* Với bạn bè đang ở trạng thái `Ở sảnh`, người chơi bấm **`Mời`** ở thanh Bạn bè hoặc trong Phòng chờ PvP để gửi lời mời trực tiếp vào phòng.
* Người nhận thấy thẻ mời nổi tức thì ở góc trên phải với nút **`Vào phòng`** (vào thẳng phòng chờ) hoặc **`Từ chối`**.

### 3. Xem trận đấu Trực tiếp Thời gian thực (0 giây trễ — PvP & Bot)
* Cứ đã là bạn bè thì có quyền bấm **`Xem`** trận đang diễn ra của nhau:
  * **Trận PvP 1v1:** Server phát trực tiếp snapshot 30Hz từ `Room` đang mô phỏng 60Hz theo góc nhìn của người bạn được xem.
  * **Trận đấu Bot AI:** Trận Bot chạy local ở máy người chơi để giữ độ trễ 0ms; chỉ khi có bạn bè bấm **`Xem`**, máy người chơi bật luồng relay 20Hz (`bot_stream_toggle`) gửi snapshot qua server tới các khán giả (tắt tức thì khi không còn ai xem).
* Trong chế độ Khán giả (`spectate`), HUD ẩn điều khiển chiến đấu, hiển thị huy hiệu `TRỰC TIẾP` và nút **`Rời xem`**.

---

## GIAI ĐOẠN 3.3 (`v3.4`) — KHUNG ĐỔI KỸ NĂNG ĐẶC BIỆT (ULTI) LINH HOẠT TRONG TRẬN

* **Lưu lựa chọn theo từng phương thức (`selectedSpecialByMode`):** Ghi nhớ riêng Ulti đang chọn cho *Đơn lẻ / Đánh xa / Đánh gần / Phòng thủ* trong suốt trận đấu, đồng bộ đầy đủ qua PvP Server & Xem trực tiếp.
* **Cơ chế Mobile (Nút Ulti + Giữ Kéo Radial):**
  * Góc trên phải nút Ulti hiển thị huy hiệu số (`1`, `2`...) biểu thị chiêu đang gán.
  * **Bấm nhanh:** Kích hoạt ngay Ulti mặc định.
  * **Nhấn giữ ($\ge 165\text{ms}$ hoặc kéo ra ngoài nút):** Bung các nút tròn `1, 2...` tương ứng với các chiêu của dạng đang cầm. Kéo thả sang ô chiêu sẽ **dùng ngay** (nếu đã hồi chiêu) hoặc **đổi chiêu mặc định** (nếu đang hồi chiêu); thả về tâm nút để hủy.
* **Cơ chế PC — Cách 1 (`C` dùng ngay · `V` đổi / giữ chọn):**
  * **`C` (`special`):** Giữ phản xạ 0ms — bấm là kích hoạt ngay Ulti đang chọn.
  * **`V` (`cycleSpecial`):** Bấm nhanh để xoay vòng `1 → 2...`; nhấn giữ `V` để bung vòng chọn quanh con trỏ chuột (đã hồi thì chọn + dùng luôn, đang hồi thì đổi mặc định); hoặc click trực tiếp các nút số `1 | 2` phía trên nút Ulti ở thanh Dock.
* **Ulti #2 nhánh Đơn lẻ (`Lưới Quang Lục Giác` — `loose:prism_web`, `12s`):**
  * Tự chuyển sang **Cắm & Thu**; mọi mảnh cắm trong phạm vi `R` (= đường kính *Trường Trọng Lực*) tự gom cụm tạo thành **Bao Lồi (Convex Hull)**.
  * Các cạnh nối phát **tia laze** gây sát thương liên tục khi địch chạm phải; vùng đa giác khép kín từ $\ge 3$ mảnh làm **chậm 40%** tốc độ di chuyển/lướt của địch.
* **Tiện ích Test Kỹ năng (Đấu với Bot):** Nút **`Bot: Bật / Tắt`** trên thanh HUD cho phép cho Bot đứng yên tại chỗ để thử chiêu và căn góc combo.
* **Ulti #2 nhánh Phòng thủ (`Tường Lục Giác` — `defense:hex_wall`, `8s`):**
  * Cho phép dựng tường gồm **4 mảnh Base** (kích thước & độ bền **100%**) sát trước mặt mỗi `0.5s`, tồn tại `5s`, tối đa **4 tường cùng lúc**.
  * Không bị khóa tốc độ hay khóa Lướt như *Pháo Đài*; tường chặn cả 2 bên và đỡ đòn theo vật lý Mảnh–Mảnh.
  * **Mobile:** giữ & xoay nút Đánh để ngắm bóng mờ 4 mảnh, thả để đặt; **PC:** rê chuột ngắm bóng mờ và bấm chuột trái để đặt.

---

## LỘ TRÌNH TIẾP THEO TRONG PHASE 3 (`v3.5+`)
* **Giai đoạn 3.2 — Mở rộng Ulti 1-N:** Bổ sung kỹ năng đặc biệt thứ 2 cho mỗi trong 4 phương thức tấn công, chọn trực tiếp trong Xưởng Vũ Khí và hiển thị rõ trên HUD.
* **Giai đoạn 3.3 — Bản đồ đấu trường & Anti-Stall:** Thêm 3–4 kiểu bố cục vật cản lựa chọn trước trận và cơ chế vòng bo chống câu giờ.
* **Giai đoạn 3.4 — Phòng tập, Quick Match & Xếp hạng:** Chế độ tập luyện tự do, ghép trận PvP 1 nút và bảng xếp hạng ELO trên SQLite.

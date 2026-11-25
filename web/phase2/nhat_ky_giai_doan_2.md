# NHẬT KÝ PHÁT TRIỂN — GIAI ĐOẠN 2 (HEX ARENA WEB PHASE 2)

Tài liệu ghi nhận quá trình phát triển nhánh **Giai đoạn 2** trong thư mục `web/phase2/` (giữ nguyên tuyệt đối mã nguồn `web/phase1/`).

---

## v2.0 — 19/11/2026: Hoàn thiện Kiến trúc Mô-đun (Vite + TypeScript + Vitest), Tách WeaponBlueprint ↔ CombatStance, Bàn Lắp Ráp 5–10 mảnh & Trình Tùy Chỉnh Song Song Mobile/PC

### 1. Kiến trúc Mô-đun & Lõi Vật lý Độc lập (`src/core/` & `src/ai/`)
* **Tách 100% logic khỏi DOM/Canvas (`src/core/`):**
  * `types.ts` · `constants.ts` · `hexMath.ts` · `blueprint.ts` · `obstacles.ts` · `structure.ts` · `skills.ts` · `combat.ts` · `simulation.ts`.
  * Chạy vòng lặp vật lý cố định **Fixed Timestep 60Hz (`FIXED_DT = 1/60s`)** với accumulator, phát sự kiện thuần `SimEvent[]` cho lớp kết xuất và âm thanh/rung — sẵn sàng dùng lại trực tiếp trên Server PvP ở Giai đoạn 4.
* **Bảo toàn đầy đủ 100% tính năng Giai đoạn 1 (`v1.16`):**
  * Đấu trường lục giác `ARENA_RADIUS = 686`, sinh ngẫu nhiên 3–5 vật cản (lục giác/vuông/chữ nhật) với chống bắn/chém/lướt xuyên tường (Cyrus-Beck).
  * 4 Quy tắc Vật lý Va chạm & Phòng thủ (Emergent Physics) hợp nhất với 3 chế độ Xoay trục (*Tĩnh / Pháp tuyến / Ngẫu nhiên*).
  * Độ bền `2.2×`, tự hồi chậm, 3 cấp nứt vàng hổ phách, vỡ mảnh (`5s`) + BFS tái hợp nhất + morph nguyên trạng, mảnh ghim đất rắn chắn đường.
  * 4 Kỹ năng Đặc biệt (`8.0s` duy trì, `18–20s` hồi chiêu dùng chung), bao gồm `Ngự Thương Độc Lập` (Click chỉ điểm + khung nét đứt vẽ động theo hình dáng Blueprint + Auto-Pilot) và `Pháo Đài Phản Xung` (đòn thường Phòng thủ `0` HP; sóng Phản Xung `12–62` HP).
  * Kỹ năng Lướt (`3.5s`), vùng `✕ HỦY` (kiểu Liên Quân), Thu hồi thông minh & thu riêng 1 mảnh.
* **Bot AI (`src/ai/botController.ts`):** Nâng cấp nhận diện `CombatStance` động từ bất kỳ Blueprint nào của người chơi và Bot.

### 2. Tách `WeaponBlueprint` khỏi `CombatStance` & Bàn Lắp Ráp Lục Giác (`src/ui/loadoutEditor.ts`)
* Hỗ trợ **1 bộ tài nguyên chung 5–10 mảnh** (tùy chọn chất liệu `Base / Nặng / Sắc / Nhẹ` cho từng mảnh) dùng xuyên suốt trận để lắp thành **3 ô Cấu hình Vũ khí**.
* Kéo-thả tự do trên lưới trục `(q, r)` (tự bắt khớp & hoán đổi ô), chọn bất kỳ mảnh nào làm **Mảnh Gốc neo `(0,0)`**, đặt tên riêng, chọn `Smart Default` (`60% / 100% / 150%`) và gán 1 trong 3 Trạng thái (`Đánh xa / Đánh gần / Phòng thủ`).
* **Kiểm tra BFS thời gian thực** + nút **Tự ghép liền (`autoConnectBlueprint`)**, tự suy diễn vai trò mảnh (`root / tip / front / spine / core / wing`) & khoảng neo an toàn `anchorDistFactor`, xem trước 3 mức kích thước + 5 thanh chỉ số vật lý tự phát sinh và 4 bộ mẫu nhanh (`Chuẩn 7`, `Song Kích 8`, `Tổ Ong 9`, `Cơ Động 10`).

### 3. Tối ưu & Tùy chỉnh Song song Điện thoại + Máy tính (`src/input/`, `src/render/hudRenderer.ts`, `src/ui/hudCustomizer.ts`)
* **HUD Điện thoại thông minh (`📱 HUD Điện thoại`):**
  * Giải quyết bố cục theo tỷ lệ màn hình, `safe-area-inset` và số lượng mảnh động `5–10` (Vòng cung tự mở góc quét khi tăng lên `8–10` mảnh).
  * 3 mẫu định vị nhanh: **4 Ngón (Claw) · 3 Ngón · 2 Ngón (Thumb)** — đưa cả cụm Xoay trục và Co giãn vào hệ thống widget kéo-thả nên chế độ 2 ngón hạ được xuống tầm với ngón cái.
  * Trình kéo-thả trực tiếp trên nền đấu trường chỉnh vị trí, kích thước (`70%–140%`), độ mờ (`35%–100%`), bật/tắt lưới căn chỉnh, lưu bền vững qua `localStorage`.
* **Điều khiển Máy tính công thái học (`🖥 Điều khiển PC`):**
  * Bổ sung phím chọn trực tiếp **`1/2/3/4`** (*Đơn lẻ / Ô 1 / Ô 2 / Ô 3*) song song với `R`/`Tab`, cùng tùy chọn **Con lăn chuột** đổi nấc Co giãn (`60% ↔ 100% ↔ 150%`).
  * Trình gán lại toàn bộ 15 phím tắt (tự hoán đổi khi trùng phím), chỉnh cỡ/độ mờ thanh Dock PC (tự co giãn gọn ngay cả khi mang 10 mảnh) và 3 kiểu tâm ngắm chuột (`Neon / Tối giản / Chữ thập`).

### 4. Kết quả Kiểm chứng Tự động
* `npm run typecheck` (`tsc --noEmit`): **0 lỗi**.
* `npm test` (`vitest run`): **15/15 unit tests đạt** (3 bộ test: `blueprint.test.ts`, `physics.test.ts`, `hudLayout.test.ts`).
* `npm run build` (`vite build`): Đóng gói thành công `dist/` (JS `47.91 kB` gzip, CSS `3.49 kB` gzip).
* Thư mục `web/phase1/` được kiểm tra giữ nguyên **100% không chỉnh sửa**.

---

## v2.1 — 19/11/2026: Cân bằng điều khiển PC & Mobile cho Ngự Thương Độc Lập (Bay xuyên qua điểm Click, không dừng tại chỗ)
* **Bỏ cơ chế phanh giảm tốc & dừng tại điểm click trên PC (`src/core/simulation.ts`, `src/core/skills.ts`):**
  * Khi kích hoạt **Ngự Thương Độc Lập** trên PC và click chuột trái vào một vị trí bất kỳ, vũ khí bay hướng tới và **bay xuyên thẳng qua vị trí đó với tốc độ không đổi 100% `guidedSpeed`** (giống hệt Mobile), tuyệt đối không giảm tốc hay lơ lửng dừng tại chỗ.
  * Ngay khi bay qua điểm click (`<= 28px`), lệnh cũ tự giải phóng để vũ khí tiếp tục giữ trọn đà bay xuyên qua rồi chuyển mượt về `TỰ ĐỘNG` (nếu giữ chuột trái đè ngay trên mũi thương thì thương vẫn bay thẳng qua theo hướng đang đi thay vì đứng yên).
* **Đồng bộ giao diện & Kiểm thử:** Đổi nhãn khung nét đứt sang **`BAY QUA · Xs`** (`src/render/entityRenderer.ts`), cập nhật Hướng dẫn PC và bổ sung unit test xác nhận tốc độ không suy giảm trong `tests/physics.test.ts`.

---

## v2.2 — 19/11/2026: Giao diện Sảnh Chính chuyên nghiệp, Cấu hình Vũ khí chia 2 phần rõ ràng & Bỏ toàn bộ icon rối mắt
* **Tạo Giao diện Sảnh Chính (`src/ui/lobby.ts`):**
  * Mở game vào thẳng Sảnh sạch đẹp trên nền đấu trường mờ kính (ẩn HUD chiến đấu & tạm dừng mô phỏng cho đến khi bấm `Vào trận`).
  * Hiển thị xem trước trực quan 3 ô Cấu hình Vũ khí hiện tại bằng mini-canvas (nhấn trực tiếp từng thẻ để mở sửa đúng ô đó), 2 nút chính nổi bật (`Vào trận` · `Cấu hình vũ khí`) và hàng thao tác phụ gọn (`Tùy chỉnh điều khiển`, `Chuyển PC/Mobile`, `Hướng dẫn & Luật chơi`).
  * Trong trận và màn hình kết thúc trận đều có nút `Sảnh` / `Về sảnh` để quay lại linh hoạt.
* **Thiết kế lại Cấu hình Vũ khí chia rõ 2 phần đơn giản (`src/ui/loadoutEditor.ts`):**
  * **Phần 1 — Đặc tính & Các loại mảnh (Cột trái):** Giải thích mạch lạc 4 loại mảnh (`Base / Nặng / Sắc / Nhẹ`, ngân sách 400đ), 3 Trạng thái Tấn công kế thừa và nguyên tắc Co giãn / Liên kết cạnh.
  * **Phần 2 — Tạo vũ khí (Cột phải):** Tăng/giảm số mảnh `5–10`, 4 mẫu nạp nhanh, chọn mảnh `#1..#N` + đổi chất liệu trực tiếp bằng 4 nút rõ ràng, 3 tab cấu hình, hàng thuộc tính gọn 1 dòng, lưới kéo-thả `(q, r)` kiểm tra BFS và dãy 5 chỉ số tự phát sinh tối giản.
* **Loại bỏ toàn bộ icon/emoji rối mắt:** Đồng bộ giao diện văn bản & nhãn hình học tinh gọn trên toàn bộ Sảnh, Thanh HUD trong trận, Cấu hình Vũ khí, Tùy chỉnh Điều khiển và Hướng dẫn.

---

## v2.3 — 19/11/2026: Tối ưu Sảnh chờ phong cách Game hiện đại (Trái: Vũ khí / Phải: Vào trận) & Xưởng Vũ Khí toàn màn hình lấp đầy 100% lưới tổ ong
* **Nâng cấp Sảnh chờ toàn màn hình (`src/ui/lobby.ts`, `src/styles/main.css`):**
  * Thiết kế theo bố cục sảnh game đối kháng hiện đại: **Thanh tiêu đề mỏng phía trên** (Tên game + Tùy chỉnh điều khiển / Chế độ PC-Mobile / Hướng dẫn / Toàn màn hình), **Bên trái** là Khu vực Kho Vũ khí (xem trước 3 cấu hình + nút `Cấu hình vũ khí`), **Giữa** mở thoáng nền đấu trường, **Bên phải** là Thẻ chế độ đấu 1v1 + nút **`Vào trận`** nổi bật.
  * Tối ưu thích ứng cho cả PC rộng, Điện thoại xoay ngang (2 cột gọn gàng không cuộn) lẫn Điện thoại dọc.
* **Nâng cấp Xưởng Cấu hình Vũ khí toàn màn hình (`src/ui/loadoutEditor.ts`):**
  * Chuyển từ hộp thoại nổi sang giao diện **toàn màn hình (`100vw × 100dvh`)**: trên PC chia 2 cột song song (Cột trái `Đặc tính & Loại mảnh`, Cột phải `Tạo vũ khí`); trên Mobile tự chuyển thành **2 Tab sạch sẽ** (`Tạo vũ khí` / `Đặc tính & Mảnh`) và tối ưu chia 2 nửa trái-phải khi xoay ngang điện thoại.
  * **Sửa triệt để lỗi hở lưới tổ ong & đè vòng Nhân vật:** Tính động biên `(qMin..qMax, rMin..rMax)` theo kích thước thực của Canvas để **lưới tổ ong lấp kín 100% toàn bộ bảng từ mép này sang mép kia**, tự căn giữa và co giãn hợp lý cho cả vũ khí 10 mảnh dài, đồng thời tính chuẩn tỷ lệ vòng tròn `NHÂN VẬT` không bao giờ đè lên mảnh `GỐC`.

---

## v2.4 — 19/11/2026: Sửa lỗi bấm Toàn màn hình trên Mobile không tự xoay ngang
* Bổ sung mô-đun dùng chung `src/ui/fullscreen.ts` tích hợp `requestFullscreen({ navigationUI: 'hide' })` / `webkitRequestFullscreen` kết hợp **`screen.orientation.lock('landscape')`** (fallback `'landscape-primary'`), đồng thời tự mở khóa `screen.orientation.unlock()` khi thoát Toàn màn hình.
* Đồng bộ lại Canvas, bố cục HUD và Sảnh chờ qua các sự kiện `fullscreenchange`, `webkitfullscreenchange`, `orientationchange` và `screen.orientation` change trên cả nút Toàn màn hình ở Sảnh lẫn trong trận.

---

## v2.5 — 20/11/2026: Chế độ Đối kháng PvP 1v1 Trực tuyến (Authoritative 60Hz Server + Room Code + Link mời qua 1 đường dẫn ngrok)
* **Máy chủ PvP Authoritative 60Hz (`server/index.ts`):**
  * Dùng lại trực tiếp **100% tầng `src/core/`** (cùng công thức co giãn $S^k$, 4 Quy tắc Vật lý Va chạm, 4 Kỹ năng Đặc biệt, BFS tái hợp nhất & kiểm định Loadout 5–10 mảnh bằng `sanitizeLoadout` chống gian lận).
  * Tạo phòng mã 4 ký tự, ghép cặp 2 người chơi (Chủ phòng & Khách), chạy mô phỏng Fixed Timestep `60Hz` và phát snapshot đồng bộ `30Hz` kèm toàn bộ `SimEvent[]` (VFX, âm thanh, rung, kết quả trận).
  * Hỗ trợ **Tái đấu PvP (Rematch 2/2)** ngay trong cùng phòng đấu mà không cần tạo lại mã phòng.
* **Ánh xạ góc nhìn đối xứng & Proxy 1 đường dẫn (`src/net/protocol.ts`, `src/net/pvpClient.ts`, `vite.config.ts`):**
  * Tự động đảo góc nhìn cho người chơi Khách để cả 2 bên đều thấy bản thân là **Phe ta (Xanh lam)** và đối thủ là **Phe địch (Đỏ san hô)** với đầy đủ HUD PC/Mobile.
  * Proxy WebSocket `/ws → ws://localhost:3001` ngay trong Vite giúp cả Web lẫn PvP WebSocket chạy gọn qua **duy nhất 1 link `https://hexarena.ngrok.app`**.
* **Sảnh chờ hỗ trợ Đấu với Bot & Đấu PvP 1v1 (`src/ui/lobby.ts`):**
  * Thêm 2 tab ở bảng bên phải Sảnh (`Đấu với Bot` / `Đấu PvP 1v1`), nút **Tạo phòng 1v1**, **Sao chép link mời** (`https://hexarena.ngrok.app/?room=XXXX` tự điền mã phòng khi bạn bè mở link), và ô nhập mã vào phòng trực tiếp.

---

## v2.6 — 20/11/2026: Tối ưu toàn diện Độ mượt PvP 1v1 (Client-Side Prediction, 60Hz TCP_NODELAY Server, Timeline Interpolation & Ping HUD)
* **Client-Side Prediction + Hòa sai số mượt (`src/net/pvpInterpolator.ts`, `src/main.ts`):**
  * Nhân vật của bạn tự mô phỏng di chuyển `60Hz` + va chạm tường/vật cản + khóa vũ khí cầm bám thân ngay tại **`0 ms` trễ tay**, lưu lịch sử input `seq` và hòa chỉnh mượt sai lệch khi nhận `ackSeq` từ Server.
  * Phản hồi tức thời (*Optimistic UI/Audio*) khi chọn mảnh, đổi dạng, co giãn và xoay trục.
* **Bộ đệm Nội suy Theo Dòng Thời Gian thích ứng (Adaptive Timeline Interpolation Buffer):**
  * Tự đo jitter mạng (`28ms–85ms`) và nội suy tuyến tính đều ở `60/120fps` cho cả tọa độ `(x, y)` lẫn góc quay (`lerpAngle` theo cung ngắn nhất) kèm ngoại suy giới hạn `35ms` khi mạng chập chờn.
* **Siêu nhẹ hóa gói tin (~70% nhỏ hơn) & Nâng cấp Server `60Hz` (`server/index.ts`, `src/net/protocol.ts`):**
  * Bỏ truyền `trail` & `dashAfterimages` qua mạng (Client tự dựng vệt chém & dư ảnh mượt ở `60/120fps`).
  * Bật **`TCP_NODELAY`**, tắt `perMessageDeflate`, thay `setInterval` bằng vòng lặp tích lũy thời gian độ chính xác cao `performance.now()` và đẩy nhịp phát snapshot lên **`60Hz`**.
* **Đo & Hiển thị Ping trực tiếp (`src/net/pvpClient.ts`, `src/ui/topBar.ts`):**
  * Thêm nhịp đo `ping/pong` 1.5s và hiển thị `XX ms` đổi màu theo chất lượng mạng ngay cạnh đồng hồ trận đấu.
* **Kiểm thử Netcode (`tests/netcode.test.ts`):** Bổ sung 3 unit tests kiểm chứng `lerpAngle`, nội suy dòng thời gian và Client-Side Prediction + Reconciliation.

---

## v2.7 — 20/11/2026: Cân đối Sảnh 2 khối bằng nhau 1:1, 4 dòng Kho vũ khí, Thanh góc trên 3 mục & Tài khoản SQLite (Đăng nhập / Đăng ký lưu vũ khí)
* **Tối ưu thẩm mỹ & cân đối Sảnh chờ (`src/ui/lobby.ts`, `src/styles/main.css`):**
  * **2 khối bằng nhau tuyệt đối (`1fr 1fr`, cao 100%):** Khối **Kho vũ khí** (trái) và khối **Vào trận** (phải) có cùng chiều rộng, cùng chiều cao và 2 nút hành động đáy (`Cấu hình vũ khí` & `Vào trận`) thẳng hàng tuyệt đối trên cả PC lẫn Mobile xoay ngang.
  * **Kho vũ khí đủ 4 dòng:** Dòng 1 hiển thị **Bộ mảnh chung** (tổng số mảnh + phân bố chất liệu `Nặng / Base / Nhẹ / Sắc`), Dòng 2–4 là 3 ô Cấu hình Vũ khí kèm mini-canvas.
  * Đổi phụ đề thành **`Đấu trường Lục giác`** (bỏ từ "Thuần vật lý").
  * **Góc trên bên phải rút gọn đúng 3 mục:** (1) **`Xin chào, <username>`** (hoặc `Đăng nhập / Đăng ký`), (2) **`Cài đặt`** (gộp Điều khiển, chế độ PC/Mobile, Âm thanh, Hướng dẫn, Đăng xuất), và (3) **Biểu tượng SVG Toàn màn hình / Thoát toàn màn hình**.
* **Cơ sở dữ liệu SQLite & Hệ thống Tài khoản (`server/db.ts`, `server/index.ts`, `src/net/authClient.ts`, `src/ui/authModal.ts`):**
  * Dùng SQLite tích hợp `node:sqlite` (`server/data/hex_arena.sqlite`, đã thêm vào `.gitignore`) lưu `username`, mật khẩu mã hóa an toàn `scrypt + salt` và `loadout_json` của từng người chơi.
  * API `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/loadout` (proxy qua Vite `/api` để chạy chung link `https://hexarena.ngrok.app`).
  * Bổ sung kiểm thử SQLite trong `tests/db.test.ts`.

---

## v2.8 — 20/11/2026: Chỉnh Vũ khí Phòng thủ thuần phòng thủ (chỉ Kỹ năng Đặc biệt gây sát thương)
* **Tắt hoàn toàn đòn đánh thường của trạng thái Phòng thủ (`src/core/skills.ts`, `src/input/inputManager.ts`, `src/ai/botController.ts`):**
  * Ở trạng thái **Phòng thủ** bình thường, người chơi (cả PC, Mobile và Bot AI) không thể bấm/thả để tung đòn đánh thường — không tạo `attackAnim`, không hiện nón ngắm tấn công (`src/render/indicatorRenderer.ts`), và không bật vùng `✕ HỦY`.
  * Trên **PC**, di chuyển chuột xoay góc che chắn của khiên tự nhiên; bấm chuột trái ở chế độ phòng thủ thường sẽ không phát động tấn công.
  * Trên **Mobile**, nút phải đổi nhãn thành **`CHẮN`** (tông ngọc trầm) cho phép kéo xoay góc khiên mượt mà mà không tung đòn khi thả tay.
* **Giữ nguyên & nâng trải nghiệm Kỹ năng Đặc biệt — Pháo Đài Phản Xung (`src/core/skills.ts`, `src/render/hudRenderer.ts`, `server/index.ts`):**
  * Bấm Kỹ năng Đặc biệt (`[C]` trên PC hoặc nút chiêu trên Mobile) kích hoạt **Pháo Đài Phản Xung** (phóng to `150%`, giữ độ cứng `60%`, tích năng lượng khi đỡ đòn).
  * Khi Pháo Đài đang hoạt động, có thể bấm kích hoạt lại Kỹ năng Đặc biệt, bấm nút **`XUNG`** (hoặc click chuột trái trên PC), hoặc chờ hết thời gian để phóng sóng phản xung gây sát thương máu & phá mảnh đối thủ.
* **Cập nhật hướng dẫn & kiểm thử (`src/core/constants.ts`, `src/ui/loadoutEditor.ts`, `tests/physics.test.ts`):**
  * Đồng bộ mô tả trạng thái Phòng thủ trong Xưởng vũ khí và bổ sung test xác minh không thể đánh thường nhưng Kỹ năng Đặc biệt Pháo Đài vẫn gây sát thương.

---

## v2.9 — 20/11/2026: Cải tiến Cài đặt Phím Mobile (Kéo thanh công cụ, Biểu tượng Xoay cụm phím) & Nhãn nút `Ulti`
* **Thanh công cụ Cài đặt HUD Điện thoại kéo di chuyển tự do (`src/ui/hudCustomizer.ts`, `src/styles/main.css`):**
  * Thêm tay nắm kéo (`Kéo để di chuyển`) ở đầu bảng và hỗ trợ kéo trực tiếp trên nền thanh công cụ bằng cả cảm ứng lẫn chuột, tự kẹp gọn trong khung màn hình và giữ nguyên vị trí khi đổi lựa chọn phím để không bao giờ che chắn các phím phía trên.
* **Biểu tượng Xoay khi chỉnh phím (`src/input/hudPresets.ts`, `src/render/hudRenderer.ts`, `src/ui/hudCustomizer.ts`, `src/storage/profiles.ts`):**
  * Thêm nút **biểu tượng xoay (`↻`)** ngay trên góc khung chọn của từng cụm phím trên màn hình lẫn nút **`Xoay <độ>°`** trên thanh công cụ, lưu bền vững trường `rotation` trong cấu hình HUD.
  * Cụm nút hàng ngang/dọc (`Cụm Co giãn`, `Cụm Xoay trục`, `3 Kiểu phóng`, `Thu hồi & Chọn hết`) xoay từng bước `90°` (chuyển ngang ↔ dọc và đảo thứ tự); `Nút Đánh & Vòng cung` và `Nút Đổi dạng` xoay từng bước `45°` (hỗ trợ hit-test vòng cung chuẩn xác mọi góc `0°–360°`).
* **Đổi nhãn nút Kỹ năng Đặc biệt thành `Ulti` (`src/render/hudRenderer.ts`, `src/storage/profiles.ts`):**
  * Đổi chữ hiển thị nút kỹ năng từ viết tắt khó hiểu (`LY`, `PHẢN`, `PHÁO`...) thành **`Ulti`** rõ ràng, thống nhất trên cả Mobile và PC.
* **Lưu đồng bộ cấu hình phím Mobile & PC vào tài khoản SQLite (`server/db.ts`, `server/index.ts`, `src/net/authClient.ts`, `src/main.ts`):**
  * Tự động nâng cấp bảng `users` thêm 2 cột `mobile_hud_json` và `pc_controls_json` (tương thích ngược với database cũ).
  * Thêm API `PUT /api/controls`, tự động lưu khi bấm **Lưu HUD / Lưu cài đặt** và tự tải lại khi đăng nhập hoặc khôi phục phiên trên thiết bị khác.

---

## v2.10 — 20/11/2026: Quy trình Phòng đấu PvP 1v1 chuyên nghiệp (Chọn số mảnh → Sẵn sàng → Tinh chỉnh 1 phút → Đếm ngược 3-2-1)
* **Giao diện Phòng đấu 1v1 (`src/ui/pvpRoomModal.ts`, `server/index.ts`):**
  * Hiển thị mã phòng, nút **Sao chép link mời**, 2 thẻ người chơi (Chủ phòng & Đối thủ theo tên tài khoản), trạng thái sẵn sàng trực tiếp.
  * **Chủ phòng** tùy chọn luật **Số lượng mảnh thi đấu (5–10 mảnh)** áp dụng công bằng cho cả 2 bên; **Đối thủ** bấm **Sẵn sàng** rồi Chủ phòng bấm **Bắt đầu tinh chỉnh (1 phút)**.
* **Giai đoạn Tinh chỉnh 1 phút (`src/ui/loadoutEditor.ts`, `server/index.ts`):**
  * Mở thẳng Xưởng vũ khí ở chế độ PvP với số mảnh bị khóa theo luật phòng, đồng hồ đếm ngược **`01:00 → 00:00`** đồng bộ từ server (cập nhật tại chỗ không làm ngắt thao tác kéo thả mảnh).
  * Cả 2 bên tự do chỉnh chất liệu, hình dạng 3 vũ khí và bấm **Sẵn sàng chiến**; khi cả 2 cùng sẵn sàng (hoặc hết 60 giây) sẽ tự động khóa vũ khí và bước vào sân đấu.
* **Đếm ngược 3 — 2 — 1 — CHIẾN! (`index.html`, `src/ui/topBar.ts`, `src/feedback/sound.ts`, `server/index.ts`):**
  * Hiển thị sẵn cả 2 chiến binh trên đấu trường, khóa di chuyển/tấn công trong 3 giây đếm ngược kèm hiệu ứng phóng chữ và âm thanh báo hiệu `3 → 2 → 1 → CHIẾN!` đồng bộ tuyệt đối giữa 2 máy.

---

## v2.11 — 24/11/2026: Khắc phục Toàn màn hình trên iOS, Tối ưu Mặc định HUD Điện thoại & Sửa lỗi Tiềm ẩn Toàn dự án
* **Hỗ trợ Toàn màn hình trên iOS & iPadOS (`src/ui/fullscreen.ts`, `public/manifest.webmanifest`, `index.html`, `src/main.ts`):**
  * Tự động nhận diện thiết bị iOS / iPadOS và chế độ Web App Màn hình chính (`standalone`): thay vì báo lỗi không hỗ trợ khi iPhone Safari thiếu Fullscreen API, nút Toàn màn hình chuyển mượt sang **Chế độ tập trung iOS** (khóa cuộn cao su, co thanh Safari theo `visualViewport`, hiện bảng hướng dẫn 2 bước **Chia sẻ → Thêm vào MH chính** có tùy chọn *Không hiện lại*).
  * Bổ sung **PWA Manifest + Biểu tượng SVG** và dải nhắc xoay ngang gọn nhẹ khi cầm dọc trên điện thoại.
* **Tối ưu lại hoàn toàn Bố cục Mặc định HUD Điện thoại v2 (`src/storage/profiles.ts`, `src/input/hudPresets.ts`, `src/input/inputManager.ts`):**
  * Đặt mặc định **2 Ngón** với khoảng cách an toàn chống bấm nhầm tuyệt đối (`>= 12px` khe hở giữa mọi nút, không bao giờ chồng chéo trên 7 kích cỡ màn hình từ Android nhỏ `568×320`, iPhone Notch/Dynamic Island đến iPad Pro kể cả khi mang đủ 10 mảnh).
  * Sửa lỗi đọc vùng an toàn tai thỏ (`safe-area-inset-*`) bằng đầu dò CSS thực tế, bổ sung vùng chạm nới `+5px` và chọn nút gần tâm nhất khi chạm sát ranh giới cụm phím.
  * Rút gọn thanh trên trong trận cho Mobile (`Cài đặt` gộp gọn trên 1 hàng duy nhất để không che màn chơi).
* **Sửa lỗi Tiềm ẩn & Tối ưu Hiệu năng (`src/core/*`, `src/net/protocol.ts`, `src/render/vfxRenderer.ts`, `server/index.ts`):**
  * Sửa lỗi thống kê `hexBroken` của người chơi Khách trong PvP và lọc sự kiện `toast` / `haptic` theo đúng `target` chỗ ngồi để hai bên không nhận nhầm thông báo của nhau.
  * Bổ sung giới hạn số lượng hạt/sóng xung kích/chữ nổi trong `VFXManager` giữ mượt `60fps` trên máy yếu và thêm nhịp tim WebSocket (`ping/pong` 25s) dọn socket treo khi Safari chuyển nền.






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

---

## v3.3 — 25/11/2026: Danh sách Bạn bè ở Sảnh, Lời mời đấu PvP & Xem trận đấu Trực tiếp Thời gian thực (PvP + Bot)

* **Hệ thống Kết bạn & Lưu trữ SQLite (`server/db.ts`, `server/index.ts`, `src/net/authClient.ts`):**
  * Bổ sung bảng `friendships` và các phương thức `sendFriendRequest`, `respondFriendRequest`, `removeFriend`, `areFriends`, `listFriends` kèm tự động chấp nhận nếu hai người cùng gửi lời mời chéo.
  * Bổ sung REST API (`GET /api/friends`, `POST /api/friends/request`, `POST /api/friends/respond`, `POST /api/friends/remove`) đồng bộ real-time qua WebSocket (`friends_list_dirty`).
* **Trạng thái Hoạt động Thời gian thực & Nút Mời đấu PvP (`src/net/pvpClient.ts`, `src/ui/screens/lobby.ts`, `src/ui/modals/pvpRoomModal.ts`):**
  * Duy trì kết nối WebSocket xác thực (`auth_ws`) liên tục sau khi đăng nhập để cập nhật tức thì trạng thái bạn bè (`Đang đấu PvP`, `Đang đấu Bot`, `Trong phòng PvP`, `Ở sảnh`, `Đang xem trận`, `Ngoại tuyến`).
  * Bổ sung thanh **Bạn bè** bên cạnh trái Sảnh chờ (thu gọn được trên PC, ngăn kéo trượt trái trên Mobile landscape để giữ nguyên bố cục 1:1 đối xứng của 2 thẻ chính).
  * Nút **`Mời`** gửi lời mời đấu PvP 1v1 trực tiếp (tự tạo phòng nếu người mời đang ở sảnh, hoặc mời ngay từ phòng chờ PvP); người nhận nhận thẻ thông báo nổi với nút **`Vào phòng`** / **`Từ chối`**.
* **Cơ chế Xem trận đấu Trực tiếp Thời gian thực (Độ trễ 0 giây cho cả PvP và Bot):**
  * **Trận PvP 1v1 (Server Fan-out):** Server gắn khán giả vào `Room.spectators` theo góc nhìn của người bạn đang xem (`player` hoặc `enemy`), phát snapshot 30Hz trực tiếp bằng `buildSeatSnapshot`.
  * **Trận đấu Bot AI (On-Demand Client-Relay):** Trận Bot vẫn chạy local 0ms ping; chỉ khi có $\ge 1$ bạn bè bấm **`Xem`**, server gửi `bot_stream_toggle { active: true }` để máy người chơi stream snapshot 20Hz lên relay cho các khán giả, tự ngắt hoàn toàn khi khán giả cuối cùng rời đi.
  * **Chế độ Khán giả (`src/net/pvpInterpolator.ts`, `src/ui/hud/topBar.ts`, `src/main.ts`):** Nội suy mượt cả 2 chiến binh ở 60fps không prediction, khóa toàn bộ nút điều khiển chiến đấu, hiển thị nhãn **`TRỰC TIẾP · PvP/BOT`**, tên 2 đấu thủ, bảng tổng kết theo tên người xem và nút **`Rời xem`**.
* **Kiểm thử:** Bổ sung `tests/socialSpectate.test.ts` kiểm chứng vòng đời kết bạn SQLite, nội suy spectator và ánh xạ góc nhìn `buildSeatSnapshot`.

---

## v3.4 — 25/11/2026: Khung Giao diện & Điều khiển Đổi Ulti Linh hoạt trong Trận (PC Cách 1 + Mobile Giữ Kéo)

* **Trạng thái & Đồng bộ Chọn Ulti theo từng Dạng (`src/core/types.ts`, `src/core/attacks/registry.ts`, `src/net/`):**
  * Bổ sung `Fighter.selectedSpecialByMode` ghi nhớ Ulti đang chọn riêng cho từng phương thức (`loose`, `ranged`, `melee`, `defense`) xuyên suốt trận đấu.
  * Thêm `getFighterSelectedSpecialInfo`, `setFighterSpecialSkill`, `cycleFighterSpecialSkill` và tham số `overrideSkillId` trong `triggerFighterSpecial` (tự động đổi + tung chiêu nếu sẵn sàng, hoặc chỉ đổi mặc định không báo lỗi nếu đang hồi chiêu).
  * Mở rộng giao thức PvP (`PvPAction`: `set_special_skill`, `special { skillId? }`, `SerializedFighter.selectedSpecialByMode`) để đồng bộ server PvP và khán giả xem trực tiếp.
* **Điều khiển & HUD Mobile (`src/input/inputManager.ts`, `src/input/hudPresets.ts`, `src/render/hud/hudRenderer.ts`):**
  * Huy hiệu số **`1` / `2`...** ở góc nút Ulti cho biết kỹ năng mặc định hiện tại.
  * **Bấm nhanh:** Tung ngay Ulti mặc định. **Nhấn giữ ($\ge 165\text{ms}$ hoặc kéo lệch nút):** Bung vòng cung các ô chiêu `1, 2...` tương ứng dạng đang cầm — kéo thả vào ô để **dùng ngay** (nếu đã hồi) hoặc **đổi mặc định** (nếu đang hồi), thả tại tâm nút để hủy; hỗ trợ xoay hướng bung vòng cung trong Trình tùy chỉnh HUD Mobile.
* **Điều khiển & HUD PC — Cách 1 (`src/storage/profiles.ts`, `src/input/`, `src/render/hud/hudRenderer.ts`):**
  * Phím **`C`** (`special`) giữ phản xạ 0ms bấm là dùng ngay Ulti đang chọn.
  * Phím **`V`** (`cycleSpecial`, tùy chỉnh được trong Cài đặt phím PC): **Bấm nhanh `V`** để xoay vòng chiêu `1 → 2...`; **Giữ `V`** để mở vòng xoay chọn nhanh quanh con trỏ chuột (hoặc click trực tiếp các nút số `1 | 2` phía trên nút Ulti trên thanh Dock).
* **Kiểm thử:** Bổ sung `tests/specialSelector.test.ts` kiểm chứng lưu chọn theo từng dạng, giữ `V`/giữ chạm, tọa độ radial và keybind mặc định `cycleSpecial`.

---

## v3.5 — 25/11/2026: Kỹ năng Đặc biệt #2 cho Đơn lẻ (`Lưới Quang Lục Giác`) & Nút Tắt/Bật Bot Test Kỹ năng

* **Kỹ năng Đặc biệt #2 nhánh Đơn lẻ — `Lưới Quang Lục Giác` (`loose:prism_web`):**
  * Thiết kế tại `src/core/attacks/loose/specials/prismWeb.ts` và đăng ký vào `LOOSE_ATTACK_MODE` (ô số `2` trên cả PC lẫn Mobile).
  * **Thời lượng:** `12s` (`22s` hồi chiêu). Khi bật tự động chuyển kiểu phóng sang **Cắm & Thu** (`fireMode = 'xayah'`).
  * **Thuật toán Bao Lồi theo Cụm (`computePrismWebClusters` trong `src/core/world/structure.ts`):** Gom nhóm mọi mảnh đang `PLANTED` nằm trong tầm `R` (= đường kính của *Trường Trọng Lực*), sau đó dựng **Bao Lồi (Andrew's Monotone Chain Convex Hull)** cho từng cụm.
  * **Hiệu ứng:** Phát tia laze 3 lớp dọc các cạnh nối gây sát thương theo nhịp (`0.30s` / lần), đồng thời vùng đa giác khép kín (từ $\ge 3$ mảnh) làm chậm **40%** tốc độ di chuyển & lướt của địch (`LOOSE_PRISM_SLOW_FACTOR = 0.60`).
  * Tách riêng cờ `isLooseGravityFieldActive` và `isLoosePrismWebActive` để *Lưới Quang* không kích hoạt nhầm hiệu ứng phóng to vòng quay của *Trường Trọng Lực*.
* **Nút Tắt/Bật Bot khi Đấu với Bot (`index.html`, `topBar.ts`, `main.ts`):**
  * Bổ sung nút **`Bot: Bật` / `Bot: Tắt`** trên thanh TopBar khi đấu với Bot (ẩn khi đấu PvP hoặc đang Xem trực tiếp). Khi tắt, Bot đứng yên hoàn toàn tại chỗ để người chơi thử nghiệm chiêu thức và đo sát thương thuận tiện.
* **Kiểm thử:** Bổ sung `tests/prismWeb.test.ts` kiểm chứng phân cụm Bao Lồi, vùng chậm `-40%`, tự chuyển `Cắm & Thu` và sát thương tia laze.

---

## v3.6 — 25/11/2026: Kỹ năng Đặc biệt #2 cho Phòng thủ (`Tường Lục Giác`)

* **Kỹ năng Đặc biệt #2 nhánh Phòng thủ — `Tường Lục Giác` (`defense:hex_wall`):**
  * Đăng ký tại `src/core/attacks/defense/specials/hexWall.ts` & `DEFENSE_ATTACK_MODE` (ô số `2` trên PC & Mobile).
  * **Thông số:** Thời lượng kích hoạt `8s` (hồi `20s`), cooldown đặt tường `0.5s`, mỗi bức tường gồm **4 mảnh chất liệu Base** ở kích thước & độ bền **100%** (`220 HP/mảnh`, `hard = 100`), tồn tại **`5s`** và giới hạn tối đa **4 tường** cùng lúc (đặt tường thứ 5 sẽ giải tán tường cũ nhất).
  * **Vật lý Tường thật (`simulation.ts`, `combat.ts`, `pvpInterpolator.ts`, `protocol.ts`):** Mảnh sinh ra từ kỹ năng (không tiêu hao mảnh vũ khí), **chặn di chuyển/lướt của cả 2 bên** và **chặn đòn đánh** theo cơ chế va chạm Mảnh–Mảnh (cần đánh vỡ mảnh tường để mở đường), đồng bộ đầy đủ qua PvP & Xem trực tiếp.
  * **Tách bạch hai Ulti Phòng thủ:** Bổ sung `isDefenseFortressActive` và `isDefenseHexWallActive` để *Tường Lục Giác* không bị khóa Lướt, không giảm 40% tốc chạy hay khóa xoay thân như *Pháo Đài Phản Xung*.
  * **Điều khiển & Xem trước (`inputManager.ts`, `indicatorRenderer.ts`, `hudRenderer.ts`):** Hiện bóng mờ 4 mảnh tường sát trước mặt; trên Mobile giữ & xoay nút Đánh (nhãn **`TƯỜNG`**) rồi thả để đặt, trên PC rê chuột để xoay góc và click chuột trái để đặt.
* **Kiểm thử:** Bổ sung `tests/hexWall.test.ts` kiểm chứng đặt tường 4 mảnh Base 100%, giới hạn 4 tường, tự tan sau 5s, chặn di chuyển cả 2 phe, đỡ đòn địch và đồng bộ `buildSeatSnapshot`.

---

## v3.7 — 25/11/2026: Nâng cấp Điều khiển Ulti Mobile (Chọn Sát Nút → Khóa Tâm Xoay Động → Hủy/Chọn Lại Cách B & Nút Khóa Chọn)

* **Tách rõ pha Chọn chiêu & pha Xoay chiêu trên Mobile (`src/input/specialGesture.ts`, `src/input/hudPresets.ts`, `src/input/inputManager.ts`):**
  * **Kéo các lựa chọn ôm sát nút Ulti:** Bán kính vòng cung chọn chiêu thu gọn còn `special.r + 30 * scale`, chỉ cần nhích nhẹ ngón tay là chạm tới ô chiêu.
  * **Khóa lựa chọn + Tâm xoay động (Dynamic Pivot):** Ngay khi ngón tay chạm vào ô chiêu `1` / `2...`, hệ thống tự động **khóa lựa chọn đó** và đặt **tâm joystick xoay chiêu ngay tại vị trí ô vừa chạm** để người chơi tiếp tục kéo xoay 360° định hướng chiêu mà không bị giật góc hay mất hành trình tay.
  * **Nút `✕ HỦY` kiêm chọn lại mượt theo Cách B (`reselect_armed`):** Kéo vào vùng `✕ HỦY` rồi **thả tay** sẽ hủy hoàn toàn không tung chiêu; kéo vào `✕ HỦY` rồi **kéo ngược ra ngoài** (không nhấc tay) sẽ tự mở khóa quay lại pha chọn để chọn sang chiêu khác ngay trong một nét vuốt.
* **Nút Khóa chọn (`🔒`) cạnh nút Ulti (`src/storage/profiles.ts`, `src/render/hud/hudRenderer.ts`, `src/main.ts`):**
  * Bổ sung nút ổ khóa nhỏ ngay cạnh nút Ulti (`MobileHUDConfig.specialSelectorLocked`, đồng bộ lên SQLite qua `saveControlsToAccount`). Khi bật Khóa, giữ/kéo nút Ulti sẽ **bỏ qua pha chọn và vào thẳng pha xoay chiêu**; vẫn có thể chạm nhanh vào **huy hiệu số `1/2`** góc nút để đổi chiêu tức thì.
* **Khung Định hướng Kỹ năng Đặc biệt (`src/core/attacks/types.ts`, `registry.ts`, `guidedSpear.ts`, `indicatorRenderer.ts`, `protocol.ts`, `server/index.ts`):**
  * Bổ sung `SpecialTargetingMode` (`instant` / `direction` / `ground`) + truyền `aimAngle`, `aimStrength` qua `triggerFighterSpecial` và gói `PvPAction: 'special'`, kèm hiển thị chỉ báo ngắm Ulti trên sân đấu (`renderSpecialAimIndicator`) và phóng *Ngự Thương Độc Lập* đúng hướng vừa xoay.
* **Kiểm thử:** Mở rộng `tests/specialSelector.test.ts` kiểm chứng khoảng cách ôm sát + nút khóa không đè trên nhiều kích cỡ màn hình, truyền `aimAngle` vào *Ngự Thương*, và luồng trạng thái `pending → selecting → aiming (Dynamic Pivot) → reselect_armed → selecting / cancel` lẫn chế độ Khóa bỏ qua chọn.

---

## v3.8 — 25/11/2026: Kỹ năng Đặc biệt #2 cho Đánh xa (`Thương Kích Lục Giác`)

* **Kỹ năng Đặc biệt #2 nhánh Đánh xa — `Thương Kích Lục Giác` (`ranged:sniper_stage`):**
  * Đăng ký tại `src/core/attacks/ranged/specials/sniperStage.ts` & `RANGED_ATTACK_MODE` (ô số `2` trên cả PC và Mobile).
  * **Thông số & Nhịp bắn tỉa:** Duy trì tối đa `10s` (`22s` hồi chiêu), mở vùng nón bắn tỉa `64°` (`±32°`, tầm `1050 px`) theo hướng kích hoạt; khóa di chuyển tại chỗ để bắn từng mảnh Hex từ mũi về gốc (`0.50s` / phát, tốc độ `1450 px/s`, riêng phát thứ 4 đạt `1680 px/s`).
  * **Cường hóa Phát thứ 4 & Làm chậm:** Duy nhất **viên thứ 4** được cường hóa sát thương & động năng xuyên cao (viên 5..10 vẫn bắn thường đến hết mảnh); mọi phát trúng thân địch làm chậm **35%** trong **`0.60s`** (`SNIPER_SLOW_FACTOR = 0.65`) kèm hiệu ứng giật thân (`recoilTimer` / `recoilAmp`).
  * **Vật lý & Thu hồi đa hướng:** Đạn bị chặn bởi vật cản và đi qua trọn vẹn 4 quy tắc vật lý Mảnh–Mảnh (kể cả Tường Lục Giác); khi bắn hết mảnh, hết giờ, kích hoạt lại Ulti, đổi dạng hoặc Lướt thoát khẩn cấp, toàn bộ mảnh đã bắn đồng loạt bay cao từ nhiều hướng ngoài biên đấu trường (`SNIPER_RETURN`) về ghép lại vũ khí.
  * **Camera, Đồ họa & Đồng bộ PvP:** Tự động zoom-out nhẹ và dịch tâm camera theo vùng nón, hiển thị tia ngắm laze cắt vật cản, chấm đạn (ô #4 hình thoi vàng), vệt đạn rực sáng và đồng bộ đầy đủ qua `protocol.ts`, `pvpInterpolator.ts` & `server/index.ts`.
* **Kiểm thử:** Bổ sung `tests/sniperStage.test.ts` kiểm chứng khóa vùng nón `±32°`, đứng im, chỉ viên thứ 4 cường hóa, làm chậm 35% trong `0.6s`, chặn vật cản/khiên theo 4 quy tắc, thu hồi đa hướng khi hủy bằng Lướt và đồng bộ snapshot PvP.
* **Cân bằng Ulti #1 Đánh xa (*Ngự Thương Độc Lập*):** Giảm một nửa hệ số sát thương khi điều hướng (`1.35× → 0.675×`, cập nhật tại `guidedSpear.ts` & `combat.ts`).

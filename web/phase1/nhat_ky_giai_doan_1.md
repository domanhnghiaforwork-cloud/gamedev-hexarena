# NHẬT KÝ CHỈNH SỬA — GIAI ĐOẠN 1 (HEX ARENA WEB PROTOTYPE)

Tài liệu ghi nhận tóm tắt toàn bộ các đợt chỉnh sửa đối với bản thử nghiệm 1 file [hex_arena_web_prototype_v1.html](./hex_arena_web_prototype_v1.html).

---

## v1.0 — Bản dựng nền tảng ban đầu (Baseline)
* Đấu trường lục giác 2.5D (`ARENA_RADIUS = 560`), 4 trụ lục giác cố định, nhân vật khối cầu với vòng Hitbox chân (`PLAYER_RADIUS = 23`).
* Đủ 7 mảnh lục giác mặc định (4 chất liệu: Nặng, Base, Nhẹ, Sắc), 3 cấu hình ghép sẵn (`Giáo`, `Kiếm`, `Khiên`), hệ thống co giãn 3 nấc (`60% / 100% / 150%`) theo hàm lũy thừa $S^k$.
* 3 chế độ xoay trục trạng thái Đơn lẻ, Vòng cung chọn mảnh 1–7 hỗ trợ lia tay, 3 chế độ phóng và Thu hồi bay cao.
* Vỡ mảnh (hồi 5s), tự động tái hợp nhất BFS từ mảnh Gốc neo, hồi phục từng phần và morph nguyên trạng, Bot AI 1v1 cơ bản, HUD 4 ngón + phím tắt Desktop, Web Audio synth & Haptic.

---

## v1.1 — 19/11/2026: Mở rộng Đấu trường, Vật cản ngẫu nhiên, Chống xuyên tường, Giáo tầm xa & Cân bằng độ bền mảnh
1. **Mở rộng diện tích sàn đấu +50%:**
   * Tăng `ARENA_RADIUS` từ `560` lên `686` ($\approx 560 \times \sqrt{1.5}$, tăng đúng 50% diện tích).
   * Mở rộng lưới lục giác sàn đấu (`-11..11`), giãn vị trí xuất phát (`±340`), tinh chỉnh giới hạn zoom camera để quan sát thoải mái trên di động nằm ngang.
2. **Hệ thống vật cản ngẫu nhiên mỗi trận (3–5 khối):**
   * Thay 4 trụ cố định bằng bộ sinh ngẫu nhiên `generateObstacles()` chạy mỗi khi bắt đầu / chơi lại trận mới.
   * Ngẫu nhiên số lượng (**3–5 khối**), vị trí (có kiểm tra khoảng trống quanh điểm spawn, biên tường và lối đi giữa các khối) và **3 kiểu dáng** với kích thước khác nhau cho khả năng che chắn đa dạng: **Lục giác** (trụ tròn gọn), **Vuông** (khối chắn trung bình, xoay 0°/45°), **Chữ nhật** (tường chắn dài, xoay theo bội 30°).
   * Kết xuất 2.5D đồng nhất (bóng đổ sàn, mặt cạnh đùn khối, mặt trên nâng cao kèm viền vát hình học theo đúng hình dạng).
3. **Chống bắn & chém xuyên tường vật cản:**
   * Bổ sung kiểm tra va chạm chính xác cho cả 3 hình dạng (Circle-vs-OBB, Circle-vs-Hex và kiểm tra đoạn thẳng cắt đa giác lồi Cyrus-Beck).
   * **Kiếm / Khiên:** Khi vung trúng vật cản sẽ bị chặn lại (bật tia lửa + âm thanh va chạm + giật lùi nhẹ), tuyệt đối không chém xuyên hay gây sát thương xuyên qua vật cản.
   * **Đạn mảnh phóng & Giáo:** Kiểm tra cắt đoạn chống xuyên tường mỏng; không thể gây sát thương vào mảnh hoặc thân địch nằm khuất sau tường. *(Mảnh đơn lẻ ở trạng thái Thu hồi bay cao vẫn giữ cơ chế bay vượt vật cản theo GDD).*
4. **Chuyển Giáo thành vũ khí tầm xa (Phi xa & Tự bay về):**
   * Khi tung đòn ở dạng **Giáo**, cả khối ghép đang khóa cạnh sẽ **phi thẳng** về hướng ngắm (tầm xa tỷ lệ theo độ kéo ngắm, tốc độ theo $S^{-0.5}$), bị chặn ngay khi chạm tường vật cản hoặc biên đấu trường.
   * Khi chạm tầm tối đa hoặc va tường, Giáo **tự động bay về** tay nhân vật với **tốc độ nhanh gấp đôi (`2×`)** và **sát thương giảm một nửa (`50%`)** cho cả mảnh lẫn thân địch; tự nâng độ cao mượt nếu cần lướt qua vật cản trên đường về để không bị kẹt.
   * Cập nhật Chỉ báo kỹ năng dạng đường phi xa, nhãn nút đánh sang `PHI` và điều chỉnh Bot AI giữ cự ly xa khi dùng Giáo.
5. **Cân bằng độ bền mảnh (Chốt Hướng C — Tăng HP mảnh):**
   * Đặt hệ số `HEX_HP_MULTIPLIER = 2.2` giữ nguyên thang sát thương đồng nhất: **Nặng `286 HP` · Base `220 HP` · Nhẹ `187 HP` · Sắc `154 HP`**.
   * Tinh chỉnh phản lực Khiên lên mảnh đánh tới còn `0.65×` để tránh vỡ đồng loạt hai bên sau một pha va chạm.
6. **Hiệu ứng `-HP` màu xám & Tự hồi HP chậm cho mảnh:**
   * Mỗi lần mảnh nhận sát thương sẽ hiển thị số bay `-XX` **màu xám sáng (`#cbd5e1`)** tách biệt với sát thương vào thân nhân vật.
   * Mảnh còn nguyên vẹn sẽ tự hồi HP chậm (`4% maxHp/giây`) sau `2.2s` không chịu sát thương.
7. **Mở rộng vòng chịu sát thương quanh nhân vật +40%:**
   * Tăng `PLAYER_RADIUS` từ `23` lên `32` (`+39.1%`), bổ sung nền mờ nhẹ bên trong vòng chân để nhận diện rõ vùng chịu sát thương bao quanh khối cầu nhân vật và đồng bộ lại khoảng neo vũ khí / bán kính quỹ đạo.

---

## v1.2 — 19/11/2026: Phân tách cơ chế Ghim/Tự hồi Mảnh đơn, Hủy chiêu vùng X (Liên Quân) & Kỹ năng Lướt (Dash)
1. **Phân tách chế độ phóng Mảnh đơn (Loose):**
   * Chỉ chế độ **Cắm & Thu (`xayah`)** mới ghim mảnh xuống sàn đấu chờ thu hồi bay cao.
   * Các chế độ còn lại (**Lần lượt `seq`** & **Đồng loạt `volley`**) khi bay hết tầm, va tường vật cản hoặc chạm mảnh địch sẽ **tự động quay về nhân vật** theo đúng quy tắc: **tốc độ bay về nhanh gấp đôi (`2×`)** và **sát thương giảm một nửa (`50%`)** cho cả mảnh lẫn thân địch (tự nâng mượt nếu cần lướt qua tường trên đường về, không gây sát thương xuyên tường).
2. **Cơ chế Hủy chiêu bằng vùng `✕ HỦY` (kiểu Liên Quân Mobile):**
   * Khi giữ/kéo ngắm nút **Tấn công** hoặc nút **Lướt** (cả trên cảm ứng Mobile lẫn kéo chuột Desktop), vòng tròn **`✕ HỦY`** tự động xuất hiện ở góc trên phải.
   * Kéo ngón tay / con trỏ vào vùng `✕ HỦY`: nút phóng to sáng đỏ, **Chỉ báo kỹ năng trên sân chuyển sang nét đứt màu đỏ** báo hiệu hủy; thả tay tại đây sẽ hủy chiêu không tung đòn và không tốn hồi chiêu (hỗ trợ thêm phím `Esc` / chuột phải khi đang ngắm trên Desktop).
3. **Bổ sung Kỹ năng Lướt (Dash):**
   * Thêm nút **`LƯỚT`** cho ngón cái phải (bố trí cạnh nút Tấn công, tách gọn không chồng lấn với Vòng cung 1–7 và nút Đổi dạng), hiển thị vòng quét & số đếm ngược hồi chiêu (**`3.5s`**).
   * Hỗ trợ **chạm nhanh** (lướt theo hướng Joystick/mặt nhìn) hoặc **kéo ngắm hướng** (kèm chỉ báo điểm đáp màu xanh ngọc & hỗ trợ hủy qua vùng `✕ HỦY`), kèm phím tắt **`Shift`** trên Desktop.
   * Tốc độ lướt `740 px/s` trong `0.17s` kèm hiệu ứng vòng dư ảnh phát sáng, âm thanh lướt riêng, tôn trọng va chạm tường/vật cản (không lướt xuyên tường), và nâng cấp Bot AI biết lướt né Giáo hoặc áp sát khi cầm Kiếm.

---

## v1.3 — 19/11/2026: Hệ thống 4 Quy tắc Vật lý Va chạm & Phòng thủ (Emergent Physics) + Hiệu ứng Nứt 3 cấp độ
1. **Triển khai đầy đủ 4 Quy tắc Vật lý Va chạm & Phòng thủ (không phân biệt cứng loại vũ khí):**
   * **Quy tắc 1 — Ưu tiên va chạm Mảnh–Mảnh (Collision Priority):** Sắp xếp và giải quyết toàn bộ va chạm Mảnh tấn công $\leftrightarrow$ Mảnh phòng thủ theo thứ tự từ lớp ngoài vào lớp trong (Tầng 1 $\rightarrow$ Tầng 2) trước khi xét Vòng tròn Hitbox chân; bổ sung `isBodyShieldedAlongPath` đảm bảo Giáo ném và mảnh phóng không bao giờ đi xuyên qua mảnh đang che chắn để trừ HP trực tiếp.
   * **Quy tắc 2 — Điểm tựa & Chia sẻ lực (Anchored Stance & Load Sharing):** Mọi mảnh thuộc khối đang **Cầm (`isHexAnchored`)** nhận hệ số $K_{\text{anchor}} = 1.4$ vào Sức cản kết cấu $R_{\text{chắn}} = H_{\text{gốc}} \times S^{-1.5} \times (1 + 0.1 \times N_{\text{cạnh}}) \times 1.4$, đồng thời chia đều **$30\%$** sát thương độ bền nhận vào sang các mảnh đồng đội nối cạnh nguyên vẹn (`getAnchoredNeighbors`).
   * **Quy tắc 3 — Ngân sách Động năng & Xuyên có suy hao (Kinetic Energy Budget):** Khối Giáo ném và mảnh phóng mang ngân sách động năng $E_{\text{đâm}}$ (`computeSpearKineticEnergy` / `computeLooseKineticEnergy`), xử lý đúng 3 kịch bản:
     * *Chặn đứng (`E_eff < R_def`):* Triệt tiêu động năng, bật ngược/thu về (`CHẶN!`), đẩy lùi nhẹ, **HP an toàn 100%**.
     * *Chặn tầng 2:* Lớp 1 vỡ hút cạn động năng ($E_{\text{dư}} = E_{\text{eff}} - R_{\text{lớp 1}}$), lớp 2 chặn đứng phần dư, kích hoạt BFS tái hợp nhất, **HP an toàn 100%**.
     * *Đục thủng suy hao (`E_dư > 0`):* Chỉ khi phá hết các lớp chắn trên đường bay mới đánh tới Hitbox chân với tốc độ & sát thương giảm theo tỷ lệ $E_{\text{dư}} / E_{\text{đâm}}$ (`XUYÊN PHÁ!`).
   * **Quy tắc 4 — Góc va chạm & Trượt lệch hướng ($\theta > 35^\circ$):** Tính góc tới $\theta$ theo pháp tuyến bề mặt kết hợp hướng nghiêng cụm chắn (`computeDefenseNormal`), suy giảm $E_{\text{eff}} = E_{\text{đâm}} \times \cos(\theta)$. Khi $\theta > 35^\circ$ và $E_{\text{eff}} < R_{\text{chắn}}$, đòn ném kích hoạt pha **trượt văng lệch hướng (`ricochet` — `TRƯỢT!`)** ra ngoài vòng tròn chân đối thủ.
2. **Hiệu ứng 3 mức đường nứt màu vàng hổ phách trên mảnh lục giác:**
   * Thay đường nứt đơn `< 30%` cũ bằng hệ thống **3 cấp độ tổn hại** sắc nét theo phong cách ảnh mẫu:
     * **`50% < HP ≤ 75%`:** **1 đường nứt** chữ V vàng hổ phách ở tâm mảnh.
     * **`25% < HP ≤ 50%`:** **2 đường nứt** gãy rõ ràng kèm ánh phát sáng nhẹ.
     * **`0% < HP ≤ 25%`:** **3 đường nứt** chẻ sâu cảnh báo nguy kịch kèm nhịp nhấp nháy sáng.

---

## v1.4 — 19/11/2026: Sửa chuẩn xác điểm rơi vòng vàng & Tắt tự động thu hồi khi bấm phóng hết mảnh
1. **Sửa quỹ đạo mảnh đơn bay chính xác tuyệt đối tới vòng vàng chỉ báo:**
   * Đồng bộ chung hàm tính tầm phóng `getLooseLaunchRange(strength)` (`120px` – `480px`) giữa Chỉ báo kỹ năng (`renderSkillIndicator`), điều khiển cảm ứng (`handlePointerEnd` truyền trực tiếp `aimStrength`), điều khiển kéo chuột Desktop (`updateDesktopCanvasAim`) và vật lý bay (`launchHex`).
   * Thay cơ chế giảm tốc ma sát cũ (vốn bỏ qua `targetX/targetY` và lệch khoảng cách theo từng chất liệu) bằng cơ chế theo dõi quãng đường đích `remainingDist` hướng thẳng từ mảnh tới tâm vòng vàng — mảnh luôn bay dứt khoát và ghim đúng tâm vòng vàng (trừ khi gặp vật cản/mảnh địch hoặc bật nảy ở chế độ Xoay ngẫu nhiên).
2. **Chỉ thu hồi khi người chơi chủ động bấm nút Thu hồi:**
   * Bỏ cơ chế tự động gọi `triggerSmartRecall` trong `executeFighterAttack` khi không còn mảnh nào đang quay quanh thân (`pool.length === 0`). Khi đã phóng hết mảnh, bấm phóng tiếp sẽ chỉ báo âm thanh nhẹ chứ không tự thu hồi toàn bộ mảnh đang ghim trên sân.

---

## v1.5 — 19/11/2026: Bỏ tự chọn mảnh mặc định ở Đơn lẻ & Biến mảnh ghim đất thành Thực thể vật lý chắn đường gây sát thương
1. **Bỏ chọn mặc định tất cả các mảnh ở trạng thái Đơn lẻ:**
   * Đặt `selected: false` khi khởi tạo mảnh mới (`createHex`), khi chuyển về trạng thái Đơn lẻ (`setFighterForm`) và khi mảnh vỡ hồi lại vào quỹ đạo.
   * Người chơi chủ động kéo/chạm trên Vòng cung chọn mảnh (1–7) hoặc bấm `Chọn hết` để chọn nhóm mảnh muốn phóng; nếu chưa chọn mảnh nào, bấm phóng sẽ nhắc nhẹ thay vì tự động bắn mảnh chưa chọn.
2. **Mảnh ghim dưới đất (`PLANTED`) trở thành thực thể vật lý chắn lối đi & gây sát thương chạm:**
   * Bổ sung va chạm vật lý cứng giữa nhân vật và toàn bộ mảnh đang ghim trên sân (`PLANTED`): nhân vật **không thể đi xuyên hay lướt xuyên** qua mảnh ghim, mảnh không bao giờ lồng vào trong thân nhân vật (`placePlantedHexSafely` đẩy mảnh ra sát mép ngoài ngay khi ghim nếu trùng vị trí nhân vật).
   * Đối thủ chạm vào mảnh ghim ở **bất kỳ chế độ xoay nào** đều chịu sát thương tiếp xúc (nhịp hồi chạm `0.45s`, chế độ Xoay pháp tuyến vẫn nhận thêm thưởng sát thương) và có thể dùng đòn đánh phá vỡ mảnh ghim để mở đường đi.
   * Cập nhật Bot AI tự lách qua các mảnh ghim chắn đường của người chơi.

---

## v1.6 — 19/11/2026: Hợp nhất 3 chế độ Xoay trục vào 4 Quy tắc Vật lý Va chạm
Tích hợp trực tiếp 3 chế độ xoay ở trạng thái Đơn lẻ vào bộ công thức $E_{\text{đâm}}$, $R_{\text{chắn}}$ và góc tới $\theta$ (loại bỏ cơ chế xác suất 25% rời rạc và không cần thanh Stamina):
1. **Không xoay (`static`):**
   * Giữ nguyên `100%` chỉ số chuẩn (`spinMult = 1.0`), ghép sang vũ khí tức thì với độ trễ **`0s`** (`instantStaticSnap` trong `applyPresetFormation`), và **không bị tự mài mòn độ bền** khi va vào khối Cầm của địch (`applyLooseSelfWear`).
2. **Xoay trục pháp tuyến (`normal`):**
   * Tăng Ngân sách Động năng $E_{\text{đâm}}$ và sát thương thêm **`+35%`**, đồng thời giảm tác dụng góc vát xuống còn `55%` (`theta *= 0.55` trong `computeEffectiveImpactAngle`) giúp bám cắn vào mặt khiên khó bị trượt lệch hướng.
   * **Đánh đổi vật lý tự nhiên:** Mỗi lần va vào khối Cầm cứng (`isHexAnchored`), chính mảnh đang xoay bị trừ độ bền mài mòn tỷ lệ theo sức cản $R_{\text{chắn}}$ của đối thủ (`clamp(rDef * 0.16, 12, 55)`), hiển thị số `-HP` màu xám và 3 cấp đường nứt trực tiếp.
3. **Xoay ngẫu nhiên (`random`):**
   * Nảy bật tối đa 3 lần khi chạm vật cản, biên sàn đấu **lẫn khi bị khối Cầm chặn đứng** (phản xạ kèm độ lệch bất ngờ `±0.22 rad` và giữ `85%` động năng để tạo góc đánh úp).
   * Khi dùng để chặn đòn địch, tự động cộng thêm **góc tới ảo $\theta$ (`+24° ~ +46°`)** trong `computeEffectiveImpactAngle`, khiến Giáo ném hoặc mảnh phóng đối phương dễ dàng kích hoạt **Trượt lệch hướng (`TRƯỢT!`)** theo đúng Quy tắc 4.
   * **Đánh đổi:** Ngân sách Động năng $E_{\text{đâm}}$ & sát thương mỗi cú phóng dao động ngẫu nhiên trong khoảng **`70%` – `125%`** (`hex.randomRoll`).

---

## v1.7 — 19/11/2026: Tối ưu song song Điện thoại (4 ngón) & Máy tính (PC Chuột + Bàn phím) + Nút Toàn màn hình PC
1. **Kiến trúc Dual-Mode tự động nhận diện thiết bị (`desktop` / `touch`) + Nút chuyển nhanh:**
   * Tự động nhận diện thiết bị cảm ứng vs Máy tính khi khởi chạy và linh hoạt chuyển đổi khi chạm/di chuột, kèm nút chuyển nhanh **`🖥️ PC / 📱 Mobile`** trên thanh trên cùng.
   * Giữ nguyên 100% bố cục 4 ngón trên Điện thoại; trên Máy tính tự ẩn Joystick ảo & Attack Pad, thay bằng **Thanh điều khiển PC gọn đẹp ở đáy màn hình** (4 nút đổi dạng, 7 ô chọn mảnh `1–7` hỗ trợ click/kéo quét + hover ping trên sân, `Chọn hết [V]`, 3 kiểu phóng `[Z/X/C]`, `Thu hồi [Space]` và `LƯỚT [Shift]`).
2. **Nút Toàn màn hình rõ ràng cho cả Máy tính & Điện thoại:**
   * Nâng cấp nút **`⛶ Toàn màn hình`** nổi bật ngay thanh trên cùng (tự đổi nhãn thành **`✕ Thoát FS`** khi vào toàn màn hình qua `fullscreenchange`, tự căn lại Canvas HiDPI & HUD).
3. **Hướng đánh, xoay Khiên & vị trí rơi theo con trỏ chuột theo thời gian thực (PC):**
   * Theo dõi tọa độ chuột trong không gian sân đấu liên tục mỗi khung hình (`mouse.wx, mouse.wy`): nhân vật, **Khiên** (dễ dàng nghiêng góc $> 35^\circ$ đỡ trượt đòn), **Kiếm**, **Giáo** tự xoay hướng theo con trỏ chuột ngay cả khi chưa bấm; di chuột tới đâu vòng vàng rơi mảnh & tâm ngắm Neon (`renderDesktopReticle`) bám theo 1:1 tới đó.
   * Bấm chuột trái đánh/phóng ngay tới vị trí chuột hoặc giữ chuột trái để xem chỉ báo kỹ năng (chuột phải / `Esc` / kéo vào `✕ HỦY` để hủy); phím `Shift` lướt theo hướng `WASD` hoặc theo hướng chuột nếu đang đứng yên.
4. **An toàn chống kẹt phím/Joystick (`blur` & `visibilitychange`):**
   * Bổ sung `clearAllInputs()` tự nhả toàn bộ phím `WASD` và điểm chạm khi chuyển tab hoặc kéo thanh thông báo.
5. **Đổi tên file bản thử nghiệm:**
   * Đổi tên `hex_arena_web_mobile_prototype_v1.html` → `hex_arena_web_prototype_v1.html` và cập nhật tiêu đề trang sang *PC & Mobile*.

---

## v1.8 — 19/11/2026: Cải tiến Thu hồi 1 mảnh chỉ định (1 chạm Mobile/PC + Chuột phải trực tiếp lên mảnh trên sân)
1. **Tự bỏ chọn mảnh khi rời tay (`launchHex`) & khi thu hồi (`triggerSmartRecall`):**
   * Ngay khi phóng mảnh đi, mảnh tự chuyển `selected = false` (hiện màu hổ phách trầm trên thanh `1–7`).
   * **Thu toàn bộ:** chỉ cần bấm `Thu hồi` / `Space` ngay (không cần bỏ chọn mảnh nào).
   * **Thu riêng 1 mảnh (hoặc nhóm mảnh):** chỉ cần chạm/click **1 lần** vào ô mảnh muốn thu (nút Thu hồi tự đổi nhãn `Thu (N chọn)` viền trắng) rồi bấm `Thu hồi`.
2. **Thu hồi trực tiếp bằng chuột phải trên PC (`findPlantedHexAtWorld` & `recallSpecificHex`):**
   * Rê chuột lên mảnh đang ghim trên sân sẽ hiện vòng sáng vàng kèm gợi ý `Chuột phải: Thu mảnh này`; bấm **chuột phải trực tiếp lên mảnh** sẽ kéo riêng đúng mảnh đó bay về ngay lập tức (chuột phải ra vùng trống vẫn thu hồi thông minh như cũ).

---

## v1.9 — 19/11/2026: Rút gọn phím tắt Co giãn (1 nút `E`) & Xoay trục (1 nút `Q`)
1. **1 nút `Q` xoay vòng chế độ Xoay trục:** Bấm `Q` luân phiên `Tĩnh → Pháp tuyến → Ngẫu nhiên` (chỉ áp dụng ở trạng thái Đơn lẻ), hiển thị nhãn `[Q]` ngay tiêu đề cụm Xoay trục.
2. **1 nút `E` xoay vòng Co giãn:** Bấm `E` luân phiên `60% Nhỏ → 100% Chuẩn → 150% To` ở mọi trạng thái, hiển thị nhãn `[E]` ngay tiêu đề cụm Co giãn và đồng bộ bảng Hướng dẫn.

---

## v1.10 — 19/11/2026: Thêm phím `R` đổi dạng vũ khí
* Gán thêm phím **`R`** (bên cạnh `F`/`Tab`) để xoay vòng nhanh 4 dạng vũ khí (`Đơn lẻ → Giáo → Kiếm → Khiên`), tạo cụm phím tay trái gọn gàng **`Q` (Xoay) – `E` (Co giãn) – `R` (Đổi dạng)**, đồng thời cập nhật thanh gợi ý PC và bảng Hướng dẫn.

---

## v1.11 — 19/11/2026: Gán 1 phím `F` xoay vòng 3 kiểu phóng ở chế độ Đơn lẻ
* Chuyển phím **`F`** chuyên dùng để xoay vòng 3 kiểu phóng trong chế độ Đơn lẻ (`Cắm & Thu → Lần lượt → Đồng loạt`), bỏ tách lẻ `Z/X/C` và tách `F` khỏi đổi dạng vũ khí (`R` / `Tab`).
* Hiển thị nhãn **`[F]`** cạnh cụm 3 tab kiểu phóng trên thanh PC và đồng bộ thanh gợi ý + bảng Hướng dẫn (`Q` Xoay · `E` Co giãn · `R` Đổi dạng · `F` Kiểu phóng).

---

## v1.12 — 19/11/2026: Tự động chọn lại mảnh khi Thu hồi về tay
* Khi mảnh được thu hồi (cả thu hồi thông minh `triggerSmartRecall`, chuột phải trực tiếp `recallSpecificHex` lẫn tự quay về ở chế độ `Lần lượt`/`Đồng loạt`), mảnh tự động bật lại trạng thái **đang chọn (`selected = true`)** để người chơi có thể phóng tiếp liền mạch mà không phải chọn lại từ đầu (trong khi lúc vừa phóng đi ghim đất vẫn tự bỏ chọn để giữ thao tác 1 chạm thu riêng 1 mảnh).

---

## v1.13 — 19/11/2026: Đổi `Space` sang Chọn/Bỏ chọn hết mảnh & Bỏ phím `V`
* Chuyển phím **`Space`** sang chức năng **`Chọn hết / Bỏ chọn hết`** mảnh ở trạng thái Đơn lẻ (`toggleSelectAllHexes`), bỏ phím `V` thừa vì Thu hồi trên PC đã thao tác tiện bằng **Chuột phải (`RMB`)**.
* Cập nhật nhãn nút trên thanh PC (`Chọn hết [Space]`, `Thu hồi [RMB]`), thanh gợi ý và bảng Hướng dẫn.

---

## v1.14 — 19/11/2026: 4 Kỹ năng Đặc biệt thuần vật lý, Chuẩn hóa 3 Trạng thái Tấn công & Bỏ sát thương ở Phòng thủ

### 1. Hệ thống 4 Kỹ năng Đặc biệt theo Trạng thái (dùng chung thời gian hồi chiêu)
* Gán phím tắt **`[C]`** (PC), nút tròn **Chiêu đặc biệt** phía trên nút Đổi dạng (Mobile 4 ngón) và nút **`[C]`** cạnh nút Lướt trên thanh Dock PC; Bot AI cũng chủ động sử dụng chiến thuật.
* Đổi trạng thái khi đang giữ buff sẽ hủy hiệu ứng cũ để ngăn lạm dụng chồng chiêu; 4 trạng thái dùng chung 1 thanh hồi chiêu:
  1. **Đơn lẻ — Quá Tải Ly Tâm (`4.0s`, hồi `10.0s`):** Tăng **`+30%`** tốc độ xoay quỹ đạo, tốc độ phóng và thu hồi mảnh; mở rộng vòng quỹ đạo **`+20%`** thành vòng bánh đà ly tâm chủ động gây sát thương cưa gần và tăng góc lệch bật đạn **`+22°`** khi va chạm mảnh quỹ đạo.
  2. **Đánh gần (`sword`) — Phản Chém Tước Mảnh (cửa sổ `2.0s`, giữ mảnh `3.0s`, hồi `12.0s`):** Cường hóa nhát chém chủ động kế tiếp (không kích hoạt khi đỡ thụ động). Chém trúng mảnh đơn lẻ của địch sẽ bật ngược lại (tối đa 3 mảnh/nhát) và chiếm quyền sở hữu tạm thời (`STOLEN_FLY → STOLEN_FLOOR → STOLEN_RETURN`): mảnh đổi sang màu đội chiếm, nằm bất động trên sàn **`3.0s`** (không ai điều khiển được, đóng vai trò chướng ngại vật gây sát thương va chạm lên chủ cũ) rồi bay cao trả về cho chủ cũ. Chém trúng vũ khí lắp ghép sẽ tước ngẫu nhiên **1 mảnh** nguyên vẹn của địch và kích hoạt tự ghép lại (BFS) trên vũ khí địch.
  3. **Đánh xa (`spear`) — Ngự Thương Độc Lập (`4.0s`, hồi `12.0s`):** Tăng **`+30%`** tốc độ vũ khí và tách vũ khí Đánh xa bay tự do độc lập (`phase: 'guided'`) khỏi nhân vật. Người chơi di chuyển nhân vật bằng `WASD`/Joystick trái, đồng thời lái đường bay vũ khí bằng con trỏ chuột (PC) hoặc bàn rê Đánh tay phải (Mobile). Nếu ngừng điều khiển (chuột đứng yên `> 0.75s` hoặc thả tay phải), vũ khí tự động chuyển sang chế độ **Tự động (`Auto-Pilot`)** săn đuổi đối thủ; hết **`4.0s`** tự động bay về tốc độ `2×` (`50%` sát thương).
  4. **Phòng thủ (`shield`) — Pháo Đài Phản Xung (`3.0s`, hồi `13.0s`):** Phóng đại khiên lên **`150%`** nhưng vẫn giữ nguyên độ cứng đặc nén như lúc **`60%`** ($R_{\text{chắn}}$ tính theo $S = 0.6$). Đánh đổi bằng **`-40%`** tốc độ chạy, khóa kỹ năng Lướt (`Shift`) và giới hạn tốc độ xoay mặt (`3.4 rad/s`). Mỗi khi đỡ/làm lệch đòn đánh, Pháo Đài tích trữ động năng va chạm (`storedEnergy`) hiển thị bằng vòng cung vàng quanh nhân vật; khi bấm đánh sớm hoặc hết `3.0s`, giải phóng **Sóng Phản Xung** hình quạt phía trước đẩy văng toàn bộ đối thủ & mảnh địch.

### 2. Tổng quát hóa tên Trạng thái Tấn công & Phòng thủ 0 sát thương
* Đổi toàn bộ nhãn hiển thị trên giao diện từ tên vũ khí cố định (`Giáo` / `Kiếm` / `Khiên`) sang tên **3 Trạng thái Tấn công tổng quát**:
  * **`Đánh xa`** (mẫu Giáo hiện tại)
  * **`Đánh gần`** (mẫu Kiếm hiện tại)
  * **`Phòng thủ`** (mẫu Khiên hiện tại)
* **Bỏ hoàn toàn sát thương HP ở trạng thái `Phòng thủ`:** Cả cú húc thường (`ĐẨY LÙI`) lẫn sóng `PHẢN XUNG` của Pháo Đài đều gây **`0` sát thương máu**, chuyên biệt hoàn toàn cho phòng ngự, đẩy lùi, phá nhịp và hất văng mảnh địch.

### 3. Định hướng Kiến trúc Giai đoạn 2 — Tự do Lắp ráp & Kế thừa Trạng thái Tấn công
* **Tư tưởng thiết kế cốt lõi cho Phase 2:**
  * Thay vì bị bó buộc vào 3 hình dạng dựng sẵn (Giáo, Kiếm, Khiên), người chơi sẽ có **Bàn Lắp Ráp Lục Giác tự do** trên lưới tọa độ trục `(q, r)` để tự tạo hình vũ khí từ các mảnh lục giác (tự chọn hình dáng dài/rộng/lệch tâm/vòng cung, phân bổ chất liệu Nặng/Sắc/Nhẹ/Cơ bản và điểm neo tay cầm).
  * Sau khi ghép hình xong, người chơi gán cho cụm vũ khí đó **1 trong 3 Trạng thái Tấn công** (`Đánh xa`, `Đánh gần`, `Phòng thủ`):
    * **Kế thừa hành vi & Kỹ năng đặc biệt từ Trạng thái:** Vũ khí tự do lắp ráp sẽ tự động kế thừa cơ chế ra đòn chuẩn và Kỹ năng Đặc biệt của Trạng thái đã chọn (`Đánh xa` → phóng/Ngự Thương Độc Lập; `Đánh gần` → quét chém/Phản Chém Tước Mảnh; `Phòng thủ` → che chắn 0 sát thương đẩy lùi/Pháo Đài Phản Xung).
    * **Thuộc tính vật lý tự phát sinh (Emergent Physics) từ hình dáng ghép:** Tầm đánh, bề rộng che chắn, độ bền cấu trúc ($R_{\text{chắn}}$), hệ số neo (`ANCHOR_BONUS`), chia tải lân cận (`LOAD_SHARE_RATIO`) và góc nảy đạn hoàn toàn tự sinh từ chính sơ đồ mảnh người chơi thiết kế — không cần hardcode chỉ số riêng theo tên vũ khí.
  * *(Lưu ý kỹ thuật Phase 1: giữ nguyên khóa nội bộ `spear`/`sword`/`shield` trong prototype HTML để ổn định mã nguồn hiện tại; khi bước sang Phase 2 sẽ tách lớp `WeaponBlueprint` (tọa độ `(q, r)` + chất liệu) độc lập với `CombatStance` (`ranged` / `melee` / `defense`)).*

---

## v1.15 — 19/11/2026: Kéo dài 8s Kỹ năng Đặc biệt, Pháo Đài Phản Xung gây sát thương & Ngự Thương chậm hơn, +35% sát thương kèm Khung nét đứt điều hướng
1. **Kéo dài thời gian duy trì lên `8.0s` & tăng thời gian hồi chiêu (`SPECIAL_SKILLS`):**
   * **Đơn lẻ — Quá Tải Ly Tâm:** duy trì **`8.0s`** · hồi chiêu **`18.0s`**.
   * **Đánh gần — Phản Chém Tước Mảnh:** duy trì trọn vẹn **`8.0s`** (mọi nhát chém chủ động trong 8s đều có thể phản & tước mảnh thay vì mất hiệu ứng sau 1 nhát), thời gian mảnh bị tước nằm vô chủ trên sàn tăng lên **`4.5s`** · hồi chiêu **`20.0s`**.
   * **Đánh xa — Ngự Thương Độc Lập:** duy trì **`8.0s`** · hồi chiêu **`20.0s`**.
   * **Phòng thủ — Pháo Đài Phản Xung:** duy trì **`8.0s`** · hồi chiêu **`20.0s`**.
   * Đồng thời sửa lỗi hiển thị thanh tiến trình (`maxTimer`) và dọn bỏ đoạn định nghĩa hàm trùng lặp.
2. **Riêng Kỹ năng Đặc biệt của `Phòng thủ` (`Pháo Đài Phản Xung`) gây sát thương:**
   * Đòn đánh thường của `Phòng thủ` (`ĐẨY LÙI`) vẫn giữ **`0` sát thương máu** (thuần đẩy lùi).
   * Riêng **Sóng Phản Xung** khi bấm kích nổ sớm hoặc khi hết `8.0s` giờ gây sát thương động năng thực lên máu đối thủ (**`12` sát thương nền → tối đa `62` HP** tùy lượng động năng đã đỡ được, kèm `1.35×` sát thương cấu trúc lên mảnh địch trong vùng quạt và hất văng mảnh).
3. **Cải tổ cảm giác lái `Đánh xa` (`Ngự Thương Độc Lập`):**
   * **Bỏ buff tốc bay `+30%`**; đổi sang **giảm tốc bay xuống `~0.56×` (`320–440 px/s`)** và **tăng sát thương lên `+35%`** (`passDmgMult = 1.35`, động năng xuyên `1.35×`) giúp dễ lái chính xác nhưng uy lực nặng tay hơn.
   * **Hãm tốc mượt khi gần con trỏ chuột** (`< 85px`) để vũ khí dừng gọn ngay trong khung đích mà không bị vọt lố/giật qua lại quanh chuột.
   * **Đổi định vị chiêu sang Khung nét đứt của chính hình dáng vũ khí:** Khi đang ở trạng thái Ngự Thương, ẩn hoàn toàn thanh định vị ném thường (`renderSkillIndicator` & đường ngắm chuột mặc định), thay bằng **khung nét đứt vẽ đúng toàn bộ cụm mảnh lục giác** tại điểm đích mà vũ khí đang bay tới (nối bằng đường dẫn nét đứt + nhãn `LÁI` / `TỰ ĐỘNG` kèm bộ đếm giây). Kiến trúc này dùng trực tiếp tọa độ `(animQ, animR)` nên sẽ tự động tương thích với mọi vũ khí tự lắp ráp ở Phase 2.

---

## v1.16 — 19/11/2026: Tối ưu điều khiển chuột Ngự Thương Độc Lập sang cơ chế Click chỉ điểm
* **Chuyển từ rê chuột sang Click chỉ điểm (PC Desktop):** Khi đang kích hoạt kỹ năng đặc biệt `Đánh xa` (`Ngự Thương Độc Lập`), di chuyển chuột tự do sẽ **không** kéo lệch hướng bay vũ khí nữa.
* **Click chuột trái (hoặc nhấn giữ kéo)** vào bất kỳ vị trí nào trên sân sẽ ghim ngay điểm đích mới (`issueGuidedSpearClickCommand`) kèm gợn sóng tím phản hồi, khung nét đứt của vũ khí khóa chặt tại **`ĐIỂM CLICK`**, và vũ khí bay thẳng tới vị trí đó (không bật khung ngắm/`✕ HỦY` gây rối mắt).
* **Chuyển tiếp mượt về Tự động (`TỰ ĐỘNG`):** Khi chưa click điểm nào, khi đã tới đích quá `0.65s` mà không click tiếp, hoặc khi bấm **Chuột phải** để hủy điểm click, vũ khí tự động quay về chế độ `TỰ ĐỘNG` săn đuổi đối thủ.













# GAME DESIGN DOCUMENT (GDD) — HEX ARENA

* **Tên dự án:** Hex Arena
* **Thể loại:** Đối kháng Đấu trường (Arena Fighting) kết hợp Vật lý & Lắp ráp mô-đun Lục giác
* **Nền tảng mục tiêu:** Di động (Mobile — màn hình cảm ứng nằm ngang)
* **Game Engine:** Godot
* **Phiên bản tài liệu:** 2.0 (Hoàn thiện trọn bộ Chương 1 – Chương 9)

---

## CHƯƠNG 1: TỔNG QUAN & KHÔNG GIAN CHIẾN ĐẤU

* **Góc nhìn & Không gian:** **2.5D Top-Down Mobile Arena** (góc nhìn từ trên xuống có chiều sâu vật thể và đổ bóng).
  * *Mục tiêu thiết kế:* Tối ưu hóa tầm nhìn bao quát $360^\circ$ trên màn hình di động, đảm bảo khả năng đọc thông tin (readability) khi nhiều mảnh lục giác chuyển động, xoay trục và co giãn cùng lúc mà không che khuất nhân vật.
* **Ý tưởng cốt lõi (Core Concept):**
  * Người chơi điều khiển một tập hợp các mảnh lục giác mang thông số vật lý thuần túy.
  * Chuyển đổi linh hoạt giữa **Trạng thái Đơn lẻ** (cơ động, tự xoay trục, chia góc tấn công) và **Trạng thái Ghép** (tạo vũ khí như Giáo, Khiên, Kiếm theo cấu hình lắp sẵn trước trận).
  * Kết hợp cơ chế **Co giãn kích thước** theo hệ số cân bằng tổng hợp và cơ chế **Vỡ mảnh – Tự động tái hợp nhất**, tạo ra lối chơi khắc chế chiến thuật giàu chiều sâu.

---

## CHƯƠNG 2: HỆ THỐNG MẢNH, TRẠNG THÁI & CƠ CHẾ VA CHẠM

### 2.1. Tài nguyên Mảnh & Lắp ráp trước trận
* Mỗi người chơi sở hữu cố định từ **5 đến 10 mảnh lục giác** trong một trận đấu.
* **Trước trận đấu (Pre-match Loadout):** Người chơi tự do sắp xếp vị trí từng mảnh và lưu sẵn các **Cấu hình vũ khí (Presets)** (ví dụ: Giáo, Khiên, Kiếm...) từ số mảnh đang có.

### 2.2. Hai Trạng thái Chiến đấu trong trận
1. **Trạng thái Đơn lẻ (Loose / Swarm):**
   * Các mảnh tách rời và hoạt động độc lập.
   * Là trạng thái **duy nhất** được phép kích hoạt **cơ chế tự xoay quanh trục**, tối ưu khả năng cắt/đâm xuyên, độ cơ động và chiến thuật chia góc ép đối thủ.
2. **Trạng thái Ghép (Assembled):**
   * Các mảnh hút lại và khóa khớp cứng vào nhau theo đúng Cấu hình đã thiết lập trước trận.
   * **Không thể tự xoay từng mảnh quanh trục riêng**; thay vào đó tối ưu hóa tầm vươn, diện tích che chắn và lực va chạm tổng thể của cả khối vũ khí.

### 2.3. Cơ chế Va chạm — Vòng tròn Hitbox ở chân (Directional Arc)
* **Hitbox nhân vật:** Mỗi nhân vật có một **vòng tròn Hitbox cố định dưới chân** trên mặt phẳng đấu trường để tính trúng/trượt đòn chính xác, triệt tiêu lỗi trúng ảo do góc nhìn 2.5D.
* **Phòng thủ theo góc phương vị ($360^\circ$):**
  * Khiên lục giác tạo thành một vòng cung bảo vệ ôm quanh vòng tròn Hitbox ở chân.
  * **Khiên phóng to:** Mở rộng góc che phủ để chặn kỹ năng diện rộng (AoE) hoặc đạn chùm, nhưng độ cứng giảm mạnh (dễ vỡ trước đòn xuyên giáp).
  * **Khiên thu nhỏ:** Nén chặt độ cứng để đỡ đòn hạng nặng/xuyên giáp, nhưng góc che phủ thu hẹp — đòi hỏi căn góc chuẩn xác, nếu lệch sẽ bị đánh lách sườn trực tiếp vào vòng tròn chân.
* **Độ chính xác tấn công (Skillshot Accuracy):**
  * Vũ khí **thu nhỏ** làm hẹp bề rộng vùng va chạm, yêu cầu nhắm chuẩn vào vòng tròn chân đối thủ để đổi lấy sát thương tập trung và độ xuyên giáp cao.

---

## CHƯƠNG 3: HỆ THỐNG ĐIỀU KHIỂN (MOBILE 4-FINGER HUD)

### 3.1. Bố cục điều khiển tiêu chuẩn 4 ngón
Hệ thống hỗ trợ tùy chỉnh vị trí HUD (Custom HUD), với bố cục mặc định tối ưu cho thao tác 4 ngón (Claw) nhằm tách bạch hoàn toàn các nhóm hành động:

| Ngón tay | Vị trí màn hình | Chức năng chính | Phạm vi áp dụng |
| :--- | :--- | :--- | :--- |
| **Ngón cái trái** | Góc dưới trái | Joystick di chuyển nhân vật $360^\circ$. | Mọi trạng thái |
| **Ngón cái phải** | Góc dưới phải | • Nút/Joystick Tấn công: kéo định hướng **Chỉ báo kỹ năng (Skill Indicator)** và tung đòn.<br>• **Nút Đổi trạng thái** (vị trí nút *Bổ trợ* kiểu MOBA): giữ & vuốt lên chọn cấu hình. | Mọi trạng thái |
| **Ngón trỏ phải** | Góc trên phải | Cụm **Co giãn 3 nấc** (*Thu nhỏ – Chuẩn – Phóng to*), tách bạch hoàn toàn với thao tác kỹ năng. | Cả *Đơn lẻ* & *Ghép* |
| **Ngón trỏ trái** | Góc trên trái | Cụm **3 Chế độ Xoay trục**. *(Tự động mờ/khóa khi sang dạng Ghép)*. | Chỉ *Đơn lẻ* |

### 3.2. Chi tiết Nút Đổi Trạng Thái & Cơ chế Co giãn Độc lập
* **Nút Đổi trạng thái (Vị trí Bổ trợ):**
  * Nhấn giữ để mở danh sách dọc các cấu hình lắp sẵn; **Trạng thái Đơn lẻ** luôn xếp ở vị trí đầu tiên (gần ngón cái nhất). Vuốt lên mục mong muốn rồi thả tay để chuyển đổi tức thì.
  * Hỗ trợ thao tác chạm nhanh (Quick Tap) chuyển qua lại tức thì giữa cấu hình hiện tại và Đơn lẻ trong tình huống khẩn cấp.
* **Cụm Co giãn 3 nấc (Tách bạch):**
  * Duy trì trạng thái liên tục (Persistent State) mà không làm gián đoạn hướng ngắm hay tầm kéo của Chỉ báo kỹ năng bên ngón cái phải.
  * **Tự động ghi nhớ kích thước mặc định (Smart Default):** Mỗi Cấu hình lắp sẵn có thể gán trước mức kích thước tối ưu khi chuyển sang.
  * **Phản hồi tức thì:** Khi đang giữ kéo Chỉ báo kỹ năng mà bấm đổi nấc Co giãn, vùng mờ trên sàn lập tức thu hẹp/phình to và đổi sắc độ màu kèm rung nhẹ (Haptic).

### 3.3. Điều khiển Trạng thái Đơn lẻ (Vòng cung Chọn mảnh & Chế độ Phóng)
* **Vòng cung chọn mảnh (Arc-Selector):**
  * Bao quanh nút Tấn công chính bên tay phải, trải đều toàn bộ các mảnh dưới dạng **các đốt liền mạch** (không khe hở chết) cho phép **chạm bật/tắt** từng mảnh hoặc **lia ngón cái (Swipe-to-Select)** để chọn/hủy nhiều mảnh cùng lúc.
  * **Liên kết thị giác (Visual Ping):** Chạm/lia tới đốt nào thì mảnh tương ứng ngoài đấu trường phát sáng viền mạnh kèm tia mờ nối về nhân vật; phân màu rõ giữa mảnh đang quay quanh thân và mảnh đang cắm trên sàn đấu.
* **Thanh chọn 3 Chế độ Phóng:** Chuyển đổi linh hoạt giữa **Phóng kiểu Xayah** (cắm chốt chờ thu hồi), **Phóng lần lượt** (xả liên thanh), và **Phóng đồng loạt** — giải phóng hoàn toàn nút Tấn công chính để tập trung điều hướng.
* **Nút thông minh & Gọn giao diện:**
  * Toàn bộ Vòng cung chọn mảnh và Thanh chế độ phóng **chỉ hiện ở trạng thái Đơn lẻ**, tự động ẩn gọn khi chuyển sang trạng thái Ghép.
  * Gồm nút **Chọn tất cả** và nút **Thu hồi thông minh** (thu hồi đúng các mảnh đang cắm trên sân được chọn; nếu không chọn mảnh cắm nào hoặc chạm đúp thì thu hồi toàn bộ).

---

## CHƯƠNG 4: CƠ CHẾ XOAY TRỤC (TRẠNG THÁI ĐƠN LẺ)

Áp dụng riêng cho cụm **ngón trỏ trái** khi ở trạng thái Đơn lẻ, gồm 3 chế độ chuyển đổi nhanh:

1. **Không xoay (Static):** Giữ cố định góc mặt phẳng của mảnh. Quỹ đạo bay ổn định, dễ căn chính xác và có tốc độ chuyển khớp sang trạng thái Ghép nhanh nhất.
2. **Xoay quanh trục pháp tuyến (Normal Spin):** Xoay tốc độ cao quanh trục vuông góc mặt mảnh (kiểu phi tiêu/lưỡi cưa), tối ưu sát thương cắt và khả năng bào/phá giáp.
3. **Xoay ngẫu nhiên (Chaotic Tumble):** Mảnh xoay lộn tự do theo nhiều trục không cố định, tạo góc va chạm khó đoán, có khả năng làm lệch hướng đòn đánh và **nảy bật** khi chạm vật cản.

*(Ghi chú cân bằng: Các cơ chế đánh đổi như tiêu hao năng lượng hoặc mài mòn độ bền khi xoay sẽ được giữ mở để tinh chỉnh sau khi đấu thử nghiệm thực tế).*

---

## CHƯƠNG 5: HỆ THỐNG MẢNH LỤC GIÁC, KẾT CẤU & VỠ MẢNH

### 5.1. Thông số Mảnh Base & Nguyên tắc Cân bằng Thuần Vật Lý
Giai đoạn đầu sử dụng hoàn toàn **chỉ số vật lý thuần túy** (chưa thêm hiệu ứng nguyên tố/phép thuật). Mọi loại mảnh đều được thiết kế xoay quanh **Mảnh chuẩn (Base Hex)** với cùng một tổng ngân sách điểm ($400$ điểm) để đảm bảo không mảnh nào mạnh toàn diện:

| Thông số gốc | Mảnh Base | Mảnh Nặng *(Ví dụ)* | Mảnh Sắc *(Ví dụ)* | Mảnh Nhẹ *(Ví dụ)* | Vai trò trong trận đấu |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Độ bền (Durability)** | $100$ | $130$ | $70$ | $85$ | Lượng sát thương mảnh chịu được trước khi vỡ tạm thời. |
| **Độ cứng (Hardness)** | $100$ | $130$ | $70$ | $85$ | Khả năng giảm sát thương nhận vào và độ kiên cố khi đỡ đòn. |
| **Độ sắc (Sharpness)** | $100$ | $80$ | $150$ | $90$ | Sát thương gốc và khả năng xuyên giáp khi va chạm bằng cạnh. |
| **Độ cơ động (Agility)** | $100$ | $60$ | $110$ | $140$ | Nghịch đảo của Trọng lượng: quyết định tốc độ bay/vung vũ khí (mảnh nặng đánh đầm/đẩy lùi mạnh hơn nhưng chậm hơn). |

### 5.2. Quy tắc Sức mạnh theo Vị trí & Kết cấu Ghép *(Tiếp tục nghiên cứu sâu)*
* **Trọng số vị trí tiếp xúc:** Mảnh đặt ở **mũi/rìa tấn công** quyết định tỷ trọng lớn sát thương xuyên giáp; mảnh ở **trục thân** đóng góp trọng lượng và độ ổn định; mảnh ở **mặt ngoài khiên** chịu sát thương trực tiếp trước.
* **Hệ số liên kết cạnh (Adjacency Synergy):** Một mảnh tiếp xúc càng nhiều cạnh với các mảnh đồng đội xung quanh sẽ nhận thêm phần trăm thưởng Độ cứng liên kết (ví dụ: $+10\%$ cho mỗi cạnh nối).

### 5.3. Vòng đời Vỡ mảnh, Tự động Tái hợp nhất & Hồi phục
* **Vỡ mảnh:** Khi Độ bền của một mảnh giảm về $0$, mảnh bị **vỡ tạm thời** và bắt đầu đếm ngược thời gian hồi phục (cooldown).
* **Tự động Tái hợp nhất (Magnetic Re-assembly):**
  * Nếu mảnh vỡ làm khối vũ khí bị chia cắt (mất liên kết cạnh), khối nào còn gắn với điểm neo của nhân vật đóng vai trò **Khối chính**.
  * Các mảnh bị mất kết nối sẽ **tự động tìm đến mảnh gần nhất** thuộc Khối chính và trượt hút khớp cạnh vào ô lục giác trống gần nhất để hợp nhất thành một khối liền mạch mới ngay giữa trận.
* **Hồi phục từng phần:** Khi từng mảnh hết cooldown trong lúc vẫn ở trạng thái Ghép, mảnh tự động tái xuất hiện và chèn vào vị trí trống trên khối hiện tại (vũ khí tự dài/rộng ra lại ngay giữa trận).
* **Hồi phục hoàn toàn:** Ngay khi toàn bộ mảnh đã hồi đủ, khối vũ khí tự động biến đổi (morph) trở về đúng **Cấu hình ghép ban đầu** *(chờ hoàn tất nhịp vung khoảng $0.1\text{s} - 0.2\text{s}$ nếu đang ra đòn để không làm lệch hướng ngắm)*.

---

## CHƯƠNG 6: HỆ SỐ TỔNG HỢP CÂN BẰNG CO GIÃN

Toàn bộ cơ chế Co giãn được chuẩn hóa theo **tỷ lệ phần trăm kích thước** để vừa vận hành mượt với 3 nấc cố định hiện tại, vừa sẵn sàng mở rộng sang thu phóng tự do theo phần trăm lẻ về sau.

* **Biến kích thước chuẩn hóa:**
  $$S = \frac{\text{Tỷ lệ thu phóng (\%)}}{100} \quad (\text{Mốc chuẩn } 100\% \Rightarrow S = 1.0)$$
* **Công thức tổng quát:**
  $$\text{Chỉ số hiệu dụng} = \text{Chỉ số gốc} \times S^{k}$$
  *(Trong đó $k$ là **Hệ số nhạy** của từng thông số, cho phép tinh chỉnh độ cân bằng nhanh khi playtest).*

### Bảng Hệ số Tham chiếu theo 3 Nấc Cố định

| Thông số chịu tác động | Công thức theo $S$ | Hệ số nhạy ($k$) | Thu nhỏ ($60\%$) | Chuẩn ($100\%$) | Phóng to ($150\%$) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Vùng trúng đòn / Góc khiên** | $A_{\text{gốc}} \times S^{1.0}$ | $+1.0$ | $60\%$ | $100\%$ | $150\%$ |
| **Độ cứng (Chịu sát thương)** | $H_{\text{gốc}} \times S^{-1.5}$ | $-1.5$ | $215\%$ | $100\%$ | $54\%$ |
| **Sát thương tập trung / Xuyên** | $D_{\text{gốc}} \times S^{-1.0}$ | $-1.0$ | $167\%$ | $100\%$ | $67\%$ |
| **Tốc độ bay / Vung vũ khí** | $V_{\text{gốc}} \times S^{-0.5}$ | $-0.5$ | $129\%$ | $100\%$ | $82\%$ |
| **Độ bền tối đa (HP mảnh)** | $HP_{\text{gốc}} \times S^{0}$ | $0$ | $100\%$ | $100\%$ | $100\%$ |

* *Ghi chú thiết kế:*
  * **Tốc độ ($V_{\text{gốc}}$)** liên kết trực tiếp với chỉ số **Độ cơ động (Agility)** của mảnh — phóng to làm chậm nhẹ tạo cảm giác đầm nặng, thu nhỏ tăng tốc tạo cảm giác sắc bén.
  * Giữ nguyên **Độ bền tối đa ($k = 0$)** và chỉ biến đổi **Độ cứng** giúp ngăn lỗi khai thác co giãn liên tục để hồi máu mảnh.

---

## CHƯƠNG 7: CẤU TRÚC TRẬN ĐẤU & ĐẤU TRƯỜNG

* **Chế độ chơi cốt lõi:** **1v1** đối kháng trực tiếp (tối đa $20$ mảnh trên sân, tối ưu tầm nhìn trên di động).
* **Thể thức & Thời lượng:** **1 hiệp duy nhất**, đếm ngược **10 phút**.
* **Điều kiện thắng:** Đánh cạn thanh **HP** của nhân vật đối thủ (thanh HP nhân vật tách biệt hoàn toàn với Độ bền của các mảnh lục giác).
* **Cơ chế chống câu giờ:** Chưa áp dụng ở phiên bản đầu; sẽ ghi nhận dữ liệu nhịp trận từ các phiên đấu thử nghiệm (playtest) thực tế để đánh giá và bổ sung sau.
* **Thiết kế Đấu trường:** **Hình lục giác lớn, dạng mở có bố trí vật cản** — tạo đủ không gian cho tầm vươn của Giáo và quỹ đạo thu hồi kiểu Xayah, đồng thời tận dụng góc cạnh để căn góc và đọc chiêu.
* **Quy tắc tương tác với Vật cản:**
  * Nhân vật và các mảnh đang **phóng đi** bị vật cản chặn lại.
  * Riêng các mảnh đang bật chế độ **Xoay ngẫu nhiên** khi chạm vật cản sẽ **nảy bật (ricochet)** đổi hướng.
  * Các mảnh đang ở trạng thái **Thu hồi** về nhân vật sẽ bay ở **quỹ đạo trên cao, lướt xuyên qua phía trên vật cản**, đảm bảo không bao giờ bị kẹt mảnh sau tường làm hỏng combo kiểu Xayah.

---

## CHƯƠNG 8: PHONG CÁCH THỊ GIÁC & CẢM GIÁC ĐÁNH (GAME FEEL)

* **Phong cách Đồ họa:** **Hình học Neon Tối giản (Minimalist Geometric Neon)** đặt trên **nền trung tính không quá tối** (tông xám đá / xanh xám lì — *Mid-tone Matte Slate*). Cách phối nền này vừa giúp viền Neon của các mảnh nổi bật sắc nét, giảm mỏi mắt trên màn hình điện thoại, vừa hiển thị rõ bóng đổ 2.5D của vật cản và các mảnh bay cao khi thu hồi.
* **Ngôn ngữ Thị giác (Visual Coding):**
  * **Màu sắc:** Dành riêng để phân biệt phe (*Phe ta* vs. *Phe địch*).
  * **Độ dày viền & Hoa văn lõi:** Phân biệt chất liệu mảnh (*Base, Nặng, Sắc, Nhẹ*).
  * **Cảnh báo Độ bền:** Khi Độ bền mảnh tụt xuống dưới **$30\%$**, bề mặt mảnh xuất hiện vết nứt phát sáng nhấp nháy nhẹ để hai bên nhận biết cơ hội phá kết cấu.
* **Phản hồi Va chạm (Game Feel):**
  * Áp dụng **Hit-stop** (khựng nhẹ khung hình khoảng $0.03\text{s} - 0.05\text{s}$) kết hợp **rung điện thoại (Haptic Feedback)** ở hai khoảnh khắc quan trọng: khi đòn **Thu nhỏ** đâm xuyên giáp thành công và khi **làm vỡ mảnh** của đối thủ.

---

## CHƯƠNG 9: CÔNG NGHỆ (GODOT) & LỘ TRÌNH BẢN THỬ NGHIỆM (MVP)

### 9.1. Gợi ý Kiến trúc Kỹ thuật trên Godot
* **Không gian & Hiển thị:** Dựng cốt lõi logic trên mặt phẳng 2D (`Node2D`, `CharacterBody2D`, `Area2D` cho vòng tròn Hitbox chân) kết hợp hiệu ứng chiều sâu 2.5D (đổ bóng lệch trục Y + nâng trục Y khi mảnh thu hồi bay qua vật cản). Dùng `WorldEnvironment` (Glow nhẹ) kết hợp `ShaderMaterial` cho hiệu ứng viền Neon và vết nứt độ bền $< 30\%$.
* **Lưới Lục giác & Tái hợp nhất:** Biểu diễn cấu hình ghép bằng **hệ tọa độ trục lục giác** $(q, r)$ (Axial Coordinates); chạy thuật toán duyệt đồ thị BFS từ mảnh Gốc neo mỗi khi có sự kiện vỡ mảnh để phát hiện mảnh cô lập và tìm ô $(q, r)$ trống gần nhất.
* **Cảm ứng Đa điểm (4 ngón):** Xử lý trực tiếp `InputEventScreenTouch` và `InputEventScreenDrag` theo `event.index` để đảm bảo 4 ngón tay (Joystick, Vòng cung lia tay, Co giãn 3 nấc, Xoay trục) hoạt động song song không bị cướp sự kiện cảm ứng.

### 9.2. Lộ trình Phát triển Bản thử nghiệm (MVP — 3 Giai đoạn)

| Giai đoạn | Phạm vi triển khai | Mục tiêu kiểm chứng (Playtest) |
| :--- | :--- | :--- |
| **Giai đoạn 1: Core Sandbox**<br>*(1 Người chơi + Bia tập)* | • Đấu trường lục giác 2.5D + Vòng tròn Hitbox chân.<br>• $7$ Mảnh Base, 2 trạng thái (*Đơn lẻ* / *Ghép* cấu hình cố định).<br>• Bố cục 4 ngón: Joystick trái, Nút Đổi dạng (vuốt lên), Vòng cung lia tay, Co giãn 3 nấc ($S^k$), 3 chế độ Xoay trục. | Test trực tiếp trên điện thoại để đo độ mượt thao tác **4 ngón** & **Vòng cung lia tay**; tinh chỉnh hệ số nhạy tốc độ $k_V$. |
| **Giai đoạn 2: Combat & Break**<br>*(1v1 với Bot AI cơ bản)* | • 4 biến thể chất liệu mảnh (*Base, Nặng, Sắc, Nhẹ*) + tính chỉ số theo vị trí & liên kết cạnh.<br>• Hệ thống Độ bền, Vỡ mảnh, **Tự động Tái hợp nhất (BFS)** & Hồi phục nguyên trạng.<br>• Vật cản (chặn/nảy/xuyên khi thu hồi) + Hit-stop & Haptic. | Đo nhịp đối kháng thực tế trong hiệp 10 phút; kiểm tra độ cân bằng 3 nấc Co giãn và đánh giá nhu cầu bổ sung cơ chế chống câu giờ. |
| **Giai đoạn 3: Loadout & PvP**<br>*(Hoàn thiện bản chơi thử)* | • Màn hình tự lắp ráp Cấu hình trước trận (Preset Editor).<br>• Kết nối đối kháng **1v1 Multiplayer** (Godot High-level Multiplayer / ENet hoặc WebRTC).<br>• Hoàn thiện đồ họa Neon nền trung tính & âm thanh va chạm. | Đấu thực tế giữa 2 người chơi để cân bằng sâu các thông số đánh đổi (xoay trục, thời gian hồi mảnh vỡ, HP nhân vật). |
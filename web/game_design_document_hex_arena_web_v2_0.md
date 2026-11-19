# GAME DESIGN DOCUMENT (GDD) — HEX ARENA (NHÁNH WEB)

* **Tên dự án:** Hex Arena
* **Nhánh phát triển:** Web Mobile-First (Trình duyệt di động nằm ngang & PWA, có hỗ trợ Desktop)
* **Thể loại:** Đối kháng Đấu trường (1v1 Arena Fighting) kết hợp Vật lý & Lắp ráp mô-đun Lục giác
* **Công nghệ nền tảng:** HTML5 Canvas 2D (tùy chọn nâng cấp WebGL / Three.js), JavaScript / TypeScript, Pointer Events API, Web Audio API, PWA & WebSockets
* **Phiên bản tài liệu:** 2.0 — Web Edition (Trọn bộ Chương 1 – Chương 9)

---

## CHƯƠNG 1: TỔNG QUAN & KHÔNG GIAN CHIẾN ĐẤU

* **Góc nhìn & Không gian:** **2.5D Top-Down Mobile Arena** (góc nhìn từ trên xuống giả lập chiều sâu 2.5D bằng đổ bóng, độ nâng vật thể và phân lớp độ cao).
  * *Mục tiêu thiết kế:* Tối ưu hóa tầm nhìn bao quát $360^\circ$ trên màn hình điện thoại nằm ngang, đảm bảo khả năng đọc thông tin tức thì (readability) khi tối đa 20 mảnh lục giác cùng xoay, co giãn và tái hợp nhất trên sân.
* **Ý tưởng cốt lõi (Core Concept):**
  * Người chơi điều khiển một tập hợp các mảnh lục giác mang thông số **vật lý thuần túy**.
  * Chuyển đổi tức thời giữa **Trạng thái Đơn lẻ** (cơ động, tự xoay quanh trục, chia góc đánh úp) và **Trạng thái Ghép** (khóa khớp cứng thành vũ khí như Giáo, Kiếm, Khiên theo cấu hình lắp sẵn trước trận).
  * Kết hợp cơ chế **Co giãn kích thước độc lập** theo công thức lũy thừa cân bằng và cơ chế **Vỡ mảnh – Tự động tái hợp nhất**, tạo ra nhịp đấu khắc chế chiến thuật sâu sắc mà không cần phụ thuộc vào hệ thống kỹ năng phép thuật phức tạp.
* **Lợi thế của nhánh Web:** Người chơi truy cập và đối kháng ngay qua đường dẫn (không cần tải qua kho ứng dụng), dễ dàng thử nghiệm đa thiết bị (Android, iOS, PC), cập nhật cân bằng tức thì và có thể cài đặt như ứng dụng gốc thông qua **PWA (Progressive Web App)**.

---

## CHƯƠNG 2: HỆ THỐNG MẢNH, TRẠNG THÁI & CƠ CHẾ VA CHẠM

### 2.1. Tài nguyên Mảnh & Lắp ráp trước trận
* Mỗi người chơi sở hữu cố định từ **5 đến 10 mảnh lục giác** trong một trận đấu (mốc thử nghiệm chuẩn: **7 mảnh**).
* **Trước trận đấu (Pre-match Loadout):** Người chơi tự do sắp xếp vị trí từng mảnh trên lưới lục giác và lưu sẵn các **Cấu hình vũ khí (Presets)** (Giáo, Kiếm, Khiên...) kèm kích thước co giãn mặc định (*Smart Default*) cho từng cấu hình.

### 2.2. Hai Trạng thái Chiến đấu trong trận
1. **Trạng thái Đơn lẻ (Loose / Swarm):**
   * Các mảnh tách rời, bay quỹ đạo quanh nhân vật hoặc phóng rải độc lập trên sân.
   * Là trạng thái **duy nhất** được kích hoạt **cơ chế tự xoay quanh trục**, tối ưu khả năng cắt/đâm xuyên, độ cơ động và chiến thuật kéo gọng kìm.
2. **Trạng thái Ghép (Assembled):**
   * Các mảnh hút khớp cạnh cứng vào nhau theo đúng Cấu hình đã thiết lập trước trận.
   * **Không thể tự xoay từng mảnh quanh trục riêng**; thay vào đó tối ưu hóa tầm vươn, góc che chắn và lực va chạm tổng thể của cả khối vũ khí.

### 2.3. Cơ chế Va chạm — Vòng tròn Hitbox ở chân (Directional Arc)
* **Hitbox nhân vật:** Mỗi nhân vật (hiển thị dạng khối cầu phát sáng ở bản thử nghiệm) sở hữu một **vòng tròn Hitbox cố định nằm sát mặt sàn dưới chân** để tính trúng/trượt đòn tuyệt đối chính xác, triệt tiêu lỗi lệch tầm nhìn của góc 2.5D.
* **Phòng thủ theo góc phương vị ($360^\circ$):**
  * Khiên lục giác tạo thành vòng cung bảo vệ ôm quanh vòng tròn Hitbox chân.
  * **Khiên phóng to:** Mở rộng góc che phủ để chặn kỹ năng diện rộng (AoE) hoặc đạn chùm, nhưng độ cứng giảm mạnh (dễ vỡ khi gặp đòn xuyên giáp thu nhỏ).
  * **Khiên thu nhỏ:** Nén chặt độ cứng để đỡ đòn hạng nặng/xuyên giáp, nhưng góc che phủ thu hẹp — đòi hỏi căn góc chuẩn xác; nếu lệch góc sẽ bị đánh lách sườn trực tiếp vào vòng tròn chân.
* **Độ chính xác tấn công (Skillshot Accuracy):**
  * Vũ khí **thu nhỏ** làm hẹp bề rộng vùng va chạm của Chỉ báo kỹ năng, yêu cầu ngắm chuẩn vào vòng tròn chân đối thủ để đổi lấy sát thương tập trung và độ xuyên giáp cao.

---

## CHƯƠNG 3: HỆ THỐNG ĐIỀU KHIỂN (MOBILE 4-FINGER MULTI-TOUCH HUD)

### 3.1. Bố cục tiêu chuẩn 4 ngón (Claw Layout)
Giao diện Web sử dụng **Pointer Events API** đa điểm chạm độc lập (hỗ trợ $4+$ ngón đồng thời với `touch-action: none` và `setPointerCapture`), phân tải cân đối giữa hai tay:

| Ngón tay | Vị trí màn hình | Chức năng chính | Phạm vi áp dụng |
| :--- | :--- | :--- | :--- |
| **Ngón cái trái** | Góc dưới trái | Joystick ảo di chuyển nhân vật $360^\circ$. | Mọi trạng thái |
| **Ngón trỏ trái** | Góc trên trái | Cụm **3 chế độ Xoay trục** (*Tĩnh / Pháp tuyến / Ngẫu nhiên*). | Chỉ trạng thái **Đơn lẻ** *(tự mờ/khóa khi Ghép)* |
| **Ngón cái phải** | Góc dưới phải | • Nút kéo **Tấn công / Chỉ báo kỹ năng**.<br>• Nút **Đổi dạng** (vị trí Bổ trợ: giữ & vuốt lên chọn dạng, *Đơn lẻ* xếp đầu).<br>• **Vòng cung chọn mảnh** + nút phụ (chỉ hiện ở dạng Đơn lẻ). | Mọi trạng thái *(Vòng cung tự ẩn khi Ghép)* |
| **Ngón trỏ phải** | Góc trên phải | Cụm **Co giãn 3 nấc** (*60% Nhỏ / 100% Chuẩn / 150% To*), tách bạch hoàn toàn với kỹ năng. | Cả **Đơn lẻ** & **Ghép** |

### 3.2. Tối ưu trải nghiệm Co giãn độc lập (UX)
* **3 nấc cố định:** Giúp thao tác bấm chạm mất dưới $0.1\text{s}$ trên màn hình cảm ứng, dễ tạo trí nhớ cơ bắp và dễ đọc trạng thái vũ khí địch.
* **Tự động ghi nhớ kích thước theo Cấu hình (Smart Default):** Ví dụ vuốt sang *Giáo* tự nhảy về **60% Nhỏ**, sang *Khiên* tự nhảy về **150% To**, sang *Kiếm* về **100% Chuẩn**. Người chơi chỉ bấm ngón trỏ phải khi muốn lật kèo chiến thuật tức thời.
* **Phản hồi trực tiếp trên Chỉ báo kỹ năng:** Khi ngón cái phải đang giữ ngắm mà ngón trỏ phải bấm đổi nấc Co giãn, vùng mờ Chỉ báo kỹ năng trên sân lập tức phình to hoặc thu hẹp và đổi sắc độ màu theo thời gian thực.

### 3.3. Điều khiển Trạng thái Đơn lẻ (Vòng cung Chọn mảnh & Chế độ Phóng)
* **Vòng cung chọn mảnh (Arc-Selector):**
  * Bao quanh phía trên-trái nút Tấn công dưới dạng **các đốt liền mạch** (không có khe hở chết), hỗ trợ cả **chạm bật/tắt** và **lia ngón tay (Paint-to-Select)** để chọn/hủy chọn nhiều mảnh trong một đường vuốt.
  * **Liên kết thị giác (Visual Ping):** Chạm hoặc lia qua đốt số nào thì mảnh tương ứng ngoài đấu trường lập tức phát sáng viền trắng và kẻ tia dẫn nét đứt nối về nhân vật. Màu sắc trên đốt phân biệt rõ trạng thái: *xanh lam* (đang quay quanh thân), *vàng hổ phách* (đang cắm trên sân chờ thu hồi), *đỏ kèm thanh đếm ngược* (đang vỡ chờ hồi).
* **Thanh chọn 3 Chế độ Phóng:** Chuyển nhanh giữa **Phóng kiểu Xayah** (cắm lơ lửng trên sàn chờ thu), **Phóng lần lượt** (xả liên thanh các mảnh đã chọn), và **Phóng đồng loạt** (bắn chùm hình quạt hẹp), giải phóng hoàn toàn nút Tấn công để chuyên định hướng.
* **Nút Thu hồi thông minh (Smart Recall):** Nếu người chơi đang chọn các mảnh cắm trên sân thì chỉ thu hồi đúng nhóm mảnh đó; nếu không chọn mảnh cắm nào thì tự động thu hồi toàn bộ mảnh trên sân.

### 3.4. Điều khiển dự phòng trên Desktop & Tùy chỉnh HUD
* Hỗ trợ chơi thử trên máy tính qua bàn phím & chuột: `WASD` (di chuyển), `Q/E/R` (Co giãn 60%/100%/150%), `1/2/3` (3 chế độ Xoay), `F`/`Tab` (Đổi dạng), `Space`/Chuột phải (Thu hồi), kéo chuột trực tiếp trên sàn đấu để ngắm và tung đòn.
* Hỗ trợ **Tùy chỉnh bố cục HUD (Custom HUD)** ở giai đoạn sau để người chơi tự kéo vị trí/kích thước cụm nút theo cỡ màn hình điện thoại (và hỗ trợ lối chơi 2 ngón / 3 ngón).

---

## CHƯƠNG 4: CƠ CHẾ XOAY TRỤC (TRẠNG THÁI ĐƠN LẺ)

Cụm **ngón trỏ trái** cung cấp 3 chế độ xoay cho các mảnh độc lập (tự động khóa khi chuyển sang trạng thái Ghép):

| Chế độ xoay | Biểu hiện vật lý & thị giác | Vai trò chiến thuật chính | Hướng cân bằng / đánh đổi (tinh chỉnh qua playtest) |
| :--- | :--- | :--- | :--- |
| **1. Không xoay (Static)** | Giữ cố định góc mặt phẳng mảnh. | Quỹ đạo bay ổn định, dễ căn góc; **tốc độ ghép về Cấu hình nhanh nhất** (không tốn thời gian phanh quán tính xoay). | Sát thương chuẩn, dễ bị Khiên thu nhỏ chặn đứng. |
| **2. Xoay quanh trục pháp tuyến (Normal Spin)** | Xoay tốc độ cao quanh trục vuông góc mặt mảnh (kiểu lưỡi cưa/phi tiêu) kèm vòng sáng cắt. | Tăng mạnh **sát thương cắt & xuyên giáp** ($+35\%$), các mảnh cắm trên sân vẫn gây sát thương cưa khi địch chạm phải. | Tiêu hao năng lượng (Stamina) hoặc tăng nhẹ tốc độ mài mòn độ bền khi va vào Khiên siêu cứng. |
| **3. Xoay ngẫu nhiên (Random Tumble)** | Mảnh xoay lộn tự do theo nhiều trục không cố định (giả lập 3D co giãn trục trên Canvas 2D hoặc xoay Quaternion trên WebGL). | **Gây nhiễu & Đánh nảy:** Mảnh chạm trụ vật cản hoặc tường đấu trường sẽ **nảy bật (ricochet)** đổi hướng bất ngờ; có tỷ lệ ($25\%$) **làm lệch hướng (Deflect)** đòn va chạm từ mảnh địch. | Quỹ đạo khó đoán khi phản hồi, sát thương dao động tùy góc tiếp xúc. |

---

## CHƯƠNG 5: THÔNG SỐ MẢNH LỤC GIÁC & KẾT CẤU LẮP RÁP

### 5.1. Nguyên tắc Mảnh Base & Ngân sách điểm (Stat Budget)
* Định hướng **thuần vật lý** (không có nguyên tố/phép thuật ở các phiên bản cốt lõi).
* Mọi loại mảnh đều lấy mốc từ **Mảnh Base** và chia sẻ cùng tổng ngân sách **400 điểm** để đảm bảo tính đánh đổi công bằng:

| Loại mảnh | Độ bền (Durability) | Độ cứng (Hardness) | Độ sắc (Sharpness) | Độ cơ động (Agility) | Vai trò tối ưu |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Mảnh Base** *(Chuẩn)* | **100** | **100** | **100** | **100** | Đa dụng, ổn định ở thân vũ khí và đánh đơn lẻ. |
| **Mảnh Nặng** *(Giáp/Trụ)* | **130** | **130** | **80** | **60** | Làm mảnh Gốc neo (Root), mặt khiên chịu lực, tăng lực đẩy lùi. |
| **Mảnh Sắc** *(Tinh thể)* | **70** | **70** | **150** | **110** | Đặt ở mũi Giáo / lưỡi Kiếm hoặc xả Xoay pháp tuyến; rất dễ vỡ nếu bị đỡ cứng. |
| **Mảnh Nhẹ** *(Linh hoạt)* | **85** | **85** | **90** | **140** | Bay nhanh, kéo gọng kìm Xayah khó né, ghép đội hình gọn. |

### 5.2. Quy tắc Hình học Lục giác & Khóa cạnh Đồng bộ khi Co giãn
1. **Hệ tọa độ trục lục giác $(q, r)$ & Khóa cạnh theo tỷ lệ $S$:**
   * Các mảnh ở trạng thái Ghép được neo trên lưới lục giác đỉnh nhọn (*pointy-top*). Với bán kính hiện tại $R = R_{\text{gốc}} \times S$, tọa độ cục bộ của mỗi mảnh được tính chính xác theo công thức:
     $$x_{\text{local}} = R \cdot \sqrt{3} \cdot \left(q + \frac{r}{2}\right), \quad y_{\text{local}} = R \cdot 1.5 \cdot r$$
   * Nhờ liên kết theo $R$, khi người chơi chuyển đổi Co giãn ($60\% \leftrightarrow 100\% \leftrightarrow 150\%$), khoảng cách tâm giữa hai mảnh kề nhau luôn giữ đúng bằng $\sqrt{3} \cdot R$ — toàn bộ khối vũ khí co giãn đồng bộ mượt mà, **khớp chặt cạnh không bao giờ bị hở khe hay chồng đè**.
2. **Phân vai theo Vị trí tiếp xúc (Positional Weighting):**
   * Mảnh đặt ở **Mũi / Rìa chém (Tip)** nhận trọng số sát thương/xuyên giáp cao nhất ($+35\%$); mảnh ở **Trục thân (Spine)** truyền lực đẩy và giữ ổn định; mảnh ở **Mặt ngoài Khiên (Front)** hứng sát thương trực tiếp trước.
3. **Hệ số Liên kết cạnh (Adjacency Synergy):**
   * Mỗi cạnh lục giác tiếp xúc với một mảnh đồng đội nguyên vẹn cộng thêm **$+10\%$ Độ cứng liên kết** cho mảnh đó. Xếp dạng hàng dài (Giáo) tầm xa nhưng ít cạnh nối nên dễ bị chặt gãy; xếp dạng tổ ong (Khiên) mảnh lõi nối $4\text{--}6$ cạnh nên cực kỳ kiên cố.

### 5.3. Vòng đời Vỡ mảnh, Tái hợp nhất (BFS) & Hồi phục
* **Vỡ mảnh:** Khi Độ bền mảnh về $0$, mảnh vỡ tạm thời thành hiệu ứng mảnh vụn và bước vào thời gian hồi (mặc định $5.0\text{s}$).
* **Tự động Tái hợp nhất (Magnetic Re-assembly):**
  * Ngay khi một mảnh trong khối Ghép bị vỡ, hệ thống chạy thuật toán duyệt đồ thị **BFS** bắt đầu từ **Mảnh Gốc neo (Root/Anchor)** gắn với nhân vật.
  * Mọi mảnh bị đứt kết nối (cô lập khỏi Khối chính) sẽ tự động tìm **ô lục giác trống liền kề gần nhất** trên Khối chính (ưu tiên ô có nhiều cạnh tiếp xúc nhất) và trượt hút khớp cạnh trong khoảng $0.3\text{s}$ (tạo một khoảnh khắc mở nhỏ để đối thủ tranh thủ phản công).
* **Hồi phục từng phần & Hồi phục hoàn toàn:**
  * Khi từng mảnh hết thời gian hồi trong lúc đang ở trạng thái Ghép, mảnh đó tự động tái xuất hiện và chèn vào ô trống liền kề trên khối hiện tại (vũ khí dài/rộng ra lại ngay giữa trận).
  * Ngay khi **toàn bộ mảnh đều hồi đủ**, khối vũ khí tự động biến đổi (morph) trở về đúng **Cấu hình ghép ban đầu** (nếu đang giữa nhịp vung đòn, hệ thống tự hoãn $0.1\text{s}\text{--}0.2\text{s}$ cho đến khi kết thúc đòn đánh để không làm lệch hướng ngắm).

---

## CHƯƠNG 6: HỆ SỐ TỔNG HỢP CÂN BẰNG CO GIÃN (THEO PHẦN TRĂM $S$)

Toàn bộ cơ chế Co giãn được chuẩn hóa bằng **biến kích thước $S$** theo công thức hàm lũy thừa để hiện tại chạy mượt trên 3 nấc cố định và sau này có thể mở rộng sang thu phóng theo từng phần trăm lẻ mà không phải viết lại công thức cân bằng:

$$S = \frac{\text{Tỷ lệ thu phóng (\%)}}{100}, \qquad \text{Chỉ số hiệu dụng} = \text{Chỉ số gốc} \times S^{k}$$

*(Trong đó $k$ là Hệ số nhạy của từng chỉ số, dễ dàng tinh chỉnh trong quá trình playtest).*

| Thông số chịu tác động | Công thức theo $S$ | Hệ số nhạy ($k$) | Mốc Thu nhỏ ($60\%$) | Mốc Chuẩn ($100\%$) | Mốc Phóng to ($150\%$) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Bán kính / Vùng trúng đòn / Góc khiên** | $A_{\text{gốc}} \times S^{1.0}$ | $+1.0$ | **60%** | **100%** | **150%** |
| **Độ cứng (Giảm sát thương nhận vào)** | $H_{\text{gốc}} \times S^{-1.5}$ | $-1.5$ | **215%** | **100%** | **54%** |
| **Sát thương tập trung / Xuyên giáp** | $D_{\text{gốc}} \times S^{-1.0}$ | $-1.0$ | **167%** | **100%** | **67%** |
| **Tốc độ bay / Vung vũ khí** | $V_{\text{gốc}} \times S^{-0.5}$ | $-0.5$ | **129%** | **100%** | **82%** |
| **Độ bền tối đa (HP gốc của mảnh)** | $HP_{\text{gốc}} \times S^{0}$ | $0$ | **100%** | **100%** | **100%** |

* **Lưu ý chống lỗi khai thác:** Giữ nguyên $HP_{\text{gốc}}$ ($k = 0$) và chỉ thay đổi **Độ cứng** theo $S^{-1.5}$ giúp triệt tiêu hoàn toàn lỗi người chơi bấm phóng to – thu nhỏ liên tục để "hồi máu mảnh".
* **Cộng hưởng với Độ cơ động ($V_{\text{gốc}}$):** Mảnh Nặng ($60$ cơ động) phóng to $150\%$ tạo cảm giác cực đầm nặng ($49\%$ tốc độ chuẩn); Mảnh Sắc ($110$ cơ động) thu nhỏ $60\%$ đạt tốc độ vọt tới $142\%$ tốc độ chuẩn nhưng đòi hỏi ngắm cực kỳ chính xác.

---

## CHƯƠNG 7: CẤU TRÚC TRẬN ĐẤU & ĐẤU TRƯỜNG

* **Chế độ chơi cốt lõi:** **1v1** đối kháng trực tiếp (tối đa 20 mảnh trên sân, tối ưu khả năng quan sát và hiệu năng trình duyệt di động).
* **Thể thức & Thời lượng:** **1 hiệp duy nhất**, đếm ngược **10 phút** *(nếu hết giờ mà chưa có hạ gục, phân định thắng thua theo tỷ lệ HP còn lại hoặc Hòa)*.
* **Điều kiện thắng:** Đánh cạn thanh **HP** của đối thủ (HP nhân vật độc lập với Độ bền mảnh; mặc định $1000\text{ HP}$).
* **Cơ chế chống câu giờ (Anti-Stall):** Chưa áp dụng cứng ở giai đoạn đầu; sẽ đo lường nhịp trận thực tế từ dữ liệu playtest PvP rồi đánh giá bổ sung sau (ví dụ vòng bo thu hẹp hoặc vùng tăng tốc hồi mảnh ở tâm sân).
* **Thiết kế Đấu trường:** **Hình lục giác lớn**, không gian mở có bố trí **4 trụ vật cản lục giác đối xứng** để tối ưu tầm vươn của Giáo, kỹ năng căn góc và đánh nảy.
* **Quy tắc tương tác với Vật cản:**
  * Nhân vật và các mảnh đang bay **phóng đi** bị vật cản chặn lại (riêng khi đang bật chế độ **Xoay ngẫu nhiên**, mảnh chạm vật cản hoặc tường đấu trường sẽ **nảy bật** đổi hướng).
  * Mảnh ở trạng thái **Thu hồi** về nhân vật tự động chuyển sang quỹ đạo **bay cao (High-Flight)** lướt xuyên qua phía trên vật cản kèm bóng đổ sâu hơn, đảm bảo không bao giờ bị kẹt mảnh sau tường làm hỏng combo kiểu Xayah.

---

## CHƯƠNG 8: PHONG CÁCH THỊ GIÁC (READABILITY) & CẢM GIÁC ĐÁNH (GAME FEEL)

* **Phong cách Đồ họa:** **Hình học Neon Tối giản (Minimalist Geometric Neon)** trên **nền trung tính không quá tối** (*Mid-tone Matte Slate*, tông màu sàn `#252c3a` và viền ngoài `#1c222e`).
  * *Hiệu quả thị giác:* Giảm mỏi mắt khi chơi lâu trên điện thoại, làm nổi rõ bóng đổ 2.5D của vật cản và mảnh bay cao, đồng thời giữ độ tương phản sắc nét cho đường viền Neon của mảnh lục giác.
* **Ngôn ngữ Thị giác (Visual Coding) — Đọc tình huống trong $0.2\text{s}$:**
  * **Màu sắc = Phe:** Toàn bộ dải màu dành riêng cho nhận diện phe (*Phe ta = Xanh lam Neon `#38bdf8`*, *Phe địch = Đỏ san hô `#fb7185`*, *Trạng thái cắm sân / Xuyên phá = Vàng hổ phách `#fbbf24`*).
  * **Độ dày viền & Hoa văn lõi = Chất liệu mảnh:** Mảnh Nặng (viền dày + lõi lục giác đặc), Mảnh Sắc (lõi sao nhọn phát sáng), Mảnh Nhẹ (viền mảnh + vòng tròn rỗng), Mảnh Base (viền đều + chấm tâm).
  * **Đường hàn liên kết (Edge-Weld Glow):** Các cạnh đang khóa khớp trong trạng thái Ghép phát sáng đường hàn nối liền mạch.
  * **Báo hiệu sắp vỡ:** Khi Độ bền mảnh xuống **dưới $30\%$**, bề mặt hiện vết nứt phát sáng nhấp nháy để cả hai người chơi đọc được điểm yếu kết cấu.
* **Cảm giác đánh (Game Feel) trên Web Mobile:**
  * **Hit-stop:** Khựng khung hình vi mô $0.03\text{s}\text{--}0.05\text{s}$ tại thời điểm đòn **Thu nhỏ ($60\%$)** đâm xuyên thành công hoặc khi **phá vỡ mảnh** của đối thủ.
  * **Phản hồi xúc giác & âm thanh:** Rung điện thoại qua **Web Vibration API** (`navigator.vibrate`), rung màn hình nhẹ (Screen Shake), tia lửa/mảnh vỡ vật lý và hiệu ứng âm thanh tổng hợp trực tiếp không độ trễ bằng **Web Audio API**.

---

## CHƯƠNG 9: KIẾN TRÚC KỸ THUẬT & LỘ TRÌNH PHÁT TRIỂN NHÁNH WEB

### 9.1. Kiến trúc Công nghệ Web (Web Tech Stack)
Để đạt $60\text{ FPS}$ ổn định trên điện thoại tầm trung và dễ dàng mở rộng sang đối kháng trực tuyến (PvP), nhánh Web được tổ chức theo hướng **Tách bạch Mô phỏng (Headless Logic) và Hiển thị (Renderer)**:

| Tầng hệ thống | Công nghệ đề xuất | Mục tiêu kỹ thuật |
| :--- | :--- | :--- |
| **Lõi Vật lý & Luật chơi** (`core/`) | TypeScript / ES Modules thuần *(không phụ thuộc DOM/Canvas)* | Dùng chung 100% mã nguồn logic (tọa độ lục giác $(q,r)$, BFS tái hợp nhất, va chạm, công thức $S^k$) giữa trình duyệt Client và Server PvP sau này. |
| **Đồ họa & Kết xuất** (`render/`) | **Giai đoạn 1–3:** HTML5 Canvas 2D HiDPI (`devicePixelRatio` giới hạn tối đa `2.0`).<br>**Tùy chọn nâng cấp:** PixiJS (WebGL 2D) hoặc Three.js (WebGL 3D thật với shader Neon Bloom). | Nhẹ, khởi chạy dưới $1\text{s}$, kiểm soát tốt nhiệt độ pin di động; tách lớp kết xuất để dễ chuyển sang WebGL nếu cần chiều sâu 3D thật. |
| **Điều khiển & Trải nghiệm Di động** (`input/`) | Pointer Events API + Fullscreen API + Screen Orientation API (`landscape`) | Hỗ trợ 4+ ngón đồng thời không xung đột, chặn thao tác phóng to/cuộn trang mặc định của trình duyệt, xử lý tốt thanh địa chỉ trên iOS Safari & Chrome Android. |
| **Âm thanh & Rung** (`feedback/`) | Web Audio API (Procedural Synth + bộ âm thanh ngắn nén `.ogg/.mp3`) + Vibration API | Khởi tạo AudioContext ngay ở cú chạm đầu tiên để vượt chính sách chặn tự phát âm thanh trên mobile. |
| **Đóng gói & Phân phối** | Vite + **PWA** (`manifest.json` + Service Worker) | Cho phép người chơi "Thêm vào màn hình chính" để chạy toàn màn hình không thanh URL và hỗ trợ chơi với Bot ngay cả khi offline. |
| **Mạng PvP Trực tuyến** *(Giai đoạn 4)* | Node.js / Bun Authoritative Server + WebSockets (hoặc WebRTC DataChannel qua Geckos.io) | Đồng bộ trạng thái ở tần số $20\text{--}30\text{ Hz}$ (tick rate) kèm nội suy (interpolation) phía client để xử lý độ trễ mạng di động 4G/5G. |

---

### 9.2. Lộ trình Phát triển Nhánh Web (4 Giai đoạn)

#### Giai đoạn 1: Core Web Prototype — Bản chơi thử 1 File *(Đã hoàn thiện nền tảng: `hex_arena.html`)*
* **Phạm vi:**
  * Đấu trường lục giác 2.5D nền trung tính, 4 trụ vật cản, nhân vật khối cầu kèm Vòng tròn Hitbox chân.
  * Đủ 4 chất liệu mảnh, hệ thống khóa cạnh đồng bộ khi co giãn 3 nấc ($60\%/100\%/150\%$), 3 chế độ Xoay trục, Vòng cung lia tay 1–7 + 3 chế độ phóng + Thu hồi bay cao.
  * Vỡ mảnh, tự động tái hợp nhất BFS, tự hồi phục nguyên trạng và Bot AI 1v1 cơ bản.
  * Chế độ Toàn màn hình & điều khiển 4 ngón trên mobile + phím tắt Desktop.
* **Mục tiêu kiểm chứng (Playtest nội bộ):**
  * Test trực tiếp trên điện thoại thực tế (Android & iOS) để đánh giá cảm giác bấm 4 ngón, độ nhạy lia tay trên Vòng cung và độ dễ đọc khi 14 mảnh giao tranh cùng lúc.
  * Tinh chỉnh hệ số nhạy tốc độ ($k_V = -0.5$), khoảng cách neo vũ khí và thời gian hồi mảnh ($5\text{s}$).

#### Giai đoạn 2: Tái cấu trúc Mô-đun & Trình Lắp ráp Cấu hình (Modular Core & Preset Editor)
* **Phạm vi:**
  * Tách mã nguồn từ 1 file đơn sang dự án mô-đun (Vite + TypeScript/JS) với kiến trúc tách biệt `core/` (vật lý bước thời gian cố định — *fixed timestep 60Hz*), `ai/`, `render/` và `ui/`.
  * Xây dựng **Màn hình Lắp ráp trước trận (Hex Loadout & Preset Editor):** Cho phép người chơi chọn số lượng 5–10 mảnh, chọn chất liệu từng mảnh, kéo thả tự do lên lưới lục giác $(q, r)$ để tự tạo cấu hình vũ khí riêng, chọn **Mảnh Gốc neo (Root)**, gán kích thước **Smart Default** và lưu vào `localStorage`.
  * Bổ sung **Trình tùy chỉnh HUD (Custom HUD Editor):** Kéo thả vị trí, chỉnh cỡ nút và độ trong suốt cho người chơi 2 ngón / 3 ngón / 4 ngón.
* **Mục tiêu kiểm chứng:** Kiểm tra độ sâu chiến thuật khi người chơi tự chế vũ khí dị (ví dụ: Giáo 2 mũi, Khiên tổ ong siêu dày, bộ 10 mảnh nhẹ chuyên đánh Xayah) và đảm bảo thuật toán BFS không gặp lỗi biên với mọi hình dạng tự vẽ.

#### Giai đoạn 3: Tối ưu Di động (PWA), Đồ họa & Cảm giác đánh (Polish & Performance)
* **Phạm vi:**
  * Đóng gói **PWA** hoàn chỉnh (biểu tượng ứng dụng, màn hình chờ, chế độ hiển thị `fullscreen` / `standalone`, lưu cache offline để chơi với Bot mọi lúc).
  * Nâng cấp hiệu ứng thị giác & âm thanh: vệt chém mịn hơn, hiệu ứng ánh sáng xung kích khi các cạnh khóa khớp, nâng cấp Bot AI biết đọc bài (né đòn thu nhỏ, chủ động phá mảnh giữa thân giáo).
  * **Đánh giá nhánh nâng cấp WebGL (Tùy chọn):** Nếu cần độ sâu 3D thật (xoay trục 3D tự nhiên cho chế độ Xoay ngẫu nhiên và ánh sáng Neon Bloom), triển khai tầng `render-threejs/` thay thế `render-canvas2d/` mà giữ nguyên 100% tầng `core/`.
  * Tối ưu hiệu năng: Object Pooling cho hạt hiệu ứng (particles/sparks) để triệt tiêu khựng rác bộ nhớ (GC stutter) trên trình duyệt di động.
* **Mục tiêu kiểm chứng:** Đạt mượt ổn định $60\text{ FPS}$ liên tục trong 10 phút đấu trên thiết bị di động tầm trung, không tụt khung hình khi 20 mảnh nổ vỡ liên tiếp.

#### Giai đoạn 4: Đối kháng Trực tuyến 1v1 (Online PvP & Balancing)
* **Phạm vi:**
  * Triển khai máy chủ phòng đấu nhẹ (**Room Code 1v1** — tạo phòng gửi link mời bạn bè vào đánh ngay trên trình duyệt, sau đó mở rộng sang Ghép trận tự động).
  * Chạy tầng `core/` ở phía Server (Authoritative Physics) để chống gian lận thông số mảnh và đồng bộ chính xác kết quả va chạm / vỡ mảnh.
  * Áp dụng Client-side Prediction cho chuyển động nhân vật & dự đoán tung đòn, kết hợp Entity Interpolation mượt mà cho 10 mảnh của đối thủ.
  * Thu thập dữ liệu trận đấu thực tế (Telemetry): thời lượng trung bình mỗi trận, tỷ lệ thắng của từng cấu hình/chất liệu để cân bằng lại ngân sách điểm, hệ số $k$, cơ chế đánh đổi năng lượng xoay và quyết định có bổ sung **cơ chế chống câu giờ (Anti-Stall)** hay không.

---

### 9.3. Các lưu ý kỹ thuật đặc thù cho Web Mobile
1. **Khắc phục khác biệt iOS Safari vs. Android Chrome:** iOS Safari không hỗ trợ chuẩn `requestFullscreen()` trên mọi phần tử như Android; cần kết hợp hướng dẫn "Thêm vào màn hình chính (PWA)" và sử dụng đơn vị `100dvh` / `env(safe-area-inset-*)` để cụm nút 4 ngón không bị tai thỏ (notch) hoặc thanh gạt dưới che mất.
2. **Bảo vệ vòng lặp vật lý (Fixed Timestep):** Luôn tách nhịp cập nhật vật lý cố định ($\Delta t = \frac{1}{60}\text{s}$) khỏi tốc độ làm tươi màn hình ($60\text{Hz} / 90\text{Hz} / 120\text{Hz}$ trên điện thoại đời mới) để tốc độ phóng mảnh và quỹ đạo tái hợp nhất đồng nhất tuyệt đối giữa mọi thiết bị.
3. **Tối ưu đa điểm chạm khi có thông báo hệ thống:** Xử lý đầy đủ sự kiện `pointercancel`, `blur` và `visibilitychange` để tự động nhả kẹt Joystick/Chỉ báo kỹ năng nếu người chơi lỡ vuốt thanh thông báo điện thoại giữa trận.
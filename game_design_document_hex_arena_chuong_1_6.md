# GAME DESIGN DOCUMENT (GDD) — DỰ ÁN GAME ĐỐI KHÁNG LỤC GIÁC
**Phiên bản tài liệu:** 1.0 (Tổng hợp Chương 1 – Chương 6)  
**Trạng thái:** Đang hoàn thiện (Sẵn sàng mở rộng sang Chương 7: Cấu trúc Trận đấu)

---

## CHƯƠNG 1: TỔNG QUAN & KHÔNG GIAN CHIẾN ĐẤU

* **Thể loại:** Game đối kháng đấu trường (Arena Fighting) kết hợp vật lý động lực học và lắp ráp mô-đun lục giác.
* **Nền tảng:** Di động (Mobile — màn hình cảm ứng nằm ngang).
* **Góc nhìn & Không gian:** **2.5D Top-Down Mobile Arena** (góc nhìn từ trên xuống có chiều sâu vật thể và đổ bóng).
  * *Lý do lựa chọn:* Tối ưu hóa tầm nhìn bao quát $360^\circ$ trên màn hình nhỏ, đảm bảo độ rõ ràng (readability) khi nhiều mảnh lục giác chuyển động, xoay trục và co giãn cùng lúc mà không che khuất đối thủ.
* **Ý tưởng cốt lõi (Core Concept):**
  * Người chơi điều khiển tập hợp các mảnh lục giác mang thông số vật lý riêng biệt.
  * Linh hoạt chuyển đổi giữa **trạng thái Đơn lẻ** (cơ động, tự xoay trục) và **trạng thái Ghép** (tạo vũ khí như Giáo, Khiên theo cấu hình lắp sẵn trước trận).
  * Kết hợp cơ chế **Co giãn kích thước** đi kèm hệ số cân bằng tổng hợp để tạo ra lối chơi khắc chế chiến thuật sâu sắc.

---

## CHƯƠNG 2: HỆ THỐNG MẢNH, TRẠNG THÁI & CƠ CHẾ VA CHẠM

### 2.1. Tài nguyên Mảnh & Lắp ráp trước trận
* Mỗi người chơi sở hữu cố định từ **5 đến 10 mảnh lục giác** trong trận.
* **Trước trận đấu (Pre-match Loadout):** Người chơi tự do sắp xếp và lưu sẵn các **Cấu hình vũ khí (Presets)** (ví dụ: Giáo, Khiên, Kiếm...) từ số mảnh đang có.

### 2.2. Hai Trạng thái Chiến đấu trong trận
1. **Trạng thái Đơn lẻ (Loose / Swarm):**
   * Các mảnh tách rời và hoạt động độc lập.
   * Là trạng thái **duy nhất** được kích hoạt **cơ chế tự xoay quanh trục** nhằm tối ưu sát thương cắt/đâm xuyên, độ cơ động và khả năng chia góc ép đối thủ.
2. **Trạng thái Ghép (Assembled):**
   * Các mảnh hút lại và khóa khớp cứng vào nhau theo đúng Cấu hình đã cài đặt trước trận.
   * **Không thể tự xoay từng mảnh quanh trục riêng**; thay vào đó tối ưu hóa tầm đánh, diện tích che chắn và lực va chạm tổng thể của cả khối vũ khí.

### 2.3. Cơ chế Va chạm — Vòng tròn Hitbox ở chân (Directional Arc)
* **Hitbox nhân vật:** Mỗi nhân vật có một **vòng tròn Hitbox cố định dưới chân** trên mặt phẳng đấu trường để xác định trúng/trượt đòn chính xác (tránh hiện tượng trúng ảo do góc nhìn 2.5D).
* **Phòng thủ theo góc phương vị ($360^\circ$):**
  * Khiên lục giác tạo thành một vòng cung bảo vệ ôm quanh vòng tròn Hitbox ở chân.
  * **Khiên phóng to:** Mở rộng góc che phủ, chặn được các kỹ năng diện rộng (AoE) hoặc đạn chùm, nhưng độ kiên cố giảm mạnh (dễ vỡ nếu gặp đòn xuyên giáp).
  * **Khiên thu nhỏ:** Nén chặt độ kiên cố để đỡ các đòn hạng nặng/xuyên giáp, nhưng góc che phủ thu hẹp lại — đòi hỏi căn góc chuẩn xác, nếu lệch góc sẽ bị đánh lách sườn trực tiếp vào vòng tròn chân.
* **Độ chính xác tấn công (Skillshot Accuracy):**
  * Vũ khí **thu nhỏ** làm hẹp bề rộng vùng va chạm (Hitbox tấn công hẹp), yêu cầu người chơi nhắm chính xác vào vòng tròn chân đối thủ để đổi lấy sát thương tập trung và khả năng xuyên giáp cao.

---

## CHƯƠNG 3: HỆ THỐNG ĐIỀU KHIỂN (MOBILE 4-FINGER HUD)

### 3.1. Bố cục điều khiển tiêu chuẩn 4 ngón

| Ngón tay | Vị trí trên màn hình | Chức năng chính | Phạm vi áp dụng |
| :--- | :--- | :--- | :--- |
| **Ngón cái trái** | Góc dưới bên trái | Joystick di chuyển nhân vật $360^\circ$. | Mọi trạng thái |
| **Ngón cái phải** | Góc dưới bên phải | • Nút/Joystick Tấn công: kéo định hướng **Chỉ báo kỹ năng (Skill Indicator)** và tung đòn.<br>• **Nút Đổi dạng** (vị trí tương đương nút *Bổ trợ* trong Liên Quân Mobile).<br>• **Vòng cung chọn mảnh & Thanh chế độ phóng** (chỉ hiện ở trạng thái Đơn lẻ). | Mọi trạng thái |
| **Ngón trỏ phải** | Góc trên bên phải | Cụm **Co giãn 3 nấc** (Thu nhỏ / Chuẩn / Phóng to), tách bạch hoàn toàn khỏi thao tác kéo Chỉ báo kỹ năng. | Cả *Đơn lẻ* & *Ghép* |
| **Ngón trỏ trái** | Góc trên bên trái | Cụm **3 chế độ Xoay trục**. | Chỉ trạng thái *Đơn lẻ* |

* **Ghi chú UX chung:**
  * Hỗ trợ **Tùy chỉnh vị trí nút (Custom HUD)** cho người chơi tự sắp xếp theo thói quen cầm máy.
  * Khi chuyển sang trạng thái **Ghép**, cụm nút Xoay bên ngón trỏ trái tự động mờ/khóa để tránh bấm nhầm.
  * Thay đổi nấc Co giãn bằng ngón trỏ phải sẽ cập nhật **ngay lập tức** độ rộng và màu sắc của Chỉ báo kỹ năng đang kéo bằng ngón cái phải.

### 3.2. Thao tác Nút Đổi Trạng Thái & Cấu Hình
* **Vị trí:** Phía dưới bên phải, lệch trái so với nút Tấn công chính (tương đương vị trí nút *Bổ trợ* trong Liên Quân Mobile).
* **Thao tác giữ & vuốt lên:** Nhấn giữ để mở danh sách các cấu hình đã lắp sẵn; **Trạng thái Đơn lẻ** luôn nằm ở vị trí đầu tiên (gần ngón cái nhất). Người chơi chỉ cần **vuốt lên** tới mục mong muốn và thả tay để đổi trạng thái.
* **Tối ưu bổ sung:** Chạm nhanh (Quick Tap) để chuyển tức thời qua lại giữa cấu hình hiện tại và trạng thái Đơn lẻ khi cần thoát hiểm; danh sách có thể hơi cong theo quỹ đạo ngón cái.

### 3.3. Điều khiển chuyên biệt cho Trạng thái Đơn lẻ
Nhằm đảm bảo sự linh hoạt tối đa cho 5–10 mảnh độc lập mà vẫn giải phóng nút Tấn công chính để chuyên xử lý điều hướng:

* **Vòng cung Chọn mảnh (Arc-Selector):**
  * Thiết kế lớn hơn hẳn nút Tấn công và bao quanh cụm đánh chính, trải đều toàn bộ các mảnh hiện có dưới dạng **các đốt liền mạch** (không có khe hở chết).
  * **Chạm (Tap):** Bật/tắt chọn từng mảnh cụ thể.
  * **Lia tay (Swipe-to-Select):** Quét ngón cái dọc vòng cung để chọn hoặc hủy chọn nhiều mảnh liên tiếp trong một thao tác.
* **Thanh chọn 3 Chế độ Phóng:**
  1. **Phóng kiểu Xayah (Cắm & Thu):** Phóng mảnh tới vị trí chỉ định rồi cắm lơ lửng trên sân chờ lệnh thu hồi xuyên mục tiêu.
  2. **Phóng lần lượt:** Xả liên thanh từng mảnh một trong nhóm đang chọn theo hướng ngắm.
  3. **Phóng đồng loạt:** Tung cùng lúc toàn bộ các mảnh đang chọn theo hướng ngắm.
* **Nút phụ thông minh:**
  * **Nút Chọn tất cả:** Chọn nhanh toàn bộ các mảnh khả dụng.
  * **Nút Thu hồi thông minh:** Nếu đang chọn các mảnh cắm trên sân thì chỉ thu hồi đúng nhóm mảnh đã chọn; nếu không chọn mảnh cắm nào (hoặc chạm đúp) thì thu hồi toàn bộ mảnh đang rải trên sân.
* **Tối ưu UX đã chốt:**
  * **Liên kết thị giác (Visual Ping):** Khi chạm/lia tới đốt nào trên vòng cung, mảnh tương ứng ngoài đấu trường lập tức phát sáng viền mạnh kèm tia nối mờ về nhân vật. Màu sắc trên vòng cung phân tách rõ mảnh đang quay quanh thân và mảnh đang cắm trên sân chờ thu hồi.
  * **Ẩn/Hiện theo ngữ cảnh:** Toàn bộ Vòng cung chọn mảnh, nút phụ và Thanh chế độ phóng tự động ẩn gọn ngay khi chuyển sang trạng thái **Ghép**.

---

## CHƯƠNG 4: CƠ CHẾ XOAY TRỤC (TRẠNG THÁI ĐƠN LẺ)

Điều khiển qua cụm **3 nút bên ngón trỏ trái**, chỉ hoạt động khi ở trạng thái **Đơn lẻ**:

1. **Không xoay (Static):** Giữ cố định góc mặt phẳng mảnh; quỹ đạo bay ổn định, dễ căn góc và thuận tiện chuyển nhanh sang trạng thái Ghép.
2. **Xoay quanh trục pháp tuyến (Normal Spin):** Mảnh quay tốc độ cao quanh trục vuông góc mặt phẳng mảnh (kiểu phi tiêu/lưỡi cưa) $\rightarrow$ tăng mạnh sát thương cắt và khả năng đâm xuyên giáp.
3. **Xoay ngẫu nhiên (Chaotic Tumble):** Mảnh xoay tự do theo nhiều trục không cố định $\rightarrow$ tạo quỹ đạo va chạm, góc nảy khó đoán và khả năng làm lệch hướng đòn đánh đối thủ.

*(Ghi chú: Các cơ chế đánh đổi chi tiết như tiêu hao năng lượng, mài mòn độ bền hay độ lệch quỹ đạo sẽ được đánh dấu `[Tinh chỉnh sau]` trong giai đoạn cân bằng số liệu).*

---

## CHƯƠNG 5: HỆ THỐNG MẢNH LỤC GIÁC, KẾT CẤU & VÒNG ĐỜI VỠ MẢNH

### 5.1. Định hướng Thuần vật lý & Quy tắc Mảnh Base
* **Định hướng:** Thuần vật lý (chưa bổ sung hiệu ứng nguyên tố/phép thuật ở phiên bản nền tảng để tránh phình to độ phức tạp).
* **Cân bằng theo Ngân sách Điểm (Stat Budget):** Xây dựng **Mảnh Base** làm mốc chuẩn ($100$ điểm mỗi chỉ số, tổng ngân sách $400$ điểm). Các loại mảnh khác được tạo ra bằng cách tăng/giảm chỉ số xoay quanh mốc Base theo nguyên tắc đánh đổi để không mảnh nào mạnh toàn diện.

| Thông số gốc | Mảnh Base | Vai trò trong chiến đấu |
| :--- | :---: | :--- |
| **Độ bền (Durability)** | `100` | Lượng sát thương mảnh chịu được trước khi vỡ tạm thời. |
| **Độ cứng (Hardness)** | `100` | Khả năng giảm sát thương nhận vào khi đỡ đòn và chống mài mòn va chạm. |
| **Độ sắc (Sharpness)** | `100` | Sát thương gốc và hệ số đâm xuyên cạnh. |
| **Độ cơ động (Agility)** | `100` | Quyết định tốc độ bay/vung vũ khí (nghịch đảo với trọng lượng và lực đẩy lùi). |

* *Ví dụ biến thể cân bằng (Tổng 400 điểm):*
  * **Mảnh Nặng:** Độ bền `130` | Độ cứng `130` | Độ sắc `80` | Cơ động `60`
  * **Mảnh Sắc:** Độ bền `70` | Độ cứng `70` | Độ sắc `150` | Cơ động `110`
  * **Mảnh Nhẹ:** Độ bền `85` | Độ cứng `85` | Độ sắc `90` | Cơ động `140`

### 5.2. Quy tắc Ghép theo Vị trí & Kết cấu `[Cần nghiên cứu sâu thêm]`
* Sức mạnh vũ khí ghép không chỉ cộng gộp đơn thuần mà phụ thuộc vào **vị trí đặt mảnh** (Mũi/Rìa tiếp xúc quyết định sát thương xuyên, Trục thân quyết định độ ổn định, Mặt ngoài khiên chịu sát thương trước) và **Hệ số liên kết cạnh (Adjacency Synergy)** (mảnh tiếp xúc càng nhiều cạnh với đồng đội thì độ cứng liên kết càng cao).

### 5.3. Vòng đời Vỡ mảnh, Tự động Tái hợp nhất & Hồi phục
1. **Vỡ mảnh:** Khi một mảnh cạn Độ bền, mảnh đó vỡ tạm thời và bước vào thời gian hồi (cooldown).
2. **Tự động Tái hợp nhất (Magnetic Re-assembly):** Nếu việc vỡ mảnh khiến các mảnh còn lại bị tách rời (mất liên kết cạnh), các mảnh bị cô lập sẽ **tự động tìm đến mảnh gần nhất** của khối còn lại (ưu tiên khối đang neo với nhân vật) và **hút khớp cạnh** để hợp nhất thành một khối liền mạch mới.
   * *Tác động thực chiến:* Giáo sẽ tự rút ngắn tầm đánh nhưng vẫn giữ được mũi; Khiên tự khép lại vá kín khe hở nhưng bị thu hẹp góc che phủ.
3. **Hồi phục từng phần:** Khi từng mảnh hết thời gian hồi trong lúc đang ở trạng thái Ghép, mảnh đó **tự động tái xuất hiện và chèn vào vị trí trống trên khối hiện tại** (vũ khí lập tức dài/rộng ra lại giữa trận).
4. **Hồi phục hoàn toàn:** Ngay khi toàn bộ số mảnh đều hồi đủ, khối vũ khí sẽ **tự động biến đổi (morph) trở về đúng Cấu hình ghép ban đầu** mà người chơi đã thiết lập.

---

## CHƯƠNG 6: HỆ SỐ TỔNG HỢP CÂN BẰNG CO GIÃN

Hệ thống sử dụng **tỷ lệ phần trăm thu phóng ($\%$)** làm nền tảng tính toán. Hiện tại áp dụng theo **3 nấc cố định** ($60\%$, $100\%$, $150\%$) và sẵn sàng mở rộng sang thu phóng tự do theo phần trăm lẻ về sau mà không cần thay đổi công thức.

### 6.1. Công thức tổng quát
Đặt hệ số kích thước chuẩn hóa:
$$S = \frac{\text{Tỷ lệ thu phóng (\%)}}{100}$$
*(Với mốc chuẩn $100\% \Rightarrow S = 1.0$).*

Mọi thông số chịu ảnh hưởng bởi co giãn được tính theo hàm lũy thừa:
$$\text{Chỉ số hiệu dụng} = \text{Chỉ số gốc} \times S^{k}$$
*(Trong đó $k$ là **Hệ số nhạy**, dùng để tinh chỉnh cân bằng nhanh trong giai đoạn kiểm thử).*

### 6.2. Bảng hệ số tổng hợp theo 3 nấc chuẩn

| Thông số chịu tác động | Công thức theo $S$ | Hệ số nhạy ($k$) | Thu nhỏ ($60\%$) | Chuẩn ($100\%$) | Phóng to ($150\%$) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Vùng trúng đòn / Góc khiên** | $A_{\text{gốc}} \times S^{1.0}$ | $+1.0$ | **60%** | **100%** | **150%** |
| **Độ cứng (Chống sát thương)** | $H_{\text{gốc}} \times S^{-1.5}$ | $-1.5$ | **215%** | **100%** | **54%** |
| **Sát thương tập trung / Xuyên** | $D_{\text{gốc}} \times S^{-1.0}$ | $-1.0$ | **167%** | **100%** | **67%** |
| **Tốc độ bay / Vung vũ khí** | $V_{\text{gốc}} \times S^{-0.5}$ | $-0.5$ | **129%** | **100%** | **82%** |
| **Độ bền tối đa (HP mảnh)** | $HP_{\text{gốc}} \times S^{0}$ | $0$ | **100%** | **100%** | **100%** |

* **Ghi chú cân bằng:**
  * **Tốc độ ($V$):** Gắn trực tiếp với chỉ số *Độ cơ động (Agility)* gốc của mảnh. Phóng to làm chậm nhẹ để tăng cảm giác đầm nặng; thu nhỏ tăng tốc độ bay/vung để tăng cảm giác sắc bén.
  * **Độ bền tối đa (HP mảnh):** Giữ nguyên ($k = 0$) và chỉ biến đổi *Độ cứng* theo $S$ nhằm ngăn chặn lỗi khai thác việc thu phóng liên tục để hồi máu mảnh.

---

## PHỤ LỤC: CÁC HẠNG MỤC TIẾP THEO (CHƯA CHỐT)
* **Chương 7:** Cấu trúc trận đấu (Điều kiện thắng/thua, Thời lượng, Bản đồ & Đấu trường, Số lượng mảnh khởi điểm).
* **Chương 8:** Tinh chỉnh chi tiết quy tắc ghép theo vị trí & cơ chế đánh đổi của 3 chế độ xoay.
* **Chương 9:** Định hướng hình ảnh (Art Style), hiệu ứng thị giác (VFX) và âm thanh phản hồi (SFX).
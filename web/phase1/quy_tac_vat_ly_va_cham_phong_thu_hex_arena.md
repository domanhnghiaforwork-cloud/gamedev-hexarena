# QUY TẮC VẬT LÝ VA CHẠM & PHÒNG THỦ — HEX ARENA

* **Phạm vi áp dụng:** Hệ thống va chạm lõi giữa mọi khối lục giác ở trạng thái **Cầm (Anchored)** và **Ném (Thrown/Launched)**.
* **Triết lý thiết kế (Emergent Gameplay):** *Kiếm, Giáo hay Khiên chỉ là tên gọi hình thái.* Trong mã nguồn không phân biệt cứng "loại vũ khí" mà mọi khối đều là tập hợp các mảnh lục giác tuân theo chung 4 quy tắc vật lý dưới đây. Tính năng phòng thủ của "Khiên" và khả năng đâm xuyên của "Giáo" sẽ tự động nảy sinh từ chính **cách xếp hình, số cạnh nối, kích thước co giãn và trạng thái Cầm/Ném**.

---

## QUY TẮC 1: ƯU TIÊN VA CHẠM MẢNH–MẢNH (COLLISION PRIORITY)

Mọi vật thể bay hoặc khối đang **Ném** không bao giờ được phép đi xuyên qua mảnh lục giác của đối thủ để gây sát thương trực tiếp lên nhân vật.

* **Thứ tự giải quyết trong vòng lặp vật lý (Physics Tick):**
  1. Kiểm tra va chạm **Mảnh tấn công $\leftrightarrow$ Mảnh phòng thủ** trước.
  2. Chỉ kiểm tra va chạm **Mảnh tấn công $\leftrightarrow$ Vòng tròn Hitbox chân nhân vật** nếu đường bay không bị chặn hoặc sau khi đã giải quyết xong toàn bộ va chạm với các mảnh chắn nằm trên đường đi.
* **Điều kiện duy nhất để gây sát thương HP lên nhân vật:**
  * Đòn đánh **lách qua khe hở** (đối thủ xoay khối chắn lệch góc hoặc đánh bọc sau lưng), **HOẶC**
  * Đòn đánh **phá vỡ hoàn toàn** tất cả các lớp mảnh nằm trên quỹ đạo và vẫn còn dư động năng xuyên phá (xem Quy tắc 3).

---

## QUY TẮC 2: LỢI THẾ ĐIỂM TỰA & CHIA SẺ LỰC (ANCHORED STANCE & LOAD SHARING)

Khối đang **Cầm ở người** có lực trụ trực tiếp từ nhân vật, trong khi khối **Ném đi** chỉ di chuyển theo quán tính tự do. Sự chênh lệch này tạo ra ưu thế phòng thủ tự nhiên cho các khối xếp dày và có nhiều cạnh liên kết.

### 2.1. Hệ số Điểm tựa (Anchor Bonus)
* Các mảnh nằm trong khối đang ở trạng thái **Cầm** được nhân thêm **$+30\%$ đến $+50\%$ Độ cứng hiệu dụng** (mốc đề xuất: $K_{\text{anchor}} = 1.4$).
* Kết hợp với **Thưởng liên kết cạnh** ($+10\%$ cho mỗi cạnh tiếp xúc với mảnh đồng đội nguyên vẹn), Sức cản kết cấu của một mảnh chắn được tính như sau:

$$R_{\text{chắn}} = H_{\text{gốc}} \times S^{-1.5} \times (1 + 0.1 \times N_{\text{cạnh}}) \times K_{\text{anchor}}$$

*(Trong đó $H_{\text{gốc}}$ là Độ cứng gốc của chất liệu mảnh, $S$ là hệ số thu phóng kích thước, $N_{\text{cạnh}} \in [0, 6]$ là số mảnh kề đang nối cạnh).*

### 2.2. Chia sẻ lực qua cạnh nối (Load Sharing)
* Khi một mảnh đang ở trạng thái **Cầm** chịu lực va chạm trực tiếp, một phần sát thương (đề xuất **$25\% - 35\%$**) sẽ được truyền sang chia đều cho các mảnh đồng đội nối cạnh trực tiếp với nó.
* **Hệ quả thực chiến:**
  * Khối xếp **bè ngang, dày 2 lớp** (nhiều cạnh nối, nhận trọn Điểm tựa và Chia sẻ lực) tự nhiên trở thành **Khiên** cực kỳ lì đòn.
  * Khối xếp **hàng dài mảnh khảnh** (như Giáo, chỉ nối $1 - 2$ cạnh) nếu đem ra đỡ trực diện sẽ nhận sát thương tập trung và rất dễ gãy ngang thân.

---

## QUY TẮC 3: NGÂN SÁCH ĐỘNG NĂNG & XUYÊN CÓ SUY HAO (KINETIC ENERGY BUDGET)

Mỗi khối hoặc mảnh khi **Ném đi** mang theo một **Ngân sách Động năng xuyên phá ($E_{\text{đâm}}$)** được quyết định bởi tốc độ bay, độ sắc của mảnh mũi tiếp xúc và hệ số co giãn ($S^{-1.0}$).

Mỗi lần chạm vào một mảnh chắn có Sức cản $R_{\text{chắn}}$, hệ thống so sánh $E_{\text{hiệu dụng}}$ (đã nhân góc tới ở Quy tắc 4) với $R_{\text{chắn}}$ để giải quyết theo 3 kịch bản:

| Kịch bản va chạm | Điều kiện toán học | Kết quả vật lý trên đấu trường | Tác động lên HP Nhân vật |
| :--- | :---: | :--- | :--- |
| **1. Chặn đứng (Full Block)** | $E_{\text{hiệu dụng}} < R_{\text{chắn}}$ | Mảnh chắn mất Độ bền (có thể nứt nhưng **không vỡ**) và chia sẻ lực sang cạnh kề. Khối ném bị **triệt tiêu toàn bộ động năng**, dừng khựng lại hoặc bật ngược nhẹ. | **An toàn $100\%$** (chỉ chịu lực đẩy lùi nhẹ theo động lượng). |
| **2. Chặn tầng 2 (Multi-Layer Stop)** | $E_{\text{hiệu dụng}} \ge R_{\text{lớp 1}}$ nhưng $E_{\text{dư}} < R_{\text{lớp 2}}$ | Mảnh lớp 1 **vỡ vụn**, nhưng quá trình phá vỡ hút cạn phần lớn động năng: $E_{\text{dư}} = E_{\text{hiệu dụng}} - R_{\text{lớp 1}}$ (đồng thời làm mòn độ bền mũi tấn công). Mảnh lớp 2 phía sau chặn đứng hoàn toàn khối ném đã suy yếu. | **An toàn $100\%$** (người thủ mất $1 - 2$ mảnh, kích hoạt tái hợp nhất BFS). |
| **3. Đục thủng suy hao (Pierced)** | $E_{\text{dư}} > 0$ sau khi phá hết mọi lớp chắn | Thường xảy ra khi **Giáo nén nhỏ ($60\%$)** đâm trực diện vào **Khiên phóng to ($150\%$, mỏng 1 lớp)**. Khối ném bay xuyên qua nhưng tốc độ và sát thương giảm mạnh theo tỷ lệ $\frac{E_{\text{dư}}}{E_{\text{đâm}}}$. | Nhận **sát thương đã giảm trừ**, không bao giờ mất trọn máu như khi không có mảnh chắn. |

---

## QUY TẮC 4: GÓC VA CHẠM & TRƯỢT LỆCH HƯỚNG (IMPACT ANGLE & RICOCHET)

Góc tiếp xúc giữa quỹ đạo đòn ném và bề mặt mảnh chắn quyết định khả năng truyền lực trực diện hay bị trượt văng ra ngoài.

* **Công thức suy giảm theo góc tới ($\theta$):** Gọi $\theta$ là góc hợp bởi vectơ vận tốc của đòn ném và vectơ pháp tuyến của bề mặt mảnh chắn tại điểm va chạm:

$$E_{\text{hiệu dụng}} = E_{\text{đâm}} \times \cos(\theta)$$

* **Ngưỡng Trượt lệch hướng (Deflection Threshold):**
  * **Đâm trực diện ($\theta \approx 0^\circ$):** $\cos(\theta) \approx 1 \rightarrow$ truyền gần như $100\%$ động năng đâm xuyên.
  * **Chạm cạnh vát / rìa cong ($\theta > 35^\circ$):** Lực truyền vào mảnh chắn giảm mạnh. Nếu $E_{\text{hiệu dụng}} < R_{\text{chắn}}$, khối ném sẽ **trượt văng lệch hướng (Ricochet)** ra khỏi vòng tròn Hitbox chân nhân vật thay vì dừng lại hay đâm xuyên.
* **Ý nghĩa thiết kế:** Khuyến khích người chơi xếp mảnh chắn theo dạng **vòng cung cong** (tự nhiên tạo góc vát ở hai bên rìa) và tạo chiều sâu cho kỹ năng **nghiêng góc đỡ đòn** đúng thời điểm.

---

## TÓM TẮT LUỒNG XỬ LÝ THUẬT TOÁN (PHYSICS PIPELINE)

Luồng xử lý chuẩn cho mỗi lần phát hiện va chạm giữa một **Mảnh tấn công ($A$)** và một **Mảnh phòng thủ ($D$)** trong mỗi khung hình:

```text
1. Tính góc tới theta giữa vận tốc của A và pháp tuyến va chạm từ D -> A.
2. Tính Động năng hiệu dụng: E_eff = A.energy * cos(theta).
3. Tính Sức cản kết cấu của D: R_def = D.hardness * S^(-1.5) * (1 + 0.1 * D.adjCount) * AnchorBonus.

4. NẾU (theta > 35 độ) VÀ (E_eff < R_def):
     -> Kích hoạt TRƯỢT LỆCH HƯỚNG (Ricochet): đổi hướng vận tốc A trượt ra ngoài.
     -> Gây sát thương nhỏ lên độ bền D (không xuyên, không trừ HP).
     -> KẾT THÚC va chạm.

5. NẾU (E_eff < R_def):
     -> Kích hoạt CHẶN ĐỨNG (Full Block):
        - Trừ độ bền D (chia 30% sát thương sang các mảnh kề nối cạnh với D).
        - Triệt tiêu A.energy = 0, dừng/bật ngược A.
        - Áp dụng lực đẩy lùi nhẹ lên nhân vật đang cầm D.
     -> KẾT THÚC va chạm.

6. NẾU (E_eff >= R_def):
     -> Kích hoạt PHÁ VỠ & SUY HAO:
        - Phá vỡ mảnh D (chuyển sang trạng thái BROKEN, kích hoạt BFS tái hợp nhất).
        - Trừ độ bền phản lực lên chính mảnh mũi A.
        - Cập nhật động năng dư: A.energy = E_eff - R_def.
        - Giảm tốc độ bay của A tỷ lệ theo (A.energy / A.initialEnergy).
        - Cho phép A tiếp tục kiểm tra va chạm với lớp mảnh phía sau hoặc Hitbox chân.
```

---

## MA TRẬN KHẮC CHẾ CHIẾN THUẬT TỰ NHIÊN

Nhờ 4 quy tắc trên, bài toán khắc chế trong **Hex Arena** vận hành hoàn toàn tự nhiên theo quy luật vật lý:

* **Khắc chế Giáo Nén nhỏ ($60\%$):** Xếp khối Cầm **2 lớp dày** để chặn tầng 2, **nén khối Cầm về $60\%$** để tăng $R_{\text{chắn}}$ lên $215\%$ chặn bật ngược, hoặc xoay nghiêng góc mặt khiên trên $35^\circ$ để đánh trượt lệch hướng.
* **Khắc chế Khiên Phóng to ($150\%$):** Nén Giáo về $60\%$ đâm trực diện ($\theta \approx 0^\circ$) để đục thủng lớp chắn mỏng.
* **Khắc chế Khiên 2 lớp Dày / Nén nhỏ:** Chuyển sang trạng thái **Đơn lẻ bật Xoay pháp tuyến** để bào mòn dần độ bền từng mảnh, hoặc dùng **gọng kìm Xayah** thu hồi mảnh từ sau lưng (đánh trực tiếp vào vòng tròn Hitbox chân ở hướng không có mảnh chắn).
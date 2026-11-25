# Kiến trúc mã nguồn — Hex Arena Phase 3

Tài liệu tóm tắt cấu trúc thư mục, phân tầng module và hướng dẫn mở rộng cho nhánh `web/phase3/`.

---

## 1. Cây thư mục tổng thể

```text
web/phase3/
├── index.html                  # Khung HTML, tải font tiếng Việt (Be Vietnam Pro & JetBrains Mono)
├── package.json                # Script dev/start/build/test/typecheck/server/tunnel
├── tsconfig.json               # Cấu hình TypeScript + path aliases (@core, @attacks, ...)
├── vite.config.ts              # Vite bundler, proxy /ws & /api sang server:3001, Vitest
├── start.mjs / start_ngrok.ps1 # Khởi chạy đồng thời Server + Web + ngrok
│
├── public/
│   ├── icon.svg                # Biểu tượng ứng dụng / PWA
│   ├── manifest.webmanifest    # Cấu hình PWA (landscape, standalone)
│   └── assets/                 # Tài nguyên tĩnh (fonts/, images/, audio/)
│
├── server/                     # Máy chủ PvP 1v1 Authoritative 60Hz + Auth SQLite
│   ├── index.ts                # HTTP Auth/Loadout API + WebSocket Room & 60Hz simulation loop
│   └── db.ts                   # SQLite UserStore (scrypt + salt, loadout, HUD config)
│
├── tests/                      # Bộ kiểm thử Vitest (node)
│   ├── attackRegistry.test.ts  # Kiểm thử Registry 1-N phương thức tấn công & font tiếng Việt
│   ├── blueprint.test.ts       # Kiểm thử lưới (q, r), BFS, auto-connect & sanitizeLoadout
│   ├── botAI.test.ts           # Kiểm thử Bot AI khắc chế & né đòn
│   ├── db.test.ts              # Kiểm thử SQLite UserStore
│   ├── hudLayout.test.ts       # Kiểm thử tính toán HUD Mobile/PC không chồng lấn
│   ├── netcode.test.ts         # Kiểm thử nội suy PvP & prediction/reconciliation
│   └── physics.test.ts         # Kiểm thử công thức lũy thừa S^k & 4 quy tắc va chạm
│
└── src/
    ├── main.ts                 # Điểm khởi chạy Client: nạp font, input, gameLoop, PvP/Bot
    ├── config/                 # Cấu hình dùng chung toàn dự án
    │   ├── typography.ts       # Nguồn chuẩn font tiếng Việt (CSS vars + canvasFont() + preload)
    │   └── theme.ts            # Bảng màu giao diện & đấu trường
    │
    ├── core/                   # Lõi mô phỏng thuần TypeScript (KHÔNG phụ thuộc DOM/Canvas)
    │   ├── types.ts            # Kiểu dữ liệu thực thể, trận đấu, blueprint, SimEvent
    │   ├── constants.ts        # Hằng số đấu trường, vật lý, chất liệu mảnh, loadout mẫu
    │   ├── math/hexMath.ts     # Toán học trục lục giác (q, r), góc, nội suy
    │   ├── world/              # blueprint.ts (BFS, chỉ số), structure.ts, obstacles.ts
    │   ├── attacks/            # Kiến trúc Registry 1-N: phương thức tấn công & Ulti đi kèm
    │   │   ├── types.ts        # AttackModeDefinition, SpecialSkillDefinition
    │   │   ├── common.ts       # Đổi dạng, co giãn, xoay trục, Lướt (Dash)
    │   │   ├── registry.ts     # Đăng ký & điều phối executeAttack / triggerSpecial / updateSpecial
    │   │   ├── loose/          # Đơn lẻ (attack.ts + specials/gravityField.ts)
    │   │   ├── ranged/         # Đánh xa (attack.ts + specials/guidedSpear.ts)
    │   │   ├── melee/          # Đánh gần (attack.ts + specials/parryDisarm.ts)
    │   │   └── defense/        # Phòng thủ (attack.ts + specials/counterFortress.ts)
    │   └── physics/            # combat.ts (va chạm 4 quy tắc), simulation.ts (60Hz step)
    │
    ├── ai/botController.ts     # Bot AI chiến thuật (khắc chế Ulti, né vuông góc, bẫy kìm)
    ├── audio/                  # Hệ thống âm thanh & rung (synthEngine, sfxRegistry, audioManager, haptics)
    ├── render/                 # Kết xuất Canvas 2D tách lớp
    │   ├── renderer.ts         # Điều phối camera + thứ tự vẽ các lớp
    │   ├── assets/assetLoader.ts # Nạp & cache ảnh/sprite
    │   ├── world/              # arenaRenderer.ts, entityRenderer.ts
    │   ├── effects/            # vfxRenderer.ts, indicatorRenderer.ts
    │   └── hud/                # hudRenderer.ts (HUD cảm ứng Mobile & Dock PC trên Canvas)
    ├── input/                  # inputManager.ts (Pointer Events đa chạm + PC), hudPresets.ts
    ├── net/                    # authClient.ts, protocol.ts, pvpClient.ts, pvpInterpolator.ts
    ├── storage/profiles.ts     # Lưu/đọc Loadout & cấu hình HUD qua localStorage
    ├── ui/                     # Giao diện DOM tách theo màn hình & thành phần
    │   ├── common/             # fullscreen.ts
    │   ├── screens/            # lobby.ts, loadoutEditor.ts
    │   ├── hud/                # topBar.ts, hudCustomizer.ts
    │   └── modals/             # authModal.ts, pvpRoomModal.ts
    └── styles/                 # CSS phân 7 tầng theo đúng thứ tự cascade (nhập tại main.css)
        ├── base/               # tokens.css (--font-ui, màu sắc), reset.css
        ├── components/         # hud.css, modals.css
        └── screens/            # lobby.css, loadout.css, pvpRoom.css
```

---

## 2. Kiến trúc tổng thể & luồng phụ thuộc

1. **Tách biệt Lõi mô phỏng (`src/core/`) và Giao diện (`render/`, `ui/`, `audio/`):**
   * `src/core/` chạy thuần TypeScript ở nhịp cố định **Fixed Timestep `60Hz`** (`FIXED_DT = 1/60s`), không đụng DOM/Canvas và dùng **100% đường dẫn tương đối** nội bộ để dùng chung trực tiếp cho cả trình duyệt Client lẫn máy chủ Node PvP (`server/index.ts`).
   * Mọi hiệu ứng hình ảnh/âm thanh/rung từ mô phỏng được phát ra dưới dạng sự kiện thuần `SimEvent[]` để Client (`main.ts` → `VFXManager`, `soundFX`, `triggerHaptic`) hoặc mạng PvP (`protocol.ts`) tiêu thụ.
2. **Kiến trúc Registry 1-N (`src/core/attacks/`):**
   * Mỗi phương thức tấn công (`loose`, `ranged`, `melee`, `defense`) là một thư mục độc lập gồm `attack.ts` + thư mục `specials/` chứa danh sách kỹ năng đặc biệt (`1` phương thức → `N` kỹ năng).
   * `registry.ts` quản lý bản đồ đăng ký, điều phối tấn công (`executeFighterAttack`), kích hoạt/tái kích hoạt Ulti (`triggerFighterSpecial` dựa trên `blueprint.specialSkillId` hoặc mặc định của phương thức) và cập nhật vòng đời Ulti (`updateActiveSpecialSkill`).
3. **Typography & Assets tập trung:**
   * `src/config/typography.ts` là nguồn chuẩn duy nhất cho font tiếng Việt (`Be Vietnam Pro` / `JetBrains Mono`), đồng bộ biến CSS `--font-ui` với hàm `canvasFont()` trên mọi lớp Canvas 2D.
   * `src/audio/` tách catalog dữ liệu (`sfxRegistry.ts`) khỏi bộ tổng hợp Web Audio (`synthEngine.ts`) và hỗ trợ nạp file `.ogg/.mp3` trong `public/assets/audio/` có fallback về synth.

---

## 3. Path Aliases

Khai báo đồng bộ trong `tsconfig.json` và `vite.config.ts`:

| Alias | Thư mục đích |
| :--- | :--- |
| `@config/*` | `src/config/*` |
| `@core/*` | `src/core/*` |
| `@attacks/*` | `src/core/attacks/*` |
| `@ai/*` | `src/ai/*` |
| `@audio/*` | `src/audio/*` |
| `@render/*` | `src/render/*` |
| `@input/*` | `src/input/*` |
| `@ui/*` | `src/ui/*` |
| `@storage/*` | `src/storage/*` |
| `@net/*` | `src/net/*` |

---

## 4. Hướng dẫn mở rộng nhanh

* **Thêm kỹ năng đặc biệt mới cho 1 phương thức tấn công:**
  1. Tạo file trong `src/core/attacks/<mode>/specials/<ten_ky_nang>.ts` triển khai `SpecialSkillDefinition`.
  2. Thêm vào mảng `specialSkills` tại `src/core/attacks/<mode>/index.ts` (hoặc gọi `registerSpecialSkill()`).
  3. Gán `blueprint.specialSkillId = '<mode>:<skill_id>'` khi chọn vũ khí.
* **Thêm phương thức tấn công mới:**
  1. Tạo thư mục `src/core/attacks/<new_mode>/` gồm `attack.ts`, `specials/`, `index.ts`.
  2. Đăng ký qua `registerAttackMode()` trong `src/core/attacks/registry.ts` và bổ sung kiểu tương ứng trong `src/core/types.ts`.
* **Thay đổi / bổ sung font chữ, ảnh, âm thanh:**
  * Đổi font toàn dự án (DOM + Canvas): cập nhật `index.html`, `src/config/typography.ts` và `src/styles/base/tokens.css`.
  * Thêm âm thanh hoặc ảnh tĩnh: đặt file vào `public/assets/audio/` hoặc `public/assets/images/` rồi khai báo `assetUrl` trong `sfxRegistry.ts` hoặc nạp qua `assetLoader`.

# 2.5 測試重現

```bash
npm ci
npm test
npm run build
npm audit --audit-level=high
npm install --no-save --package-lock=false @playwright/test@1.55.0
npx playwright install --with-deps chromium
npx playwright test --repeat-each=3 --workers=1 --retries=0
```

壓力測試可連續執行三次 `npm run test:stress`。手機黑箱使用 Pixel 7 模擬視窗；真實 iOS／Android 原生分享仍需實機驗證。本雲端容器使用系統 Chromium 151，GitHub CI 使用 Playwright 1.55 配套 Chromium。

新增 `e2e/mobile-2.5.spec.js` 測試：結算快照失效與重新結算、精準支出鎖定、既有付款確認、PNG 三種範本／多頁滑動／選取／下載、名稱超限、金額貼上超限、草稿刪除確認。

既有 2.4 回歸保留在 `e2e/mobile-regression-2.4.spec.js`，包含 15 人跨帳目平均分攤、公平尾差、部分付款、手動路線、爭議重送、手機捲動與鍵盤視窗。重置案例已更新為清除 2.4（含）以前，並確認重新整理保留新版資料。

Node 新增快照與鎖定、歷史付款不變條件、名稱顯示單位、PNG 分頁與分享降級單元測試。資料遷移測試另外確認缺少重置標記時也保留已存在的 2.5 資料，不截短歷史名稱。

快照容量量測：`node scripts/benchmark-2.5.mjs`，輸出三輪 15 人與 1,000 人各 1,000 筆帳目之建立時間、簽章時間、JSON 大小。這是計算基準，不會寫入本機資料。

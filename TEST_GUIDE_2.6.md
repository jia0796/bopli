# 2.6 測試重現

```bash
npm ci
npm run build
npm test
npm audit --audit-level=high
npm install --no-save --package-lock=false @playwright/test@1.55.0
npx playwright install --with-deps chromium
npx playwright test --repeat-each=3 --workers=1 --retries=0
```

壓力測試另連跑三次 `npm run test:stress`；容量基準：`node scripts/benchmark-2.5.mjs`（帳務核心沿用，腳本輸出三輪兩種規模，不修改資料）。

新增 `mobile-2.6.spec.js`：帳號名稱問候、左上標題、內建頭像持久化與帳務 ID 保留、結算卡片／按鈕／分享位置、一般成員權限、啟動一次與重新載入、導航及背景切回不重播、reduced-motion 只用 opacity。

既有 `mobile-2.5.spec.js` 仍測三種 PNG、1500×2100 實際下載、滑動及選取、零選取、輸入邊界、草稿刪除、付款鎖定與既有付款確認。2.4 回歸保留跨帳目公平分攤、手動路線、部分付款、爭議重送、歷史成員、鍵盤視窗與頁籤捲動。

本機雲端使用系統 Chromium 151，GitHub CI 使用 Playwright 1.55 配套瀏覽器；皆模擬 Pixel 7。實機 iOS／Android 原生分享仍需另驗證。正式站 smoke test 由 Pages 部署 workflow 操作 HTTPS 網站。

# bopli_test.2.6｜朋友分帳管家

目前版本：**bopli_test.2.6**。部署：https://jia0796.github.io/bopli/

- 「我的」左上標題與帳號名稱問候，四種內建頭像；改頭像不改帳務 ID。
- 我的結算卡片在前，結算批次操作在下方；分享放在內容最下方。
- PNG 固定 1500×2100，大主金額、姓名與金額左右對齊、淡色卡片與細分隔線；最多八列並依安全高度提前分頁。
- 約 1.4 秒品牌啟動動畫；只在完整啟動／重載播放，reduced-motion 使用短暫淡入淡出。
- 沿用 2.5 結算快照、付款保護、輸入限制與草稿確認。
- 依使用者要求，首次開啟 2.6 一次性清除 2.5（含）以前本機資料，保留新 2.6 與其他資料。

報告：[REPORT_2.6.md](./REPORT_2.6.md)。重現：[TEST_GUIDE_2.6.md](./TEST_GUIDE_2.6.md)。

## 開發

```
npm ci
npm run dev
npm test
npm run build
```

## GitHub Pages

`.github/workflows/deploy.yml` 會在 push 到 `main` 後自動執行測試、Build 並部署 GitHub Pages。

`.github/workflows/validate-2.6.yml` 會驗證 `bopli_test.2.6` 分支與 main PR的 Build、單元／壓力／UI 測試、套件稽核與手機 E2E。

## 目前限制

目前資料仍主要儲存在瀏覽器 `localStorage`：

- 不是真正多人即時同步
- Google Authentication 尚未正式接上
- 邀請連結尚未接 Firebase / Firestore
- 不同裝置資料彼此獨立
- 清除瀏覽器網站資料會清除本機測試資料

## 核心帳務原則

- 付款人與分攤人獨立。
- 找零從實際墊付扣除。
- 平均、自訂金額、比例與數量分攤皆支援。
- 歷史付款紀錄不可因成員退出而消失。
- 待確認付款不視為完成，但會保留該筆付款額，避免再次安排。
- 建議結算只從淨應付者直接轉給淨應收者。
- 已開始還款的帳務維持保護，避免已處理的金額被任意改寫。
- 完整結算尾差只有群主／副群主能決定。

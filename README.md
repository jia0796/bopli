# Bopli 2.1｜朋友分帳管家

Bopli 2.1 是依目前已確認 UX / 帳務規則整理出的 **React + Vite 手機優先互動原型**。視覺維持 Bopli 的雙角色品牌、蜜桃珊瑚 `#F6A08B`、奶油白 `#FFF9F5`、深藍 `#24334F`。

> 這個 ZIP 是前端本機原型。Google 登入、真正邀請連結、跨裝置多人同步與伺服器端權限仍需要 Firebase Authentication / Firestore / Security Rules 或其他後端。

## 2.1.1 測試版修正

- 群組「成員名單與角色」與邀請面板新增 **新增測試成員**。可貼上多個名字快速建立本機假成員。
- 成功狀態動畫改為約 **1.5 秒**。
- 修正 iPhone / 行動瀏覽器點輸入框會自動放大 viewport 的問題。
- 既有 `localStorage` key 不變，從 2.1 升級測試時會保留目前本機資料。

## Windows / VS Code 啟動

1. 解壓縮 `bopli-2.1.1.zip`。
2. 用 VS Code 開啟 `bopli-2.1.1` 資料夾。
3. 安裝 Node.js LTS。
4. VS Code → **Terminal → New Terminal**，執行：

```powershell
npm install
npm run dev
```

終端機顯示 `Local: http://localhost:5173/` 後，用瀏覽器開啟。

測試與正式建置：

```powershell
npm run test
npm run build
```

## 2.1 核心內容

- 首頁：需要處理事項優先；3 筆後收合。群組最多先顯示 5 個，有待處理帳目的群組優先。
- 通知中心：今天／昨天／更早；最近 90 天；看見即已讀，但已讀不等於已完成。只有真正需要操作的事項才掛紅點。
- 帳號：第一次輸入帳號名稱；Google 連結／找回流程位置已設計；連結成功使用約 1.5 秒成功狀態。2.1 本機版不真正呼叫 Google Authentication。
- 群組暱稱：帳號名稱私人；每個群組可有不同暱稱，群組內不可完全撞名；修改後該群組所有活動同步顯示。
- 群主／副群主：1 位群主、最多 3 位副群主。只有群主可指派／取消副群主、移除整個群組成員、封存群組。
- 活動管理：群主＋副群主可增減活動成員。舊帳要不要從 16 → 17 人重算由管理者決定；有還款紀錄時禁止直接重算。
- 支出：多人付款、找零、付款扣找零自動計算總額；卡片直接顯示「我分攤」與必要時的「我墊付」。
- 分攤：平均、自訂金額、比例；商品可選數量 × 單價，並可依購買數量分攤。
- 購物單：快速分攤／完整品項，模式可切換且各自保留未完成輸入；私人商品與多人分攤分開處理。
- 草稿：輸入中自動儲存，草稿不影響活動總額與結算。
- 成員帳目：我優先 → 未結清 → 待確認 → 已結清；卡片先只顯示目前應收／應付。
- 結算：待我確認 → 我要付 → 我要收 → 已完成還款 → 查看全部結算；支援部分還款、付款方式、收款確認與問題回報。
- 尾差：每筆平均分攤的 NT$1 尾差依活動輪流分配；完整結算時只有群主／副群主可決定最終尾差方案。

## 最終尾差規則

平常每筆平均分攤不能整除時，必要的 NT$1 會輪流由不同參與者負擔，例如第一筆 A +1、第二筆 B +1、第三筆 C +1。

整個活動完成後，管理者可在「結算」設定：

- 維持目前精準結果。
- 指定誰負擔必要的 +NT$1 尾差。
- 隨機決定必要尾差承擔者。
- 全員有小數尾差者向上補齊。

「全員向上補齊」如果產生額外金額，會直接分配給目前仍為淨應收的人；預設為 **隨機但盡量平均**，也可指定一位或多位應收者。正式確認前顯示「尾差前 → 尾差後」；按 **確認結算方案** 後鎖定。

## 本機資料

- 儲存鍵：`bopli-2.1-v1`
- schema version：`21`
- 清除瀏覽器網站資料會清除這個本機原型的資料。
- 2.1 不做多帳號切換，也不自動合併「本機新帳號」與「Google 找回的舊帳號」。這項已列入未來登入優化 backlog。

## 驗證狀態

目前純帳務／權限邏輯測試：**29 / 29 通過**。

這個執行環境無法完成 npm 依賴安裝，因此這裡沒有執行 Vite production build；請在你的電腦 `npm install` 後執行 `npm run build` 做最終瀏覽器建置驗證。

## 專案結構

```text
src/App.jsx                       首頁、群組、通知、角色、活動、結算、尾差、帳號流程
src/components/Brand.jsx          Bopli 雙角色品牌
src/components/ExpenseForm.jsx    新增／修改支出、購物單、分攤、草稿
src/components/ExpenseViews.jsx   支出卡片、我的帳目、商品清單
src/components/MemberLedger.jsx   成員帳目與全部結算長條圖
src/lib/money.js                  分攤、輪流尾差、淨餘額與建議轉帳
src/lib/rounding.js               完整結算尾差模型
src/lib/ledger.js                 帳目核對與個人明細
src/lib/domain.js                 權限、角色與修改歷史
src/lib/store.js                  Bopli 2.1 本機 schema
src/lib/*.test.js                 Node 單元測試
PRODUCT_SPEC.md                   2.1 完整 UX / 帳務規格
IMPLEMENTATION_STATUS.md          原型實作狀態與限制
ROADMAP_2.2.md                    下一輪 2.2 討論方向
```
## GitHub / GitHub Pages 發佈

這個版本已包含 `.github/workflows/deploy.yml`。把專案推到 GitHub 的 `main` 分支後，可以使用 GitHub Actions 自動建置並部署到 GitHub Pages。

### 第一次上傳到 GitHub

1. 在 GitHub 建立一個新的 repository，例如 `bopli`。
2. 不要在 GitHub 預先新增 README / `.gitignore`，避免第一次 push 需要處理衝突。
3. 在本機專案資料夾開啟 PowerShell：

```powershell
git init
git add .
git commit -m "Bopli 2.1.1"
git branch -M main
git remote add origin https://github.com/你的GitHub帳號/bopli.git
git push -u origin main
```

4. GitHub repository → **Settings → Pages → Build and deployment → Source → GitHub Actions**。
5. 到 **Actions** 查看 `Deploy Bopli to GitHub Pages`。完成後 GitHub Pages 會提供公開網址。

### 之後更新

```powershell
git add .
git commit -m "Update Bopli"
git push
```

每次 push 到 `main` 後，GitHub Actions 都會重新執行測試、Vite build，再部署新的 Pages 版本。

> `vite.config.js` 目前使用相對路徑 `base: './'`，因此不需要把 repository 名稱寫死在專案中。

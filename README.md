# bopli_test.2.2｜朋友分帳管家

目前版本：**bopli_test.2.2**

版本命名規則：
- `bopli_1.X.X`：未來正式版
- `bopli_test.X.X`：測試版，只提供開發者與指定朋友測試

GitHub Pages：
- https://jia0796.github.io/bopli/

完整測試使用說明：
- [TEST_GUIDE_2.2.md](./TEST_GUIDE_2.2.md)

## test.2.2 本次重點

- 測試版可直接新增本機測試成員。
- 可切換「群主／副群主／一般成員／已退出歷史成員」視角。
- 頁面頂端會顯示目前測試身分，可快速切換。
- 成員退出後，**目前成員**與**歷史帳務參與者**分離。
- 退出／移除不再刪除既有分攤、付款、找零與還款紀錄。
- 已退出但仍未結清者，可繼續處理自己的舊帳；結清後不再占目前成員名單。
- 移出活動時，可「預設全選所有可安全重算的共同支出」，並逐筆取消。
- 特殊／私人／自訂分攤不會被系統擅自重算。
- 付款／墊付紀錄不因退出而消失。
- 支出清單的「＋ 新增支出」移到「全部／與我有關」下方左側，並使用 sticky 小按鈕。
- 支出詳情的修改紀錄改成按鈕，點擊後開啟獨立底部小頁面；右上角 `×` 關閉。
- Google 連結成功動畫維持約 1.5 秒。
- 行動瀏覽器輸入框維持 16px，避免 iPhone Safari 聚焦時自動放大。

## 開發啟動

```
npm install
npm run dev
```

測試與 build：

```
npm test
npm run build
```

## GitHub Pages

專案已包含 `.github/workflows/deploy.yml`。

每次 push 到 `main` 後會自動：
1. 安裝依賴
2. 執行測試
3. Vite build
4. 發布到 GitHub Pages

GitHub → Settings → Pages → Source 必須設定為 **GitHub Actions**。

## 目前仍是測試原型

目前資料主要存在瀏覽器 `localStorage`：
- 不是真正多人即時同步
- Google Authentication 尚未正式接上
- 邀請連結尚未接 Firebase / Firestore
- 不同裝置開啟同一 GitHub Pages 網址，資料彼此獨立
- 清除瀏覽器網站資料會清除本機測試帳本

## 核心帳務原則

- 付款人與分攤人獨立。
- 找零從實際墊付扣除。
- 平均、自訂金額、比例與購買數量分攤。
- 每筆平均分攤的必要 NT$1 尾差輪流處理。
- 完整結算尾差只有群主／副群主能決定。
- 已有還款紀錄時，不允許直接重算既有舊分攤。
- 歷史帳務不可因成員退出而消失。

## 專案結構

```text
src/App.jsx
src/components/ExpenseForm.jsx
src/components/ExpenseViews.jsx
src/components/MemberLedger.jsx
src/lib/money.js
src/lib/ledger.js
src/lib/rounding.js
src/lib/domain.js
src/lib/store.js
TEST_GUIDE_2.2.md
PRODUCT_SPEC.md
IMPLEMENTATION_STATUS.md
```

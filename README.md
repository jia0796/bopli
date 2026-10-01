# bopli_test.2.2｜朋友分帳管家

目前版本：**bopli_test.2.3**

版本命名：
- `bopli_1.X.X`：未來正式版
- `bopli_test.X.X`：測試版

GitHub Pages：
- https://jia0796.github.io/bopli/

版本規劃：
- [ROADMAP_2.3.md](./ROADMAP_2.3.md)

2.2 使用說明仍保留：
- [TEST_GUIDE_2.2.md](./TEST_GUIDE_2.2.md)

## test.2.3 重點

- **2.3 不刪除既有資料**：第一次啟動會將可用的 2.2 localStorage 複製遷移至 2.3 key，舊 key 保留不動。
- 測試身分清單初始為空，必須手動加入要模擬的成員。
- 可切換群主／副群主／一般成員／已退出歷史成員視角。
- 目前活動成員與歷史帳務參與者分離。
- 移出活動時，所有既有分攤類型都可選擇移除該成員分攤。
- 移除舊分攤預設全部不選；提供「全選 / 清除選取」。
- 付款／墊付／找零紀錄不因移出活動而刪除。
- 支出紀錄新增搜尋，可查支出名稱、品項、付款人與備註。
- 支出頁取消 sticky 操作區，改用右下角 `↑` 返回頂部。
- 支出卡可右滑刪除，刪除前一定二次確認。
- 支出詳情底部改成「編輯支出 / 刪除支出」左右雙按鈕。
- 刪除後不再計入帳務，但會保留活動修改紀錄。
- 支出修改紀錄仍使用底部小頁面，右上角 `×` 關閉。
- 成功動畫約 1.5 秒。
- 行動瀏覽器輸入框維持 16px，避免 iPhone Safari 聚焦時自動放大。

## 開發

```
npm install
npm run dev
npm test
npm run build
```

## GitHub Pages

`.github/workflows/deploy.yml` 會在 push 到 `main` 後自動：
1. 安裝依賴
2. 執行測試
3. Vite build
4. 部署 GitHub Pages

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
- 已開始還款的活動會保護既有帳務，避免直接重算或刪除。
- 完整結算尾差只有群主／副群主能決定。


## 2.3 工程優化

- `src/App.jsx` 已開始拆分：共用 UI primitives 與次要畫面移至 `src/components/`。
- 新增集中版本常數 `src/version.js`，避免 package、UI 與資料 schema 各自漂移。
- 保留原有 Node `node:test` 核心帳務測試，新增 Vitest + Testing Library UI 測試。
- 新增 localStorage 2.2 → 2.3 非破壞式 migration 測試。
- 新增 `bopli_test.2.3` 分支專用 CI：domain tests + UI tests + build。

# Bopli 多人即時同步基礎

本次明確需求已同步到 project.md 第 30 節；本文件只說明執行方式，產品規格以 project.md 為唯一來源。規格版本仍為 bopli_test.2.6。本變更沒有建立 live Firebase project、部署 Functions 或更新正式 Pages。

## 使用者最少設定步驟

1. 在 Firebase Console 建立專用測試專案，加入 Web App，Authentication 啟用 **Anonymous**。不啟用 Google，也不要設定匿名帳號自動清除：目前沒有帳號恢復流程。
2. 建立 **Cloud Firestore Standard / Native** `(default)` 資料庫。請先確認資料庫 edition 與區域；本實作驗證環境是 Standard emulator，尚未驗證 Enterprise。選與 Functions 相近的區域；Functions 預設 `asia-east1`。Callable Functions 部署需專案支援該服務及必要 billing 設定。
3. 本機 `npm ci`、`npm ci --prefix functions`，執行 `npx firebase login`。以明確 `--project YOUR_PROJECT_ID` 部署，不依賴隱藏預設專案：

   ```sh
   npm run functions:prepare
   npx firebase deploy --project YOUR_PROJECT_ID --only firestore:rules,firestore:indexes,functions
   ```

4. 複製 `.env.example` 為 `.env.local`，填入 Web App config 的 API key、auth domain、project ID、app ID。`VITE_FIREBASE_EMULATORS=false`。執行 `npm run dev`，以兩個不同瀏覽器建立匿名身份，建立群組、產生邀請碼、加入、建立活動與記帳驗收。
5. 要部署現有 GitHub Pages 時，在 GitHub repository / github-pages environment 設定相同的 `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_APP_ID` secrets，再發布前端。缺少設定的 build 部署會阻擋，避免覆蓋正式站。

Web config 是前端識別設定，會出現在 bundle，不能代替安全規則。服務帳號私鑰、管理憑證與登入 token 不可放在任何 `VITE_*` 變數或 repo。Functions 使用執行環境的 Admin 身份。

## 資料與一致性

- `identities/{authUid}`：server 產生的 Bopli internal ID 與 authUid 綁定。UI / 支出 / 還款仍引用 internal ID。
- `groups/{groupId}`：群組 metadata、`readerAuthUids` 與 `epoch`；沒有整包 app state。
- 子集合 `members`、`activities`、`expenses`、`repayments`、`settlementSnapshots` 每個實體獨立文件；活動僅存目前快照 ID/signature，歷史快照獨立保存。
- `invites/{sha256}`：80-bit 隨機邀請碼雜湊，7 天有效；非公開可列舉資料。加入會檢查邀請者目前權限、暱稱重複、重複加入；每身份每分鐘限制嘗試。加入群組不自動改寫舊活動／支出。
- Client 透過 `onSnapshot` 監聽群組 epoch，呼叫 `syncRead` transaction 取得同一版所有子集合，避免渲染跨集合不同提交時間的半套帳務。
- 所有正式寫入只走 Auth 驗證的 callable。Security Rules 拒絕所有 client 直接寫入。`syncCommit` transaction 讀群組與帳務文件，驗證 before/revision、權限、收據與分攤加總、快照、路線、還款額與歷史 invariants，再原子寫入；群組 epoch 是共同 serialization point。
- 過期支出提示「這筆支出已被其他成員更新，請重新確認」，不自動 merge。其他文件也檢查 before，避免過期還款狀態覆寫。
- Pending / disputed 保留金額；confirmed 不可再確認；snapshot dirty 禁止新付款，既有 pending / disputed 可處理。還款 accounting basis 由 server 生成，不能由 client 偽造。
- request receipt 使相同 requestId 重送具 idempotency。網路回應遺失時，不會離線排隊；重新連線先讀 cloud 再由使用者確認下一步。
- 退出／移除仍保留 internal ID、歷史帳務及必要的歷史讀取權限；非目前群組成員不可新增支出／付款，仍可處理自己歷史 pending / disputed。
- 合法刪除已結清活動／群組以伺服器 tombstone 隱藏，原帳務／付款／人物文件仍保留供 audit；一般單筆付款不能直接刪除。整批刪除仍需符合既有群主與結清條件。

## 線上模式與 migration

正式 build 一律雲端模式。缺 config、offline、Auth / Firestore / Functions 故障均顯示 spinner、狀態與重試；每 5 秒自動重試／檢查連線。cache snapshot 不授權進入 App。App 內斷線顯示最高層 overlay + inert，保留頁面與未關閉表單；恢復後先取得 server 最新資料才解除。後端無回應會在 timeout 後阻擋，因此伺服器故障偵測不是瞬時。

雲端模式不讀、不寫、不清除既有 `bopli-test-2.6-v1` 正式帳本，也不執行舊版 reset；僅 `bopli-cloud-ui-v1` 保存本機草稿與通知閱讀狀態。沒有自動上傳舊本機帳本、資料合併或歷史 ID 改寫。首次雲端登入建立全新帳戶；舊帳本需保留作為參考。此基礎版本沒有把舊本機帳本轉成多人帳本的匯入功能，不能宣稱已完成雲端 migration。

`VITE_BOPLI_MODE=local` 僅在 Vite 開發環境開啟舊原型，供既有 regression tests；production build 無本機 fallback。清除瀏覽器 Auth storage 或換裝置會建立另一個匿名身份，不能接管舊人物，也沒有 Google 或其他恢復流程。

## 測試

```sh
npm ci
npm ci --prefix functions
npm run build
npm test
npx playwright install chromium
npm run test:e2e
# 需要 Java 21+ 與可用的本機 8080/9099/5001 ports；不需 live credentials
npm run test:cloud
```

`test:cloud` 使用 `demo-bopli` emulator：真實匿名登入、邀請碼加入、兩個 client 監聽、revision race、transaction overpay、double confirmation、規則攻擊測試，以及 Playwright 斷線／恢復／同步流程。Functions 的 `shared/` 由既有 domain 原始檔準備，部署前重新生成，避免複製帳務計算分岔。

## MVP 限制

群組級 serialization / coherent full-group reads 優先確保一致性，適合朋友群組 MVP，尚非大型高頻系統。單次 patch 最多 100 文件；大量歷史或過大單一文件會由 Firestore transaction / document 限制拒絕。尚未提供 archive 後歷史分頁、invite revoke UI、舊帳本匯入、匿名帳戶恢復或 App Check。沒有部署或測試 live 資源。

Security Rules 是 prototype：成員讀取、禁止所有 client 寫入、邀請與身份資料最小存取。Admin SDK 不受 Rules 約束，請在廣泛分享前連同 callable 驗證一起審查。測試不代表涵蓋所有攻擊。

官方參考：[匿名 Auth](https://firebase.google.com/docs/auth/web/anonymous-auth)、[Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)、[即時監聽](https://firebase.google.com/docs/firestore/query-data/listen)。

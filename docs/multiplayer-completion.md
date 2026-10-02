# 多人即時同步基礎完成報告

版本：bopli_test.2.6。工作分支：codex/multiplayer-foundation，從 main `e7a39b29ce26c3a906a80ca56a63bcbae1b3aa60` 建立；main 與 origin/bopli_test.2.6 當時產品檔案內容一致。本次需求已列入 project.md 第 30 節，handoff 維持以 project.md 為唯一規格。

## 變更檔案

- 規格與執行文件：`project.md`、`work.2.6.handoff.md`、`docs/firebase-setup.md`、本報告。
- Firebase 設定：`.env.example`、`firebase.json`、`firestore.rules`、`firestore.indexes.json`。
- 後端：`functions/index.js`、`functions/package.json`、`functions/package-lock.json`、`scripts/prepare-functions.mjs`。部署前從原始 domain 準備 `functions/shared/`，此生成目錄不提交。
- 雲端 session / 伺服器共用驗證：`src/lib/firebaseClient.js`、`src/lib/cloudSession.js`、`src/lib/cloudProtocol.js`。
- 連線與邀請 UI：`src/components/CloudApp.jsx`、`src/components/CloudInvite.jsx`。
- 既有 UI 接線：`src/App.jsx`、`src/main.jsx`、`src/components/SecondaryScreens.jsx`、`src/lib/useStorePersistence.js`、`src/styles.css`。
- 測試：`src/lib/cloudProtocol.test.js`、`src/lib/cloudSession.test.js`、`integration/cloud.test.js`、`e2e/cloud-sync.spec.js`、`playwright.cloud.config.js`、`playwright.config.js`。
- 依賴與 CI：`package.json`、`package-lock.json`、`.gitignore`、`.github/workflows/validate-sync.yml`、`.github/workflows/deploy.yml`、`scripts/smoke-pages.mjs`。

## 行為與帳務保護

匿名身份對應穩定 internal ID；群組、成員、活動、支出、還款、歷史快照分文件存放。邀請碼有效 7 天；加入不重算過去支出。雲端正式寫入全部走 server transaction。Client 不能直接寫入 Firestore；伺服器再次驗證群組角色、版本、付款與分攤加總、snapshot、manual route、pending / disputed / confirmed 與 overpay invariants。

編輯表單保留開啟時 revision，收到別人的即時更新不會偷偷改成新 revision；過期提交會顯示指定文案。一般付款人也可原子消耗手動路線、取消自己待處理付款；不會因此取得調整整體結算的權限。既有 pending 在 snapshot dirty 時仍可確認或處理爭議。已結清活動合法刪除以 tombstone 隱藏，帳務與付款歷史保留，舊 ID 不可重用。

離線／Firebase 無法連線時啟動停在可重試連線畫面，使用中斷線顯示 overlay 並阻擋寫入。重新連線先讀最新 cloud，再回原畫面；原表單與本機草稿保留。沒有離線正式寫入、整包 state document 或自動 merge。

## Migration

沒有自動上傳／改寫既有 localStorage 帳本或歷史人物 ID。雲端模式不讀寫舊原型帳本 key，僅保存草稿與通知 UI。首次匿名登入建立新雲端帳戶。舊帳本匯入、匿名身份跨裝置恢復與 Google 都未實作。清除 Auth storage 會建立另一身份，無法自動接管舊人物。

## 實際驗證

- `npm ci` 與 `npm ci --prefix functions`：通過。
- `npm run build`：通過；主 bundle 約 1 MB，Vite 有 chunk size 提示。
- `npm test`：94 個 unit、13 個 stress、27 個 UI，全部通過。修正 Windows 下原有 UI test glob 只執行部分 component tests 的問題。
- 既有 `npm run test:e2e`：25 個 mobile E2E 全部通過。
- `npm run test:cloud`：新啟動 demo-bopli emulator，1 個完整整合測試與 2 個 Playwright 流程全部通過。覆蓋真實匿名登入、邀請、兩 client 同步、雙編輯表單衝突、同時付款防 overpay、雙重確認、斷線與恢復、歷史 tombstone，以及非成員讀取／偽造 client 寫入攻擊。Rules 已由 emulator 編譯及執行驗證。
- 高／嚴重依賴 audit：前端與 Functions 均通過。前端工具依賴仍有 5 個 moderate，Functions 依賴仍有 9 個 moderate；未以重大版本升級強制修補。
- 本機 Node 24、Java 21；Functions runtime / 新 CI 指定 Node 22。GitHub Actions 與 live Functions 尚需 remote 執行確認。

## 使用者尚需完成

Firebase CLI 尚未登入，沒有建立或部署 live project。請依 [setup](firebase-setup.md) 完成：建立／選定測試專案，啟用 Anonymous，建立 Standard Firestore，登入並部署 Rules / indexes / Functions，填 Web config；要發布 Pages 時再設定 GitHub secrets。正式 Pages 未部署，未 merge main。

Security Rules review statement:

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for authenticated group-member reads with all client writes denied and accounting changes validated by trusted callable transactions. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

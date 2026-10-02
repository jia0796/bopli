# Bopli 0 元多人同步完成報告

版本 bopli_test.2.6；分支 codex/multiplayer-foundation。接續 c7e36072b5ac61fb5218153d9abba60b5904ef60 的 Firebase 基礎，
依使用者「真正 0 元成本」要求改用 **Supabase Free + GitHub Pages**。
未開通付費方案、未綁付款方式、未建立 live project、未合併 main、未部署正式 Pages。
commit SHA 以本次提交／git log 為準，設定見 [supabase-setup.md](./supabase-setup.md)。

## 修改檔案

- 客戶端：新增 `src/lib/supabaseClient.js`；修改 `src/components/CloudApp.jsx`、`src/lib/cloudSession.js`、`src/lib/cloudSession.test.js`。
- 帳務簽章：`src/lib/settlementBatch.js`、`src/lib/settlementBatch.test.js`。
- 共用後端：新增 `server/syncService.js`、`server/postgresStore.js`、`server/edgeHandler.js`。
- Supabase：新增 `supabase/config.toml`、`supabase/functions/deno.json`、`supabase/functions/bopli-sync/index.ts`、`supabase/migrations/202610020001_sync.sql`、`scripts/prepare-supabase.mjs`。
- 測試：新增 `integration/postgresHarness.js`、`integration/supabase.test.js`、`integration/supabaseHarnessServer.js`；修改 `e2e/cloud-sync.spec.js`、`playwright.cloud.config.js`。
- 設定／CI：`.env.example`、`.gitignore`、`package.json`、`package-lock.json`、`.github/workflows/deploy.yml`、`.github/workflows/validate-sync.yml`。
- 文件：`project.md`、`work.2.6.handoff.md`、`README.md`、`docs/supabase-setup.md`、`docs/firebase-setup.md`、`docs/multiplayer-completion.md`、本報告。
- 移除：`src/lib/firebaseClient.js`、`functions/index.js`、`functions/package.json`、`functions/package-lock.json`、`firebase.json`、`firestore.rules`、`firestore.indexes.json`、`scripts/prepare-functions.mjs`、`integration/cloud.test.js`。

## 帳務與權限

保留匿名身份與獨立 Bopli internal ID。每筆群組、人物、活動、支出、還款與 snapshot 存為
`bopli_documents` 獨立資料列，以 path / collection_path 與 indexes 定位，不存整包 state。
`bopli_revision` 只存全域交易 revision，不存帳本內容。

service 沿用原 domain 與 server 角色／revision／歷史驗證。一次讀取後提交時，SQL row lock
檢查全域 revision 是否仍相同；不同則重新讀取並重新驗證原 patch，最多 8 次。
同筆支出的過期 before/revision 仍回衝突，不做 merge。repayment、確認、disputed、
manual route、snapshot、邀請加入與 receipt 均原子提交；SQL 錯誤整筆 rollback。
全域鎖是此基礎版的保守策略，跨群組高競爭可能要求重試，後續擴充不能降低一致性。

瀏覽器只可直接讀 RLS 允許的群組 metadata；其他資料與 SQL RPC 只供 service_role。
直接客戶端寫入、非成員讀取、偽造身份與呼叫 privileged RPC 均被拒絕。
Edge handler 每次用 Auth.getUser 驗證 token，忽略 body 裡的身份宣稱。
publishable key 可公開，私鑰只留 Supabase 自動提供的後端環境。

Realtime 只訂閱群組 epoch，讀帳本需 server validation；離線或資料庫不可用時顯示等待 overlay，
阻擋正式操作、保留表單，恢復後先同步。心跳有逾時與防重疊，不消耗 Edge invocation。

## Migration

此對話未建立 live Firebase project，沒有已知遠端資料需移轉。若另有已部署帳務不能直接切換，
需要另外驗證匯入與身份重新綁定。舊本機帳本不清除、不自動上傳，authUid 不取代 internal ID。
JSONB 重排欄位會使原 JSON 簽章誤失效；改成依內容 canonical 比較，接受舊 JSON 簽章，
不改写 snapshot history、basis、金額、人物 ID 或 pending/disputed/confirmed。

## 已執行驗證

- `npm ci`：成功；`npm audit --audit-level=moderate`：0 vulnerabilities。
- `npm test`：96 unit + 13 stress + 27 UI = **136 passed**。
- `npm run build`：成功；JS 約 589 KB，有既有 chunk size 警告。
- `npm run test:e2e`：**25 passed**，涵蓋分帳、批次、手動路線、爭議、分享與歷史。
- `npm run test:cloud`：**2 integration + 3 Playwright passed**，合計全部 **166 tests passed**。
- `npm run backend:prepare` + Deno check：部署入口、共享 dependencies 與 TypeScript 檢查成功。
- `git diff --check`：通過。

雲端測試涵蓋邀請碼／重複加入、兩 client 同步、revision conflict、過量還款、雙重確認、
普通付款人的 manual route 原子消耗、snapshot 失效後繼續 disputed/resubmit/confirm、
tombstone 保留、request 重試冪等性、SQL rollback、RLS／privileged RPC 攻擊、離線啟動、
斷線／恢復、navigator 仍 online 但 Auth 503 或 database 429 時也不進入／不允許操作。

PGlite 執行真實 SQL migration／RLS／RPC，但為嵌入式單連線；Auth／Realtime 平台由測試
harness 模擬。因此 **尚未驗證 live Supabase、多連線 row lock 與雲端 Realtime**，
使用者完成免費專案後需做 setup 文件的兩瀏覽器驗收。沒有捏造遠端測試結果。

## 需要使用者設定

1. 建立 Supabase Free 專案，不填付款方式、不選 Pro／付費 add-on。
2. 開啟匿名登入，在 SQL Editor 執行 migration，確認 Realtime publication。
3. 登入 Supabase CLI，準備共享程式並部署 bopli-sync（--use-api 不需 Docker）。
4. 填兩個前端公開設定並驗收。
5. GitHub 填兩個同名設定值，驗收後再合併／發布。

Free 額度有限，閒置一週可能暫停，超限可能限制服務。Free 不收費，但不能保證永久條款或無限服務。
匿名身份清除後沒有恢復流程；沒有 Google、完整離線編輯、自動 merge、網域購買或自動升級付費。

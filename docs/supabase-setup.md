# Bopli：0 元多人同步設定

目前使用 **GitHub Pages + Supabase Free**，原 Firebase/Blaze 步驟已作廢。
截至 2026-10-02，Supabase Free 是 US$0/月，官方明確表示 Free 不會收費。
不依賴學生額度、限時試用或付款方式。不要升級 Pro、啟用付費 add-on。
使用既有 github.io 網址，不購買網域。公開 repo 的 GitHub Actions 使用免費標準 runner；
若改 private，帳號 Actions 另有額度，請維持付費用量預算為 0。

## 你需要做的 5 件事

### 1. 建立免費專案

到 [Supabase Dashboard](https://supabase.com/dashboard) 登入（可用 GitHub），
建立 **Free organization** 與 `bopli-test` 專案。選鄰近台灣的免費地區，設定並自行保管資料庫密碼。
確認 Billing 顯示 **Free / $0**，不輸入付款方式、不加購。
若要求購買或綁卡，停止；那不是本文件指定的免費流程。

在 API/Connect 頁取得 Project URL、Publishable key（`sb_publishable_...`）、Project ref。
也支援舊版 `anon` key。
**service_role、sb_secret_、資料庫密碼與 access token 都不可放進前端、Git 或聊天中**。

### 2. 開啟匿名登入、執行 SQL

Authentication 設定啟用 **Anonymous Sign-Ins**。不需要 Google、Email 或 SMS 登入。
保持預設匿名註冊 rate limit，不刪除仍有帳務的匿名使用者。

在 SQL Editor 新查詢貼上 repo 的 `supabase/migrations/202610020001_sync.sql` **完整內容**，執行一次。
會建立資料表、indexes、交易 RPC、RLS，並加入既有 `supabase_realtime` publication。
不要開放直接寫入或關閉 RLS；若顯示已存在，先確認是否已成功執行，不刪除資料重跑。
在 Database / Replication（或 Realtime publication）確認 `bopli_documents` 已加入 `supabase_realtime`。

### 3. 部署免費後端

在 repo 目錄開啟終端，使用 Node 22+：

```powershell
npm ci
npm run backend:prepare
npx supabase@latest login
npx supabase@latest functions deploy bopli-sync --project-ref 你的PROJECT_REF --use-api
```

`--use-api` 不需 Docker。repo 已有 config，不要執行 init 覆蓋設定。
Supabase 自動提供後端 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`，不需複製私鑰到前端。
`verify_jwt=false` 關閉舊 gateway JWT 驗證，但 handler **仍透過 Auth.getUser 驗證每個使用者 token**。
不要只把 index.ts 貼入 Dashboard，因為 function 引用 repo 的共享帳務程式。

### 4. 填設定並驗收

```powershell
Copy-Item .env.example .env.local
```

編輯 `.env.local`：

```dotenv
VITE_SUPABASE_URL=https://你的PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=你的公開金鑰
VITE_BOPLI_MODE=cloud
```

重啟 `npm run dev`，用 Chrome 與 Edge 建立不同帳號：

1. A 建群組／邀請碼；B 用碼加入。
2. A 建活動／支出，B 應即時看到。
3. 開啟所有成員可編輯，兩人打開同筆支出。A 先存，B 過期版本應提示衝突。
4. 結算、記錄還款、收款人確認，不能超額或代別人確認。
5. 啟動離線不能進首頁；使用中離線出現 overlay；恢復後重新同步並保留原画面。

未設定或雲端不可用時停在連線画面是預期行為，不回退到本機帳本。

### 5. 設定 GitHub Pages

`jia0796/bopli` → Settings → Secrets and variables → Actions 建立兩個值，與 `.env.local` 相同：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

原 `VITE_FIREBASE_*` 不再使用。驗收後合併目前實作分支到 main，由既有 workflow 部署。
這次沒有建立 live project、合併 main 或發布網站。

## 免費的容量與可用性限制

目前 Free：最多 2 個 active projects、500 MB database、50,000 MAU、5 GB egress、
200 peak Realtime connections、2 million Realtime messages/月、500,000 Edge invocations/月。
閒置一週可能暫停，需進 Dashboard 恢復；超限可能限制服務，Free 不收取超額費用。
不代表永久無限容量，供應商可能調整未來條款。

心跳每 5 秒查小型群組 metadata，不消耗 Edge invocation；Realtime 只訂閱群組 epoch，
每 15 秒備援查詢，只有變更才讀帳本。不另建 keep-alive 迴避閒置暫停政策。
雲端不可用時保留 UI／草稿，阻擋正式寫入，不離線排隊帳務。

匿名註冊預設同一 IP 每小時 30 次，既有 session 不需每次重新註冊。
目前未串 CAPTCHA；不要單獨啟用 CAPTCHA 後期待前端直接通過。
可另接免費 Turnstile，但不在本次既有登入流程內。

## Migration 與測試

原 Firebase 未建立 live project，沒有遠端資料需搬遷。
若另有人已自行部署 Firebase 且有帳務，不可直接切換：需另做驗證後的匯入／身份重新綁定，
不能用新 Auth UID 替換歷史 Bopli ID。舊本機帳本不自動上傳、不清除。
本機只保留草稿/UI 與身份 session；清除身份或换裝置會產生新匿名帳號，第一版沒有身份恢復。

```powershell
npm test
npm run build
npm run test:e2e
npm run test:cloud
```

雲端測試不需 Java、Docker、雲端帳號或付款：實際 SQL migration/RLS/RPC 在 PGlite PostgreSQL 執行，
使用實際 domain/service/Edge handler。Playwright 使用 Supabase JS SDK，Auth/Realtime 平台協定由本機 harness 模擬。
**不代表已驗證 live Supabase**。PGlite 是嵌入式單連線，並行邏輯驗證 epoch CAS/revalidation；
正式多連線鎖與雲端 Realtime 尚需上述兩瀏覽器 live 驗收。

## 官方依據（2026-10-02）

- [Free 不收費](https://supabase.com/docs/guides/platform/cost-control)
- [額度與閒置暫停](https://supabase.com/pricing)
- [匿名登入與 rate limit](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Edge 部署](https://supabase.com/docs/guides/functions/deploy)
- [CLI --use-api](https://supabase.com/docs/reference/cli/supabase-functions-deploy)
- [Realtime/RLS](https://supabase.com/docs/guides/realtime/postgres-changes)

學生方案不是必要条件。Appwrite 已公告 Education 自 2026-11-01 執行六個月期限，
因此不依賴原優惠頁面的無期限說法：
[Appwrite 更新公告](https://appwrite.io/changelog/entry/2026-09-30)。

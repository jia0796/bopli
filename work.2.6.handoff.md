# Bopli — work.2.6.handoff.md

目標版本：**bopli_test.2.6**

Repository：

```text
https://github.com/jia0796/bopli
```

目標 branch：

```text
bopli_test.2.6
```

產品規格唯一來源：

```text
project.md
```

> 開始前必須完整閱讀 `project.md`。本 handoff 只整理執行重點，不得自行新增產品需求。

---

## 1. 任務原則

- 以目前 main / 2.5 實際程式狀態為基礎。
- 不因版本升級重寫帳務核心。
- 不新增 Google、自訂網域或照片上傳。多人 Firebase 同步基礎依 project.md 第 30 節本次明確範圍執行。
- 原預設保留資料；本次使用者明確要求清除 2.5（含）以前資料，優先採一次性清除，保留 2.6 與無關資料。其餘 schema 以前向 migration 處理。
- 既有 settlement snapshot、pending/disputed/confirmed、manual route 與歷史帳務 invariant 必須維持。
- 雲端模式不清除／自動上傳舊本機帳本；保留 internal IDs，authUid 只作身份綁定。

---

## 2. 2.6 UI 重點

### 我的頁

```text
我的

[頭像]  您好！{帳號名稱}
```

- 「我的」固定左上。
- 使用帳號名稱，不用群組暱稱。
- 帳號名稱已受 14 寬度單位限制，此處不另做 ellipsis。
- 點擊頭像入口可進入「我的」。
- 提供數個內建 Bopli 頭像可選。
- 不做自訂照片上傳。
- 更換頭像不得更動 userId 或任何歷史帳務關聯。

### 結算頁

順序基準：

```text
我的結算卡片
結算狀態 / 結算所有帳單
待我確認
我要付
我要收
已完成還款
分享
```

- 「結算所有帳單」放在我的結算卡片**下方**，不要塞進卡片內。
- 只有群主／副群主可操作。
- 既有 snapshot / repayment 保護規則全部依 `project.md`。
- 分享入口固定在結算頁內容最下方。

---

## 3. 分享 PNG 視覺

輸出固定：

```text
1500 × 2100 px
```

必須遵守：

- 個人／他人使用完全相同模板。
- 全部結算以淨應收者為區塊。
- 單頁最多 8 筆明細。
- 8 筆是上限；安全高度不足時可提前分頁。
- 不縮字、不壓行距、不拉高圖片。
- 群組／活動名稱過長依 rendered width 使用 trailing `…`。
- 左上群組小字、活動大字；右上 Bopli；左下時間；右下吉祥物；多頁有頁碼。
- 主金額最大、狀態次之。
- 人名左對齊，逐筆金額右對齊。
- 可用淡色卡片 + 細水平分隔線，不做 Excel 式重框線。
- pending / unpaid 必須視覺分區。
- 不可只靠紅綠顏色表達狀態。

品牌色沿用：

```text
#24334F
#F6A08B
#FFEAE2
#FFF9F5
```

預覽與選取仍依 project.md：
- horizontal swipe
- 預設全選
- 可取消
- 0 張時分享 disabled
- 僅輸出 selected PNG
- 不支援多檔原生分享時 fallback 下載 PNG

---

## 4. 開啟動畫

總長約 1.4 秒：

1. 中央第一隻吉祥物淡入。
2. 第二隻從右側跑入。
3. 兩隻輕碰，小幅軟彈。
4. `Bopli` + `朋友分帳管家` 淡入。
5. 品牌畫面淡出，首頁同步淡入。

限制：
- 不旋轉、不震動、不做粒子／金幣。
- 吉祥物不可變成字母 b。
- 只在 App/PWA 真正啟動或完整 reload 播放。
- 頁內導航與背景切回不播放。
- `prefers-reduced-motion` 時只用淡入淡出。
- 品牌動畫不可冒充 loading；真正資料未完成仍要顯示 loading。

---

## 5. 既有 2.5 規格不可回歸

依 `project.md` 驗證：

- settlement snapshot 才能建立新 repayment。
- snapshot dirty 只禁止新 repayment，既有 pending/disputed 仍可處理。
- 沒有相關還款的支出仍可編輯。
- 有相關 pending/disputed/confirmed 的支出不可直接編輯／刪除。
- 編輯看似 unrelated expense 後仍要驗證 repayment invariants。
- account name / group nickname = 14 display-width units。
- expense total max = 1,000,000,000，輸入階段即阻擋。
- draft delete = × + confirm。
- placeholder 文案依 project.md。
- 空活動 ≠ 已結清。

---

## 6. 測試重點

至少補：

### Unit / component
- avatar selection changes display only, preserves user/account IDs
- account greeting uses account name
- settlement action placement/state
- PNG canvas/export dimension exactly 1500×2100
- max 8 rows
- early page break on safe-height overflow
- pending/unpaid visual sections
- rendered-width ellipsis for group/activity names
- share selection state preserved across swipe

### Mobile E2E
- open My page via avatar
- My title is top-left
- greeting renders `您好！{帳號名稱}`
- choose built-in avatar and persist across reload
- settlement button directly below personal settlement card
- share block appears at settlement page bottom
- personal / other / all share previews
- swipe multi-page preview and deselect selected pages
- startup animation once on full load
- route navigation does not replay animation
- reduced-motion path has no running/collision movement

---

## 7. 完成前

以 repo 實際 scripts 為準，至少執行：

```bash
npm ci
npm run build
npm test
```

以及既有 Playwright mobile E2E。

多人同步另執行 `npm ci --prefix functions`、`npm run test:cloud`（需 Java 21+），依 project.md 第 30 節驗證離線阻擋／恢復、邀請、双 client 同步、revision conflict 與 transaction overpay。Firebase live project 未設定／部署時如實回報，setup 步驟見 docs/firebase-setup.md。

不要在失敗時 merge，也不要聲稱 Pages 已部署，除非實際驗證。

---

## 8. 完成報告

回報：

- 版本
- 主要變更
- migration 行為
- accounting invariant 驗證
- unit / E2E / build 結果
- commit SHA
- PR / merge SHA（若有）
- Actions 狀態
- Pages 狀態（若有）
- 已知限制


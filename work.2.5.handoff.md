# Bopli — work.2.5.handoff.md

目標版本：**bopli_test.2.5**

Repository：

```text
https://github.com/jia0796/bopli
```

目標 branch：

```text
bopli_test.2.5
```

產品規格唯一來源：

```text
project.md
```

> 不要只依這份 handoff 猜產品行為。開始前先完整閱讀 `project.md`。

---

## 1. 任務目標

在既有 2.4 基礎上完成 2.5，重點：

- 結算批次 / 「結算所有帳單」
- 與還款紀錄相關的精準支出鎖定
- PNG 結算分享
- 名稱長度限制
- 支出金額輸入上限
- placeholder 文案
- 草稿刪除入口

不要重寫既有帳務核心，不要破壞 2.4 已有 settlement/manual route/pending confirmation 邏輯。

---

## 2. 開始前

先執行：

```bash
npm ci
npm run build
npm test
```

並閱讀：

```text
project.md
README.md
src/App.jsx
src/lib/store.js
src/lib/money.js
src/lib/ledger.js
src/lib/domain.js
src/lib/lifecycle.js
src/components/ExpenseViews.jsx
src/components/SecondaryScreens.jsx
src/styles.css
```

確認目前 branch 真實狀態後再修改。

---

## 3. 結算批次

### 未結算

- 結算按鈕可按、原本顏色。
- 不能建立新的還款紀錄。
- 尚未受付款保護的支出可編輯。

### 已建立 settlement snapshot

群主／副群主按下後：

- 建立快照。
- 按鈕變灰 disabled。
- 開放還款。

### 帳務再變動

新增、修改、刪除任何仍可編輯支出：

- 當前 snapshot 失效。
- 結算按鈕恢復可按。
- 關閉新的還款入口。
- 已有 pending/disputed/confirmed 不得消失或重算改道。
- 只禁止建立新的 repayment；既有 pending 的確認／爭議處理仍必須可操作。
- 手動結算路線、尾差等任何會改變 settlement result 的操作，也要使 snapshot dirty。

---

## 4. 支出鎖定

禁止使用：

```text
activity has any repayment => lock all expenses
```

也禁止：

```text
expense was once included in a gray settlement state => permanent lock
```

正確規則：

- 沒有相關 repayment：仍可編輯。
- 有與該支出相關的 pending/disputed/confirmed repayment：不可編輯／刪除。
- 關聯依 settlement snapshot/accounting basis 判斷。
- 若支出對 repayment 的 payer 或 recipient 淨額有非零影響，視為相關。
- 完全不影響該 repayment parties 淨額的支出不應被誤鎖。

必測：

```text
A 欠 B 500
C 欠 A 300
=> A → B 200
```

第二筆雖沒有 B，仍影響 A 淨額，必須受保護。

處理 disputed/cancelled 時，只有在沒有其他 repayment 仍引用該 accounting basis 時才可解除該來源的 lock；audit 仍保留。

對「目前與舊 repayment 無關」且仍可編輯的 expense，儲存修改前必須重新驗證歷史 repayment invariants。若修改會造成既有 pending/disputed/confirmed overpay、負 remaining balance 或其他不一致，阻擋直接修改，要求用 adjustment/correction expense。

---

## 5. 分享入口

結算頁新增：

```text
分享
```

不可：

- 塞到右上角
- 增加底部第四個 nav tab

選單：

```text
個人結算表分享
他人結算表分享
全部結算表分享
```

所有活動成員都可使用。

---

## 6. 個人 PNG

模板固定：

- 左上小字：群組名稱
- 左上大字：活動名稱
- 右上：Bopli
- 中央：成員結算
- 左下：`YYYY.MM.DD HH:mm`，24h local time
- 右下：Bopli 吉祥物
- 多頁：頁碼

每張最多 8 筆「人名 + 金額」明細。

不可為了塞內容縮字、縮行距、拉高圖片或移動固定品牌元素。

pending 與 unpaid 必須分開。

明細只顯示：

```text
小安    NT$500
```

不要顯示「小安 → 我」。

---

## 7. 他人 PNG

先選一位活動成員，再用**完全相同的個人模板**產生。

不要建立另一套他人模板。

---

## 8. 全部 PNG

依淨應收者分區，例如：

```text
小安 的結算
還要收 NT$900

Cayden   NT$500
阿哲     NT$400
```

多位應收者依序合併。

若固定模板塞不下：

- 開新頁。
- 跨頁時重複收款人區塊標題。
- 8 筆是硬上限；若多個標題造成空間不足，可提早換頁。
- 不得壓縮版面。

---

## 9. 分享預覽

生成 PNG 後：

- 水平 swipe carousel。
- 預設全部 selected。
- 每張可勾選／取消。
- swipe 不改 selected state。
- 顯示「已選擇 x / y 張」。
- 0 張時分享 disabled。
- 按「分享」只輸出 selected PNG。
- 優先使用 Web Share / 系統 share sheet 傳送 selected PNG files。
- 若瀏覽器不支援多檔分享，fallback 為下載 selected PNG。
- 不保證不同 OS 出現相同「儲存頁面」；不要把特定原生 UI 寫死。
- 不支援時不要另做公開 URL。

預覽不是 editor。

---

## 10. 分享圖長名稱

群組名稱、活動名稱：

- 單行。
- 依實際 rendered width 判斷。
- 超出使用 trailing「…」。
- 不改原資料。
- 不換行、不縮字、不推動 Logo。

---

## 11. 名稱限制

適用 account/user name 與 group nickname。

上限 14 display-width units：

- CJK/full-width：2
- ASCII letters/digits/half-width punctuation/space：1
- full-width punctuation：2
- emoji/grapheme：2

使用 Unicode grapheme segmentation，不可直接用 JS `string.length`。

超過：

```text
名稱太長了，請縮短一些
```

並禁止儲存。

2.4 legacy data 若已有 >14 units 的名稱，不可在 migration 自動截斷；只有新建／再次修改時強制新規則。

---

## 12. 金額限制

支出金額 max：

```text
1_000_000_000
```

大於上限：

- key input / paste 都不可寫入非法值。
- 保留上一個合法值。
- 顯示：

```text
超過金額上限
```

儲存/domain 層仍再次驗證。限制的是單筆 expense 最終總額；任何能直接設定或推導該總額的輸入流程都要遵守。

---

## 13. 文案

```text
初次名稱：例如：Bolip
建立群組：例如：大學好友
建立活動：例如：週末聚會
支出名稱：例如：晚餐、停車費（維持）
特殊商品：例如：特定商品、私人物品
```

---

## 14. 草稿

```text
…  ->  ×
```

按 × 後：

```text
刪除這份草稿？
刪除後無法復原。
取消 | 刪除
```

---

## 15. Store / migration

2.5 不應無故清除 2.4 資料。

若需要 schema migration：

- 向前 migrate 已知 2.4 state。
- 不使用「升級就 reset」簡化。
- 增加 migration test。
- 保留 repayment / audit / manual settlement data。

---

## 16. 測試要求

至少覆蓋：

### domain/unit

- settlement snapshot validity
- editable expense invalidates snapshot
- no repayment => previously settled expense remains editable
- unrelated repayment does not lock unrelated expense
- repayment party net dependency does lock expense
- pending/confirmed preserve history
- name width 14 boundary
- grapheme/emoji counting
- amount exactly 1,000,000,000 allowed
- > 1,000,000,000 rejected
- paste overflow rejected
- share pagination 8 rows
- share pagination with multiple receiver headers
- native multi-file share unsupported -> download fallback
- ellipsis width handling

### mobile E2E

- settle button active -> gray -> repayment enabled
- gray state has text/status cue, not color-only
- snapshot dirty blocks only new repayment; existing pending remains confirmable
- add/edit expense -> active again -> repayment disabled
- re-settle -> enabled
- share personal
- choose other member -> same template
- share all
- swipe pages
- deselect page
- selected PNG count
- zero selection disables share
- draft delete confirmation

---

## 17. 驗收

完成前：

```bash
npm run build
npm test
```

並執行既有 Playwright mobile E2E。

若 scripts 名稱不同，以 repo 實際 scripts 為準。

不要在測試失敗時直接 merge。

---

## 18. 完成報告

回報：

- 實作版本
- 主要變更
- accounting edge cases 如何處理
- migration 行為
- unit test 結果
- Playwright 結果
- build 結果
- commit SHA
- PR / merge SHA（若有）
- GitHub Actions 狀態
- Pages 狀態（若有部署）
- 尚有限制／已知問題

不要聲稱已部署或已通過測試，除非已實際驗證。

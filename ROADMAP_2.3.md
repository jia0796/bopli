# bopli_test.2.3 Roadmap

## 版本原則

- 基底：bopli_test.2.2
- 2.3 不刪除 2.2 資料。
- 開發分支：`bopli_test.2.3`
- `main` 保持 2.2，直到 2.3 驗證完成後才考慮合併。

## 本輪已新增

### 1. 版本管理
- package：`2.3.0-test`
- UI label：`bopli_test.2.3`
- store schema：23
- 集中於 `src/version.js`

### 2. localStorage
- 2.3 使用新 key：`bopli-test-2.3-v1`
- 第一次載入若沒有 2.3 資料，依序讀取 2.2 / 2.1.1 / 2.1 可用資料。
- migration 只複製資料，不刪除、不覆寫舊 key。
- 若已有 2.3 資料，永遠優先使用 2.3。

### 3. App.jsx 拆分
- `AppPrimitives.jsx`：EmptyState、ConfirmModal、PersonAvatar、SwipeMemberRow。
- `SecondaryScreens.jsx`：通知、我的、群組、成員、活動設定等次要畫面。
- 後續再拆 modal 與 activity tabs，避免一次性重構造成回歸。

### 4. UI 自動測試
- 保留原本 Node `node:test` 帳務測試。
- 新增 Vitest + jsdom + Testing Library。
- 首批覆蓋：
  - 危險操作需明確確認。
  - 空狀態不應誤顯示「目前已結清」。
  - 2.2 → 2.3 資料 migration 保留舊 key。
  - 既有 2.3 資料優先於 legacy。

### 5. 已順手修正
- 0 筆支出：顯示「尚未開始記帳」，不再視為已結清。
- 首頁群組沒有待處理時改為「目前無待處理」，避免把沒有帳目等同已結清。
- 通知／我的頁不再額外渲染空白 app header。

## 尚未在本輪處理

- 活動永久刪除。
- 群組永久刪除。
- 14 人旅行 + 中途加人/退出 + 第二群組獨立的完整 E2E 壓力測試。
- App.jsx 進一步拆出 modal、activity tabs、state/actions。
- Firestore / Authentication 正式後端化。

## 合併門檻

1. 既有 domain tests 全過。
2. 2.3 UI/migration tests 全過。
3. Vite build 成功。
4. 手動確認 2.2 localStorage 升級後舊資料仍存在。
5. 完成 14 人雙群組壓力測試後，再評估合併 main。

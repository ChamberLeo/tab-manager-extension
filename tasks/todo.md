# Tab Manager Extension - 開發計畫

## 目標

建立一個 Chrome 擴充功能，讓使用者可以透過彈出視窗查看所有分頁，並將分頁手動分組、命名，摺疊群組後讓分頁列保持乾淨。

## 開發項目

### 第一階段：基礎架構

- [x] 1. 建立 `manifest.json`（Manifest V3，宣告權限：tabs、tabGroups）
- [x] 2. 建立 `popup.html` — 彈出視窗的 HTML 骨架
- [x] 3. 建立 `popup.css` — 基本樣式（分頁清單、勾選框、按鈕）
- [x] 4. 建立 `popup.js` — 彈出視窗的核心邏輯

### 第二階段：核心功能

- [x] 5. 實作「列出所有分頁」— 使用 `chrome.tabs.query()` 取得所有分頁，顯示 favicon + 標題
- [x] 6. 實作「勾選分頁」— 每個分頁前加 checkbox，支援多選
- [x] 7. 實作「建立群組」— 輸入群組名稱 + 選擇顏色 → 呼叫 `chrome.tabs.group()` + `chrome.tabGroups.update()`
- [x] 8. 實作「摺疊群組」— 建立群組後自動摺疊，讓分頁列變乾淨

### 第三階段：群組管理

- [x] 9. 顯示現有群組清單 — 使用 `chrome.tabGroups.query()` 列出已建立的群組
- [x] 10. 實作「解散群組」— 將群組內分頁取消群組 (`chrome.tabs.ungroup()`)
- [x] 11. 實作「展開/摺疊群組」切換按鈕

### 第四階段：圖示與收尾

- [x] 12. 製作擴充功能圖示（16x16、48x48、128x128）
- [ ] 13. 整體測試與修正

---

## 最終檔案結構

```
tab-manager-extension/
├── manifest.json
├── popup.html
├── popup.js
├── popup.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── tasks/
│   └── todo.md
└── claude.md
```

### 第五階段：空群組建立 + 拖曳分頁至群組

- [x] 14. manifest.json：加入 `storage` 權限
- [x] 15. popup.js：新增 pendingGroups 狀態與 storage 讀寫
- [x] 16. popup.js：修改 createGroup() 允許建立空群組（只需名稱）
- [x] 17. popup.js：修改 updateCreateButtonState() 只檢查名稱
- [x] 18. popup.js：修改 loadGroups() 同時顯示 Chrome 群組 + 待用群組
- [x] 19. popup.js：在 loadTabs() 中加上 draggable 與 dragstart 事件
- [x] 20. popup.js：在群組項目上綁定 dragover/dragenter/dragleave/drop 事件
- [x] 21. popup.css：新增拖曳相關樣式（dragging、drag-over、drag-ghost）
- [x] 22. popup.html：移除建立按鈕的 disabled 預設屬性

## Review

### 第五階段變更摘要

**修改了 4 個檔案：**

1. **manifest.json** — 新增 `storage` 權限，用於持久化待用群組資料。

2. **popup.html** — 移除建立按鈕的 `disabled` 預設屬性，改由 JS 動態控制（只檢查名稱）。

3. **popup.css** — 新增 4 個樣式：
   - `.tab-item.dragging`：拖曳中分頁半透明
   - `.group-item.drag-over`：群組被 hover 時藍色邊框 + 淺藍背景
   - `.drag-ghost`：自訂拖曳提示（藍色膠囊）
   - `.group-item.pending .group-tab-count`：待用群組的斜體灰色標示

4. **popup.js** — 主要邏輯改動：
   - 新增 `pendingGroups` / `draggedTabIds` 狀態
   - 新增 `loadPendingGroups()` / `savePendingGroups()` 讀寫 storage
   - `createGroup()`：有勾選分頁時建立 Chrome 群組，無勾選時建立待用群組
   - `updateCreateButtonState()`：只檢查名稱，不再要求勾選分頁
   - `loadGroups()`：同時渲染 Chrome 群組 + 待用群組，待用群組支援刪除按鈕
   - `loadTabs()`：每個分頁加上 `draggable`，`dragstart` 時判斷是否拖曳多個已勾選分頁
   - 新增 `bindGroupDragEvents()` 統一處理群組項目的 dragover/dragenter/dragleave/drop
   - drop 到 Chrome 群組 → `chrome.tabs.group({tabIds, groupId})`
   - drop 到待用群組 → 建立新 Chrome 群組 + 設定名稱顏色 + 從 pendingGroups 移除

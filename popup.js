// ===== 狀態 =====
let selectedColor = "blue";
let selectedTabIds = new Set();
let pendingGroups = [];       // 待用群組（尚未真正建立的群組）
let draggedTabIds = [];       // 正在拖曳的 tabId 清單

// ===== DOM 元素 =====
const groupNameInput = document.getElementById("group-name");
const btnCreateGroup = document.getElementById("btn-create-group");
const colorPicker = document.getElementById("color-picker");
const tabsList = document.getElementById("tabs-list");
const groupsList = document.getElementById("groups-list");
const tabCount = document.getElementById("tab-count");
const btnSelectAll = document.getElementById("btn-select-all");
const btnDeselectAll = document.getElementById("btn-deselect-all");

// ===== 顏色對應表 =====
const COLOR_MAP = {
  blue: "#1a73e8",
  red: "#d93025",
  yellow: "#f9ab00",
  green: "#188038",
  pink: "#d01884",
  purple: "#a142f4",
  cyan: "#007b83",
  orange: "#e8710a",
};

// ===== 待用群組 Storage =====
async function loadPendingGroups() {
  if (!chrome.storage?.local) return;
  const data = await chrome.storage.local.get("pendingGroups");
  pendingGroups = data.pendingGroups || [];
}

async function savePendingGroups() {
  if (!chrome.storage?.local) return;
  await chrome.storage.local.set({ pendingGroups });
}

// ===== 初始化 =====
document.addEventListener("DOMContentLoaded", async () => {
  await loadPendingGroups();
  loadTabs();
  loadGroups();
  bindEvents();
  updateCreateButtonState();
});

// ===== 事件綁定 =====
function bindEvents() {
  // 顏色選擇
  colorPicker.addEventListener("click", (e) => {
    const dot = e.target.closest(".color-dot");
    if (!dot) return;
    colorPicker
      .querySelectorAll(".color-dot")
      .forEach((d) => d.classList.remove("selected"));
    dot.classList.add("selected");
    selectedColor = dot.dataset.color;
  });

  // 群組名稱輸入 → 控制按鈕啟用
  groupNameInput.addEventListener("input", updateCreateButtonState);

  // 建立群組
  btnCreateGroup.addEventListener("click", createGroup);

  // 全選 / 取消全選
  btnSelectAll.addEventListener("click", () => toggleAllTabs(true));
  btnDeselectAll.addEventListener("click", () => toggleAllTabs(false));
}

// ===== 載入所有分頁 =====
async function loadTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  tabsList.innerHTML = "";
  tabCount.textContent = tabs.length;

  tabs.forEach((tab) => {
    // 跳過已在群組中的分頁
    if (tab.groupId && tab.groupId !== -1) return;

    const item = document.createElement("div");
    item.className = "tab-item";
    item.draggable = true;
    item.dataset.tabId = tab.id;
    item.innerHTML = `
      <input type="checkbox" data-tab-id="${tab.id}">
      <img src="${tab.favIconUrl || "icons/icon16.png"}" alt="">
      <span class="tab-title ${tab.active ? "active-tab" : ""}">${escapeHtml(tab.title)}</span>
    `;

    const checkbox = item.querySelector("input[type='checkbox']");
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedTabIds.add(tab.id);
      } else {
        selectedTabIds.delete(tab.id);
      }
      updateCreateButtonState();
    });

    // 點擊整行也能切換勾選
    item.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });

    // 拖曳開始
    item.addEventListener("dragstart", (e) => {
      // 如果拖曳的分頁已勾選，拖曳所有已勾選的分頁；否則只拖曳這一個
      if (selectedTabIds.has(tab.id) && selectedTabIds.size > 1) {
        draggedTabIds = Array.from(selectedTabIds);
      } else {
        draggedTabIds = [tab.id];
      }
      item.classList.add("dragging");

      // 自訂 drag image
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.textContent = draggedTabIds.length === 1
        ? escapeHtml(tab.title).substring(0, 30)
        : `${draggedTabIds.length} 個分頁`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      // 移除 ghost 元素（下一幀後）
      requestAnimationFrame(() => ghost.remove());

      e.dataTransfer.effectAllowed = "move";
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
    });

    tabsList.appendChild(item);
  });

  // 更新未分組的分頁數量
  const ungroupedCount = tabsList.querySelectorAll(".tab-item").length;
  tabCount.textContent = ungroupedCount;
}

// ===== 群組項目的拖曳事件綁定 =====
function bindGroupDragEvents(item, dropHandler) {
  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  item.addEventListener("dragenter", (e) => {
    e.preventDefault();
    item.classList.add("drag-over");
  });

  item.addEventListener("dragleave", (e) => {
    // 只在真正離開群組項目時移除 class
    if (!item.contains(e.relatedTarget)) {
      item.classList.remove("drag-over");
    }
  });

  item.addEventListener("drop", async (e) => {
    e.preventDefault();
    item.classList.remove("drag-over");
    if (draggedTabIds.length === 0) return;
    await dropHandler();
    draggedTabIds = [];
    loadTabs();
    loadGroups();
  });
}

// ===== 載入現有群組 =====
async function loadGroups() {
  const groups = await chrome.tabGroups.query({
    windowId: chrome.windows.WINDOW_ID_CURRENT,
  });
  groupsList.innerHTML = "";

  if (groups.length === 0 && pendingGroups.length === 0) {
    groupsList.innerHTML = '<p class="empty-msg">尚無群組</p>';
    return;
  }

  // Chrome 群組
  for (const group of groups) {
    const tabs = await chrome.tabs.query({ groupId: group.id });
    const item = document.createElement("div");
    item.className = "group-item";
    item.innerHTML = `
      <div class="group-info">
        <span class="group-color-dot" style="background:${COLOR_MAP[group.color] || "#5f6368"}"></span>
        <span class="group-title">${escapeHtml(group.title || "未命名")}</span>
        <span class="group-tab-count">(${tabs.length} 個分頁)</span>
      </div>
      <div class="group-actions">
        <button class="btn-toggle" data-group-id="${group.id}" data-collapsed="${group.collapsed}">
          ${group.collapsed ? "展開" : "摺疊"}
        </button>
        <button class="btn-danger btn-ungroup" data-group-id="${group.id}">解散</button>
      </div>
    `;

    // 展開 / 摺疊
    item.querySelector(".btn-toggle").addEventListener("click", async (e) => {
      const groupId = Number(e.target.dataset.groupId);
      const isCollapsed = e.target.dataset.collapsed === "true";
      await chrome.tabGroups.update(groupId, { collapsed: !isCollapsed });
      loadGroups();
    });

    // 解散群組
    item.querySelector(".btn-ungroup").addEventListener("click", async (e) => {
      const groupId = Number(e.target.dataset.groupId);
      const groupTabs = await chrome.tabs.query({ groupId });
      for (const t of groupTabs) {
        await chrome.tabs.ungroup(t.id);
      }
      loadGroups();
      loadTabs();
    });

    // 拖曳放入 Chrome 群組
    bindGroupDragEvents(item, async () => {
      await chrome.tabs.group({ tabIds: draggedTabIds, groupId: group.id });
    });

    groupsList.appendChild(item);
  }

  // 待用群組
  for (const pg of pendingGroups) {
    const item = document.createElement("div");
    item.className = "group-item pending";
    item.innerHTML = `
      <div class="group-info">
        <span class="group-color-dot" style="background:${COLOR_MAP[pg.color] || "#5f6368"}"></span>
        <span class="group-title">${escapeHtml(pg.name)}</span>
        <span class="group-tab-count">(待用)</span>
      </div>
      <div class="group-actions">
        <button class="btn-danger btn-delete-pending" data-pending-id="${pg.id}">刪除</button>
      </div>
    `;

    // 刪除待用群組
    item.querySelector(".btn-delete-pending").addEventListener("click", async () => {
      pendingGroups = pendingGroups.filter((g) => g.id !== pg.id);
      await savePendingGroups();
      loadGroups();
    });

    // 拖曳放入待用群組 → 真正建立 Chrome 群組
    bindGroupDragEvents(item, async () => {
      const newGroupId = await chrome.tabs.group({ tabIds: draggedTabIds });
      await chrome.tabGroups.update(newGroupId, {
        title: pg.name,
        color: pg.color,
        collapsed: true,
      });
      // 移除待用群組
      pendingGroups = pendingGroups.filter((g) => g.id !== pg.id);
      await savePendingGroups();
    });

    groupsList.appendChild(item);
  }
}

// ===== 建立群組 =====
async function createGroup() {
  const name = groupNameInput.value.trim();
  if (!name) return;

  if (selectedTabIds.size > 0) {
    // 有勾選分頁 → 直接建立 Chrome 群組
    const tabIds = Array.from(selectedTabIds);
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, {
      title: name,
      color: selectedColor,
      collapsed: true,
    });
    selectedTabIds.clear();
  } else {
    // 沒有勾選分頁 → 建立待用群組
    pendingGroups.push({
      id: Date.now().toString(),
      name,
      color: selectedColor,
    });
    await savePendingGroups();
  }

  // 重設狀態
  groupNameInput.value = "";
  updateCreateButtonState();

  // 重新載入畫面
  loadTabs();
  loadGroups();
}

// ===== 全選 / 取消全選 =====
function toggleAllTabs(checked) {
  const checkboxes = tabsList.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach((cb) => {
    cb.checked = checked;
    const tabId = Number(cb.dataset.tabId);
    if (checked) {
      selectedTabIds.add(tabId);
    } else {
      selectedTabIds.delete(tabId);
    }
  });
  updateCreateButtonState();
}

// ===== 更新建立按鈕狀態 =====
function updateCreateButtonState() {
  const hasName = groupNameInput.value.trim().length > 0;
  btnCreateGroup.disabled = !hasName;
}

// ===== HTML 跳脫 =====
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

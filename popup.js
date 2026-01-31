// ===== State =====
let selectedTabIds = new Set();
let draggedTabIds = [];       // Tab IDs being dragged
let activeColorPopup = null;  // Currently open color popup

// ===== DOM Elements =====
const tabsList = document.getElementById("tabs-list");
const groupsList = document.getElementById("groups-list");
const tabCount = document.getElementById("tab-count");
const btnSelectAll = document.getElementById("btn-select-all");
const btnDeselectAll = document.getElementById("btn-deselect-all");
const themeToggle = document.getElementById("theme-toggle");

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

// ===== Initialize =====
document.addEventListener("DOMContentLoaded", () => {
  loadTheme();
  loadTabs();
  loadGroups();
  bindEvents();
});

// ===== Event Bindings =====
function bindEvents() {
  // Select all / Deselect all
  btnSelectAll.addEventListener("click", () => toggleAllTabs(true));
  btnDeselectAll.addEventListener("click", () => toggleAllTabs(false));

  // Theme toggle
  themeToggle.addEventListener("click", toggleTheme);

  // Close color popup when clicking outside
  document.addEventListener("click", (e) => {
    if (activeColorPopup && !activeColorPopup.contains(e.target) && !e.target.classList.contains("group-color-dot")) {
      closeColorPopup();
    }
  });
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
      <span class="drag-handle">::</span>
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
    });

    // 點擊整行也能切換勾選（但不包括拖曳手把）
    item.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.target.classList.contains("drag-handle")) return;
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
        : `${draggedTabIds.length} tabs`;
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

  if (groups.length === 0) {
    groupsList.innerHTML = '<p class="empty-msg">No groups yet</p>';
    // Still add drop hint even when no groups
  }

  // Chrome 群組
  for (const group of groups) {
    const tabs = await chrome.tabs.query({ groupId: group.id });
    const item = document.createElement("div");
    item.className = "group-item";
    item.innerHTML = `
      <div class="group-info">
        <span class="group-color-dot clickable" data-group-id="${group.id}" data-current-color="${group.color}" style="background:${COLOR_MAP[group.color] || "#5f6368"}"></span>
        <span class="group-title">${escapeHtml(group.title || "Untitled")}</span>
        <span class="group-tab-count">(${tabs.length} tabs)</span>
      </div>
      <div class="group-actions">
        <button class="btn-toggle" data-group-id="${group.id}" data-collapsed="${group.collapsed}">
          ${group.collapsed ? "Expand" : "Collapse"}
        </button>
        <button class="btn-danger btn-ungroup" data-group-id="${group.id}">Ungroup</button>
      </div>
    `;

    // 點擊色點 → 彈出顏色選擇器
    const colorDot = item.querySelector(".group-color-dot");
    colorDot.addEventListener("click", (e) => {
      e.stopPropagation();
      showColorPopup(colorDot, group.color, async (newColor) => {
        await chrome.tabGroups.update(group.id, { color: newColor });
        loadGroups();
      });
    });

    // 雙擊名稱 → 編輯模式
    const titleEl = item.querySelector(".group-title");
    titleEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startEditGroupTitle(titleEl, group.title || "", async (newTitle) => {
        await chrome.tabGroups.update(group.id, { title: newTitle });
        loadGroups();
      });
    });

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

  // Drop zone hint
  const dropHint = document.createElement("div");
  dropHint.className = "drop-zone-hint";
  dropHint.textContent = ":: Drop tabs here ::";

  // Drop zone drag events
  dropHint.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  dropHint.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dropHint.classList.add("drag-over");
  });

  dropHint.addEventListener("dragleave", (e) => {
    if (!dropHint.contains(e.relatedTarget)) {
      dropHint.classList.remove("drag-over");
    }
  });

  dropHint.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropHint.classList.remove("drag-over");
    if (draggedTabIds.length === 0) return;

    // Create new group with dropped tabs
    const groupId = await chrome.tabs.group({ tabIds: draggedTabIds });
    await chrome.tabGroups.update(groupId, {
      title: "New Group",
      color: "blue",
      collapsed: true,
    });

    draggedTabIds = [];
    loadTabs();
    loadGroups();
  });

  groupsList.appendChild(dropHint);
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
}

// ===== HTML 跳脫 =====
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ===== 彈出式顏色選擇器 =====
function showColorPopup(anchorEl, currentColor, onSelect) {
  // 先關閉舊的
  closeColorPopup();

  const popup = document.createElement("div");
  popup.className = "color-popup";

  // 8 種顏色選項
  const colors = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
  colors.forEach((color) => {
    const option = document.createElement("span");
    option.className = "color-option" + (color === currentColor ? " selected" : "");
    option.style.background = COLOR_MAP[color];
    option.dataset.color = color;
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      closeColorPopup();
      if (color !== currentColor) {
        onSelect(color);
      }
    });
    popup.appendChild(option);
  });

  // 定位在色點附近
  document.body.appendChild(popup);
  const anchorRect = anchorEl.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();

  // 預設顯示在色點右側，如果超出視窗則顯示在左側
  let left = anchorRect.right + 8;
  if (left + popupRect.width > window.innerWidth) {
    left = anchorRect.left - popupRect.width - 8;
  }

  // 垂直置中對齊
  let top = anchorRect.top + (anchorRect.height / 2) - (popupRect.height / 2);
  if (top < 0) top = 4;
  if (top + popupRect.height > window.innerHeight) {
    top = window.innerHeight - popupRect.height - 4;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  activeColorPopup = popup;
}

function closeColorPopup() {
  if (activeColorPopup) {
    activeColorPopup.remove();
    activeColorPopup = null;
  }
}

// ===== 群組名稱編輯 =====
function startEditGroupTitle(titleEl, currentTitle, onSave) {
  // 建立輸入框
  const input = document.createElement("input");
  input.type = "text";
  input.className = "group-title-input";
  input.value = currentTitle;

  // 取代原本的標題元素
  titleEl.style.display = "none";
  titleEl.parentNode.insertBefore(input, titleEl.nextSibling);
  input.focus();
  input.select();

  let saved = false;

  const save = () => {
    if (saved) return;
    saved = true;
    const newTitle = input.value.trim();
    input.remove();
    titleEl.style.display = "";
    if (newTitle && newTitle !== currentTitle) {
      onSave(newTitle);
    }
  };

  const cancel = () => {
    if (saved) return;
    saved = true;
    input.remove();
    titleEl.style.display = "";
  };

  // Enter 儲存，Esc 取消
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  // Save on blur
  input.addEventListener("blur", save);
}

// ===== Theme Toggle =====
function loadTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute("data-theme") || "light";
  const newTheme = currentTheme === "light" ? "dark" : "light";
  document.body.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  themeToggle.textContent = theme === "light" ? "☀" : "☾";
}

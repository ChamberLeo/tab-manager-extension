// ===== State =====
let selectedTabIds = new Set();
let draggedTabIds = []; // Tab IDs being dragged
let activeColorPopup = null; // Currently open color popup

// ===== DOM Elements =====
const tabsList = document.getElementById("tabs-list");
const groupsList = document.getElementById("groups-list");
const savedGroupsList = document.getElementById("saved-groups-list");
const tabCount = document.getElementById("tab-count");
const savedCount = document.getElementById("saved-count");
const btnSelectAll = document.getElementById("btn-select-all");
const btnDeselectAll = document.getElementById("btn-deselect-all");
const btnExport = document.getElementById("btn-export");
const btnImport = document.getElementById("btn-import");
const importFile = document.getElementById("import-file");
const themeToggle = document.getElementById("theme-toggle");
const tabNavBtns = document.querySelectorAll(".tab-nav-btn");
const tabContents = document.querySelectorAll(".tab-content");
const pixelModal = document.getElementById("pixel-modal");
const pixelModalMessage = document.getElementById("pixel-modal-message");
const pixelModalOk = document.getElementById("pixel-modal-ok");

// ===== 常數設定 =====
const CONFIG = {
  MAX_GROUP_TITLE_LENGTH: 30,
  MAX_DRAG_TITLE_LENGTH: 30,
  DEFAULT_ICON: "icons/icon16.png",
  ALLOWED_PROTOCOLS: ["http:", "https:", "chrome:", "chrome-extension:"],
  MAX_SHARE_URL_LENGTH: 1800, // 安全的 URL 長度限制
  MAX_STORAGE_BYTES: 5 * 1024 * 1024, // 5MB storage limit
  STORAGE_WARNING_THRESHOLD: 0.8, // Warn at 80% usage
};

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

// ===== 安全性：驗證 favicon URL =====
function sanitizeFavIconUrl(url) {
  if (!url) return CONFIG.DEFAULT_ICON;
  try {
    const parsedUrl = new URL(url);
    if (!CONFIG.ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
      return CONFIG.DEFAULT_ICON;
    }
    return url;
  } catch (e) {
    return CONFIG.DEFAULT_ICON;
  }
}

// ===== Initialize =====
document.addEventListener("DOMContentLoaded", () => {
  loadTheme();
  loadTabs();
  loadGroups();
  loadSavedGroups();
  bindEvents();
});

// ===== Event Bindings =====
function bindEvents() {
  // Select all / Deselect all
  btnSelectAll.addEventListener("click", () => toggleAllTabs(true));
  btnDeselectAll.addEventListener("click", () => toggleAllTabs(false));

  // Theme toggle
  themeToggle.addEventListener("click", toggleTheme);

  // Tab navigation
  tabNavBtns.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Export / Import
  btnExport.addEventListener("click", exportSavedGroups);
  btnImport.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", handleImportFile);

  // Close color popup when clicking outside
  document.addEventListener("click", (e) => {
    if (
      activeColorPopup &&
      !activeColorPopup.contains(e.target) &&
      !e.target.classList.contains("group-color-dot")
    ) {
      closeColorPopup();
    }
  });

  // Pixel modal OK button
  pixelModalOk.addEventListener("click", hidePixelModal);

  // Keyboard shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);
}

// ===== Keyboard Shortcuts =====
function handleKeyboardShortcuts(e) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modifier = isMac ? e.metaKey : e.ctrlKey;

  // Escape - 關閉彈出視窗
  if (e.key === "Escape") {
    if (!pixelModal.classList.contains("hidden")) {
      hidePixelModal();
      e.preventDefault();
      return;
    }
    if (activeColorPopup) {
      closeColorPopup();
      e.preventDefault();
      return;
    }
  }

  // 如果正在輸入文字，不處理快捷鍵
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    return;
  }

  if (modifier) {
    switch (e.key.toLowerCase()) {
      case "a": // 全選
        e.preventDefault();
        toggleAllTabs(true);
        break;
      case "d": // 取消全選
        e.preventDefault();
        toggleAllTabs(false);
        break;
      case "e": // 匯出
        e.preventDefault();
        exportSavedGroups();
        break;
      case "i": // 匯入
        e.preventDefault();
        importFile.click();
        break;
    }
  }
}

// ===== Pixel Modal =====
function showPixelModal(message) {
  pixelModalMessage.textContent = message;
  pixelModal.classList.remove("hidden");
  pixelModalOk.focus();
}

function hidePixelModal() {
  pixelModal.classList.add("hidden");
}

// ===== Tab Navigation =====
function switchTab(tabName) {
  // Update nav buttons
  tabNavBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  // Update content
  tabContents.forEach((content) => {
    content.classList.toggle("active", content.id === `tab-${tabName}`);
  });
}

// ===== 載入所有分頁 =====
async function loadTabs() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    tabsList.innerHTML = "";
    tabCount.textContent = tabs.length;

    // 清理無效的 selectedTabIds
    const validTabIds = new Set(tabs.map((t) => t.id));
    selectedTabIds = new Set(
      [...selectedTabIds].filter((id) => validTabIds.has(id)),
    );

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
        <img src="${sanitizeFavIconUrl(tab.favIconUrl)}" alt="">
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
        ghost.textContent =
          draggedTabIds.length === 1
            ? escapeHtml(tab.title).substring(0, CONFIG.MAX_DRAG_TITLE_LENGTH)
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
  } catch (error) {
    console.error("Failed to load tabs:", error);
    tabsList.innerHTML = '<p class="empty-msg">Error loading tabs</p>';
  }
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
    try {
      await dropHandler();
      draggedTabIds = [];
      loadTabs();
      loadGroups();
    } catch (error) {
      console.error("Failed to drop tabs:", error);
    }
  });
}

// ===== 載入現有群組 =====
async function loadGroups() {
  try {
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
        <span class="group-edit-icon" title="Rename group">✎</span>
        <span class="group-tab-count">(${tabs.length} tabs)</span>
      </div>
      <div class="group-actions">
        <button class="btn-save" data-group-id="${group.id}" aria-label="Save group">Save</button>
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
          try {
            await chrome.tabGroups.update(group.id, { color: newColor });
            loadGroups();
          } catch (error) {
            console.error("Failed to update group color:", error);
          }
        });
      });

      // 雙擊名稱 → 編輯模式
      const titleEl = item.querySelector(".group-title");
      const editIcon = item.querySelector(".group-edit-icon");

      const startEdit = () => {
        startEditGroupTitle(titleEl, group.title || "", async (newTitle) => {
          try {
            await chrome.tabGroups.update(group.id, { title: newTitle });
            loadGroups();
          } catch (error) {
            console.error("Failed to update group title:", error);
          }
        });
      };

      titleEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startEdit();
      });

      editIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        startEdit();
      });

      // 展開 / 摺疊
      item.querySelector(".btn-toggle").addEventListener("click", async (e) => {
        try {
          const groupId = Number(e.target.dataset.groupId);
          const isCollapsed = e.target.dataset.collapsed === "true";
          await chrome.tabGroups.update(groupId, { collapsed: !isCollapsed });
          loadGroups();
        } catch (error) {
          console.error("Failed to toggle group:", error);
        }
      });

      // 儲存群組
      item.querySelector(".btn-save").addEventListener("click", async (e) => {
        try {
          const groupId = Number(e.target.dataset.groupId);
          const saved = await saveGroup(
            groupId,
            group.title || "Untitled",
            group.color,
            tabs,
          );
          if (saved) {
            loadSavedGroups();
          }
        } catch (error) {
          console.error("Failed to save group:", error);
          showPixelModal("Failed to save group.");
        }
      });

      // 解散群組
      item
        .querySelector(".btn-ungroup")
        .addEventListener("click", async (e) => {
          try {
            const groupId = Number(e.target.dataset.groupId);
            const groupTabs = await chrome.tabs.query({ groupId });
            const tabIds = groupTabs.map((t) => t.id);
            await chrome.tabs.ungroup(tabIds);
            loadGroups();
            loadTabs();
          } catch (error) {
            console.error("Failed to ungroup:", error);
          }
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
    dropHint.textContent = ":: Drag tabs here ::";

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

      try {
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
      } catch (error) {
        console.error("Failed to create group:", error);
      }
    });

    groupsList.appendChild(dropHint);
  } catch (error) {
    console.error("Failed to load groups:", error);
    groupsList.innerHTML = '<p class="empty-msg">Error loading groups</p>';
  }
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

// ===== 產生唯一 ID =====
function generateUniqueId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ===== 驗證 URL =====
function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return CONFIG.ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

// ===== 檢查 Storage 使用量 =====
async function checkStorageQuota() {
  try {
    const data = await chrome.storage.local.get(null);
    const usedBytes = new Blob([JSON.stringify(data)]).size;
    const usageRatio = usedBytes / CONFIG.MAX_STORAGE_BYTES;
    return {
      usedBytes,
      maxBytes: CONFIG.MAX_STORAGE_BYTES,
      usageRatio,
      isNearLimit: usageRatio >= CONFIG.STORAGE_WARNING_THRESHOLD,
      isFull: usageRatio >= 0.95,
    };
  } catch (error) {
    console.error("Failed to check storage quota:", error);
    return {
      usedBytes: 0,
      maxBytes: CONFIG.MAX_STORAGE_BYTES,
      usageRatio: 0,
      isNearLimit: false,
      isFull: false,
    };
  }
}

// ===== 彈出式顏色選擇器 =====
function showColorPopup(anchorEl, currentColor, onSelect) {
  // 先關閉舊的
  closeColorPopup();

  const popup = document.createElement("div");
  popup.className = "color-popup";
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-label", "Select group color");

  // 8 種顏色選項
  const colors = [
    "blue",
    "red",
    "yellow",
    "green",
    "pink",
    "purple",
    "cyan",
    "orange",
  ];
  colors.forEach((color, index) => {
    const option = document.createElement("span");
    option.className =
      "color-option" + (color === currentColor ? " selected" : "");
    option.style.background = COLOR_MAP[color];
    option.dataset.color = color;
    option.setAttribute("role", "option");
    option.setAttribute("aria-label", color);
    option.setAttribute("aria-selected", color === currentColor);
    option.tabIndex = index === 0 ? 0 : -1;

    option.addEventListener("click", (e) => {
      e.stopPropagation();
      closeColorPopup();
      if (color !== currentColor) {
        onSelect(color);
      }
    });

    // 鍵盤支持
    option.addEventListener("keydown", (e) => {
      const options = popup.querySelectorAll(".color-option");
      let currentIndex = Array.from(options).indexOf(option);

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          currentIndex = (currentIndex + 1) % options.length;
          options[currentIndex].focus();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          currentIndex = (currentIndex - 1 + options.length) % options.length;
          options[currentIndex].focus();
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          closeColorPopup();
          if (color !== currentColor) {
            onSelect(color);
          }
          break;
        case "Escape":
          e.preventDefault();
          closeColorPopup();
          anchorEl.focus();
          break;
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
  let top = anchorRect.top + anchorRect.height / 2 - popupRect.height / 2;
  if (top < 0) top = 4;
  if (top + popupRect.height > window.innerHeight) {
    top = window.innerHeight - popupRect.height - 4;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  activeColorPopup = popup;

  // 自動聚焦到第一個選項
  const firstOption = popup.querySelector(".color-option");
  if (firstOption) {
    firstOption.focus();
  }
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
    let newTitle = input.value.trim();

    // 長度限制
    if (newTitle.length > CONFIG.MAX_GROUP_TITLE_LENGTH) {
      newTitle = newTitle.substring(0, CONFIG.MAX_GROUP_TITLE_LENGTH);
    }

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

// ===== Saved Groups =====

// 儲存群組到 storage
async function saveGroup(groupId, title, color, tabs) {
  // 檢查 storage 空間
  const quota = await checkStorageQuota();
  if (quota.isFull) {
    showPixelModal("Storage is full. Please delete some saved groups.");
    return false;
  }

  const savedGroups = await getSavedGroups();

  // 過濾無效的 URL
  const validUrls = tabs
    .filter((tab) => isValidUrl(tab.url))
    .map((tab) => ({
      url: tab.url,
      title: tab.title || "Untitled",
    }));

  if (validUrls.length === 0) {
    showPixelModal("No valid URLs to save.");
    return false;
  }

  const groupData = {
    id: generateUniqueId(),
    title: title.substring(0, CONFIG.MAX_GROUP_TITLE_LENGTH),
    color: color,
    urls: validUrls,
    savedAt: new Date().toISOString(),
  };

  savedGroups.push(groupData);

  try {
    await chrome.storage.local.set({ savedGroups });

    if (quota.isNearLimit) {
      showPixelModal("Group saved. Warning: Storage is almost full.");
    }
    return true;
  } catch (error) {
    if (error.message?.includes("QUOTA_BYTES")) {
      showPixelModal(
        "Storage quota exceeded. Please delete some saved groups.",
      );
    } else {
      showPixelModal("Failed to save group.");
    }
    console.error("Failed to save group:", error);
    return false;
  }
}

// 從 storage 取得已儲存的群組
async function getSavedGroups() {
  const result = await chrome.storage.local.get("savedGroups");
  return result.savedGroups || [];
}

// 載入並顯示已儲存的群組
async function loadSavedGroups() {
  try {
    const savedGroups = await getSavedGroups();
    savedGroupsList.innerHTML = "";
    savedCount.textContent = savedGroups.length;

    if (savedGroups.length === 0) {
      savedGroupsList.innerHTML = '<p class="empty-msg">No saved groups</p>';
      return;
    }

    for (const group of savedGroups) {
      const item = document.createElement("div");
      item.className = "group-item saved-group";
      item.innerHTML = `
        <div class="group-info">
          <span class="group-color-dot" style="background:${COLOR_MAP[group.color] || "#5f6368"}"></span>
          <span class="group-title">${escapeHtml(group.title)}</span>
          <span class="group-tab-count">(${group.urls.length} tabs)</span>
        </div>
        <div class="group-actions">
          <button class="btn-share" data-group-id="${group.id}" aria-label="Share group">Share</button>
          <button class="btn-restore" data-group-id="${group.id}" aria-label="Restore group">Restore</button>
          <button class="btn-danger btn-delete" data-group-id="${group.id}" aria-label="Delete saved group">Delete</button>
        </div>
      `;

      // 分享群組
      item.querySelector(".btn-share").addEventListener("click", async (e) => {
        const btn = e.target;
        const result = generateShareData(group);

        if (!result.success) {
          btn.textContent = "Too large!";
          btn.classList.add("btn-error");
          setTimeout(() => {
            btn.textContent = "Share";
            btn.classList.remove("btn-error");
          }, 2000);
          return;
        }

        try {
          await navigator.clipboard.writeText(result.text);
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = "Share";
          }, 2000);
        } catch (error) {
          console.error("Failed to copy:", error);
          btn.textContent = "Error";
          setTimeout(() => {
            btn.textContent = "Share";
          }, 2000);
        }
      });

      // 還原群組
      item.querySelector(".btn-restore").addEventListener("click", async () => {
        try {
          await restoreGroup(group);
        } catch (error) {
          console.error("Failed to restore group:", error);
        }
      });

      // 刪除已儲存的群組
      item.querySelector(".btn-delete").addEventListener("click", async () => {
        try {
          await deleteSavedGroup(group.id);
          loadSavedGroups();
        } catch (error) {
          console.error("Failed to delete saved group:", error);
        }
      });

      savedGroupsList.appendChild(item);
    }
  } catch (error) {
    console.error("Failed to load saved groups:", error);
    savedGroupsList.innerHTML =
      '<p class="empty-msg">Error loading saved groups</p>';
  }
}

// 刪除已儲存的群組
async function deleteSavedGroup(groupId) {
  const savedGroups = await getSavedGroups();
  const filtered = savedGroups.filter((g) => g.id !== groupId);
  await chrome.storage.local.set({ savedGroups: filtered });
}

// ===== Share Group =====

// 產生分享內容（JSON 格式，可直接匯入）
function generateShareData(group) {
  const data = {
    title: group.title,
    color: group.color,
    urls: group.urls.map((u) => u.url),
  };

  try {
    const jsonStr = JSON.stringify(data);
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));

    // 檢查長度（用於未來 URL 分享）
    if (encoded.length > CONFIG.MAX_SHARE_URL_LENGTH) {
      return {
        success: false,
        reason: "too_long",
        urlCount: group.urls.length,
      };
    }

    // 產生可分享的文字格式（使用實際換行符）
    const lines = [
      `[Tab Group: ${group.title}]`,
      ...group.urls.map((u) => u.url),
    ];
    const shareText = lines.join("\r\n");

    return {
      success: true,
      text: shareText,
      encoded: encoded,
    };
  } catch (error) {
    console.error("Failed to generate share data:", error);
    return {
      success: false,
      reason: "error",
    };
  }
}

// 從分享資料還原群組
function parseShareData(encoded) {
  try {
    const jsonStr = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Failed to parse share data:", error);
    return null;
  }
}

// ===== Export / Import =====

// 匯出已儲存的群組為 JSON 檔案
async function exportSavedGroups() {
  let objectUrl = null;

  try {
    const savedGroups = await getSavedGroups();

    if (savedGroups.length === 0) {
      showPixelModal("No saved groups to export");
      return;
    }

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      groups: savedGroups,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    objectUrl = URL.createObjectURL(blob);

    // 產生檔名（包含群組名稱）
    const date = new Date().toISOString().slice(0, 10);
    const sanitizeFilename = (name) =>
      name.replace(/[<>:"/\\|?*]/g, "_").substring(0, 50);

    let filename;
    if (savedGroups.length === 1) {
      filename = `tab-groups-${sanitizeFilename(savedGroups[0].title)}-${date}.json`;
    } else {
      filename = `tab-groups-${sanitizeFilename(savedGroups[0].title)}-and-${savedGroups.length}-more-${date}.json`;
    }

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
  } catch (error) {
    console.error("Failed to export:", error);
    showPixelModal("Failed to export groups");
  } finally {
    // 確保 URL 被釋放
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

// 處理匯入檔案
async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    // 檢查 storage 空間
    const quota = await checkStorageQuota();
    if (quota.isFull) {
      showPixelModal("Storage is full. Please delete some saved groups first.");
      e.target.value = "";
      return;
    }

    const text = await file.text();
    const importData = JSON.parse(text);

    // 驗證資料格式
    if (!importData.groups || !Array.isArray(importData.groups)) {
      showPixelModal("Invalid file format");
      e.target.value = "";
      return;
    }

    // 取得現有群組
    const existingGroups = await getSavedGroups();

    // 驗證顏色是否有效
    const validColors = Object.keys(COLOR_MAP);

    // 合併群組（避免重複）
    let importedCount = 0;
    let skippedCount = 0;
    for (const group of importData.groups) {
      // 驗證群組資料
      if (!group.title || typeof group.title !== "string") {
        skippedCount++;
        continue;
      }
      if (!group.urls || !Array.isArray(group.urls)) {
        skippedCount++;
        continue;
      }

      // 過濾並驗證 URLs
      const validUrls = group.urls
        .filter((urlData) => {
          if (typeof urlData === "string") {
            return isValidUrl(urlData);
          }
          return (
            urlData &&
            typeof urlData.url === "string" &&
            isValidUrl(urlData.url)
          );
        })
        .map((urlData) => {
          if (typeof urlData === "string") {
            return { url: urlData, title: "Untitled" };
          }
          return {
            url: urlData.url,
            title:
              typeof urlData.title === "string"
                ? urlData.title.substring(0, 200)
                : "Untitled",
          };
        });

      if (validUrls.length === 0) {
        skippedCount++;
        continue;
      }

      // 產生新的 ID 避免衝突
      const newGroup = {
        id: generateUniqueId(),
        title: group.title.substring(0, CONFIG.MAX_GROUP_TITLE_LENGTH),
        color: validColors.includes(group.color) ? group.color : "blue",
        urls: validUrls,
        savedAt: group.savedAt || new Date().toISOString(),
      };

      existingGroups.push(newGroup);
      importedCount++;
    }

    if (importedCount === 0) {
      showPixelModal("No valid groups found in file");
      e.target.value = "";
      return;
    }

    // 儲存
    try {
      await chrome.storage.local.set({ savedGroups: existingGroups });
    } catch (storageError) {
      if (storageError.message?.includes("QUOTA_BYTES")) {
        showPixelModal("Storage quota exceeded. Try importing fewer groups.");
      } else {
        showPixelModal("Failed to save imported groups");
      }
      console.error("Storage error:", storageError);
      e.target.value = "";
      return;
    }

    // 重新載入
    loadSavedGroups();

    let message = `Imported ${importedCount} group(s) successfully`;
    if (skippedCount > 0) {
      message += ` (${skippedCount} skipped)`;
    }
    if (quota.isNearLimit) {
      message += ". Warning: Storage almost full.";
    }
    showPixelModal(message);
  } catch (error) {
    console.error("Failed to import:", error);
    showPixelModal("Failed to import: Invalid JSON file");
  }

  // 清除 file input 以便重複選擇同一檔案
  e.target.value = "";
}

// 還原群組（開啟所有網址並建立群組）
async function restoreGroup(group) {
  // 過濾有效的 URLs
  const validUrls = group.urls.filter((urlData) => isValidUrl(urlData.url));

  if (validUrls.length === 0) {
    showPixelModal("No valid URLs to restore.");
    return;
  }

  // 開啟所有網址
  const tabIds = [];
  let failedCount = 0;

  for (const urlData of validUrls) {
    try {
      const tab = await chrome.tabs.create({ url: urlData.url, active: false });
      tabIds.push(tab.id);
    } catch (error) {
      console.error("Failed to create tab for:", urlData.url, error);
      failedCount++;
    }
  }

  // 建立群組
  if (tabIds.length > 0) {
    try {
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, {
        title: group.title,
        color: group.color,
        collapsed: true,
      });
    } catch (error) {
      console.error("Failed to create group:", error);
      showPixelModal("Failed to create tab group.");
    }
  }

  if (failedCount > 0) {
    showPixelModal(`Restored with ${failedCount} failed tab(s).`);
  }

  // 重新載入
  loadTabs();
  loadGroups();
}

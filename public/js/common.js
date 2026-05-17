const API_BASE = "/api";
const DEPARTMENTS = [
  "Engineering & Product Development",
  "Software / IT",
  "Embedded Systems",
  "Research & Development (R&D)",
  "Manufacturing & Production",
  "Supply Chain Management",
  "Quality Assurance",
  "Operations",
  "Sales",
  "Marketing",
  "Customer Support / Service Network",
  "Human Resources (HR)",
  "Finance & Accounts",
  "Procurement",
  "Industrial Design / CMF Design",
  "E-commerce & D2C",
  "Data Analytics",
  "Strategic Projects",
  "Export & International Business",
  "IoT & Smart Appliances",
  "Testing & Validation",
  "Product Management",
  "Business Development",
  "Retail Operations",
];

let csrfToken = null;

async function fetchCsrfToken() {
  if (csrfToken) return csrfToken;
  try {
    const res = await fetch(`${API_BASE}/csrf-token`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      csrfToken = data.csrfToken;
    }
  } catch (err) {
    console.error("Failed to fetch CSRF token", err);
  }
  return csrfToken;
}

function sanitizeHTML(html) {
  if (typeof DOMPurify === "undefined") {
    return html;
  }

  // To support HTML fragments like <tr> and <option> which DOMPurify strips 
  // without a parent container, we temporarily wrap them.
  let isRow = /^\s*<tr/i.test(html);
  let isOption = /^\s*<option/i.test(html);
  let isLi = /^\s*<li/i.test(html);
  
  let wrapStart = '';
  let wrapEnd = '';
  if (isRow) { wrapStart = '<table><tbody>'; wrapEnd = '</tbody></table>'; }
  else if (isOption) { wrapStart = '<select>'; wrapEnd = '</select>'; }
  else if (isLi) { wrapStart = '<ul>'; wrapEnd = '</ul>'; }

  let sanitized = DOMPurify.sanitize(wrapStart + html + wrapEnd, {
    ADD_ATTR: ['onclick', 'style', 'onchange', 'disabled', 'class', 'id', 'data-sidebar', 'href', 'type', 'aria-label', 'value', 'selected'],
    ADD_TAGS: ['span', 'strong', 'small', 'button', 'a', 'div', 'p', 'h3', 'td', 'tr', 'th', 'tbody', 'thead', 'table', 'option', 'select', 'li', 'ul']
  });

  if (wrapStart) {
    if (isRow) sanitized = sanitized.replace(/^[\s\S]*?<tbody>/i, '').replace(/<\/tbody>[\s\S]*?$/i, '');
    else if (isOption) sanitized = sanitized.replace(/^[\s\S]*?<select.*?>/i, '').replace(/<\/select>[\s\S]*?$/i, '');
    else if (isLi) sanitized = sanitized.replace(/^[\s\S]*?<ul>/i, '').replace(/<\/ul>[\s\S]*?$/i, '');
  }

  return sanitized;
}

function getToken() {
  return localStorage.getItem("token");
}

function getUser() {
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function saveSession(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/public/pages/login.html";
}

async function apiFetch(url, options = {}) {
  const headers = options.headers || {};
  
  if (options.method && options.method.toUpperCase() !== "GET") {
    const token = await fetchCsrfToken();
    if (token) {
      headers["x-csrf-token"] = token;
    }
  }

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: "include"
  });

  if (response.status === 401) {
    logout();
    return;
  }

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    const errorData = contentType.includes("application/json")
      ? await response.json()
      : {};
    throw new Error(errorData.message || "Something went wrong");
  }

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.blob();
}

function requireAuth(role) {
  const user = getUser();
  if (!user || !getToken()) {
    window.location.href = "/public/pages/login.html";
    return null;
  }

  if (role && user.role !== role) {
    const routeMap = {
      Employee: "/public/pages/employee-dashboard.html",
      Manager: "/public/pages/manager-dashboard.html",
      Admin: "/public/pages/admin-dashboard.html",
    };
    window.location.href = routeMap[user.role];
    return null;
  }

  return user;
}

function setSidebar(activeKey) {
  const nav = document.querySelector("[data-sidebar]");
  if (!nav) {
    return;
  }

  const user = getUser();
  const links = [
    {
      key: "dashboard",
      label: "Dashboard",
      href:
        user.role === "Employee"
          ? "employee-dashboard.html"
          : user.role === "Manager"
            ? "manager-dashboard.html"
            : "admin-dashboard.html",
    },
    { key: "goals", label: "Goal Setup", href: "goal-create.html" },
    { key: "checkin", label: "Quarterly Check-In", href: "checkin.html" },
    { key: "reports", label: "Reports", href: "reports.html" },
    { key: "analytics", label: "Analytics", href: "analytics.html" },
    { key: "audit", label: "Audit Log", href: "audit-log.html" },
  ];

  nav.innerHTML = sanitizeHTML(links
    .filter((item) => !(user.role === "Employee" && item.key === "audit"))
    .filter(
      (item) =>
        !(
          user.role !== "Admin" &&
          (item.key === "audit" || item.key === "reports")
        ),
    )
    .map(
      (item) =>
        `<a class="${activeKey === item.key ? "active" : ""}" href="/public/pages/${item.href}">${item.label}</a>`,
    )
    .join(""));
}

function setHeader(title, text) {
  const titleEl = document.getElementById("page-title");
  const textEl = document.getElementById("page-text");
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
}

function applyRoleTheme() {
  const user = getUser();
  if (user?.role) {
    document.body.dataset.roleTheme = user.role.toLowerCase();
  }
}

function ensureNotificationModal() {
  if (document.getElementById("notification-modal")) {
    return;
  }

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "notification-modal";
  modal.innerHTML = sanitizeHTML(`
    <div class="card modal-content notification-modal-content">
      <div class="topbar">
        <div>
          <h3 style="margin:0;">Notifications</h3>
          <p class="muted">Latest items stay highlighted until you open this panel.</p>
        </div>
        <button class="btn btn-secondary" type="button" onclick="closeNotificationCenter()">Close</button>
      </div>
      <div id="notification-modal-list" class="notification-list"></div>
    </div>
  `);
  document.body.appendChild(modal);
}

function fillUserPanel() {
  const user = getUser();
  applyRoleTheme();
  ensureNotificationModal();

  const nameNodes = document.querySelectorAll("[data-user-name]");
  const roleNodes = document.querySelectorAll("[data-user-role]");
  nameNodes.forEach((node) => {
    node.textContent = user?.name || "Guest";
  });
  roleNodes.forEach((node) => {
    node.textContent = user ? `${user.role} · ${user.department}` : "";
  });

  const topbarUser = document.querySelector("[data-topbar-user]");
  if (topbarUser && user) {
    topbarUser.innerHTML = sanitizeHTML(`
      <button class="notification-trigger" type="button" onclick="openNotificationCenter()" aria-label="Open notifications">
        <span class="notification-bell"><span class="material-symbols-outlined">notifications</span></span>
        <span class="notification-badge" id="notification-count" style="display:none;">0</span>
      </button>
      <button class="profile-trigger" type="button" onclick="toggleProfileMenu()">
        <span class="profile-avatar">${getInitials(user.name)}</span>
        <span class="profile-copy">
          <strong>${user.name}</strong>
          <small>${user.role}</small>
        </span>
      </button>
      <div class="profile-menu" id="profile-menu">
        <a href="/public/pages/profile.html">My Profile</a>
        <button type="button" onclick="logout()">Logout</button>
      </div>
    `);
  }

  loadNotifications(true);
}

document.addEventListener("click", (event) => {
  const profileBox = document.querySelector(".profile-box");
  const profileMenu = document.getElementById("profile-menu");

  if (!profileBox || !profileMenu || profileBox.contains(event.target)) {
    return;
  }

  profileMenu.classList.remove("show");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.getElementById("profile-menu")?.classList.remove("show");
    closeNotificationCenter();
  }
});

function showToast(message, type = "info") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

function formatStatus(status) {
  return `<span class="status ${String(status || "").toLowerCase()}">${status}</span>`;
}

function openModal(modalId) {
  document.getElementById(modalId)?.classList.add("show");
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove("show");
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function populateDepartmentSelect(selectElement, selectedValue = "") {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = sanitizeHTML(
    '<option value="">Select department</option>' +
    DEPARTMENTS.map(
      (department) =>
        `<option value="${department}" ${selectedValue === department ? "selected" : ""}>${department}</option>`,
    ).join("")
  );
}

function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function toggleProfileMenu() {
  document.getElementById("profile-menu")?.classList.toggle("show");
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateNotificationBadge(count) {
  const badge = document.getElementById("notification-count");
  if (!badge) {
    return;
  }

  badge.textContent = count > 99 ? "99+" : String(count);
  badge.style.display = count > 0 ? "inline-flex" : "none";
}

function renderNotificationList(notifications = []) {
  const modalList = document.getElementById("notification-modal-list");
  if (!modalList) {
    return;
  }

  modalList.innerHTML = sanitizeHTML(
    notifications
      .map(
        (item) => `
        <button class="notification-item notification-link-button ${item.read ? "" : "notification-item-unread"}" type="button" onclick="openNotificationTarget('${(item.link || "").replace(/'/g, "\\'")}')">
          <div class="notification-item-head">
            <strong>${item.title}</strong>
            <span class="muted small-text">${formatDateTime(item.createdAt)}</span>
          </div>
          <p class="small-text">${item.message}</p>
        </button>
      `,
      )
      .join("") || '<div class="empty-state">No notifications yet.</div>'
  );
}

function openNotificationTarget(link) {
  if (!link) {
    closeNotificationCenter();
    return;
  }

  window.location.href = link;
}

async function loadNotifications(silent = false) {
  try {
    const data = await apiFetch("/auth/notifications");
    window.latestNotifications = data.notifications || [];
    updateNotificationBadge(data.unreadCount || 0);
    renderNotificationList(window.latestNotifications);
  } catch (error) {
    if (!silent) {
      showToast(error.message, "error");
    }
  }
}

async function openNotificationCenter() {
  await loadNotifications(true);
  openModal("notification-modal");

  const unread = (window.latestNotifications || []).some((item) => !item.read);
  if (!unread) {
    return;
  }

  await apiFetch("/auth/notifications/read", {
    method: "PUT",
    body: JSON.stringify({}),
  });

  window.latestNotifications = (window.latestNotifications || []).map(
    (item) => ({
      ...item,
      read: true,
    }),
  );
  updateNotificationBadge(0);
  renderNotificationList(window.latestNotifications);
}

function closeNotificationCenter() {
  closeModal("notification-modal");
}

function startAutoRefresh(task, intervalMs = 8000) {
  if (window.refreshTimer) {
    clearInterval(window.refreshTimer);
  }

  window.refreshTimer = setInterval(async () => {
    if (document.hidden) {
      return;
    }

    try {
      await Promise.all([task(), loadNotifications(true)]);
    } catch (error) {
      console.error("Auto refresh failed:", error.message);
    }
  }, intervalMs);
}

function mergeGoalsForDisplay(goals = []) {
  const map = new Map();

  goals.forEach((goal) => {
    const groupKey =
      goal.sharedGoal && (goal.primaryOwnerId || goal.title)
        ? `shared-${goal.primaryOwnerId || goal.title}-${goal.title}`
        : goal._id;

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        ...goal,
        mergedGoalIds: [goal._id],
        mergedEmployeeNames: [goal.ownerId?.name].filter(Boolean),
        mergedCount: 1,
        mergedWeightage: Number(goal.weightage || 0),
      });
      return;
    }

    const entry = map.get(groupKey);
    entry.mergedGoalIds.push(goal._id);
    entry.mergedEmployeeNames.push(goal.ownerId?.name || "");
    entry.mergedCount += 1;
    entry.mergedWeightage += Number(goal.weightage || 0);

    if (!entry.sharedGoal && goal.sharedGoal) {
      map.set(groupKey, {
        ...entry,
        ...goal,
        mergedGoalIds: entry.mergedGoalIds,
        mergedEmployeeNames: entry.mergedEmployeeNames,
        mergedCount: entry.mergedCount,
        mergedWeightage: entry.mergedWeightage,
      });
    }
  });

  return Array.from(map.values());
}

async function refreshPageData() {
  if (typeof window.pageRefresh === "function") {
    await window.pageRefresh();
  }
  await loadNotifications(true);
}

function handleGoalDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const goalId = params.get("goalId");
  const openGoal = params.get("openGoal");

  if (!goalId || openGoal !== "true" || window.goalDeepLinkHandled) {
    return;
  }

  window.goalDeepLinkHandled = true;
  openGoalDetailsModal(goalId);
}

function setGoalAccessState(goal, user) {
  const accessNote = document.getElementById("goal-detail-access-note");
  const accessButton = document.getElementById("goal-detail-access-btn");
  const isApproved = goal.status === "Approved" || goal.locked;
  const access = goal.editAccess || {};
  const expiresAt = access.expiresAt ? new Date(access.expiresAt) : null;
  const accessActive =
    access.status === "granted" &&
    expiresAt &&
    expiresAt.getTime() > Date.now() &&
    String(
      access.requestedByManagerId?._id || access.requestedByManagerId || "",
    ) === String(user.id);

  if (accessNote) {
    if (access.status === "pending") {
      accessNote.textContent = `Admin review pending for manager edit access.${access.requestComment ? ` Note: ${access.requestComment}` : ""}`;
    } else if (accessActive) {
      accessNote.textContent = `Temporary admin access is active until ${formatDateTime(access.expiresAt)}.`;
    } else if (isApproved) {
      accessNote.textContent =
        "Approved goals are locked. Manager edits require temporary admin approval.";
    } else {
      accessNote.textContent = "Draft-phase goals can still be edited.";
    }
  }

  if (accessButton) {
    const showButton =
      user.role === "Manager" &&
      isApproved &&
      !accessActive &&
      access.status !== "pending";
    accessButton.style.display = showButton ? "inline-flex" : "none";
  }

  return accessActive;
}

async function openGoalDetailsModal(goalId) {
  try {
    const details = await apiFetch(`/goals/${goalId}/details`);
    const goal = details.goal;
    const user = getUser();
    const isApproved = goal.status === "Approved" || goal.locked;
    const isEmployee = user.role === "Employee";
    const isManager = user.role === "Manager";
    const isAdmin = user.role === "Admin";
    const canEmployeeEdit = isEmployee && (!isApproved || goal.sharedGoal);
    const managerAccessActive = setGoalAccessState(goal, user);
    const canManagerEdit = isManager && (!isApproved || managerAccessActive);
    const canAdminEdit = isAdmin;

    document.getElementById("goal-detail-id").value = goal._id;
    document.getElementById("goal-detail-title").textContent = goal.title;
    document.getElementById("goal-detail-thrust-area").value =
      goal.thrustArea || "";
    document.getElementById("goal-detail-name").value = goal.title || "";
    document.getElementById("goal-detail-description").value =
      goal.description || "";
    document.getElementById("goal-detail-uom").value = goal.uom || "";
    document.getElementById("goal-detail-target").value = goal.target ?? 0;
    document.getElementById("goal-detail-weightage").value =
      goal.weightage ?? 0;
    document.getElementById("goal-detail-status").value =
      goal.status || "Draft";
    document.getElementById("goal-detail-deadline").value = goal.deadline
      ? goal.deadline.slice(0, 10)
      : "";
    document.getElementById("goal-detail-progress").textContent =
      `${goal.progressStatus || "Not Started"} · ${Math.round(goal.progressScore || 0)}%`;
    document.getElementById("goal-detail-manager-comment").textContent =
      goal.managerComment || "No approval remarks added yet.";
    document.getElementById("goal-detail-comment").value =
      goal.managerComment || "";

    const assignedRows = details.assignedEmployees
      .map(
        (item) => `
        <tr>
          <td>${item.employeeName}</td>
          <td>${item.department}</td>
          <td>${item.weightage}%</td>
          <td>${item.status}</td>
          <td>${item.progressStatus}</td>
        </tr>
      `,
      )
      .join("");
    document.getElementById("goal-detail-assignees").innerHTML = sanitizeHTML(
      assignedRows ||
      '<tr><td colspan="5" class="empty-state">No linked employees.</td></tr>'
    );

    const fields = {
      thrustArea: document.getElementById("goal-detail-thrust-area"),
      title: document.getElementById("goal-detail-name"),
      description: document.getElementById("goal-detail-description"),
      uom: document.getElementById("goal-detail-uom"),
      target: document.getElementById("goal-detail-target"),
      weightage: document.getElementById("goal-detail-weightage"),
      status: document.getElementById("goal-detail-status"),
      deadline: document.getElementById("goal-detail-deadline"),
      comment: document.getElementById("goal-detail-comment"),
    };

    Object.values(fields).forEach((field) => {
      if (field) {
        field.disabled = true;
      }
    });

    if (canEmployeeEdit) {
      if (goal.sharedGoal) {
        fields.weightage.disabled = false;
      } else {
        fields.thrustArea.disabled = false;
        fields.title.disabled = false;
        fields.description.disabled = false;
        fields.uom.disabled = false;
        fields.target.disabled = false;
        fields.weightage.disabled = false;
        fields.deadline.disabled = false;
      }
    }

    if (canManagerEdit) {
      fields.target.disabled = false;
      fields.weightage.disabled = false;
      fields.status.disabled = false;
      fields.comment.disabled = false;
    }

    if (canAdminEdit) {
      Object.values(fields).forEach((field) => {
        if (field) {
          field.disabled = false;
        }
      });
    }

    const saveButton = document.getElementById("goal-detail-save-btn");
    const approveButton = document.getElementById("goal-detail-approve-btn");
    const reworkButton = document.getElementById("goal-detail-rework-btn");
    const rejectButton = document.getElementById("goal-detail-reject-btn");

    saveButton.style.display =
      canEmployeeEdit || canManagerEdit || canAdminEdit
        ? "inline-flex"
        : "none";
    approveButton.style.display =
      canManagerEdit && !managerAccessActive ? "inline-flex" : "none";
    reworkButton.style.display = canManagerEdit ? "inline-flex" : "none";
    rejectButton.style.display =
      canManagerEdit && !managerAccessActive ? "inline-flex" : "none";
    saveButton.textContent = isAdmin
      ? "Save Goal"
      : isManager
        ? "Save Review"
        : "Save Goal";

    openModal("goal-detail-modal");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function saveGoalDetailsFromModal() {
  const user = getUser();
  const goalId = document.getElementById("goal-detail-id").value;
  const payload = {
    thrustArea: document.getElementById("goal-detail-thrust-area").value.trim(),
    title: document.getElementById("goal-detail-name").value.trim(),
    description: document
      .getElementById("goal-detail-description")
      .value.trim(),
    uom: document.getElementById("goal-detail-uom").value,
    target: Number(document.getElementById("goal-detail-target").value),
    weightage: Number(document.getElementById("goal-detail-weightage").value),
    status: document.getElementById("goal-detail-status").value,
    deadline: document.getElementById("goal-detail-deadline").value || null,
    comment: document.getElementById("goal-detail-comment").value.trim(),
  };

  try {
    if (user.role === "Admin") {
      await apiFetch(`/goals/${goalId}/admin-update`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else if (user.role === "Manager") {
      await apiFetch(`/goals/${goalId}/review`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch(`/goals/${goalId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    }

    showToast("Goal updated successfully", "success");
    closeModal("goal-detail-modal");
    await refreshPageData();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function approveGoalFromModal() {
  const goalId = document.getElementById("goal-detail-id").value;
  try {
    await apiFetch(`/goals/${goalId}/approve`, {
      method: "POST",
      body: JSON.stringify({
        target: Number(document.getElementById("goal-detail-target").value),
        weightage: Number(
          document.getElementById("goal-detail-weightage").value,
        ),
        comment: document.getElementById("goal-detail-comment").value.trim(),
      }),
    });
    showToast("Goal approved", "success");
    closeModal("goal-detail-modal");
    await refreshPageData();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function reworkGoalFromModal() {
  const goalId = document.getElementById("goal-detail-id").value;
  try {
    await apiFetch(`/goals/${goalId}/reject`, {
      method: "POST",
      body: JSON.stringify({
        action: "return_rework",
        comment: document.getElementById("goal-detail-comment").value.trim(),
      }),
    });
    showToast("Goal returned for rework", "success");
    closeModal("goal-detail-modal");
    await refreshPageData();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function rejectGoalFromModal() {
  const goalId = document.getElementById("goal-detail-id").value;
  try {
    await apiFetch(`/goals/${goalId}/reject`, {
      method: "POST",
      body: JSON.stringify({
        comment: document.getElementById("goal-detail-comment").value.trim(),
      }),
    });
    showToast("Goal rejected", "success");
    closeModal("goal-detail-modal");
    await refreshPageData();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function requestGoalEditAccess() {
  const goalId = document.getElementById("goal-detail-id").value;
  const comment = document.getElementById("goal-detail-comment").value.trim();

  try {
    await apiFetch(`/goals/${goalId}/request-access`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    });
    showToast("Admin access request sent", "success");
    closeModal("goal-detail-modal");
    await refreshPageData();
  } catch (error) {
    showToast(error.message, "error");
  }
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".profile-trigger");
  const menu = document.getElementById("profile-menu");

  if (menu && !trigger && !event.target.closest("#profile-menu")) {
    menu.classList.remove("show");
  }

  if (!event.target.closest(".modal-content")) {
    const modal = event.target.closest(".modal");
    if (modal) {
      modal.classList.remove("show");
    }
  }
});

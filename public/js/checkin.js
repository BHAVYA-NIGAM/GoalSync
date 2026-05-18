document.addEventListener("DOMContentLoaded", async () => {
  let user = requireAuth();
  if (!user) return;

  const liveUser = await syncSessionUser();
  if (!liveUser) return;
  user = liveUser;

  setSidebar("checkin");
  setHeader(
    "Quarterly Check-In",
    user.role === "Employee"
      ? "Update actual achievements and submit check-ins during active windows."
      : "Review the latest quarterly progress without leaving your workflow."
  );
  fillUserPanel();
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  window.pageRefresh = loadCheckinGoals;

  loadCheckinGoals();
  startAutoRefresh(loadCheckinGoals);
});

let checkinWindowState = {
  key: "",
  label: "",
  active: false,
  canEdit: false
};

const CHECKIN_SCHEDULE = [
  { key: "GOAL_SETTING", label: "Phase 1", month: 5, day: 1 },
  { key: "Q1", label: "Q1 Check-In", month: 7, day: 1 },
  { key: "Q2", label: "Q2 Check-In", month: 10, day: 1 },
  { key: "Q3", label: "Q3 Check-In", month: 1, day: 1 },
  { key: "Q4", label: "Q4 / Annual", month: 3, day: 1 }
];

async function loadCheckinGoals() {
  try {
    const data = await apiFetch("/goals");
    renderCheckinGoals(data.goals || [], data.currentWindow);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function getNextWindowWindowInfo(currentWindow) {
  const now = new Date();
  const candidates = CHECKIN_SCHEDULE.map((item) => {
    let year = now.getFullYear();

    if (item.month < now.getMonth() + 1) {
      year += 1;
    }

    let opensAt = new Date(year, item.month - 1, item.day, 0, 0, 0, 0);

    if (currentWindow?.key === item.key && currentWindow?.active) {
      opensAt = new Date(year + 1, item.month - 1, item.day, 0, 0, 0, 0);
    }

    return {
      ...item,
      opensAt
    };
  }).sort((a, b) => a.opensAt - b.opensAt);

  return candidates.find((item) => item.opensAt > now) || candidates[0];
}

function formatDaysUntil(date) {
  const now = new Date();
  const diffMs = Math.max(0, date.getTime() - now.getTime());
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "Opens today";
  }

  if (days === 1) {
    return "1 day left";
  }

  return `${days} days left`;
}

function renderWindowCountdown(currentWindow) {
  const currentWindowName = document.getElementById("current-window-name");
  const nextWindowName = document.getElementById("next-window-name");
  const nextWindowCountdown = document.getElementById("next-window-countdown");
  const nextWindow = getNextWindowWindowInfo(currentWindow);

  if (currentWindowName) {
    currentWindowName.textContent = currentWindow?.label || "Closed";
  }

  if (nextWindowName) {
    nextWindowName.textContent = nextWindow?.label || "Not available";
  }

  if (nextWindowCountdown) {
    nextWindowCountdown.textContent = nextWindow
      ? `${formatDaysUntil(nextWindow.opensAt)} to open next window`
      : "Schedule unavailable";
  }
}

function renderCheckinGoals(goals, currentWindow) {
  const user = getUser();
  const isEmployee = user?.role === "Employee";
  const canEditCheckins = currentWindow?.active && ["Q1", "Q2", "Q3", "Q4"].includes(currentWindow?.key);
  checkinWindowState = {
    key: currentWindow?.key || "",
    label: currentWindow?.label || "",
    active: Boolean(currentWindow?.active),
    canEdit: Boolean(canEditCheckins)
  };
  const approvedGoals = goals.filter((goal) => goal.status === "Approved");

  document.getElementById("active-quarter").textContent = `Active Window: ${currentWindow.label}`;
  renderWindowCountdown(currentWindow);
  document.getElementById("checkin-table-title").textContent = isEmployee
    ? "Approved Goals Ready for Check-In"
    : user?.role === "Manager"
      ? "Department Check-In Overview"
      : "Organization Check-In Overview";

  const rows = approvedGoals
    .map((goal) => {
      const latestCheckin =
        goal.checkins && goal.checkins.length
          ? goal.checkins[goal.checkins.length - 1]
          : null;

      return `
      <tr>
        <td>${goal.ownerId?.name || "Self"}</td>
        <td>${goal.title}</td>
        <td>${goal.target}</td>
        <td>${goal.actuals || 0}</td>
        <td>${latestCheckin?.quarter || currentWindow.key}</td>
        <td>${goal.progressStatus || latestCheckin?.status || "Not Started"}</td>
        <td>${Math.round(goal.progressScore || latestCheckin?.score || 0)}%</td>
        <td class="inline-actions">
          ${
            isEmployee
              ? canEditCheckins
                ? `<button class="btn btn-primary" onclick="openCheckinModal('${goal._id}', '${goal.title.replace(/'/g, "\\'")}')">Update</button>`
                : `<button class="btn btn-secondary" type="button" disabled>Window Closed</button>`
              : `<button class="btn btn-secondary" onclick="openNotificationTarget('${buildRoleGoalLink(user?.role, goal._id)}')">Open Goal</button>`
          }
        </td>
      </tr>
    `;
    })
    .join("");

  document.getElementById("checkin-body").innerHTML = sanitizeHTML(rows ||
    `<tr><td colspan="8" class="empty-state">${
      isEmployee
        ? "No approved goals available for check-in."
        : "No approved goals are available to review right now."
    }</td></tr>`);

  const actionBar = document.getElementById("checkin-action-note");
  if (actionBar) {
    actionBar.textContent = isEmployee
      ? canEditCheckins
        ? "Employees can update actuals and submit the active quarter check-in from here."
        : "Check-in updates are closed right now. Actuals can only be updated during an active quarterly window."
      : "Managers and admins can monitor check-in progress here and jump directly into the matching goal."
  }
}

function buildRoleGoalLink(role, goalId) {
  const page =
    role === "Manager"
      ? "manager-dashboard.html"
      : role === "Admin"
        ? "admin-dashboard.html"
        : "goal-create.html";

  return `/public/pages/${page}?goalId=${goalId}&openGoal=true`;
}

function openCheckinModal(id, title) {
  if (!checkinWindowState.canEdit) {
    showToast(
      `Check-in updates are unavailable right now. Active window: ${checkinWindowState.label || "Closed"}`,
      "error"
    );
    return;
  }

  document.getElementById("checkinGoalId").value = id;
  document.getElementById("checkin-goal-title").textContent = title;
  openModal("checkin-modal");
}

async function saveActualsOnly() {
  const goalId = document.getElementById("checkinGoalId").value;
  const payload = {
    achievement: Number(document.getElementById("achievement").value),
    status: document.getElementById("progressStatus").value,
    completedDate: document.getElementById("completedDate").value
  };

  if (payload.achievement < 0) {
    showToast("Achievement cannot be below 0", "error");
    return;
  }

  try {
    await apiFetch(`/goals/${goalId}/actuals`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast("Actuals saved", "success");
    closeModal("checkin-modal");
    await loadCheckinGoals();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function submitCheckinRecord() {
  const goalId = document.getElementById("checkinGoalId").value;
  const payload = {
    achievement: Number(document.getElementById("achievement").value),
    status: document.getElementById("progressStatus").value,
    comment: document.getElementById("checkinComment").value,
    completedDate: document.getElementById("completedDate").value
  };

  if (payload.achievement < 0) {
    showToast("Achievement cannot be below 0", "error");
    return;
  }

  try {
    await apiFetch(`/goals/${goalId}/checkin`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast("Check-in submitted", "success");
    closeModal("checkin-modal");
    await loadCheckinGoals();
  } catch (error) {
    showToast(error.message, "error");
  }
}

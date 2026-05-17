document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth();
  if (!user) return;

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

async function loadCheckinGoals() {
  try {
    const data = await apiFetch("/goals");
    renderCheckinGoals(data.goals || [], data.currentWindow);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderCheckinGoals(goals, currentWindow) {
  const user = getUser();
  const isEmployee = user?.role === "Employee";
  const approvedGoals = goals.filter((goal) => goal.status === "Approved");

  document.getElementById("active-quarter").textContent = `Active Window: ${currentWindow.label}`;
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
              ? `<button class="btn btn-primary" onclick="openCheckinModal('${goal._id}', '${goal.title.replace(/'/g, "\\'")}')">Update</button>`
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
      ? "Employees can update actuals and submit the active quarter check-in from here."
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

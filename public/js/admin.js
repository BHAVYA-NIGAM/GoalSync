document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("Admin");
  if (!user) return;

  setSidebar("dashboard");
  setHeader("");
  fillUserPanel();

  document.getElementById("logout-btn")?.addEventListener("click", logout);
  window.pageRefresh = loadAdminDashboard;

  try {
    await loadAdminDashboard();
    startAutoRefresh(loadAdminDashboard);
  } catch (error) {
    showToast(error.message, "error");
  }
});

async function loadAdminDashboard() {
  const [dashboard, goalsResponse] = await Promise.all([apiFetch("/admin/dashboard"), apiFetch("/goals")]);
  window.adminDashboardData = dashboard;
  window.adminGoals = goalsResponse.goals || [];
  renderAdminDashboard(dashboard);
  populateAdminDepartmentFilter(window.adminGoals);
  renderAdminGoalTable();
  handleGoalDeepLink();
}

function renderAdminDashboard(data) {
  document.getElementById("stats").innerHTML = sanitizeHTML(`
    <div class="card stat-card"><span>Total Goals</span><strong>${data.summary.goalCount}</strong></div>
    <div class="card stat-card warning"><span>Escalations</span><strong>${data.summary.escalationCount}</strong></div>
    <div class="card stat-card highlight"><span>Org Completion</span><strong>${data.summary.organizationCompletion}%</strong></div>
    <div class="card stat-card"><span>Users</span><strong>${data.summary.userCount}</strong></div>
  `);

  document.getElementById("department-list").innerHTML = sanitizeHTML(
    data.departmentAnalytics
      .map(
        (item) => `
      <div class="notification-item">
        <strong>${item.department}</strong>
        <p class="muted small-text">Completion: ${item.completion}%</p>
      </div>
    `
      )
      .join("") || '<div class="empty-state">No department analytics available yet.</div>'
  );

  document.getElementById("escalation-list").innerHTML = sanitizeHTML(
    data.escalations
      .map(
        (item) => `
      <div class="log-item">
        <strong>${item.triggeredBy}</strong>
        <p class="muted small-text">${item.message}</p>
        <p class="small-text">Resolved: ${item.resolved ? "Yes" : "No"}</p>
      </div>
    `
      )
      .join("") || '<div class="empty-state">No escalation records yet. Fresh checks will appear here automatically.</div>'
  );

  document.getElementById("employee-completion-body").innerHTML = sanitizeHTML(
    data.completionByEmployee
      .map(
        (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.department}</td>
        <td>${item.manager}</td>
        <td>${item.approvedGoals}</td>
        <td>${item.completedCheckins}</td>
        <td>${item.completionStatus}</td>
      </tr>
    `
      )
      .join("")
  );

  document.getElementById("manager-completion-body").innerHTML = sanitizeHTML(
    data.completionByManager
      .map(
        (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.department}</td>
        <td>${item.teamSize}</td>
        <td>${item.fullyCompletedEmployees}</td>
        <td>${item.completionRate}%</td>
      </tr>
    `
      )
      .join("")
  );

  document.getElementById("locked-goal-body").innerHTML = sanitizeHTML(
    data.lockedGoals
      .map(
        (goal) => `
      <tr>
        <td>${goal.employee}</td>
        <td>${goal.department}</td>
        <td><button class="btn btn-secondary" onclick="openGoalDetailsModal('${goal.id}')">${goal.title}</button></td>
        <td>${goal.status}</td>
        <td><span class="read-only-chip">Edit in popup</span></td>
        <td><button class="btn btn-warning" onclick="unlockGoal('${goal.id}')">Unlock</button></td>
      </tr>
    `
      )
      .join("")
  );

  document.getElementById("access-request-body").innerHTML = sanitizeHTML(
    (data.accessRequests || [])
      .map(
        (item) => `
      <tr>
        <td>${item.requestedBy || "-"}</td>
        <td>${item.employee}</td>
        <td>${item.title}</td>
        <td>${item.requestComment || "-"}</td>
        <td>${item.status}</td>
        <td>${item.expiresAt ? formatDateTime(item.expiresAt) : "-"}</td>
        <td>
          ${
            item.status === "pending"
              ? `<button class="btn btn-primary" onclick="approveAccessRequest('${item.id}')">Grant 24h Access</button>`
              : `<span class="read-only-chip">Granted${item.grantedBy ? ` by ${item.grantedBy}` : ""}</span>`
          }
        </td>
      </tr>
    `
      )
      .join("") || '<tr><td colspan="7" class="empty-state">No manager access requests.</td></tr>'
  );
}

async function unlockGoal(id) {
  try {
    await apiFetch(`/goals/${id}/unlock`, {
      method: "POST",
      body: JSON.stringify({})
    });
    showToast("Goal unlocked successfully", "success");
    await loadAdminDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function approveAccessRequest(id) {
  try {
    await apiFetch(`/goals/${id}/grant-access`, {
      method: "POST",
      body: JSON.stringify({})
    });
    showToast("24-hour access granted", "success");
    await loadAdminDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function populateAdminDepartmentFilter(goals) {
  const filter = document.getElementById("admin-goal-department");
  if (!filter) {
    return;
  }

  const departments = [...new Set(goals.map((goal) => goal.ownerId?.department).filter(Boolean))];
  filter.innerHTML = sanitizeHTML(
    '<option value="">All Departments</option>' +
    departments.map((department) => `<option value="${department}">${department}</option>`).join("")
  );
}

function renderAdminGoalTable() {
  const goals = mergeGoalsForDisplay(window.adminGoals || []);
  const search = (document.getElementById("admin-goal-search")?.value || "").toLowerCase();
  const department = document.getElementById("admin-goal-department")?.value || "";

  const filtered = goals.filter((goal) => {
    const matchesSearch =
      !search ||
      goal.title.toLowerCase().includes(search) ||
      goal.ownerId?.name?.toLowerCase().includes(search) ||
      goal.thrustArea.toLowerCase().includes(search);
    const matchesDepartment = !department || goal.ownerId?.department === department;
    return matchesSearch && matchesDepartment;
  });

  document.getElementById("admin-goal-management-body").innerHTML = filtered
    .map((goal) => {
      const isDraftPhase = ["Draft", "Submitted", "Rework"].includes(goal.status);
      return `
      <tr>
        <td>${goal.sharedGoal ? `Shared Group (${goal.mergedCount})` : goal.ownerId?.name || ""}</td>
        <td>${goal.ownerId?.department || ""}</td>
        <td><button class="btn btn-secondary" onclick="openGoalDetailsModal('${goal._id}')">${goal.title}</button></td>
        <td>${goal.thrustArea}</td>
        <td>
          ${
            isDraftPhase
              ? `<input class="inline-edit-input" id="admin-target-${goal._id}" type="number" min="0" value="${goal.target}">`
              : goal.target
          }
        </td>
        <td>
          ${
            isDraftPhase
              ? `<input class="inline-edit-input" id="admin-weight-${goal._id}" type="number" min="0" max="100" value="${goal.weightage}">`
              : `${goal.weightage}%`
          }
        </td>
        <td>${goal.status}</td>
        <td class="inline-actions">
          ${
            isDraftPhase
              ? `<button class="btn btn-primary" onclick="saveAdminInlineGoal('${goal._id}')">Save</button>
                 <button class="btn btn-warning" onclick="returnAdminGoalForRework('${goal._id}')">Rework</button>`
              : `<button class="btn btn-secondary" onclick="openGoalDetailsModal('${goal._id}')">Manage</button>`
          }
        </td>
      </tr>
    `;
    })
    .join("");
}

async function saveAdminInlineGoal(goalId) {
  const target = Number(document.getElementById(`admin-target-${goalId}`).value);
  const weightage = Number(document.getElementById(`admin-weight-${goalId}`).value);

  try {
    await apiFetch(`/goals/${goalId}/admin-update`, {
      method: "PUT",
      body: JSON.stringify({ target, weightage })
    });
    showToast("Goal updated", "success");
    await loadAdminDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function returnAdminGoalForRework(goalId) {
  try {
    await apiFetch(`/goals/${goalId}/reject`, {
      method: "POST",
      body: JSON.stringify({ action: "return_rework", comment: "Returned by admin for rework." })
    });
    showToast("Goal returned for rework", "success");
    await loadAdminDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

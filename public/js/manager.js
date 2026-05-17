document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("Manager");
  if (!user) return;

  setSidebar("dashboard");
  setHeader("");
  fillUserPanel();

  document.getElementById("logout-btn")?.addEventListener("click", logout);
  document
    .getElementById("push-shared-btn")
    ?.addEventListener("click", () => openModal("shared-goal-modal"));
  document
    .getElementById("close-shared-modal")
    ?.addEventListener("click", () => closeModal("shared-goal-modal"));
  document
    .getElementById("shared-goal-form")
    ?.addEventListener("submit", submitSharedGoal);
  document
    .getElementById("assign-existing-form")
    ?.addEventListener("submit", assignExistingGoal);

  window.pageRefresh = loadManagerDashboard;

  try {
    await loadManagerDashboard();
    startAutoRefresh(loadManagerDashboard);
  } catch (error) {
    showToast(error.message, "error");
  }
});

async function loadManagerDashboard() {
  const data = await apiFetch("/manager/team-goals");
  window.managerDashboardData = data;
  renderManagerDashboard(data);
  renderTeamSelect(data.teamMembers || []);
  handleGoalDeepLink();
}

async function submitSharedGoal(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  payload.employeeIds = Array.from(
    document.getElementById("employeeIds").selectedOptions,
  ).map((option) => option.value);
  payload.target = Number(payload.target);
  payload.weightage = Number(payload.weightage);

  if (payload.weightage < 0 || payload.weightage > 100) {
    showToast("Weightage must be between 0 and 100", "error");
    return;
  }

  if (payload.target < 0) {
    showToast("Target cannot be below 0", "error");
    return;
  }

  try {
    await apiFetch("/goals/shared/push", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("Shared goal assigned successfully", "success");
    event.target.reset();
    closeModal("shared-goal-modal");
    await loadManagerDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderTeamSelect(teamMembers) {
  const select = document.getElementById("employeeIds");
  if (!select) {
    return;
  }

  select.innerHTML = sanitizeHTML(teamMembers
    .map(
      (member) =>
        `<option value="${member._id}">${member.name} - ${member.department}</option>`,
    )
    .join(""));
}

function renderManagerDashboard(data) {
  document.getElementById("stats").innerHTML = sanitizeHTML(`
    <div class="card stat-card highlight"><span>Team Members</span><strong>${data.teamMembers.length}</strong><div class="mini-note">Only your department team is visible here.</div></div>
    <div class="card stat-card"><span>Team Goals</span><strong>${data.summary.totalGoals}</strong></div>
    <div class="card stat-card"><span>Pending Approvals</span><strong>${data.summary.pendingApprovals}</strong></div>
    <div class="card stat-card"><span>Check-Ins Done</span><strong>${data.summary.completedCheckins}</strong></div>
  `);

  const mergedGoals = mergeGoalsForDisplay(data.goals || []);
  const rows = mergedGoals
    .map((goal) => {
      const latestCheckin =
        goal.checkins && goal.checkins.length
          ? goal.checkins[goal.checkins.length - 1]
          : null;
      const isDraftPhase = ["Draft", "Submitted", "Rework"].includes(
        goal.status,
      );
      const isApproved = goal.status === "Approved" || goal.locked;
      const mergedMeta =
        goal.sharedGoal && goal.mergedCount > 1
          ? `<div class="read-only-chip">Shared Goal · ${goal.mergedCount} employees</div>
             <div class="small-text muted">${goal.mergedEmployeeNames.join(", ")}</div>`
          : goal.sharedGoal
            ? '<div class="read-only-chip">Shared Goal</div>'
            : "";

      return `
      <tr>
        <td>${goal.sharedGoal ? `Shared Group (${goal.mergedCount})` : goal.ownerId?.name || ""}</td>
        <td>
          <button class="btn btn-secondary" onclick="openGoalDetailsModal('${goal._id}')">${goal.title}</button>
          <div class="small-text muted">${goal.thrustArea} · ${goal.uom}</div>
          ${mergedMeta}
        </td>
        <td>
          ${
            isDraftPhase
              ? `<input class="inline-edit-input" id="mgr-target-${goal._id}" type="number" min="0" value="${goal.target}">
                 <div class="small-text muted">Actual: ${goal.actuals || 0}</div>`
              : `<div class="small-text"><strong>Planned:</strong> ${goal.target}</div>
                 <div class="small-text muted"><strong>Actual:</strong> ${goal.actuals || 0}</div>`
          }
        </td>
        <td>
          ${
            isDraftPhase
              ? `<input class="inline-edit-input" id="mgr-weight-${goal._id}" type="number" min="0" max="100" value="${goal.weightage}">`
              : `${goal.weightage}%`
          }
        </td>
        <td>${formatStatus(goal.status)}</td>
        <td>
          <div class="small-text"><strong>Status:</strong> ${goal.progressStatus || "Not Started"}</div>
          <div class="small-text"><strong>Score:</strong> ${Math.round(goal.progressScore || 0)}%</div>
          <div class="small-text muted">${latestCheckin?.managerComment ? latestCheckin.managerComment.replace(/\n/g, "<br>") : "No structured check-in comment yet."}</div>
        </td>
        <td class="inline-actions">
          ${
            isDraftPhase
              ? `<button class="btn btn-primary" onclick="saveManagerInlineReview('${goal._id}')">Save</button>
                 <button class="btn btn-warning" onclick="returnGoalForRework('${goal._id}')">Rework</button>`
              : isApproved
                ? `<button class="btn btn-secondary" onclick="requestManagerAccess('${goal._id}')">Request 24h Access</button>`
                : ""
          }
          <button class="btn btn-secondary" onclick="openManagerCheckinModal('${goal._id}', '${goal.title.replace(/'/g, "\\'")}')">Check-In Note</button>
          <button class="btn btn-secondary" onclick="openAssignExistingModal('${goal._id}', '${goal.title.replace(/'/g, "\\'")}')">Add Employees</button>
        </td>
      </tr>
    `;
    })
    .join("");

  document.getElementById("team-goal-body").innerHTML =
    rows ||
    '<tr><td colspan="7" class="empty-state">No team goals available.</td></tr>';
}

async function saveManagerInlineReview(goalId) {
  const target = Number(document.getElementById(`mgr-target-${goalId}`).value);
  const weightage = Number(
    document.getElementById(`mgr-weight-${goalId}`).value,
  );

  try {
    await apiFetch(`/goals/${goalId}/review`, {
      method: "PUT",
      body: JSON.stringify({ target, weightage }),
    });
    showToast("Draft goal updated", "success");
    await loadManagerDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function returnGoalForRework(goalId) {
  try {
    await apiFetch(`/goals/${goalId}/reject`, {
      method: "POST",
      body: JSON.stringify({
        action: "return_rework",
        comment: "Returned from manager dashboard for rework.",
      }),
    });
    showToast("Goal returned for rework", "success");
    await loadManagerDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function requestManagerAccess(goalId) {
  try {
    await apiFetch(`/goals/${goalId}/request-access`, {
      method: "POST",
      body: JSON.stringify({
        comment: "Need a temporary edit window for an approved goal.",
      }),
    });
    showToast("Admin access request sent", "success");
    await loadManagerDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function openAssignExistingModal(id, title) {
  document.getElementById("assignExistingGoalId").value = id;
  document.getElementById("assign-existing-title").textContent =
    `Extend Goal · ${title}`;
  renderAssignmentRows();
  openModal("assign-existing-modal");
}

function renderAssignmentRows() {
  const teamSelect = document.getElementById("employeeIds");
  const rows = Array.from(teamSelect.options)
    .map(
      (option) => `
      <div class="assignment-row">
        <label><input type="checkbox" data-assign-check value="${option.value}"> ${option.textContent}</label>
        <input type="number" min="0" max="100" data-assign-weight="${option.value}" placeholder="Weightage">
      </div>
    `,
    )
    .join("");

  document.getElementById("assignment-rows").innerHTML = sanitizeHTML(rows);
}

async function assignExistingGoal(event) {
  event.preventDefault();
  const goalId = document.getElementById("assignExistingGoalId").value;
  const assignments = Array.from(
    document.querySelectorAll("[data-assign-check]:checked"),
  )
    .map((checkbox) => ({
      employeeId: checkbox.value,
      weightage: Number(
        document.querySelector(`[data-assign-weight="${checkbox.value}"]`)
          .value,
      ),
    }))
    .filter((item) => item.weightage >= 0);

  if (!assignments.length) {
    showToast("Select employees and set their weightage", "error");
    return;
  }

  try {
    await apiFetch(`/goals/${goalId}/share-existing`, {
      method: "POST",
      body: JSON.stringify({ assignments }),
    });
    showToast("Goal extended to selected employees", "success");
    closeModal("assign-existing-modal");
    await loadManagerDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function openManagerCheckinModal(id, title) {
  document.getElementById("managerCheckinGoalId").value = id;
  document.getElementById("manager-checkin-title").textContent =
    `Manager Check-In · ${title}`;
  document.getElementById("manager-summary").value = "";
  document.getElementById("manager-feedback").value = "";
  document.getElementById("manager-next-step").value = "";
  openModal("manager-checkin-modal");
}

async function saveManagerCheckinComment() {
  const goalId = document.getElementById("managerCheckinGoalId").value;
  const payload = {
    summary: document.getElementById("manager-summary").value.trim(),
    comment: document.getElementById("manager-feedback").value.trim(),
    nextStep: document.getElementById("manager-next-step").value.trim(),
  };

  try {
    await apiFetch(`/manager/team-goals/${goalId}/checkin-comment`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("Structured check-in comment saved", "success");
    closeModal("manager-checkin-modal");
    await loadManagerDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

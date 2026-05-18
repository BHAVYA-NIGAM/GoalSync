document.addEventListener("DOMContentLoaded", async () => {
  let user = requireAuth();
  if (!user) return;

  const liveUser = await syncSessionUser();
  if (!liveUser) return;
  user = liveUser;

  setSidebar("goals");
  setHeader(
    "Goal Setup",
    user.role === "Employee"
      ? "Create draft goals, validate weightage, and submit for approval."
      : "Review active goals and open goal details from the shared list."
  );
  fillUserPanel();

  document.getElementById("logout-btn")?.addEventListener("click", logout);
  document.getElementById("goal-form")?.addEventListener("submit", handleGoalSubmit);
  document.getElementById("submit-all-btn")?.addEventListener("click", submitAllGoals);
  window.pageRefresh = loadGoals;

  if (user.role !== "Employee") {
    document.getElementById("goal-form-card").style.display = "none";
    document.getElementById("submit-all-btn").style.display = "none";
  }

  loadGoals();
  startAutoRefresh(loadGoals);
});

let currentGoals = [];

async function loadGoals() {
  try {
    const data = await apiFetch("/goals");
    currentGoals = data.goals || [];
    renderGoals(data.goals || [], data.currentWindow);
    handleGoalDeepLink();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderGoals(goals, currentWindow) {
  document.getElementById("window-badge").textContent = `${currentWindow.label}`;

  const totalWeightage = goals
    .filter((goal) => ["Draft", "Submitted", "Approved", "Rework", "Completed"].includes(goal.status))
    .reduce((sum, goal) => sum + Number(goal.weightage || 0), 0);

  const remainingWeightage = Math.max(0, 100 - totalWeightage);
  document.getElementById("weightage-summary").textContent = `Used weightage: ${totalWeightage}% · Available: ${remainingWeightage}%`;

  const rows = goals
    .map(
      (goal) => `
      <tr>
        <td>${goal.thrustArea}</td>
        <td><button class="btn btn-secondary" onclick="openGoalDetailsModal('${goal._id}')">${goal.title}</button>${goal.sharedGoal ? ' <span class="badge">Shared</span>' : ""}</td>
        <td>${goal.uom}</td>
        <td>${goal.target}</td>
        <td>${goal.weightage}%</td>
        <td>${formatStatus(goal.status)}</td>
        <td class="inline-actions">
          ${
            getUser().role === "Employee"
              ? `
            ${goal.locked || goal.status === "Approved" ? "" : `<button class="btn btn-danger" onclick="removeGoal('${goal._id}')">Delete</button>`}
          `
              : ""
          }
        </td>
      </tr>
    `
    )
    .join("");

  document.getElementById("goal-list-body").innerHTML = sanitizeHTML(rows ||
    '<tr><td colspan="6" class="empty-state">No goals found.</td></tr>');
}

async function handleGoalSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  payload.target = Number(payload.target);
  payload.weightage = Number(payload.weightage);
  payload.deadline = payload.deadline || null;
  const id = document.getElementById("goalId").value;

  if (payload.weightage < 0 || payload.weightage > 100) {
    showToast("Weightage must be between 0 and 100", "error");
    return;
  }

  if (payload.target < 0) {
    showToast("Target cannot be below 0", "error");
    return;
  }

  const usedWeightage = currentGoals
    .filter((goal) => ["Draft", "Submitted", "Approved", "Rework", "Completed"].includes(goal.status))
    .filter((goal) => goal._id !== id)
    .reduce((sum, goal) => sum + Number(goal.weightage || 0), 0);

  if (usedWeightage + payload.weightage > 100) {
    showToast(`Only ${Math.max(0, 100 - usedWeightage)}% weightage is available`, "error");
    return;
  }

  const method = id ? "PUT" : "POST";
  const url = id ? `/goals/${id}` : "/goals";

  try {
    await apiFetch(url, {
      method,
      body: JSON.stringify(payload)
    });
    event.target.reset();
    document.getElementById("goalId").value = "";
    showToast(id ? "Goal updated" : "Goal created", "success");
    await loadGoals();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function removeGoal(id) {
  if (!confirm("Delete this draft goal?")) {
    return;
  }

  try {
    await apiFetch(`/goals/${id}`, { method: "DELETE" });
    showToast("Goal deleted", "success");
    await loadGoals();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function submitAllGoals() {
  try {
    await apiFetch("/goals/submit-all", {
      method: "POST",
      body: JSON.stringify({ comment: "Submitted from GoalSync portal" })
    });
    showToast("Goals submitted for approval", "success");
    await loadGoals();
  } catch (error) {
    showToast(error.message, "error");
  }
}

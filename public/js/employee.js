document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("Employee");
  if (!user) return;

  setSidebar("dashboard");
  setHeader("");
  fillUserPanel();

  document.getElementById("logout-btn")?.addEventListener("click", logout);
  window.pageRefresh = loadEmployeeDashboard;

  try {
    await loadEmployeeDashboard();
    startAutoRefresh(loadEmployeeDashboard);
  } catch (error) {
    showToast(error.message, "error");
  }
});

async function loadEmployeeDashboard() {
  const [goalData, notificationData] = await Promise.all([
    apiFetch("/goals"),
    apiFetch("/auth/notifications"),
  ]);
  renderEmployeeDashboard(
    goalData.goals || [],
    notificationData.notifications || [],
  );
  handleGoalDeepLink();
}

function renderEmployeeDashboard(goals, notifications) {
  const totalGoals = goals.length;
  const pendingApprovals = goals.filter(
    (goal) => goal.status === "Submitted",
  ).length;
  const sharedGoals = goals.filter((goal) => goal.sharedGoal).length;
  const averageProgress = goals.length
    ? Math.round(
        goals.reduce((sum, goal) => sum + Number(goal.progressScore || 0), 0) /
          goals.length,
      )
    : 0;

  document.getElementById("stats").innerHTML = sanitizeHTML(`
    <div class="card stat-card"><span>Total Goals</span><strong>${totalGoals}</strong></div>
    <div class="card stat-card"><span>Pending Approvals</span><strong>${pendingApprovals}</strong></div>
    <div class="card stat-card"><span>Shared Goals</span><strong>${sharedGoals}</strong></div>
    <div class="card stat-card"><span>Achievement %</span><strong>${averageProgress}%</strong></div>
  `);

  const notificationList = notifications
    .slice(0, 5)
    .map(
      (item) => `
      <button class="notification-item notification-link-button ${item.read ? "" : "notification-item-unread"}" type="button" onclick="openNotificationTarget('${(item.link || "").replace(/'/g, "\\'")}')">
        <strong>${item.title}</strong>
        <p class="muted small-text">${item.message}</p>
      </button>
    `,
    )
    .join("");

  document.getElementById("notifications").innerHTML = sanitizeHTML(
    notificationList ||
    '<div class="empty-state">No notifications available.</div>'
  );

  const rows = goals
    .map(
      (goal) => `
      <tr>
        <td>${goal.thrustArea}</td>
        <td><button class="btn btn-secondary" onclick="openGoalDetailsModal('${goal._id}')">${goal.title}</button></td>
        <td>${formatStatus(goal.status)}</td>
        <td>${goal.weightage}%</td>
        <td>${goal.actuals || 0}</td>
        <td>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${Math.min(goal.progressScore || 0, 100)}%"></div>
          </div>
          <div class="small-text muted">${Math.round(goal.progressScore || 0)}%</div>
        </td>
      </tr>
    `,
    )
    .join("");

  document.getElementById("goal-table-body").innerHTML = sanitizeHTML(
    rows || '<tr><td colspan="6" class="empty-state">No goals available yet.</td></tr>'
  );
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth();
  if (!user) return;

  setSidebar("audit");
  setHeader("Audit Log", "Review data changes, escalations, and governance history.");
  fillUserPanel();
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  window.pageRefresh = loadAuditData;

  if (user.role !== "Admin") {
    window.location.href = user.role === "Manager"
      ? "/public/pages/manager-dashboard.html"
      : "/public/pages/employee-dashboard.html";
    return;
  }

  try {
    await loadAuditData();
    startAutoRefresh(loadAuditData);
  } catch (error) {
    showToast(error.message, "error");
  }
});

async function loadAuditData() {
  const [logs, escalations] = await Promise.all([apiFetch("/admin/audit-logs"), apiFetch("/admin/escalations")]);
  renderAudit(logs, escalations);
}

function renderAudit(logs, escalations) {
  document.getElementById("audit-body").innerHTML = sanitizeHTML(logs
    .map(
      (log) => `
      <tr>
        <td>${log.userId?.name || "System"}</td>
        <td>${log.action}</td>
        <td><pre class="small-text">${JSON.stringify(log.before || {}, null, 2)}</pre></td>
        <td><pre class="small-text">${JSON.stringify(log.after || {}, null, 2)}</pre></td>
        <td>${new Date(log.timestamp).toLocaleString()}</td>
      </tr>
    `
    )
    .join("") || '<tr><td colspan="5" class="empty-state">No audit records available yet.</td></tr>');

  document.getElementById("escalation-body").innerHTML = sanitizeHTML(escalations
    .map(
      (item) => `
      <tr>
        <td>${item.triggeredBy}</td>
        <td>${item.targetUserId?.name || ""}</td>
        <td>${item.goalId?.title || "-"}</td>
        <td>${item.message}</td>
        <td>${item.resolved ? "Resolved" : "Open"}</td>
      </tr>
    `
    )
    .join("") || '<tr><td colspan="5" class="empty-state">No escalation records available yet.</td></tr>');
}

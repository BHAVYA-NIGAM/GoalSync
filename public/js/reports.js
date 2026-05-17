document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth();
  if (!user) return;

  setSidebar("reports");
  setHeader("Reports", "Filter achievement data and export hackathon-friendly reports.");
  fillUserPanel();
  populateDepartmentSelect(document.getElementById("report-department"));
  document.getElementById("logout-btn")?.addEventListener("click", logout);

  if (user.role !== "Admin") {
    window.location.href = user.role === "Manager"
      ? "/public/pages/manager-dashboard.html"
      : "/public/pages/employee-dashboard.html";
    return;
  }

  document.getElementById("filter-form")?.addEventListener("submit", loadReports);
  document.getElementById("export-csv-btn")?.addEventListener("click", () => exportReport("csv"));
  document.getElementById("export-excel-btn")?.addEventListener("click", () => exportReport("excel"));
  window.pageRefresh = loadReports;

  loadReports();
  startAutoRefresh(loadReports);
});

async function loadReports(event) {
  if (event) {
    event.preventDefault();
  }

  const params = new URLSearchParams(new FormData(document.getElementById("filter-form")));

  try {
    const rows = await apiFetch(`/admin/reports?${params.toString()}`);
    document.getElementById("report-body").innerHTML = sanitizeHTML(rows.length > 0 ? rows
      .map(
        (row) => `
        <tr>
          <td>${row.employee}</td>
          <td>${row.department}</td>
          <td>${row.title}</td>
          <td>${row.status}</td>
          <td>${row.target}</td>
          <td>${row.actuals}</td>
          <td>${row.progressScore}</td>
        </tr>
      `
      )
      .join("") : '<tr><td colspan="7" class="empty-state">No records found.</td></tr>');
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function exportReport(type) {
  const params = new URLSearchParams(new FormData(document.getElementById("filter-form")));
  params.append("export", type);

  try {
    const blob = await apiFetch(`/admin/reports?${params.toString()}`);
    downloadBlob(blob, type === "csv" ? "achievement-report.csv" : "achievement-report.xls");
  } catch (error) {
    showToast(error.message, "error");
  }
}

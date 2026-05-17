document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth();
  if (!user) return;

  setSidebar("analytics");
  setHeader("Analytics", "See QoQ movement, completion trends, and distribution insights.");
  fillUserPanel();
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  window.pageRefresh = loadAnalytics;

  try {
    await loadAnalytics();
    startAutoRefresh(loadAnalytics);
  } catch (error) {
    showToast(error.message, "error");
  }
});

async function loadAnalytics() {
  const user = getUser();
  const [goalData, adminData] = await Promise.all([
    apiFetch("/goals"),
    user.role === "Admin" ? apiFetch("/admin/dashboard") : Promise.resolve(null)
  ]);

  renderAnalytics(goalData.goals || [], adminData);
}

function buildChart(ctxId, config) {
  const canvas = document.getElementById(ctxId);
  if (!canvas) {
    return null;
  }

  if (!window.analyticsCharts) {
    window.analyticsCharts = {};
  }

  if (window.analyticsCharts[ctxId]) {
    window.analyticsCharts[ctxId].destroy();
  }

  window.analyticsCharts[ctxId] = new Chart(canvas, config);
  return window.analyticsCharts[ctxId];
}

function renderAnalytics(goals, adminData) {
  const qoq = ["Q1", "Q2", "Q3", "Q4"].map((quarter) => {
    const matching = goals.filter((goal) => goal.checkins.some((item) => item.quarter === quarter));
    if (!matching.length) return 0;
    const score = matching.reduce((sum, goal) => {
      const item = goal.checkins.find((checkin) => checkin.quarter === quarter);
      return sum + Number(item?.score || 0);
    }, 0);
    return Math.round(score / matching.length);
  });

  const statusCounts = {
    Draft: 0,
    Submitted: 0,
    Approved: 0,
    Rework: 0,
    Rejected: 0
  };
  const uomCounts = {};
  const thrustCounts = {};

  goals.forEach((goal) => {
    statusCounts[goal.status] = (statusCounts[goal.status] || 0) + 1;
    uomCounts[goal.uom] = (uomCounts[goal.uom] || 0) + 1;
    thrustCounts[goal.thrustArea] = (thrustCounts[goal.thrustArea] || 0) + 1;
  });

  buildChart("qoqChart", {
    type: "line",
    data: {
      labels: ["Q1", "Q2", "Q3", "Q4"],
      datasets: [
        {
          label: "Average Quarterly Score",
          data: qoq,
          borderColor: "#1f4b99",
          backgroundColor: "rgba(31,75,153,0.12)",
          fill: true,
          tension: 0.3
        }
      ]
    }
  });

  buildChart("distributionChart", {
    type: "bar",
    data: {
      labels: Object.keys(statusCounts),
      datasets: [
        {
          label: "Goal Count",
          data: Object.values(statusCounts),
          backgroundColor: ["#8bb2ff", "#6ab7ff", "#60c5a8", "#ffcc80", "#ef9a9a"]
        }
      ]
    }
  });

  const departmentLabels = adminData ? adminData.departmentAnalytics.map((item) => item.department) : ["Engineering", "Sales", "HR"];
  const departmentValues = adminData ? adminData.departmentAnalytics.map((item) => item.completion) : [74, 61, 88];

  buildChart("departmentChart", {
    type: "doughnut",
    data: {
      labels: departmentLabels,
      datasets: [
        {
          data: departmentValues,
          backgroundColor: ["#1f4b99", "#0f9d7a", "#d97706", "#9b59b6"]
        }
      ]
    }
  });

  const managerRows = goals.reduce((map, goal) => {
    const name = goal.managerId?.name || "Manager";
    if (!map[name]) {
      map[name] = [];
    }
    map[name].push(goal.progressScore || 0);
    return map;
  }, {});

  const managerLabels = Object.keys(managerRows);
  const managerValues = managerLabels.map((name) => {
    const values = managerRows[name];
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  });

  buildChart("managerChart", {
    type: "radar",
    data: {
      labels: managerLabels.length ? managerLabels : ["No Data"],
      datasets: [
        {
          label: "Manager Effectiveness",
          data: managerValues.length ? managerValues : [0],
          borderColor: "#0f9d7a",
          backgroundColor: "rgba(15,157,122,0.18)"
        }
      ]
    }
  });

  buildChart("uomChart", {
    type: "pie",
    data: {
      labels: Object.keys(uomCounts).length ? Object.keys(uomCounts) : ["No Data"],
      datasets: [
        {
          data: Object.keys(uomCounts).length ? Object.values(uomCounts) : [1],
          backgroundColor: ["#1f4b99", "#0f9d7a", "#d97706", "#ef4444", "#8b5cf6", "#14b8a6"]
        }
      ]
    }
  });

  const topThrustAreas = Object.entries(thrustCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  buildChart("thrustChart", {
    type: "bar",
    data: {
      labels: topThrustAreas.length ? topThrustAreas.map((item) => item[0]) : ["No Data"],
      datasets: [
        {
          label: "Goals",
          data: topThrustAreas.length ? topThrustAreas.map((item) => item[1]) : [0],
          backgroundColor: "#3367d6"
        }
      ]
    },
    options: {
      indexAxis: "y"
    }
  });
}

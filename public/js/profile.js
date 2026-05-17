document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth();
  if (!user) return;

  setSidebar("profile");
  setHeader("Profile", "Manage your account details and review access scope.");
  fillUserPanel();
  populateDepartmentSelect(document.getElementById("profile-department"), user.department);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  document.getElementById("profile-form")?.addEventListener("submit", saveProfile);

  try {
    const profile = await apiFetch("/auth/me");
    renderProfile(profile);
  } catch (error) {
    showToast(error.message, "error");
  }
});

function renderProfile(profile) {
  document.getElementById("profile-name").value = profile.name || "";
  document.getElementById("profile-email").value = profile.email || "";
  document.getElementById("profile-role").value = profile.role || "";
  document.getElementById("profile-department").value = profile.department || "";

  const summaryText = {
    Employee: [
      "You can view only your own goals, check-ins, and progress.",
      "You can edit draft or rework goals until they are approved."
    ],
    Manager: [
      "You can view only employees and goals assigned to you inside your department.",
      "You can approve, reject, comment on, and push shared goals to your own team."
    ],
    Admin: [
      "You can view all users, goals, audit logs, reports, analytics, and escalations.",
      "You can unlock approved goals and resolve escalations."
    ]
  };

  document.getElementById("profile-summary").innerHTML = sanitizeHTML((summaryText[profile.role] || [])
    .map((text) => `<li>${text}</li>`)
    .join(""));
}

async function saveProfile(event) {
  event.preventDefault();
  const payload = {
    name: document.getElementById("profile-name").value.trim(),
    department: document.getElementById("profile-department").value,
    password: document.getElementById("profile-password").value
  };

  try {
    const data = await apiFetch("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    localStorage.setItem("user", JSON.stringify(data.user));
    fillUserPanel();
    document.getElementById("profile-password").value = "";
    showToast("Profile updated successfully", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

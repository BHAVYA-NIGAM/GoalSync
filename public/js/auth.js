document.addEventListener("DOMContentLoaded", async () => {
  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");
  const managerSelect = document.getElementById("managerId");
  const departmentSelect = document.getElementById("department");
  const roleSelect = document.getElementById("role");
  const ssoButton = document.getElementById("sso-login-btn");

  hydrateSsoCallback();

  populateDepartmentSelect(departmentSelect);

  if (managerSelect) {
    try {
      const managers = await apiFetch("/auth/managers");
      const fillManagers = () => {
        const selectedDepartment = departmentSelect?.value || "";
        managerSelect.innerHTML = sanitizeHTML(
          '<option value="">Select a manager</option>' +
          managers
            .filter((manager) => !selectedDepartment || manager.department === selectedDepartment)
            .map(
              (manager) =>
                `<option value="${manager._id}">${manager.name} (${manager.role} - ${manager.department})</option>`
            )
            .join("")
        );
      };

      fillManagers();
      departmentSelect?.addEventListener("change", fillManagers);
      roleSelect?.addEventListener("change", () => {
        const managerField = managerSelect.closest(".field");
        const shouldHideManager = roleSelect.value !== "Employee";
        managerField.style.display = shouldHideManager ? "none" : "grid";

        if (shouldHideManager) {
          managerSelect.value = "";
        }
      });
      roleSelect?.dispatchEvent(new Event("change"));
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const payload = Object.fromEntries(formData.entries());

      try {
        const data = await apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        saveSession(data);
        redirectByRole(data.user.role);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const payload = Object.fromEntries(formData.entries());

      try {
        const data = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        saveSession(data);
        redirectByRole(data.user.role);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  }

  if (ssoButton) {
    ssoButton.addEventListener("click", () => {
      window.location.href = "/api/auth/entra/login";
    });
  }
});

function hydrateSsoCallback() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = hash.get("token");
  const user = hash.get("user");
  const error = hash.get("error");

  if (error) {
    showToast(decodeURIComponent(error), "error");
    history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  if (!token || !user) {
    return;
  }

  try {
    saveSession({
      token,
      user: JSON.parse(decodeURIComponent(user))
    });
    history.replaceState({}, document.title, window.location.pathname);
    redirectByRole(JSON.parse(decodeURIComponent(user)).role);
  } catch (parseError) {
    showToast("Unable to complete Microsoft login", "error");
  }
}

function redirectByRole(role) {
  const routeMap = {
    Employee: "/public/pages/employee-dashboard.html",
    Manager: "/public/pages/manager-dashboard.html",
    Admin: "/public/pages/admin-dashboard.html"
  };

  window.location.href = routeMap[role] || "/public/pages/login.html";
}

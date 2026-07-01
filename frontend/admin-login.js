// TSMS - Admin Login Controller
document.addEventListener("DOMContentLoaded", () => {
  const state = {
    currentLanguage: "en",
    currentTheme: "dark"
  };

  const STORAGE_KEYS = {
    LANGUAGE: "tsms_lang",
    THEME: "tsms_theme",
    ADMIN_LOGGED_IN: "tsms_admin_logged_in",
    TSMS_TOKEN: "tsms_token"
  };

  // --- INITIALIZATION ---
  function init() {
    loadSettings();
    setupEventListeners();
  }

  // Load theme & language settings
  function loadSettings() {
    state.currentLanguage = localStorage.getItem(STORAGE_KEYS.LANGUAGE) || "en";
    state.currentTheme = localStorage.getItem(STORAGE_KEYS.THEME) || "dark";
    
    document.getElementById("language-select").value = state.currentLanguage;
    translateApp(state.currentLanguage);

    if (state.currentTheme === "light") {
      document.body.classList.add("light-theme");
      document.getElementById("theme-toggle-icon").innerText = "🌙";
    } else {
      document.body.classList.remove("light-theme");
      document.getElementById("theme-toggle-icon").innerText = "☀️";
    }
  }

  // Translate App
  function translateApp(lang) {
    state.currentLanguage = lang;
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
    
    const dict = window.TSMS_MOCK_DATA.translations[lang] || window.TSMS_MOCK_DATA.translations.en;
    document.title = dict.title ? `${dict.title} | Admin Access` : "TSMS | Secure Admin Access";

    document.querySelectorAll("[data-translate]").forEach(elem => {
      const key = elem.getAttribute("data-translate");
      if (dict[key]) {
        if (elem.tagName === "INPUT" || elem.tagName === "TEXTAREA") {
          elem.placeholder = dict[key];
        } else {
          elem.innerHTML = dict[key];
        }
      }
    });
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Language Select
    document.getElementById("language-select").addEventListener("change", (e) => {
      translateApp(e.target.value);
    });

    // Theme Toggle
    document.getElementById("theme-toggle-btn").addEventListener("click", () => {
      if (document.body.classList.contains("light-theme")) {
        document.body.classList.remove("light-theme");
        document.getElementById("theme-toggle-icon").innerText = "☀️";
        state.currentTheme = "dark";
      } else {
        document.body.classList.add("light-theme");
        document.getElementById("theme-toggle-icon").innerText = "🌙";
        state.currentTheme = "light";
      }
      localStorage.setItem(STORAGE_KEYS.THEME, state.currentTheme);
    });

    // Admin Login Form Submit
    document.getElementById("admin-login-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const username = document.getElementById("a-login-user").value.trim();
      const password = document.getElementById("a-login-pass").value;
      const errorDiv = document.getElementById("admin-login-error");

      errorDiv.style.display = "none";

      fetch("/api/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      })
        .then(res => {
          if (!res.ok) {
            return res.json().then(err => { throw new Error(err.error || "Login failed."); });
          }
          return res.json();
        })
        .then(data => {
          localStorage.setItem(STORAGE_KEYS.ADMIN_LOGGED_IN, "true");
          if (data.token) {
            localStorage.setItem(STORAGE_KEYS.TSMS_TOKEN, data.token);
          }
          showToast("Safe", `Successfully authorized! Welcoming ${data.admin.fullName}.`);
          setTimeout(() => {
            window.location.href = "/admin";
          }, 800);
        })
        .catch(err => {
          errorDiv.innerText = `⚠️ ${err.message}`;
          errorDiv.style.display = "block";
          showToast("Danger", err.message);
        });
    });
  }

  // Toast Notifier
  function showToast(level, message) {
    const container = document.getElementById("toast-notifications-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${level}`;
    let icon = "🔔";
    if (level === "Danger") icon = "🚨";
    else if (level === "Warning") icon = "⚠️";
    else if (level === "Safe") icon = "✅";

    toast.innerHTML = `<span style="font-size: 16px;">${icon}</span><div>${message}</div>`;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(50px)";
      toast.style.transition = "all 0.4s ease-out";
      setTimeout(() => { container.removeChild(toast); }, 400);
    }, 4000);
  }

  init();
});

window.togglePassword = function(id, el) {
  const input = document.getElementById(id);
  if (input.type === 'password') {
    input.type = 'text';
    el.innerText = '👁️‍🗨️';
  } else {
    input.type = 'password';
    el.innerText = '👁️';
  }
};

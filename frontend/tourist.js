// Tourist Safety & Smart Monitoring System (TSMS) - Tourist Portal Controller
document.addEventListener("DOMContentLoaded", () => {
  const state = {
    currentLanguage: "en",
    currentTheme: "dark",
    registeredTouristId: null,
    tourists: [],
    incidents: [],
    aiAlerts: [],
    activeSos: null, // Stores active SOS info if this tourist triggers it
    selectedSosType: "medical", // Default SOS type
    wearableConnected: false,
    wearableType: "",
    highRiskModeActive: false,
    socket: null
  };

  const STORAGE_KEYS = {
    LANGUAGE: "tsms_lang",
    THEME: "tsms_theme",
    ACTIVE_TOURIST_ID: "tsms_active_id"
  };

  // --- INITIALIZE APPLICATION ---
  function init() {
    // 1. Session Check
    state.registeredTouristId = localStorage.getItem(STORAGE_KEYS.ACTIVE_TOURIST_ID);
    if (!state.registeredTouristId) {
      window.location.href = "/login?role=tourist";
      return;
    }

    document.getElementById("header-user-badge").innerText = `Pass Active: ${state.registeredTouristId}`;

    loadSettings();
    setupEventListeners();
    
    // Fetch initial database state from Node server
    fetchStateFromServer(() => {
      translateApp(state.currentLanguage);
      syncUI();
      setupWebSocket();
    });
  }

  // Load styling & session configs
  function loadSettings() {
    state.currentLanguage = localStorage.getItem(STORAGE_KEYS.LANGUAGE) || "en";
    state.currentTheme = localStorage.getItem(STORAGE_KEYS.THEME) || "dark";
    
    document.getElementById("language-select").value = state.currentLanguage;
    
    if (state.currentTheme === "light") {
      document.body.classList.add("light-theme");
      document.getElementById("theme-toggle-icon").innerText = "🌙";
    } else {
      document.body.classList.remove("light-theme");
      document.getElementById("theme-toggle-icon").innerText = "☀️";
    }
  }

  // HTTP API: Fetch state from backend
  function fetchStateFromServer(callback) {
    const token = localStorage.getItem("tsms_token");
    fetch("/api/state", {
      headers: { "Authorization": "Bearer " + token }
    })
      .then((res) => {
        if (!res.ok) throw new Error("HTTP error fetching system state.");
        return res.json();
      })
      .then((data) => {
        state.tourists = data.tourists;
        state.incidents = data.incidents;
        state.aiAlerts = data.aiAlerts;
        
        // Restore local tourist's active wearable state
        const tourist = state.tourists.find((t) => t.id === state.registeredTouristId);
        if (tourist) {
          state.wearableConnected = tourist.wearableConnected;
          state.wearableType = tourist.wearableType;
          state.highRiskModeActive = tourist.highRiskModeActive;
          
          // Check if they are in distress
          if (tourist.status === "Distress") {
            const activeSos = state.incidents.find(i => i.touristId === tourist.id && i.status === "Active");
            state.activeSos = activeSos || null;
          } else {
            state.activeSos = null;
          }
        } else {
          // If the ID was deleted from database, log out
          logout();
          return;
        }
        
        if (callback) callback();
      })
      .catch((err) => {
        console.error("Database connection failure:", err);
        showToast("Warning", "Server database offline. Retrying...");
        setTimeout(() => fetchStateFromServer(callback), 4000);
      });
  }

  // WEBSOCKETS STATE SYNC HUB
  function setupWebSocket() {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    state.socket = new WebSocket(`${wsProtocol}//${window.location.host}`);

    state.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("[WS] Received packet:", data);

      if (data.type === "state_update") {
        state.tourists = data.state.tourists;
        state.incidents = data.state.incidents;
        state.aiAlerts = data.state.aiAlerts;
        
        // Sync local wearable state & distress status
        const tourist = state.tourists.find((t) => t.id === state.registeredTouristId);
        if (tourist) {
          state.wearableConnected = tourist.wearableConnected;
          state.wearableType = tourist.wearableType;
          state.highRiskModeActive = tourist.highRiskModeActive;
          if (tourist.status === "Distress") {
            const activeSos = state.incidents.find(i => i.touristId === tourist.id && i.status === "Active");
            state.activeSos = activeSos || null;
          } else {
            state.activeSos = null;
          }
        }
        
        syncUI();
      } 
      else if (data.type === "sos_triggered") {
        state.tourists = data.state.tourists;
        state.incidents = data.state.incidents;
        state.aiAlerts = data.state.aiAlerts;

        if (data.incident.touristId === state.registeredTouristId) {
          state.activeSos = data.incident;
        }

        showToast("Danger", `🚨 SOS EMERGENCY TRIGGERED: ${data.incident.touristName} at ${data.incident.location}!`);
        syncUI();
      } 
      else if (data.type === "sos_resolved") {
        state.tourists = data.state.tourists;
        state.incidents = data.state.incidents;
        state.aiAlerts = data.state.aiAlerts;

        if (data.touristId === state.registeredTouristId) {
          state.activeSos = null;
        }

        showToast("Safe", `✅ Your SOS emergency has been marked as resolved.`);
        syncUI();
      }
    };

    state.socket.onclose = () => {
      console.warn("[WS] Socket disconnected. Reconnecting in 3s...");
      setTimeout(setupWebSocket, 3000);
    };
  }

  // --- TRANSLATION ENGINE ---
  function translateApp(lang) {
    state.currentLanguage = lang;
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
    
    const dict = window.TSMS_MOCK_DATA.translations[lang] || window.TSMS_MOCK_DATA.translations.en;
    document.title = dict.title ? `${dict.title} | Tourist Portal` : "TSMS | Tourist Portal";

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

    syncSosCountdownLabel();
  }

  function syncSosCountdownLabel() {
    const cancelBtn = document.getElementById("sos-cancel-btn");
    if (cancelBtn && cancelBtn.classList.contains("active")) {
      const dict = window.TSMS_MOCK_DATA.translations[state.currentLanguage];
      const count = cancelBtn.getAttribute("data-sec") || "3";
      cancelBtn.innerText = dict.sosCancelText.replace("{sec}", count);
    }
  }

  function syncUI() {
    renderTouristDashboard();
    syncSosButtonState();
    handleSirenOverlay();
  }

  // --- TOURIST PORTAL LOGIC ---
  function renderTouristDashboard() {
    const tourist = state.tourists.find(t => t.id === state.registeredTouristId);
    if (!tourist) return;

    document.getElementById("id-card-name").innerText        = tourist.fullName;
    document.getElementById("id-card-nationality").innerText = tourist.nationality;
    document.getElementById("id-card-passport").innerText    = tourist.passportNo;
    document.getElementById("id-card-id").innerText          = tourist.id;
    document.getElementById("id-card-serial").innerText      = tourist.id.replace("TSMS-", "SN-");

    // Status Badge Style
    const statusBadge = document.getElementById("id-card-status");
    statusBadge.className = "id-badge-status";

    const dict = window.TSMS_MOCK_DATA.translations[state.currentLanguage];
    if (tourist.status === "Safe") {
      statusBadge.innerText = dict.statusSafe;
      statusBadge.style.color = "var(--safe)";
      statusBadge.style.borderColor = "var(--safe)";
      statusBadge.style.backgroundColor = "var(--safe-glow)";
    } else if (tourist.status === "Distress") {
      statusBadge.innerText = dict.statusDistress;
      statusBadge.style.color = "var(--danger)";
      statusBadge.style.borderColor = "var(--danger)";
      statusBadge.style.backgroundColor = "var(--danger-glow)";
    } else if (tourist.status === "Warning") {
      statusBadge.innerText = dict.statusWarning;
      statusBadge.style.color = "var(--warning)";
      statusBadge.style.borderColor = "var(--warning)";
      statusBadge.style.backgroundColor = "var(--warning-glow)";
    } else {
      statusBadge.innerText = dict.statusInactive;
      statusBadge.style.color = "var(--inactive)";
      statusBadge.style.borderColor = "var(--inactive)";
      statusBadge.style.backgroundColor = "rgba(100, 116, 139, 0.15)";
    }

    // Draw Canvas QR code
    generateQRCodeCanvas("id-qr-canvas", `TSMS-ID-VALIDATOR:${tourist.id}`);

    // Sync Wearable UI
    syncWearableUI(tourist);
  }

  function syncWearableUI(tourist) {
    const pairControls = document.getElementById("wearable-pairing-controls");
    const statusPanel = document.getElementById("wearable-synced-status");
    const hrSync = document.getElementById("wearable-hr-sync");
    const batSync = document.getElementById("wearable-bat-sync");
    const highriskToggle = document.getElementById("wearable-highrisk-toggle");

    if (!pairControls || !statusPanel) return;

    if (state.wearableConnected) {
      pairControls.style.display = "none";
      statusPanel.style.display = "flex";
      
      hrSync.innerText = tourist.heartRate > 0 ? `${tourist.heartRate} bpm` : "72 bpm";
      batSync.innerText = `${tourist.battery}%`;
      highriskToggle.checked = state.highRiskModeActive;
      
      const dict = window.TSMS_MOCK_DATA.translations[state.currentLanguage];
      const nameLabel = dict.wearableStatusConnected || "Wearable Connected";
      document.getElementById("wearable-connected-label").innerText = `${nameLabel} (${state.wearableType})`;
    } else {
      pairControls.style.display = "flex";
      statusPanel.style.display = "none";
    }
  }

  // Visual QR Code generator
  function generateQRCodeCanvas(canvasId, textData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    
    let seed = 0;
    for (let i = 0; i < textData.length; i++) {
      seed += textData.charCodeAt(i);
    }
    function random() {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    }

    const modules = 21;
    const cellSize = Math.floor(size / modules);
    const offset = Math.floor((size - (modules * cellSize)) / 2);

    drawFinderPattern(ctx, offset, offset, cellSize);
    drawFinderPattern(ctx, offset + (modules - 7) * cellSize, offset, cellSize);
    drawFinderPattern(ctx, offset, offset + (modules - 7) * cellSize, cellSize);
    
    for (let i = 8; i < modules - 8; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(offset + i * cellSize, offset + 6 * cellSize, cellSize, cellSize);
        ctx.fillRect(offset + 6 * cellSize, offset + i * cellSize, cellSize, cellSize);
      }
    }
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if ((r < 8 && c < 8) || (r < 8 && c >= modules - 8) || (r >= modules - 8 && c < 8)) continue;
        if (r === 6 || c === 6) continue;
        if (random() > 0.5) {
          ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  function drawFinderPattern(ctx, x, y, cellSize) {
    ctx.fillRect(x, y, 7 * cellSize, 7 * cellSize);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + cellSize, y + cellSize, 5 * cellSize, 5 * cellSize);
    ctx.fillStyle = "#000000";
    ctx.fillRect(x + 2 * cellSize, y + 2 * cellSize, 3 * cellSize, 3 * cellSize);
  }

  // --- SOS EMERGENCY TRIGGER ---
  // Bypassed hold countdown for instant one-click activation


  function openSosConfirmModal() {
    const tourist = state.tourists.find(t => t.id === state.registeredTouristId);
    if (!tourist) return;

    const sosLabelMap = {
      medical: "Medical Emergency",
      accident: "Accident / Crash",
      security: "Security Threat / Theft",
      other: "Other Danger"
    };

    document.getElementById("sos-modal-name").innerText = tourist.fullName;
    document.getElementById("sos-modal-id").innerText = tourist.id;
    document.getElementById("sos-modal-type").innerText = sosLabelMap[state.selectedSosType] || "Emergency";

    document.getElementById("sos-confirm-modal").style.display = "flex";
  }

  function closeSosConfirmModal() {
    document.getElementById("sos-confirm-modal").style.display = "none";
    if (window.cancelCountdownTimer) clearInterval(cancelCountdownTimer);
  }

  // HTTP API POST: SOS Emergency Trigger
  function triggerSosEmergency() {
    if (!state.registeredTouristId) return;

    const tourist = state.tourists.find(t => t.id === state.registeredTouristId);
    if (!tourist) return;

    const sosLabelMap = {
      medical: "Medical Emergency",
      accident: "Accident / Crash",
      security: "Security Threat / Theft",
      other: "Other Danger"
    };
    const incidentType = sosLabelMap[state.selectedSosType] || "Emergency";
    
    const requestPayload = {
      touristId: tourist.id,
      incidentType: incidentType,
      location: (tourist.activity || "").includes("Hiking") ? "Mountain Ridge Coordinates" : "Coastal Bay Zone"
    };

    const sendSosRequest = (payload) => {
      fetch("/api/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(async res => {
          const newSos = await res.json();
          if (!res.ok || newSos.error) {
            throw new Error(newSos.error || "Backend query failure");
          }
          state.activeSos = newSos;
          closeSosConfirmModal();
          showToast("Danger", "SOS alert transmitted! Rescue units are being dispatched.");
        })
        .catch(err => {
          console.error("SOS transmission failure:", err);
          showToast("Danger", "SOS network error: " + (err.message || "Retrying offline bypass..."));
        });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          requestPayload.location = `Lat: ${position.coords.latitude.toFixed(5)}, Lng: ${position.coords.longitude.toFixed(5)}`;
          sendSosRequest(requestPayload);
        },
        (error) => {
          console.warn("Geolocation failed or denied:", error);
          sendSosRequest(requestPayload); // Fallback to default
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      sendSosRequest(requestPayload);
    }
  }

  function syncSosButtonState() {
    const sosBtn = document.getElementById("sos-trigger-btn");
    const countdownBtn = document.getElementById("sos-cancel-btn");
    const activeText = document.getElementById("sos-active-alert");
    const progressCircle = document.getElementById("sos-progress-circle");
    const dict = window.TSMS_MOCK_DATA.translations[state.currentLanguage];

    if (state.activeSos) {
      sosBtn.classList.add("active");
      sosBtn.querySelector(".sos-trigger-text").innerText = dict.sosActiveText;
      sosBtn.querySelector(".sos-trigger-subtext").style.display = "none";
      progressCircle.style.strokeDashoffset = "0";
      activeText.classList.add("active");
      
      countdownBtn.classList.add("active");
      countdownBtn.setAttribute("data-sec", "5");
      countdownBtn.innerText = dict.sosCancelText.replace("{sec}", "5");
    } else {
      sosBtn.classList.remove("active");
      if (!sosBtn.classList.contains("holding")) {
        sosBtn.querySelector(".sos-trigger-text").innerText = dict.sosButtonText;
        sosBtn.querySelector(".sos-trigger-subtext").style.display = "block";
        progressCircle.style.strokeDashoffset = "502";
      }
      activeText.classList.remove("active");
      countdownBtn.classList.remove("active");
    }
  }

  // Cancel SOS
  let cancelCountdownTimer = null;
  function startCancelSosFlow() {
    const countdownBtn = document.getElementById("sos-cancel-btn");
    const dict = window.TSMS_MOCK_DATA.translations[state.currentLanguage];
    if (cancelCountdownTimer) return;
    
    let countdownVal = 5;
    cancelCountdownTimer = setInterval(() => {
      countdownVal--;
      countdownBtn.setAttribute("data-sec", countdownVal);
      countdownBtn.innerText = dict.sosCancelText.replace("{sec}", countdownVal);
      
      if (countdownVal <= 0) {
        clearInterval(cancelCountdownTimer);
        cancelCountdownTimer = null;
        resolveSosEmergency();
      }
    }, 1000);
  }

  function stopCancelSosFlow() {
    if (cancelCountdownTimer) {
      clearInterval(cancelCountdownTimer);
      cancelCountdownTimer = null;
      syncSosButtonState();
    }
  }

  // HTTP API POST: SOS Emergency Resolve Cancel
  function resolveSosEmergency() {
    if (!state.registeredTouristId) return;

    const token = localStorage.getItem("tsms_token");
    fetch("/api/sos/cancel", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token 
      },
      body: JSON.stringify({ touristId: state.registeredTouristId })
    })
      .then(res => res.json())
      .then(() => {
        state.activeSos = null;
        showToast("Safe", "Emergency alert cancelled successfully.");
      })
      .catch(err => console.error("Cancel SOS error:", err));
  }

  // Handle Red Screen Flashing Overlay during active SOS
  function handleSirenOverlay() {
    const overlay = document.getElementById("siren-active-overlay");
    if (overlay) {
      overlay.style.display = state.activeSos ? "block" : "none";
    }
  }

  // --- LOGOUT ---
  function logout() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TOURIST_ID);
    showToast("Warning", "Logging out of Tourist Portal...");
    setTimeout(() => {
      window.location.href = "/login?role=tourist";
    }, 600);
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Logout Button
    document.getElementById("logout-btn").addEventListener("click", logout);

    // Language Select
    document.getElementById("language-select").addEventListener("change", (e) => {
      translateApp(e.target.value);
      syncUI();
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

    // Tourist Activity Update
    const updateActivityBtn = document.getElementById("update-activity-btn");
    if (updateActivityBtn) {
      updateActivityBtn.addEventListener("click", () => {
      if (!state.registeredTouristId) return;

      const activitySelect = document.getElementById("tourist-activity-select");
      const selectedOpt = activitySelect.options[activitySelect.selectedIndex];
      let activityText = selectedOpt.text;
      
      const activityNoteNode = document.getElementById("tourist-activity-note");
      const activityNote = activityNoteNode ? activityNoteNode.value.trim() : "";
      
      if (activityNote) {
        activityText += ` - Note: ${activityNote}`;
      }
      
      fetch(`/api/tourists/${state.registeredTouristId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityText })
      })
        .then(res => res.json())
        .then(() => {
          showToast("Safe", `Active status updated to: ${activityText}`);
          if (activityNoteNode) activityNoteNode.value = "";
        })
        .catch(err => console.error("Activity sync error:", err));
    });
    }

    // SOS Button click action (One-Click)
    const sosBtn = document.getElementById("sos-trigger-btn");
    if (sosBtn) {
      sosBtn.addEventListener("click", () => {
        if (state.activeSos) return;
        triggerSosEmergency();
      });
    }

    // SOS Confirm Modal Actions
    document.getElementById("sos-modal-confirm-btn").addEventListener("click", triggerSosEmergency);
    document.getElementById("sos-modal-cancel-btn").addEventListener("click", closeSosConfirmModal);

    // SOS cancel button
    const cancelBtn = document.getElementById("sos-cancel-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        if (cancelCountdownTimer) {
          stopCancelSosFlow();
        } else {
          startCancelSosFlow();
        }
      });
    }

    // Incident category buttons
    document.querySelectorAll(".sos-type-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (state.activeSos) return;
        document.querySelectorAll(".sos-type-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        state.selectedSosType = btn.getAttribute("data-type");
      });
    });

    // Wearable device Pairing
    const wearablePairBtn = document.getElementById("wearable-pair-btn");
    if (wearablePairBtn) {
      wearablePairBtn.addEventListener("click", () => {
        if (!state.registeredTouristId) return;
        const deviceSelect = document.getElementById("wearable-select");
        const deviceType = deviceSelect.value;
        
        fetch(`/api/tourists/${state.registeredTouristId}/wearable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connected: true, deviceType, highRiskToggle: state.highRiskModeActive })
        })
          .then(res => res.json())
          .then(data => {
            state.wearableConnected = true;
            state.wearableType = deviceType;
            showToast("Safe", `Smartwatch paired successfully: ${deviceType}`);
          })
          .catch(err => console.error("Wearable pairing error:", err));
      });
    }

    const wearableUnpairBtn = document.getElementById("wearable-unpair-btn");
    if (wearableUnpairBtn) {
      wearableUnpairBtn.addEventListener("click", () => {
        if (!state.registeredTouristId) return;
        fetch(`/api/tourists/${state.registeredTouristId}/wearable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connected: false, deviceType: "", highRiskToggle: false })
        })
          .then(res => res.json())
          .then(() => {
            showToast("Warning", `Smartwatch disconnected.`);
            state.wearableConnected = false;
            state.wearableType = "";
            state.highRiskModeActive = false;
          })
          .catch(err => console.error("Wearable unpairing error:", err));
      });
    }

    const wearableHighriskToggle = document.getElementById("wearable-highrisk-toggle");
    if (wearableHighriskToggle) {
      wearableHighriskToggle.addEventListener("change", (e) => {
        if (!state.registeredTouristId) return;
        const active = e.target.checked;
        fetch(`/api/tourists/${state.registeredTouristId}/wearable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ highRiskToggle: active })
        })
          .then(res => res.json())
          .then(() => {
            state.highRiskModeActive = active;
            showToast("Safe", `High-Risk Automation ${active ? "ENABLED" : "DISABLED"}.`);
          })
          .catch(err => console.error("High risk toggle error:", err));
      });
    }

    // Print Pass
    document.getElementById("id-print-btn")?.addEventListener("click", () => window.print());

    // Vault Inspect triggers
    document.getElementById("inspect-vault-btn-tourist")?.addEventListener("click", openVaultPanel);
    document.getElementById("close-vault-panel-btn")?.addEventListener("click", () => {
      document.getElementById("vault-detail-panel").classList.remove("open");
    });

    // Vault Decryption Simulation
    const vaultDecryptBtn = document.getElementById("vault-decrypt-btn");
    if (vaultDecryptBtn) {
      vaultDecryptBtn.addEventListener("click", () => {
        const decryptedBox = document.getElementById("vault-decrypted-payload");
        decryptedBox.innerText = "Processing authorization keys...\r\nDecrypting local database payload...";
        decryptedBox.style.color = "var(--warning)";
        
        setTimeout(() => {
          decryptedBox.style.color = "var(--safe)";
          const tourist = state.tourists.find(t => t.id === state.registeredTouristId);
          const payload = {
            active_verified_passports: tourist ? [tourist] : [],
            dispatch_emergency_logs: state.incidents.filter(i => i.touristId === state.registeredTouristId),
            sandbox_encryption_algorithm: "AES-256-GCM CBC-MODE",
            decryption_status: "SUCCESSFUL"
          };
          decryptedBox.innerText = JSON.stringify(payload, null, 2);
        }, 900);
      });
    }
  }

  function openVaultPanel() {
    const panel = document.getElementById("vault-detail-panel");
    if (!panel) return;
    panel.classList.add("open");
    
    const rawPayload = document.getElementById("vault-raw-payload");
    const decryptedBox = document.getElementById("vault-decrypted-payload");
    
    const tourist = state.tourists.find(t => t.id === state.registeredTouristId);
    const textState = JSON.stringify({ tourist: tourist, logs: state.incidents.filter(i => i.touristId === state.registeredTouristId) });
    const encryptedText = "U2FsdGVkX1" + btoa(unescape(encodeURIComponent(textState))).substring(0, 320) + "...[AES-256-SECURED-SANDBOX-DATA-LOCK]";
    
    if (rawPayload) rawPayload.innerText = encryptedText;
    if (decryptedBox) {
      decryptedBox.innerText = "[LOCKED - Click Decrypt to Authenticate Session Key]";
      decryptedBox.style.color = "var(--text-secondary)";
    }
  }

  // Toast notifier
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
    }, 4500);
  }

  init();
});

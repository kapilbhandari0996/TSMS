// Tourist Safety & Smart Monitoring System (TSMS) - Client Logic
document.addEventListener("DOMContentLoaded", () => {
  // --- STATE MANAGEMENT ---
  const state = {
    currentLanguage: "en",
    currentTheme: "dark",
    currentView: "home", // home, tourist, admin
    tourists: [],
    incidents: [],
    aiAlerts: [],
    activeSos: null, // Stores active SOS info if current tourist triggers it
    selectedSosType: "medical", // Default SOS type
    registeredTouristId: null, // ID of tourist registered in this browser session
    selectedTouristId: null, // Selected tourist in admin details panel
    sirenInterval: null,
    audioCtx: null,
    wearableConnected: false,
    wearableType: "",
    highRiskModeActive: false,
    socket: null
  };

  // --- LOCAL STORAGE KEYS (Only for styling & sessions) ---
  const STORAGE_KEYS = {
    LANGUAGE: "tsms_lang",
    THEME: "tsms_theme",
    ACTIVE_TOURIST_ID: "tsms_active_id"
  };

  // --- INITIALIZE APPLICATION ---
  function init() {
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
    state.registeredTouristId = localStorage.getItem(STORAGE_KEYS.ACTIVE_TOURIST_ID) || null;
    
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
    fetch("/api/state")
      .then((res) => {
        if (!res.ok) throw new Error("HTTP error fetching system state.");
        return res.json();
      })
      .then((data) => {
        state.tourists = data.tourists;
        state.incidents = data.incidents;
        state.aiAlerts = data.aiAlerts;
        
        // Restore local tourist's active wearable state
        if (state.registeredTouristId) {
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
          }
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
        if (state.registeredTouristId) {
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
        }
        
        syncUI();
      } 
      else if (data.type === "sos_triggered") {
        state.tourists = data.state.tourists;
        state.incidents = data.state.incidents;
        state.aiAlerts = data.state.aiAlerts;

        if (state.registeredTouristId && data.incident.touristId === state.registeredTouristId) {
          state.activeSos = data.incident;
        }

        showToast("Danger", `🚨 SOS EMERGENCY TRIGGERED: ${data.incident.touristName} at ${data.incident.location}!`);
        
        syncUI();
      } 
      else if (data.type === "sos_resolved") {
        state.tourists = data.state.tourists;
        state.incidents = data.state.incidents;
        state.aiAlerts = data.state.aiAlerts;

        if (state.registeredTouristId && data.touristId === state.registeredTouristId) {
          state.activeSos = null;
        }

        showToast("Safe", `✅ SOS incident stood down / resolved.`);
        
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
    document.title = dict.title || "TSMS";

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
    renderCharts();
  }

  function syncSosCountdownLabel() {
    const cancelBtn = document.getElementById("sos-cancel-btn");
    if (cancelBtn && cancelBtn.classList.contains("active")) {
      const dict = window.TSMS_MOCK_DATA.translations[state.currentLanguage];
      const count = cancelBtn.getAttribute("data-sec") || "3";
      cancelBtn.innerText = dict.sosCancelText.replace("{sec}", count);
    }
  }

  // --- VIEW SWITCHER ---
  function switchView(viewName) {
    state.currentView = viewName;
    
    document.querySelectorAll(".nav-btn").forEach(btn => {
      if (btn.getAttribute("data-view") === viewName) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    document.querySelectorAll(".page-section").forEach(sec => {
      if (sec.id === `${viewName}-section`) {
        sec.classList.add("active");
      } else {
        sec.classList.remove("active");
      }
    });

    if (viewName === "tourist") {
      renderTouristPortal();
    } else if (viewName === "admin") {
      updateAdminDashboard();
    }
  }

  function syncUI() {
    switchView(state.currentView);
    syncSosButtonState();
    handleSirenSoundState();
  }

  // --- TOURIST PORTAL LOGIC ---
  function renderTouristPortal() {
    const welcomeCard    = document.getElementById("tourist-welcome-card");
    const registerCard   = document.getElementById("tourist-register-card");
    const dashboardCard  = document.getElementById("tourist-dashboard-card");

    if (state.registeredTouristId) {
      // Already registered — skip welcome + registration, show dashboard
      if (welcomeCard)  welcomeCard.style.display  = "none";
      registerCard.style.display  = "none";
      dashboardCard.style.display = "grid";

      const tourist = state.tourists.find(t => t.id === state.registeredTouristId);
      if (tourist) {
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
    } else {
      // Not registered — show welcome splash first
      if (welcomeCard)  welcomeCard.style.display  = "block";
      registerCard.style.display  = "none";
      dashboardCard.style.display = "none";
    }
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
  let sosHoldTimer      = null;
  let sosCountdownTimer = null;
  let sosHoldProgress   = 0;
  const SOS_HOLD_DURATION = 3000; // 3 seconds

  function startSosCountdown() {
    const sosBtn          = document.getElementById("sos-trigger-btn");
    const progressCircle  = document.getElementById("sos-progress-circle");
    const countdownNum    = document.getElementById("sos-hold-countdown");
    const holdHint        = sosBtn.querySelector(".sos-hold-hint");
    if (state.activeSos) return;

    sosHoldProgress = 0;
    progressCircle.style.strokeDashoffset = "502";
    sosBtn.classList.add("holding");

    // Show numeric countdown, hide hint label
    if (holdHint)     holdHint.style.display     = "none";
    if (countdownNum) { countdownNum.style.display = "inline"; countdownNum.innerText = "3"; }

    // Per-second visual countdown
    let secsLeft = 3;
    sosCountdownTimer = setInterval(() => {
      secsLeft--;
      if (countdownNum) countdownNum.innerText = Math.max(0, secsLeft);
    }, 1000);

    // Smooth progress ring fill
    const tick = 30;
    sosHoldTimer = setInterval(() => {
      sosHoldProgress += tick;
      const offset = 502 - (502 * (sosHoldProgress / SOS_HOLD_DURATION));
      progressCircle.style.strokeDashoffset = Math.max(0, offset);

      if (sosHoldProgress >= SOS_HOLD_DURATION) {
        clearInterval(sosHoldTimer);
        clearInterval(sosCountdownTimer);
        triggerSosEmergency();
      }
    }, tick);
  }

  function cancelSosCountdown() {
    const sosBtn         = document.getElementById("sos-trigger-btn");
    const progressCircle = document.getElementById("sos-progress-circle");
    const countdownNum   = document.getElementById("sos-hold-countdown");
    const holdHint       = sosBtn.querySelector(".sos-hold-hint");
    if (sosHoldTimer)      { clearInterval(sosHoldTimer);      sosHoldTimer      = null; }
    if (sosCountdownTimer) { clearInterval(sosCountdownTimer); sosCountdownTimer = null; }
    sosBtn.classList.remove("holding");
    progressCircle.style.strokeDashoffset = "502";
    // Restore hint label
    if (countdownNum) countdownNum.style.display = "none";
    if (holdHint)     holdHint.style.display     = "";
  }

  // HTTP API POST: SOS Emergency Trigger
  function triggerSosEmergency() {
    if (!state.registeredTouristId) return;

    const tourist = state.tourists.find(t => t.id === state.registeredTouristId);
    if (!tourist) return;

    // Inline SOS type label map (no dependency on sosTypes array)
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
      location: tourist.activity.includes("Hiking") ? "Mountain Ridge Coordinates" : "Coastal Bay Zone"
    };

    const sendSosRequest = (payload) => {
      fetch("/api/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(newSos => {
          state.activeSos = newSos;
          // WS message will resolve state sync globally
        })
        .catch(err => {
          console.error("SOS transmission failure:", err);
          showToast("Danger", "SOS network error. Retrying offline bypass...");
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

  // HTTP API POST: SOS Emergency Resolve Cancel
  function resolveSosEmergency() {
    if (!state.registeredTouristId) return;

    fetch("/api/sos/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ touristId: state.registeredTouristId })
    })
      .then(res => res.json())
      .then(() => {
        state.activeSos = null;
        // Updates will sync back via WebSockets
      })
      .catch(err => console.error("Cancel SOS error:", err));
  }

  // --- WEB AUDIO API SIREN ---
  function handleSirenSoundState() {
    const hasActiveSos = state.incidents.some(i => i.status === "Active");
    const isAdminView = state.currentView === "admin";
    const isMuted = document.getElementById("mute-siren-btn")?.classList.contains("muted");
    
    if (hasActiveSos && isAdminView && !isMuted) {
      startSirenSfx();
      const overlay = document.getElementById("siren-active-overlay");
      if (overlay) overlay.style.display = "block";
    } else {
      stopSirenSfx();
      const overlay = document.getElementById("siren-active-overlay");
      if (overlay) overlay.style.display = "none";
    }
  }

  function startSirenSfx() {
    if (state.sirenInterval) return;
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    let isHigh = false;
    state.sirenInterval = setInterval(() => {
      if (!state.audioCtx) return;
      
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();
      
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(isHigh ? 800 : 550, state.audioCtx.currentTime);
      
      const filter = state.audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1000, state.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.08, state.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, state.audioCtx.currentTime + 0.45);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(state.audioCtx.destination);
      
      osc.start();
      osc.stop(state.audioCtx.currentTime + 0.48);
      
      isHigh = !isHigh;
    }, 500);
  }

  function stopSirenSfx() {
    if (state.sirenInterval) {
      clearInterval(state.sirenInterval);
      state.sirenInterval = null;
    }
  }

  // --- ADMIN COMMAND DASHBOARD ---
  function updateAdminDashboard() {
    const totalTourists = state.tourists.length;
    const activeSosCount = state.incidents.filter(i => i.status === "Active").length;
    const aiAlertsCount = state.aiAlerts.filter(a => a.status === "Active").length;
    
    let dangerScore = 0;
    state.tourists.forEach(t => {
      if (t.status === "Distress") dangerScore += 25;
      else if (t.status === "Warning") dangerScore += 10;
      else if (t.status === "Inactive") dangerScore += 5;
    });
    const safetyIndex = Math.max(40, 100 - dangerScore);

    document.getElementById("metric-tourists-val").innerText = totalTourists;
    document.getElementById("metric-sos-val").innerText = activeSosCount;
    document.getElementById("metric-risk-val").innerText = aiAlertsCount;
    document.getElementById("metric-index-val").innerText = safetyIndex + "%";

    const sosMetricBox = document.getElementById("metric-sos-icon-box");
    if (activeSosCount > 0) {
      sosMetricBox.style.backgroundColor = "var(--danger-glow)";
      sosMetricBox.style.color = "var(--danger)";
      sosMetricBox.classList.add("pulse-sos-mini");
    } else {
      sosMetricBox.style.backgroundColor = "var(--bg-tertiary)";
      sosMetricBox.style.color = "var(--text-secondary)";
      sosMetricBox.classList.remove("pulse-sos-mini");
    }

    renderSosQueue();
    renderSafetyMapPins();
    renderAiAlertsLog();
    renderTouristDirectoryTable();
    renderCharts();
  }

  function renderSosQueue() {
    const queueFeed = document.getElementById("sos-alert-feed");
    const activeIncidents = state.incidents.filter(i => i.status === "Active");
    const dict = window.TSMS_MOCK_DATA.translations[state.currentLanguage];

    if (activeIncidents.length === 0) {
      queueFeed.innerHTML = `
        <div class="no-sos-fallback">
          <span style="font-size: 24px; display: block; margin-bottom: 8px;">🛡️</span>
          ${dict.noSosAlerts}
        </div>
      `;
      return;
    }

    queueFeed.innerHTML = activeIncidents.map(inc => {
      const tourist = state.tourists.find(t => t.id === inc.touristId);
      const batteryStr = tourist ? `🔋 ${tourist.battery}%` : "";
      const bpmStr = tourist ? `❤️ ${tourist.heartRate} bpm` : "";
      
      return `
        <div class="sos-incident-card">
          <div class="sos-incident-header">
            <span class="sos-incident-type">🚨 ${inc.type}</span>
            <span class="sos-incident-time">${inc.timestamp}</span>
          </div>
          <div class="sos-incident-body">
            <div class="sos-tourist-info">
              <strong>${inc.touristName}</strong>
              <span style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                ID: ${inc.touristId} | Loc: ${inc.location}
              </span>
            </div>
            <div style="text-align: right; font-size: 11px; font-weight: 500;">
              <span>${bpmStr}</span><br/>
              <span style="color: ${tourist && tourist.battery < 25 ? 'var(--danger)' : 'var(--text-secondary)'}">${batteryStr}</span>
            </div>
          </div>
          <div class="sos-incident-actions">
            <button class="dispatch-dispatch-btn" data-inc-id="${inc.id}">${dict.dispatchBtn}</button>
            <button class="dispatch-resolve-btn" data-inc-id="${inc.id}">${dict.resolveBtn}</button>
          </div>
        </div>
      `;
    }).join("");

    queueFeed.querySelectorAll(".dispatch-dispatch-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const incId = e.target.getAttribute("data-inc-id");
        dispatchResponder(incId);
      });
    });

    queueFeed.querySelectorAll(".dispatch-resolve-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const incId = e.target.getAttribute("data-inc-id");
        resolveIncidentAdmin(incId);
      });
    });
  }

  // HTTP API POST: Dispatch paramedic responder
  function dispatchResponder(incId) {
    fetch(`/api/incidents/${incId}/dispatch`, { method: "POST" })
      .then(res => res.json())
      .then(() => {
        showToast("Safe", `Responding rescue unit dispatched.`);
      })
      .catch(err => console.error("Dispatcher dispatch error:", err));
  }

  // HTTP API POST: Resolve Incident
  function resolveIncidentAdmin(incId) {
    fetch(`/api/incidents/${incId}/resolve`, { method: "POST" })
      .then(res => res.json())
      .then(() => {
        showToast("Safe", `Incident resolved and closed.`);
      })
      .catch(err => console.error("Dispatcher resolve error:", err));
  }

  // --- MAP PIN PLOTTER ---
  function renderSafetyMapPins() {
    const pinsContainer = document.getElementById("map-active-pins");
    if (!pinsContainer) return;

    pinsContainer.innerHTML = state.tourists.map(tourist => {
      let pinColor = "var(--safe)";
      let hasPulse = false;
      let pulseColor = "var(--safe-glow)";
      
      if (tourist.status === "Distress") {
        pinColor = "var(--danger)";
        hasPulse = true;
        pulseColor = "rgba(239, 68, 68, 0.6)";
      } else if (tourist.status === "Warning") {
        pinColor = "var(--warning)";
        hasPulse = true;
        pulseColor = "rgba(245, 158, 11, 0.5)";
      } else if (tourist.status === "Inactive") {
        pinColor = "var(--inactive)";
      }

      const pulseElement = hasPulse ? `
        <circle class="map-pin-pulse" cx="${tourist.x}" cy="${tourist.y}" r="15" fill="${pulseColor}" />
      ` : "";

      return `
        <g class="map-marker" data-tourist-id="${tourist.id}">
          ${pulseElement}
          <circle class="map-pin" cx="${tourist.x}" cy="${tourist.y}" r="7" fill="${pinColor}" />
          <text x="${tourist.x}" y="${tourist.y - 12}" text-anchor="middle" font-size="10px" font-weight="700" fill="var(--text-primary)" style="text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: none;">
            ${tourist.fullName.split(" ")[0]}
          </text>
        </g>
      `;
    }).join("");

    pinsContainer.querySelectorAll(".map-marker").forEach(marker => {
      marker.addEventListener("click", () => {
        const touristId = marker.getAttribute("data-tourist-id");
        openTouristDetailsPanel(touristId);
      });
    });
  }

  function openTouristDetailsPanel(touristId) {
    state.selectedTouristId = touristId;
    document.getElementById("tourist-detail-panel").classList.add("open");
    updateTouristDetailsPanel();
  }

  function updateTouristDetailsPanel() {
    if (!state.selectedTouristId) return;

    const tourist = state.tourists.find(t => t.id === state.selectedTouristId);
    if (!tourist) return;

    document.getElementById("detail-id").innerText = tourist.id;
    document.getElementById("detail-name").innerText = tourist.fullName;
    document.getElementById("detail-nationality").innerText = tourist.nationality;
    document.getElementById("detail-passport").innerText = tourist.passportNo;
    document.getElementById("detail-visa").innerText = tourist.visaNo;
    document.getElementById("detail-visa-expiry").innerText = tourist.visaExpiry;
    document.getElementById("detail-emergency-name").innerText = tourist.emergencyContactName;
    document.getElementById("detail-emergency-phone").innerText = tourist.emergencyContactPhone;
    
    const statusVal = document.getElementById("detail-status-val");
    statusVal.className = "status-badge " + tourist.status;
    statusVal.innerText = tourist.status;

    document.getElementById("detail-activity-val").innerText = tourist.activity;
    document.getElementById("detail-hr-val").innerText = tourist.heartRate > 0 ? `${tourist.heartRate} bpm` : "N/A";
    document.getElementById("detail-speed-val").innerText = `${tourist.speed} km/h`;
    document.getElementById("detail-battery-val").innerText = `${tourist.battery}%`;
    document.getElementById("detail-updated-val").innerText = tourist.lastUpdated;

    const pathLogs = document.getElementById("detail-path-logs");
    pathLogs.innerHTML = tourist.checkinHistory.map(log => {
      return `<div class="path-log-item">${log}</div>`;
    }).join("");
  }

  function renderAiAlertsLog() {
    const logsPanel = document.getElementById("ai-alerts-panel");
    logsPanel.innerHTML = state.aiAlerts.map(alert => {
      return `
        <div class="ai-alert-card ${alert.level}">
          <div class="ai-alert-header">
            <span class="ai-alert-level">${alert.level}</span>
            <span class="ai-alert-time">${alert.timestamp}</span>
          </div>
          <p class="ai-alert-text">${alert.message}</p>
          <div class="ai-alert-footer">
            <span>Tourist: ${alert.touristName} (${alert.touristId})</span>
            <span>Status: <strong>${alert.status}</strong></span>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderTouristDirectoryTable() {
    const tableBody = document.getElementById("registry-table-body");
    const searchVal = document.getElementById("tourist-search").value.toLowerCase();
    
    const filteredTourists = state.tourists.filter(t => {
      return t.fullName.toLowerCase().includes(searchVal) ||
             t.id.toLowerCase().includes(searchVal) ||
             t.nationality.toLowerCase().includes(searchVal);
    });

    tableBody.innerHTML = filteredTourists.map(t => {
      return `
        <tr>
          <td><strong>${t.id}</strong></td>
          <td>${t.fullName}</td>
          <td>${t.nationality}</td>
          <td>${t.activity}</td>
          <td><span class="status-badge ${t.status}">${t.status}</span></td>
          <td>
            <button class="btn-icon view-details-btn" data-tourist-id="${t.id}">🔍</button>
          </td>
        </tr>
      `;
    }).join("");

    tableBody.querySelectorAll(".view-details-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-tourist-id");
        openTouristDetailsPanel(id);
      });
    });
  }

  // --- SVG/CSS CHART REPORTS ---
  function renderCharts() {
    if (state.currentView !== "admin") return;
    renderIncidentTypeChart();
    renderSafetyDistributionChart();
  }

  function renderIncidentTypeChart() {
    const container = document.getElementById("incident-chart-container");
    if (!container) return;

    const counts = { medical: 0, accident: 0, security: 0, other: 0 };
    state.incidents.forEach(inc => {
      const typeLower = inc.type.toLowerCase();
      if (typeLower.includes("medical")) counts.medical++;
      else if (typeLower.includes("accident")) counts.accident++;
      else if (typeLower.includes("security") || typeLower.includes("theft")) counts.security++;
      else counts.other++;
    });

    const categories = [
      { key: "medical", color: "var(--danger)" },
      { key: "accident", color: "var(--warning)" },
      { key: "security", color: "var(--accent)" },
      { key: "other", color: "var(--inactive)" }
    ];

    const maxCount = Math.max(1, counts.medical, counts.accident, counts.security, counts.other);
    
    container.innerHTML = `
      <div style="display: flex; justify-content: space-around; align-items: flex-end; width: 100%; height: 160px; padding-top: 20px;">
        ${categories.map(cat => {
          const count = counts[cat.key];
          const heightPct = (count / maxCount) * 100;
          return `
            <div style="display: flex; flex-direction: column; align-items: center; width: 50px;">
              <span style="font-size: 11px; font-weight: bold; margin-bottom: 6px; color: var(--text-primary);">${count}</span>
              <div style="height: ${Math.max(5, heightPct * 1.2)}px; width: 24px; background-color: ${cat.color}; border-radius: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.2);"></div>
              <span style="font-size: 9px; color: var(--text-secondary); margin-top: 8px; text-transform: uppercase; font-weight:600;">${cat.key.substring(0,3)}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderSafetyDistributionChart() {
    const container = document.getElementById("safety-chart-container");
    if (!container) return;

    let safeCount = 0;
    let warnCount = 0;
    let dangerCount = 0;
    let inactiveCount = 0;

    state.tourists.forEach(t => {
      if (t.status === "Safe") safeCount++;
      else if (t.status === "Warning") warnCount++;
      else if (t.status === "Distress") dangerCount++;
      else if (t.status === "Inactive") inactiveCount++;
    });

    const total = Math.max(1, safeCount + warnCount + dangerCount + inactiveCount);
    const safePct = (safeCount / total) * 100;
    const warnPct = (warnCount / total) * 100;
    const dangerPct = (dangerCount / total) * 100;
    const inactivePct = (inactiveCount / total) * 100;

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; width: 100%; gap: 15px; padding-top: 10px;">
        <div style="display: flex; height: 16px; border-radius: 8px; overflow: hidden; width: 100%;">
          <div style="width: ${safePct}%; background-color: var(--safe);" title="Safe"></div>
          <div style="width: ${warnPct}%; background-color: var(--warning);" title="Warning"></div>
          <div style="width: ${dangerPct}%; background-color: var(--danger);" title="Danger"></div>
          <div style="width: ${inactivePct}%; background-color: var(--inactive);" title="Inactive"></div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--safe);"></div>
            <span style="color: var(--text-secondary);">Safe: <strong>${safeCount}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--warning);"></div>
            <span style="color: var(--text-secondary);">Warning: <strong>${warnCount}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--danger);"></div>
            <span style="color: var(--text-secondary);">Distress: <strong>${dangerCount}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--inactive);"></div>
            <span style="color: var(--text-secondary);">Inactive: <strong>${inactiveCount}</strong></span>
          </div>
        </div>
      </div>
    `;
  }

  // --- REPORTS EXPORTS ---
  function exportTouristsCSV() {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Tourist ID,Full Name,Nationality,Passport No,Active Status,Telemetry HeartRate,Current Activity\r\n";
    
    state.tourists.forEach(t => {
      const row = `"${t.id}","${t.fullName}","${t.nationality}","${t.passportNo}","${t.status}",${t.heartRate},"${t.activity}"`;
      csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TSMS_Tourist_Registry_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Safe", "CSV Safety Report downloaded.");
  }

  function exportOperationalLogText() {
    let log = "==================================================\r\n";
    log += "   TOURIST SAFETY & SMART MONITORING SYSTEM REPORT   \r\n";
    log += `   Timestamp: ${new Date().toLocaleString()} \r\n`;
    log += "==================================================\r\n\r\n";
    
    log += "1. SYSTEM SUMMARY:\r\n";
    log += `Active Verified Passports: ${state.tourists.length}\r\n`;
    log += `Active Emergencies in dispatch queue: ${state.incidents.filter(i => i.status === "Active").length}\r\n`;
    log += `AI Behavioral flags pending: ${state.aiAlerts.filter(a => a.status === "Active").length}\r\n\r\n`;
    
    log += "2. EMERGENCY INCIDENTS LOG:\r\n";
    state.incidents.forEach(inc => {
      log += `[${inc.status}] ID: ${inc.id} | Type: ${inc.type} | Tourist: ${inc.touristName} (${inc.touristId}) | Loc: ${inc.location} | Details: ${inc.details}\r\n`;
    });
    
    log += "\r\n3. ACTIVE AI THREAT DETECTION ALERT RECORDS:\r\n";
    state.aiAlerts.forEach(a => {
      log += `[${a.level}] ${a.timestamp} | User: ${a.touristName} | Alert: ${a.message} | State: ${a.status}\r\n`;
    });

    const blob = new Blob([log], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `TSMS_Operational_Log_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Safe", "Txt System Audit Report downloaded.");
  }

  // --- EVENT LISTENERS REGISTRATION ---
  function setupEventListeners() {
    // Nav links switcher
    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        switchView(view);
      });
    });

    // Language select
    document.getElementById("language-select").addEventListener("change", (e) => {
      translateApp(e.target.value);
      syncUI();
    });

    // Theme toggle
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

    // Welcome card: New Registration button
    const welcomeNewBtn = document.getElementById("welcome-new-btn");
    if (welcomeNewBtn) {
      welcomeNewBtn.addEventListener("click", () => {
        const nameInput  = document.getElementById("welcome-name-input");
        const errMsg     = document.getElementById("welcome-error-msg");
        const enteredName = nameInput ? nameInput.value.trim() : "";

        if (!enteredName) {
          if (errMsg) errMsg.style.display = "block";
          if (nameInput) nameInput.focus();
          return;
        }
        if (errMsg) errMsg.style.display = "none";

        // Pre-fill name into registration form
        const regNameInput = document.getElementById("reg-name");
        if (regNameInput) regNameInput.value = enteredName;

        // Transition: hide welcome, show registration form
        const welcomeCard  = document.getElementById("tourist-welcome-card");
        const registerCard = document.getElementById("tourist-register-card");
        if (welcomeCard)  welcomeCard.style.display  = "none";
        if (registerCard) registerCard.style.display  = "block";
      });
    }

    // Welcome card: I'm Returning button
    const welcomeReturnBtn = document.getElementById("welcome-return-btn");
    if (welcomeReturnBtn) {
      welcomeReturnBtn.addEventListener("click", () => {
        const nameInput   = document.getElementById("welcome-name-input");
        const errMsg      = document.getElementById("welcome-error-msg");
        const enteredName = nameInput ? nameInput.value.trim() : "";

        if (!enteredName) {
          if (errMsg) errMsg.style.display = "block";
          if (nameInput) nameInput.focus();
          return;
        }
        if (errMsg) errMsg.style.display = "none";

        // Try to find the tourist by name (case-insensitive)
        const match = state.tourists.find(t =>
          t.fullName.trim().toLowerCase() === enteredName.toLowerCase()
        );

        if (match) {
          state.registeredTouristId = match.id;
          localStorage.setItem(STORAGE_KEYS.ACTIVE_TOURIST_ID, match.id);

          // Restore wearable state
          state.wearableConnected    = match.wearableConnected;
          state.wearableType         = match.wearableType;
          state.highRiskModeActive   = match.highRiskModeActive;

          showToast("Safe", `Welcome back, ${match.fullName}! Tourist ID: ${match.id}`);
          renderTouristPortal();
        } else {
          showToast("Warning", `No registered tourist found with name "${enteredName}". Please register as new.`);
          // Fall through to registration with name pre-filled
          const regNameInput = document.getElementById("reg-name");
          if (regNameInput) regNameInput.value = enteredName;
          const welcomeCard  = document.getElementById("tourist-welcome-card");
          const registerCard = document.getElementById("tourist-register-card");
          if (welcomeCard)  welcomeCard.style.display  = "none";
          if (registerCard) registerCard.style.display  = "block";
        }
      });
    }

    // Also allow pressing Enter on the welcome name input
    const welcomeNameInput = document.getElementById("welcome-name-input");
    if (welcomeNameInput) {
      welcomeNameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          document.getElementById("welcome-new-btn")?.click();
        }
      });
    }

    // Tourist registration
    const registerForm = document.getElementById("register-form");
    if (registerForm) {
      registerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById("reg-name").value;
        const nationality = document.getElementById("reg-nation").value;
        const passportNo = document.getElementById("reg-passport").value;
        const visaNo = document.getElementById("reg-visa").value;
        const visaExpiry = document.getElementById("reg-visa-expiry").value;
        const emergencyContactName = document.getElementById("reg-emergency-name").value;
        const emergencyContactPhone = document.getElementById("reg-emergency-phone").value;
        
        const requestPayload = { fullName, nationality, passportNo, visaNo, visaExpiry, emergencyContactName, emergencyContactPhone };

        fetch("/api/tourists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload)
        })
          .then(res => {
            if (!res.ok) throw new Error("Registration API failed.");
            return res.json();
          })
          .then(newTourist => {
            state.registeredTouristId = newTourist.id;
            localStorage.setItem(STORAGE_KEYS.ACTIVE_TOURIST_ID, newTourist.id);
            
            showToast("Safe", `Smart Digital Pass successfully issued! Tourist ID: ${newTourist.id}`);
            // UI synced via WebSockets State update
          })
          .catch(err => {
            console.error("Registration error:", err);
            showToast("Danger", "Could not connect to registration server.");
          });
      });
    }

    // Tourist Activity Update
    const updateActivityBtn = document.getElementById("update-activity-btn");
    if (updateActivityBtn) {
      updateActivityBtn.addEventListener("click", () => {
        if (!state.registeredTouristId) return;

        const activitySelect = document.getElementById("tourist-activity-select");
        const selectedOpt = activitySelect.options[activitySelect.selectedIndex];
        const activityText = selectedOpt.text;
        
        fetch(`/api/tourists/${state.registeredTouristId}/activity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityText })
        })
          .then(res => res.json())
          .then(() => {
            showToast("Safe", `Active status updated to: ${activityText}`);
          })
          .catch(err => console.error("Activity sync error:", err));
      });
    }

    // SOS Button hold actions
    const sosBtn = document.getElementById("sos-trigger-btn");
    if (sosBtn) {
      sosBtn.addEventListener("mousedown", startSosCountdown);
      sosBtn.addEventListener("mouseup", cancelSosCountdown);
      sosBtn.addEventListener("mouseleave", cancelSosCountdown);
      sosBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startSosCountdown(); });
      sosBtn.addEventListener("touchend", (e) => { e.preventDefault(); cancelSosCountdown(); });
    }

    // SOS cancel button
    const cancelBtn = document.getElementById("sos-cancel-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        startCancelSosFlow();
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

    // Admin table search
    const searchInput = document.getElementById("tourist-search");
    if (searchInput) {
      searchInput.addEventListener("input", renderTouristDirectoryTable);
    }

    // Detail Panel Close
    const closeDetailPanelBtn = document.getElementById("close-detail-panel-btn");
    if (closeDetailPanelBtn) {
      closeDetailPanelBtn.addEventListener("click", () => {
        document.getElementById("tourist-detail-panel").classList.remove("open");
        state.selectedTouristId = null;
      });
    }

    // Mute warning sirens
    const muteSirenBtn = document.getElementById("mute-siren-btn");
    if (muteSirenBtn) {
      muteSirenBtn.addEventListener("click", () => {
        if (muteSirenBtn.classList.contains("muted")) {
          muteSirenBtn.classList.remove("muted");
          muteSirenBtn.innerText = "🔊 Siren Sound";
        } else {
          muteSirenBtn.classList.add("muted");
          muteSirenBtn.innerText = "🔇 Muted";
        }
        handleSirenSoundState();
      });
    }

    // Download reports
    document.getElementById("report-download-csv")?.addEventListener("click", exportTouristsCSV);
    document.getElementById("report-download-txt")?.addEventListener("click", exportOperationalLogText);
    document.getElementById("id-print-btn")?.addEventListener("click", () => window.print());

    // Vault Inspect triggers
    document.getElementById("inspect-vault-btn-tourist")?.addEventListener("click", openVaultPanel);
    document.getElementById("inspect-vault-btn-admin")?.addEventListener("click", openVaultPanel);
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
          const payload = {
            active_verified_passports: state.tourists,
            dispatch_emergency_logs: state.incidents,
            ai_telemetry_flags: state.aiAlerts,
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
    
    const textState = JSON.stringify({ tourists: state.tourists, alerts: state.aiAlerts, logs: state.incidents });
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

  // Boot Application
  init();
});

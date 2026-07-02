// Tourist Safety & Smart Monitoring System (TSMS) - Admin Console Controller
document.addEventListener("DOMContentLoaded", () => {
  const state = {
    currentLanguage: "en",
    currentTheme: "dark",
    tourists: [],
    incidents: [],
    aiAlerts: [],
    selectedTouristId: null,
    sirenInterval: null,
    audioCtx: null,
    socket: null
  };

  const STORAGE_KEYS = {
    LANGUAGE: "tsms_lang",
    THEME: "tsms_theme",
    ADMIN_LOGGED_IN: "tsms_admin_logged_in",
    TSMS_TOKEN: "tsms_token"
  };

  // --- INITIALIZE APPLICATION ---
  function init() {
    // 1. Session Check
    const adminLoggedIn = localStorage.getItem(STORAGE_KEYS.ADMIN_LOGGED_IN);
    if (adminLoggedIn !== "true") {
      window.location.href = "/admin-login";
      return;
    }

    loadSettings();
    setupEventListeners();
    
    // Fetch initial database state from Node server
    fetchStateFromServer(() => {
      translateApp(state.currentLanguage);
      updateAdminDashboard();
      setupWebSocket();
    });

    // Load KYC Review Panel
    loadKycReviews();
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
    const token = localStorage.getItem(STORAGE_KEYS.TSMS_TOKEN);
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
        
        updateAdminDashboard();
      } 
      else if (data.type === "sos_triggered") {
        state.tourists = data.state.tourists;
        state.incidents = data.state.incidents;
        state.aiAlerts = data.state.aiAlerts;

        showToast("Danger", `🚨 SOS EMERGENCY TRIGGERED: ${data.incident.touristName} at ${data.incident.location}!`);
        updateAdminDashboard();
      } 
      else if (data.type === "sos_resolved") {
        state.tourists = data.state.tourists;
        state.incidents = data.state.incidents;
        state.aiAlerts = data.state.aiAlerts;

        showToast("Safe", `✅ SOS incident stood down / resolved.`);
        updateAdminDashboard();
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
    document.title = dict.title ? `${dict.title} | Command Center` : "TSMS | Command & Control Center";

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

    renderCharts();
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
    renderTouristDirectoryTable();
    renderCharts();
    handleSirenSoundState();
    
    if (state.selectedTouristId) {
      updateTouristDetailsPanel();
    }
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
            <span class="sos-incident-time">${inc.timestamp && inc.timestamp.includes('T') ? new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : inc.timestamp}</span>
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
        <g class="map-marker" data-tourist-id="${tourist.id}" style="cursor: pointer;">
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



  function renderTouristDirectoryTable() {
    const tableBody = document.getElementById("registry-table-body");
    const searchVal = document.getElementById("tourist-search").value.toLowerCase();
    
    const filteredTourists = state.tourists.filter(t => {
      return t.fullName.toLowerCase().includes(searchVal) ||
             t.id.toLowerCase().includes(searchVal) ||
             t.nationality.toLowerCase().includes(searchVal);
    });

    if (filteredTourists.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 20px;">
            No tourists found matching search criteria.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filteredTourists.map(t => {
      return `
        <tr>
          <td><strong>${t.id}</strong></td>
          <td>${t.fullName}</td>
          <td>${t.nationality}</td>
          <td>${t.activity}</td>
          <td><span class="status-badge ${t.status}">${t.status}</span></td>
          <td>
            <button class="btn-icon view-details-btn" data-tourist-id="${t.id}" title="View Details">🔍</button>
            <button class="btn-icon delete-tourist-btn" data-tourist-id="${t.id}" title="Delete Tourist" style="color: var(--danger);">🗑️</button>
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

    tableBody.querySelectorAll(".delete-tourist-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-tourist-id");
        if (confirm(`Are you sure you want to delete tourist ${id}?`)) {
          const token = localStorage.getItem("tsms_jwt") || localStorage.getItem("tsms_token");
          fetch(`/api/tourists/${id}`, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + token }
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              showToast("Success", `Tourist ${id} deleted.`);
              fetchStateFromServer(() => updateAdminDashboard());
            } else {
              showToast("Error", data.error || "Failed to delete tourist.");
            }
          })
          .catch(err => {
            console.error(err);
            showToast("Error", "Network error while deleting tourist.");
          });
        }
      });
    });
  }

  // --- SVG/CSS CHART REPORTS ---
  function renderCharts() {
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
      <div style="display: flex; justify-content: space-around; align-items: flex-end; width: 100%; height: 100px; padding-top: 10px; box-sizing: border-box;">
        ${categories.map(cat => {
          const count = counts[cat.key];
          const heightPct = (count / maxCount) * 100;
          return `
            <div style="display: flex; flex-direction: column; align-items: center; width: 40px;">
              <span style="font-size: 10px; font-weight: bold; margin-bottom: 4px; color: var(--text-primary);">${count}</span>
              <div style="height: ${Math.max(4, heightPct * 0.7)}px; width: 16px; background-color: ${cat.color}; border-radius: 3px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);"></div>
              <span style="font-size: 8px; color: var(--text-secondary); margin-top: 6px; text-transform: uppercase; font-weight:600;">${cat.key.substring(0,3)}</span>
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
      <div style="display: flex; flex-direction: column; width: 100%; gap: 10px; padding-top: 10px; box-sizing: border-box;">
        <div style="display: flex; height: 12px; border-radius: 6px; overflow: hidden; width: 100%;">
          <div style="width: ${safePct}%; background-color: var(--safe);" title="Safe"></div>
          <div style="width: ${warnPct}%; background-color: var(--warning);" title="Warning"></div>
          <div style="width: ${dangerPct}%; background-color: var(--danger);" title="Danger"></div>
          <div style="width: ${inactivePct}%; background-color: var(--inactive);" title="Inactive"></div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 6px; height: 6px; border-radius: 50%; background-color: var(--safe);"></div>
            <span style="color: var(--text-secondary);">Safe: <strong>${safeCount}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 6px; height: 6px; border-radius: 50%; background-color: var(--warning);"></div>
            <span style="color: var(--text-secondary);">Warn: <strong>${warnCount}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 6px; height: 6px; border-radius: 50%; background-color: var(--danger);"></div>
            <span style="color: var(--text-secondary);">SOS: <strong>${dangerCount}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 6px; height: 6px; border-radius: 50%; background-color: var(--inactive);"></div>
            <span style="color: var(--text-secondary);">Inac: <strong>${inactiveCount}</strong></span>
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

  // --- WEB AUDIO API SIREN ---
  function handleSirenSoundState() {
    const hasActiveSos = state.incidents.some(i => i.status === "Active");
    const isMuted = document.getElementById("mute-siren-btn")?.classList.contains("muted");
    
    if (hasActiveSos && !isMuted) {
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

  // Stop synthesizer siren sound
  function stopSirenSfx() {
    if (state.sirenInterval) {
      clearInterval(state.sirenInterval);
      state.sirenInterval = null;
    }
  }

  // --- LOGOUT ---
  function logout() {
    stopSirenSfx();
    localStorage.removeItem(STORAGE_KEYS.ADMIN_LOGGED_IN);
    showToast("Warning", "Logging out and closing Command Center session...");
    setTimeout(() => {
      window.location.href = "/admin-login";
    }, 600);
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Logout Button
    document.getElementById("logout-btn").addEventListener("click", logout);

    // Language Select
    document.getElementById("language-select").addEventListener("change", (e) => {
      translateApp(e.target.value);
      updateAdminDashboard();
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

    // Vault Inspect triggers
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

  // ============================================================
  // KYC ADMIN REVIEW FUNCTIONS
  // ============================================================

  let allKycSubmissions = [];
  let currentKycFilter = "All";
  let selectedKycId = null;

  async function loadKycReviews() {
    try {
      const res = await fetch("/api/admin/kyc");
      if (!res.ok) throw new Error("Failed to load KYC submissions.");
      allKycSubmissions = await res.json();
      renderKycTable(allKycSubmissions);
    } catch (err) {
      console.error("[KYC Admin] Load error:", err);
      document.getElementById("kyc-review-table-body").innerHTML =
        `<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:20px;">⚠️ Failed to load KYC submissions.</td></tr>`;
    }
  }

  function renderKycTable(submissions) {
    const tbody = document.getElementById("kyc-review-table-body");
    const searchVal = (document.getElementById("kyc-search-input")?.value || "").toLowerCase();

    let filtered = submissions;
    if (currentKycFilter !== "All") {
      filtered = filtered.filter(s => s.status === currentKycFilter);
    }
    if (searchVal) {
      filtered = filtered.filter(s =>
        (s.fullName || "").toLowerCase().includes(searchVal) ||
        (s.passportNo || "").toLowerCase().includes(searchVal) ||
        (s.touristId || "").toLowerCase().includes(searchVal)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:30px;">No submissions found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => {
      const statusColors = { Pending: "var(--warning)", Verified: "var(--safe)", Rejected: "var(--danger)", "Manual Review": "var(--accent)" };
      const color = statusColors[s.status] || "var(--text-secondary)";
      const ocrIcon = s.validationPassed ? "<span style='color:var(--safe);font-weight:700;'>✅ Passed</span>"
        : s.validationErrors && s.validationErrors.length > 0 ? `<span style='color:var(--danger);font-weight:700;'>❌ ${s.validationErrors.length} mismatch(es)</span>`
        : "<span style='color:var(--text-secondary);'>⚠️ No OCR data</span>";
      const date = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—";
      return `
        <tr style="cursor:pointer;" onclick="window._openKycDetail && window._openKycDetail('${s.id}')">
          <td style="font-weight:700;color:var(--accent);">${s.touristId}</td>
          <td>${s.fullName || "—"}</td>
          <td style="font-family:monospace;">${s.passportNo || "—"}</td>
          <td style="font-size:11px;">${date}</td>
          <td>${ocrIcon}</td>
          <td><span style="font-size:11px;font-weight:800;color:${color};">${s.status}</span></td>
          <td><button class="btn-secondary" style="font-size:10px;padding:4px 10px;" onclick="event.stopPropagation(); window._openKycDetail && window._openKycDetail('${s.id}')">View →</button></td>
        </tr>
      `;
    }).join("");
  }

  function openKycDetail(submissionId) {
    const sub = allKycSubmissions.find(s => s.id === submissionId);
    if (!sub) return;
    selectedKycId = submissionId;

    const panel = document.getElementById("kyc-detail-panel");
    panel.style.display = "block";
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    document.getElementById("kyc-detail-tourist-name").textContent = sub.fullName || "Unknown";
    document.getElementById("kyc-detail-tourist-id").textContent = sub.touristId || "";

    // OCR comparison fields
    const ocrContainer = document.getElementById("kyc-detail-ocr-fields");
    const fields = [
      { label: "Full Name", entered: sub.enteredData?.fullName, ocr: sub.ocrData?.fullName },
      { label: "Passport No", entered: sub.enteredData?.passportNo, ocr: sub.ocrData?.passportNo },
      { label: "Date of Birth", entered: sub.enteredData?.dob, ocr: sub.ocrData?.dob },
      { label: "Nationality", entered: sub.enteredData?.nationality, ocr: sub.ocrData?.nationality },
      { label: "Expiry Date", entered: "—", ocr: sub.ocrData?.expiry },
      { label: "Issuing Country", entered: "—", ocr: sub.ocrData?.issuingCountry }
    ];
    ocrContainer.innerHTML = fields.filter(f => f.ocr).map(f => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:8px;background:var(--bg-tertiary);border:1px solid var(--border-color);">
        <span style="font-size:11px;font-weight:700;color:var(--text-secondary);min-width:100px;">${f.label}</span>
        <div style="text-align:right;">
          <div style="font-size:10px;color:var(--text-secondary);">Entered: <strong>${f.entered || "—"}</strong></div>
          <div style="font-size:10px;color:var(--accent);">OCR: <strong>${f.ocr || "—"}</strong></div>
        </div>
      </div>
    `).join("") || "<div style='color:var(--text-secondary);font-size:12px;'>No OCR data available.</div>";

    // MRZ
    const mrzEl = document.getElementById("kyc-detail-mrz");
    if (sub.ocrData?.mrz) {
      mrzEl.style.display = "block";
      document.getElementById("kyc-detail-mrz-text").textContent = sub.ocrData.mrz;
    } else {
      mrzEl.style.display = "none";
    }

    // Validation errors
    const errorsSection = document.getElementById("kyc-detail-errors");
    const errorsList = document.getElementById("kyc-detail-errors-list");
    const errors = Array.isArray(sub.validationErrors) ? sub.validationErrors : [];
    if (errors.length > 0) {
      errorsSection.style.display = "block";
      errorsList.innerHTML = errors.map(e =>
        `<div style="padding:8px 10px;background:rgba(239,68,68,0.1);border:1px solid var(--danger);border-radius:8px;font-size:12px;color:var(--danger);">
          <strong>${e.label || e.field}:</strong> ${e.message}
        </div>`
      ).join("");
    } else {
      errorsSection.style.display = "none";
    }

    // Documents
    const passportWrapper = document.getElementById("kyc-doc-passport-wrapper");
    const visaWrapper = document.getElementById("kyc-doc-visa-wrapper");
    const selfieWrapper = document.getElementById("kyc-doc-selfie-wrapper");
    const noDocsMsg = document.getElementById("kyc-no-docs-msg");
    let hasDocs = false;

    if (sub.hasPassport) {
      hasDocs = true;
      passportWrapper.style.display = "block";
      document.getElementById("kyc-doc-passport-img").src = `/api/admin/kyc/${sub.id}/document/passport?t=${Date.now()}`;
    } else passportWrapper.style.display = "none";

    if (sub.hasVisa) {
      hasDocs = true;
      visaWrapper.style.display = "block";
      document.getElementById("kyc-doc-visa-img").src = `/api/admin/kyc/${sub.id}/document/visa?t=${Date.now()}`;
    } else visaWrapper.style.display = "none";

    if (sub.hasSelfie) {
      hasDocs = true;
      selfieWrapper.style.display = "block";
      document.getElementById("kyc-doc-selfie-img").src = `/api/admin/kyc/${sub.id}/document/selfie?t=${Date.now()}`;
    } else selfieWrapper.style.display = "none";

    noDocsMsg.style.display = hasDocs ? "none" : "block";

    // Reset action message
    const actionMsg = document.getElementById("kyc-action-msg");
    actionMsg.style.display = "none";

    // Show/hide action buttons based on status
    const actionPanel = document.getElementById("kyc-action-panel");
    actionPanel.style.display = sub.status === "Verified" || sub.status === "Rejected" ? "none" : "flex";
  }

  // Wire up global reference for inline onclick handlers
  window._openKycDetail = openKycDetail;

  // Setup KYC panel event listeners
  document.getElementById("kyc-detail-close-btn")?.addEventListener("click", () => {
    document.getElementById("kyc-detail-panel").style.display = "none";
    selectedKycId = null;
  });

  document.getElementById("kyc-refresh-btn")?.addEventListener("click", () => {
    loadKycReviews();
    showToast("Info", "KYC submissions refreshed.");
  });

  document.getElementById("kyc-search-input")?.addEventListener("input", () => renderKycTable(allKycSubmissions));

  document.querySelectorAll(".kyc-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".kyc-filter-btn").forEach(b => {
        b.style.background = "transparent";
        b.style.color = b.getAttribute("data-filter") === "Pending" ? "var(--warning)"
          : b.getAttribute("data-filter") === "Verified" ? "var(--safe)"
          : b.getAttribute("data-filter") === "Rejected" ? "var(--danger)"
          : b.getAttribute("data-filter") === "Manual Review" ? "var(--accent)"
          : "var(--text-secondary)";
      });
      btn.style.background = "var(--accent)";
      btn.style.color = "#fff";
      currentKycFilter = btn.getAttribute("data-filter");
      renderKycTable(allKycSubmissions);
    });
  });

  document.getElementById("kyc-approve-btn")?.addEventListener("click", async () => {
    if (!selectedKycId) return;
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TSMS_TOKEN);
      const res = await fetch(`/api/admin/kyc/${selectedKycId}/approve`, { 
        method: "POST",
        headers: { "Authorization": "Bearer " + token }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showKycActionMsg("✅ " + data.message, "var(--safe)");
      showToast("Safe", data.message);
      await loadKycReviews();
      document.getElementById("kyc-action-panel").style.display = "none";
    } catch (err) {
      showKycActionMsg("❌ " + err.message, "var(--danger)");
      showToast("Danger", err.message);
    }
  });

  document.getElementById("kyc-reject-btn")?.addEventListener("click", async () => {
    if (!selectedKycId) return;
    const reason = document.getElementById("kyc-rejection-reason").value.trim();
    if (!reason) {
      showToast("Warning", "Please enter a rejection reason.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/kyc/${selectedKycId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showKycActionMsg("❌ " + data.message + " Reason: " + reason, "var(--danger)");
      showToast("Warning", data.message);
      await loadKycReviews();
      document.getElementById("kyc-action-panel").style.display = "none";
    } catch (err) {
      showKycActionMsg("❌ " + err.message, "var(--danger)");
      showToast("Danger", err.message);
    }
  });

  document.getElementById("kyc-manual-review-btn")?.addEventListener("click", async () => {
    if (!selectedKycId) return;
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TSMS_TOKEN);
      const res = await fetch(`/api/admin/kyc/${selectedKycId}/manual-review`, { 
        method: "POST",
        headers: { "Authorization": "Bearer " + token }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showKycActionMsg("🔎 " + data.message, "var(--accent)");
      showToast("Info", data.message);
      await loadKycReviews();
    } catch (err) {
      showToast("Danger", err.message);
    }
  });

  function showKycActionMsg(msg, color) {
    const el = document.getElementById("kyc-action-msg");
    el.textContent = msg;
    el.style.color = color;
    el.style.display = "block";
  }

  // --- WEB AUDIO API SIREN ---
  function handleSirenSoundState() {
    const hasActiveSos = state.incidents.some(i => i.status === "Active");
    const muteBtn = document.getElementById("mute-siren-btn");
    const isMuted = muteBtn ? muteBtn.classList.contains("muted") : false;
    
    if (hasActiveSos && !isMuted) {
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
      if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
      }
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

  init();
});

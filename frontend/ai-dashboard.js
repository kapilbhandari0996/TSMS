document.addEventListener("DOMContentLoaded", () => {
  let allAlerts = [];
  let selectedAlertId = null;

  const ws = new WebSocket(`ws://${window.location.host}`);
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "ai_alert_new" || data.type === "ai_alert_resolved") {
        fetchAlerts();
      }
    } catch (err) {}
  };

  async function fetchAlerts() {
    try {
      const res = await fetch("/api/ai-alerts");
      if (res.status === 401 || res.status === 403) {
        alert("Session expired or insufficient permissions. Please log in again.");
        window.location.href = "/admin-login";
        return;
      }
      allAlerts = await res.json();
      renderAlerts();
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    }
  }

  function getRiskColor(level) {
    switch (level) {
      case "Critical": return "var(--danger)";
      case "High Risk": return "var(--danger)";
      case "Medium Risk": return "var(--warning)";
      case "Low Risk": return "var(--warning)";
      default: return "var(--safe)";
    }
  }

  function renderAlerts() {
    const tbody = document.getElementById("alerts-tbody");
    const riskFilter = document.getElementById("filter-risk").value;
    const statusFilter = document.getElementById("filter-status").value;
    const searchFilter = document.getElementById("filter-search").value.toLowerCase();

    let filtered = allAlerts.filter(a => {
      const matchRisk = riskFilter === "All" || a.risk_level === riskFilter;
      const matchStatus = statusFilter === "All" || a.status === statusFilter;
      const matchSearch = a.tourist_name.toLowerCase().includes(searchFilter) || a.tourist_id.toLowerCase().includes(searchFilter);
      return matchRisk && matchStatus && matchSearch;
    });

    tbody.innerHTML = filtered.map(a => `
      <tr style="border-bottom: 1px solid var(--border-color); font-size: 13px;">
        <td style="padding: 12px 16px; font-family: monospace;">${a.id}</td>
        <td style="padding: 12px 16px;">${new Date(a.created_at).toLocaleString()}</td>
        <td style="padding: 12px 16px; font-weight: bold;">${a.tourist_name}<br><span style="font-size:11px;color:var(--text-secondary);font-weight:normal;">${a.tourist_id}</span></td>
        <td style="padding: 12px 16px;">
          <span style="background: ${getRiskColor(a.risk_level)}20; color: ${getRiskColor(a.risk_level)}; padding: 4px 8px; border-radius: 4px; font-weight: bold; border: 1px solid ${getRiskColor(a.risk_level)}">
            ${a.risk_level}
          </span>
        </td>
        <td style="padding: 12px 16px;">${a.reason}</td>
        <td style="padding: 12px 16px; color: ${a.status === 'Resolved' ? 'var(--safe)' : 'var(--danger)'}">${a.status}</td>
        <td style="padding: 12px 16px;">
          ${a.status === 'Active' ? `<button onclick="openResolveModal('${a.id}')" class="btn-primary" style="padding: 4px 10px; font-size: 11px;">Resolve</button>` : `<span style="font-size: 11px; color: var(--text-secondary);">Resolved by ${a.reviewed_by}</span>`}
        </td>
      </tr>
    `).join("");

    // Update Stats
    document.getElementById("stat-total-alerts").innerText = allAlerts.length;
    document.getElementById("stat-active-alerts").innerText = allAlerts.filter(a => a.status === "Active").length;
    document.getElementById("stat-resolved-alerts").innerText = allAlerts.filter(a => a.status === "Resolved").length;
  }

  window.openResolveModal = function(id) {
    selectedAlertId = id;
    document.getElementById("resolve-remarks").value = "";
    document.getElementById("resolve-modal").style.display = "flex";
  };

  document.getElementById("btn-cancel-resolve").addEventListener("click", () => {
    document.getElementById("resolve-modal").style.display = "none";
    selectedAlertId = null;
  });

  document.getElementById("btn-confirm-resolve").addEventListener("click", async () => {
    if (!selectedAlertId) return;
    const remarks = document.getElementById("resolve-remarks").value;
    
    try {
      const res = await fetch(`/api/ai-alerts/${selectedAlertId}/resolve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks })
      });
      if (res.ok) {
        document.getElementById("resolve-modal").style.display = "none";
        fetchAlerts();
      } else {
        const error = await res.json();
        alert("Failed to resolve: " + (error.error || "Unknown error"));
      }
    } catch (err) {
      alert("Network error.");
    }
  });

  document.getElementById("filter-risk").addEventListener("change", renderAlerts);
  document.getElementById("filter-status").addEventListener("change", renderAlerts);
  document.getElementById("filter-search").addEventListener("input", renderAlerts);
  document.getElementById("btn-refresh").addEventListener("click", fetchAlerts);

  document.getElementById("logout-btn").addEventListener("click", () => {
    document.cookie = "tsms_jwt=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = "/admin-login";
  });

  fetchAlerts();
});

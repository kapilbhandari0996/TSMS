const { logAudit } = require("./auditLogger");
const { pool } = require("./db");

let broadcastCallback = null;

function setBroadcastCallback(cb) {
  broadcastCallback = cb;
}

async function triggerAlert(tourist, riskLevel, reason) {
  try {
    const alertId = "AI-ALT-" + Math.floor(1000 + Math.random() * 9000);
    await pool.query(
      `INSERT INTO ai_alerts (id, tourist_id, tourist_name, risk_level, reason, x, y)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [alertId, tourist.id, tourist.full_name, riskLevel, reason, tourist.x, tourist.y]
    );
    
    const newAlert = {
      id: alertId, tourist_id: tourist.id, tourist_name: tourist.full_name,
      risk_level: riskLevel, reason: reason, x: tourist.x, y: tourist.y,
      status: 'Active', created_at: new Date().toISOString()
    };
    
    console.log(`[AI ENGINE] 🚨 Alert triggered for ${tourist.full_name}: ${reason} [${riskLevel}]`);
    logAudit("SYSTEM", "AI Engine", `Created AI Alert ${alertId} for ${tourist.id}`);
    
    if (broadcastCallback) {
      broadcastCallback({ type: "ai_alert_new", alert: newAlert });
    }
  } catch (err) {
    console.error("[AI ENGINE] Error triggering alert:", err);
  }
}

async function checkAnomalies() {
  try {
    // 1. Inactive > 6 hours
    const inactiveRes = await pool.query(`
      SELECT * FROM tourists 
      WHERE last_active_timestamp < NOW() - INTERVAL '6 hours' 
      AND status != 'Distress'
    `);
    
    // 2. Same GPS > 8 hours
    const stuckRes = await pool.query(`
      SELECT * FROM tourists 
      WHERE last_moved_timestamp < NOW() - INTERVAL '8 hours'
      AND status != 'Distress'
    `);
    
    // 3. SOS > 3 times in 10 mins
    const sosSpamRes = await pool.query(`
      SELECT tourist_id, tourist_name, COUNT(*) as sos_count
      FROM incidents
      WHERE type = 'SOS' AND timestamp::timestamp > NOW() - INTERVAL '10 minutes'
      GROUP BY tourist_id, tourist_name
      HAVING COUNT(*) > 3
    `);

    // Fetch existing active alerts to prevent spamming the same alert
    const activeAlertsRes = await pool.query("SELECT tourist_id, reason FROM ai_alerts WHERE status = 'Active'");
    const activeAlerts = activeAlertsRes.rows;

    for (const t of inactiveRes.rows) {
      const reason = "Tourist inactive for more than 6 hours";
      if (!activeAlerts.find(a => a.tourist_id === t.id && a.reason === reason)) {
        await triggerAlert(t, "Medium Risk", reason);
      }
    }

    for (const t of stuckRes.rows) {
      const reason = "Tourist stationary for more than 8 hours";
      if (!activeAlerts.find(a => a.tourist_id === t.id && a.reason === reason)) {
        await triggerAlert(t, "Low Risk", reason);
      }
    }

    for (const t of sosSpamRes.rows) {
      const reason = "Multiple SOS requests within 10 minutes";
      if (!activeAlerts.find(a => a.tourist_id === t.tourist_id && a.reason === reason)) {
        // mock tourist object for triggerAlert
        const fakeTourist = { id: t.tourist_id, full_name: t.tourist_name, x: t.x || 0, y: t.y || 0 };
        await triggerAlert(fakeTourist, "Critical", reason);
      }
    }
  } catch (err) {
    console.error("[AI ENGINE] Error checking anomalies:", err);
  }
}

function startAnomalyEngine(intervalMs = 60000) {
  console.log(`[AI ENGINE] Started anomaly monitoring (Interval: ${intervalMs}ms)`);
  setInterval(checkAnomalies, intervalMs);
}

module.exports = { startAnomalyEngine, setBroadcastCallback };

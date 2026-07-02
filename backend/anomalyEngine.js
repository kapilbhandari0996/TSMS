const { logAudit } = require("./auditLogger");
const { pool } = require("./db");

let broadcastCallback = null;

function setBroadcastCallback(cb) {
  broadcastCallback = cb;
}

async function triggerAlert(tourist, riskLevel, reason) {
  try {
    const touristName = tourist.full_name || "Unknown Tourist";
    const alertId = Math.floor(100000 + Math.random() * 900000); // Generate integer ID

    const existingRes = await pool.query(
      "SELECT id FROM ai_alerts WHERE tourist_id = $1 AND reason = $2 AND status = 'Active'",
      [tourist.id, reason]
    );

    if (existingRes.rowCount > 0) {
      return;
    }

    await pool.query(
      `INSERT INTO ai_alerts (id, tourist_id, full_name, risk_level, reason, x, y)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [alertId, tourist.id, touristName, riskLevel, reason, tourist.x, tourist.y]
    );

    const newAlert = {
      id: alertId, tourist_id: tourist.id, full_name: touristName,
      risk_level: riskLevel, reason: reason, x: tourist.x, y: tourist.y,
      status: 'Active', created_at: new Date().toISOString()
    };

    console.log(`[AI ENGINE] 🚨 Alert triggered for ${touristName}: ${reason} [${riskLevel}]`);
    logAudit("SYSTEM", "AI Engine", `Created AI Alert ${alertId} for ${tourist.id}`);

    if (broadcastCallback) {
      broadcastCallback({ type: "ai_alert_new", alert: newAlert });
    }
  } catch (err) {
    console.error("[AI ENGINE] Error triggering alert:", err.message || err);
  }
}

async function checkAnomalies() {
  try {
    const inactiveRes = await pool.query(`
      SELECT id, full_name, status
      FROM tourists
      WHERE last_active_timestamp < NOW() - INTERVAL '6 hours'
      AND status != 'Distress'
    `);

    const stuckRes = await pool.query(`
      SELECT id, full_name, status
      FROM tourists
      WHERE last_moved_timestamp < NOW() - INTERVAL '8 hours'
      AND status != 'Distress'
    `);

    const sosSpamRes = await pool.query(`
      SELECT tourist_id, COUNT(*) as sos_count
      FROM incidents
      WHERE type = 'SOS'
        AND created_at >= NOW() - INTERVAL '10 minutes'
      GROUP BY tourist_id
      HAVING COUNT(*) > 3
    `);

    const activeAlertsRes = await pool.query("SELECT tourist_id, reason FROM ai_alerts WHERE status = 'Active'");
    const activeAlerts = activeAlertsRes.rows || [];

    for (const t of inactiveRes.rows || []) {
      const reason = "Tourist inactive for more than 6 hours";
      const hasActiveAlert = activeAlerts.some(a => a.tourist_id === t.id && a.reason === reason);
      if (!hasActiveAlert) {
        await triggerAlert({ ...t, full_name: t.full_name || "Unknown Tourist" }, "Medium Risk", reason);
      }
    }

    for (const t of stuckRes.rows || []) {
      const reason = "Tourist stationary for more than 8 hours";
      const hasActiveAlert = activeAlerts.some(a => a.tourist_id === t.id && a.reason === reason);
      if (!hasActiveAlert) {
        await triggerAlert({ ...t, full_name: t.full_name || "Unknown Tourist" }, "Low Risk", reason);
      }
    }

    for (const t of sosSpamRes.rows || []) {
      const reason = "Multiple SOS requests within 10 minutes";
      const hasActiveAlert = activeAlerts.some(a => a.tourist_id === t.tourist_id && a.reason === reason);
      if (!hasActiveAlert) {
        await triggerAlert({ id: t.tourist_id, full_name: "Unknown Tourist", x: 0, y: 0 }, "Critical", reason);
      }
    }
  } catch (err) {
    console.error("[AI ENGINE SAFE ERROR]");
    console.error(err);
    if (err.stack) console.error(err.stack);
    if (err.query) console.error(err.query);
  }
}

function startAnomalyEngine(intervalMs = 60000) {
  console.log(`[AI ENGINE] Started anomaly monitoring (Interval: ${intervalMs}ms)`);
  setInterval(() => {
    checkAnomalies().catch((err) => {
      console.error("[AI ENGINE SAFE ERROR]");
      console.error(err);
      if (err.stack) console.error(err.stack);
      if (err.query) console.error(err.query);
    });
  }, intervalMs);
}

module.exports = { startAnomalyEngine, setBroadcastCallback };

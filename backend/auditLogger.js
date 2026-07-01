const { pool } = require("./db");

async function logAudit(userId, role, action, ipAddress = "unknown") {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, role, action, ip_address) VALUES ($1, $2, $3, $4)`,
      [userId || "SYSTEM", role || "System", action, ipAddress]
    );
  } catch (err) {
    console.error("[AUDIT] Failed to log action:", err);
  }
}

module.exports = { logAudit };

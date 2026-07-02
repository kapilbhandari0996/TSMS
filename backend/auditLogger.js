const { pool } = require("./db");

let tableChecked = false;

async function logAudit(userId, role, action, ipAddress = "unknown") {
  try {
    if (!tableChecked) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(50),
          role VARCHAR(50),
          action TEXT,
          ip_address VARCHAR(50),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      tableChecked = true;
    }
    await pool.query(
      `INSERT INTO audit_logs (user_id, role, action, ip_address) VALUES ($1, $2, $3, $4)`,
      [userId || "SYSTEM", role || "System", action, ipAddress]
    );
  } catch (err) {
    if (err.code === '42P01') {
      console.warn("[AUDIT] Table audit_logs does not exist. Skipping audit log.");
    } else {
      console.error("[AUDIT] Failed to log action:", err);
    }
  }
}

module.exports = { logAudit };

const { Pool } = require("pg");

const pool = new Pool({
  host: "localhost",
  user: "postgres",
  password: "kapil123",
  database: "tsms_db",
  port: 5432
});

async function logAudit(userId, role, action, ipAddress = "127.0.0.1") {
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

class AIAnomalyDetector {
  constructor(pool, broadcastUpdate) {
    this.pool = pool;
    this.broadcastUpdate = broadcastUpdate; // Function to broadcast websocket
    this.interval = null;
  }

  start() {
    console.log("[AI] Anomaly Detection Engine Started.");
    // Run every 60 seconds
    this.interval = setInterval(() => this.analyze(), 60 * 1000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  async analyze() {
    try {
      // 1. Detect Spam SOS: > 2 SOS incidents in last 15 minutes for any tourist
      const recentIncidents = await this.pool.query(`
        SELECT tourist_id, COUNT(*) as count 
        FROM incidents 
        WHERE timestamp > $1 
        GROUP BY tourist_id
      `, [new Date(Date.now() - 15 * 60 * 1000).toISOString()]);

      for (const row of recentIncidents.rows) {
        if (row.count >= 2) {
          await this.generateAlert(row.tourist_id, "Spam SOS", "Tourist has triggered multiple SOS alerts in a short timeframe. Possible panic or device malfunction.");
        }
      }

      // 2. Detect Inactivity: tourist not at hotel, last_updated > 2 hours ago
      // Because last_updated is sometimes "Just now" or ISO, we will try to parse. 
      // For a robust system, we check checkin_history, but we'll do a simple check.
      const touristsRes = await this.pool.query("SELECT id, activity, last_updated FROM tourists WHERE activity != 'Resting / At Hotel'");
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      
      for (const t of touristsRes.rows) {
        if (t.last_updated && t.last_updated !== "Just now") {
          const lastTime = new Date(t.last_updated).getTime();
          if (lastTime < twoHoursAgo) {
            await this.generateAlert(t.id, "Long Inactivity", `Tourist has been ${t.activity} for over 2 hours without any status update.`);
          }
        }
      }

    } catch (err) {
      console.error("[AI] Error during anomaly analysis:", err);
    }
  }

  async generateAlert(touristId, type, message) {
    // Check if an unresolved alert of this type already exists for this tourist
    const existing = await this.pool.query(`
      SELECT id FROM ai_alerts 
      WHERE tourist_id = $1 AND type = $2 AND resolved = FALSE
    `, [touristId, type]);

    if (existing.rowCount === 0) {
      await this.pool.query(`
        INSERT INTO ai_alerts (tourist_id, type, message, timestamp) 
        VALUES ($1, $2, $3, $4)
      `, [touristId, type, new Date().toISOString()]);
      
      console.log(`[AI-ALERT] ${type} for Tourist ${touristId}`);
      if (this.broadcastUpdate) this.broadcastUpdate();
    }
  }
}

module.exports = AIAnomalyDetector;

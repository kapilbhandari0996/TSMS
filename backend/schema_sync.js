const { pool } = require("./db");

async function ensureDatabaseSync() {
  console.log("[SCHEMA SYNC] Ensuring database tables exist...");
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  } catch (extErr) {
    console.warn("[SCHEMA SYNC] Could not create pgcrypto extension (likely permission denied). Non-critical, continuing...");
  }

  try {

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tourists (
        id VARCHAR(50) PRIMARY KEY,
        full_name VARCHAR(100),
        email TEXT,
        password_hash VARCHAR(255) NOT NULL DEFAULT '',
        date_of_birth DATE,
        nationality VARCHAR(50),
        passport_no TEXT,
        passport_expiry DATE,
        visa_no TEXT,
        visa_expiry DATE,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        emergency_contact_name_2 TEXT,
        emergency_contact_phone_2 TEXT,
        emergency_contact_name_3 TEXT,
        emergency_contact_phone_3 TEXT,
        mobile_number TEXT,
        kyc_status VARCHAR(50) DEFAULT 'Pending',
        kyc_rejection_reason TEXT,
        status VARCHAR(50) DEFAULT 'Safe',
        activity VARCHAR(100) DEFAULT 'Resting',
        x INTEGER DEFAULT 220,
        y INTEGER DEFAULT 350,
        heart_rate INTEGER DEFAULT 72,
        speed REAL DEFAULT 0.0,
        battery INTEGER DEFAULT 100,
        last_updated VARCHAR(50),
        last_active_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_moved_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checkin_history TEXT[] DEFAULT '{}',
        tourist_id VARCHAR(50)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS incidents (
        id VARCHAR(50) PRIMARY KEY,
        tourist_id VARCHAR(50) REFERENCES tourists(id) ON DELETE CASCADE,
        full_name VARCHAR(100),
        tourist_name VARCHAR(100),
        type VARCHAR(100),
        location VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        timestamp VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Active'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_alerts (
        id VARCHAR(50) PRIMARY KEY,
        tourist_id VARCHAR(50) REFERENCES tourists(id) ON DELETE CASCADE,
        full_name VARCHAR(100),
        tourist_name VARCHAR(100),
        risk_level VARCHAR(50),
        reason TEXT,
        x INTEGER,
        y INTEGER,
        status VARCHAR(50) DEFAULT 'Active',
        reviewed_by VARCHAR(100),
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        role VARCHAR(50)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS kyc_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tourist_id VARCHAR(50) REFERENCES tourists(id) ON DELETE CASCADE,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(30) DEFAULT 'Pending',
        rejection_reason TEXT,
        ocr_full_name VARCHAR(200),
        ocr_passport_no VARCHAR(50),
        ocr_dob VARCHAR(20),
        ocr_nationality VARCHAR(100),
        ocr_expiry VARCHAR(20),
        ocr_issuing_country VARCHAR(100),
        ocr_mrz TEXT,
        entered_full_name VARCHAR(200),
        entered_passport_no VARCHAR(50),
        entered_dob VARCHAR(20),
        entered_nationality VARCHAR(100),
        validation_passed BOOLEAN DEFAULT FALSE,
        validation_errors JSONB DEFAULT '[]',
        passport_doc_path TEXT,
        visa_doc_path TEXT,
        selfie_path TEXT,
        face_match_score REAL DEFAULT 0
      )
    `);

  } catch (err) {
    console.error("[SCHEMA SYNC] Failed to create some database tables.");
    console.error(err.message || err);
  }

  // ALTERS must be guaranteed to run even if table creations above fail (e.g., due to pgcrypto UUID issues)
  try {
    // Force ID columns to be VARCHAR(50) to fix "invalid input syntax for type integer" errors for INC- and AI-ALT-
    await pool.query(`ALTER TABLE incidents ALTER COLUMN id TYPE VARCHAR(50)`);
    await pool.query(`ALTER TABLE ai_alerts ALTER COLUMN id TYPE VARCHAR(50)`);

    await pool.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS full_name VARCHAR(100)`);
    await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS full_name VARCHAR(100)`);
    await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS tourist_name VARCHAR(100)`);
    await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS type VARCHAR(100)`);
    await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location VARCHAR(100)`);
    await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS timestamp VARCHAR(50)`);
    await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active'`);
    await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS full_name VARCHAR(100)`);
    
    await pool.query(`ALTER TABLE tourists DROP COLUMN IF EXISTS tourist_name`);
    await pool.query(`ALTER TABLE tourists DROP COLUMN IF EXISTS name`);
    
    console.log("[SCHEMA SYNC] All database columns synchronized.");
  } catch (err) {
    console.error("[SCHEMA SYNC] Failed to sync column alterations.");
    console.error(err.message || err);
  }
}

module.exports = { ensureDatabaseSync };

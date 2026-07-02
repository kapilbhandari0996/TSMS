const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const { encrypt } = require("./cryptoUtils");
const { getDbConfig } = require("./db");
const pgConfig = getDbConfig();

if (!process.env.DATABASE_URL && !process.env.PG_CONNECTION_STRING && !process.env.DB_HOST && !process.env.PGHOST && process.env.NODE_ENV === "production") {
  console.error("[DB] Missing DATABASE_URL in production. Set DATABASE_URL before running database initialization.");
  process.exit(1);
}

async function init() {
  const client = new Client(pgConfig);
  try {
    await client.connect();
    console.log("[DB] Connected to configured PostgreSQL database.");

    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    await client.query(`
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
        checkin_history TEXT[] DEFAULT '{}'
      )
    `);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS full_name VARCHAR(100)`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS email TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT ''`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS date_of_birth DATE`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS nationality VARCHAR(50)`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS passport_no TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS passport_expiry DATE`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS visa_no TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS visa_expiry DATE`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_name_2 TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_phone_2 TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_name_3 TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_phone_3 TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS mobile_number TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'Pending'`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Safe'`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS activity VARCHAR(100) DEFAULT 'Resting'`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS x INTEGER DEFAULT 220`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS y INTEGER DEFAULT 350`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS heart_rate INTEGER DEFAULT 72`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS speed REAL DEFAULT 0.0`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS battery INTEGER DEFAULT 100`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS last_updated VARCHAR(50)`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS last_active_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS last_moved_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS checkin_history TEXT[] DEFAULT '{}'`);
    await client.query(`ALTER TABLE tourists ADD COLUMN IF NOT EXISTS tourist_id VARCHAR(50)`);
    console.log("[DB] Table 'tourists' verified/created.");

    await client.query(`
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
    await client.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS tourist_id VARCHAR(50)`);
    await client.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS full_name VARCHAR(100)`);
    await client.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS tourist_name VARCHAR(100)`);
    await client.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS type VARCHAR(100)`);
    await client.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location VARCHAR(100)`);
    await client.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await client.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS timestamp VARCHAR(50)`);
    await client.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active'`);
    await client.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS note TEXT`);
    console.log("[DB] Table 'incidents' verified/created.");

    await client.query(`
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
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS tourist_id VARCHAR(50)`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS full_name VARCHAR(100)`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS tourist_name VARCHAR(100)`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS risk_level VARCHAR(50)`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS reason TEXT`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS x INTEGER`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS y INTEGER`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active'`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100)`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS remarks TEXT`);
    await client.query(`ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    console.log("[DB] Table 'ai_alerts' verified/created.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50),
        role VARCHAR(50),
        action TEXT,
        ip_address VARCHAR(50),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[DB] Table 'audit_logs' verified/created.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        role VARCHAR(50)
      )
    `);
    console.log("[DB] Table 'admins' verified/created.");

    await client.query(`
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
    console.log("[DB] Table 'kyc_submissions' verified/created.");

    const touristCountRes = await client.query("SELECT COUNT(*) FROM tourists");
    const count = parseInt(touristCountRes.rows[0].count, 10);

    if (count === 0) {
      console.log("[DB] Seeding initial data...");
      const dbJsonPath = path.join(__dirname, "../db.json");
      if (fs.existsSync(dbJsonPath)) {
        const rawData = fs.readFileSync(dbJsonPath, "utf8");
        const initialData = JSON.parse(rawData);

        for (const t of initialData.tourists) {
          const history = t.checkinHistory || [];
          const rawPassword = t.passwordHash || "sarah123";
          const passwordHash = rawPassword;
          
          await client.query(`
            INSERT INTO tourists (
              id, full_name, email, password_hash, date_of_birth, nationality,
              passport_no, passport_expiry, visa_no, visa_expiry, emergency_contact_name, 
              emergency_contact_phone, kyc_status, status, activity, x, y, 
              heart_rate, speed, battery, last_updated, checkin_history
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          `, [
            t.id, t.fullName, encrypt(t.email || ""), passwordHash, t.dateOfBirth || null, t.nationality || "",
            encrypt(t.passportNo || ""), t.passportExpiry || null, encrypt(t.visaNo || ""), t.visaExpiry || null, encrypt(t.emergencyContactName || ""),
            encrypt(t.emergencyContactPhone || ""), t.kycStatus || "Pending", t.status || "Safe", t.activity || "Resting",
            t.x || 220, t.y || 350, t.heartRate || 72, t.speed || 0.0, t.battery || 100, t.lastUpdated || "",
            history
          ]);
        }

        const adminHash = "admin123";
        await client.query(`
          INSERT INTO admins (username, password_hash, full_name, role)
          VALUES 
          ('admin', $1, 'System Administrator', 'Super Admin'),
          ('tourism_dept', $1, 'Tourism Department', 'Tourism Department'),
          ('law_enforcement', $1, 'Law Enforcement', 'Law Enforcement')
          ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
        `, [adminHash]);
        console.log("[DB] Seeded admins with new password.");
        console.log(`[DB] Seeded ${initialData.tourists.length} tourists.`);

        for (const inc of initialData.incidents) {
          await client.query(`
            INSERT INTO incidents (
              id, tourist_id, full_name, tourist_name, type, location, created_at, timestamp, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            inc.id, inc.touristId, inc.fullName, inc.touristName, inc.type, inc.location, new Date(), inc.timestamp, inc.status
          ]);
        }
        console.log(`[DB] Seeded ${initialData.incidents.length} incidents.`);
      } else {
        console.log("[DB] No db.json found to seed data.");
      }
    } else {
      console.log("[DB] Database already has data. Skipping seeding.");
    }

  } catch (err) {
    console.error("[DB] Error setting up database schema:", err);
    process.exit(1);
  } finally {
    await client.end();
    console.log("[DB] Database initialization complete.");
  }
}

init();

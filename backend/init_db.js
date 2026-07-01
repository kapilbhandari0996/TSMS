const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { encrypt } = require("./cryptoUtils");
const pgConfig = {
  host: "localhost",
  user: "postgres",
  password: "kapil123",
  port: 5432
};

async function init() {
  // 1. Connect to default postgres database to create tsms_db
  let client = new Client({ ...pgConfig, database: "postgres" });
  try {
    await client.connect();
    console.log("[DB] Connected to default postgres database.");
    
    // Check if tsms_db exists
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'tsms_db'");
    if (res.rowCount === 0) {
      await client.query("CREATE DATABASE tsms_db");
      console.log("[DB] Database 'tsms_db' created successfully.");
    } else {
      console.log("[DB] Database 'tsms_db' already exists.");
    }
  } catch (err) {
    console.error("[DB] Error creating database:", err);
    process.exit(1);
  } finally {
    await client.end();
  }

  // 2. Connect to tsms_db to create tables
  client = new Client({ ...pgConfig, database: "tsms_db" });
  try {
    await client.connect();
    console.log("[DB] Connected to 'tsms_db' database.");

    // Drop tables to enforce password hashing reset
    await client.query(`DROP TABLE IF EXISTS incidents CASCADE`);
    await client.query(`DROP TABLE IF EXISTS tourists CASCADE`);
    
    // Create tourists table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tourists (
        id VARCHAR(50) PRIMARY KEY,
        full_name VARCHAR(100),
        email TEXT,
        password_hash VARCHAR(255) NOT NULL,
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
    console.log("[DB] Table 'tourists' verified/created.");

    // Create incidents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS incidents (
        id VARCHAR(50) PRIMARY KEY,
        tourist_id VARCHAR(50) REFERENCES tourists(id) ON DELETE CASCADE,
        tourist_name VARCHAR(100),
        type VARCHAR(100),
        location VARCHAR(100),
        timestamp VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Active'
      )
    `);
    console.log("[DB] Table 'incidents' verified/created.");

    // Create ai_alerts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_alerts (
        id VARCHAR(50) PRIMARY KEY,
        tourist_id VARCHAR(50) REFERENCES tourists(id) ON DELETE CASCADE,
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
    console.log("[DB] Table 'ai_alerts' verified/created.");

    // Create audit_logs table
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

    // Create admins table
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

    // 3. Seed initial data from db.json if tables are empty
    const touristCountRes = await client.query("SELECT COUNT(*) FROM tourists");
    const count = parseInt(touristCountRes.rows[0].count, 10);

    if (count === 0) {
      console.log("[DB] Seeding initial data...");
      const dbJsonPath = path.join(__dirname, "../db.json");
      if (fs.existsSync(dbJsonPath)) {
        const rawData = fs.readFileSync(dbJsonPath, "utf8");
        const initialData = JSON.parse(rawData);

        // Seed Tourists
        for (const t of initialData.tourists) {
          const history = t.checkinHistory || [];
          const rawPassword = t.passwordHash || "sarah123";
          const passwordHash = await bcrypt.hash(rawPassword, 10);
          
          await client.query(`
            INSERT INTO tourists (
              id, full_name, email, password_hash, date_of_birth, nationality, 
              passport_no, visa_no, visa_expiry, emergency_contact_name, 
              emergency_contact_phone, kyc_status, status, activity, x, y, 
              heart_rate, speed, battery, last_updated, checkin_history
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          `, [
            t.id, t.fullName, encrypt(t.email || ""), passwordHash, t.dateOfBirth || null, t.nationality || "",
            encrypt(t.passportNo || ""), encrypt(t.visaNo || ""), t.visaExpiry || null, encrypt(t.emergencyContactName || ""),
            encrypt(t.emergencyContactPhone || ""), t.kycStatus || "Pending", t.status || "Safe", t.activity || "Resting",
            t.x || 220, t.y || 350, t.heartRate || 72, t.speed || 0.0, t.battery || 100, t.lastUpdated || "",
            history
          ]);
        }

        // Seed Admins
        const adminHash = await bcrypt.hash("admin123", 10);
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

        // Seed Incidents
        for (const inc of initialData.incidents) {
          await client.query(`
            INSERT INTO incidents (
              id, tourist_id, tourist_name, type, location, timestamp, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            inc.id, inc.touristId, inc.touristName, inc.type, inc.location, inc.timestamp, inc.status
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

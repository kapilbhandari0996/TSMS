const { Client } = require("pg");
const { getDbConfig } = require("./db");

const pgConfig = getDbConfig();

async function migrate() {
  const client = new Client(pgConfig);
  try {
    await client.connect();
    console.log("[MIGRATE] Connected to 'tsms_db'.");

    // 1. Add new columns to tourists table
    const newTouristCols = [
      "ALTER TABLE tourists ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(30)",
      "ALTER TABLE tourists ADD COLUMN IF NOT EXISTS passport_expiry DATE",
      "ALTER TABLE tourists ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT"
    ];
    for (const sql of newTouristCols) {
      await client.query(sql);
    }
    console.log("[MIGRATE] tourists table updated with new KYC columns.");

    // 2. Create kyc_submissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS kyc_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tourist_id VARCHAR(50) REFERENCES tourists(id) ON DELETE CASCADE,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(30) DEFAULT 'Pending',
        rejection_reason TEXT,
        -- OCR Extracted Data
        ocr_full_name VARCHAR(200),
        ocr_passport_no VARCHAR(50),
        ocr_dob VARCHAR(20),
        ocr_nationality VARCHAR(100),
        ocr_expiry VARCHAR(20),
        ocr_issuing_country VARCHAR(100),
        ocr_mrz TEXT,
        -- User-entered data (snapshot at submission)
        entered_full_name VARCHAR(200),
        entered_passport_no VARCHAR(50),
        entered_dob VARCHAR(20),
        entered_nationality VARCHAR(100),
        -- Validation
        validation_passed BOOLEAN DEFAULT FALSE,
        validation_errors JSONB DEFAULT '[]',
        -- File paths
        passport_doc_path TEXT,
        visa_doc_path TEXT,
        selfie_path TEXT,
        -- Confidence score
        face_match_score REAL DEFAULT 0
      )
    `);
    console.log("[MIGRATE] kyc_submissions table created/verified.");

    console.log("[MIGRATE] ✅ Migration complete.");
  } catch (err) {
    console.error("[MIGRATE] Error during migration:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();

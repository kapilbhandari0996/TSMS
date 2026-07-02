CREATE TABLE IF NOT EXISTS tourists (
  id VARCHAR(50) PRIMARY KEY,
  full_name VARCHAR(100),
  tourist_name VARCHAR(100),
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
);

ALTER TABLE tourists ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS tourist_name VARCHAR(100);
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT '';
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS nationality VARCHAR(50);
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS passport_no TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS passport_expiry DATE;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS visa_no TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS visa_expiry DATE;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_name_2 TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_phone_2 TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_name_3 TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS emergency_contact_phone_3 TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS mobile_number TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'Pending';
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Safe';
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS activity VARCHAR(100) DEFAULT 'Resting';
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS x INTEGER DEFAULT 220;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS y INTEGER DEFAULT 350;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS heart_rate INTEGER DEFAULT 72;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS speed REAL DEFAULT 0.0;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS battery INTEGER DEFAULT 100;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS last_updated VARCHAR(50);
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS last_active_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS last_moved_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS checkin_history TEXT[] DEFAULT '{}';
ALTER TABLE tourists ADD COLUMN IF NOT EXISTS tourist_id VARCHAR(50);

CREATE TABLE IF NOT EXISTS incidents (
  id VARCHAR(50) PRIMARY KEY,
  tourist_id VARCHAR(50) REFERENCES tourists(id) ON DELETE CASCADE,
  tourist_name VARCHAR(100),
  type VARCHAR(100),
  location VARCHAR(100),
  timestamp VARCHAR(50),
  status VARCHAR(50) DEFAULT 'Active'
);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS tourist_id VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS tourist_name VARCHAR(100);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location VARCHAR(100);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS timestamp VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

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
);

ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS tourist_id VARCHAR(50);
ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS tourist_name VARCHAR(100);
ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS risk_level VARCHAR(50);
ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS x INTEGER;
ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS y INTEGER;
ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active';
ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100);
ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50),
  role VARCHAR(50),
  action TEXT,
  ip_address VARCHAR(50),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  role VARCHAR(50)
);

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
);

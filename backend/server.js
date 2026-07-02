// Tourist Safety & Smart Monitoring System (TSMS) - Node.js Express & WS Backend Server
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { runFullVerification } = require("./ocrModule");

const { encrypt, decrypt } = require("./cryptoUtils");
const { logAudit } = require("./auditLogger");
const { generateToken, verifyToken, requireRole } = require("./authMiddleware");
const { startAnomalyEngine, setBroadcastCallback } = require("./anomalyEngine");
const { pool } = require("./db");
const { ensureDatabaseSync } = require("./schema_sync");

// ===== TEMP DATABASE DEBUG =====
(async () => {
  try {
    const schemaQueries = [
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'tourists' ORDER BY ordinal_position",
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'incidents' ORDER BY ordinal_position"
    ];

    for (const sql of schemaQueries) {
      console.log(`[SCHEMA CHECK] ${sql}`);
      const res = await pool.query(sql);
      console.log(`[SCHEMA CHECK] ${JSON.stringify(res.rows.map((row) => row.column_name))}`);
    }

    const dbInfo = await pool.query(`
      SELECT current_database(), current_schema();
    `);
    console.log("[DB INFO]", dbInfo.rows);
    const tables = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    console.log("[DB TABLES]", tables.rows);
    const aiAlerts = await pool.query(`
      SELECT COUNT(*) FROM ai_alerts;
    `);
    console.log("[AI ALERTS TABLE EXISTS]", aiAlerts.rows);
  } catch (err) {
    console.error("[DB CHECK ERROR]", err);
  }
})();
// ===== END TEMP DATABASE DEBUG =====

const PORT = 3001;
const UPLOADS_DIR = path.join(__dirname, "uploads", "kyc");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// --- MULTER FILE STORAGE (UUID filenames) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".pdf", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Only image and PDF files are allowed."));
  }
});

// --- HELPER: System State ---
async function getSystemState() {
  const touristsRes = await pool.query("SELECT * FROM tourists ORDER BY id ASC");
  const incidentsRes = await pool.query("SELECT * FROM incidents ORDER BY id DESC");

  const aiAlertsRes = await pool.query("SELECT * FROM ai_alerts ORDER BY created_at DESC");

  const tourists = touristsRes.rows.map(t => ({
    id: t.tourist_id || t.id.toString(),
    fullName: t.full_name,
    email: decrypt(t.email),
    dateOfBirth: t.date_of_birth ? t.date_of_birth.toISOString().split("T")[0] : "",
    nationality: t.nationality,
    passportNo: decrypt(t.passport_no),
    visaNo: decrypt(t.visa_no),
    visaExpiry: t.visa_expiry ? t.visa_expiry.toISOString().split("T")[0] : "",
    emergencyContactName: decrypt(t.emergency_contact_name),
    emergencyContactPhone: decrypt(t.emergency_contact_phone),
    mobileNumber: decrypt(t.mobile_number),
    kycStatus: t.kyc_status,
    status: t.status,
    activity: t.activity,
    x: t.x,
    y: t.y,
    heartRate: t.heart_rate,
    speed: t.speed,
    battery: t.battery,
    lastUpdated: t.last_updated,
    checkinHistory: t.checkin_history
  }));

  const incidents = incidentsRes.rows.map(i => ({
    id: i.id,
    touristId: i.tourist_id,
    touristName: i.full_name,
    type: i.type,
    location: i.location,
    timestamp: i.timestamp,
    status: i.status
  }));

  const aiAlerts = aiAlertsRes.rows;

  return { tourists, incidents, aiAlerts };
}





// --- INITIALIZE APPLICATION ---
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

// --- HTML PAGE ROUTING ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../frontend/index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "../frontend/login.html")));
app.get("/tourist", (req, res) => res.sendFile(path.join(__dirname, "../frontend/tourist.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "../frontend/admin.html")));
app.get("/admin-login", (req, res) => res.sendFile(path.join(__dirname, "../frontend/admin-login.html")));
app.get("/ai-dashboard", (req, res) => res.sendFile(path.join(__dirname, "../frontend/ai-dashboard.html")));

// --- CREATE WEBSOCKET & HTTP SERVER ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();


// (AI engine removed)

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);
  ws.send(JSON.stringify({ type: "connected", message: "Server WebSockets Linked." }));
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

setBroadcastCallback(async (payload) => {
  broadcast(payload);
  if (payload.type === "ai_alert_new") {
    try {
      const state = await getSystemState();
      broadcast({ type: "state_update", state });
    } catch (err) {
      console.error("[Broadcast] Failed to broadcast state_update for ai_alert:", err);
    }
  }
});

// ============================================================
// --- REST API ENDPOINTS ---
// ============================================================

// 1. System state
app.get("/api/state", async (req, res) => {
  try {
    res.json(await getSystemState());
  } catch (err) {
    console.error("[API] Error fetching state:", err);
    res.status(500).json({ error: "Database query failure." });
  }
});

// AUTH: Tourist Login
app.post("/api/auth/tourist", async (req, res) => {
  const { touristId, password } = req.body;
  if (!touristId || !password)
    return res.status(400).json({ error: "Tourist ID/Email and password required." });

  try {
    const input = touristId.trim();

    const colCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tourists' AND column_name IN ('id', 'tourist_id')
    `);
    
    let idType = 'character varying';
    let hasTouristIdCol = false;
    for (let row of colCheck.rows) {
      if (row.column_name === 'id') idType = row.data_type;
      if (row.column_name === 'tourist_id') hasTouristIdCol = true;
    }
    
    const isIdNumeric = (idType === 'integer' || idType === 'bigint' || idType === 'numeric');
    
    let conditions = [];
    let params = [];
    
    params.push(input);
    params.push(encrypt(input));
    conditions.push(`LOWER(email) = LOWER($1)`);
    conditions.push(`email = $2`);

    if (/^\d+$/.test(input)) {
      params.push(parseInt(input, 10));
      conditions.push(`id = $${params.length}`);
    } else {
      if (input.startsWith("TSMS-") && hasTouristIdCol) {
        params.push(input);
        conditions.push(`tourist_id = $${params.length}`);
      }
      if (!isIdNumeric) {
        params.push(input);
        conditions.push(`id = $${params.length}`);
      }
    }

    const queryStr = `SELECT * FROM tourists WHERE ${conditions.join(" OR ")}`;
    const q = await pool.query(queryStr, params);
    if (q.rowCount === 0)
      return res.status(401).json({ error: "Tourist ID or Email not found." });

    const t = q.rows[0];
    const isMatch = password === t.password_hash;
    if (!isMatch) {
      logAudit(t.id, "Tourist", "Failed login - Incorrect password", req.ip);
      return res.status(401).json({ error: "Incorrect password." });
    }

    const userObj = {
      id: t.tourist_id || t.id.toString(),
      fullName: t.full_name || "Unknown",
      email: decrypt(t.email)
    };
    const token = generateToken(userObj, "Tourist");
    res.cookie('tsms_jwt', token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
    logAudit(userObj.id, "Tourist", "Successful login", req.ip);

    // Return KYC status so frontend can handle pending/rejected states
    const safeTourist = {
      id: t.id, fullName: t.full_name, email: decrypt(t.email),
      dateOfBirth: t.date_of_birth ? t.date_of_birth.toISOString().split("T")[0] : "",
      nationality: t.nationality, passportNo: decrypt(t.passport_no), visaNo: decrypt(t.visa_no),
      visaExpiry: t.visa_expiry ? t.visa_expiry.toISOString().split("T")[0] : "",
      emergencyContactName: decrypt(t.emergency_contact_name),
      emergencyContactPhone: decrypt(t.emergency_contact_phone),
      mobileNumber: decrypt(t.mobile_number),
      kycStatus: t.kyc_status, kycRejectionReason: t.kyc_rejection_reason || null,
      status: t.status, activity: t.activity, x: t.x, y: t.y,
      heartRate: t.heart_rate, speed: t.speed, battery: t.battery,
      lastUpdated: t.last_updated, checkinHistory: t.checkin_history
    };
    console.log(`[AUTH] Tourist login: ${safeTourist.fullName} (${safeTourist.id})`);
    res.json({ 
      success: true, 
      token,
      user: {
        id: t.tourist_id || t.id.toString(),
        name: t.full_name || "Unknown",
        role: "Tourist",
        email: decrypt(t.email)
      },
      tourist: safeTourist
    });
  } catch (err) {
    console.error("[AUTH] Error:", err);
    res.status(500).json({ error: "Database auth failure." });
  }
});

// AUTH: Admin Login
app.post("/api/auth/admin", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required." });
  
  try {
    const q = await pool.query("SELECT * FROM admins WHERE username = $1", [username]);
    if (q.rowCount === 0) return res.status(401).json({ error: "Invalid admin credentials." });
    
    const adminUser = q.rows[0];
    const isMatch = password === adminUser.password_hash;
    
    if (!isMatch) {
      logAudit(adminUser.id, adminUser.role, "Failed admin login", req.ip);
      return res.status(401).json({ error: "Invalid admin credentials." });
    }
    
    const userObj = {
      id: adminUser.id ? adminUser.id.toString() : adminUser.username,
      fullName: adminUser.full_name || adminUser.username || "Unknown",
      email: adminUser.username
    };
    const token = generateToken(userObj, adminUser.role);
    res.cookie('tsms_jwt', token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
    logAudit(userObj.id, adminUser.role, "Successful admin login", req.ip);
    
    res.json({ 
      success: true, 
      token,
      user: {
        id: adminUser.id ? adminUser.id.toString() : adminUser.username,
        name: adminUser.full_name || adminUser.username || "Unknown",
        role: adminUser.role,
        email: adminUser.username
      },
      admin: { username: adminUser.username, fullName: adminUser.full_name, role: adminUser.role } 
    });
  } catch (err) {
    res.status(500).json({ error: "Database error." });
  }
});

// --- ADMIN OPERATIONS ---
app.delete("/api/tourists/:id", verifyToken, requireRole(["Super Admin", "Law Enforcement", "Tourism Department"]), async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query("DELETE FROM tourists WHERE id = $1", [id]);
    broadcast({ type: "state_update", state: await getSystemState() });
    res.json({ success: true });
  } catch (err) {
    console.error("[API] Error deleting tourist:", err);
    res.status(500).json({ error: "Database error while deleting tourist." });
  }
});

// --- AI ALERTS ENDPOINTS ---
app.get("/api/ai-alerts", verifyToken, requireRole(["Super Admin", "Law Enforcement", "Tourism Department"]), async (req, res) => {
  try {
    const q = await pool.query("SELECT * FROM ai_alerts ORDER BY created_at DESC");
    res.json(q.rows);
  } catch(err) { res.status(500).json({ error: "Database error" }); }
});

app.put("/api/ai-alerts/:id/resolve", verifyToken, requireRole(["Super Admin", "Law Enforcement", "Tourism Department"]), async (req, res) => {
  try {
    await pool.query("UPDATE ai_alerts SET status = 'Resolved', remarks = $1, reviewed_by = $2 WHERE id = $3", 
      [req.body.remarks || '', req.user.fullName, req.params.id]);
    logAudit(req.user.id, req.user.role, `Resolved AI Alert ${req.params.id}`, req.ip);
    broadcast({ type: "ai_alert_resolved", alertId: req.params.id });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: "Database error" }); }
});

// ============================================================
// --- KYC ENDPOINTS ---
// ============================================================

// KYC Step 1: Upload documents and run full OCR verification
app.post("/api/kyc/upload",
  upload.fields([
    { name: "passportFile", maxCount: 1 },
    { name: "visaFile", maxCount: 1 },
    { name: "selfieFile", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const files = req.files || {};
      const userInput = {
        fullName:       req.body.fullName || "",
        passportNo:     req.body.passportNo || "",
        dob:            req.body.dob || "",
        nationality:    req.body.nationality || "",
        passportExpiry: req.body.passportExpiry || ""
      };

      const textRegex = /^[A-Za-z\s]+$/;
      const passportRegex = /^[A-Za-z0-9]+$/;
      
      if (!userInput.fullName || !textRegex.test(userInput.fullName)) return res.status(400).json({ error: "Invalid Full Name. Text only allowed." });
      if (!userInput.passportNo || !passportRegex.test(userInput.passportNo)) return res.status(400).json({ error: "Invalid Passport Number." });
      if (!userInput.nationality || !textRegex.test(userInput.nationality)) return res.status(400).json({ error: "Invalid Nationality. Text only allowed." });
      if (!userInput.dob || isNaN(Date.parse(userInput.dob))) return res.status(400).json({ error: "Invalid Date of Birth." });
      if (!userInput.passportExpiry || isNaN(Date.parse(userInput.passportExpiry))) return res.status(400).json({ error: "Invalid Passport Expiry Date." });

      let passportPath = null;
      let visaPath = null;
      let selfiePath = null;

      if (files.passportFile?.[0]) passportPath = files.passportFile[0].path;
      if (files.visaFile?.[0])     visaPath     = files.visaFile[0].path;
      if (files.selfieFile?.[0])   selfiePath   = files.selfieFile[0].path;

      if (!passportPath) {
        return res.status(400).json({ error: "Passport document file is required." });
      }

      console.log(`[KYC] Running full verification for: ${passportPath}`);

      // Run complete verification pipeline via ocrModule
      const verificationResult = await runFullVerification(passportPath, userInput);

      res.json({
        success: true,
        stages:            verificationResult.stages,
        comparisons:       verificationResult.comparisons,
        ocrData:           verificationResult.ocrData,
        validationErrors:  verificationResult.validationErrors,
        validationPassed:  verificationResult.validationPassed,
        hasCriticalError:  verificationResult.hasCriticalError,
        documentUnreadable:verificationResult.documentUnreadable,
        overallStatus:     verificationResult.overallStatus,
        ocrConfidence:     verificationResult.ocrConfidence,
        ocrRawTextLength:  verificationResult.ocrRawTextLength,
        tempFiles: {
          passportPath: passportPath ? path.basename(passportPath) : null,
          visaPath:     visaPath     ? path.basename(visaPath)     : null,
          selfiePath:   selfiePath   ? path.basename(selfiePath)   : null
        }
      });
    } catch (err) {
      console.error("[KYC Upload] Error:", err);
      res.status(500).json({ error: "Document verification failed: " + err.message });
    }
  }
);

// Face Authentication Simulation (POC)
app.post("/api/kyc/face-match", upload.single("selfieFile"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Selfie file is required." });
    
    // Simulate processing time for face authentication
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 10% chance of failure to demonstrate the error UI
    if (Math.random() < 0.1) {
      return res.status(400).json({ error: "Face authentication fails!" });
    }
    
    res.json({ success: true, message: "Face Authentication Successful" });
  } catch (err) {
    console.error("[KYC Face Auth] Error:", err);
    res.status(500).json({ error: "Face authentication failed due to server error." });
  }
});

// KYC Step 2: Final KYC submission (create tourist + kyc_submission record)
app.post("/api/kyc/submit", async (req, res) => {
  const {
    fullName, email, passwordHash, dateOfBirth, nationality,
    passportNo, visaNo, visaExpiry, passportExpiry,
    emergencyContactName, emergencyContactPhone, mobileNumber,
    emergencyContactName2, emergencyContactPhone2,
    emergencyContactName3, emergencyContactPhone3,
    ocrData, validationErrors, validationPassed,
    tempFiles
  } = req.body;

  if (!fullName || !passportNo || !passwordHash || !email)
    return res.status(400).json({ error: "Missing required registration parameters." });

  const textRegex = /^[A-Za-z\s]+$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[0-9\s+]+$/;
  const passportRegex = /^[A-Za-z0-9]+$/;

  if (!textRegex.test(fullName)) return res.status(400).json({ error: "Invalid Full Name. Text only allowed." });
  if (!textRegex.test(nationality)) return res.status(400).json({ error: "Invalid Nationality. Text only allowed." });
  if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid Email Address." });
  if (!phoneRegex.test(mobileNumber)) return res.status(400).json({ error: "Invalid Mobile Number. Numbers only allowed." });
  if (isNaN(Date.parse(dateOfBirth))) return res.status(400).json({ error: "Invalid Date of Birth." });
  if (!passportRegex.test(passportNo)) return res.status(400).json({ error: "Invalid Passport Number." });
  if (isNaN(Date.parse(passportExpiry))) return res.status(400).json({ error: "Invalid Passport Expiry Date." });
  if (!textRegex.test(emergencyContactName)) return res.status(400).json({ error: "Invalid Emergency Contact Name. Text only allowed." });
  if (!phoneRegex.test(emergencyContactPhone)) return res.status(400).json({ error: "Invalid Emergency Contact Phone. Numbers only allowed." });

  if (emergencyContactName2 && !textRegex.test(emergencyContactName2)) return res.status(400).json({ error: "Invalid Emergency Contact 2 Name. Text only allowed." });
  if (emergencyContactPhone2 && !phoneRegex.test(emergencyContactPhone2)) return res.status(400).json({ error: "Invalid Emergency Contact 2 Phone. Numbers only allowed." });
  if (emergencyContactName3 && !textRegex.test(emergencyContactName3)) return res.status(400).json({ error: "Invalid Emergency Contact 3 Name. Text only allowed." });
  if (emergencyContactPhone3 && !phoneRegex.test(emergencyContactPhone3)) return res.status(400).json({ error: "Invalid Emergency Contact 3 Phone. Numbers only allowed." });

  try {
    // Prevent duplicate passport
    const dupCheck = await pool.query("SELECT id FROM tourists WHERE passport_no = $1", [passportNo]);
    if (dupCheck.rowCount > 0)
      return res.status(409).json({ error: "A tourist with this passport number is already registered.", existingId: dupCheck.rows[0].id });

    // Prevent duplicate email
    const emailDupCheck = await pool.query("SELECT id FROM tourists WHERE LOWER(email) = LOWER($1)", [email]);
    if (emailDupCheck.rowCount > 0)
      return res.status(409).json({ error: "A tourist with this email address is already registered." });

    const hashedPw = passwordHash || "";
    const generatedId = "TSMS-" + Math.floor(1000 + Math.random() * 9000);
    const x = Math.floor(200 + Math.random() * 200);
    const y = Math.floor(150 + Math.random() * 200);
    const checkinHistory = [`KYC Submitted — Pending Admin Review (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`];

    // Insert tourist with Pending status
    await pool.query(`
      INSERT INTO tourists (
        id, full_name, email, password_hash, date_of_birth, nationality,
        passport_no, passport_expiry, visa_no, visa_expiry,
        emergency_contact_name, emergency_contact_phone,
        emergency_contact_name_2, emergency_contact_phone_2,
        emergency_contact_name_3, emergency_contact_phone_3,
        mobile_number, kyc_status, status, activity, x, y, heart_rate, speed, battery, last_updated, checkin_history
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
    `, [
      generatedId, fullName, email || "", hashedPw,
      dateOfBirth || null, nationality || "", passportNo,
      passportExpiry || null, visaNo || "", visaExpiry || null,
      emergencyContactName || "", emergencyContactPhone || "",
      emergencyContactName2 || "", emergencyContactPhone2 || "",
      emergencyContactName3 || "", emergencyContactPhone3 || "",
      mobileNumber || "", "Pending", "Safe", "Resting / At Hotel",
      x, y, 72, 0, 100, "Just now", checkinHistory
    ]);

    // Resolve file paths from temp filenames
    const passport_doc_path = tempFiles?.passportPath ? path.join(UPLOADS_DIR, tempFiles.passportPath) : null;
    const visa_doc_path = tempFiles?.visaPath ? path.join(UPLOADS_DIR, tempFiles.visaPath) : null;
    const selfie_path = tempFiles?.selfiePath ? path.join(UPLOADS_DIR, tempFiles.selfiePath) : null;

    // Insert KYC submission record
    await pool.query(`
      INSERT INTO kyc_submissions (
        tourist_id, status,
        ocr_full_name, ocr_passport_no, ocr_dob, ocr_nationality, ocr_expiry, ocr_issuing_country, ocr_mrz,
        entered_full_name, entered_passport_no, entered_dob, entered_nationality,
        validation_passed, validation_errors,
        passport_doc_path, visa_doc_path, selfie_path
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    `, [
      generatedId, "Pending",
      ocrData?.fullName || "", ocrData?.passportNo || "", ocrData?.dob || "",
      ocrData?.nationality || "", ocrData?.expiry || "", ocrData?.issuingCountry || "", ocrData?.mrz ? JSON.stringify(ocrData.mrz) : "",
      fullName, passportNo, dateOfBirth || "", nationality || "",
      validationPassed || false,
      JSON.stringify(validationErrors || []),
      passport_doc_path, visa_doc_path, selfie_path
    ]);

    console.log(`[KYC] Submission created: ${fullName} (${generatedId}) — status: Pending`);

    const state = await getSystemState();
    broadcast({ type: "state_update", state });

    res.status(201).json({
      success: true,
      touristId: generatedId,
      kycStatus: "Pending",
      message: "Your registration has been submitted and is pending admin verification."
    });
  } catch (err) {
    console.error("[KYC Submit] Error:", err);
    res.status(500).json({ error: "Registration failed: " + err.message });
  }
});

// ============================================================
// --- ADMIN KYC ENDPOINTS ---
// ============================================================

// GET: All KYC submissions for admin review
app.get("/api/admin/kyc", async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT ks.*, t.full_name, t.email, t.mobile_number, t.passport_no, t.nationality, t.kyc_rejection_reason
      FROM kyc_submissions ks
      JOIN tourists t ON ks.tourist_id = t.id
      ORDER BY ks.submitted_at DESC
    `);

    const submissions = q.rows.map(r => ({
      id: r.id,
      touristId: r.tourist_id,
      fullName: r.full_name,
      email: r.email,
      mobileNumber: r.mobile_number,
      passportNo: r.passport_no,
      submittedAt: r.submitted_at,
      status: r.status,
      rejectionReason: r.rejection_reason,
      ocrData: {
        fullName: r.ocr_full_name,
        passportNo: r.ocr_passport_no,
        dob: r.ocr_dob,
        nationality: r.ocr_nationality,
        expiry: r.ocr_expiry,
        issuingCountry: r.ocr_issuing_country,
        mrz: r.ocr_mrz
      },
      enteredData: {
        fullName: r.entered_full_name,
        passportNo: r.entered_passport_no,
        dob: r.entered_dob,
        nationality: r.entered_nationality
      },
      validationPassed: r.validation_passed,
      validationErrors: r.validation_errors || [],
      hasPassport: !!r.passport_doc_path,
      hasVisa: !!r.visa_doc_path,
      hasSelfie: !!r.selfie_path
    }));

    res.json(submissions);
  } catch (err) {
      console.error("[API] Error fetching KYC submissions:");
      console.error(err);
      if (err.stack) console.error(err.stack);
      if (err.query) console.error(err.query);
      res.json([]); // Return empty array gracefully if table is missing or query fails
  }
});

// GET: Serve a specific KYC document file (admin only)
app.get("/api/admin/kyc/:id/document/:type", async (req, res) => {
  const { id, type } = req.params;
  const validTypes = ["passport", "visa", "selfie"];
  if (!validTypes.includes(type))
    return res.status(400).json({ error: "Invalid document type." });

  try {
    const q = await pool.query("SELECT passport_doc_path, visa_doc_path, selfie_path FROM kyc_submissions WHERE id = $1", [id]);
    if (q.rowCount === 0)
      return res.status(404).json({ error: "Submission not found." });

    const row = q.rows[0];
    const filePath = type === "passport" ? row.passport_doc_path
      : type === "visa" ? row.visa_doc_path
      : row.selfie_path;

    if (!filePath || !fs.existsSync(filePath))
      return res.status(404).json({ error: "Document not found." });

    res.sendFile(filePath);
  } catch (err) {
    console.error("[Admin KYC Doc] Error:", err);
    res.status(500).json({ error: "Could not retrieve document." });
  }
});

// POST: Admin approves KYC
app.post("/api/admin/kyc/:id/approve", async (req, res) => {
  const { id } = req.params;
  try {
    const subQ = await pool.query("SELECT tourist_id FROM kyc_submissions WHERE id = $1", [id]);
    if (subQ.rowCount === 0)
      return res.status(404).json({ error: "Submission not found." });

    const touristId = subQ.rows[0].tourist_id;

    await pool.query("UPDATE kyc_submissions SET status = 'Verified' WHERE id = $1", [id]);
    await pool.query("UPDATE tourists SET kyc_status = 'Verified', kyc_rejection_reason = NULL WHERE id = $1", [touristId]);

    console.log(`[Admin KYC] Approved: ${id} → Tourist ${touristId}`);

    const state = await getSystemState();
    broadcast({ type: "state_update", state });

    res.json({ success: true, message: "KYC approved. Tourist account is now active." });
  } catch (err) {
    console.error("[Admin KYC Approve] Error:", err);
    res.status(500).json({ error: "Could not approve submission." });
  }
});

// POST: Admin rejects KYC
app.post("/api/admin/kyc/:id/reject", async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason)
    return res.status(400).json({ error: "Rejection reason is required." });

  try {
    const subQ = await pool.query("SELECT tourist_id FROM kyc_submissions WHERE id = $1", [id]);
    if (subQ.rowCount === 0)
      return res.status(404).json({ error: "Submission not found." });

    const touristId = subQ.rows[0].tourist_id;

    await pool.query("UPDATE kyc_submissions SET status = 'Rejected', rejection_reason = $1 WHERE id = $2", [reason, id]);
    await pool.query("UPDATE tourists SET kyc_status = 'Rejected', kyc_rejection_reason = $1 WHERE id = $2", [reason, touristId]);

    console.log(`[Admin KYC] Rejected: ${id} → Tourist ${touristId} — Reason: ${reason}`);

    const state = await getSystemState();
    broadcast({ type: "state_update", state });

    res.json({ success: true, message: "KYC rejected." });
  } catch (err) {
    console.error("[Admin KYC Reject] Error:", err);
    res.status(500).json({ error: "Could not reject submission." });
  }
});

// POST: Admin flags for manual review
app.post("/api/admin/kyc/:id/manual-review", async (req, res) => {
  const { id } = req.params;
  try {
    const subQ = await pool.query("SELECT tourist_id FROM kyc_submissions WHERE id = $1", [id]);
    if (subQ.rowCount === 0)
      return res.status(404).json({ error: "Submission not found." });

    const touristId = subQ.rows[0].tourist_id;
    await pool.query("UPDATE kyc_submissions SET status = 'Manual Review' WHERE id = $1", [id]);
    await pool.query("UPDATE tourists SET kyc_status = 'Manual Review' WHERE id = $1", [touristId]);

    res.json({ success: true, message: "Submission flagged for manual review." });
  } catch (err) {
    res.status(500).json({ error: "Could not flag submission." });
  }
});

// ============================================================
// --- EXISTING TOURIST/INCIDENT ENDPOINTS (UNCHANGED) ---
// ============================================================

// Update tourist activity status
app.post("/api/tourists/:id/activity", async (req, res) => {
  const touristId = req.params.id;
  const { activityText } = req.body;
  try {
    const q = await pool.query("SELECT checkin_history FROM tourists WHERE id = $1", [touristId]);
    if (q.rowCount === 0) return res.status(404).json({ error: "Tourist not found." });
    const history = q.rows[0].checkin_history || [];
    history.unshift(`${activityText} Status Checkin (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`);
    await pool.query("UPDATE tourists SET activity = $1, checkin_history = $2, last_updated = $3 WHERE id = $4",
      [activityText, history, "Just now", touristId]);
    console.log(`[API] Updated activity for ${touristId}: ${activityText}`);
    const state = await getSystemState();
    broadcast({ type: "state_update", state });
    res.json(state.tourists.find(t => t.id === touristId));
  } catch (err) {
    res.status(500).json({ error: "Database query failure." });
  }
});

// Trigger SOS
app.post("/api/sos", async (req, res) => {
  const { touristId, incidentType, location } = req.body;
  try {
    const q = await pool.query("SELECT * FROM tourists WHERE id = $1", [touristId]);
    if (q.rowCount === 0) return res.status(404).json({ error: "Tourist not found." });
    const tourist = q.rows[0];
    
    const safeName = tourist.full_name || tourist.tourist_name || tourist.name || "Unknown";
    const incId = "INC-" + Math.floor(1000 + Math.random() * 9000);
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const loc = location || (tourist.activity?.includes("Hiking") ? "Wilderness Trail Grid X4" : "Coastal Sector X2");

    await pool.query("BEGIN");
    await pool.query("UPDATE tourists SET status = 'Distress', activity = $1, heart_rate = 135, speed = 0, last_updated = 'Just now' WHERE id = $2",
      [`In Distress (${incidentType})`, touristId]);
      
    // Include tourist_name to fix schema mismatches on older DB versions and omit created_at
    await pool.query("INSERT INTO incidents (id, tourist_id, full_name, tourist_name, type, location, timestamp, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'Active')",
      [incId, touristId, safeName, safeName, incidentType, loc, timestamp]);
    await pool.query("COMMIT");

    console.log(`[API] SOS TRIGGERED: ${safeName} (${touristId}) - ${incidentType}`);
    const state = await getSystemState();
    const newSos = state.incidents.find(i => i.id === incId);
    
    if (newSos) {
      broadcast({ type: "sos_triggered", incident: newSos, state });
      res.status(201).json(newSos);
    } else {
      res.status(500).json({ error: "SOS inserted but not found in state." });
    }
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("[API] SOS DB Error:", err.message || err);
    res.status(500).json({ error: err.message || "Database query failure." });
  }
});

// Cancel SOS
app.post("/api/sos/cancel", async (req, res) => {
  const { touristId } = req.body;
  try {
    const q = await pool.query("SELECT full_name FROM tourists WHERE id = $1", [touristId]);
    if (q.rowCount === 0) return res.status(404).json({ error: "Tourist not found." });
    await pool.query("UPDATE tourists SET status = 'Safe', activity = 'Resting / At Hotel', heart_rate = 72, speed = 0, last_updated = 'Just now' WHERE id = $1", [touristId]);
    await pool.query("UPDATE incidents SET status = 'Resolved' WHERE tourist_id = $1 AND status = 'Active'", [touristId]);
    console.log(`[API] SOS Stand-down for: ${q.rows[0].full_name} (${touristId})`);
    const state = await getSystemState();
    broadcast({ type: "sos_resolved", touristId, state });
    res.json({ status: "Stand-down complete", tourist: state.tourists.find(t => t.id === touristId) });
  } catch (err) {
    res.status(500).json({ error: "Database query failure." });
  }
});

// Dispatch responder
app.post("/api/incidents/:id/dispatch", async (req, res) => {
  const incId = req.params.id;
  try {
    const q = await pool.query("SELECT * FROM incidents WHERE id = $1", [incId]);
    if (q.rowCount === 0) return res.status(404).json({ error: "Incident not found." });
    console.log(`[API] Rescue unit dispatched for: ${incId}`);
    const state = await getSystemState();
    broadcast({ type: "state_update", state });
    res.json(state.incidents.find(i => i.id === incId));
  } catch (err) {
    res.status(500).json({ error: "Database query failure." });
  }
});

// Resolve incident
app.post("/api/incidents/:id/resolve", async (req, res) => {
  const incId = req.params.id;
  try {
    const q = await pool.query("SELECT * FROM incidents WHERE id = $1", [incId]);
    if (q.rowCount === 0) return res.status(404).json({ error: "Incident not found." });
    const incident = q.rows[0];
    await pool.query("UPDATE incidents SET status = 'Resolved' WHERE id = $1", [incId]);
    await pool.query("UPDATE tourists SET status = 'Safe', activity = 'Resting / At Hotel', heart_rate = 72, speed = 0, last_updated = 'Just now' WHERE id = $1 AND status = 'Distress'", [incident.tourist_id]);
    console.log(`[API] Incident resolved: ${incId}`);
    const state = await getSystemState();
    broadcast({ type: "sos_resolved", touristId: incident.tourist_id, state });
    res.json(state.incidents.find(i => i.id === incId));
  } catch (err) {
    res.status(500).json({ error: "Database query failure." });
  }
});

// --- SERVER-SIDE AI SIMULATION TELEMETRY ENGINE ---
function startServerAISimulation() {
  setInterval(async () => {
    try {
      const touristsRes = await pool.query("SELECT * FROM tourists WHERE status != 'Distress' AND kyc_status = 'Verified'");
      const tourists = touristsRes.rows;
      let changesMade = false;
      for (const tourist of tourists) {
        if (Math.random() > 0.4) {
          let { x, y, heart_rate, speed, battery, activity, id } = tourist;
          x = Math.max(20, Math.min(650, x + Math.floor(Math.random() * 20 - 10)));
          y = Math.max(20, Math.min(460, y + Math.floor(Math.random() * 20 - 10)));
          if (activity.includes("Trekking") || activity.includes("Hiking") || activity.includes("Sports")) {
            heart_rate = Math.floor(95 + Math.random() * 30);
            speed = +(1.5 + Math.random() * 4).toFixed(1);
          } else if (activity.includes("Resting")) {
            heart_rate = Math.floor(60 + Math.random() * 12); speed = 0;
          } else {
            heart_rate = Math.floor(70 + Math.random() * 18);
            speed = +(2.0 + Math.random() * 2).toFixed(1);
          }
          if (battery > 0 && Math.random() > 0.6) battery = Math.max(0, battery - 1);
          await pool.query("UPDATE tourists SET x=$1,y=$2,heart_rate=$3,speed=$4,battery=$5,last_updated=$6,last_active_timestamp=CURRENT_TIMESTAMP WHERE id=$7",
            [x, y, heart_rate, speed, battery, "Just now", id]);
          changesMade = true;
        }
      }
      if (changesMade) broadcast({ type: "state_update", state: await getSystemState() });
    } catch (err) {
      console.error("[AI Simulation] Error:", err);
    }
  }, 12000);
}

// Start Server
ensureDatabaseSync().then(() => {
  server.listen(PORT, () => {
    console.log("=".repeat(50));
    console.log("  TSMS FULL-STACK BACKEND STARTED SUCCESSFULLY   ");
    console.log(`  REST API Port: http://localhost:${PORT}        `);
    console.log(`  WebSocket URL: ws://localhost:${PORT}          `);
    console.log("=".repeat(50));
    
    // Start background processes
    startServerAISimulation();
    startAnomalyEngine(10000); // Check every 10s for demo purposes
  });
}).catch(err => {
  console.error("Failed to start server due to DB sync error:", err);
});

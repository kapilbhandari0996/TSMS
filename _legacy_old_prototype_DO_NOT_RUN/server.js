// Tourist Safety & Smart Monitoring System (TSMS) - Node.js Express & WS Backend Server
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const DB_PATH = path.join(__dirname, "db.json");

// --- INITIALIZE APPLICATION & DATABASE ---
const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files directly from the project directory
app.use(express.static(__dirname));

// Read database file helper
function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.error("db.json not found! Re-initializing template...");
      return { tourists: [], incidents: [], aiAlerts: [] };
    }
    const data = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(data);
    // Ensure checkinHistory is always an array (guard against string corruption)
    if (parsed.tourists) {
      parsed.tourists.forEach(t => {
        if (!Array.isArray(t.checkinHistory)) {
          t.checkinHistory = t.checkinHistory ? [t.checkinHistory] : [];
        }
      });
    }
    return parsed;
  } catch (error) {
    console.error("Error reading database file:", error);
    return { tourists: [], incidents: [], aiAlerts: [] };
  }
}

// Write database file helper
function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing to database file:", error);
  }
}

// --- CREATE WEBSOCKET & HTTP SERVER ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Active WebSocket client connections tracking
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total active clients: ${clients.size}`);
  
  // Send connection ack with initial payload
  ws.send(JSON.stringify({ type: "connected", message: "Server WebSockets Linked." }));
  
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total active clients: ${clients.size}`);
  });
});

// Broadcast state changes helper to all browsers
function broadcast(payload) {
  const jsonMessage = JSON.stringify(payload);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonMessage);
    }
  });
}

// --- REST API ENDPOINTS ---

// 1. Fetch entire database state
app.get("/api/state", (req, res) => {
  const db = readDb();
  // Strip sensitive fields before sending to client
  const safeDb = {
    ...db,
    tourists: db.tourists.map(t => { const { passwordHash, ...rest } = t; return rest; }),
    admins: undefined
  };
  res.json(safeDb);
});

// AUTH: Tourist Login
app.post("/api/auth/tourist", (req, res) => {
  const db = readDb();
  const { touristId, password } = req.body;
  if (!touristId || !password) {
    return res.status(400).json({ error: "Tourist ID and password required." });
  }
  const tourist = db.tourists.find(t => t.id === touristId);
  if (!tourist) {
    return res.status(401).json({ error: "Tourist ID not found." });
  }
  if (tourist.passwordHash !== password) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  const { passwordHash, ...safeTourist } = tourist;
  console.log(`[AUTH] Tourist login: ${tourist.fullName} (${touristId})`);
  res.json({ success: true, tourist: safeTourist });
});

// AUTH: Admin Login
app.post("/api/auth/admin", (req, res) => {
  const db = readDb();
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required." });
  }
  const admins = db.admins || [{ username: "admin", passwordHash: "admin@tsms123", fullName: "System Administrator", role: "Super Admin" }];
  const admin = admins.find(a => a.username === username && a.passwordHash === password);
  if (!admin) {
    return res.status(401).json({ error: "Invalid admin credentials." });
  }
  console.log(`[AUTH] Admin login: ${admin.fullName}`);
  res.json({ success: true, admin: { username: admin.username, fullName: admin.fullName, role: admin.role } });
});

// Register a new tourist (KYC-enhanced)
app.post("/api/tourists", (req, res) => {
  const db = readDb();
  const { fullName, email, passwordHash, dateOfBirth, nationality, passportNo, visaNo, visaExpiry, emergencyContactName, emergencyContactPhone, kycStatus } = req.body;
  
  if (!fullName || !passportNo || !passwordHash) {
    return res.status(400).json({ error: "Missing required registration parameters." });
  }

  // Prevent duplicate passport registration
  const existing = db.tourists.find(t => t.passportNo === passportNo);
  if (existing) {
    return res.status(409).json({ error: "A tourist with this passport number is already registered.", existingId: existing.id });
  }

  const generatedId = "TSMS-" + Math.floor(1000 + Math.random() * 9000);
  const newTourist = {
    id: generatedId,
    fullName,
    email: email || "",
    passwordHash,
    dateOfBirth: dateOfBirth || "",
    nationality,
    passportNo,
    visaNo,
    visaExpiry,
    emergencyContactName,
    emergencyContactPhone,
    kycStatus: kycStatus || "Verified",
    status: "Safe",
    activity: "Resting / At Hotel",
    x: Math.floor(200 + Math.random() * 200),
    y: Math.floor(150 + Math.random() * 200),
    checkinHistory: [`KYC Verified & Safety Registration Completed (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`],
    heartRate: 72,
    speed: 0,
    battery: 100,
    lastUpdated: "Just now",
    wearableConnected: false,
    wearableType: "",
    highRiskModeActive: false
  };

  db.tourists.push(newTourist);
  writeDb(db);
  
  console.log(`[API] KYC Registration: ${fullName} (${generatedId}) - KYC: ${kycStatus || 'Verified'}`);
  
  // Notify all tabs (strip password before broadcast)
  const { passwordHash: _ph, ...safeTourist } = newTourist;
  const safeBroadcastDb = { ...db, tourists: db.tourists.map(t => { const { passwordHash: ph, ...r } = t; return r; }) };
  broadcast({ type: "state_update", state: safeBroadcastDb });
  
  res.status(201).json(safeTourist);
});

// 3. Update tourist activity status
app.post("/api/tourists/:id/activity", (req, res) => {
  const db = readDb();
  const touristId = req.params.id;
  const { activityText } = req.body;

  const tourist = db.tourists.find((t) => t.id === touristId);
  if (!tourist) {
    return res.status(404).json({ error: "Tourist not found." });
  }

  tourist.activity = activityText;
  tourist.checkinHistory.unshift(`${activityText} Status Checkin (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
  tourist.lastUpdated = "Just now";

  writeDb(db);
  console.log(`[API] Updated activity for ${touristId}: ${activityText}`);

  broadcast({ type: "state_update", state: db });
  res.json(tourist);
});

// 4. Update smartwatch pairing
app.post("/api/tourists/:id/wearable", (req, res) => {
  const db = readDb();
  const touristId = req.params.id;
  const { connected, deviceType, highRiskToggle } = req.body;

  const tourist = db.tourists.find((t) => t.id === touristId);
  if (!tourist) {
    return res.status(404).json({ error: "Tourist not found." });
  }

  if (connected !== undefined) tourist.wearableConnected = connected;
  if (deviceType !== undefined) tourist.wearableType = deviceType;
  if (highRiskToggle !== undefined) tourist.highRiskModeActive = highRiskToggle;
  
  if (connected === true) {
    if (deviceType) {
      tourist.checkinHistory.unshift(`Biometric device paired: ${deviceType} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
    }
  } else if (connected === false) {
    tourist.checkinHistory.unshift(`Biometric device disconnected (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
  }

  writeDb(db);
  console.log(`[API] Smartwatch update for ${touristId}: Connected=${connected}, Device=${deviceType}, HighRisk=${highRiskToggle}`);

  broadcast({ type: "state_update", state: db });
  res.json(tourist);
});

// 5. Trigger Manual SOS Emergency
app.post("/api/sos", (req, res) => {
  const db = readDb();
  const { touristId, incidentType, location } = req.body;

  const tourist = db.tourists.find((t) => t.id === touristId);
  if (!tourist) {
    return res.status(404).json({ error: "Tourist not found." });
  }

  // Update status on server
  tourist.status = "Distress";
  tourist.activity = `In Distress (${incidentType})`;
  tourist.heartRate = 135;
  tourist.speed = 0;
  tourist.lastUpdated = "Just now";

  const newSos = {
    id: "INC-" + Math.floor(1000 + Math.random() * 9000),
    touristId: tourist.id,
    touristName: tourist.fullName,
    type: incidentType,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    location: location || (tourist.activity.includes("Hiking") ? "Wilderness Trail Grid X4" : "Coastal Sector X2"),
    status: "Active",
    details: `GPS Alarm initiated. Selected danger category: ${incidentType}. Direct coordinate telemetry deployed.`
  };

  db.incidents.unshift(newSos);

  // Add AI Risk Warning Log
  const newAiAlert = {
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    touristId: tourist.id,
    touristName: tourist.fullName,
    level: "Danger",
    message: `Manual SOS Triggered. Danger category: ${incidentType}. User requested priority dispatch.`,
    status: "Active"
  };
  db.aiAlerts.unshift(newAiAlert);

  writeDb(db);
  console.log(`[API] ACTIVE SOS TRIGGERED: ${tourist.fullName} (${touristId}) - ${incidentType}`);

  // Broadcast specific SOS event so browsers sound alarms instantly
  broadcast({ type: "sos_triggered", incident: newSos, state: db });

  res.status(201).json(newSos);
});

// 6. Stand-down cancel SOS
app.post("/api/sos/cancel", (req, res) => {
  const db = readDb();
  const { touristId } = req.body;

  const tourist = db.tourists.find((t) => t.id === touristId);
  if (!tourist) {
    return res.status(404).json({ error: "Tourist not found." });
  }

  // Set tourist back to safe
  tourist.status = "Safe";
  tourist.activity = "Resting / At Hotel";
  tourist.heartRate = 72;
  tourist.speed = 0;
  tourist.lastUpdated = "Just now";

  // Resolve matching incidents
  db.incidents.forEach((inc) => {
    if (inc.touristId === touristId && inc.status === "Active") {
      inc.status = "Resolved";
      inc.details += " - Cancelled by user via Mobile Portal Verification.";
    }
  });

  writeDb(db);
  console.log(`[API] SOS Stand-down for: ${tourist.fullName} (${touristId})`);

  broadcast({ type: "sos_resolved", touristId: touristId, state: db });
  res.json({ status: "Stand-down complete", tourist });
});

// 7. Admin Dispatch paramedic/responder
app.post("/api/incidents/:id/dispatch", (req, res) => {
  const db = readDb();
  const incId = req.params.id;

  const incident = db.incidents.find((i) => i.id === incId);
  if (!incident) {
    return res.status(404).json({ error: "Incident not found." });
  }

  incident.details += " | Dispatch command executed. Rescue team routing.";

  // Create AI warning audit note
  const newAiAlert = {
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    touristId: incident.touristId,
    touristName: incident.touristName,
    level: "Info",
    message: `Emergency response unit dispatched to coordinates for incident ${incId}.`,
    status: "Cleared"
  };
  db.aiAlerts.unshift(newAiAlert);

  writeDb(db);
  console.log(`[API] Paramedics routed for incident: ${incId}`);

  broadcast({ type: "state_update", state: db });
  res.json(incident);
});

// 8. Admin Resolve active incident
app.post("/api/incidents/:id/resolve", (req, res) => {
  const db = readDb();
  const incId = req.params.id;

  const incident = db.incidents.find((i) => i.id === incId);
  if (!incident) {
    return res.status(404).json({ error: "Incident not found." });
  }

  incident.status = "Resolved";
  incident.details += " | Resolved by dispatcher manually.";

  // Reset matching tourist status
  const tourist = db.tourists.find((t) => t.id === incident.touristId);
  if (tourist && tourist.status === "Distress") {
    tourist.status = "Safe";
    tourist.activity = "Resting / At Hotel";
    tourist.heartRate = 72;
    tourist.speed = 0;
    tourist.lastUpdated = "Just now";
  }

  writeDb(db);
  console.log(`[API] Incident manually resolved: ${incId}`);

  broadcast({ type: "sos_resolved", touristId: incident.touristId, state: db });
  res.json(incident);
});


// --- SERVER-SIDE AI SIMULATION TELEMETRY ENGINE ---
function startServerAISimulation() {
  setInterval(() => {
    const db = readDb();
    let changesMade = false;

    db.tourists.forEach((tourist) => {
      // Don't update coordinates or telemetry if they are in distress
      if (tourist.status === "Distress") return;

      // 1. Simulate coordinate drift and telemetry fluctuations
      if (Math.random() > 0.4) {
        const moveX = Math.floor(Math.random() * 20 - 10);
        const moveY = Math.floor(Math.random() * 20 - 10);
        
        tourist.x = Math.max(20, Math.min(650, tourist.x + moveX));
        tourist.y = Math.max(20, Math.min(460, tourist.y + moveY));
        
        if (tourist.activity.includes("Trekking") || tourist.activity.includes("Hiking") || tourist.activity.includes("Sports")) {
          tourist.heartRate = Math.floor(95 + Math.random() * 30);
          tourist.speed = +(1.5 + Math.random() * 4).toFixed(1);
        } else if (tourist.activity.includes("Resting")) {
          tourist.heartRate = Math.floor(60 + Math.random() * 12);
          tourist.speed = 0;
        } else {
          tourist.heartRate = Math.floor(70 + Math.random() * 18);
          tourist.speed = +(2.0 + Math.random() * 2).toFixed(1);
        }

        if (tourist.battery > 0 && Math.random() > 0.6) {
          tourist.battery = Math.max(0, tourist.battery - 1);
        }
        
        tourist.lastUpdated = "Just now";
        changesMade = true;
      }

      // 2. Evaluate AI Risk Telemetry
      
      // A. Low Battery Warning
      if (tourist.battery < 20 && tourist.status === "Safe" && (tourist.activity.includes("Trekking") || tourist.activity.includes("Hiking"))) {
        tourist.status = "Warning";
        
        const alert = {
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          touristId: tourist.id,
          touristName: tourist.fullName,
          level: "Warning",
          message: `Telemetry warning: Battery level critical (${tourist.battery}%) in remote high-elevation area. High drop risk.`,
          status: "Active"
        };
        db.aiAlerts.unshift(alert);
        console.log(`[AI Engine] Raised critical battery flag for ${tourist.fullName}`);
        changesMade = true;
      }

      // B. Pulse & Velocity Crash Anomaly
      if (tourist.heartRate > 125 && tourist.speed > 15 && tourist.status === "Safe") {
        tourist.status = "Warning";
        const alert = {
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          touristId: tourist.id,
          touristName: tourist.fullName,
          level: "Warning",
          message: `AI Trigger: High velocity (${tourist.speed} km/h) combined with elevated distress heart rate (${tourist.heartRate} BPM). Potential vehicular crash or flight response.`,
          status: "Active"
        };
        db.aiAlerts.unshift(alert);
        console.log(`[AI Engine] Raised velocity/heart rate alert for ${tourist.fullName}`);
        changesMade = true;
      }

      // C. Smartwatch High-Risk Fall Detection Automated trigger
      if (tourist.wearableConnected && tourist.highRiskModeActive && tourist.status === "Safe" && Math.random() > 0.85) {
        tourist.status = "Warning";
        
        const alert = {
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          touristId: tourist.id,
          touristName: tourist.fullName,
          level: "Warning",
          message: `Wearable Sensor Trigger: ${tourist.wearableType} registered a high-G fall impact event. Biometrics show sudden pulse spike (${tourist.heartRate} BPM). Automated SOS timer queued (8s).`,
          status: "Active"
        };
        db.aiAlerts.unshift(alert);
        console.log(`[AI Engine] Fall detected on wearable for ${tourist.fullName}. Automated SOS countdown started.`);
        
        // Schedule automated SOS trigger on server in 8 seconds if not mitigated
        setTimeout(() => {
          const freshDb = readDb();
          const freshTourist = freshDb.tourists.find((t) => t.id === tourist.id);
          
          if (freshTourist && freshTourist.status === "Warning") {
            // Trigger automatic SOS
            freshTourist.status = "Distress";
            freshTourist.activity = "In Distress (Automated Fall Detection)";
            freshTourist.heartRate = 135;
            freshTourist.speed = 0;
            freshTourist.lastUpdated = "Just now";

            const newSos = {
              id: "INC-" + Math.floor(1000 + Math.random() * 9000),
              touristId: freshTourist.id,
              touristName: freshTourist.fullName,
              type: "Automated Fall Detection SOS",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              location: "Trail coordinate X3",
              status: "Active",
              details: `Wearable automated alert. User failed to stand down countdown warning within 8s of fall shock detection.`
            };

            freshDb.incidents.unshift(newSos);
            
            // Add risk detail
            const escalationAlert = {
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              touristId: freshTourist.id,
              touristName: freshTourist.fullName,
              level: "Danger",
              message: `Automated distress alarm executed. User failed biometric fall validation warning check. First responders dispatched.`,
              status: "Active"
            };
            freshDb.aiAlerts.unshift(escalationAlert);
            
            writeDb(freshDb);
            console.log(`[AI Engine] Automated SOS triggered for: ${freshTourist.fullName}`);
            broadcast({ type: "sos_triggered", incident: newSos, state: freshDb });
          }
        }, 8000);

        changesMade = true;
      }
    });

    if (changesMade) {
      writeDb(db);
      // Push telemetry update
      broadcast({ type: "state_update", state: db });
    }
  }, 12000);
}

// Start HTTP Server
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  TSMS FULL-STACK BACKEND STARTED SUCCESSFULLY   `);
  console.log(`  REST API Port: http://localhost:${PORT}        `);
  console.log(`  WebSocket URL: ws://localhost:${PORT}          `);
  console.log(`==================================================`);
  
  // Start server telemetry engine
  startServerAISimulation();
});

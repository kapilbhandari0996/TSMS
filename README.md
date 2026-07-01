# Tourist Safety & Smart Monitoring System (TSMS)

Welcome to the **Tourist Safety & Smart Monitoring System (TSMS)**. This application is designed to monitor tourist safety in real-time, handle emergency SOS alerts, and provide an administrative dashboard with real-time mapping.

---

## 🚀 Quick Start

```bash
# From the root directory:
cd backend
npm install
node init_db.js
npm start
```


## 🛠️ Features

- **Secure Authentication & Data Privacy**: Passwords are cryptographically hashed using `bcrypt`, and sensitive API routes are strictly protected by **JSON Web Tokens (JWT)** for both tourists and administrators.
- **AI-Driven Anomaly Detection**: A background AI rules engine constantly monitors check-in activity and triggers, actively flagging panic spam and prolonged periods of inactivity (e.g. failing to update status while hiking).
- **Separate Portals**: Dedicated portals for **Tourists** (Safety Pass & emergency console) and **Administrators** (regional tracking, live dispatch).
- **One-Click SOS**: Instantly broadcast GPS telemetry and emergency categories (medical, accident, security) to the command center with a single click.
- **KYC Self-Registration**: Direct self-registration wizard with document uploads, smart OCR data extraction, and biometric identity selfie checks.
- **PostgreSQL Database**: Real-time persistent storage for tourists, check-in history, AI alerts, and dispatch logs.
- **Multi-lingual & Theme Support**: Dynamic UI translation (English, Spanish, French, Japanese, and Hindi) integrated across all pages including login, plus Light and Dark theme toggles.

---

## 📂 Project Structure

```text
├── frontend/           # Client-side assets and views
│   ├── index.html      # Landing Page
│   ├── login.html      # Login & KYC Registration
│   ├── tourist.html    # Tourist Dashboard
│   ├── admin.html      # Admin Control Panel
│   ├── styles.css      # Styling sheets
│   ├── login.js        # Auth & KYC Controller
│   ├── tourist.js      # Tourist Console Controller
│   ├── admin.js        # Admin Control Panel Controller
│   └── mockData.js     # Translations and static dictionaries
│
├── backend/            # Server-side logic and database
│   ├── server.js       # Express & WS Backend Server
│   ├── aiModule.js     # AI rules engine for anomaly detection
│   ├── authMiddleware.js # JWT validation & authorization rules
│   ├── init_db.js      # PostgreSQL schema setup & bcrypt seeder
│   └── package.json    # Node package configurations
```

---

## 🌐 API Endpoints

- `GET /api/state` - Fetch current system state (tourists, active incidents, AI alerts). *(JWT optional)*
- `POST /api/auth/tourist` - Authenticate a tourist session (by ID or Email).
- `POST /api/auth/admin` - Authenticate an admin session.
- `POST /api/kyc/submit` - Register a new tourist (KYC) with file uploads.
- `GET /api/admin/kyc` - Fetch all KYC submissions. *(Requires Admin JWT)*
- `POST /api/admin/kyc/:id/approve` - Approve a tourist's KYC. *(Requires Admin JWT)*
- `POST /api/admin/kyc/:id/reject` - Reject a tourist's KYC. *(Requires Admin JWT)*
- `POST /api/admin/kyc/:id/manual-review` - Flag KYC for manual review. *(Requires Admin JWT)*
- `POST /api/tourists/:id/activity` - Log a tourist activity status check-in. *(Requires Tourist JWT)*
- `POST /api/sos` - Trigger a one-click SOS incident. *(Requires Tourist JWT)*
- `POST /api/sos/cancel` - Cancel/stand-down an active SOS. *(Requires Tourist JWT)*
- `POST /api/incidents/:id/dispatch` - Route rescue responders. *(Requires Admin JWT)*
- `POST /api/incidents/:id/resolve` - Close an incident. *(Requires Admin JWT)*

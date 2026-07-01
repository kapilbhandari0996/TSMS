# Implementation Plan: Fulfilling Missing Project Requirements

This plan details the implementation strategy to fully resolve the remaining Project Requirements identified in the system audit:
1. Secure Authentication & Data Privacy (JWT + Bcrypt)
2. AI-Driven Anomaly Detection (Dynamic Rules Engine)
3. Full Multilingual Support (Login Portals)

## User Review Required

> [!WARNING]
> This plan introduces **breaking changes** to the authentication flow. 
> Passwords will be securely hashed, meaning any previously registered tourists (if any exist in the local database) might not be able to log in with their old plaintext passwords. We may need to re-run the KYC pipeline or reset the database. 

## Open Questions

> [!IMPORTANT]
> 1. Should I wipe the current `tsms_db` and re-seed it so that all mock users have properly hashed passwords, or should I attempt to migrate the existing users? (Wiping and re-seeding is highly recommended for security).
> 2. For the AI Anomaly Detection, what threshold should trigger a "Long Inactivity" alert? (e.g., 2 hours without a status update?).

## Proposed Changes

### 1. Dependencies
- Run `npm install bcryptjs jsonwebtoken` in the backend to install industry-standard security libraries.

---

### 2. Secure Authentication & Privacy
We will replace the insecure `localStorage` ID check with robust token-based authentication.

#### [NEW] `backend/authMiddleware.js`
- Create a JWT verification middleware.
- Intercept incoming requests to `/api/sos`, `/api/tourists/*`, `/api/admin/*`, and `/api/incidents/*`.
- Verify the Authorization header before allowing access.

#### [MODIFY] `backend/server.js`
- **Registration**: Update the `/api/kyc/submit` endpoint to securely hash passwords using `bcrypt` before storing them in PostgreSQL.
- **Login**: Update `/api/auth/tourist` and `/api/auth/admin` to compare hashed passwords and issue signed JWTs upon success.
- **API Protection**: Apply `authMiddleware` to all sensitive routes.

#### [MODIFY] Frontend Controllers (`login.js`, `admin-login.js`, `tourist.js`, `admin.js`)
- Update login logic to capture the JWT returned from the server.
- Store the JWT securely.
- Inject the JWT into the `Authorization` header for all subsequent `fetch` calls (e.g., triggering SOS, fetching state, updating activity).

---

### 3. AI-Driven Anomaly Detection
We will implement a real backend rules-engine that continuously analyzes the database to spot irregular patterns, eliminating the hardcoded empty array.

#### [MODIFY] `backend/init_db.js`
- Create a new PostgreSQL table: `ai_alerts` to persist dynamically generated AI events.

#### [NEW] `backend/aiModule.js`
- Create a background worker that runs periodically (e.g., every 60 seconds).
- **Rule 1 (Panic Spam)**: Detect if a tourist triggers >2 SOS alerts within 15 minutes.
- **Rule 2 (Inactivity)**: Detect if a tourist's `activity` remains unchanged for over a specified threshold while they are not checked into a hotel.
- Save generated alerts to the `ai_alerts` table.
- Emit WebSocket events (`anomaly_detected`) to update the Admin Dashboard in real-time.

#### [MODIFY] `backend/server.js`
- Integrate `aiModule.js`.
- Update the `/api/state` endpoint to fetch actual AI alerts from the database instead of returning `[]`.

---

### 4. Full Multilingual Support
We will bring the authentication pages up to parity with the main portals.

#### [MODIFY] `frontend/login.html` & `frontend/admin-login.html`
- Inject `<script src="mockData.js"></script>` to access the translation dictionaries.
- Add `data-translate` attributes to all hardcoded text elements (titles, inputs, buttons, placeholders).
- Add the Language Selector dropdown UI to the login screens.
- Add Javascript logic to detect the active language and swap the text dynamically on load.

## Verification Plan

### Automated / Backend Tests
- Restart the Node.js server.
- Verify JWT tokens are rejected if tampered with or missing on restricted API routes using manual cURL/fetch commands.
- Monitor the backend logs to confirm the AI Anomaly daemon is running every minute.

### Manual Verification
- Register a *new* tourist and verify the password is encrypted in the PostgreSQL database.
- Log in as the tourist, wait without updating the status, and manually trigger SOS twice to verify the AI Engine detects "Unusual Behavior" and pushes it to the Admin dashboard.
- Verify the `login.html` page successfully translates to French and Japanese using the dropdown.
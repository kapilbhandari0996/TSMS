# ⚠️ Legacy prototype — do not run

These files (`server.js`, `app.js`, `index.html`, `styles.css`, `mockData.js`,
plus their `node_modules`/`package.json`) are an **older, single-page version**
of this project. They:

- store data in a flat `db.json` file instead of PostgreSQL
- have no OCR, no KYC document upload, no JWT auth
- serve a different, older single-page UI

The **real, current app** is in `backend/` + `frontend/` at the project root
(see the top-level `README.md` for setup steps). If you ever see the old
single-page UI, or your tourist/KYC/OCR data appears to be missing, it's
almost certainly because something ran `node server.js` from the project
root instead of `cd backend && npm start`.

This folder is kept only for reference. Feel free to delete it once you've
confirmed the real app works.

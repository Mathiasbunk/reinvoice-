# REINVOICE

Re-invoice supplier invoices to customers. Integrates with e-conomic (mock data included for development).

## Quick start

```bash
cd reinvoice

# Install all dependencies (backend + frontend)
npm run install:all

# Terminal 1 — backend on http://localhost:3001
npm run dev:backend

# Terminal 2 — frontend on http://localhost:5173
npm run dev:frontend
```

Open http://localhost:5173 in your browser.
Click **"Load mock data"** to populate sample supplier invoices.

## Mock mode

No e-conomic credentials needed. The app detects placeholder tokens and serves built-in mock data (customers, products, departments, service partners, and 7 sample invoices across dimensions 900 / 902 / 1000 / 1010).

## Connecting to e-conomic

Copy `backend/.env.example` to `backend/.env` and fill in your real tokens:

```
ECONOMIC_APP_SECRET_TOKEN=<your token>
ECONOMIC_AGREEMENT_GRANT_TOKEN=<your grant>
```

Then use **Sync invoices** in the UI to pull real supplier invoices.

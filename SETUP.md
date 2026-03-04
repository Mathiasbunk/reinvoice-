# REINVOICE — Setup Guide

## 1. Get your e-conomic API tokens

1. Go to **https://secure.e-conomic.com/settings/developer**
2. Under **"Apps"**, create a new app (or use an existing one) — note the **App Secret Token**
3. Under **"Grants"**, create a new grant for your agreement — note the **Agreement Grant Token**

## 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Open `.env` and fill in:

```
ECONOMIC_APP_SECRET_TOKEN=<your app secret token>
ECONOMIC_AGREEMENT_GRANT_TOKEN=<your agreement grant token>
REINVOICE_DIMENSION_VALUE=to be re-invoiced 1 to 1
PORT=3001
```

> **REINVOICE_DIMENSION_VALUE** must match exactly what you've named the dimension
> choice in e-conomic (case-insensitive). For example: `to be re-invoiced 1 to 1`

## 3. Install dependencies

From the `reinvoice/` root directory:

```bash
npm run install:all
```

Or manually:

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 4. Start the app

Open **two terminals**:

**Terminal 1 – backend:**
```bash
cd backend
npm run dev
# Running on http://localhost:3001
```

**Terminal 2 – frontend:**
```bash
cd frontend
npm run dev
# Running on http://localhost:5173
```

Then open **http://localhost:5173** in your browser.

## 5. How to use

1. Click **"↻ Sync from e-conomic"** — this fetches all booked supplier invoices
   with the "to be re-invoiced 1 to 1" dimension value and adds them to your list.
2. Each row shows: **REINVOICE ID**, supplier, invoice number, date, description, amount.
3. Click **PDF** to open the original supplier invoice PDF.
4. Click **Re-invoice** to open the re-invoicing dialog:
   - Search and select the customer
   - Adjust invoice lines (pre-filled from the supplier invoice)
   - Edit the invoice notes/heading
   - Click **"Create invoice draft in e-conomic"**
5. The task is marked as **Re-invoiced** and the draft number is shown.
   The REINVOICE ID appears in the customer invoice notes.
6. Click **Skip** to dismiss invoices that don't need re-invoicing from the pending list.

## File structure

```
reinvoice/
├── backend/
│   ├── src/
│   │   ├── index.js          Express server entry point
│   │   ├── db.js             SQLite database + REINVOICE ID sequence
│   │   ├── economic.js       e-conomic REST API client
│   │   └── routes/
│   │       ├── invoices.js   Sync + list + PDF proxy
│   │       └── reinvoice.js  Customer lookup + create draft
│   ├── reinvoice.db          Auto-created SQLite database
│   └── .env                  Your API keys (never commit this!)
└── frontend/
    └── src/
        ├── App.jsx            Main app shell + tabs
        └── components/
            ├── InvoiceList.jsx        Task list table
            └── ReInvoiceDialog.jsx    Re-invoice popup
```

## Notes on the e-conomic dimension detection

REINVOICE looks for the re-invoicing dimension in:
- Header-level fields: `department`, `departmentalDistribution`, `costType`, `unit`
- Line-level fields: same as above + `departmentalDistribution.departments[]`

If your setup uses a different field (e.g. a custom "dimension 1/2/3"), open
`backend/src/economic.js` and adjust the `dimensionFields` array in `hasReinvoiceDimension()`.

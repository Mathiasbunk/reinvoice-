import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'reinvoice.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reinvoice_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reinvoice_id TEXT UNIQUE NOT NULL,          -- e.g. RI-2025-0001
      supplier_invoice_number TEXT NOT NULL,       -- e-conomic supplier invoice nr
      supplier_invoice_id INTEGER NOT NULL,        -- e-conomic internal ID
      entry_text TEXT,
      supplier_name TEXT,
      amount REAL,
      currency TEXT,
      invoice_date TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending',      -- pending | invoiced | skipped
      customer_invoice_draft_id INTEGER,           -- e-conomic draft invoice ID, set after re-invoicing
      customer_number INTEGER,
      customer_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reinvoiced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Incremental column migrations (safe to re-run)
  const cols = db.prepare('PRAGMA table_info(reinvoice_tasks)').all().map(c => c.name);
  if (!cols.includes('dimension_value')) {
    db.exec('ALTER TABLE reinvoice_tasks ADD COLUMN dimension_value TEXT');
  }
  if (!cols.includes('is_uploaded')) {
    db.exec('ALTER TABLE reinvoice_tasks ADD COLUMN is_uploaded INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('uploaded_pdf')) {
    db.exec('ALTER TABLE reinvoice_tasks ADD COLUMN uploaded_pdf TEXT');
  }

  // Seed sequence counter if not present
  const row = db.prepare("SELECT value FROM settings WHERE key = 'reinvoice_sequence'").get();
  if (!row) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('reinvoice_sequence', '0')").run();
  }
}

export function nextReinvoiceId() {
  const db = getDb();
  const year = new Date().getFullYear();

  const update = db.transaction(() => {
    db.prepare("UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'reinvoice_sequence'").run();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'reinvoice_sequence'").get();
    return parseInt(row.value, 10);
  });

  const seq = update();
  return `RI-${year}-${String(seq).padStart(4, '0')}`;
}

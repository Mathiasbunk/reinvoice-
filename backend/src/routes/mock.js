import { Router } from 'express';
import { getDb, nextReinvoiceId } from '../db.js';

const router = Router();

const MOCK_CUSTOMERS = [
  { customerNumber: 1001, name: 'Acme Danmark A/S', currency: 'DKK', vatZone: 'Domestic' },
  { customerNumber: 1002, name: 'Nordisk Energi ApS', currency: 'DKK', vatZone: 'Domestic' },
  { customerNumber: 1003, name: 'Baltic Shipping Group', currency: 'EUR', vatZone: 'EU' },
  { customerNumber: 1004, name: 'Vestergaard & Co. A/S', currency: 'DKK', vatZone: 'Domestic' },
  { customerNumber: 1005, name: 'Greentech Solutions ApS', currency: 'DKK', vatZone: 'Domestic' },
  { customerNumber: 1006, name: 'Copenhagen Retail Group', currency: 'DKK', vatZone: 'Domestic' },
  { customerNumber: 1007, name: 'Møller Industri A/S', currency: 'DKK', vatZone: 'Domestic' },
  { customerNumber: 1008, name: 'Scandinavian Logistics Ltd.', currency: 'EUR', vatZone: 'EU' },
];

const MOCK_INVOICES = [
  {
    supplier_invoice_number: 'INV-2025-4481',
    supplier_invoice_id: 4481,
    entry_text: 'Consulting services – February 2025',
    supplier_name: 'Tech Solutions ApS',
    amount: 18750.00,
    currency: 'DKK',
    invoice_date: '2025-02-28',
    due_date: '2025-03-14',
    dimension_value: '900',
  },
  {
    supplier_invoice_number: 'INV-2025-4502',
    supplier_invoice_id: 4502,
    entry_text: 'Software licenses Q1 2025',
    supplier_name: 'SoftHouse Nordic A/S',
    amount: 6250.00,
    currency: 'DKK',
    invoice_date: '2025-03-01',
    due_date: '2025-03-31',
    dimension_value: '902',
  },
  {
    supplier_invoice_number: '2025-0122',
    supplier_invoice_id: 4519,
    entry_text: 'Server hosting – March 2025',
    supplier_name: 'CloudBase Denmark',
    amount: 3400.00,
    currency: 'DKK',
    invoice_date: '2025-03-01',
    due_date: '2025-03-15',
    dimension_value: '1000',
  },
  {
    supplier_invoice_number: 'SI-87234',
    supplier_invoice_id: 4533,
    entry_text: 'Project management – Omega projekt',
    supplier_name: 'Consult Nord IVS',
    amount: 42500.00,
    currency: 'DKK',
    invoice_date: '2025-02-15',
    due_date: '2025-03-07',
    dimension_value: '900',
  },
  {
    supplier_invoice_number: 'INV-0098',
    supplier_invoice_id: 4540,
    entry_text: 'Hardware procurement – Laptops x3',
    supplier_name: 'IT Partner A/S',
    amount: 21900.00,
    currency: 'DKK',
    invoice_date: '2025-02-20',
    due_date: '2025-03-20',
    dimension_value: '1010',
  },
  {
    supplier_invoice_number: 'F-2025-331',
    supplier_invoice_id: 4555,
    entry_text: 'Graphic design – campaign material',
    supplier_name: 'Studio Graf ApS',
    amount: 8800.00,
    currency: 'DKK',
    invoice_date: '2025-03-03',
    due_date: '2025-03-17',
    dimension_value: '902',
  },
];

/**
 * POST /api/mock/seed
 * Inserts mock supplier invoices into the local DB so the UI can be tested
 * without real e-conomic credentials.
 */
router.post('/seed', (req, res) => {
  const db = getDb();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO reinvoice_tasks
      (reinvoice_id, supplier_invoice_number, supplier_invoice_id, entry_text,
       supplier_name, amount, currency, invoice_date, due_date, dimension_value)
    VALUES
      (@reinvoice_id, @supplier_invoice_number, @supplier_invoice_id, @entry_text,
       @supplier_name, @amount, @currency, @invoice_date, @due_date, @dimension_value)
  `);

  const exists = db.prepare(`SELECT id FROM reinvoice_tasks WHERE supplier_invoice_id = ?`);

  let added = 0;
  for (const inv of MOCK_INVOICES) {
    if (exists.get(inv.supplier_invoice_id)) continue;
    insert.run({ ...inv, reinvoice_id: nextReinvoiceId() });
    added++;
  }

  // Also add one already-invoiced task for the "Re-invoiced" tab demo
  const alreadyDone = exists.get(99901);
  if (!alreadyDone) {
    const riId = nextReinvoiceId();
    db.prepare(`
      INSERT OR IGNORE INTO reinvoice_tasks
        (reinvoice_id, supplier_invoice_number, supplier_invoice_id, entry_text,
         supplier_name, amount, currency, invoice_date, due_date,
         status, customer_invoice_draft_id, customer_number, customer_name, reinvoiced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'invoiced', 10042, 1021, 'Acme Danmark A/S', datetime('now', '-3 days'))
    `).run(
      riId, 'INV-2025-4410', 99901,
      'IT support – January 2025', 'Tech Solutions ApS',
      5250.00, 'DKK', '2025-01-31', '2025-02-14'
    );
    added++;
  }

  const tasks = db.prepare(`SELECT * FROM reinvoice_tasks ORDER BY created_at DESC`).all();
  res.json({ added, tasks });
});

/**
 * DELETE /api/mock/reset
 * Clears all tasks and resets the ID sequence (dev convenience).
 */
router.delete('/reset', (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM reinvoice_tasks`).run();
  db.prepare(`UPDATE settings SET value = '0' WHERE key = 'reinvoice_sequence'`).run();
  res.json({ ok: true });
});

export default router;

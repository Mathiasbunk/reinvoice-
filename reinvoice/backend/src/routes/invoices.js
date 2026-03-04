import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import multer from 'multer';
import { getDb, nextReinvoiceId } from '../db.js';
import { getSupplierInvoicesToReinvoice, getSupplierInvoicePdf } from '../economic.js';

function isMockMode() {
  return !process.env.ECONOMIC_APP_SECRET_TOKEN ||
    process.env.ECONOMIC_APP_SECRET_TOKEN === 'your_app_secret_token_here';
}

const MOCK_PDF_HTML = `<!DOCTYPE html>
<html>
<body style="margin:0;background:#525659;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#fff;text-align:center">
  <div>
    <div style="font-size:56px;margin-bottom:12px">📄</div>
    <div style="font-size:15px;font-weight:600;margin-bottom:6px">No PDF in mock mode</div>
    <div style="font-size:12px;opacity:.65">Connect real e-conomic credentials<br>to view supplier invoice PDFs</div>
  </div>
</body>
</html>`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => cb(null, `upload-${Date.now()}.pdf`),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    if (req.query.sync === 'true') await syncFromEconomic(db);
    const tasks = db.prepare('SELECT * FROM reinvoice_tasks ORDER BY created_at DESC').all();
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const db = getDb();
    const { added } = await syncFromEconomic(db);
    const tasks = db.prepare('SELECT * FROM reinvoice_tasks ORDER BY created_at DESC').all();
    res.json({ added, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/invoices/upload — upload an external supplier invoice PDF */
router.post('/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

  const { supplierName, entryText, amount, currency } = req.body;
  const db = getDb();
  const reinvoiceId = nextReinvoiceId();
  const uploadNum = `UPLOAD-${Date.now()}`;

  db.prepare(`
    INSERT INTO reinvoice_tasks
      (reinvoice_id, supplier_invoice_number, supplier_invoice_id,
       entry_text, supplier_name, amount, currency, invoice_date, is_uploaded, uploaded_pdf)
    VALUES
      (@reinvoice_id, @supplier_invoice_number, @supplier_invoice_id,
       @entry_text, @supplier_name, @amount, @currency, @invoice_date, 1, @uploaded_pdf)
  `).run({
    reinvoice_id: reinvoiceId,
    supplier_invoice_number: uploadNum,
    supplier_invoice_id: 0,
    entry_text: entryText || '',
    supplier_name: supplierName || 'External Invoice',
    amount: parseFloat(amount) || 0,
    currency: currency || 'DKK',
    invoice_date: new Date().toISOString().slice(0, 10),
    uploaded_pdf: req.file.filename,
  });

  const tasks = db.prepare('SELECT * FROM reinvoice_tasks ORDER BY created_at DESC').all();
  res.json({ ok: true, reinvoiceId, tasks });
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM reinvoice_tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (task.is_uploaded && task.uploaded_pdf) {
      const pdfPath = path.join(UPLOADS_DIR, task.uploaded_pdf);
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `inline; filename="invoice-${task.reinvoice_id}.pdf"`);
      return res.sendFile(pdfPath);
    }

    if (isMockMode()) {
      return res.set('Content-Type', 'text/html').send(MOCK_PDF_HTML);
    }

    const pdfBuffer = await getSupplierInvoicePdf(task.supplier_invoice_id);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="supplier-invoice-${task.supplier_invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/skip', (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM reinvoice_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  db.prepare("UPDATE reinvoice_tasks SET status='skipped' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ─── Internal sync helper ─────────────────────────────────────────────────────

async function syncFromEconomic(db) {
  const invoices = await getSupplierInvoicesToReinvoice();
  let added = 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO reinvoice_tasks
      (reinvoice_id, supplier_invoice_number, supplier_invoice_id, entry_text,
       supplier_name, amount, currency, invoice_date, due_date, dimension_value)
    VALUES
      (@reinvoice_id, @supplier_invoice_number, @supplier_invoice_id, @entry_text,
       @supplier_name, @amount, @currency, @invoice_date, @due_date, @dimension_value)
  `);

  const exists = db.prepare('SELECT id FROM reinvoice_tasks WHERE supplier_invoice_id = ?');

  for (const inv of invoices) {
    if (exists.get(inv.supplierInvoiceId)) continue;
    const reinvoiceId = nextReinvoiceId();
    insert.run({
      reinvoice_id: reinvoiceId,
      supplier_invoice_number: inv.supplierInvoiceNumber,
      supplier_invoice_id: inv.supplierInvoiceId,
      entry_text: inv.entryText,
      supplier_name: inv.supplierName,
      amount: inv.grossAmount,
      currency: inv.currency,
      invoice_date: inv.invoiceDate,
      due_date: inv.dueDate,
      dimension_value: inv.dimensionValue ?? null,
    });
    added++;
  }

  return { added };
}

export default router;

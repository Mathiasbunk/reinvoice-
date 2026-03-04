import { Router } from 'express';
import { getDb } from '../db.js';
import {
  getCustomers,
  createInvoiceDraft,
  getProducts,
  getDepartments,
  getCustomerProductPrice,
} from '../economic.js';

// ─── Mock data ────────────────────────────────────────────────────────────────

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

const MOCK_PRODUCTS = [
  { productNumber: '900',  name: 'Consulting Services',   salesPrice: 1250.00, unit: { unitNumber: 1, name: 'Hour' } },
  { productNumber: '902',  name: 'Software Licenses',     salesPrice: 500.00,  unit: { unitNumber: 2, name: 'Pcs' } },
  { productNumber: '1000', name: 'Server Hosting',        salesPrice: 3400.00, unit: { unitNumber: 3, name: 'Month' } },
  { productNumber: '1010', name: 'Hardware Procurement',  salesPrice: 2500.00, unit: { unitNumber: 2, name: 'Pcs' } },
  { productNumber: '1020', name: 'IT Support',            salesPrice: 650.00,  unit: { unitNumber: 1, name: 'Hour' } },
  { productNumber: '1030', name: 'Project Management',    salesPrice: 1500.00, unit: { unitNumber: 4, name: 'Day' } },
  { productNumber: '1040', name: 'Graphic Design',        salesPrice: 900.00,  unit: { unitNumber: 1, name: 'Hour' } },
  { productNumber: '1050', name: 'Cloud Storage (TB)',    salesPrice: 200.00,  unit: { unitNumber: 3, name: 'Month' } },
];

const MOCK_DEPARTMENTS = [
  { departmentNumber: 1, name: 'Finance' },
  { departmentNumber: 2, name: 'IT & Infrastructure' },
  { departmentNumber: 3, name: 'Operations' },
  { departmentNumber: 4, name: 'HR & Admin' },
  { departmentNumber: 5, name: 'Sales & Marketing' },
  { departmentNumber: 6, name: 'Management' },
];

const MOCK_SERVICE_PARTNERS = [
  { departmentNumber: 10, name: 'Tech Solutions ApS' },
  { departmentNumber: 11, name: 'CloudBase Denmark' },
  { departmentNumber: 12, name: 'Nordic IT Services' },
  { departmentNumber: 13, name: 'IT Partner A/S' },
  { departmentNumber: 14, name: 'SoftHouse Nordic A/S' },
];

const MOCK_CUSTOMER_PRICES = {
  1001: { '900': 1100.00, '1010': 2200.00, '1020': 600.00 },
  1002: { '902': 450.00, '1000': 3100.00 },
  1005: { '1030': 1350.00 },
};

function isMockMode() {
  return !process.env.ECONOMIC_APP_SECRET_TOKEN ||
    process.env.ECONOMIC_APP_SECRET_TOKEN === 'your_app_secret_token_here';
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

router.get('/customers', async (req, res) => {
  if (isMockMode()) return res.json(MOCK_CUSTOMERS);
  try { res.json(await getCustomers()); }
  catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/products', async (req, res) => {
  const q = (req.query.q ?? '').toLowerCase();
  if (isMockMode()) {
    const filtered = q
      ? MOCK_PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || p.productNumber.includes(q))
      : MOCK_PRODUCTS;
    return res.json(filtered);
  }
  try { res.json(await getProducts(req.query.q ?? '')); }
  catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/departments', async (req, res) => {
  if (isMockMode()) return res.json(MOCK_DEPARTMENTS);
  try { res.json(await getDepartments()); }
  catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/servicepartners', async (req, res) => {
  if (isMockMode()) return res.json(MOCK_SERVICE_PARTNERS);
  try { res.json(await getDepartments()); }
  catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/customer-price', async (req, res) => {
  const { customerNumber, productNumber } = req.query;
  if (!customerNumber || !productNumber)
    return res.status(400).json({ error: 'customerNumber and productNumber required' });
  if (isMockMode()) {
    const price = MOCK_CUSTOMER_PRICES[Number(customerNumber)]?.[String(productNumber)] ?? null;
    return res.json({ price });
  }
  try {
    const price = await getCustomerProductPrice(Number(customerNumber), productNumber);
    res.json({ price });
  } catch (err) {
    console.error(err); res.json({ price: null });
  }
});

router.post('/:taskId', async (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM reinvoice_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status === 'invoiced') return res.status(409).json({ error: 'Already re-invoiced' });

  const { customerNumber, lines, currency, date, notes } = req.body;
  if (!customerNumber) return res.status(400).json({ error: 'customerNumber is required' });
  if (!lines || lines.length === 0) return res.status(400).json({ error: 'At least one line is required' });

  try {
    const allCustomers = isMockMode() ? MOCK_CUSTOMERS : await getCustomers();
    const customer = allCustomers.find(c => c.customerNumber === Number(customerNumber));

    if (isMockMode()) {
      const mockDraftNumber = Math.floor(10000 + Math.random() * 90000);
      db.prepare(`
        UPDATE reinvoice_tasks SET status='invoiced', customer_invoice_draft_id=?,
          customer_number=?, customer_name=?, reinvoiced_at=datetime('now') WHERE id=?
      `).run(mockDraftNumber, customerNumber, customer?.name ?? '', task.id);
      return res.json({ ok: true, draftInvoiceNumber: mockDraftNumber, reinvoiceId: task.reinvoice_id });
    }

    const draft = await createInvoiceDraft({
      customerNumber: Number(customerNumber),
      lines,
      currency: currency ?? task.currency,
      date,
      reinvoiceId: task.reinvoice_id,
      supplierInvoiceNumber: task.supplier_invoice_number,
      notes,
    });

    db.prepare(`
      UPDATE reinvoice_tasks SET status='invoiced', customer_invoice_draft_id=?,
        customer_number=?, customer_name=?, reinvoiced_at=datetime('now') WHERE id=?
    `).run(draft.draftInvoiceNumber, customerNumber, customer?.name ?? '', task.id);

    res.json({ ok: true, draftInvoiceNumber: draft.draftInvoiceNumber, reinvoiceId: task.reinvoice_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

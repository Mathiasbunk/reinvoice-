import fetch from 'node-fetch';

const BASE_URL = 'https://restapi.e-conomic.com';

function headers() {
  return {
    'X-AppSecretToken': process.env.ECONOMIC_APP_SECRET_TOKEN,
    'X-AgreementGrantToken': process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

async function get(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`e-conomic API error ${res.status} on GET ${path}: ${body}`);
  }
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`e-conomic API error ${res.status} on POST ${path}: ${text}`);
  }
  return res.json();
}

// ─── Paginate through all pages of a collection ──────────────────────────────
async function paginate(path, params = {}) {
  const results = [];
  let pageIndex = 0;
  const pageSize = 100;

  while (true) {
    const data = await get(path, { ...params, skippages: pageIndex, pagesize: pageSize });
    const collection = data.collection ?? [];
    results.push(...collection);
    if (!data.pagination?.nextPage) break;
    pageIndex++;
  }

  return results;
}

// ─── Supplier invoices ────────────────────────────────────────────────────────

/**
 * Fetch all booked supplier invoices and filter by the re-invoicing dimension.
 * Supports comma-separated REINVOICE_DIMENSION_VALUE, e.g. "900,902,1000,1010".
 * Returns matched invoices with the dimension value that triggered the match.
 */
export async function getSupplierInvoicesToReinvoice() {
  const targetValues = (process.env.REINVOICE_DIMENSION_VALUE || 'to be re-invoiced 1 to 1')
    .split(',').map(v => v.trim().toLowerCase());

  const invoices = await paginate('/supplier-invoices/booked');

  const toReinvoice = [];
  for (const inv of invoices) {
    try {
      const detail = await get(`/supplier-invoices/booked/${inv.bookedInvoiceNumber}`);
      const matched = findReinvoiceDimension(detail, targetValues);
      if (matched !== null) {
        toReinvoice.push(normalizeInvoice(detail, matched));
      }
    } catch (e) {
      console.error(`Skipping supplier invoice ${inv.bookedInvoiceNumber}:`, e.message);
    }
  }

  return toReinvoice;
}

/**
 * Returns the first matched dimension value string, or null if none.
 */
function findReinvoiceDimension(invoice, targetValues) {
  const dimensionFields = ['departmentalDistribution', 'department', 'costType', 'unit'];

  for (const targetValue of targetValues) {
    // Check header-level dimensions
    for (const field of dimensionFields) {
      const val = invoice[field]?.name?.toLowerCase() ?? '';
      if (val.includes(targetValue)) return targetValue;
    }

    // Check line-level dimensions
    for (const line of invoice.lines ?? []) {
      for (const field of dimensionFields) {
        const val = line[field]?.name?.toLowerCase() ?? '';
        if (val.includes(targetValue)) return targetValue;
      }
      const depts = line.departmentalDistribution?.departments ?? [];
      for (const dept of depts) {
        if (dept.department?.name?.toLowerCase().includes(targetValue)) return targetValue;
      }
    }
  }

  return null;
}

function normalizeInvoice(inv, dimensionValue = null) {
  return {
    supplierInvoiceId: inv.bookedInvoiceNumber,
    supplierInvoiceNumber: inv.supplierInvoiceNumber ?? String(inv.bookedInvoiceNumber),
    entryText: inv.lines?.[0]?.description ?? inv.notes?.heading ?? '',
    supplierName: inv.supplier?.name ?? '',
    supplierNumber: inv.supplier?.supplierNumber,
    amount: inv.netAmount ?? 0,
    grossAmount: inv.grossAmount ?? 0,
    currency: inv.currency ?? 'DKK',
    invoiceDate: inv.date ?? null,
    dueDate: inv.dueDate ?? null,
    hasPdf: true,
    dimensionValue,
  };
}

// ─── PDF download ─────────────────────────────────────────────────────────────

export async function getSupplierInvoicePdf(bookedInvoiceNumber) {
  const url = `${BASE_URL}/supplier-invoices/booked/${bookedInvoiceNumber}/pdf`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
  return res.buffer();
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function getCustomers() {
  const customers = await paginate('/customers');
  return customers.map(c => ({
    customerNumber: c.customerNumber,
    name: c.name,
    currency: c.currency ?? 'DKK',
    vatZone: c.vatZone?.name ?? '',
    paymentTerms: c.paymentTerms,
  }));
}

// ─── Departments ──────────────────────────────────────────────────────────────

export async function getDepartments() {
  const depts = await paginate('/departments');
  return depts.map(d => ({
    departmentNumber: d.departmentNumber,
    name: d.name,
  }));
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getProducts(query = '') {
  const params = { pagesize: 200 };
  if (query) params.filter = `name$like$${query}`;
  const data = await get('/products', params);
  return (data.collection ?? [])
    .filter(p => !p.barred)
    .map(p => ({
      productNumber: p.productNumber,
      name: p.name,
      salesPrice: p.salesPrice ?? 0,
      unit: p.unit ? { unitNumber: p.unit.unitNumber, name: p.unit.name } : null,
    }));
}

// ─── Customer special price for a specific product ────────────────────────────

/**
 * Fetch the customer-specific price for a product, if one exists.
 * Falls back to null (caller should use the product's default salesPrice).
 */
export async function getCustomerProductPrice(customerNumber, productNumber) {
  try {
    const data = await get(`/customers/${customerNumber}/special-prices/products`);
    const entry = (data.collection ?? []).find(
      sp => String(sp.product?.productNumber) === String(productNumber)
    );
    return entry?.price ?? null;
  } catch {
    return null;
  }
}

// ─── Create customer invoice draft ───────────────────────────────────────────

export async function createInvoiceDraft({
  customerNumber,
  lines,
  currency,
  date,
  reinvoiceId,
  supplierInvoiceNumber,
  notes,
}) {
  const body = {
    date: date ?? new Date().toISOString().slice(0, 10),
    currency: currency ?? 'DKK',
    paymentTerms: { paymentTermsNumber: 14 },
    customer: { customerNumber },
    notes: {
      heading: notes?.heading ?? `Re-invoice ${reinvoiceId}`,
      textLine1: notes?.textLine1 ?? `Ref: Supplier invoice ${supplierInvoiceNumber}`,
      textLine2: notes?.textLine2 ?? `REINVOICE ID: ${reinvoiceId}`,
    },
    lines: lines.map((l, i) => ({
      lineNumber: i + 1,
      sortKey: i + 1,
      description: l.description,
      quantity: l.quantity ?? 1,
      unitNetPrice: l.unitPrice,
      unit: l.unit ?? { unitNumber: 1 },
      ...(l.productNumber ? { product: { productNumber: l.productNumber } } : {}),
      ...(l.departmentNumber ? { department: { departmentNumber: l.departmentNumber } } : {}),
    })),
  };

  return post('/invoices/drafts', body);
}

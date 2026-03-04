import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './ReInvoiceDialog.module.css';

function fmt(amount, currency) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: currency ?? 'DKK' }).format(amount);
}

function fmtNum(n) {
  if (n == null) return '';
  return new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ─── ProductPicker ─────────────────────────────────────────────────────────────
function ProductPicker({ value, onChange, products, loadingProducts }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = products.filter(p =>
    !query ||
    p.productNumber.toLowerCase().includes(query.toLowerCase()) ||
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  const displayValue = value
    ? `${value.productNumber} – ${value.name}`
    : '';

  return (
    <div className={styles.productPicker} ref={ref}>
      <input
        className={styles.lineInput}
        type="text"
        placeholder={loadingProducts ? 'Loading…' : 'Search product # or name…'}
        value={open ? query : displayValue}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <ul className={styles.productDropdown}>
          {filtered.slice(0, 20).map(p => (
            <li
              key={p.productNumber}
              className={styles.productOption}
              onMouseDown={() => { onChange(p); setOpen(false); setQuery(''); }}
            >
              <span className={styles.productNum}>{p.productNumber}</span>
              <span className={styles.productName}>{p.name}</span>
              <span className={styles.productPrice}>{fmtNum(p.salesPrice)}</span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className={styles.productEmpty}>No products found</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ─── CustomerPicker ────────────────────────────────────────────────────────────
function CustomerPicker({ value, onChange, customers, loading }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = customers.filter(c =>
    !query ||
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    String(c.customerNumber).includes(query)
  );

  const displayValue = value ? `${value.name} (#${value.customerNumber})` : '';

  return (
    <div className={styles.customerPickerInline} ref={ref}>
      <input
        className={styles.input}
        type="text"
        placeholder={loading ? 'Loading customers…' : 'Search customer name or number…'}
        value={open ? query : displayValue}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => setQuery(e.target.value)}
        autoFocus={!value}
      />
      {open && (
        <ul className={styles.customerDropdown}>
          {filtered.slice(0, 30).map(c => (
            <li
              key={c.customerNumber}
              className={styles.customerOption}
              onMouseDown={() => { onChange(c); setOpen(false); setQuery(''); }}
            >
              <span className={styles.custName}>{c.name}</span>
              <span className={styles.custNum}>#{c.customerNumber}</span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className={styles.customerEmpty}>No customers found</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Main dialog ───────────────────────────────────────────────────────────────
export default function ReInvoiceDialog({ task, onClose, onDone }) {
  // Reference data
  const [customers,       setCustomers]       = useState([]);
  const [products,        setProducts]        = useState([]);
  const [departments,     setDepartments]     = useState([]);
  const [servicePartners, setServicePartners] = useState([]);
  const [loadingRef,      setLoadingRef]      = useState(true);

  // Form state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState([{
    product: null,
    description: task.entry_text || `Re-invoice: ${task.supplier_invoice_number}`,
    quantity: 1,
    unitPrice: task.amount ?? 0,
    departmentNumber: '',
    servicepartnerNumber: '',
  }]);
  const [notes, setNotes] = useState({
    heading: `Re-invoice ${task.reinvoice_id}`,
    textLine1: `Ref: Supplier invoice ${task.supplier_invoice_number}`,
    textLine2: `REINVOICE ID: ${task.reinvoice_id}`,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load reference data in parallel
  useEffect(() => {
    Promise.all([
      fetch('/api/reinvoice/customers').then(r => r.json()),
      fetch('/api/reinvoice/products').then(r => r.json()),
      fetch('/api/reinvoice/departments').then(r => r.json()),
      fetch('/api/reinvoice/servicepartners').then(r => r.json()),
    ]).then(([custs, prods, depts, sps]) => {
      setCustomers(Array.isArray(custs) ? custs : []);
      setProducts(Array.isArray(prods) ? prods : []);
      setDepartments(Array.isArray(depts) ? depts : []);
      setServicePartners(Array.isArray(sps) ? sps : []);
    }).catch(console.error).finally(() => setLoadingRef(false));
  }, []);

  // When customer changes, re-fetch special prices for all lines that have a product
  const refreshPricesForCustomer = useCallback(async (customer, currentLines) => {
    if (!customer) return;
    const updated = await Promise.all(currentLines.map(async (line) => {
      if (!line.product) return line;
      try {
        const r = await fetch(
          `/api/reinvoice/customer-price?customerNumber=${customer.customerNumber}&productNumber=${line.product.productNumber}`
        );
        const { price } = await r.json();
        return { ...line, unitPrice: price ?? line.product.salesPrice };
      } catch { return line; }
    }));
    setLines(updated);
  }, []);

  const handleCustomerChange = (customer) => {
    setSelectedCustomer(customer);
    refreshPricesForCustomer(customer, lines);
  };

  // When product is selected on a line, auto-fill description + price (then check customer special price)
  const handleProductSelect = async (lineIdx, product) => {
    const basePrice = product.salesPrice;
    let unitPrice = basePrice;

    if (selectedCustomer) {
      try {
        const r = await fetch(
          `/api/reinvoice/customer-price?customerNumber=${selectedCustomer.customerNumber}&productNumber=${product.productNumber}`
        );
        const { price } = await r.json();
        if (price != null) unitPrice = price;
      } catch {}
    }

    setLines(prev => prev.map((l, i) => i === lineIdx
      ? { ...l, product, description: product.name, unitPrice }
      : l
    ));
  };

  const updateLine = (i, field, value) => {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const addLine = () => {
    setLines(prev => [...prev, {
      product: null,
      description: '',
      quantity: 1,
      unitPrice: 0,
      departmentNumber: '',
      servicepartnerNumber: '',
    }]);
  };

  const removeLine = (i) => {
    setLines(prev => prev.filter((_, idx) => idx !== i));
  };

  const totalAmount = lines.reduce(
    (sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0
  );

  const handleSubmit = async () => {
    if (!selectedCustomer) { setError('Please select a customer.'); return; }
    if (lines.some(l => !l.description.trim())) { setError('All lines need a description.'); return; }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reinvoice/${task.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber: selectedCustomer.customerNumber,
          lines: lines.map(l => ({
            productNumber: l.product?.productNumber,
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
            departmentNumber: l.departmentNumber || undefined,
            servicepartnerNumber: l.servicepartnerNumber || undefined,
          })),
          date,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unknown error');
      alert(`Done! Invoice draft #${data.draftInvoiceNumber} created.\nREINVOICE ID: ${data.reinvoiceId}`);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className={styles.dialogHeader}>
          <div className={styles.headerMeta}>
            <span className={styles.dialogTitle}>Create Re-invoice</span>
            <div className={styles.dialogSubtitle}>
              <span className={styles.riId}>{task.reinvoice_id}</span>
              &nbsp;·&nbsp;{task.supplier_name}
              &nbsp;·&nbsp;Invoice #{task.supplier_invoice_number}
              &nbsp;·&nbsp;<strong>{fmt(task.amount, task.currency)}</strong>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Body: split PDF | form ───────────────────────────────── */}
        <div className={styles.dialogBody}>

          {/* Left: PDF pane */}
          <div className={styles.pdfPane}>
            <div className={styles.pdfHeader}>Supplier Invoice</div>
            <iframe
              className={styles.pdfFrame}
              src={`/api/invoices/${task.id}/pdf`}
              title="Supplier invoice PDF"
            />
          </div>

          {/* Right: form pane */}
          <div className={styles.formPane}>
            {error && <div className={styles.errorMsg}>{error}</div>}

            {/* Customer */}
            <section className={styles.section}>
              <label className={styles.sectionLabel}>Customer *</label>
              <CustomerPicker
                value={selectedCustomer}
                onChange={handleCustomerChange}
                customers={customers}
                loading={loadingRef}
              />
            </section>

            {/* Date */}
            <section className={styles.section}>
              <label className={styles.sectionLabel}>Invoice date *</label>
              <input
                className={`${styles.input} ${styles.inputNarrow}`}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </section>

            {/* Invoice lines */}
            <section className={styles.section}>
              <label className={styles.sectionLabel}>Invoice lines *</label>

              <div className={styles.linesContainer}>
                {lines.map((line, i) => (
                  <div key={i} className={styles.lineCard}>
                    {/* Row 1: product, qty, price, total, delete */}
                    <div className={styles.lineRow1}>
                      <div className={styles.lineProductCol}>
                        <div className={styles.lineFieldLabel}>Product</div>
                        <ProductPicker
                          value={line.product}
                          onChange={p => handleProductSelect(i, p)}
                          products={products}
                          loadingProducts={loadingRef}
                        />
                      </div>
                      <div className={styles.lineSmallCol}>
                        <div className={styles.lineFieldLabel}>Qty</div>
                        <input
                          className={`${styles.lineInput} ${styles.lineInputNum}`}
                          type="number"
                          min="0"
                          step="any"
                          value={line.quantity}
                          onChange={e => updateLine(i, 'quantity', e.target.value)}
                        />
                      </div>
                      <div className={styles.lineSmallCol}>
                        <div className={styles.lineFieldLabel}>Unit price</div>
                        <input
                          className={`${styles.lineInput} ${styles.lineInputNum}`}
                          type="number"
                          step="any"
                          value={line.unitPrice}
                          onChange={e => updateLine(i, 'unitPrice', e.target.value)}
                        />
                      </div>
                      <div className={styles.lineTotalCol}>
                        <div className={styles.lineFieldLabel}>Total</div>
                        <div className={styles.lineTotal}>
                          {fmt(
                            (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0),
                            task.currency
                          )}
                        </div>
                      </div>
                      <div className={styles.lineDeleteCol}>
                        {lines.length > 1 && (
                          <button className={styles.removeLineBtn} onClick={() => removeLine(i)} title="Remove line">✕</button>
                        )}
                      </div>
                    </div>

                    {/* Row 2: description (editable) */}
                    <div className={styles.lineRow2}>
                      <div className={styles.lineDescCol}>
                        <div className={styles.lineFieldLabel}>Description</div>
                        <input
                          className={styles.lineInput}
                          type="text"
                          placeholder="Line description…"
                          value={line.description}
                          onChange={e => updateLine(i, 'description', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Row 3: dimensions */}
                    <div className={styles.lineRow3}>
                      <div className={styles.lineDimCol}>
                        <div className={styles.lineFieldLabel}>Department</div>
                        <select
                          className={styles.lineSelect}
                          value={line.departmentNumber}
                          onChange={e => updateLine(i, 'departmentNumber', e.target.value)}
                        >
                          <option value="">— none —</option>
                          {departments.map(d => (
                            <option key={d.departmentNumber} value={d.departmentNumber}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.lineDimCol}>
                        <div className={styles.lineFieldLabel}>Servicepartner</div>
                        <select
                          className={styles.lineSelect}
                          value={line.servicepartnerNumber}
                          onChange={e => updateLine(i, 'servicepartnerNumber', e.target.value)}
                        >
                          <option value="">— none —</option>
                          {servicePartners.map(sp => (
                            <option key={sp.departmentNumber} value={sp.departmentNumber}>{sp.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button className={styles.addLineBtn} onClick={addLine}>+ Add line</button>
              <div className={styles.totalRow}>
                Total: <strong>{fmt(totalAmount, task.currency)}</strong>
              </div>
            </section>

            {/* Notes */}
            <section className={styles.section}>
              <label className={styles.sectionLabel}>Invoice notes (sent to customer)</label>
              <div className={styles.notesGrid}>
                <label className={styles.noteLabel}>Heading</label>
                <input className={styles.input} value={notes.heading}
                  onChange={e => setNotes(n => ({ ...n, heading: e.target.value }))} />
                <label className={styles.noteLabel}>Text line 1</label>
                <input className={styles.input} value={notes.textLine1}
                  onChange={e => setNotes(n => ({ ...n, textLine1: e.target.value }))} />
                <label className={styles.noteLabel}>Text line 2</label>
                <input className={styles.input} value={notes.textLine2}
                  onChange={e => setNotes(n => ({ ...n, textLine2: e.target.value }))} />
              </div>
            </section>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className={styles.dialogFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <a
            href={`/api/invoices/${task.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className={styles.pdfBtn}
          >
            Open PDF ↗
          </a>
          <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating draft…' : 'Create invoice draft in e-conomic'}
          </button>
        </div>
      </div>
    </div>
  );
}

import styles from './InvoiceList.module.css';

const STATUS_LABEL = {
  pending:  { label: 'Pending',     cls: 'pending' },
  invoiced: { label: 'Re-invoiced', cls: 'invoiced' },
  skipped:  { label: 'Skipped',     cls: 'skipped' },
};

function fmt(amount, currency) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: currency ?? 'DKK' }).format(amount);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('da-DK');
}

export default function InvoiceList({ tasks, onReinvoice, onSkip }) {
  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📭</div>
        <p>No invoices in this view.</p>
        <p className={styles.emptyHint}>Use "Sync from e-conomic" to pull the latest invoices.</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>REINVOICE ID</th>
            <th>Supplier</th>
            <th>Invoice #</th>
            <th>Date</th>
            <th>Description</th>
            <th className={styles.right}>Amount</th>
            <th>Status</th>
            <th>Customer Invoice</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => {
            const st = STATUS_LABEL[task.status] ?? { label: task.status, cls: 'pending' };
            return (
              <tr key={task.id} className={styles[`row_${task.status}`]}>
                <td className={styles.reinvoiceId}>
                  {task.reinvoice_id}
                  {task.dimension_value && (
                    <span className={styles.dimBadge}>{task.dimension_value}</span>
                  )}
                </td>
                <td>{task.supplier_name || '—'}</td>
                <td className={styles.nowrap}>
                  {task.is_uploaded ? (
                    <span className={styles.uploadedTag}>↑ Uploaded</span>
                  ) : task.supplier_invoice_number}
                </td>
                <td className={styles.nowrap}>{fmtDate(task.invoice_date)}</td>
                <td className={styles.entryText}>{task.entry_text || '—'}</td>
                <td className={styles.right}>{fmt(task.amount, task.currency)}</td>
                <td>
                  <span className={`${styles.badge} ${styles[`badge_${st.cls}`]}`}>
                    {st.label}
                  </span>
                </td>
                <td className={styles.customerInvoiceCell}>
                  {task.status === 'invoiced' ? (
                    <>
                      <div className={styles.customerName}>{task.customer_name || '—'}</div>
                      {task.customer_invoice_draft_id && (
                        <div className={styles.draftId}>Draft #{task.customer_invoice_draft_id}</div>
                      )}
                    </>
                  ) : '—'}
                </td>
                <td>
                  <div className={styles.actions}>
                    <a
                      href={`/api/invoices/${task.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.btnSecondary}
                      title="Open supplier invoice PDF"
                    >
                      PDF
                    </a>
                    {task.status === 'pending' && (
                      <>
                        <button
                          className={styles.btnPrimary}
                          onClick={() => onReinvoice(task)}
                        >
                          Re-invoice
                        </button>
                        <button
                          className={styles.btnDanger}
                          onClick={() => onSkip(task.id)}
                          title="Skip this invoice"
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

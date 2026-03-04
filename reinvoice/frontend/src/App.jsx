import { useState, useEffect, useCallback } from 'react';
import InvoiceList from './components/InvoiceList.jsx';
import ReInvoiceDialog from './components/ReInvoiceDialog.jsx';
import UploadDialog from './components/UploadDialog.jsx';
import styles from './App.module.css';

const DIMENSION_FILTERS = ['900', '902', '1000', '1010'];

export default function App() {
  const [tasks,           setTasks]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [syncing,         setSyncing]         = useState(false);
  const [seeding,         setSeeding]         = useState(false);
  const [error,           setError]           = useState(null);
  const [filter,          setFilter]          = useState('pending');
  const [dimFilter,       setDimFilter]       = useState(new Set()); // empty = all
  const [selectedTask,    setSelectedTask]    = useState(null);
  const [showUpload,      setShowUpload]      = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/invoices');
      if (!res.ok) throw new Error(await res.text());
      setTasks(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/invoices/sync', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const { added, tasks: newTasks } = await res.json();
      setTasks(newTasks);
      if (added === 0) alert('Already up to date — no new invoices found.');
      else alert(`Synced! ${added} new invoice${added !== 1 ? 's' : ''} added.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSeedMock = async () => {
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch('/api/mock/seed', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const { added, tasks: newTasks } = await res.json();
      setTasks(newTasks);
      if (added === 0) alert('Mock data already loaded.');
      else alert(`Loaded ${added} mock invoices.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSeeding(false);
    }
  };

  const handleSkip = async (taskId) => {
    if (!confirm('Mark this invoice as skipped?')) return;
    await fetch(`/api/invoices/${taskId}/skip`, { method: 'PATCH' });
    loadTasks();
  };

  const handleReinvoiceDone = () => {
    setSelectedTask(null);
    loadTasks();
  };

  const handleUploadDone = (newTasks) => {
    setTasks(newTasks);
    setShowUpload(false);
    setFilter('pending');
  };

  const toggleDimFilter = (val) => {
    setDimFilter(prev => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  // Base status filter
  const statusFiltered = tasks.filter(t => filter === 'all' ? true : t.status === filter);

  // Dimension filter (only applies on pending tab)
  const filtered = (filter === 'pending' && dimFilter.size > 0)
    ? statusFiltered.filter(t => dimFilter.has(t.dimension_value))
    : statusFiltered;

  const counts = {
    pending:  tasks.filter(t => t.status === 'pending').length,
    invoiced: tasks.filter(t => t.status === 'invoiced').length,
    skipped:  tasks.filter(t => t.status === 'skipped').length,
  };

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>↩</span>
            <span className={styles.brandName}>REINVOICE</span>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.mockBtn}
              onClick={handleSeedMock}
              disabled={seeding}
              title="Load sample data for testing (no API key needed)"
            >
              {seeding ? 'Loading…' : '⚗ Load mock data'}
            </button>
            <button
              className={styles.uploadBtn}
              onClick={() => setShowUpload(true)}
              title="Upload an external invoice PDF"
            >
              ↑ Upload invoice
            </button>
            <button
              className={styles.syncBtn}
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? 'Syncing…' : '↻ Sync from e-conomic'}
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {error && (
          <div className={styles.errorBanner}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className={styles.toolbar}>
          <div className={styles.tabs}>
            {[
              { key: 'pending',  label: 'Pending',     count: counts.pending },
              { key: 'invoiced', label: 'Re-invoiced', count: counts.invoiced },
              { key: 'skipped',  label: 'Skipped',     count: counts.skipped },
              { key: 'all',      label: 'All' },
            ].map(tab => (
              <button
                key={tab.key}
                className={`${styles.tab} ${filter === tab.key ? styles.tabActive : ''}`}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={styles.tabBadge}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Dimension filter chips — only on pending tab */}
          {filter === 'pending' && (
            <div className={styles.dimFilters}>
              <span className={styles.dimFiltersLabel}>Filter by dimension:</span>
              <button
                className={`${styles.dimChip} ${dimFilter.size === 0 ? styles.dimChipActive : ''}`}
                onClick={() => setDimFilter(new Set())}
              >
                All
              </button>
              {DIMENSION_FILTERS.map(val => (
                <button
                  key={val}
                  className={`${styles.dimChip} ${dimFilter.has(val) ? styles.dimChipActive : ''}`}
                  onClick={() => toggleDimFilter(val)}
                >
                  {val}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className={styles.loading}>Loading invoices…</div>
        ) : (
          <InvoiceList
            tasks={filtered}
            onReinvoice={setSelectedTask}
            onSkip={handleSkip}
          />
        )}
      </main>

      {selectedTask && (
        <ReInvoiceDialog
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onDone={handleReinvoiceDone}
        />
      )}

      {showUpload && (
        <UploadDialog
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploadDone}
        />
      )}
    </div>
  );
}

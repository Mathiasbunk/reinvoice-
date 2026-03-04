import { useState, useRef } from 'react';
import styles from './UploadDialog.module.css';

export default function UploadDialog({ onClose, onUploaded }) {
  const fileRef = useRef(null);
  const [file,         setFile]         = useState(null);
  const [supplierName, setSupplierName] = useState('');
  const [entryText,    setEntryText]    = useState('');
  const [amount,       setAmount]       = useState('');
  const [currency,     setCurrency]     = useState('DKK');
  const [uploading,    setUploading]    = useState(false);
  const [error,        setError]        = useState(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === 'application/pdf') setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) { setError('Please select a PDF file.'); return; }
    if (!supplierName.trim()) { setError('Please enter a supplier name.'); return; }

    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      fd.append('supplierName', supplierName);
      fd.append('entryText', entryText);
      fd.append('amount', amount);
      fd.append('currency', currency);

      const res = await fetch('/api/invoices/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      onUploaded(data.tasks);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog}>
        <div className={styles.header}>
          <span className={styles.title}>Upload External Invoice</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {/* Drop zone */}
          <div
            className={`${styles.dropZone} ${file ? styles.dropZoneHasFile : ''}`}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            {file ? (
              <>
                <div className={styles.fileIcon}>📄</div>
                <div className={styles.fileName}>{file.name}</div>
                <div className={styles.fileSize}>{(file.size / 1024).toFixed(0)} KB</div>
              </>
            ) : (
              <>
                <div className={styles.dropIcon}>⬆</div>
                <div className={styles.dropText}>Drop a PDF here or click to browse</div>
                <div className={styles.dropHint}>Max 20 MB</div>
              </>
            )}
          </div>

          {/* Metadata */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Supplier name *</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. Acme Corp"
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Description</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. Consulting – March 2025"
              value={entryText}
              onChange={e => setEntryText(e.target.value)}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.fieldGroup} style={{ flex: 1 }}>
              <label className={styles.label}>Amount</label>
              <input
                className={styles.input}
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup} style={{ width: 100 }}>
              <label className={styles.label}>Currency</label>
              <select
                className={styles.input}
                value={currency}
                onChange={e => setCurrency(e.target.value)}
              >
                <option>DKK</option>
                <option>EUR</option>
                <option>USD</option>
                <option>SEK</option>
                <option>NOK</option>
              </select>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={uploading}>Cancel</button>
          <button className={styles.submitBtn} onClick={handleSubmit} disabled={uploading || !file}>
            {uploading ? 'Uploading…' : 'Upload & add to queue'}
          </button>
        </div>
      </div>
    </div>
  );
}

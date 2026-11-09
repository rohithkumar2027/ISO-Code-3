import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Banner } from './Banner';
import './doctor-broadcast.css';

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Library of reusable PDF "templates": the doctor uploads once, keeps them named, sends many times. */
function DocumentLibrary({ documents, onUploaded, onDeleted, doctor, selectedId, onSelect }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  async function upload(e) {
    e.preventDefault();
    if (!file || !name.trim()) { setError('Please choose a PDF and give it a name.'); return; }
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('name', name.trim());
      form.set('description', description.trim());
      await api.doctorUploadDocument(form, doctor.csrf);
      setName(''); setDescription(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'file_too_large' ? 'That PDF is too large (limit 8 MB).' : err instanceof ApiError && err.code === 'bad_file' ? 'That file is not a PDF.' : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await api.doctorDeleteDocument(id, doctor.csrf);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'in_use' ? "This document has already been sent, so it can't be deleted (old links must keep working)." : 'Could not delete that document.');
    }
  }

  return (
    <div className="card broadcast-card">
      <h3>Document templates</h3>
      <p className="broadcast-hint">PDFs you keep on hand to send out — a health-camp flyer, a lab closure notice, a custom report. Upload once, reuse for any broadcast below.</p>

      {error && <Banner kind="bad">{error}</Banner>}

      <form onSubmit={upload} className="doc-upload-form">
        <input type="text" placeholder="Document name (e.g. Diwali hours notice)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <input type="text" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="submit" className="btn small" disabled={busy}>{busy ? <span className="spinner" /> : '+ Add to library'}</button>
      </form>

      {documents.length === 0 ? (
        <div className="empty-state small">No documents uploaded yet.</div>
      ) : (
        <ul className="doc-library-list">
          {documents.map((d) => (
            <li key={d.id} className={`doc-library-item ${selectedId === d.id ? 'selected' : ''}`}>
              <button type="button" className="doc-pick-btn" onClick={() => onSelect(d.id)}>
                <strong>{d.name}</strong>
                <span className="doc-meta">{bytes(d.size)} · {d.runs} send{d.runs === 1 ? '' : 's'} · by {d.created_by}</span>
                {d.description && <span className="doc-desc">{d.description}</span>}
              </button>
              <button type="button" className="btn quiet small doc-delete-btn" onClick={() => remove(d.id)} title="Delete">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SendBroadcast({ documents, selectedId, onSelect, doctor, onSent }) {
  const [customFile, setCustomFile] = useState(null);
  const [customName, setCustomName] = useState('');
  const [title, setTitle] = useState('');
  const [recipients, setRecipients] = useState('');
  const [confirming, setConfirming] = useState(null); // {valid, invalid, duplicates} preview
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const recipFileRef = useRef(null);

  function onRecipientsFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setRecipients((prev) => (prev ? `${prev}\n${reader.result}` : String(reader.result)));
    reader.readAsText(f);
  }

  // Client-side preview only — the server re-validates everything before sending.
  function preview() {
    const tokens = recipients.split(/[\n\r,;\t]+/).map((t) => t.trim()).filter(Boolean);
    const digitsOnly = tokens.filter((t) => /^[+()\-\s\d]{8,16}$/.test(t));
    setConfirming({ count: digitsOnly.length, totalLines: tokens.length });
  }

  async function send() {
    if ((!selectedId && !customFile) || !recipients.trim()) return;
    setSending(true); setError(null);
    try {
      const form = new FormData();
      if (selectedId) form.set('document_id', String(selectedId));
      else { form.set('file', customFile); form.set('name', customName.trim() || customFile.name); }
      if (title.trim()) form.set('title', title.trim());
      form.set('recipients', recipients);
      const res = await api.doctorSendBroadcast(form, doctor.csrf);
      setResult(res);
      setConfirming(null);
      setRecipients('');
      setTitle('');
      setCustomFile(null);
      if (recipFileRef.current) recipFileRef.current.value = '';
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? (err.extra?.message || 'Could not send that broadcast.') : 'Server error.');
    } finally {
      setSending(false);
    }
  }

  const selectedDoc = documents.find((d) => d.id === selectedId);
  const readyToPreview = (selectedId || (customFile && customName.trim())) && recipients.trim().length > 0;

  return (
    <div className="card broadcast-card">
      <h3>Send a document to patients</h3>
      <p className="broadcast-hint">
        Pick a document from the library, or upload a one-off custom PDF below. Each recipient gets a private,
        72-hour link that asks for a one-time code sent to their own number before the document opens — the
        same protection as a signed report link.
      </p>

      {error && <Banner kind="bad">{error}</Banner>}

      <div className="field-group">
        <label>Document</label>
        {selectedDoc ? (
          <div className="selected-doc-chip">
            {selectedDoc.name} <button type="button" className="btn quiet small" onClick={() => onSelect(null)}>change</button>
          </div>
        ) : (
          <div className="custom-doc-row">
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => setCustomFile(e.target.files?.[0] ?? null)} />
            <input type="text" placeholder="Name for this document" value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={120} />
          </div>
        )}
        {!selectedDoc && <p className="field-hint">Or pick one from "Document templates" on the left — it stays saved for next time.</p>}
      </div>

      <div className="field-group">
        <label htmlFor="bcast-title">Title / note for this send (optional, for your own records)</label>
        <input id="bcast-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Health camp — Nov batch" />
      </div>

      <div className="field-group">
        <label htmlFor="bcast-recipients">Patient mobile numbers</label>
        <textarea
          id="bcast-recipients" rows={6} value={recipients} onChange={(e) => setRecipients(e.target.value)}
          placeholder={'One per line, or comma-separated.\ne.g.\n9000000001\n9000000002\n+91 90000 00003'}
        />
        <div className="recip-upload-row">
          <input ref={recipFileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onRecipientsFile} />
          <span className="field-hint">Upload a CSV or TXT export of numbers (from Excel: File → Save As → CSV), or paste them above.</span>
        </div>
      </div>

      {confirming && (
        <div className="banner warn broadcast-confirm">
          <h2>Confirm before sending</h2>
          <p>
            This will message approximately <strong>{confirming.count}</strong> number{confirming.count === 1 ? '' : 's'}
            {' '}out of {confirming.totalLines} line{confirming.totalLines === 1 ? '' : 's'} entered (the server will
            reject anything that isn't a valid number and skip duplicates). This cannot be undone once sent.
          </p>
          <div className="confirm-actions">
            <button type="button" className="btn small" disabled={sending} onClick={send}>{sending ? <span className="spinner" /> : `Yes, send to ~${confirming.count} patients`}</button>
            <button type="button" className="btn quiet small" onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        </div>
      )}

      {!confirming && (
        <button type="button" className="btn broadcast-send-btn" disabled={!readyToPreview} onClick={preview}>
          Review &amp; send broadcast →
        </button>
      )}

      {result && (
        <div className="banner ok broadcast-result">
          <h2>✓ Broadcast sent</h2>
          <p>
            <strong>{result.run.sent}</strong> delivered, <strong>{result.run.failed}</strong> failed
            {result.run.invalid > 0 && <>, <strong>{result.run.invalid}</strong> invalid numbers skipped</>}
            {result.run.duplicate > 0 && <>, <strong>{result.run.duplicate}</strong> duplicates skipped</>}.
            {' '}Check the <a href="/dev/outbox" target="_blank" rel="noreferrer">outbox</a> to see the messages.
          </p>
        </div>
      )}
    </div>
  );
}

function RecentBroadcasts({ runs }) {
  return (
    <div className="card broadcast-card">
      <h3>Recent broadcasts</h3>
      {runs.length === 0 ? (
        <div className="empty-state small">No broadcasts sent yet.</div>
      ) : (
        <table className="results broadcast-runs-table">
          <thead><tr><th>Document</th><th>Title</th><th>Sent</th><th>Failed</th><th>Invalid</th><th>Duplicate</th><th>When</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.document_name}</td>
                <td>{r.title || '—'}</td>
                <td className="num">{r.sent}</td>
                <td className="num">{r.failed}</td>
                <td className="num">{r.invalid}</td>
                <td className="num">{r.duplicate}</td>
                <td className="small">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function DoctorBroadcastPanel({ doctor }) {
  const [documents, setDocuments] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [docs, b] = await Promise.all([api.doctorDocuments(), api.doctorBroadcasts()]);
      setDocuments(docs.documents);
      setRuns(b.runs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="empty-state"><span className="spinner" /> Loading…</div>;

  return (
    <div className="broadcast-layout">
      <DocumentLibrary documents={documents} onUploaded={load} onDeleted={load} doctor={doctor} selectedId={selectedId} onSelect={setSelectedId} />
      <SendBroadcast documents={documents} selectedId={selectedId} onSelect={setSelectedId} doctor={doctor} onSent={load} />
      <div className="broadcast-full-width"><RecentBroadcasts runs={runs} /></div>
    </div>
  );
}

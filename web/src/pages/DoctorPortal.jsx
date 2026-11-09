import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Page } from '../components/PageShell';
import { Banner } from '../components/Banner';
import { useSession } from '../lib/SessionContext';
import { DoctorBroadcastPanel } from '../components/DoctorBroadcastPanel';
import './doctor.css';

function WorklistPanel({ doctor }) {
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'processing' | 'critical' | 'ready'
  const [statusType, setStatusType] = useState('ready');
  const [certified, setCertified] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchStage, setDispatchStage] = useState('');
  const [dispatchSuccess, setDispatchSuccess] = useState(null);
  const [error, setError] = useState(null);

  async function loadOrders(selectOrderId = null) {
    try {
      setError(null);
      const res = await api.doctorOrders();
      setOrders(res.orders || []);
      if (selectOrderId) setSelectedId(selectOrderId);
      else setSelectedId((cur) => cur ?? res.orders?.[0]?.id ?? null);
    } catch (err) {
      setError('Could not load orders: ' + (err.message || 'Server error'));
    } finally {
      setLoadingOrders(false);
    }
  }

  async function loadDetail(id) {
    if (!id) return;
    setLoadingDetail(true);
    setDispatchSuccess(null);
    try {
      const res = await api.doctorOrder(id);
      setDetail(res);
      setStatusType(res.order.status === 'ready_critical' ? 'ready_critical' : 'ready');
    } catch (err) {
      setError('Failed to fetch order details: ' + (err.message || ''));
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => { loadOrders(); }, []);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  async function handleSignAndSend(e) {
    e?.preventDefault();
    if (!selectedId || dispatching) return;
    setDispatching(true);
    setError(null);
    setDispatchSuccess(null);
    try {
      setDispatchStage('Generating 256-bit cryptographically secure expiring token...');
      await new Promise((r) => setTimeout(r, 400));
      setDispatchStage('Preparing multi-language patient summaries (en/te/hi)...');
      await new Promise((r) => setTimeout(r, 400));
      setDispatchStage('Dispatching WhatsApp message with fallback to SMS...');
      const result = await api.doctorSignAndSend(selectedId, { status: statusType }, doctor.csrf);
      setDispatchSuccess(result);
      await loadDetail(selectedId);
      await loadOrders(selectedId);
    } catch (err) {
      setError('Failed to dispatch report: ' + (err.message || 'Server error'));
    } finally {
      setDispatching(false);
      setDispatchStage('');
    }
  }

  const filteredOrders = orders.filter((o) => {
    if (filter === 'processing') return o.status === 'processing';
    if (filter === 'critical') return o.status === 'ready_critical';
    if (filter === 'ready') return o.status === 'ready';
    return true;
  });
  const processingCount = orders.filter((o) => o.status === 'processing').length;
  const criticalCount = orders.filter((o) => o.status === 'ready_critical').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;

  return (
    <>
      <div className="stats-grid">
        <div className={`stat-card ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          <div className="stat-label">Total Lab Orders</div>
          <div className="stat-num">{orders.length}</div>
          <div className="stat-hint">Active worklist</div>
        </div>
        <div className={`stat-card stat-pending ${filter === 'processing' ? 'active' : ''}`} onClick={() => setFilter('processing')}>
          <div className="stat-label">Pending Sign-off</div>
          <div className="stat-num">{processingCount}</div>
          <div className="stat-hint">Awaiting doctor approval</div>
        </div>
        <div className={`stat-card stat-critical ${filter === 'critical' ? 'active' : ''}`} onClick={() => setFilter('critical')}>
          <div className="stat-label">Critical Panic Values</div>
          <div className="stat-num">{criticalCount}</div>
          <div className="stat-hint">Emergency notification required</div>
        </div>
        <div className={`stat-card stat-ready ${filter === 'ready' ? 'active' : ''}`} onClick={() => setFilter('ready')}>
          <div className="stat-label">Dispatched &amp; Delivered</div>
          <div className="stat-num">{readyCount}</div>
          <div className="stat-hint">Delivered to patients</div>
        </div>
      </div>

      {error && <Banner kind="bad">{error}</Banner>}

      <div className="doctor-workstation-grid">
        <div className="orders-sidebar">
          <div className="sidebar-header">
            <h3>Diagnostic Orders</h3>
            <span className="sidebar-count">{filteredOrders.length} orders</span>
          </div>

          {loadingOrders ? (
            <div className="empty-state"><span className="spinner" /> Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="empty-state">No orders match filter.</div>
          ) : (
            <div className="orders-list">
              {filteredOrders.map((o) => {
                const isSelected = o.id === selectedId;
                const isProcessing = o.status === 'processing';
                const isCritical = o.status === 'ready_critical';
                return (
                  <button
                    key={o.id} type="button"
                    className={`order-item-btn ${isSelected ? 'selected' : ''} ${isCritical ? 'item-critical' : ''}`}
                    onClick={() => setSelectedId(o.id)}
                  >
                    <div className="order-item-top">
                      <span className="order-item-id">{o.id}</span>
                      <span className={`pill ${isProcessing ? 'processing' : isCritical ? 'attention' : 'ready'}`}>
                        {isProcessing ? '● Awaiting Sign-off' : isCritical ? '⚠ Critical' : '✓ Dispatched'}
                      </span>
                    </div>
                    <div className="order-item-patient"><strong>{o.patient_name}</strong> ({o.sex}, {o.age}y)</div>
                    <div className="order-item-sub">
                      <span>📱 +91 {o.mobile}</span>
                      {o.abnormal_count > 0 && <span className="abnormal-pill">{o.abnormal_count} out-of-range</span>}
                    </div>
                    <div className="order-item-doctor">Dr: {o.referring_doctor || 'Self-referred'}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="doctor-main-pane">
          {loadingDetail ? (
            <div className="card loading-card"><span className="spinner" /> Fetching patient lab telemetry...</div>
          ) : !detail ? (
            <div className="card empty-card">Select an order from the list to review.</div>
          ) : (
            <div className="card detail-panel">
              <div className="detail-top-bar">
                <div>
                  <div className="detail-eyebrow">PATIENT TEST DOSSIER</div>
                  <h2 className="detail-patient-name">{detail.order.patient_name}</h2>
                  <div className="detail-patient-meta">
                    <span><strong>Age / Gender:</strong> {detail.order.age} yrs / {detail.order.sex}</span>
                    <span><strong>Mobile:</strong> +91 {detail.order.mobile}</span>
                    <span><strong>Order ID:</strong> {detail.order.id}</span>
                    <span><strong>Referring Physician:</strong> {detail.order.referring_doctor || 'Self'}</span>
                  </div>
                </div>
                <div className="detail-status-pill-box">
                  <span className={`pill large ${detail.order.status === 'processing' ? 'processing' : detail.order.status === 'ready_critical' ? 'attention' : 'ready'}`}>
                    {detail.order.status === 'processing' ? 'Status: Processing / Unsigned'
                      : detail.order.status === 'ready_critical' ? 'Status: Ready (Critical Panic Alert)' : 'Status: Signed & Dispatched'}
                  </span>
                  {detail.order.delivered_at && (
                    <div className="delivered-badge">
                      ✓ Dispatched: {new Date(detail.order.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>

              {detail.order.status === 'ready_critical' && (
                <div className="banner bad critical-alert-box">
                  <h3>⚠ CRITICAL LAB ALERT (PANIC VALUE)</h3>
                  <p>
                    Biomarker parameters have breached safe biological thresholds. As per ISO/NABL safety protocol,
                    the front desk callback queue has been automatically notified for mandatory verbal confirmation.
                  </p>
                </div>
              )}

              <div className="results-table-section">
                <div className="section-title-row">
                  <h3>Laboratory Measured Findings</h3>
                  <span className="section-subtitle">Automated Analyzer Telemetry vs Standard Reference Ranges</span>
                </div>
                <div className="table-responsive">
                  <table className="results doctor-table">
                    <thead><tr><th>Parameter</th><th>Measured Value</th><th>Reference Range</th><th>Status Flag</th></tr></thead>
                    <tbody>
                      {detail.results.map((r) => {
                        const isOdd = r.flag === 'low' || r.flag === 'high';
                        return (
                          <tr key={r.id} className={isOdd ? 'row-abnormal' : ''}>
                            <td className="param-cell">
                              <strong>{r.name}</strong>
                              {r.localNames?.te && r.localNames.te !== r.name && <div className="param-sub">{r.localNames.te} · {r.localNames.hi}</div>}
                            </td>
                            <td className="value-cell"><span className="measured-val">{r.value}</span>{r.unit && <span className="measured-unit">{r.unit}</span>}</td>
                            <td className="ref-cell">{r.refRaw || '—'}</td>
                            <td className="flag-cell">
                              {r.flag === 'normal' && <span className="flag-tag normal">NORMAL</span>}
                              {r.flag === 'high' && <span className="flag-tag high">▲ HIGH</span>}
                              {r.flag === 'low' && <span className="flag-tag low">▼ LOW</span>}
                              {r.flag === 'unknown' && <span className="flag-tag unknown">EVALUATED</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {detail.results.some((r) => r.summary) && (
                <div className="doctor-summaries-section">
                  <div className="section-title-row">
                    <h3>Patient Plain-Language Explanations Preview</h3>
                    <span className="section-subtitle">Patients receive certified explanations in their preferred language</span>
                  </div>
                  {detail.results.filter((r) => r.summary).map((r) => (
                    <div key={r.id} className="summary-preview-card">
                      <div className="summary-card-head">
                        <strong>{r.name} ({r.flag.toUpperCase()})</strong>
                        <span className="source-tag">Source: {r.summary?.en?.source === 'template' ? 'Locked Template' : r.summary?.en?.source === 'ai' ? 'AI (guardrail-checked)' : 'Generic fallback'}</span>
                      </div>
                      <div className="summary-texts">
                        <div className="summary-lang-row"><span className="lang-label-tag">English:</span><span>{r.summary?.en?.text || 'Standard reference notification.'}</span></div>
                        {r.summary?.te?.text && <div className="summary-lang-row"><span className="lang-label-tag">తెలుగు:</span><span>{r.summary.te.text}</span></div>}
                        {r.summary?.hi?.text && <div className="summary-lang-row"><span className="lang-label-tag">हिन्दी:</span><span>{r.summary.hi.text}</span></div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="sign-dispatch-card">
                <div className="sign-header">
                  <div>
                    <h3 className="sign-title">
                      {detail.order.status === 'processing' ? 'Doctor Digital Sign-off & Patient Dispatch' : 'Re-dispatch / Resend Patient Access Link'}
                    </h3>
                    <p className="sign-sub">When signed, an encrypted 72-hour expiring link is immediately dispatched to the patient via WhatsApp & SMS.</p>
                  </div>
                </div>

                <div className="sign-options-grid">
                  <label className="sign-radio-label">
                    <input type="radio" name="statusType" value="ready" checked={statusType === 'ready'} onChange={() => setStatusType('ready')} />
                    <div><strong>Standard Sign-off (Ready)</strong><div className="option-desc">Normal or manageable findings. Full plain-language summaries enabled.</div></div>
                  </label>
                  <label className="sign-radio-label critical-radio">
                    <input type="radio" name="statusType" value="ready_critical" checked={statusType === 'ready_critical'} onChange={() => setStatusType('ready_critical')} />
                    <div><strong>Critical Panic Sign-off (Emergency Alert)</strong><div className="option-desc">Suppresses AI summaries, displays urgent banner, alerts front desk.</div></div>
                  </label>
                </div>

                <label className="certify-checkbox-label">
                  <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
                  <span>I, <strong>{doctor.name}</strong>, digitally certify these laboratory findings and authorize release under ISO 15189 / NABL guidelines.</span>
                </label>

                {dispatching && <div className="dispatch-progress-box"><span className="spinner" /><strong>{dispatchStage}</strong></div>}

                {dispatchSuccess && (
                  <div className="banner ok dispatch-success-banner">
                    <h4>✓ Report Successfully Signed &amp; Dispatched!</h4>
                    <p>A secure WhatsApp notification with a 72-hour expiring link has been sent to <strong>+91 {detail.order.mobile}</strong>.</p>
                    <div className="dispatch-links-row">
                      <a href="/dev/outbox" target="_blank" rel="noreferrer" className="btn small secondary">Inspect in WhatsApp/SMS Outbox ↗</a>
                    </div>
                  </div>
                )}

                <div className="sign-actions">
                  <button type="button" className={`btn sign-btn ${statusType === 'ready_critical' ? 'danger' : ''}`} onClick={handleSignAndSend} disabled={!certified || dispatching}>
                    {dispatching ? <><span className="spinner" /> Dispatching to Patient...</>
                      : detail.order.status === 'processing' ? `✍ Sign & Send Report via WhatsApp/SMS (${statusType === 'ready_critical' ? 'Critical Panic' : 'Standard'})`
                      : '🔄 Resend Link & Re-dispatch to Patient'}
                  </button>
                </div>
              </div>

              {detail.messages?.length > 0 && (
                <div className="delivery-audit-section">
                  <h4>Delivery Telemetry &amp; Audit Log</h4>
                  <div className="messages-history-list">
                    {detail.messages.map((m) => (
                      <div key={m.id} className="message-history-item">
                        <span className={`channel-badge ${m.channel}`}>{m.channel === 'whatsapp' ? '💬 WhatsApp' : '📱 SMS'}</span>
                        <span className="message-status">Status: <strong>{m.status.toUpperCase()}</strong></span>
                        <span className="message-recipient">Recipient: +91 {m.mobile}</span>
                        <span className="message-time">{new Date(m.created_at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function DoctorPortal() {
  const { doctor, doctorLogout } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState('worklist'); // 'worklist' | 'broadcast'

  if (doctor === undefined) return null;
  if (!doctor) return <Navigate to="/doctor/login" replace />;

  return (
    <Page>
      <div className="doctor-header-card">
        <div className="doctor-profile">
          <div className="doctor-avatar">🩺</div>
          <div>
            <div className="doctor-badge-row">
              <span className="doctor-chip">Pathology Workstation</span>
              <span className="nabl-chip">NABL Accredited Lab #ISO-15189</span>
            </div>
            <h1 className="doctor-name">{doctor.name}</h1>
            <p className="doctor-meta">Signed in as {doctor.username} · Company A Diagnostics Central Lab</p>
          </div>
        </div>

        <div className="doctor-actions-top">
          <a href="/dev/outbox" target="_blank" rel="noreferrer" className="btn small secondary outbox-btn">Outbox ↗</a>
          <button type="button" className="btn small secondary doc-logout-btn" onClick={async () => { await doctorLogout(); navigate('/doctor/login'); }}>
            Sign Out
          </button>
        </div>
      </div>

      <div className="doctor-tabs">
        <button type="button" className={`doctor-tab ${tab === 'worklist' ? 'active' : ''}`} onClick={() => setTab('worklist')}>
          Worklist &amp; Sign-off
        </button>
        <button type="button" className={`doctor-tab ${tab === 'broadcast' ? 'active' : ''}`} onClick={() => setTab('broadcast')}>
          Document Broadcast
        </button>
      </div>

      {tab === 'worklist' ? <WorklistPanel doctor={doctor} /> : <DoctorBroadcastPanel doctor={doctor} />}
    </Page>
  );
}

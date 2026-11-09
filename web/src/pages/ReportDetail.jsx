import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Page } from '../components/PageShell';
import { Banner } from '../components/Banner';
import { RangeBar } from '../components/RangeBar';
import { api, ApiError, reportPdfUrl } from '../lib/api';
import { useSession } from '../lib/SessionContext';
import { t } from '../i18n';

function istDate(iso, lang) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

function Finding({ r, lang, orderId, patientCsrf, onFlagged }) {
  const s = r.summary?.[lang];
  const local = r.localNames?.[lang];
  const flagged = s?.status === 'flagged';
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function flag() {
    if (!s) return;
    setSending(true);
    try { await api.flag(orderId, r.id, patientCsrf); setDone(true); onFlagged?.(); } finally { setSending(false); }
  }

  return (
    <motion.section className="finding" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="finding-head">
        <span className="finding-test">{r.name}</span>
        <span className="finding-flag">{r.flag === 'low' ? `▼ ${t(lang, 'low')}` : `▲ ${t(lang, 'high')}`}</span>
      </div>
      {local && local !== r.name && <div className="finding-local" lang={lang}>{local}</div>}
      <div className="finding-value">{r.value}{r.unit && <span className="unit">{r.unit}</span>}</div>
      <div className="finding-range">
        {t(lang, 'usual_range')}: {r.refLow !== null && r.refHigh !== null ? `${r.refLow} – ${r.refHigh}` : r.refHigh !== null ? `< ${r.refHigh}` : r.refLow !== null ? `> ${r.refLow}` : r.refRaw}
        {r.unit ? ` ${r.unit}` : ''}
      </div>
      <RangeBar value={r.valueNum} low={r.refLow} high={r.refHigh} flag={r.flag} />
      {s && (
        <>
          {flagged && !done ? (
            <p className="finding-explain" style={{ color: 'var(--ink-soft)' }}>{t(lang, 'under_review')}</p>
          ) : (
            <>
              <p className="finding-explain" lang={lang}>{s.text}</p>
              <div className="finding-tags">
                {s.source === 'ai' && s.status !== 'approved' && <span className="tag ai">{t(lang, 'ai_tag')}</span>}
                {s.status === 'approved' && <span className="tag checked">✓ {t(lang, 'checked_tag')}</span>}
              </div>
              {!done ? (
                <button type="button" className="btn quiet small" style={{ marginTop: 12 }} disabled={sending} onClick={flag}>
                  {t(lang, 'flag_wrong')}
                </button>
              ) : (
                <p style={{ marginTop: 12, color: 'var(--forest)', fontWeight: 600 }}>{t(lang, 'flag_thanks')}</p>
              )}
            </>
          )}
        </>
      )}
    </motion.section>
  );
}

export default function ReportDetail() {
  const { id } = useParams();
  const { lang, patient } = useSession();
  const [data, setData] = useState(undefined); // undefined = loading, null = not found
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!patient) return;
    let cancelled = false;
    api.report(id).then((r) => !cancelled && setData(r)).catch((e) => !cancelled && setData(e instanceof ApiError ? { error: e.code } : { error: 'server_error' }));
    return () => { cancelled = true; };
  }, [id, patient, refreshKey]);

  if (patient === undefined) return null;
  if (!patient) return <Navigate to="/login" replace />;
  if (!patient.consent) return <Navigate to="/consent" replace />;
  if (data === undefined) return <Page><div className="empty-state"><span className="spinner" /></div></Page>;

  if (data.error === 'not_found' || data.error === 'consent_required') {
    return (
      <Page narrow>
        <h1 className="display-md">{t(lang, 'nf_title')}</h1>
        <p className="lede">{t(lang, 'nf_body')}</p>
        <div className="actions"><Link className="btn" to="/reports">{t(lang, 'back')}</Link></div>
      </Page>
    );
  }
  if (data.error) {
    return (
      <Page narrow>
        <h1 className="display-md">{t(lang, 'err_title')}</h1>
        <p className="lede">{t(lang, 'err_body')}</p>
      </Page>
    );
  }

  if (data.status === 'processing') {
    return (
      <Page narrow>
        <h1 className="display-lg">{t(lang, 'not_ready_title')}</h1>
        <p className="lede">{t(lang, 'not_ready_body')}</p>
        <div className="actions"><Link className="btn secondary" to="/reports">{t(lang, 'back')}</Link></div>
      </Page>
    );
  }

  const critical = data.status === 'ready_critical';
  const odd = data.results.filter((r) => r.flag === 'low' || r.flag === 'high');

  return (
    <Page>
      <div style={{ marginBottom: 20 }}>
        <p className="eyebrow">{t(lang, 'patient')}</p>
        <h1 className="display-md" style={{ marginTop: 4 }}>{data.patientName}</h1>
        <p className="lede" style={{ marginTop: 6 }}>
          {data.id} · {t(lang, 'signed_on', { d: istDate(data.signedAt, lang) })}
          {data.referringDoctor ? ` · ${t(lang, 'doctor')}: ${data.referringDoctor}` : ''}
        </p>
      </div>

      {critical && <Banner kind="bad" title={`! ${t(lang, 'critical_title')}`}>{t(lang, 'critical_body')}</Banner>}

      <h2 className="display-md" style={{ marginBottom: 6 }}>{t(lang, 'standout')}</h2>
      {odd.length ? (
        odd.map((r) => (
          <Finding key={r.id} r={r} lang={lang} orderId={data.id} patientCsrf={patient.csrf} onFlagged={() => setRefreshKey((k) => k + 1)} />
        ))
      ) : (
        <Banner kind="ok">✓ {t(lang, 'all_normal')}</Banner>
      )}

      <div className="actions">
        <a className="btn" href={reportPdfUrl(data.id)}>{t(lang, 'download_pdf')}</a>
        <Link className="btn secondary" to="/reports">{t(lang, 'back')}</Link>
      </div>

      <details className="all-results">
        <summary>{t(lang, 'all_results')} ({data.results.length})</summary>
        <table className="results">
          <thead><tr><th>{t(lang, 'result')}</th><th></th><th>{t(lang, 'usual_range')}</th></tr></thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td><strong>{r.value}</strong> {r.unit ?? ''} {r.flag !== 'unknown' && (r.flag === 'low' ? `▼ ${t(lang, 'low')}` : r.flag === 'high' ? `▲ ${t(lang, 'high')}` : '')}</td>
                <td style={{ color: 'var(--ink-soft)' }}>
                  {r.refLow !== null && r.refHigh !== null ? `${r.refLow} – ${r.refHigh}` : r.refHigh !== null ? `< ${r.refHigh}` : r.refLow !== null ? `> ${r.refLow}` : (r.refRaw || '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <p className="footnote">{t(lang, 'read_full')}</p>
    </Page>
  );
}

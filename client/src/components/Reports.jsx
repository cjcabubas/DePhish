import React, { useEffect, useState } from 'react';
import { Flag, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { TermsBox } from './TermsBox';

const statusLabel = status => ({ pending: 'Pending', verified: 'Verified', rejected: 'Rejected' }[status] || status);
const kindLabel = kind => ({ url: 'URL', domain: 'Domain', email: 'Sender email', phone: 'Phone number' }[kind] || kind);
const fields = [['message', 'Scam message', 'Paste the suspicious message'], ['suspiciousUrl', 'Suspicious link or domain', 'https://example.com'],
  ['senderEmail', 'Sender / scammer email', 'sender@example.com'], ['phone', 'Scam phone number', '+63… or 09…'], ['details', 'Extra details', 'What happened? What makes this suspicious?']];

function Status({ value }) { return <span className={`reportStatus ${value}`}>{statusLabel(value)}</span>; }
function Assessment({ report }) {
  const result = report.analysis;
  return <div className="reportAssessment">
    <div className="reportSummary"><Status value={report.status}/><b>Risk score: {result.risk_score}/100</b><span>{result.prediction}</span><span>Type: {result.phishing_type || 'Not established'}</span></div>
    <p className="dashboardNote">The automated assessment supports review. The admin status is a separate decision.</p>
    {result.indicatorAnalysis?.status === 'unavailable' && <p role="status">Message indicator analysis was unavailable for this submission.</p>}
    {result.detected_indicators?.length ? <ul className="reportFindings">{result.detected_indicators.map((item, index) => <li key={index}><b>{item.title || item.category?.replaceAll('_', ' ')}</b>
      <p>{item.why_it_matters || item.description}</p>{item.evidence?.map((evidence, index) => <blockquote key={index}>{evidence.text}</blockquote>)}</li>)}</ul>
      : result.indicatorAnalysis?.status !== 'unavailable' && <p>No message-pattern indicators were detected.</p>}
    {result.link_checks?.map((check, index) => <div key={index}><b>{check.url}</b><p>{check.destination?.failure_reason || check.destination?.status || check.error || 'Link check evidence unavailable'}</p>
      {check.risk?.factors?.map(factor => <p key={factor.code}>{factor.explanation}</p>)}</div>)}
  </div>;
}
function Content({ report }) {
  return <dl className="reportContent">{fields.map(([key, label]) => report.content[key] && <div key={key}><dt>{label}</dt><dd>{report.content[key]}</dd></div>)}</dl>;
}
function Pagination({ page, total, onChange, busy }) {
  return <div className="reportPagination"><button type="button" className="outline" disabled={busy || page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
    <span>Page {page} · {total} {total === 1 ? 'item' : 'items'}</span><button type="button" className="outline" disabled={busy || page * 20 >= total} onClick={() => onChange(page + 1)}>Next</button></div>;
}

export function Report({ source: initialSource, authenticated }) {
  const [source, setSource] = useState(initialSource);
  const [form, setForm] = useState({ message: source?.message || '', suspiciousUrl: '', senderEmail: '', phone: '', details: '' });
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(null);
  const [tab, setTab] = useState('new');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await api.reports.submit({ ...form, ...(source?.sourceScanId ? { sourceScanId: source.sourceScanId } : {}),
        tosAccepted: Boolean(consent), termsVersion: consent });
      setSaved(result.report); setForm({ message: '', suspiciousUrl: '', senderEmail: '', phone: '', details: '' }); setConsent(false);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <section className="content narrow"><div className="eyebrow"><span/>COMMUNITY PROTECTION</div><h1>Report Scam</h1>
    <p className="lead">Submit a suspicious message or contact for admin review.</p>
    {authenticated && <div className="reportTabs"><button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>Submit a report</button><button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>My reports</button></div>}
    {tab === 'mine' ? <ReportQueue/> : saved ? <section className="panel reportReceipt" role="status"><ShieldCheck/><h2>Report submitted</h2><p>Your report is pending admin review. No threat indicators have been published.</p><p>Reference: {saved._id}</p><Assessment report={saved}/>
      {!authenticated && <p>Guest reports can be reviewed by admins. Sign in before future submissions to track their status in My reports.</p>}
      <button className="outline" onClick={() => { setSaved(null); setSource(null); }}>Submit another report</button></section>
      : <form className="reportForm" onSubmit={submit} aria-busy={busy}>
        {source?.sourceScanId && <p className="reportSource">Reporting saved scan {source.sourceScanId}. Its saved, redacted message will be analyzed again. Add any missing sender or link details below.</p>}
        <p>Remove passwords, codes, and personal information that is not needed. Link analysis may contact submitted websites. Reports and review candidates are retained for up to 30 days; designated scam contacts are visible to admins for review.</p>
        {fields.map(([key, label, placeholder]) => key === 'message' && source?.sourceScanId ? null : <label key={key}>{label}
          {['message', 'details'].includes(key) ? <textarea value={form[key]} disabled={busy} maxLength={key === 'message' ? 5000 : 2000} placeholder={placeholder} onChange={event => setForm({ ...form, [key]: event.target.value })}/>
            : <input type={key === 'senderEmail' ? 'email' : key === 'phone' ? 'tel' : 'text'} value={form[key]} disabled={busy} maxLength={key === 'senderEmail' ? 254 : key === 'phone' ? 40 : 2048} placeholder={placeholder} onChange={event => setForm({ ...form, [key]: event.target.value })}/>}</label>)}
        <p className="dashboardNote">Provide at least one message, link, email, or phone. Combined content must be within 5,000 characters. Sender addresses can be spoofed; naming one does not establish fraud.</p>
        <TermsBox checked={consent} onChange={setConsent} disabled={busy}/>
        {error && <p className="scanError" role="alert">{error}</p>}
        <button className="primary submit" disabled={busy || !consent}><Flag size={17}/>{busy ? 'Analyzing and submitting…' : 'Submit report'}</button>
      </form>}
  </section>;
}

function Review({ report, onSaved }) {
  const [selected, setSelected] = useState(report.approvedIndicatorIds || []), [emailReviewed, setEmailReviewed] = useState(false);
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const hasEmail = report.candidates.some(item => item.kind === 'email' && selected.includes(item.id));
  async function decide(status) {
    setBusy(true); setError('');
    try { await api.reports.review(report._id, { status, revision: report.revision, indicatorIds: status === 'verified' ? selected : [], note, emailReviewed }); onSaved(); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <section className="reportReview"><h3>Review threat candidates</h3><p>Select only indicators you have verified as malicious. URL credentials, queries, and fragments are removed. Approve a whole domain only when evidence supports it. A report can be verified without publishing any indicators.</p>
    <div className="reportCandidates">{report.candidates.length ? report.candidates.map(item => <label key={item.id}><input type="checkbox" disabled={busy} checked={selected.includes(item.id)} onChange={event => setSelected(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/>
      <span><b>{kindLabel(item.kind)}: {item.value}</b><small>{item.source}</small></span></label>) : <p>No valid threat candidates were found. Credentials are never eligible.</p>}</div>
    {hasEmail && <label className="reportEmailReview"><input type="checkbox" checked={emailReviewed} disabled={busy} onChange={event => setEmailReviewed(event.target.checked)}/><span>I reviewed the selected sender addresses for spoofing and documented evidence connecting them to this scam below.</span></label>}
    <label className="reportNote">Review note<textarea value={note} maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} placeholder={hasEmail ? 'Explain the evidence for the sender addresses and your decision.' : 'Explain your decision or why the report needs another review.'}/></label>
    {error && <p className="scanError" role="alert">{error}</p>}
    <div className="reportDecisions"><button className="primary" disabled={busy || note.trim().length < 5 || (hasEmail && !emailReviewed)} onClick={() => decide('verified')}>{busy ? 'Saving…' : 'Verify'}</button>
      <button className="outline" disabled={busy || note.trim().length < 5} onClick={() => decide('rejected')}>Reject</button>
      {report.status !== 'pending' && <button className="outline" disabled={busy || note.trim().length < 5} onClick={() => decide('pending')}>Reopen as pending</button>}</div>
    {report.status === 'verified' && <p className="dashboardNote">Rejecting or reopening removes this report’s approved indicators. Indicators supported by other verified reports remain.</p>}
  </section>;
}

function ReportQueue({ admin = false }) {
  const [status, setStatus] = useState(admin ? 'pending' : ''), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setData(null);
    api.reports.list({ admin, status, page }).then(value => { if (active) setData(value); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [admin, status, page, refresh]);
  return <div aria-busy={busy}><div className="reportFilters"><label>Status <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All reports</option>{['pending', 'verified', 'rejected'].map(value => <option value={value} key={value}>{statusLabel(value)}{data ? ` (${data.counts[value]})` : ''}</option>)}</select></label>
    <button className="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh</button></div>
    {busy && <p role="status">Loading reports…</p>}{error && <p role="alert" className="scanError">{error}</p>}
    {data && <>{!data.reports.length && <p className="dashboardEmpty">No {status || 'submitted'} reports to display.</p>}
      {data.reports.map(report => <details className="panel reportCard" key={`${report._id}-${report.revision}`}><summary><Status value={report.status}/><b>{report.content.message?.slice(0, 80) || report.content.suspiciousUrl || report.content.senderEmail || report.content.phone || 'Scam report'}</b><span>{new Date(report.createdAt).toLocaleString()}</span></summary>
        <p className="dashboardNote">Reference: {report._id}{report.sourceScanId ? ` · Saved scan: ${report.sourceScanId}` : ''}</p><Content report={report}/><Assessment report={report}/>
        {report.reviewedAt && <p className="reportReviewNote"><b>Latest admin review · {new Date(report.reviewedAt).toLocaleString()}</b><br/>{report.reviewNote}</p>}
        {admin && report.reviewLog?.length > 0 && <details className="analysisDetails"><summary>Status history</summary>{report.reviewLog.map((entry, index) => <p key={index}><b>{statusLabel(entry.status)} · {new Date(entry.at).toLocaleString()}</b><br/>{entry.note}{entry.emailReviewed && <><br/>Selected sender emails reviewed for spoofing.</>}</p>)}</details>}
        {admin && <Review report={report} onSaved={() => setRefresh(value => value + 1)}/>}</details>)}
      <Pagination page={page} total={data.total} onChange={setPage} busy={busy}/></>}
  </div>;
}

export function ReportManagement() {
  return <section className="content"><div className="eyebrow"><span/>ADMIN REVIEW</div><h1>Scan Reports</h1><p className="lead">Review community submissions and update their status. Automated scan history is kept separately.</p><ReportQueue admin/></section>;
}

export function ThreatIndicators() {
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setData(null);
    api.reports.threats(page).then(value => { if (active) setData(value); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [page, refresh]);
  return <section className="content"><div className="eyebrow"><span/>VERIFIED INTELLIGENCE</div><h1>Threat Indicators</h1><p className="lead">Only individually approved indicators from verified reports appear here.</p>
    <button className="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
    {busy && <p role="status">Loading verified indicators…</p>}{error && <p role="alert" className="scanError">{error}</p>}
    {data && <>{!data.indicators.length ? <p className="dashboardEmpty">No verified threat indicators yet.</p> : <div className="dashboardTableWrap"><table><thead><tr><th>Type</th><th>Indicator</th><th>Verified reports</th><th>Last verified</th></tr></thead><tbody>{data.indicators.map(item => <tr key={`${item.kind}:${item.value}`}><td>{kindLabel(item.kind)}</td><td className="threatValue">{item.value}</td><td>{item.reportIds.length}</td><td>{new Date(item.verifiedAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
      <Pagination page={page} total={data.total} onChange={setPage} busy={busy}/></>}
  </section>;
}

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, ScanSearch, Users, X } from 'lucide-react';
import { api } from '../services/api';
import { ScanResult } from './ScanResult';

const labels = { urgency_pressure: 'Urgency and pressure', credential_harvesting: 'Account or credential request', financial_bait: 'Financial lure', impersonation: 'Brand or authority claim', call_to_action: 'Call to action', structural_anomalies: 'Formatting and contact cues', secret_disclosure: 'Security-secret request', payment_redirection: 'Payment change', remote_access: 'Remote access', security_bypass: 'Security bypass', text_obfuscation: 'Unusual text encoding' };
const number = value => value.toLocaleString();

function Metric({ icon: Icon, color, value, label }) {
  return <div className="metric"><span className={`metricIcon ${color}`}><Icon/></span><b>{number(value)}</b><p>{label}</p></div>;
}

function Breakdown({ stats }) {
  const rows = [['Phishing', stats.phishing, 'phishing'], ['Suspicious', stats.suspicious, 'suspicious'], ['Low risk', stats.legitimate, 'legitimate']];
  if (stats.unclassified) rows.push(['Unclassified older results', stats.unclassified, 'unclassified']);
  return <section className="panel"><div className="panelHead"><h2>Scan assessments</h2><span>All saved scans</span></div>
    {!stats.total ? <p className="dashboardEmpty">No saved scans yet.</p> : <div className="assessmentRows">{rows.map(([label, count, key]) => <div key={key}><span>{label}</span><progress className={key} value={count} max={stats.total} aria-label={`${label}: ${count} of ${stats.total}`}/><b>{number(count)}</b><small>{(count / stats.total * 100).toFixed(1)}%</small></div>)}</div>}
    <p className="dashboardNote">These are scanner assessments, rather than confirmed threats.</p>
  </section>;
}

function Activity({ stats, admin }) {
  const [range, setRange] = useState(null), [activity, setActivity] = useState(stats.activity);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (range === null) { setActivity(stats.activity); return; }
    const controller = new AbortController();
    let active = true;
    setBusy(true); setError(''); setActivity([]);
    api.dashboard.stats(admin, range, { signal: controller.signal })
      .then(data => { if (active) setActivity(data.activity); })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; controller.abort(); };
  }, [admin, range, retry, stats]);
  const selectedRange = range || '30';
  const period = selectedRange === 'all' ? 'all time' : `the last ${selectedRange} days`;
  const total = activity.reduce((sum, day) => sum + day.total, 0);
  const max = activity.reduce((highest, day) => Math.max(highest, day.total), 1);
  return <section className="panel dashboardActivity" aria-busy={busy}><div className="panelHead"><h2>Daily scan activity</h2><label className="activityRange"><select aria-label="Daily scan activity date range" value={selectedRange} onChange={event => setRange(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select><span>UTC</span></label></div>
    {busy ? <p className="dashboardEmpty" role="status">Loading scan activity…</p> : error ? <div className="dashboardError" role="alert"><p>{error}</p><button className="outline" onClick={() => setRetry(value => value + 1)}>Retry activity</button></div> : <>
    <p aria-live="polite"><b>{number(total)}</b> scans saved during this period</p>
    {total > 0 ? <><div className="activityScroll"><div className="activityBars" style={{ minWidth: activity.length > 90 ? `${activity.length * 4}px` : undefined }} role="img" aria-label={`${total} scans saved over ${period}, UTC. Daily counts are in the expandable table below.`}>{activity.map(day => <div key={day.date} title={`${day.date} UTC: ${day.total} scans`}><i style={{ height: `${day.total / max * 100}%` }}/></div>)}</div></div><div className="activityDates"><span>{activity[0].date}</span><span>{activity.at(-1).date}</span></div>
      <details className="analysisDetails"><summary>Daily counts</summary><div className="dashboardTableWrap"><table><thead><tr><th>Date (UTC)</th><th>Total</th><th>Phishing</th><th>Suspicious</th><th>Low risk</th></tr></thead><tbody>{activity.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.total}</td><td>{day.phishing}</td><td>{day.suspicious}</td><td>{day.legitimate}</td></tr>)}</tbody></table></div></details></> : <p className="dashboardEmpty">{selectedRange === 'all' ? 'No saved scans yet.' : `No scans saved in ${period}.`}</p>}
    </>}
  </section>;
}

function Indicators({ stats }) {
  return <section className="panel"><div className="panelHead"><h2>Common observed indicators</h2><span>All saved scans</span></div>
    {stats.indicators.length ? <ul className="dashboardIndicators">{stats.indicators.map(item => <li key={item.category}><span>{labels[item.category] || item.category.replaceAll('_', ' ')}</span><b>{number(item.count)} <small>scans</small></b></li>)}</ul> : <p className="dashboardEmpty">No indicator matches recorded.</p>}
    <p className="dashboardNote">Each indicator is counted once per scan. Pattern matches do not establish fraud.</p>
  </section>;
}

export function Dashboard({ admin = false, go }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0), [selected, setSelected] = useState(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null); setSelected(null);
    Promise.all([api.dashboard.stats(admin), admin ? Promise.resolve([]) : api.scans.list({ authenticated: true })])
      .then(([stats, scans]) => { if (active) setData({ stats, scans }); })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [admin, refresh]);
  const stats = data?.stats;
  return <section className="content" aria-busy={loading}>
    <div className="dashTitle"><div><div className="eyebrow"><span/>{admin ? 'ADMIN OVERVIEW' : 'MY SECURITY'}</div><h1>{admin ? 'Scan dashboard' : 'Your scan dashboard'}</h1><p className="lead">{admin ? 'Review saved scan activity across accounts.' : 'Review your saved assessments and revisit their evidence.'}</p></div><div className="dashboardActions"><button className="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</button>{go && <button className="primary" onClick={() => go('scanner')}><ScanSearch size={16}/> New scan</button>}</div></div>
    {loading && <p role="status" className="dashboardEmpty">Loading saved scan statistics…</p>}
    {error && <div className="dashboardError" role="alert"><p>{error}</p><button className="outline" onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
    {stats && <>
      <p className="dashboardNote">Totals cover all {admin ? 'account and guest' : 'your account'} saved scans. Unsaved scans are excluded. Updated {new Date(stats.generated_at).toLocaleString()}.</p>
      <div className="metricGrid"><Metric icon={History} color="blue" value={stats.total} label="Saved scans"/><Metric icon={AlertTriangle} color="red" value={stats.phishing} label="Phishing assessments"/><Metric icon={AlertTriangle} color="amber" value={stats.suspicious} label="Suspicious assessments"/><Metric icon={admin ? Users : CheckCircle2} color="teal" value={admin ? stats.active_accounts : stats.legitimate} label={admin ? 'Accounts with saved scans' : 'Low-risk assessments'}/></div>
      <div className="dashboardGrid"><Activity stats={stats} admin={admin}/><Breakdown stats={stats}/></div><div className="dashboardIndicatorPanel"><Indicators stats={stats}/></div>
      {admin ? <section className="panel dashboardReportNote"><h2>Community reports</h2><p>Review submitted scam reports and approve threat indicators separately from scan activity.</p><button className="primary" onClick={() => go('admin-reports')}>Review Scan Reports</button></section> : <section className="panel historyPanel"><div className="panelHead"><h2>Recent saved scans</h2><span>Latest {data.scans.length} · up to 50</span></div>
        {!data.scans.length && <div className="dashboardEmpty"><p>Your first saved scan will appear here.</p><button className="primary" onClick={() => go('scanner')}>Scan a message</button></div>}
        {data.scans.map(scan => <div className="historyRow" key={scan.id}><span className="typeIcon"><ScanSearch/></span><div><b>{scan.title}</b><p>{scan.type} · {scan.date} · Score {scan.score}/100</p></div><span className={`status ${scan.result?.prediction === 'Legitimate' ? 'low-risk' : 'suspicious'}`}>{scan.result?.prediction === 'Legitimate' ? 'Low risk' : scan.result?.prediction || scan.status}</span><button className="outline" onClick={() => setSelected(scan)}>View result</button></div>)}
      </section>}
    </>}
    {selected && <div className="modalShade"><section className="detailModal scanDetailModal" role="dialog" aria-modal="true" aria-label="Saved scan result"><button className="close" aria-label="Close saved result" onClick={() => setSelected(null)}><X/></button><h2>{selected.title}</h2>{selected.result ? <ScanResult result={selected.result} go={page => go(page, { sourceScanId: selected.id })}/> : <p>{selected.summary}</p>}</section></div>}
  </section>;
}

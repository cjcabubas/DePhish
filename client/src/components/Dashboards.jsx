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

function Activity({ stats }) {
  const total = stats.activity.reduce((sum, day) => sum + day.total, 0);
  const max = Math.max(1, ...stats.activity.map(day => day.total));
  return <section className="panel dashboardActivity"><div className="panelHead"><h2>Daily scan activity</h2><span>Last 30 days · UTC</span></div>
    <p><b>{number(total)}</b> scans saved during this period</p>
    {total > 0 ? <><div className="activityBars" role="img" aria-label={`${total} scans saved over the last 30 days. Daily counts are in the expandable table below.`}>{stats.activity.map(day => <div key={day.date} title={`${day.date}: ${day.total} scans`}><i style={{ height: `${day.total / max * 100}%` }}/></div>)}</div><div className="activityDates"><span>{stats.activity[0].date}</span><span>{stats.activity.at(-1).date}</span></div>
      <details className="analysisDetails"><summary>Daily counts</summary><div className="dashboardTableWrap"><table><thead><tr><th>Date (UTC)</th><th>Total</th><th>Phishing</th><th>Suspicious</th><th>Low risk</th></tr></thead><tbody>{stats.activity.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.total}</td><td>{day.phishing}</td><td>{day.suspicious}</td><td>{day.legitimate}</td></tr>)}</tbody></table></div></details></> : <p className="dashboardEmpty">No scans saved in the last 30 days.</p>}
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
      <div className="dashboardGrid"><Activity stats={stats}/><Breakdown stats={stats}/></div><div className="dashboardIndicatorPanel"><Indicators stats={stats}/></div>
      {admin ? <section className="panel dashboardReportNote"><h2>Community reports</h2><p>Report submission and review are still being developed. Report statistics will appear once real reports can be saved.</p></section> : <section className="panel historyPanel"><div className="panelHead"><h2>Recent saved scans</h2><span>Latest {data.scans.length} · up to 50</span></div>
        {!data.scans.length && <div className="dashboardEmpty"><p>Your first saved scan will appear here.</p><button className="primary" onClick={() => go('scanner')}>Scan a message</button></div>}
        {data.scans.map(scan => <div className="historyRow" key={scan.id}><span className="typeIcon"><ScanSearch/></span><div><b>{scan.title}</b><p>{scan.type} · {scan.date} · Score {scan.score}/100</p></div><span className={`status ${scan.result?.prediction === 'Legitimate' ? 'low-risk' : 'suspicious'}`}>{scan.result?.prediction === 'Legitimate' ? 'Low risk' : scan.result?.prediction || scan.status}</span><button className="outline" onClick={() => setSelected(scan)}>View result</button></div>)}
      </section>}
    </>}
    {selected && <div className="modalShade"><section className="detailModal scanDetailModal" role="dialog" aria-modal="true" aria-label="Saved scan result"><button className="close" aria-label="Close saved result" onClick={() => setSelected(null)}><X/></button><h2>{selected.title}</h2>{selected.result ? <ScanResult result={selected.result}/> : <p>{selected.summary}</p>}</section></div>}
  </section>;
}

export function ReportManagement() {
  return <section className="content"><div className="eyebrow"><span/>ADMIN REVIEW</div><h1>Report management</h1><section className="panel dashboardReportNote"><h2>Report review is in development</h2><p>There are no live report submission or review endpoints yet. Saved scan activity is available in the dashboard.</p></section></section>;
}

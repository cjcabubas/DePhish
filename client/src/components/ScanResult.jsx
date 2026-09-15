import React from 'react';
import { AlertTriangle, Flag, Link2 } from 'lucide-react';
import { LinkCheck } from './LinkCheck';

const percent = value => `${(value * 100).toFixed(1)}%`;
const groupNames = { word: 'Words and phrases', char: 'Character patterns', structured: 'Message and URL structure' };

function ModelDetails({ result }) {
  const explanation = result.model_explanation;
  if (!explanation?.available) return null;
  return <details className="analysisDetails modelDetails">
    <summary>How the model assessed this message</summary>
    <p>The message model estimates <b>{percent(result.probabilities.phishing)} phishing probability</b>.
      {' '}The final score also includes {result.link_risk?.points ?? 0} provisional link risk points.</p>
    {explanation.near_threshold && <p className="thresholdNote">The message estimate is {explanation.threshold_distance_points} percentage points from a classification boundary. A small change in wording may change its message classification.</p>}
    <div className="modelColumns">
      {[['toward_phishing', 'Patterns pushing toward phishing'], ['toward_legitimate', 'Patterns pushing toward legitimate']].map(([key, title]) => <section key={key}>
        <h4>{title}</h4>
        {explanation[key]?.length ? <ul className="modelTerms">{explanation[key].map(item => <li key={item.term}><span>{item.term}</span><code>{item.contribution > 0 ? '+' : ''}{item.contribution.toFixed(3)}</code></li>)}</ul> : <p>No prominent word patterns in this direction.</p>}
      </section>)}
    </div>
    <p>These selected word features describe the learned model’s margin, before probability calibration. Common function words are omitted from these lists. The values are not points added to your risk score. A familiar word pushing toward legitimate does not make a request safe.</p>
    <details className="analysisDetails technicalDetails"><summary>Feature contributions and model variation</summary>
      <dl className="analysisFacts">
        {explanation.feature_groups.map(group => <React.Fragment key={group.name}><dt>{groupNames[group.name] || group.name}</dt><dd>{group.contribution.toFixed(3)} margin units</dd></React.Fragment>)}
        <dt>Model baseline</dt><dd>{explanation.bias.toFixed(3)} margin units</dd>
        <dt>Total mean margin</dt><dd>{explanation.mean_margin.toFixed(3)}</dd>
        <dt>Calibration-fold estimates</dt><dd>{percent(explanation.fold_probability_range.min)}–{percent(explanation.fold_probability_range.max)}</dd>
        <dt>Message boundaries</dt><dd>Below 35%: low risk · 35–70%: suspicious · 70% and above: phishing</dd>
        <dt>Model / analysis version</dt><dd>{result.model_version} / {result.analysis_version}</dd>
      </dl>
      <p>The fold range compares the trained models’ estimates. It is not a statistical confidence interval. “Suspicious” is a score range, rather than a third trained class.</p>
    </details>
  </details>;
}

function Indicator({ item }) {
  return <div className="finding indicatorFinding"><span><AlertTriangle size={18}/></span><div>
    <div className="indicatorHeading"><b>{item.title}</b><span className={`evidenceSeverity ${item.severity}`}>{item.severity} concern</span></div>
    <p>{item.why_it_matters || item.description}</p>
    {item.evidence?.length > 0 ? <blockquote className="evidenceQuote">“{item.evidence[0].text}”</blockquote> : item.matched_terms?.length > 0 && <p className="matchedTerms">{item.matched_terms.map((term, index) => <mark key={index}>{term}</mark>)}</p>}
    {item.recommended_action && <p><b>Check:</b> {item.recommended_action}</p>}
    {(item.benign_context || item.evidence?.length > 0) && <details className="analysisDetails"><summary>Context and supporting evidence</summary>
      {item.benign_context && <p>{item.benign_context}</p>}
      {item.evidence?.map((evidence, index) => <div className="evidenceContext" key={index}><small>Passage {index + 1} · characters {evidence.start + 1}–{evidence.end}</small><p>{evidence.context}</p></div>)}
      <small>Concern describes the potential consequence of this pattern; it does not measure the model’s confidence or add risk points.</small>
    </details>}
  </div></div>;
}

function urlExplanation(url) {
  const reasons = [];
  if (url.is_ip) reasons.push('Uses an IP address instead of a named domain.');
  if (url.has_at_symbol) reasons.push('Text before @ is not the destination. Inspect the actual hostname.');
  if (url.is_shortener) reasons.push('Uses a shortener that hides the final destination.');
  if (url.is_suspicious_tld) reasons.push('The domain suffix is flagged by a heuristic; this alone does not establish fraud.');
  if (url.excessive_subdomains) reasons.push('Multiple subdomains can make the actual domain harder to recognize.');
  return reasons.join(' ') || 'The presence of a link does not establish whether it is safe or malicious.';
}

export function ScanResult({ result, go }) {
  const low = result.prediction === 'Legitimate', medium = result.prediction === 'Suspicious';
  const hasSensitiveRequest = result.detected_indicators.some(item => ['secret_disclosure', 'payment_redirection', 'remote_access', 'security_bypass'].includes(item.category));
  return <div className={`result ${low ? 'lowRisk' : medium ? 'mediumRisk' : 'highRisk'}`} aria-live="polite">
    <div className="riskHead"><div className="riskRing"><b>{result.risk_score}</b><small>/100</small></div>
      <div><span className="highpill">{result.risk_level}</span><h2>{low ? 'Low-risk message estimate' : medium ? 'Suspicious message detected' : 'Potential phishing detected'}</h2>
        <p>{low ? 'The scan estimates low risk. Verify unexpected requests for money or sensitive information independently.' : 'Review the evidence below and verify the request before interacting.'}</p>
      </div>{go && <button className="outline" onClick={() => go('report')}><Flag size={16}/> Report this</button>}
    </div>
    <div className="findings"><h3>Evidence and interpretation</h3>
      <p>Observed patterns explain what to investigate. Learned model patterns explain how the message was scored. Neither verifies the sender’s identity.</p>
      {low && hasSensitiveRequest && <p className="thresholdNote"><b>A sensitive request still needs verification.</b> The model estimate is low, but the message contains a request involving account secrets, payment, device access, or security protections. Review that evidence before acting.</p>}
      {result.detected_indicators.map((item, index) => <Indicator item={item} key={`${item.category}-${index}`}/>)}
      {!result.detected_indicators.length && <p>No supported social-engineering patterns matched. The model can still find risk from learned text patterns.</p>}
      {result.detected_urls.map((item, index) => <div className="finding" key={index}><span><Link2 size={18}/></span><div>
        <b>Link destination: {item.hostname}</b><p className="detectedUrl">{item.url}</p><p>{urlExplanation(item)}</p>
        <details className="analysisDetails"><summary>Domain, redirects, and connection evidence</summary>{result.link_checks?.some(check => check.url === item.url) ? <LinkCheck result={result.link_checks.find(check => check.url === item.url)}/> : <p>No live inspection was recorded for this link.</p>}</details>
      </div></div>)}
      {result.link_risk && <p className="scoreBreakdown"><b>Score breakdown:</b> message model {result.model_risk_score}/100 + link policy {result.link_risk.points} points = {result.risk_score}/100 (capped at 100).
        {' '}{result.link_risk.incomplete && 'Some link evidence was unavailable.'} {result.link_risk.skipped > 0 && `${result.link_risk.skipped} additional links were not inspected.`}</p>}
      <ModelDetails result={result}/>
      {result.persistence?.status === 'unavailable' && <p role="status">{result.persistence.reason}</p>}
      <div className="scanAdvice"><b>What to do next</b><p>{low ? 'Confirm unexpected requests in the official app or through a known contact.' : 'Avoid the message’s links and do not share passwords or OTPs. Open the official app yourself or contact the organization using a known number.'}</p>
        <details className="analysisDetails"><summary>What this scan can and cannot establish</summary>
          <p>The combined score is an assessment, not a probability or safety guarantee. Sender identity, attachment contents, and website reputation are not verified. Link weights are provisional. Filipino/Taglish accuracy is not validated.</p>
          {result.model_limitations?.length > 0 && <ul>{result.model_limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
        </details>
      </div>
    </div>
  </div>;
}

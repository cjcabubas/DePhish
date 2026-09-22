import React from 'react';
import { AlertTriangle, Flag, Link2 } from 'lucide-react';
import { LinkCheck } from './LinkCheck';
import { indicatorWording, assessmentWording } from '../services/riskWording';
import { linkCheckSummary } from '../services/linkWording';

const severityLabels = { high: 'Important warning', medium: 'Worth checking', low: 'Supporting clue' };

function Indicator({ item }) {
  const [title, explanation, action] = indicatorWording[item.category] || [item.title, item.why_it_matters || item.description, item.recommended_action];
  return <div className="finding indicatorFinding"><span><AlertTriangle size={18}/></span><div>
    <div className="indicatorHeading"><b>{title}</b><span className={`evidenceSeverity ${item.severity}`}>{severityLabels[item.severity] || 'Worth checking'}</span></div>
    <p>{explanation}</p>
    {item.evidence?.length > 0 ? <blockquote className="evidenceQuote">“{item.evidence[0].text}”</blockquote> : item.matched_terms?.length > 0 && <p className="matchedTerms">{item.matched_terms.map((term, index) => <mark key={index}>{term}</mark>)}</p>}
    {action && <p><b>What to do:</b> {action}</p>}
  </div></div>;
}

function linkSummary(url) {
  const reasons = [];
  if (url.is_ip) reasons.push('The address uses an IP number instead of a website name.');
  if (url.has_at_symbol) reasons.push('The website after @ is the real destination; the name before it can be misleading.');
  if (url.is_shortener) reasons.push('This shortened link hides the final website address.');
  if (url.is_suspicious_tld) reasons.push('The address ends in a domain suffix flagged by our rules. This is only a clue.');
  if (url.excessive_subdomains) reasons.push('The address has several parts before the main domain, which can make it harder to recognize.');
  return reasons.join(' ') || 'Check that this is the website you intended to visit. Finding a link does not prove it is unsafe.';
}

function TechnicalDetails({ result }) {
  const explanation = result.model_explanation;
  return <details className="analysisDetails modelDetails"><summary>Technical details</summary>
    {result.assessment && <><p>Policy: {result.assessment.policyVersion}. Model: {result.textAnalysis.modelVersion}. Message type: {result.messageType.type.replace('_', ' ')} ({result.messageType.basis.replaceAll('_', ' ')}).</p><p>{result.assessment.note}</p></>}
    {explanation?.available && <>
      <div className="modelColumns">{[['toward_phishing', 'Wording associated with phishing'], ['toward_legitimate', 'Wording associated with ordinary messages']].map(([key, title]) => <section key={key}><h4>{title}</h4><p>{explanation[key]?.map(item => item.term).join(', ') || 'No prominent words found.'}</p></section>)}</div>
    </>}
    {result.detected_indicators.filter(item => item.benign_context).length > 0 && <div><b>Context to consider</b><ul>{result.detected_indicators.filter(item => item.benign_context).map((item, index) => <li key={index}>{item.benign_context}</li>)}</ul></div>}
    {result.link_checks?.map((check, index) => <section key={index}><h4>Link check: {check.hostname || check.url}</h4><LinkCheck result={check}/></section>)}
  </details>;
}

export function ScanResult({ result, go }) {
  const low = result.prediction === 'Legitimate', medium = result.prediction === 'Suspicious';
  const [title, summary] = assessmentWording[result.prediction] || assessmentWording.Suspicious;
  const sensitive = result.detected_indicators.some(item => ['secret_disclosure', 'payment_redirection', 'remote_access', 'security_bypass'].includes(item.category));
  return <div className={`result ${low ? 'lowRisk' : medium ? 'mediumRisk' : 'highRisk'}`} aria-live="polite">
    <div className="riskHead"><div className="riskRing"><b>{result.risk_score}</b><small>/100</small></div><div><span className="highpill">{result.risk_level}</span><h2>{title}</h2><p>{summary}</p></div>{go && <button className="outline" onClick={() => go('report')}><Flag size={16}/> Report this</button>}</div>
    <div className="findings"><p>The combined risk score is a policy-based assessment, not a percentage chance of phishing. A scan cannot guarantee that a message is safe.</p>
      {result.assessment && <section className="analysisBreakdown" aria-label="Independent scan analyses">
        <div><b>Text model</b><strong>{(result.textAnalysis.phishingProbability * 100).toFixed(1)}%</strong><small>Estimated phishing probability from message content</small></div>
        <div><b>Link assessment</b><strong>+{result.assessment.components.urlPoints}</strong><small>Policy points · {result.urlAnalysis.checked} checked{result.urlAnalysis.status === 'partial' ? ' · incomplete evidence' : ''}</small></div>
        <div><b>Message indicators</b><strong>{result.indicatorAnalysis.status === 'complete' ? result.detected_indicators.length : 'Unavailable'}</strong><small>Observed patterns; no separate points added</small></div>
        <div><b>Detected content</b><strong>{result.entityAnalysis.emailsDetected} emails · {result.entityAnalysis.phonesDetected} phones</strong><small>{result.entityAnalysis.credentialsDetected ? 'Credential-related wording found; avoid sharing secrets.' : 'Identifiers are observations, not confirmed threats.'}</small></div>
      </section>}
      {result.indicatorAnalysis?.status === 'unavailable' && <p role="status">{result.indicatorAnalysis.reason}</p>}
      {result.explanation && <p>Score calculation: {result.assessment.components.modelScore} from the text model + {result.assessment.components.urlPoints} link policy points, capped at 100.</p>}
      {result.consent && <p>Consent recorded: version {result.consent.termsVersion} · {new Date(result.consent.acceptedAt).toLocaleString()}</p>}
      <h3>What the scan found</h3><p>These clues can appear in genuine messages too. Check them alongside the sender and the request.</p>
      {low && sensitive && <p className="thresholdNote"><b>Check this request even with a low score.</b> It involves account details, money, device access, or security settings.</p>}
      {result.detected_indicators.map((item, index) => <Indicator item={item} key={`${item.category}-${index}`}/>)}
      {!result.detected_indicators.length && result.indicatorAnalysis?.status !== 'unavailable' && <p>No specific warning phrases were found.</p>}
      {result.detected_urls.map((item, index) => {
        const check = result.link_checks?.find(check => check.url === item.url);
        return <div className="finding" key={index}><span><Link2 size={18}/></span><div><b>Website address: {item.hostname}</b><p className="detectedUrl">{item.url}</p><p>{linkSummary(item)}</p><p>{linkCheckSummary(check)}</p>{check?.risk?.factors.map(factor => <p key={factor.code}>{factor.explanation} (+{factor.points} points)</p>)}</div></div>;
      })}
      {result.link_risk?.skipped > 0 && <p>{result.link_risk.skipped} extra links were not checked.</p>}
      <div className="scanAdvice"><b>What to do next</b><p>{low ? 'If this message is unexpected, check it in the official app or contact the sender using a number you already trust.' : 'Do not use the message’s links or share passwords and verification codes. Open the official app yourself, or call the organization using a number you already trust.'}</p></div>
      <TechnicalDetails result={result}/>
      {result.persistence?.status === 'unavailable' && <p role="status">{result.persistence.reason}</p>}
      {result.identifier_registry?.status === 'saved' && <p role="status">{result.identifier_registry.count} minimized indicators recorded for review{result.identifier_registry.retentionDays ? ` for up to ${result.identifier_registry.retentionDays} days` : ''}. Their presence does not prove they are malicious.</p>}
      {result.dataRetention && <p>Saved reports redact recognized secrets and mask personal identifiers. Automatic redaction may miss sensitive information; remove it before scanning.</p>}
      {result.identifier_registry?.status === 'unavailable' && <p role="status">{result.identifier_registry.reason}</p>}
    </div>
  </div>;
}

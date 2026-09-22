import { normalizeInput, extractArtifacts, detectMessageType, analyzeEntities } from './artifactService.js';
import { analyzeUrls } from './urlAnalysisService.js';
import { evaluateRisk } from './riskService.js';
import { buildExplanation } from './explanationService.js';

export async function orchestrateScan(input, { classify, analyzeIndicators, inspect }) {
  const prepared = normalizeInput(input.text);
  const artifacts = extractArtifacts(prepared);
  const messageType = detectMessageType(prepared, artifacts, input.type);
  const [model, indicators, urls, entities] = await Promise.all([
    classify(prepared), analyzeIndicators(prepared, artifacts), analyzeUrls(artifacts, inspect), Promise.resolve(analyzeEntities(artifacts)),
  ]);
  const assessment = evaluateRisk({ model, indicators, urls, entities });
  const explanation = buildExplanation({ assessment, model, indicators, urls });
  const report = {
    textAnalysis: { status: 'complete', phishingProbability: model.probabilities.phishing,
      modelVersion: model.model_version, modelPrediction: model.prediction, confidence: model.confidence, learnedFeatures: model.model_explanation },
    indicatorAnalysis: indicators, urlAnalysis: urls, entityAnalysis: entities, assessment, explanation, messageType,
    // Compatibility fields keep existing history and dashboards readable.
    ...model, risk_score: assessment.overallRiskScore, prediction: assessment.classification, risk_level: assessment.riskLevel,
    model_risk_score: assessment.components.modelScore, model_prediction: model.prediction,
    scoring_version: assessment.policyVersion, detected_indicators: indicators.indicators, detected_urls: artifacts.urls,
    phishing_type: assessment.classification === 'Legitimate' ? 'Not established' : indicators.phishing_type,
    message_type: messageType.type, link_checks: urls.checks,
    link_risk: { points: urls.riskScore, checked: urls.checked, skipped: urls.skipped, incomplete: urls.incomplete, note: assessment.note },
    analysis_version: '2.0.0-independent-analyzers',
  };
  // Raw artifacts exist only inside this request; persistence applies its own policy.
  return { report, artifacts, prepared };
}

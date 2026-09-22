export function buildExplanation({ assessment, model, indicators, urls }) {
  return { summary: `${assessment.riskLevel} — ${assessment.overallRiskScore}/100 combined risk index.`,
    model: { phishingProbability: model.probabilities.phishing, learnedFeatures: model.model_explanation || { available: false } },
    observations: indicators.indicators.map(item => ({ category: item.category, title: item.title,
      evidence: item.evidence || [], why: item.why_it_matters || item.description, action: item.recommended_action })),
    scoreReasons: [{ source: 'model', points: assessment.components.modelScore, text: 'Text-model phishing probability expressed on a 0–100 scale.' },
      { source: 'urls', points: assessment.components.urlPoints, text: 'Highest inspected link score; repeated links do not multiply points.' }],
    limitations: [...(model.model_limitations || []), assessment.note, ...(indicators.status !== 'complete' ? [indicators.reason] : []),
      ...(urls.status !== 'complete' ? ['Some links or registration details could not be checked.'] : [])] };
}

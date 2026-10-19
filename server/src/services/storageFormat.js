// Storage omits compatibility aliases; API responses retain the established shape.
// Only remove an alias when its canonical source exists, preserving older reports.
const aliases = {
  risk_score: ["assessment", "overallRiskScore"],
  prediction: ["assessment", "classification"],
  risk_level: ["assessment", "riskLevel"],
  model_risk_score: ["assessment", "components", "modelScore"],
  scoring_version: ["assessment", "policyVersion"],
  model_prediction: ["textAnalysis", "modelPrediction"],
  model_version: ["textAnalysis", "modelVersion"],
  model_explanation: ["textAnalysis", "learnedFeatures"],
  confidence: ["textAnalysis", "confidence"],
  detected_indicators: ["indicatorAnalysis", "indicators"],
  link_checks: ["urlAnalysis", "checks"],
  message_type: ["messageType", "type"],
};
const at = (value, path) => path.reduce((node, key) => node?.[key], value);

export function storeAnalysis(value) {
  if (!value || typeof value !== "object") return value;
  const result = { ...value };
  for (const [key, path] of Object.entries(aliases)) {
    const canonical = at(value, path);
    // Preserve discrepant legacy values instead of silently discarding evidence.
    if (
      canonical !== undefined &&
      JSON.stringify(canonical) === JSON.stringify(value[key])
    )
      delete result[key];
  }
  return result;
}

export function readAnalysis(value) {
  if (!value || typeof value !== "object") return value;
  const result = { ...value };
  for (const [key, path] of Object.entries(aliases)) {
    const canonical = at(value, path);
    if (result[key] === undefined && canonical !== undefined)
      result[key] = canonical;
  }
  return result;
}

export function storeOwned(fields) {
  const stored = { ...fields };
  delete stored.submittedBy;
  delete stored.source;
  // Old scans without a consent reference retain their historical acknowledgement.
  if (fields.consentId) delete stored.tosAcknowledged;
  return stored;
}

export function readOwned(value, analysisField) {
  if (!value) return value;
  const row = value.toObject ? value.toObject() : { ...value };
  row.submittedBy = row.userId ? "user" : "guest";
  if (analysisField === "result") row.source = row.userId ? "account" : "guest";
  row[analysisField] = readAnalysis(row[analysisField]);
  return row;
}

export function storeReport(fields) {
  return {
    ...storeOwned(fields),
    analysis: storeAnalysis(fields.analysis),
    content: Object.fromEntries(
      Object.entries(fields.content || {}).filter(
        ([, value]) => value !== "" && value != null,
      ),
    ),
  };
}

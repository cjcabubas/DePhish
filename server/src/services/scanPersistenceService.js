import { createRedactor, retentionPolicy } from './retentionService.js';

export async function persistScan({ report, artifacts, prepared, user, consent, scans, identifiers, pseudonymizationKey }) {
  const policy = { ...retentionPolicy(report.prediction, Boolean(user)), identifierDays: 0, identifierExpiresAt: null,
    note: 'Scan history is stored separately. Only admin-verified community reports publish threat indicators.' };
  const redact = createRedactor(prepared, artifacts);
  const storedReport = redact({ ...report, dataRetention: policy });
  let persistence = { status: 'unavailable', reason: 'Scan completed, but the redacted report could not be saved.' };
  if (scans) {
    try {
      const saved = await scans.create({ userId: user ? String(user._id) : null, source: user ? 'account' : 'guest',
        message: redact(prepared.original).slice(0, 5000), title: redact(prepared.original.trim().split('\n')[0]).slice(0, 80),
        tosAcknowledged: true, consentId: consent._id, result: storedReport, expiresAt: policy.reportExpiresAt,
        retentionVersion: policy.version });
      persistence = { status: 'saved', id: String(saved._id), scope: user ? 'account' : 'guest', redacted: true };
    } catch { /* The assessment remains available if report storage fails. */ }
  }
  // Scanner observations never publish threat indicators. Admin report review owns that workflow.
  const registry = { status: 'not_applicable', count: 0 };
  return { persistence, identifier_registry: registry, dataRetention: policy };
}

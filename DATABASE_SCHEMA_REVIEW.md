# Database schema minimization review

Reviewed 19 October 2026. Scope: all 11 collections configured by the server at review time, including nested schemas, writers, readers, indexes, and frontend consumers. This is a source-code review, not an inspection of live MongoDB documents. Collection names below are defaults; scan collection naming is configurable. The assessment below describes the original schema; implementation notes follow at the end.

## Recommendation

Minimize duplication first. Most optional fields express real lifecycle states; removing them merely because some documents lack them would lose useful information. Nesting related fields makes a schema easier to understand but does not inherently reduce stored data. Avoid collapsing typed fields into a generic string or unvalidated metadata object.

Highest-value work:

1. Store one canonical analysis representation instead of both structured and compatibility copies.
2. Archive each distinct consent terms document once and reference it from consent events.
3. Remove redundant ownership labels and the scan consent boolean after migrating readers.
4. Stop persisting the unused OTP name; derive the MFA action from purpose.
5. Decide whether the legacy flagged identifier registry should be retired.

## Collection-by-collection assessment

| Collection | Evaluation | Recommended action |
| --- | --- | --- |
| `scan_reports` | Highest concentration of redundant fields. `userId` and `guestId` support ownership and claiming. `submittedBy` and `source` both track current ownership, while `originallySubmittedAsGuest` tracks origin. `tosAcknowledged` duplicates the linked consent event. `result` includes repeated analysis values. | Keep ownership IDs, consent reference, message, timestamps, expiry and policy provenance. Derive current ownership labels. Consolidate analysis. Remove the consent boolean only after validating/backfilling consent references. |
| `reports` | Optional content fields support different submission types; review fields exist only after review. Latest review fields duplicate part of `reviewLog`, but are convenient current-state data. | Keep structured content and candidates. Omit empty content strings at persistence time. Optionally group latest review into `review: { note, reviewerId, at, indicatorIds }`. Keep status, revision, unread and review history. Derive `submittedBy`. |
| `threat_indicators` | Already compact. `key` is the candidate hash; `kind` and `value` are used for grouping, filtering and display. `reportId` preserves provenance and supports retraction. | Keep the shape. `verifiedBy` duplicates reviewer information but provides useful direct attribution. Removing it offers little benefit. Keep expiry and the unique `(reportId, key)` index. |
| `scan_consents` | Repeats the entire terms text, effective date, version and hash for every acceptance. This is a much larger duplication than most nullable fields. | Introduce immutable `consent_terms` documents keyed by a content hash. Consent events reference the exact archived terms and retain identity plus acceptance time. Preserve existing evidence before removing repeated text. |
| `users` | Small and purposeful. Optional-in-schema fields have defaults and represent independent account states. | Keep name, email, password hash, role, MFA state, verification state and session version. No worthwhile collapse. |
| `emailotps` | Purpose-specific fields are reasonable, but stored `name` is not read back. `action` duplicates whether purpose is `mfa_enable` or `mfa_disable`. | Remove persisted `name`; retain the request-time name for email rendering. Derive action from purpose and retain user binding. Keep both hashes, counters and all four timing fields. |
| `passwordresetgrants` | Already small. Email is both the upsert key and part of token lookup; user ID identifies the account to update. | Keep. Removing email requires changing the token lookup contract for marginal savings. Keep token hash and TTL. |
| `learning_progress` | Stores quiz attempts plus derived section `bestScore` and `passed`. Attempt-level `passed` is also derived from score under the current threshold. | Choose one authoritative representation. Prefer computing summaries on the server from attempts, or deliberately retaining server-maintained summaries if attempts will be capped. Preserve completion time for badges. |
| `flagged_identifiers` | Current scan persistence explicitly does not write scanner observations. Repository creation, indexes, legacy listing endpoint and tests remain. | Candidate for retiring the entire legacy feature, subject to checking live data and external endpoint users. Do not merge automatically with admin-verified indicators: their trust and provenance differ. |
| `guest_identities` | Optional user ID and claim time represent unclaimed/claimed states. Revision is deliberately incremented to serialize guest submissions and claiming in transactions. | Keep IDs and revision. `claimedAt` is useful provenance despite lacking a current display reader. No worthwhile field collapse. Consider lifecycle cleanup separately, preserving account binding for valid guest cookies. |
| `sessions` | Managed by `connect-mongo`; application session data includes user ID and auth version. | Keep the library-managed format and expiry. Auth version invalidates sessions when account security settings change. |

Sources: `server/src/models/*.js`, `server/src/services/ownershipService.js`, `server/src/server.js`, and their services/routes/controllers and frontend consumers.

## Detailed decisions

### 1. Scan and community analysis: remove duplicate storage, preserve compatibility

`server/src/services/scanOrchestrator.js` creates both structured analyzer outputs and flat compatibility fields. Both scan persistence and community report preparation store this report object.

| Stored flat value | Canonical structured source |
| --- | --- |
| `risk_score` | `assessment.overallRiskScore` |
| `prediction` | `assessment.classification` |
| `risk_level` | `assessment.riskLevel` |
| `model_risk_score` | `assessment.components.modelScore` |
| `model_prediction` | `textAnalysis.modelPrediction` |
| `model_version` | `textAnalysis.modelVersion` |
| `model_explanation` | `textAnalysis.learnedFeatures` |
| `confidence` | `textAnalysis.confidence` |
| `scoring_version` | `assessment.policyVersion` |
| `detected_indicators` | `indicatorAnalysis.indicators` |
| `link_checks` | `urlAnalysis.checks` |
| `message_type` | `messageType.type` |

Some fields need explicit reconstruction rules: `phishing_type` is overridden for legitimate results, and `link_risk` combines URL results with an assessment note. Do not delete all flat fields indiscriminately. `detected_urls` is extracted input evidence and is not automatically equivalent to URL check results. Inspect every field supplied by the `...model` spread before restricting persistence.

Keep the model score and final assessment score as separate concepts: the final score incorporates other signals. They are not interchangeable.

The history/dashboard aggregation currently queries `result.prediction` and `result.detected_indicators`; `Reports.jsx` and `ScanResult.jsx` also read compatibility fields. Add a canonical storage format and a response adapter, update aggregation paths, and support old documents during migration. A shared typed analysis schema plus a storage schema version would make this clearer than the current unrestricted `Mixed` objects.

Scan `expiresAt` and `retentionVersion` also overlap `result.dataRetention.reportExpiresAt` and `.version`. Keep the indexed top-level expiry and policy version authoritative; build presentation metadata from them where possible. Preserve historical policy meaning through a versioned policy definition rather than substituting whatever the current policy says.

### 2. Ownership: simplify without losing origin

For new records, current ownership is derivable from `userId`; `guestId` remains on originally guest-created documents after claiming. The current writers maintain several representations of the same state:

- `submittedBy`: guest/user current ownership.
- Scan `source`: guest/account current ownership; claiming rewrites it.
- `originallySubmittedAsGuest`: immutable-in-intent origin flag.

Recommended initial representation: keep `userId`, `guestId`, and `originallySubmittedAsGuest`; derive `submittedBy` and scan `source` in API responses. This removes two scan fields and one report field without relying on historical guest IDs always being populated. Only remove the origin boolean later if live data proves `guestId` is a reliable origin marker and future retention will preserve that meaning.

Do not replace both ownership IDs with a single polymorphic ID as a quick cleanup. Current indexes, authorization, claiming and late-arriving guest submissions depend on the distinction. The admin scan statistics filter also depends on `source`; migrate that query explicitly.

### 3. Consent: normalize the repeated document

Proposed structure:

```text
consent_terms: { _id: contentHash, version, effectiveDate, text }
scan_consents: { _id, userId?, guestId?, acceptedAt, termsId }
```

This is a proposed new collection, not an existing one. Populate it with each exact historical text, verify its hash, and retain immutable referenced records. A reference to only today's JavaScript constant would lose historical evidence. Keep terms records for at least as long as referencing consent events.

`accepted` is always true in the current schema, so event existence could encode acceptance. `source` is also derivable if consent identity is complete. Removing these is lower priority than deduplicating terms text; retain them if explicitly recording the event improves audit readability. Consent identities must remain tied to who accepted at the time, rather than being rewritten when a guest claims history.

For scans, `tosAcknowledged` is written as true and has no current runtime reader found. Its removal is reasonable once every applicable record has a valid `consentId`. Do not manufacture missing historical consent.

### 4. Community reports: group review state; retain typed evidence

The optional `message`, `suspiciousUrl`, `senderEmail`, `phone`, and `details` are not redundant. They distinguish designated sender information from extracted content and reporter commentary. `reportService.js` uses these distinctions for candidate provenance and validation. Combining them into one text field would require guessing those distinctions later.

`validateReportInput` currently fills absent content with empty strings. Keep that convenient request representation if needed, but omit empty strings in the stored document and supply defaults when reading.

Latest review fields can be nested for readability, but nesting alone saves little space. Keeping a current review snapshot plus the bounded 50-entry log is defensible: one represents current state, the other past decisions. Alternatively derive the latest review from the last log entry after validating historical completeness. Keep `status` queryable, `revision` for concurrent review/read protection, and `unread` for notifications; these are independent state.

Keep `sourceScanId` optional: manually submitted reports have no originating scan. Do not replace report content/analysis with only a scan reference; reports can be analyzed independently and source scans can expire. Keep candidate `source`, which the review UI displays, and stable candidate IDs used for approval selection.

### 5. OTPs: two useful removals, several essential distinctions

`emailOtpService.js` stores `name` during issuance but uses the local name variable to send mail. Registration uses the submitted registration name, not the saved OTP name. Removing the stored copy does not require removing email personalization.

`action` can be removed after changing MFA confirmation to validate purpose and user identity. It is currently read, so schema-only deletion would break MFA setting confirmation.

Do not merge:

- `codeExpiresAt` (five-minute code validity) and `expiresAt` (one-hour record retention supporting throttling).
- `lastSentAt` (resend cooldown) and `windowStartedAt` (hourly request window).
- `requestCount` (issuance limit) and `attempts` (verification limit).
- `codeHash` (code verification) and `challengeHash` (MFA login challenge binding).

Hash fields are legitimately absent after consumption, while throttling state remains. `userId` and `challengeHash` should be validated by purpose/lifecycle rather than made universally required.

### 6. Learning progress: centralize derived state

`Learn.jsx` calculates section `bestScore` and `passed` from attempts using a 75% pass threshold. It reads both summary fields, and completion logic also inspects attempt scores. The backend currently validates shape and saves submitted summaries; it does not reconcile contradictions.

Prefer server-derived summaries so attempts and completion state cannot silently disagree. Attempt-level `passed` can be derived under the current fixed threshold; if grading rules will change, preserve a grading policy version or historical pass outcome. Keep `completedAt`, which supplies certificate/badge dates, and retain `startedAt` if tracking course duration matters.

If retaining only a recent attempt window, preserve the all-time best score and historical completion separately. Do not truncate attempts and then recompute all-time progress from the truncated data.

### 7. Legacy registry and generic cleanup

`persistScan` sets identifier retention to zero and returns `identifier_registry: { status: "not_applicable", count: 0 }`; no current application caller of the identifier repository's `record()` was found. The `/api/scans/admin/identifiers` reader remains. This is a stronger candidate for feature retirement than reorganizing its optional evidence fields. Check existing records and consumers before removing that endpoint or collection.

If retained, model and final risk scores in `lastEvidence` should remain distinct, and `key` cannot be replaced by masked `value`: different original contacts can share a masked display value.

Do not globally remove timestamps or `__v` merely to reduce column count. There is no direct application use of `__v` identified, but versioning behavior should be checked per write path. Savings from these small fields are likely secondary to repeated analysis and terms text; no live size measurements were made.

## Implementation order and verification

1. Measure live field presence, null/empty rates, document sizes and historical inconsistencies using read-only aggregate statistics; do not export sensitive contents. Confirm actual collection names and any external writers/readers.
2. Remove OTP name persistence, migrate MFA action reads, and omit empty report content on write with compatible readers.
3. Add canonical analysis serialization and compatibility adapters; migrate dashboard queries and existing documents in bounded batches.
4. Normalize consent terms with verified references; then remove redundant scan consent and ownership labels.
5. Decide legacy registry retirement and learning-history policy separately.

Before destructive migration, preserve a recoverable backup and verify record counts, ownership invariants, analysis equivalence, consent hash matches and expiry semantics. Preserve existing TTL behavior, including non-expiring account scans and expiring guest scans; claiming currently does not reset expiry.

Relevant checks: scan persistence, dashboard, consent, report, OTP, learning and ownership tests; MongoDB integration suites for indexes, transactions and claiming, plus focused storage-format and migration tests.

## Implemented cleanup

New writes now omit equivalent analysis aliases at the repository boundary. Readers reconstruct the established API fields; dashboard aggregation accepts both formats. Non-equivalent historical aliases and unique analyzer evidence are preserved. Storage is reduced without a frontend contract change.

Scan/report writes omit redundant current-ownership labels; scan writes with consent references omit the acknowledgement boolean. Guest-origin flags, IDs, expiry and policy information remain. Empty report content strings are omitted. Consent events reference an immutable, hash-verified `consent_terms` archive; repository reads support both archived and inline historical terms. The acceptance flag and acceptance-time identity remain explicit.

OTP issuance no longer stores names or the redundant MFA action. Email personalization still uses the request-time name; MFA confirmation checks purpose and account binding. Quiz summaries are derived from attempts by the server and omitted from storage when reconstructible; summary-only legacy records are preserved by the migration. Completion timestamps remain intact. The client still reports quiz scores; this change is not a server-side grading implementation.

Current review snapshots and logs remain separate, and the legacy identifier endpoint remains available. The review found no compelling storage benefit in regrouping review fields or evidence that existing registry consumers could be removed safely. Small retention metadata duplicates and non-identical analysis fields remain intentionally preserved.

### Existing-data migration

Deploy the compatible readers before rewriting existing records. New writes benefit immediately; existing documents remain readable without migration. Do not roll back to old readers after applying the migration unless restoring the corresponding database backup.

From the repository root, using the configured database:

```powershell
node server/scripts/minimizeSchema.js --dry-run
# After a recoverable backup and review of the dry-run counts:
node server/scripts/minimizeSchema.js --apply
```

The default is also a dry run. It reads in batches, logs counts only, and does not compile database models or create collections. Apply uses compare-and-swap guards to skip concurrent updates and is repeatable. Consent text is archived and verified before removing its inline copy. Incomplete or hash-invalid consent events are retained and counted; conflicting archive metadata stops the operation rather than replacing historical evidence. Missing consent references preserve scan acknowledgement flags. No collections are dropped by the migration.

The local environment credentials were subsequently updated and verified. All five database integration tests now pass against Atlas using isolated temporary collections/databases. The migration test uses a shorter temporary database name compatible with Atlas and always disconnects even if cleanup fails.

On 19 October 2026, after creating a backup and successfully restoring its 212 documents across 12 collections into a temporary local database, the authorized migration was applied to Atlas. It updated 35 scans, 13 reports, 6 learning records and 90 consent events (144 records total), with zero conflicts and zero invalid consent hashes. A subsequent read-only preview found zero remaining eligible records in every migration category. The verified pre-migration archive remains in Downloads as `dephish-before-minimization.archive.gz` with a SHA-256 checksum file.

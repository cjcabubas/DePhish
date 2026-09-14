# Model v2 and live link inspection

## Model change

The active artifact is `ML/models/phishing_pipeline_v2.pkl`, selected by `ML/models/metadata.json`. It contains word bigrams, character 3-5 grams, scaled structured features, and three calibrated Linear SVM pipelines. Each fold fits its own vocabulary/scaler; normalized templates stay in one fold. Unicode and common defanged URLs are normalized consistently at training and inference.

The original `phishing_model.pkl`, `tfidf_vectorizer.pkl`, and `metadata-v1.json` remain available. `PhishingDetector(use_legacy=True)` explicitly loads v1. To restore v1 service behavior, restore the contents of `metadata-v1.json` to `metadata.json` and restart the ML service. Do not delete v2 to roll back.

### Existing test-set comparison

| Metric | V1 | V2 |
| --- | --- | --- |
| Binary F1 (0.50 cutoff) | 96.76% | 98.15% |
| Warning recall (0.35 cutoff) | 97.49% | 98.40% |
| Warning false positives | 65 | 32 |
| Positive labels below warning cutoff | 36 | 23 |
| Brier score (lower is better) | 0.01719 | 0.00990 |

Evaluation uses the existing 4,535 messages. The 4,423-message subset without normalized training-template matches also improves in binary F1 (96.72% to 98.14%). Labels may conflate spam and phishing; this is not a new independent field benchmark. Email high-risk false positives increased from 5 to 8 while SMS high-risk false positives decreased from 5 to 2; the aggregate is unchanged. Thresholds and hyperparameters were not tuned against the test set.

Language limitation: on 12 synthetic development probes, v2 catches 2/6 scam examples versus v1's 4/6, with 0/6 benign false alarms versus 1/6. Filipino/Taglish accuracy is not established, and the regression requires reviewed language data before claiming multilingual support. These probes were not used for training.

Run `python ML/src/training/upgrade_model.py` with local training/test CSVs to generate a candidate and comparison under ignored `ML/reports/model_upgrade/`. Candidate generation does not automatically replace the active model. `evaluate.py` evaluates the active version; `audit_scanner.py` deliberately preserves the original v1 scoring audit.

## Live link inspection

`POST /api/links/check` on the Express service accepts `{ "url": "https://example.com" }`. It works without Atlas or API keys. The Email/SMS scanner automatically inspects links extracted from the message field, including a URL-only message. There is no separate link input or inspection button. Vite proxies `/api/links` to the same Express target as authentication (port 5000 by default).

Checks include:

- Domain registration date, calculated age, expiry, registrar, available registrant name, and nameservers using the [IANA RDAP bootstrap](https://www.iana.org/assignments/rdap-dns).
- Live DNS resolution and HTTP HEAD status for the submitted URL.
- Up to three redirects, revalidating each destination.
- TLS chain/hostname validation, issuer, certificate validity period, and fingerprint for each successful HTTPS hop, using [Node TLS](https://nodejs.org/api/tls.html).

The registration record applies to the submitted hostname's registrable domain, not a particular page or redirected domain. The registrant can be redacted or a privacy service; it is not proof of who created a website. Missing RDAP and unsupported HEAD requests remain explicit incomplete/unknown results. Unreachable destinations receive a small provisional risk contribution, as described below. A valid certificate and an old domain do not establish safety. No scripts are run, page bodies downloaded, or malware/reputation feeds consulted.

Public lookups occur when the user submits a message scan. The destination receives the submitted URL path/query through a HEAD request; the registry receives only the registrable domain. Requests contain no browser cookies or account credentials. Embedded URL credentials, non-HTTP schemes, custom ports, private/reserved DNS answers, HTTPS downgrades, and unsafe redirects are blocked. DNS is pinned to a validated public address per connection. Requests have deadlines and size limits; link checks have per-IP and concurrency limits. Multi-instance deployments need shared rate limits and should also enforce outbound network restrictions.

Run Express from `server/` with `npm start`; outbound DNS/HTTPS access is required. Restart Vite after proxy changes and the ML service after model changes. No secret values are required for these checks.

## Integrated scan decision
The frontend now calls POST /api/scans/analyze on Express, which obtains the ML result and automatically inspects up to three unique links. No separate inspection action is needed. Provisional policy points: domain age under 30 days +20, under 180 days +10; invalid TLS +20; HTTPS downgrade +15; HTTP +5. The strongest link contributes at most 40 points, added to the message score and capped at 100. These weights are not calibrated probabilities or benchmarked model improvements. Unreachable destinations and HTTP 404/410/5xx errors add 5 provisional points. Missing registry records and internal inspection failures add zero and are disclosed; old domains and valid TLS never reduce risk. Original model score, probabilities, and confidence remain separate. Run both Express and ML; Atlas is not required. ML_API_URL on the server defaults to http://127.0.0.1:8000. VITE_SCAN_API_URL optionally selects the Express origin; same-origin Vite proxy is the default.

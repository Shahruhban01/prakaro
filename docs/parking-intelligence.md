# Parking Intelligence · Milestone 12A

Milestone 12B extends this shadow foundation with [controlled discovery and review](intelligence-rollout.md) and a [reproducible evaluation report](intelligence-evaluation.md). Display and filtering default to off.

The Fastify parking service hands up to 20 nearby candidates to a background observer. The existing Places API (New) client, parking DTO, filters, distance sort and provider-backed opening status still drive discovery. The observer has no public route or control over the response, saved parking, official verification or Flutter. It runs on nearby discovery requests and has no task backlog.

## Rules and verification states

The rules return named outcomes and reasons. A reviewed independent operator, authority or Prakaro audit record can establish facility identity. Provider category mismatches and repeated IDs indicate suspicion. Parking options may describe an amenity and closure refers to operations. Names play no role. Duplicate identity and facility authenticity are separate questions.

| Attribute                       | States                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Facility                        | `LIKELY_PARKING`, `LIKELY_NOT_PARKING`, `UNCERTAIN`, `INSUFFICIENT_EVIDENCE` |
| Access                          | `PUBLIC`, `PRIVATE`, `CUSTOMERS_ONLY`, `RESTRICTED`, `UNKNOWN`               |
| Pricing                         | `FREE`, `PAID`, `UNKNOWN`                                                    |
| Published operating information | `PUBLISHED_HOURS_AVAILABLE`, `NO_PUBLISHED_HOURS`, `UNKNOWN`                 |

Contradictory evidence triggers review and conflicting attributes stay unknown. Private, restricted and customer-only facilities can be genuine. `NO_PUBLISHED_HOURS` requires an explicit reviewed finding. Current opening status remains in the existing discovery DTO and comes from supported provider status.

## Pipeline and Gemini contract

1. Observe primary category, types, business status, parking-option presence and duplicate IDs in memory. Aggregate process counters exclude listing IDs and individual outcomes.
2. If Gemini is enabled and configured, match Place IDs to reviewer-maintained links in MySQL. Consider undecided cases with approved, unexpired facility observations and limit work to two cases per batch. Authoritative determinations and known conflicts bypass Gemini.
3. The official Node.js SDK `@google/genai` calls the Gemini Developer API at Google's fixed endpoint using `responseJsonSchema`. The `parking-verification-v1` instruction requires evidence-based explanations, distinguishes access from authenticity and instructs the model to abstain on weak or conflicting evidence. The request attaches no tools or media.
4. Strict Zod schemas validate the projected input and the response. The response includes classification, confidence estimate, access, pricing, operating information, cited evidence IDs, reason, missing evidence and a review flag. Controlled reason and missing-evidence values prevent generated URLs, claims of source visits and invented specifics.
5. The backend validates citation membership and checks the support for claims. A parking promotion requires independently observed marked bays and a dedicated parking entrance. A non-parking conclusion requires an observed non-parking business and an onsite check that found no parking, plus human review. The backend preserves deterministic attributes. Confidence is an uncalibrated estimate. Failures fall back to rules.

Version changes to the prompt or policy when they affect comparisons. Record model, prompt and dataset versions. Google lists the requested model with restricted availability for projects with prior usage. Confirm access for the intended project before enabling Gemini. [Model reference](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Google Gen AI SDK](https://github.com/googleapis/js-genai).

## Data-use review

Reviewed 22 November 2026. The published Maps terms and Places policy restrict exporting, caching and creating content from Maps data. The separate Maps Grounding Lite exception applies to that specific product and did not establish permission to forward raw Places (New) fields or photos to Gemini Developer API for this workflow. The billing account's territorial and contractual terms govern the deployment. [Maps Platform terms](https://cloud.google.com/maps-platform/terms), [Maps Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), [EEA terms](https://cloud.google.com/terms/maps-platform/eea), [EEA Service Specific Terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms), [Places API policy](https://developers.google.com/maps/documentation/places/web-service/policies).

| Data                                                                                             | Use in 12A                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Place ID                                                                                  | Optional MySQL lookup key for a manually linked independent case. It is also used in memory to detect repeated results.                                                                                               |
| Google primary type, types, business status and presence of parking options                      | Transient rules in discovery. Per-place rule outcomes and provider category data are excluded from Gemini and storage.                                                                                                |
| Google names, addresses, coordinates, hours, descriptions, reviews, photos and all other content | Outside the intelligence prompts, labels and storage. Existing Places display and photo handling remain in their original pipeline.                                                                                   |
| Prakaro audits, verified operator records and public authority records                           | A trusted reviewer verifies candidate identity, provenance, freshness and permission to process the facts with Gemini. The request carries only a source enum, a finding enum and a request-local alias such as `E1`. |
| Independent evidence references and human labels                                                 | Stored in authorized reviewer records or a private evaluation file. References, URLs, reviewer details, arbitrary text and ground-truth labels stay outside the model request.                                        |
| User location, identity or credentials                                                           | Excluded from intelligence prompts, storage and logs.                                                                                                                                                                 |

Unpaid Gemini service generally permits use of submissions for Google product improvement, including possible human review. Paid Gemini service has different data handling under its Data Processing Addendum and retains data for limited purposes such as abuse detection and legal obligations. Confirm the applicable terms, region and billing project before enabling transmission. A Google AI Pro subscription provides no independent authorization to transfer Maps content. Use Prakaro-owned observations or express permission when independent source rights are uncertain. [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms).

The nearby field mask now includes `places.primaryType` and `places.types`. Both fields are Pro, and the same request already includes the Enterprise + Atmosphere `places.parkingOptions` field. The discovery DTO and request count are unchanged. [Nearby Search field pricing](https://developers.google.com/maps/documentation/places/web-service/nearby-search).

## Configuration and safeguards

| Server variable              | Default                 |
| ---------------------------- | ----------------------- |
| `GEMINI_API_KEY`             | Empty                   |
| `GEMINI_MODEL`               | `gemini-2.5-flash-lite` |
| `AI_VERIFICATION_ENABLED`    | `false`                 |
| `AI_SHADOW_MODE`             | `true`                  |
| `AI_MAX_CALLS_PER_DAY`       | `50`                    |
| `AI_MAX_CONCURRENT_REQUESTS` | `2` per process         |
| `AI_REQUEST_TIMEOUT_MS`      | `4000` per attempt      |

Keep the Gemini key on the API server. Both flags must be true for model calls. Turning shadow mode off disables the observer and model calls. The existing Fastify rate limiter governs public routes. The observer allows one batch in flight per process and skips incoming batches while busy. The same independently reviewed case, findings, model and prompt are claimed once per UTC day across replicas sharing MySQL. A process interrupted after claiming can pick up the case on a later UTC day.

The MySQL budget reserves one unit per outbound attempt, including retries, across processes on the same schema. Use the same daily limit for replicas and evaluation jobs that share the budget. Concurrency and the 60-second cooldown after HTTP 429 are local to each service process. SDK retries are disabled. Explicit transient 5xx responses permit one retry after 200 ms. Timeouts and quota exhaustion fall back to rules. A budget-store failure prevents the outbound request. These limits are application settings. A locally timed-out request may still be billed by Google.

## MySQL and reviewer workflow

The existing Prisma schema adds reviewer-managed case links, independent evidence references, human-reviewed labels, prompt/model versions, minimal runs, evaluation aggregates and the shared budget. The repository uses schema push without a migration baseline. Apply with the existing development `npm --prefix apps/api run db:push` workflow or a reviewed additive deployment migration for a managed database, then run `npm --prefix apps/api run db:generate`.

Use a trusted DBA workflow to populate case and evidence rows. Set `reference` to a verifiable independent record identifier or approved source URL, `approvedAt` after review and `expiresAt` based on the source's freshness and retention policy. Revoke approval or expire a record to stop using it. More than twelve approved findings require manual reconciliation. Keep the review labels separate from model observations. Run storage contains the independent outcome, status, version, timestamps, fingerprint, attempts, latency and token totals. It contains no raw prompts, raw model output or Google-derived classifications.

## Human evaluation

Start with the [empty dataset template](parking-intelligence-evaluation.template.json). Build a private, versioned corpus of 100–200 reviewed cases covering public, paid, free, private and customer-only parking, vehicle repair, transport companies, categorization errors, duplicates and uncertainty. Label only from independent evidence. For duplicates, document the relationship and label the facility by its actual function. Reconcile disagreements and freeze a held-out set before comparison.

| Case field                                                            | Reviewer entry                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `scenario`                                                      | Opaque case ID and one of `PUBLIC_PARKING`, `PAID_PARKING`, `FREE_PARKING`, `PRIVATE_PARKING`, `CUSTOMER_ONLY`, `VEHICLE_REPAIR`, `TRANSPORT_COMPANY`, `INCORRECT_CATEGORY`, `DUPLICATE`, `UNCERTAIN` |
| `observations`                                                        | Up to twelve approved objects with `source`, `finding` and `reference` available at prediction time. The source and finding vocabulary is in the intelligence schema.                                 |
| `review.reviewedOn`, `review.decision`                                | ISO date and `CONFIRMED` or `ABSTAINED`                                                                                                                                                               |
| `review.classification`, `review.access`, `review.pricing`            | Independently established labels using the states above                                                                                                                                               |
| `review.evidenceReferences`, `review.pricingEvidence`, `review.notes` | References supporting the label, pricing reference or null, and rationale                                                                                                                             |

```powershell
npm --prefix apps/api run intelligence:evaluate -- E:/path/to/reviewed.json
npm --prefix apps/api run intelligence:evaluate -- E:/path/to/reviewed.json --gemini --input-usd-per-million 0.10 --output-usd-per-million 0.40
```

The first command runs the independent rules baseline offline. The second adds Gemini for eligible cases and requires both flags, an authorized key and MySQL. Add `--persist` to save aggregate metrics. The example uses the published standard paid text rates at review time. Use rates for the active model and plan. Token-based estimates mark partial usage where attempts lack token counts. [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite).

The combined arm uses the same cases and includes fallbacks. Status counts describe AI coverage. Performance rates require 100 reviewed cases, including 20 or more confirmed cases in each binary class. Parking is the positive class. Recall counts genuine abstentions as missed positives. The false-negative rate counts explicit non-parking errors on genuine facilities, and the report counts genuine abstentions separately. The report also covers precision, false-positive rate, uncertainty, human review, calls per case, latency, tokens and estimated cost. Cases with inconclusive ground truth contribute to coverage and review. Synthetic automated fixtures establish behavior only. The repository contains no real labeled corpus.

## Future activation

Keep verification observational until evidence rights, project model access and shadow coverage are confirmed. Evaluate false negatives and abstentions on held-out cases, test cost and quota behavior under the intended replica count, and establish authorized review and reversal workflows before changing any user-facing behavior.

## Local pilot on an Android device

Use the dedicated development profile to see verification in discovery. From the repository root, run the following with the API development database available. The profile reads credentials from the API environment, refuses production mode, binds to loopback port 3121, enables shadow evaluation, verification display and user-selected filtering, and starts in All Candidates with human review required. The ordinary API startup and production defaults are unchanged.

```powershell
npm --prefix apps/api run dev:intelligence
adb reverse tcp:3121 tcp:3121
cd apps/mobile
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3121
```

Run the Android commands in a second terminal. With multiple ADB transports, use `adb -s <transport> reverse tcp:3121 tcp:3121` and `flutter run -d <transport>`. Repeat the reverse after reconnecting the phone. For a standalone debug install, use `flutter build apk --debug --dart-define=API_BASE_URL=http://127.0.0.1:3121` and `adb install -r build/app/outputs/flutter-apk/app-debug.apk`. The ordinary mobile build may target a different host. Keep the development server running while testing.

Enter `diagnostics` in the development server terminal to print the effective settings and refresh a local HTML snapshot. No diagnostics route or model proxy is exposed. Daily requests are shared MySQL reservations in UTC. Evaluated cases count distinct completed cases. Verified and unconfirmed counts cover the most recent discovery batch before user filters. Null means no observation or a database read failure. Successful/error times use the latest retained run or this process's explicit smoke test. The synthetic test creates no facility, review, or evaluation label. Append `-- --smoke` to the startup command to request one budgeted synthetic evaluation using the configured model. Normal startup performs no synthetic generation.

### First 20–30 independently reviewed cases

1. A reviewer creates a private copy of the [evaluation template](parking-intelligence-evaluation.template.json). Assign each facility an opaque internal ID. Select a mix of public, private, customer-only, closed and ambiguous candidates, plus potential duplicates and non-parking businesses. Preserve ambiguous cases.
2. Record only observations you have permission to use. Suitable sources include a Prakaro field audit or operator information authorized for this purpose. Record a controlled finding and a reference to the permissioned material. Keep source documents private. Avoid provider descriptions, photos, search coordinates or copied listings.
3. Have a second reviewer establish facility existence, access and price separately using independent evidence. Record the review date, decision, reasoning and evidence references. Use UNKNOWN for unsupported attributes and ABSTAINED when identity cannot be established. Freeze prediction-time observations before adjudication.
4. Use the [authorized review CLI](intelligence-rollout.md) for cases that should appear in development discovery. The offline evaluation file alone has no effect on a listing. Store the identity link, independent observations, review expiry and decision using the existing workflow.
5. Run the [evaluation commands](intelligence-evaluation.md). Each task reports observed correct, incorrect, false-positive, false-negative and uncertain counts for known ground truth. The assisted arm requires at least one accepted model response. Report actual model coverage alongside its results. Accuracy rates remain withheld for insufficient cohorts. Review genuine facilities that were missed before expanding to the 100–200-case evaluation.

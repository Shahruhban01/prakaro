# Parking Intelligence evaluation · Milestone 12B

**Rollout decision — insufficient evidence for production filtering.**

| Report field | Value |
| --- | --- |
| Evaluation date | 22 November 2026 |
| Dataset | `reviewed-parking-v1`, empty reviewer template |
| Human-reviewed cases | 0 |
| Ground-truth distribution | 0 genuine parking, 0 non-parking, 0 uncertain, 0 insufficient evidence |
| Configured model | `gemini-2.5-flash-lite` |
| Prompt version | `parking-verification-v1` |
| Rules version | `parking-rules-v1` |
| Policy version | `parking-display-v1` |
| Gemini calls in report | 0 |

The confusion matrices, precision, recall, false-positive and false-negative rates, uncertainty, review rate, verified coverage and misclassified examples are unavailable for this dataset. The CLI reports them as null where the cohort is insufficient. Synthetic regression tests do not enter the corpus.

The configured Gemini key returned HTTP 200 from the read-only metadata endpoint for `gemini-2.5-flash-lite`, with `generateContent` listed as supported. The evaluation sent no generation requests. [Gemini Models API](https://ai.google.dev/api/models)

## Reproduce or import reviewed data

```powershell
npm --prefix apps/api run intelligence:evaluate -- ../../docs/parking-intelligence-evaluation.template.json --as-of 2026-11-22
npm --prefix apps/api run intelligence:evaluate -- E:/private/reviewed.json --as-of 2026-11-22
```

Copy the [empty template](parking-intelligence-evaluation.template.json) into an authorized location and fill in independently reviewed cases using the [12A reviewer fields](parking-intelligence.md). Include closed facilities using `CLOSED_PARKING` alongside public, private, paid, free, customer-only, miscategorized, duplicate and ambiguous cases. An optional `priorReview` contains `reviewedOn`, `expiresOn`, `decision` and observation `evidenceReferences`. It must predate the ground-truth review. Leave it absent when the system would have had no prior review. Disagreement and missing evidence belong in the corpus. Avoid using gold labels to construct prediction-time observations.

Rules-only execution is offline. Add `--gemini` explicitly to run eligible cases through the 12A provider with a configured key, both 12A flags and MySQL. Add `--input-usd-per-million` and `--output-usd-per-million` with current rates to estimate cost. `--persist` stores aggregate results without case-level error examples. The local stdout report includes up to five opaque case IDs for each type of error and abstention per arm and task when sufficient samples exist. Keep actual evaluation files and reports private.

## Metrics

- **Genuine parking** treats a real parking facility as positive, including private or closed facilities. The policy counts independently verified and strongly supported predictions as positive.
- **Publicly usable parking** treats a genuine facility with confirmed public access as positive. It measures entitlement separately from current Open Now availability. Unknown access on an otherwise genuine facility abstains. Restricted, customer-only and private access are negative for this task.
- Each task reports actual positives and negatives against predicted positive, negative and abstained. Explicit errors count in false-positive and false-negative rates, while recall also counts missed positives caused by abstention. The report includes Wilson 95% intervals for precision and recall. Treat the intervals as descriptive when samples are clustered or duplicates are intentionally included.
- Rates require at least 100 reviewed cases and at least 20 confirmed positives and negatives per task. The comparison labels identify Rules Only, Rules + Gemini, and Final Policy. The combined arm retains fallbacks and reports Gemini coverage and status counts. Verified coverage is the share of independently verified candidates.
- Operational metrics include calls, quota statuses, attempt latency, input/output tokens, evaluation volume and estimated spend for reported token usage. Missing token data makes the estimate partial. Free-tier and Google AI Pro entitlements are outside the application limits. [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

## Android pilot check on 22 November 2026

A physical Android phone reached the loopback development backend over ADB reverse. At the public Connaught Place test center, All Candidates returned 20 of 20 results, Recommended returned 20 of 20, and Verified Only returned zero with `NO_VERIFIED_PARKING`. Every facility-existence decision in this search was unconfirmed. Changing to a 1 km search around India Gate returned eight candidates on the phone. These counts describe the provider response at test time.

The configured project sent synthetic generation requests to `gemini-2.5-flash-lite`. Google returned HTTP 404 `NOT_FOUND` and stated that this model is unavailable to new users. The provider suggested `gemini-3.5-flash-lite`. The application retained its configured model. The final synthetic attempt took 1,087 ms and returned no usage metadata or classifiable output. Three synthetic request reservations were recorded across diagnosis and verification. Browsing did not increase that count.

The development database had zero independent cases and zero reviewer labels. Running the three-arm evaluation with the supplied template produced zero samples, zero evaluation requests and an estimated evaluation spend of USD 0. Successful generation latency, billable smoke-test cost, predictive accuracy, false positives, false negatives and public-access mistakes cannot be estimated from these results. The next evidence milestone is a private pilot of 20–30 independently reviewed cases. Keep production filtering disabled.

[Parking List](intelligence-smoke/parking-list.png) · [Map](intelligence-smoke/parking-map.png) · [Details](intelligence-smoke/parking-details.png) · [Recommended selector](intelligence-smoke/discovery-modes.png) · [Verified Only](intelligence-smoke/verified-only.png) · [Local diagnostics](intelligence-smoke/diagnostics.png)

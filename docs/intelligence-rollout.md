# Parking Intelligence rollout · Milestone 12B

## Decision and discovery

The backend policy `parking-display-v1` consumes the existing rules, approved independent observations, an optional current human review and an optional accepted 12A model outcome. A model outcome can strengthen an already supported candidate with corroborating observations. Verified status requires a confirmed identity finding and, by default, current human confirmation of that finding. When the human-review gate is explicitly disabled, trusted operator or public authority confirmation can qualify. A pending, disputed or stale review leaves identity unconfirmed. Independent exclusions can support a contradicted status. Public access, pricing and operating status are separate dimensions.

| Mode | Behavior |
| --- | --- |
| All Candidates | Keeps the original eligible candidate set. Discovery continues when evidence is missing or verification is unavailable. |
| Recommended | Orders by facility status, evidence tier, public accessibility, then distance and provider ID. Keeps unconfirmed and contradicted candidates. Expired evidence is excluded from the ranking inputs. Explicit `sort=distance` keeps nearest-first. |
| Verified Only | An explicit mode returning independently verified facilities that pass the existing user filters. A genuine private facility can qualify unless the user selects Public Access. An empty result offers All Candidates. |

The lookup uses currently approved records and a matching latest review revision. An expiry or change to the approved evidence invalidates the review. Accepted independent model outcomes must match the current findings, configured model and prompt and be at most 24 hours old. The API has a 300 ms local lookup deadline and at most eight in-flight lookups per process. It falls back to all eligible candidates if verification is unavailable. Gemini remains a bounded, asynchronous 12A observer. The display path does not send Gemini requests or rewrite saved parking.

## Flags and rollback

| Server variable | Initial value | Effect |
| --- | --- | --- |
| `PARKING_INTELLIGENCE_DISPLAY_ENABLED` | `false` | Enable verification metadata and mode controls |
| `PARKING_INTELLIGENCE_FILTERING_ENABLED` | `false` | Allow explicit Verified Only and apply supported independent pricing/access to existing filters when available |
| `PARKING_INTELLIGENCE_DEFAULT_MODE` | `ALL_CANDIDATES` | Allows a future Recommended default. Production constrains Verified Only to explicit selection. |
| `PARKING_INTELLIGENCE_REQUIRE_HUMAN_REVIEW` | `true` | Require eligible human confirmation for verified status |

Deploy the additive Prisma schema using the repository's schema push workflow in development, or a reviewed migration for managed databases. Existing unversioned human labels are preserved for evaluation history. Serving decisions use the append-only reviewed revisions. Apply and regenerate the client before enabling display.

For rollback, set display and filtering to `false`, restore the default to `ALL_CANDIDATES`, and redeploy or restart the API. The next discovery response omits verification metadata and keeps original semantics. Set `AI_VERIFICATION_ENABLED=false` to pause model usage independently. Preserve audit history.

## Authorized review

Use a trusted server host with database access. Configure the server-side `PARKING_REVIEW_ADMIN_IDS` allowlist and supply a current Better Auth bearer session in `PARKING_REVIEW_TOKEN` through the process environment. The CLI verifies the session and allowlist on the server before performing operations. An empty allowlist denies all sessions. Keep the token out of command arguments and clear it when finished. No moderation route is registered.

```powershell
npm --prefix apps/api run intelligence:review -- import E:/private/independent-evidence.json
npm --prefix apps/api run intelligence:review -- inspect CASE_UUID
npm --prefix apps/api run intelligence:review -- record CASE_UUID E:/private/review.json
npm --prefix apps/api run intelligence:review -- evidence CASE_UUID E:/private/evidence-update.json
```

- Import accepts an optional `googlePlaceId` and an `evidence` array with `source`, `finding`, `reference` and UTC `expiresAt`. Review identity and rights before importing. Supply only authorized independent sources. The CLI never fetches a reference URL.
- Inspect shows current independent evidence, previous review revisions, and retained independent model outcomes with their versions. Restrict access to the output.
- Record accepts `expectedRevision`, `decision`, `evidenceIds`, `expiresAt` and a concise `reason`. Decisions are `CONFIRM_PARKING`, `CONFIRM_NON_PARKING`, `CONFLICT` and `NEEDS_EVIDENCE`. Confirmation requires active evidence of the facility's function among the cited IDs. To correct a decision, inspect the current revision and append a new one. A conflicting write requires reinspection.
- Evidence updates accept `revokeIds` and `add` with the import evidence format. Evidence changes require a new review before verified display can resume.

MySQL stores internal identifiers, the optional Place ID join key, independent references, reviewer ID, timestamp, revision, reason, expiry, superseding decisions, versions, independent model outcomes and permitted aggregate metrics. Precise user GPS, source imagery, raw prompts, request credentials and Google-derived classifications are excluded. The Place ID exemption does not authorize sending Places content to Gemini. Production use is subject to the applicable billing-account terms. [Places API policy](https://developers.google.com/maps/documentation/places/web-service/policies) · [Maps Platform terms](https://cloud.google.com/maps-platform/terms) · [Gemini API terms](https://ai.google.dev/gemini-api/terms)

## Activation criteria

Keep production filtering off until at least 100–200 examples are independently reviewed, both binary tasks have adequate coverage, and the responsible operator explicitly authorizes a limited rollout. Review genuine parking false negatives, public-access false positives, abstentions, verified coverage, rollback behavior and operating costs. Confirm model access and evidence-processing rights for the deployment separately. Start with display-only on a limited deployment before considering opt-in Verified Only.

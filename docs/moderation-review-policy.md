# Human Review Policy & Evidence Standards

## 1. Truth-in-Advertising & Consumer Protection Mandate

Prakaro's primary obligation is driver reliability. Recommending a non-existent parking lot, sending a driver to a locked residential gate, or advertising free parking when fees apply damages driver trust and safety.

Therefore, **independent evidence is strictly required before any facility can be published as verified.**

---

## 2. Evidence Hierarchy & Acceptable Sources

Every verified attribute (existence, access, pricing, hours) must be corroborated by at least one independent evidence citation recorded in `ParkingEvidenceReference`:

| Source | Trust Tier | Valid Finding Types |
| :--- | :--- | :--- |
| `PRAKARO_AUDIT` | Tier 1 (Highest) | Direct visual verification of entrance signage, barrier arm, dedicated parking bays, or operator tariff schedule. |
| `PUBLIC_AUTHORITY` | Tier 1 | Municipal transportation registry, official airport ground transportation portal, or metro/rail parking directory. |
| `PARKING_OPERATOR` | Tier 2 | Official operator webpage, commercial garage rate card, or validated parking system portal. |

### Strict Prohibitions
- AI model hallucinations or uncorroborated text generation are **not** independent evidence.
- Raw Google Places names or synthetic place types are **not** independent evidence.
- Customer reviews containing ambiguous or contradictory statements cannot confirm free parking or 24/7 access without secondary verification.

---

## 3. Decision Matrix & Rule Validation

When a moderator submits a review (`POST /api/v1/moderation/cases/:id/reviews`):
1. The cited `evidenceIds` are fetched and evaluated through the deterministic rule engine (`evaluateRules`).
2. If `action === 'APPROVE'`, the evidence must evaluate to `classification === 'LIKELY_PARKING'`. An attempt to approve without corroborating evidence fails validation with `HTTP 409: Independent evidence does not support the decision.`
3. If `action === 'REJECT'`, the evidence must evaluate to `classification === 'LIKELY_NOT_PARKING'`.
4. A cryptographic fingerprint of all cited evidence items (`fingerprintReview`) is stored with the submission.

---

## 4. Quality Assurance (QA) Gate

Reviews do not deploy immediately to production. Submissions move to status `PENDING_QA`:
1. **Independent Second Reviewer**: The person performing QA **cannot** be the same person who submitted the review (`review.reviewerId !== a.userId`).
2. **Evidence Integrity Check**: Before publishing, the system verifies that the evidence snapshot has not changed since the submission:
   `fingerprintReview(currentEvidence) === submission.fingerprint`
3. **Actions**:
   - `REOPEN`: Sends the case back to status `REOPENED` with specific instructions for corrections.
   - `PUBLISH`: Executes `publishReview`, writes the authoritative `ParkingHumanLabel`, updates the `ParkingIntelligenceCase` with verified attributes, and clears `activeKey` to conclude the case.

# Phase 10 controlled deployment runbook

**Deployment Status: APPROVED FOR STAGING ROLLOUT.** All 10 technical release gates (canonical migrations, backup/restore, connection pool scaling, load shedding, and cross-platform regressions) have passed on native MySQL 8.4.13.

## Staging Deployment Sequence

1. **Infrastructure & Environment Provisioning**:
   - Runtime: Node.js 20+ (or 22 LTS), MySQL Community Server 8.4.13.
   - Domains: Dedicated HTTPS origins for the API (`https://api.prakaro.internal`) and Moderation Console (`https://moderation.prakaro.internal`).
   - Secrets & Config:
     - `NODE_ENV=production`
     - `DATABASE_URL`: Dedicated non-root MySQL user credentials with SSL/TLS.
     - `BETTER_AUTH_SECRET`: Cryptographically strong signing secret (>= 32 characters).
     - `BETTER_AUTH_URL` and `MODERATION_ORIGIN`: Canonical HTTPS origins.
     - `TRUSTED_PROXY_CIDRS`: Scoped exclusively to ingress reverse-proxy CIDRs.
     - `REPORT_MAX_CONCURRENT`: Sized to connection pool budget (default: 2 per node).
2. **Asset Build & Distribution**:
   - Build API: `npm --prefix apps/api run build` (outputs `dist/server.js`).
   - Build Moderation Console: `npm --prefix apps/moderation run build` (outputs static assets in `dist/`).
   - Reverse Proxy: Configure NGINX reverse-proxy using `deploy/moderation-nginx.conf` with HSTS, CSP (`default-src 'self'`), frame options, and private API proxying.
3. **Canonical Migration Deployment**:
   - Create pre-deployment logical database backup using `mysqldump`.
   - Run `npx prisma migrate deploy` using a dedicated migration account.
   - Verify `npx prisma migrate status` reports zero drift.
4. **Staging Smoke & Verification**:
   - Verify `/ready` and `/health` endpoints return HTTP 200.
   - Execute synthetic security smoke: verify HttpOnly/Secure/SameSite=Lax cookies, HSTS headers, no-store headers, and route-level rate limiting.
   - Perform end-to-end verification of supervisor login, AUX status transitions, case allocation, human decision submission, QA review, and policy publication.
5. **Canary & Production Promotion**:
   - Roll out to canary nodes with 5% traffic weight.
   - Monitor real-time p95 latency, error rates, connection pool saturation, and load shedding (`REPORT_BUSY` 503) frequencies.
   - If error rates remain < 0.1% and p95 < 2.0s over a 2-hour observation window, complete 100% traffic migration.
   - If any regression occurs, execute the documented rollback procedure immediately.

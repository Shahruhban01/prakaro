# Operations & Production Deployment Guide

Phase 10 release status is **NO-GO**. Use the [controlled deployment runbook](milestone14-phase10-deployment.md) for migration preflight, native MySQL compatibility, and approval requirements.

## 1. System Requirements & Port Allocation

| Component | Technology | Default Port | Environment Directory |
| :--- | :--- | :--- | :--- |
| **Fastify API Backend** | Node.js 22+, TypeScript, Fastify | `3000` | `apps/api/` |
| **Moderation Console** | React 19, Vite, Tailwind CSS v4 | `5173` | `apps/moderation/` |
| **Flutter Mobile App** | Flutter 3.29+, Dart 3.7+ | Mobile / Emulator | `apps/mobile/` |
| **Database** | MySQL 8.4 LTS | `3306` | `prakaro_db` |

---

## 2. Step-by-Step Production Deployment

### Step 1: Database Migration
After approval and a successful native MySQL preflight using an isolated schema, apply the checked-in migration history:
```bash
cd apps/api
npx prisma migrate deploy
```

### Step 2: Build the Fastify Backend
```bash
cd apps/api
npm run build
```

### Step 3: Build the Moderation Console (React + Vite)
```bash
cd apps/moderation
npm run build
```
The production bundle is compiled to `apps/moderation/dist/` (`index.html`, minified CSS, and chunked JS) ready for serving via NGINX or static CDN reverse proxy.

### Step 4: Run Health & Smoke Checks
```bash
# Verify Fastify liveness and database readiness
curl http://localhost:3000/health
curl http://localhost:3000/ready

# Verify AI Model smoke test
curl -X POST http://localhost:3000/api/v1/moderation/ai/test \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

## 3. Production Environment Checklist (`apps/api/.env`)

- [ ] `DATABASE_URL` points to the approved MySQL instance and uses the dedicated runtime account.
- [ ] `BETTER_AUTH_SECRET` is randomly generated and injected by the release secret manager.
- [ ] AI remains disabled until explicitly approved. Configure the key and test the configured model only if enabling the provider.
- [ ] Intake and AI budgets reflect approved operational limits.
- [ ] `BETTER_AUTH_URL` and `MODERATION_ORIGIN` set to the approved HTTPS origins.
- [ ] `TRUSTED_PROXY_CIDRS` contains only the approved proxy addresses where needed.

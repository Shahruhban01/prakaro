# Operations & Production Deployment Guide

## 1. System Requirements & Port Allocation

| Component | Technology | Default Port | Environment Directory |
| :--- | :--- | :--- | :--- |
| **Fastify API Backend** | Node.js 20+, TypeScript, Fastify | `3000` | `apps/api/` |
| **Moderation Console** | React 19, Vite, Tailwind CSS v4 | `5173` | `apps/moderation/` |
| **Flutter Mobile App** | Flutter 3.29+, Dart 3.7+ | Mobile / Emulator | `apps/mobile/` |
| **Database** | MySQL 8.0+ | `3306` | `prakaro_db` |

---

## 2. Step-by-Step Production Deployment

### Step 1: Database Migration
Ensure the MySQL database is running and apply the Prisma schema:
```bash
cd apps/api
npx prisma db push --skip-generate
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
# Verify Fastify health endpoint
curl http://localhost:3000/health

# Verify AI Model smoke test
curl -X POST http://localhost:3000/api/v1/moderation/ai/test \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

## 3. Production Environment Checklist (`apps/api/.env`)

- [x] `DATABASE_URL` configured to high-availability MySQL instance.
- [x] `BETTER_AUTH_SECRET` generated with 256-bit entropy (`openssl rand -hex 32`).
- [x] `GOOGLE_GEMINI_API_KEY` configured and verified with `gemini-3.5-flash-lite`.
- [x] `MODERATION_INTAKE_ENABLED=true` active.
- [x] `MODERATION_DAILY_CASE_LIMIT=50` to safeguard review SLA.
- [x] `AI_MAX_CALLS_PER_DAY=100` ceiling enforced.
- [x] `CORS_ORIGIN` restricted to `http://localhost:5173` and trusted production console domains.

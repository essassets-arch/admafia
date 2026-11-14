# AdMafia CRM — Master Memory Map & Engineering Ledger

> **SINGLE SOURCE OF TRUTH FOR ALL ENGINEERS & AI AGENTS**
> Every agent or engineer starting a session MUST read this file first before modifying any code, configuration, or deployment script, and MUST append every completed change or architectural decision to Section 8 (Engineering Change & Decision Log).

---

## 1. Mission & System Identity

- **Product**: AdMafia / Growthline B2B Lead Generation & Multi-Department Marketing CRM
- **Live Production Domain**: `https://admafia.marketing` (Currently LIVE — **NEVER push untested changes directly to live**)
- **Target Scale**: **10,000+ active business customers** (~500k–2M leads, multi-million wallet ledger rows, burst webhook & campaign traffic)
- **Infrastructure Horizon**:
  - **Current (Months 0–2)**: Hardened VPS + Cloudflare Edge WAF + Docker Compose (`MongoDB 7.0 rs0` + `Redis 7` + `Express API` + `React 19 Nginx SPA`) + Offsite S3/Cloudflare R2 Encrypted Snapshots.
  - **Cloud Cutover (Months 2–3)**: Zero-rewrite migration to Managed Cloud (**MongoDB Atlas `ap-south-1`** + Stateless **Cloud Run / ECS Fargate** + **Cloudflare R2** object storage + **Cloudflare CDN**).

---

## 2. Non-Negotiable Engineering Golden Rules

1. **Local Docker First (`docker-compose.local.yml`)**: Every feature, migration, security middleware, and E2E test MUST pass 100% inside isolated local Docker containers before touching `docker-compose.yml` or `update-vps.sh` for production.
2. **100% MongoDB 7.0 Replica Set (`rs0`)**: PostgreSQL is permanently decommissioned. All multi-collection financial, lead-distribution, and outbox mutations MUST run inside `withMongoTransaction` (`backend/repositories/tx.js`).
3. **Secrets Hygiene**: NEVER hardcode API keys (`WHATSAPP_ACCESS_TOKEN`, `DLT_SMS_API_KEY`, `RAZORPAY_KEY_SECRET`, `JWT_SECRET`, `FIREBASE_PRIVATE_KEY`) in frontend code, Git-tracked files, or markdown docs. All secrets live exclusively in git-ignored `.env` files with `.env.example` placeholders.
4. **Every User Verified via OTP**: No self-registered account can be created in `customers` without a server-verified, single-use, time-bound OTP proof token (dispatched via **Meta WhatsApp Cloud API `v26.0`**, with modular Indian DLT SMS support if ever toggled).
5. **Zero Unbounded Queries (`O(1)` / Paginated Only)**: Never load entire collections into memory or browser `localStorage` (e.g., legacy `GET /api/state` must be replaced by authenticated, tenant-scoped, paginated endpoints).
6. **Stateless Backend Readiness**: Never store new permanent state in Node.js process memory or unabstracted local disk paths without a provider adapter (`storageProvider.js`, MongoDB/Redis locks & rate-limit stores).
7. **Continuous Documentation Sync**: Whenever any schema, route, env var, or operational workflow changes, update `docs/MASTER_MEMORY_MAP.md`, `docs/DATABASE_DESIGN.md`, and `README.md` in the same step.

---

## 3. Verified External Integrations Registry

### 3.1 Global OTP Verification Engine — Meta WhatsApp Cloud API (`v26.0` — Live-Verified Spec)
- **Sole OTP Channel Globally (India + All Countries)**: **Meta WhatsApp Cloud API (`v26.0`)**
  - **Endpoint**: `POST https://graph.facebook.com/v26.0/1410175982181803/messages`
  - **Phone Number ID**: `1410175982181803` (always `.trim()` env values)
  - **API Version**: `v26.0`
  - **Template Name**: `authentication` | **Language**: `en` (No `TEMPLATE_ID` or `APP_ID` required by Meta `/messages` endpoint)
  - **Verified Exact Payload Structure** (Body + Copy-Code URL Button at `index: "0"`):
    ```json
    {
      "messaging_product": "whatsapp",
      "recipient_type": "individual",
      "to": "919876543210",
      "type": "template",
      "template": {
        "name": "authentication",
        "language": { "code": "en" },
        "components": [
          { "type": "body", "parameters": [{ "type": "text", "text": "123456" }] },
          { "type": "button", "sub_type": "url", "index": "0", "parameters": [{ "type": "text", "text": "123456" }] }
        ]
      }
    }
    ```
  - **Phone Normalization Rule**: AdMafia stores canonical `customers.phone` (`10` digits for `IN`), while `whatsappOtpService.js` formats Meta `to` as E.164 digits without `+` (e.g., `9876543210` + `IN` (`+91`) ➔ `"919876543210"`).
  - **Env Keys** (stored strictly in git-ignored `backend/.env` / `.env.local`, NEVER in Git/docs):
    - `WHATSAPP_ACCESS_TOKEN` (`EABA****wZDZD` — rotate to permanent Meta System User token prior to public production launch)
    - `WHATSAPP_PHONE_NUMBER_ID=1410175982181803`
    - `WHATSAPP_API_VERSION=v26.0`
    - `WHATSAPP_TEMPLATE_NAME=authentication`
    - `WHATSAPP_TEMPLATE_LANG=en`
    - `OTP_MODE` (`live` | `sandbox` — `sandbox` skips external Meta HTTP call during automated CI/pentest runs while exercising full HMAC hashing, rate limits, and TTL expiry)

### 3.2 Payment Gateway (Razorpay)
- **Env Keys**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- **Idempotency**: `wallet_transactions.referenceUtr` unique sparse index + HMAC-SHA256 signature verification.

### 3.3 Real-Time Notifications (Firebase Cloud Messaging — FCM, Built From Scratch)
- **Provisioning**: Created from scratch during Phase 2 via `firebase-tools` / Google Cloud CLI (Project + Web App + VAPID key pair + `firebase-admin` Service Account JSON injected into `backend/.env`).
- **Backend**: `firebase-admin` triggered via `services/outboxWorker.js` (`OutboxEvent` transactional outbox) + persisted in `notifications` collection.
- **Frontend**: `firebase/messaging` + `public/firebase-messaging-sw.js` (background OS push) + foreground real-time toast & Notification Bell drawer.
- **Env Keys**: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY`.

---

## 4. Codebase Security & Scaling Audit Ledger (Baseline Findings)

| Finding ID | Severity | Location | Issue Summary | Planned Remediation | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CRIT-01` | **CRITICAL** | `backend/server.js` | `GET /api/auth/admin-departments` publicly returned plaintext passwords for `superadmin`, `marketing`, `graphics`, `sales`. | Stripped `password` / `passwordHash` from public metadata; verified by `pentest-suite.mjs` (`CRIT-01`). | **Remediated & Verified** |
| `CRIT-02` | **CRITICAL** | `backend/server.js` | `GET /api/admin/customer-password/:identifier` publicly returned any customer's plaintext password with zero auth. | Locked to `requireSuperAdmin` + returns irreversible salted `scrypt` mask; verified (`CRIT-02A/B/C`). | **Remediated & Verified** |
| `CRIT-03` | **CRITICAL** | `backend/server.js` & `frontend/src/App.jsx` | Unauthenticated `GET /api/state` dumped ALL customers, leads, and transactions to every landing-page visitor's `localStorage`. | Locked `GET /api/state` to `requireStaff`; added tenant-scoped paginated `GET /api/me/workspace`; removed anonymous dump in `App.jsx` (`CRIT-03`, `RBAC-01`). | **Remediated & Verified** |
| `CRIT-04` | **CRITICAL** | `backend/server.js` & `routes/*` | `/api/sales/*`, `/api/superadmin/*`, `/api/customers/*`, `/api/leads/*`, `/api/marketing/*`, `/api/graphics/*` lacked JWT & RBAC guards. | Enforced signed HS256 `HttpOnly` JWT + Bearer RBAC + horizontal IDOR tenant guard (`authMiddleware.js`); verified across 20+ routes. | **Remediated & Verified** |
| `CRIT-05` | **CRITICAL** | `backend/server.js` | Empty password `""` bypassed customer login check; `/api/auth/admin-session` returned most recent admin without token. | Enforced non-empty password + `scrypt` verification (`passwordCrypto.js`) + signed JWT verification (`CRIT-05A/B/C`). | **Remediated & Verified** |
| `CRIT-06` | **CRITICAL** | `backend/server.js` & `routes/otpAuth.js` | `POST /api/auth/register` overwrote existing customer's `passwordHash` & `username` if phone already existed. | Blocked duplicate phone registration (`409`), enforced single-use WhatsApp OTP proof token, separated Forgot-Password OTP flow (`CRIT-06`). | **Remediated & Verified** |
| `CRIT-07` | **CRITICAL** | `backend/server.js` | Self-service `PATCH /api/customers/:id` accepted arbitrary `balance` / `paymentStatus` mutations. | Blocked financial field tampering (`403 WALLET_TAMPER_BLOCKED`) & retired unverified `POST /api/wallets/topup` (`410 Gone`). | **Remediated & Verified** |
| `HIGH-01` | **HIGH** | `backend/middleware/securityMiddleware.js` | Wildcard `cors()` and global `25mb` JSON body limit exposed CORS abuse, DoS, and disguised XSS uploads. | Enforced strict origin allowlist, CSP/HSTS/nosniff/DENY headers, `512kb` JSON cap, and binary magic-byte upload inspection (`CORS-01/02`, `DOS-01`, `UPLOAD-01/02`). | **Remediated & Verified** |
| `HIGH-02` | **HIGH** | `backend/middleware/securityMiddleware.js` | Unescaped user input in `RegExp` and un-sanitized `$` keys in request bodies. | Added recursive NoSQL `$` / `__proto__` sanitizer + regex metacharacter escaping (`INJ-01/02/03`). | **Remediated & Verified** |
| `HIGH-03` | **HIGH** | `backend/utils/passwordCrypto.js` | Passwords stored in plaintext (`passwordHash` held raw string). | Implemented salted `crypto.scrypt` (`N=16384`) with zero-downtime transparent login auto-upgrade for legacy live rows. | **Remediated & Verified** |
| `HIGH-04` | **HIGH** | `backend/services/cronLock.js` & `storageProvider.js` | In-process `setInterval` cron & local `./uploads` folder blocked horizontal multi-container cloud scaling. | Added MongoDB distributed TTL lease lock (`cron_locks`) + S3/Cloudflare R2 storage adapter (`STORAGE_DRIVER=local|s3`). | **Remediated & Verified** |
| `HIGH-05` | **HIGH** | `backend/routes/superadminOps.js` & `scripts/snapshot-backup.sh` | Manual local-disk-only `mongodump` without `--oplog`, encryption, or offsite S3/R2 replication. | Built `mongodump --oplog --gzip` + AES-256-CBC (`ADMAFIA_ENC_V1`) + SHA-256 + R2 sync + Super Admin **DB Compass & Backups** desk. | **Remediated & Verified** |

---

## 5. Master Roadmap & Phase Tracker

- [x] **Pre-Phase**: Full codebase audit, PostgreSQL -> MongoDB 7.0 doc/UI synchronization, DLT gateway specification analysis.
- [x] **Phase 0**: Isolated Local Docker Staging Environment (`docker-compose.local.yml` with `mongo-local` rs0 `:27018`, `redis-local` `:6380`, `mongo-express-local` `:8081`, `backend-local` `:5001`, `frontend-local` `:5051`).
- [x] **Phase 1**: Universal WhatsApp Cloud API (`v26.0`) OTP Verification Engine (`whatsappOtpService.js`, `OtpVerification`, `OtpDeliveryLog`, rate-limiting, Customer Register UI, AuthPage unification, Forgot Password OTP, first-login verification gate).
- [x] **Phase 2**: From-Scratch Firebase Provisioning Helper (`setup-firebase.mjs`) + Dual-Channel Real-Time SSE + FCM Push Notifications (`firebasePushService.js` + `outboxWorker.js` + `notifications` collection + `firebase-messaging-sw.js` + `NotificationBell.jsx` across all 5 portals).
- [x] **Phase 3**: Security Hardening, JWT/RBAC, Salted `scrypt` Password Hashing, Cloudflare Edge Playbook (`docs/CLOUDFLARE_WAF_AND_EDGE_PLAYBOOK.md`) & Automated Penetration Test Suite (`pentest-suite.mjs` — `44/44` passed).
- [x] **Phase 4**: 10,000+ User Performance & Cloud-Ready Architecture (Retired anonymous `/api/state` dump, added paginated `/api/me/workspace`, compound indexes, `cronLock.js`, `storageProvider.js`).
- [x] **Phase 5**: Database Visibility & 3-2-1 Encrypted Snapshot Engine (`SuperAdminDatabaseDesk.jsx` + Compass local `:27018` / VPS SSH tunnel guides + `snapshot-backup.sh`, `restore-snapshot.sh`, `verify-backup-restore.sh`).
- [x] **Phase 6**: Super Admin High-Growth Analytics & Conversion Command Center (`SuperAdminGrowthAnalyticsDesk.jsx` + `$facet` Onboarding Funnel, 1-Click WhatsApp Hot Drop-Off Outreach, Low-Runway Churn Radar, Lead Liquidity Matrix, Ops & Security Shield).
- [x] **Phase 7**: Full Local Docker E2E (`52/52`) + WhatsApp OTP/FCM/Snapshot/Analytics (`24/24`) + OWASP Pentest (`44/44`) Sign-off (`120/120` green; ready for founder local review prior to `admafia.marketing` production cutover).

---

## 6. Repository Map (Key Paths)

- `docker-compose.yml` — Live Production Docker stack on `admafia.marketing` (`mongo` `rs0`, `redis` internal-only, `backend`, `frontend` Nginx)
- `docker-compose.local.yml` — Isolated local E2E testing stack (`mongo-local` `:27018`, `redis-local` `:6380`, `mongo-express-local` `:8081`, `backend-local` `:5001`, `frontend-local` `:5051`)
- `backend/mongo.js` — Authoritative MongoDB 7.0 Replica Set connection manager
- `backend/server.js` — Express application entry & core API routes secured by JWT/RBAC, strict CORS, rate limiters, and NoSQL sanitizer
- `backend/middleware/` — `authMiddleware.js` (HS256 `HttpOnly` cookie + Bearer JWT + RBAC + IDOR guard) & `securityMiddleware.js` (CSP/HSTS/nosniff/DENY, CORS allowlist, Redis/memory rate limiters, NoSQL sanitizer, magic-byte upload guard)
- `backend/models/` — Mongoose schemas (`Customer`, `Finance`, `Leads`, `CampaignsAndPricing`, `SystemUser`, `MarketingPost`, `MarketingIdea`, `PendingVerification`, `TelemetryAudit`, `OtpVerification`, `OtpDeliveryLog`, `Notification`, `SecurityAndLocks`)
- `backend/repositories/` — Data access & transactional logic (`tx.js`, `salesLedgerRepo.js`, `razorpayRepo.js`, `leadsAndOpsRepo.js`, `superadminRepo.js`, `bootstrapRepo.js`)
- `backend/services/` — `whatsappOtpService.js`, `firebasePushService.js`, `redisStore.js`, `cronLock.js`, `storageProvider.js`, `outboxWorker.js`, `mongoOutbox.js`, `countryDetection.js`, `leadEligibility.js`, `marketingStorage.js`
- `backend/routes/` — `otpAuth.js`, `notifications.js`, `superadminOps.js`, `superadmin.js`, `marketing.js`, `graphics.js`, `countryPricing.js`
- `backend/scripts/` — `verify-mongo-e2e.mjs`, `test-whatsapp-otp-fcm.mjs`, `pentest-suite.mjs`, `setup-firebase.mjs`, `snapshot-backup.sh`, `restore-snapshot.sh`, `verify-backup-restore.sh`
- `frontend/src/components/` — `WhatsAppOtpModal.jsx`, `NotificationBell.jsx`, `AuthPage.jsx`
- `frontend/src/portal/` — Customer self-service workspace & `AuthPages.jsx`
- `frontend/src/sales/` — 9 Sales & Sub-Admin operational desks
- `frontend/src/marketing/` & `frontend/src/graphics/` — Creative & campaign desks
- `frontend/src/superadmin/` — Executive governance, finance, country pricing, RBAC, `SuperAdminDatabaseDesk.jsx`, `SuperAdminGrowthAnalyticsDesk.jsx`
- `docs/` — `MASTER_MEMORY_MAP.md` (this file), `DATABASE_DESIGN.md`, `CLOUDFLARE_WAF_AND_EDGE_PLAYBOOK.md`, `SALES_EXECUTIVE_DOCUMENTATION.md`, `SUBADMIN_DESKS_AND_PAGES_REFERENCE.md`

---

## 7. Database Access & Snapshot Quick Reference

- **Local Docker MongoDB Compass URI**: `mongodb://127.0.0.1:27018/admafia_crm?directConnection=true`
- **Live Browser MongoDB Web Console (`mongo-express`)**: `https://admafia.marketing/db-console/` (bound strictly to `127.0.0.1:8081` behind Host Nginx TLS + HTTP BasicAuth `ME_ADMIN_USER` / `ME_ADMIN_PASS`).
- **In-Portal Super Admin Live Document Explorer**: `https://admafia.marketing/superadmin/database-backups` (`GET /api/superadmin/database/collections/:name/documents` with automatic hash redaction).
- **Production VPS MongoDB Compass Access**: Connect via **Compass SSH Tunnel** (`SSH Host: 95.111.242.173`, `SSH User: root`, `Mongo Host: 127.0.0.1:27017`). Port `27017` is NEVER exposed on `0.0.0.0`.
- **Snapshot Standard**: `mongodump --uri="..." --oplog --archive --gzip` + AES-256-CBC encryption (`ADMAFIA_ENC_V1` header + SHA-256 checksum) + offsite Cloudflare R2 / S3 upload + automated restore verification (`verify-backup-restore.sh`).

---

## 8. Engineering Change & Decision Log

| Date (IST) | Entry ID | Summary of Change / Architectural Decision | Files Touched |
| :--- | :--- | :--- | :--- |
| `2026-11-14` | `LOG-001` | Completed repository-wide PostgreSQL -> MongoDB 7.0 alignment across docs, root `package.json`, `deploy-vps.sh`, backend E2E tests, and frontend UI badges/services. | `README.md`, `docs/*`, `deploy-vps.sh`, `package.json`, `frontend/src/**` |
| `2026-11-14` | `ADR-001` | Studied `C:\Users\Admin\Desktop\projects\DLT` (`allsmssolution.in`, Sender `TXXTOO`, Template `1607100000000313742`, PE_ID `1401805350000060162`); conducted full security & 10k-user scaling audit of `admafia`; initialized `docs/MASTER_MEMORY_MAP.md` prior to Phase 0 implementation. | `docs/MASTER_MEMORY_MAP.md` |
| `2026-11-14` | `ADR-002` | Founder specified **Meta WhatsApp Cloud API (`v26.0`, Phone ID `1410175982181803`, Template `authentication`, Lang `en`)** for OTP verification (`WHATSAPP_ACCESS_TOKEN` kept strictly in `.env`, never in Git); confirmed **Firebase FCM** will be provisioned from scratch; evaluated **MongoDB Atlas (`M10` Mumbai)** vs **Self-Hosted VPS Docker + R2 Snapshots**. | `docs/MASTER_MEMORY_MAP.md` |
| `2026-11-14` | `ADR-003` | Locked exact live-tested Meta WhatsApp Cloud API payload from founder's HTML tester: two-component `authentication` template (`body` text parameter + `button` `sub_type: "url"`, `index: "0"` copy-code parameter), `.trim()` guard on `PHONE_NUMBER_ID` (`1410175982181803`), and automatic E.164 country-code digit formatting (`91XXXXXXXXXX`). Zero `TEMPLATE_ID` / `APP_ID` required. | `docs/MASTER_MEMORY_MAP.md` |
| `2026-11-14` | `LOG-002` | Built, containerized, and verified Phases 0–7 in isolated local Docker (`docker-compose.local.yml`): Universal Meta WhatsApp Cloud API `v26.0` OTP verification (`register`, `password_reset`, `verify_phone`), Dual-Channel SSE + Google FCM Push Notifications (`outboxWorker` + `NotificationBell.jsx`), full remediation of `CRIT-01`..`CRIT-07` & `HIGH-01`..`HIGH-05` (`HttpOnly`/Bearer HS256 JWT + RBAC + IDOR guard + salted `scrypt` auto-upgrade + Redis rate limiters + NoSQL sanitizer + magic-byte upload guard), 10k-scale `/api/me/workspace` + compound indexes + `cronLock.js` + `storageProvider.js`, AES-256 `--oplog` Snapshot Engine + `SuperAdminDatabaseDesk.jsx`, and `$facet` `SuperAdminGrowthAnalyticsDesk.jsx`. Passed **120/120** automated tests (`verify-mongo-e2e.mjs` `52/52`, `test-whatsapp-otp-fcm.mjs` `24/24`, `pentest-suite.mjs` `44/44`) with live `admafia.marketing` untouched. | `docker-compose.local.yml`, `backend/**`, `frontend/**`, `docs/*` |
| `2026-11-15` | `LOG-003` | Provisioned and linked live Google Firebase Cloud Messaging (`projectId: admafia-marketing`, `messagingSenderId: 529116075612`, VAPID Web Push + Admin Service Account) inside git-ignored `backend/.env.local` & `firebase-service-account.json`; added `https://firebase.googleapis.com` to CSP `connect-src`. | `backend/.env.local` *(git-ignored)*, `backend/routes/notifications.js`, `backend/middleware/securityMiddleware.js`, `frontend/src/services/firebaseClient.js` |
| `2026-11-15` | `LOG-004` | Redesigned `CustomerRegisterPage` (`AuthPages.jsx` + `portal.css`) into a clean **3-Step Progressive Onboarding Wizard** (Step 1: WhatsApp Number + inline 6-digit OTP verification; Step 2: real-time browser & server validated optional Work Email + Full Name + Company + live debounced `@username` availability check via `GET /api/auth/check-username`; Step 3: Password + Confirm Password match + strength meter); eliminated `.clean-input` double-border focus ring bug; deployed full stack live to `https://admafia.marketing` (`95.111.242.173` `/home/ubuntu/admafia`) with internal `admafia-redis`, unbuffered Nginx SSE stream, live Meta WhatsApp Cloud API `v26.0`, live Google Firebase FCM (`admafia-marketing`), preserved live MongoDB (`rs0`), and 6-hour automated AES-256 `--oplog` encrypted snapshots (`/etc/cron.d/admafia-snapshot`). | `frontend/src/portal/AuthPages.jsx`, `frontend/src/portal/portal.css`, `frontend/src/services/crmApi.js`, `frontend/nginx.conf`, `backend/routes/otpAuth.js`, `backend/routes/notifications.js`, `backend/services/whatsappOtpService.js`, `backend/server.js`, `backend/scripts/snapshot-backup.sh`, `backend/scripts/restore-snapshot.sh`, `docker-compose.yml`, `docs/MASTER_MEMORY_MAP.md` |
| `2026-11-15` | `LOG-005` | Removed all legacy PM2 / host-build / Nginx-overwriting shell scripts (`deploy-vps.sh`, `deploy-docker.sh`, `update-vps.sh`, `fix-live-ssl.sh`, `backend/scripts/backup-db.sh`, `backend/scripts/verify-deployment.sh`), keeping strictly pure Docker Compose (`git pull origin main && docker compose up -d --build --remove-orphans`) and the 3 Docker-native `--oplog` encrypted snapshot scripts (`snapshot-backup.sh`, `restore-snapshot.sh`, `verify-backup-restore.sh`). | `README.md`, `docs/MASTER_MEMORY_MAP.md` |
| `2026-11-15` | `LOG-006` | Resolved foreground/multi-tab notification suppression on live `admafia.marketing`: (1) prioritized `req.query.token` above shared browser `admafia_session` cookie in `authMiddleware.js` so Sales + Customer open in the same browser never cross-wire SSE streams; (2) upgraded `firebase-messaging-sw.js` (v2) to handle FCM HTTP v1 Web Push natively with `skipWaiting()` + `clients.claim()` so OS notifications always fire in Windows/macOS/Android Notification Center even when `admafia.marketing` tabs are visible; (3) added `tag` deduplication, live wallet/lead state auto-refresh, `isRead` normalization, and 1-click `POST /api/notifications/test` (`Test Push`) in `NotificationBell.jsx`. | `backend/middleware/authMiddleware.js`, `backend/services/firebasePushService.js`, `backend/routes/notifications.js`, `frontend/public/firebase-messaging-sw.js`, `frontend/src/services/firebaseClient.js`, `frontend/src/components/NotificationBell.jsx`, `frontend/src/services/crmApi.js`, `docs/MASTER_MEMORY_MAP.md` |
| `2026-11-15` | `LOG-007` | Executed 5-pillar platform audit & production deployment: (1) **Truthful Profile Completion & Repair**: eliminated hardcoded `'Maharashtra'`, `'IT & Software'`, and `100%` defaults across Mongoose schemas/APIs/UI, created shared `profileCompletion.js` evaluators (`45%`/`60%` incomplete on 3-step signup -> `100%` complete when all 7 fields filled), added startup `repairIncompleteCustomerProfiles()`, and rendered a prominent top-of-dashboard **"Action Required: Complete Your Business Profile"** banner in `LeadHubOverview.jsx`; (2) **Zero Strategy Leakage**: scrubbed all customer/public/SEO/JSON-LD/invoice/receipt/wallet-ledger references to `Meta`, `Meta Ads`, `Facebook`, `Instagram`, and `Google Ads`; (3) **Brand Unification**: standardized visible brand copy to **`"Ad Mafia"`** (two words) across all 7 surfaces while preserving technical keys; (4) **Full `360px–1024px` Mobile & Tablet Responsiveness**: fixed `NotificationBell` viewport clamping, mobile drawers/backdrops in Marketing/Graphics/Sales/SuperAdmin/Customer portals, scrollable tables, responsive grids, and global `responsive-fixes.css`; (5) **Live MongoDB Open Console & Explorer**: deployed localhost-bound `admafia-mongo-express` behind Host Nginx TLS + BasicAuth at `https://admafia.marketing/db-console/` and added an inline Super Admin **Live Collection & Document Explorer** (`GET /api/superadmin/database/collections/:name/documents` with secret hash redaction). | `docker-compose.yml`, `backend/**`, `frontend/**`, `docs/MASTER_MEMORY_MAP.md` |




# AdMafia / Growthline B2B Lead Generation CRM

Enterprise B2B Lead Generation, Campaign Operations & Multi-Department CRM platform engineered for **10,000+ active business accounts**, powered by **MongoDB 7.0 Replica Set (`rs0`)**, **Redis 7**, **Node.js Express**, and **React 19 + Vite**.

---

## 1. Architecture & Security Highlights

- **Database Engine**: MongoDB 7.0 Replica Set (`rs0`) with multi-document ACID transactions (`withTransaction`), compound 10k-scale indexes, distributed cron lease locks (`cron_locks`), and Transactional Outbox (`outbox_events`).
- **Universal WhatsApp OTP Verification**: Every single user account is verified via **Meta WhatsApp Cloud API (`v26.0`, `authentication` template)** using HMAC-SHA256 hashed 6-digit challenges, 5-attempt lockout, 60s resend cooldowns, single-use verification tokens, Forgot Password via WhatsApp OTP, and First-Login verification gating.
- **Real-Time Notifications (Firebase FCM + SSE)**: Dual-channel push architecture combining `<100ms` Server-Sent Events (`/api/notifications/stream`) with **Google Firebase Cloud Messaging (FCM HTTP v1)** Web Push (`firebase-messaging-sw.js`) and an interactive `<NotificationBell />` across all 5 portals.
- **Defense-in-Depth Security**:
  - Signed HS256 JWTs (`HttpOnly; SameSite=Lax` cookies + `Bearer` headers) + strict tenant isolation (`requireCustomerSelfOrStaff`) & department RBAC (`requireStaff`, `requireSuperAdmin`).
  - Salted `crypto.scrypt` password hashing with constant-time verification and transparent legacy login auto-upgrade.
  - Redis-backed sliding-window rate limiters, recursive NoSQL `$` / `__proto__` sanitizer, strict CORS origin allowlist, CSP/HSTS/nosniff/DENY headers, `512kb` JSON payload cap, and binary magic-byte upload verification.
- **Portals & Executive Desks**:
  - **Customer Portal (`/portal` / `/app/lead`)**: Paginated tenant-isolated workspace (`/api/me/workspace`), lead inbox, Kanban pipeline, WhatsApp/Call triggers, daily ad spend pacing, and GST wallet ledger.
  - **Super Admin Control Center (`/superadmin`)**: Executive Dashboard, **10k-Scale Growth & Churn Radar** (`$facet` funnel, 1-click WhatsApp drop-off close queue, `<= 2d` low-runway radar, category lead liquidity matrix, 24h security shield), **MongoDB Compass & Encrypted Snapshot Vault**, Finance, Refunds, Top-Ups, Country Pricing, and RBAC.
  - **Sales (`/sales`)**, **Marketing (`/marketing`)**, and **Graphics (`/graphics`)** operational workspaces.

---

## 2. Running the Isolated Local Docker Stack (Recommended for E2E Testing)

Test the entire production-grade topology locally without touching live production (`admafia.marketing`) or default host ports:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

### Local Docker Endpoints:
| Service | Local URL / URI | Purpose |
| :--- | :--- | :--- |
| **Frontend Nginx SPA** | `http://127.0.0.1:5051` | Full Customer, Sales, Marketing, Graphics & Super Admin UI |
| **Backend REST API** | `http://127.0.0.1:5001/api/health` | Express API + SSE Stream + Outbox Worker |
| **MongoDB Compass URI** | `mongodb://127.0.0.1:27018/admafia_crm?directConnection=true` | Direct visual DB inspection in MongoDB Compass |
| **Mongo Express Web UI** | `http://127.0.0.1:8081` | Browser-based MongoDB viewer (`admin` / `admafia_local_2026`) |
| **Redis 7** | `127.0.0.1:6380` | Rate limiting & ephemeral state |

---

## 3. Automated Verification & Penetration Testing Suites

Run all three verification suites (100% isolated test databases — never touches `admafia_crm`):

```bash
# Inside local Docker container:
docker exec admafia-backend-local sh -c "TEST_MONGO_URI='mongodb://mongo-local:27017/admafia_crm_test?directConnection=true' npm run test:all"

# Or individually inside backend/:
npm run test:mongo      # Full MongoDB 7.0 CRM, Wallet, Razorpay Webhook, GST & Lead Distribution E2E
npm run test:otp-fcm    # Meta WhatsApp OTP, Lockouts, Reset, Outbox -> SSE/FCM Push, Encrypted Snapshots & Growth Analytics
npm run test:pentest    # 35+ Adversarial OWASP Penetration Tests (RBAC, IDOR, Wallet Tamper, NoSQLi, CORS, Magic-Bytes, DoS, Rate-Limits)
```

---

## 4. Provisioning Firebase Cloud Messaging (FCM) From Scratch

Run the interactive provisioning helper to link Google Firebase Web Push + Service Account credentials into `backend/.env.local`:

```bash
cd backend
npm run setup:firebase
```

*(Even prior to linking external Firebase credentials, real-time in-app and browser desktop notifications work out-of-the-box via `/api/notifications/stream` SSE!)*

---

## 5. Point-in-Time Encrypted Database Backups & Restore

- **UI**: Super Admin ➔ **DB Compass & Backups** (`/superadmin/database-backups`) ➔ **Trigger Snapshot Now** (creates `mongodump --oplog --gzip` + AES-256-CBC `.enc` archive + `.sha256` checksum).
- **CLI Scripts**:
  - `bash backend/scripts/snapshot-backup.sh` — Automated `--oplog` + `openssl aes-256-cbc` backup + optional `rclone` offsite sync to Cloudflare R2 / S3.
  - `bash backend/scripts/restore-snapshot.sh <snapshot-file>` — Checksum-verified decrypt & `mongorestore --oplogReplay`.
  - `bash backend/scripts/verify-backup-restore.sh <snapshot-file>` — Non-destructive restore drill into `admafia_restore_verify_tmp`.

---

## 6. Production Deployment on VPS (100% Pure Docker Compose + Git)

No PM2, no host `npm install`, and no wrapper shell scripts — everything builds and runs cleanly inside Docker (`admafia-mongo`, `admafia-redis`, `admafia-backend`, `admafia-frontend`):

```bash
cd /home/ubuntu/admafia
git pull origin main
docker compose up -d --build --remove-orphans
```

---

## 7. Key Documentation Reference (`docs/`)

- `docs/MASTER_MEMORY_MAP.md` — Master architecture, integration registry, security audit ledger & engineering log.
- `docs/DATABASE_DESIGN.md` — Complete Mongoose schemas, compound indexes, tenant isolation & Compass/Atlas guide.
- `docs/CLOUDFLARE_WAF_AND_EDGE_PLAYBOOK.md` — Exact Cloudflare DNS, SSL/TLS, WAF, Rate-Limiting & Origin Lockdown rules for `admafia.marketing`.
- `docs/SALES_EXECUTIVE_DOCUMENTATION.md` & `docs/SUBADMIN_DESKS_AND_PAGES_REFERENCE.md` — Operational desk SOPs.

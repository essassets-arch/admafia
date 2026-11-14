# AdMafia / Growthline B2B Lead Generation CRM

Enterprise B2B Lead Generation, Campaign Operations & Multi-Department CRM platform powered by **MongoDB 7.0 Replica Set (`rs0`)**, **Node.js Express**, and **React 19 + Vite**.

---

## 1. Architecture Overview

- **Database Engine**: MongoDB 7.0 Replica Set (`rs0`) with native multi-document ACID transactions (`withTransaction`) and Transactional Outbox.
- **Backend API**: Node.js (ES Modules) + Express REST API + Mongoose ODM (Port `5000`).
- **Frontend SPA**: React 19 + Vite + Tailwind/Modern CSS (Port `5173` local, Port `5050` Docker Nginx).
- **Payment & Invoicing**: Razorpay payment gateway integration, automated 18% GST tax invoices, and idempotent immutable wallet transaction ledger.
- **Portals & Desks**:
  - **Customer Portal (`/portal` / `/app/lead`)**: Self-service lead inbox, Kanban pipeline, call/WhatsApp triggers, daily ad spend pacing, schedule lock, and marketing wallet.
  - **Sales Operations Desks (`/sales`)**: 9 operational command desks (Customers, Dual-Gate Verifications, Lead Dispatch, KYC Dossiers, Payment Settlements, Marketing Wallets, Support Queries, Sales Tasks, Customer Groups).
  - **Marketing Desk (`/marketing`)**: Marketing ideas capture, ad post creation, campaign pacing, and customer spend controls.
  - **Graphics Desk (`/graphics`)**: Creative asset upload, multi-stage approval queue, and revision management.
  - **Super Admin Operations (`/superadmin` / `/admin`)**: Multi-currency country pricing rules (INR, AED, USD), system staff RBAC, manual ledger adjustments, refunds, and telemetry logs.

---

## 2. Folder Structure

```text
d:\projects\admafia\
├── frontend/                        # React 19 + Vite Frontend SPA (Port 5173)
│   ├── public/                      # Static assets & brand media
│   ├── src/
│   │   ├── portal/                  # Customer Self-Service Portal (/portal, /app/lead)
│   │   ├── sales/                   # Sales Operations & 9 Sub-Admin Desks (/sales)
│   │   ├── marketing/               # Marketing Campaign & Idea Desks (/marketing)
│   │   ├── graphics/                # Creative Assets & Graphics Approval Desks (/graphics)
│   │   ├── superadmin/              # Executive Governance, Pricing & RBAC (/superadmin)
│   │   ├── admin/                   # Department Staff Login & Auth Gateway
│   │   ├── services/                # API clients (crmApi, superadminApi, marketingApi, graphicsApi)
│   │   ├── database/                # Client-side cache hydration
│   │   ├── App.jsx                  # Main application router
│   │   └── main.jsx                 # Client entry point
│   ├── .env                         # VITE_API_BASE_URL=/api
│   ├── vite.config.js               # Dev server proxy configuration
│   └── package.json
│
├── backend/                         # Node.js + Express + MongoDB REST API (Port 5000)
│   ├── mongo.js                     # MongoDB 7.0 Replica Set connector & connection pooling
│   ├── server.js                    # Express application entry & REST API routes
│   ├── models/                      # Mongoose Document Schemas & Indexes
│   │   ├── Customer.js              # Customer accounts, profiles & status history
│   │   ├── Finance.js               # Wallet, WalletTransaction, PaymentRecord, TaxInvoice
│   │   ├── Leads.js                 # MasterLead, Lead, LeadAssignment, SalesTask, SupportQuery
│   │   ├── CampaignsAndPricing.js   # MarketingCampaign, CountryPricing, OutboxEvent
│   │   ├── MarketingPost.js         # Creative posts, review states & schedule
│   │   ├── MarketingIdea.js         # Campaign ideation & drafts
│   │   ├── PendingVerification.js   # Dual-gate intake verification queue
│   │   ├── SystemUser.js            # Internal staff RBAC & CustomerGroups
│   │   └── TelemetryAudit.js        # Audit logging & event tracking
│   ├── repositories/                # Database query layer & transactions
│   │   ├── tx.js                    # Multi-document transaction wrapper (withTransaction)
│   │   ├── mongoRepository.js       # Core customer, lead & state queries
│   │   ├── bootstrapRepo.js         # Automated schema init & default seed data
│   │   ├── salesLedgerRepo.js       # Wallet credit/debit & accounting ledger
│   │   ├── salesViewRepo.js         # Unified desk aggregation & row views
│   │   ├── leadsAndOpsRepo.js       # Lead ingestion, deduplication & distribution
│   │   ├── countryPricingRepo.js    # Multi-currency localization rules
│   │   └── razorpayRepo.js          # Payment verification & wallet auto-credit
│   ├── routes/                      # Modular API route controllers
│   ├── services/                    # Background workers, outbox processor & GeoIP
│   ├── scripts/                     # Production migration & E2E verification suites
│   ├── .env                         # PORT=5000, MONGO_URI, RAZORPAY credentials
│   └── package.json
│
├── docs/                            # Production Architecture Documentation
│   ├── DATABASE_DESIGN.md           # MongoDB 7.0 Schema, Indexes & ERD
│   ├── SALES_EXECUTIVE_DOCUMENTATION.md # Sales Desk SOPs & Controller APIs
│   └── SUBADMIN_DESKS_AND_PAGES_REFERENCE.md # Desks 01–09 operational flow
│
├── docker-compose.yml               # MongoDB 7.0 (rs0) + Backend + Frontend stack
├── deploy-docker.sh                 # 1-command Docker deployment script
├── update-vps.sh                    # 1-command VPS update and zero-downtime rebuild
└── README.md
```

---

## 3. Running with Docker (Recommended)

Start the entire production stack (MongoDB 7.0 Replica Set + Express Backend + React/Vite Frontend Nginx) in a single command:

```bash
docker compose up -d --build
```

### Services Started:
- **Frontend Web Portal**: `http://localhost:5050`
- **Backend REST API**: `http://localhost:5000/api`
- **MongoDB 7.0 (Replica Set `rs0`)**: `localhost:27017` (`admafia_crm`)

---

## 4. Running Locally Without Docker

### Prerequisites
- **Node.js**: v20+
- **MongoDB**: 7.0+ (running locally with replica set enabled on port `27017`)

### 1. Configure Backend Environment
Create `backend/.env` with your settings:
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/admafia_crm?directConnection=true
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

### 2. Start Backend Server
```bash
cd backend
npm install
npm start
```
*Note: Database collections, indexes, and initial admin accounts are bootstrapped automatically on first startup.*

### 3. Start Frontend Development Server
```bash
cd frontend
npm install
npm run dev
```
Access the application at `http://localhost:5173`.

---

## 5. Verification & Testing

Run the automated MongoDB end-to-end verification suite:

```bash
cd backend
npm test
```

This verifies:
- Active connection to MongoDB 7.0 Replica Set.
- Zero residual PostgreSQL connection attempts.
- Complete customer registration, KYC, and profile flow.
- Wallet top-up, 18% GST calculation, and idempotent transaction ledger.
- Daily ad spend pacing and auto-deductions.
- Master lead ingestion and tenant-isolated distribution.

-- =============================================================================
-- ADMAFIA / GROWTHLINE CRM — PRODUCTION RELATIONAL DATABASE SCHEMA (PostgreSQL)
-- =============================================================================
-- Architecture: Multi-Tenant Customer CRM + 9-Desk Sales & Sub-Admin Operations
-- Isolation Rule: Every customer-owned entity is strictly scoped by customer_id
-- Compliance Rule: Zero GSTIN, PAN, Bank Account Number, or IFSC columns stored
-- Wallet Rule: Pure INR wallet credit (Min ₹300) and daily ad-spend deduction
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. INDUSTRY & CUSTOMER GROUPS (Sales Desk 08: /sales#groups)
-- =============================================================================
CREATE TABLE IF NOT EXISTS customer_groups (
    id              VARCHAR(64) PRIMARY KEY,
    name            VARCHAR(120) NOT NULL UNIQUE,
    category        VARCHAR(100) NOT NULL DEFAULT 'Other',
    icon            VARCHAR(16) DEFAULT '🏢',
    description     TEXT DEFAULT '',
    status          VARCHAR(24) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_groups_category ON customer_groups(category);
CREATE INDEX IF NOT EXISTS idx_customer_groups_status ON customer_groups(status);

-- =============================================================================
-- 2. CUSTOMERS / REGISTERED ACCOUNTS (Auth /#register, /#login & Desk 01 / Desk 04)
-- =============================================================================
CREATE TABLE IF NOT EXISTS customers (
    id                  VARCHAR(64) PRIMARY KEY,
    username            VARCHAR(80) NOT NULL,
    phone               CHAR(10) NOT NULL,
    email               VARCHAR(160),
    personal_email      VARCHAR(160),
    password_hash       TEXT NOT NULL,
    -- Section 1: Company Information
    company_name        VARCHAR(180) NOT NULL,
    category            VARCHAR(100) DEFAULT 'IT & Software',
    industry            VARCHAR(100) DEFAULT 'Other',
    website             VARCHAR(255) DEFAULT '',
    -- Section 2: Primary Contact Information
    contact_person      VARCHAR(140) NOT NULL,
    -- Section 3: Headquarters & Location
    city                VARCHAR(100) DEFAULT '',
    state               VARCHAR(100) DEFAULT 'Maharashtra',
    country             VARCHAR(100) DEFAULT 'India',
    -- Operational & Onboarding Flags
    group_id            VARCHAR(64) REFERENCES customer_groups(id) ON DELETE SET NULL,
    status              VARCHAR(24) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended', 'inactive')),
    profile_status      VARCHAR(24) NOT NULL DEFAULT 'complete'
                        CHECK (profile_status IN ('incomplete', 'complete')),
    payment_status      VARCHAR(24) NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending', 'paid')),
    kyc_percent         SMALLINT NOT NULL DEFAULT 100
                        CHECK (kyc_percent BETWEEN 0 AND 100),
    verified            BOOLEAN NOT NULL DEFAULT TRUE,
    is_self_registered  BOOLEAN NOT NULL DEFAULT TRUE,
    registered_from     VARCHAR(255) DEFAULT 'http://localhost:5173/#register',
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_customers_phone UNIQUE (phone),
    CONSTRAINT uq_customers_username UNIQUE (username),
    CONSTRAINT chk_customers_phone_10digits CHECK (phone ~ '^[0-9]{10}$')
);

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_profile_status ON customers(profile_status);
CREATE INDEX IF NOT EXISTS idx_customers_payment_status ON customers(payment_status);
CREATE INDEX IF NOT EXISTS idx_customers_category ON customers(category);

-- =============================================================================
-- 2B. CUSTOMER GROUP MEMBERSHIPS (Many-to-Many Group Assignment)
-- =============================================================================
CREATE TABLE IF NOT EXISTS customer_group_memberships (
    id              VARCHAR(64) PRIMARY KEY,
    group_id        VARCHAR(64) NOT NULL
                    REFERENCES customer_groups(id) ON DELETE CASCADE,
    customer_id     VARCHAR(64) NOT NULL
                    REFERENCES customers(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_group_customer UNIQUE (group_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_cgm_group ON customer_group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_customer ON customer_group_memberships(customer_id);

-- =============================================================================
-- 3. CUSTOMER MARKETING WALLETS (Portal /app/lead#app/wallet & Sales Desk 06)
-- =============================================================================
CREATE TABLE IF NOT EXISTS wallets (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL UNIQUE
                        REFERENCES customers(id) ON DELETE CASCADE,
    available_balance   NUMERIC(12, 2) NOT NULL DEFAULT 0.00
                        CHECK (available_balance >= 0),
    daily_ad_spend      NUMERIC(10, 2) NOT NULL DEFAULT 300.00
                        CHECK (daily_ad_spend >= 300.00),
    total_lifetime_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00
                        CHECK (total_lifetime_paid >= 0),
    total_ad_spent      NUMERIC(12, 2) NOT NULL DEFAULT 0.00
                        CHECK (total_ad_spent >= 0),
    ad_campaign_active  BOOLEAN NOT NULL DEFAULT FALSE,
    last_deducted_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_customer_id ON wallets(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallets_available_balance ON wallets(available_balance);

-- =============================================================================
-- 4. WALLET TRANSACTIONS LEDGER (Isolated Per-Customer Credit & Daily Auto-Debit)
-- =============================================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    wallet_id           VARCHAR(64)
                        REFERENCES wallets(id) ON DELETE CASCADE,
    tx_type             VARCHAR(16) NOT NULL
                        CHECK (tx_type IN ('Credit', 'Debit')),
    amount              NUMERIC(12, 2) NOT NULL
                        CHECK (amount > 0),
    balance_after       NUMERIC(12, 2) NOT NULL
                        CHECK (balance_after >= 0),
    reference_utr       VARCHAR(120) NOT NULL,
    description         TEXT NOT NULL,
    payment_method      VARCHAR(100) NOT NULL DEFAULT 'Razorpay Secure (UPI/Card)',
    status              VARCHAR(40) NOT NULL DEFAULT 'Verified ✓',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevents duplicate wallet credit for the same Bank UTR / Razorpay payment ID
    CONSTRAINT uq_wallet_tx_credit_ref UNIQUE (reference_utr)
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_customer_id ON wallet_transactions(customer_id, created_at DESC);

-- =============================================================================
-- 5. PAYMENT COLLECTION & TOP-UP LEDGER (Sales Desk 05: /sales#payments)
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_records (
    id                  VARCHAR(64) PRIMARY KEY,
    receipt_number      VARCHAR(64) NOT NULL UNIQUE,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    company_name        VARCHAR(180) NOT NULL,
    contact_person      VARCHAR(140) NOT NULL,
    phone               CHAR(10) NOT NULL,
    city                VARCHAR(100) DEFAULT 'India',
    tx_type             VARCHAR(32) NOT NULL DEFAULT 'topup'
                        CHECK (tx_type IN ('topup', 'registration', 'invoice')),
    amount              NUMERIC(12, 2) NOT NULL CHECK (amount >= 300),
    gst_amount          NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount        NUMERIC(12, 2) NOT NULL,
    payment_mode        VARCHAR(100) NOT NULL DEFAULT 'Razorpay UPI / Online',
    utr_reference       VARCHAR(120) NOT NULL,
    status              VARCHAR(24) NOT NULL DEFAULT 'paid'
                        CHECK (status IN ('paid', 'pending', 'overdue')),
    days_overdue        INT NOT NULL DEFAULT 0,
    notes               TEXT,
    paid_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_customer_id ON payment_records(customer_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_records_status ON payment_records(status);

-- =============================================================================
-- 6. OFFICIAL TAX INVOICES (Isolated Per-Customer in /app/lead#app/wallet)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tax_invoices (
    id                  VARCHAR(64) PRIMARY KEY,
    invoice_no          VARCHAR(64) NOT NULL UNIQUE,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    payment_record_id   VARCHAR(64)
                        REFERENCES payment_records(id) ON DELETE SET NULL,
    particulars         VARCHAR(255) NOT NULL DEFAULT 'Meta Ads Campaign Ad Spend Budget Credit',
    sac_code            VARCHAR(16) NOT NULL DEFAULT '998311',
    base_amount         NUMERIC(12, 2) NOT NULL,
    cgst_amount         NUMERIC(12, 2) NOT NULL,
    sgst_amount         NUMERIC(12, 2) NOT NULL,
    total_amount        NUMERIC(12, 2) NOT NULL,
    payment_mode        VARCHAR(140) NOT NULL,
    status              VARCHAR(24) NOT NULL DEFAULT 'Paid',
    issued_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_invoices_customer_id ON tax_invoices(customer_id, created_at DESC);

-- =============================================================================
-- 7. PENDING VERIFICATIONS QUEUE (Sales Desk 02: /sales#verification)
-- =============================================================================
CREATE TABLE IF NOT EXISTS pending_verifications (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL UNIQUE
                        REFERENCES customers(id) ON DELETE CASCADE,
    company_name        VARCHAR(180) NOT NULL,
    contact_person      VARCHAR(140) NOT NULL,
    phone               CHAR(10) NOT NULL,
    package_tier        VARCHAR(140) DEFAULT 'Self-Registered (Wallet Top-Up)',
    amount              NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    daily_rate          NUMERIC(10, 2) NOT NULL DEFAULT 300.00,
    utr_number          VARCHAR(120) DEFAULT 'Awaiting Payment',
    payment_status      VARCHAR(24) NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending', 'verified', 'paid')),
    profile_status      VARCHAR(24) NOT NULL DEFAULT 'complete'
                        CHECK (profile_status IN ('incomplete', 'complete')),
    queue_type          VARCHAR(48) NOT NULL DEFAULT 'Payment Pending'
                        CHECK (queue_type IN ('Both Incomplete', 'Payment Pending', 'Profile Pending', 'Profile Only Incomplete', 'Completed')),
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_verifications_queue ON pending_verifications(queue_type);

-- =============================================================================
-- 7B. MASTER LEADS (Group & Category-Based Lead Distribution)
-- =============================================================================
CREATE TABLE IF NOT EXISTS master_leads (
    id                  VARCHAR(64) PRIMARY KEY,
    title               VARCHAR(200) NOT NULL,
    description         TEXT DEFAULT '',
    category            VARCHAR(100) NOT NULL,
    group_id            VARCHAR(64) REFERENCES customer_groups(id) ON DELETE SET NULL,
    buyer_name          VARCHAR(140) NOT NULL,
    buyer_phone         CHAR(10) NOT NULL
                        CHECK (buyer_phone ~ '^[6-9][0-9]{9}$'),
    buyer_email         VARCHAR(160) DEFAULT '',
    city                VARCHAR(100) DEFAULT '',
    requirement         TEXT NOT NULL,
    budget              VARCHAR(80) DEFAULT '₹1.5L – ₹3.5L',
    location            VARCHAR(120) DEFAULT '',
    priority            VARCHAR(24) NOT NULL DEFAULT 'Urgent'
                        CHECK (priority IN ('Urgent', 'High', 'Normal')),
    source              VARCHAR(64) NOT NULL DEFAULT 'Direct Intake',
    deadline_date       DATE,
    created_by          VARCHAR(80) NOT NULL DEFAULT 'Admin Operations',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_leads_group ON master_leads(group_id);
CREATE INDEX IF NOT EXISTS idx_master_leads_category ON master_leads(category);
CREATE INDEX IF NOT EXISTS idx_master_leads_created_at ON master_leads(created_at DESC);

-- =============================================================================
-- 8. BUYER LEADS PIPELINE (Sales Desk 03 -> Isolated Customer CRM /app/lead)
-- =============================================================================
CREATE TABLE IF NOT EXISTS leads (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    master_lead_id      VARCHAR(64) REFERENCES master_leads(id) ON DELETE SET NULL,
    customer_phone      CHAR(10) NOT NULL,
    customer_username   VARCHAR(80) NOT NULL,
    company_name        VARCHAR(180) NOT NULL,
    category            VARCHAR(100) DEFAULT 'IT & Software',
    -- Direct Unmasked Buyer Contact Details
    buyer_phone         CHAR(10) NOT NULL
                        CHECK (buyer_phone ~ '^[6-9][0-9]{9}$'),
    display_phone       VARCHAR(20) NOT NULL, -- e.g. '+91 9876543210'
    buyer_name          VARCHAR(140) NOT NULL,
    buyer_email         VARCHAR(160),
    city                VARCHAR(100) DEFAULT '',
    requirement         TEXT NOT NULL DEFAULT 'Inbound Meta Ads Campaign Enquiry',
    budget              VARCHAR(80) DEFAULT '₹1.5L – ₹3.5L',
    source              VARCHAR(64) NOT NULL DEFAULT 'Direct Intake',
    priority            VARCHAR(24) NOT NULL DEFAULT 'Urgent'
                        CHECK (priority IN ('Urgent', 'High', 'Normal')),
    status              VARCHAR(32) NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'New', 'Interested', 'In Follow-up', 'Callback', 'Converted', 'Won', 'Dropped', 'Not Interested', 'qualified')),
    is_hot              BOOLEAN NOT NULL DEFAULT TRUE,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_customer_phone ON leads(customer_phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_master_lead_id ON leads(master_lead_id);

-- =============================================================================
-- 8B. LEAD RECIPIENT ASSIGNMENTS (Independent Per-Customer Status & Interest Tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS lead_assignments (
    id                  VARCHAR(64) PRIMARY KEY,
    master_lead_id      VARCHAR(64) NOT NULL
                        REFERENCES master_leads(id) ON DELETE CASCADE,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    group_id            VARCHAR(64) REFERENCES customer_groups(id) ON DELETE SET NULL,
    customer_lead_id    VARCHAR(64) REFERENCES leads(id) ON DELETE CASCADE,
    status              VARCHAR(32) NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'New', 'Interested', 'In Follow-up', 'Callback', 'Converted', 'Won', 'Dropped', 'Not Interested', 'qualified')),
    response_interest   VARCHAR(32) NOT NULL DEFAULT 'Pending'
                        CHECK (response_interest IN ('Pending', 'Interested', 'In Follow-up', 'Converted', 'Not Interested')),
    response_notes      TEXT DEFAULT '',
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    notification_status VARCHAR(32) NOT NULL DEFAULT 'Delivered'
                        CHECK (notification_status IN ('Queued', 'Delivered', 'Sent', 'Failed')),
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at        TIMESTAMPTZ,
    CONSTRAINT uq_assignment_master_customer UNIQUE (master_lead_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_assign_master ON lead_assignments(master_lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assign_customer ON lead_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_lead_assign_status ON lead_assignments(status);
CREATE INDEX IF NOT EXISTS idx_lead_assign_interest ON lead_assignments(response_interest);

-- =============================================================================
-- 9. CUSTOMER LEAD FOLLOW-UPS QUEUE (Isolated Per-Customer /app/lead#app/follow-ups)
-- =============================================================================
CREATE TABLE IF NOT EXISTS lead_followups (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    lead_id             VARCHAR(64) NOT NULL
                        REFERENCES leads(id) ON DELETE CASCADE,
    scheduled_date      DATE NOT NULL,
    scheduled_time      VARCHAR(32) NOT NULL,
    channel             VARCHAR(32) NOT NULL DEFAULT 'Phone Call'
                        CHECK (channel IN ('Phone Call', 'WhatsApp', 'Meeting')),
    notes               TEXT,
    status              VARCHAR(24) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'completed', 'dismissed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_followups_customer_id ON lead_followups(customer_id, scheduled_date ASC);

-- =============================================================================
-- 10. SUPPORT QUERIES & TICKETS (Sales Desk 07: /sales#queries)
-- =============================================================================
CREATE TABLE IF NOT EXISTS support_queries (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64)
                        REFERENCES customers(id) ON DELETE CASCADE,
    company_name        VARCHAR(180) NOT NULL,
    category            VARCHAR(80) NOT NULL DEFAULT 'Campaign Pacing',
    subject             VARCHAR(255) NOT NULL,
    priority            VARCHAR(24) NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('normal', 'high', 'urgent')),
    sla_breached        BOOLEAN NOT NULL DEFAULT FALSE,
    hours_open          NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    status              VARCHAR(24) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'pending', 'resolved')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_queries_customer_id ON support_queries(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_queries_status ON support_queries(status);

-- =============================================================================
-- 11. SALES EXECUTIVE FOLLOW-UP TASKS (Sales Desk 08: /sales#tasks)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sales_tasks (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64)
                        REFERENCES customers(id) ON DELETE CASCADE,
    company_name        VARCHAR(180) NOT NULL,
    contact_person      VARCHAR(140) NOT NULL,
    phone               CHAR(10) NOT NULL,
    task_type           VARCHAR(120) NOT NULL,
    priority            VARCHAR(24) NOT NULL DEFAULT 'High'
                        CHECK (priority IN ('Urgent', 'High', 'Normal')),
    due_status          VARCHAR(24) NOT NULL DEFAULT 'today'
                        CHECK (due_status IN ('today', 'overdue', 'upcoming')),
    due_time            VARCHAR(64) NOT NULL,
    notes               TEXT,
    status              VARCHAR(24) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'completed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_tasks_due_status ON sales_tasks(due_status, status);

-- =============================================================================
-- 12. UNIFIED VIEWS FOR SALES DESKS (/sales) & CUSTOMER PORTAL (/app/lead)
-- =============================================================================

-- View for Sales Desk 01 (Customer Registrations) & Desk 06 (Wallets & Balances)
CREATE OR REPLACE VIEW vw_sales_customer_accounts AS
SELECT
    c.id,
    c.username,
    c.company_name AS name,
    c.company_name,
    c.contact_person AS contact,
    c.contact_person,
    c.phone,
    c.email,
    c.personal_email,
    c.category,
    c.industry,
    c.website,
    c.city,
    c.state,
    c.country,
    c.status,
    c.profile_status,
    c.payment_status,
    c.kyc_percent,
    c.verified,
    c.registered_from,
    c.registered_at,
    c.completed_at,
    COALESCE(w.available_balance, 0) AS balance,
    COALESCE(w.available_balance, 0) AS wallet_balance,
    COALESCE(w.daily_ad_spend, 300) AS daily_pacing,
    COALESCE(w.total_lifetime_paid, 0) AS amount_paid,
    FLOOR(COALESCE(w.available_balance, 0) / GREATEST(COALESCE(w.daily_ad_spend, 300), 1))::INT AS runway_days,
    (SELECT COUNT(*) FROM leads l WHERE l.customer_id = c.id) AS total_leads_dispatched
FROM customers c
LEFT JOIN wallets w ON w.customer_id = c.id
ORDER BY c.registered_at DESC;


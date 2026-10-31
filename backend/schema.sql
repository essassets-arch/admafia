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
    active_days         VARCHAR(120) NOT NULL DEFAULT 'MON,TUE,WED,THU,FRI',
    schedule_preset     VARCHAR(64) NOT NULL DEFAULT 'weekdays',
    last_deducted_at    TIMESTAMPTZ,
    booked_dates        TEXT NOT NULL DEFAULT '',
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
    contact_name        VARCHAR(140) DEFAULT '',
    contact_email       VARCHAR(160) DEFAULT '',
    contact_phone       VARCHAR(32) DEFAULT '',
    category            VARCHAR(80) NOT NULL DEFAULT 'Campaign Pacing',
    subject             VARCHAR(255) NOT NULL,
    priority            VARCHAR(24) NOT NULL DEFAULT 'Normal',
    assigned_admin      VARCHAR(140) DEFAULT '',
    internal_notes      TEXT DEFAULT '',
    last_replied_at     TIMESTAMPTZ,
    last_replied_by     VARCHAR(140) DEFAULT '',
    sla_breached        BOOLEAN NOT NULL DEFAULT FALSE,
    hours_open          NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    status              VARCHAR(32) NOT NULL DEFAULT 'Open',
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
DROP VIEW IF EXISTS vw_sales_customer_accounts CASCADE;
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
    COALESCE(w.total_ad_spent, 0) AS total_ad_spent,
    COALESCE(w.ad_campaign_active, FALSE) AS ad_campaign_active,
    COALESCE(w.active_days, 'MON,TUE,WED,THU,FRI') AS active_days,
    COALESCE(w.schedule_preset, 'weekdays') AS schedule_preset,
    w.last_deducted_at,
    COALESCE(w.booked_dates, '') AS booked_dates,
    FLOOR(COALESCE(w.available_balance, 0) / GREATEST(COALESCE(w.daily_ad_spend, 300), 1))::INT AS runway_days,
    (SELECT COUNT(*) FROM leads l WHERE l.customer_id = c.id) AS total_leads_dispatched
FROM customers c
LEFT JOIN wallets w ON w.customer_id = c.id
ORDER BY c.registered_at DESC;



-- =============================================================================
-- 13. MARKETING DEPARTMENT TABLES (Ideas, Posts, Reviews, Campaigns, Audit)
-- =============================================================================

CREATE TABLE IF NOT EXISTS marketing_ideas (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    title               VARCHAR(255) NOT NULL,
    objective           VARCHAR(100) NOT NULL
                        CHECK (objective IN ('brand_awareness', 'lead_generation', 'product_promotion', 'festival_campaign', 'customer_engagement')),
    concept             TEXT NOT NULL,
    target_audience     TEXT DEFAULT '',
    caption_suggestions TEXT DEFAULT '',
    call_to_action      VARCHAR(255) DEFAULT '',
    hashtags            TEXT DEFAULT '',
    creative_brief      TEXT DEFAULT '',
    platform            VARCHAR(64) NOT NULL DEFAULT 'Meta Ads (Facebook & Instagram)',
    language            VARCHAR(64) NOT NULL DEFAULT 'English / Hinglish',
    campaign_period     VARCHAR(100) DEFAULT '',
    constraints         TEXT DEFAULT '',
    status              VARCHAR(32) NOT NULL DEFAULT 'Saved'
                        CHECK (status IN ('Draft', 'Saved', 'Archived')),
    created_by          VARCHAR(140) NOT NULL DEFAULT 'Marketing Executive',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_ideas_customer ON marketing_ideas(customer_id, status);

CREATE TABLE IF NOT EXISTS marketing_posts (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    idea_id             VARCHAR(64)
                        REFERENCES marketing_ideas(id) ON DELETE SET NULL,
    title               VARCHAR(255) NOT NULL,
    platform            VARCHAR(64) NOT NULL DEFAULT 'Meta Ads (Facebook & Instagram)',
    caption             TEXT NOT NULL,
    hashtags            TEXT DEFAULT '',
    call_to_action      VARCHAR(255) DEFAULT '',
    media_url           TEXT DEFAULT '',
    media_type          VARCHAR(64) DEFAULT 'image',
    language            VARCHAR(64) NOT NULL DEFAULT 'English / Hinglish',
    campaign_association VARCHAR(255) DEFAULT '',
    intended_publish_at TIMESTAMPTZ,
    status              VARCHAR(40) NOT NULL DEFAULT 'Draft',
    submitted_by        VARCHAR(140),
    submitted_at        TIMESTAMPTZ,
    revision_number     INT NOT NULL DEFAULT 1,
    creative_format     VARCHAR(64) DEFAULT 'Instagram / Facebook Post',
    designer_notes      TEXT DEFAULT '',
    designer_name       VARCHAR(140) DEFAULT 'Graphics Designer',
    creative_instructions TEXT DEFAULT '',
    priority            VARCHAR(40) DEFAULT 'Normal',
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at          TIMESTAMPTZ,
    deleted_by          VARCHAR(140),
    created_by          VARCHAR(140) NOT NULL DEFAULT 'Marketing Content Team',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_posts_customer ON marketing_posts(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_posts_status ON marketing_posts(status);

-- Multi-Version Artwork Revisions Table for Graphics Department
-- Retention Policy: Uses ON DELETE RESTRICT to guarantee audit retention of historical creative iterations
CREATE TABLE IF NOT EXISTS marketing_post_revisions (
    id                  VARCHAR(64) PRIMARY KEY,
    post_id             VARCHAR(64) NOT NULL
                        REFERENCES marketing_posts(id) ON DELETE RESTRICT,
    revision_number     INT NOT NULL DEFAULT 1,
    media_url           TEXT NOT NULL,
    media_type          VARCHAR(64) DEFAULT 'image',
    creative_format     VARCHAR(64) DEFAULT 'Instagram / Facebook Post',
    designer_notes      TEXT DEFAULT '',
    uploaded_by         VARCHAR(140) NOT NULL DEFAULT 'Graphics Designer',
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    review_status       VARCHAR(40) DEFAULT 'Pending Verification',
    reviewer_name       VARCHAR(140),
    review_remarks      TEXT DEFAULT '',
    rejection_reason    TEXT DEFAULT '',
    correction_instructions TEXT DEFAULT '',
    reviewed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_revisions_post ON marketing_post_revisions(post_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS marketing_post_reviews (
    id                  VARCHAR(64) PRIMARY KEY,
    post_id             VARCHAR(64) NOT NULL
                        REFERENCES marketing_posts(id) ON DELETE CASCADE,
    revision_number     INT NOT NULL DEFAULT 1,
    reviewer_name       VARCHAR(140) NOT NULL,
    reviewer_role       VARCHAR(100) NOT NULL DEFAULT 'Marketing Reviewer',
    decision            VARCHAR(40) NOT NULL
                        CHECK (decision IN ('Approved', 'Rejected', 'Changes Requested')),
    remarks             TEXT DEFAULT '',
    rejection_reason    TEXT DEFAULT '',
    correction_instructions TEXT DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_reviews_post ON marketing_post_reviews(post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    objective           VARCHAR(100) NOT NULL,
    post_id             VARCHAR(64) NOT NULL
                        REFERENCES marketing_posts(id) ON DELETE RESTRICT,
    platform            VARCHAR(64) NOT NULL DEFAULT 'Meta Ads (Facebook & Instagram)',
    target_audience     TEXT DEFAULT '',
    start_date          TIMESTAMPTZ NOT NULL,
    end_date            TIMESTAMPTZ,
    daily_budget        NUMERIC(10, 2) NOT NULL DEFAULT 300.00
                        CHECK (daily_budget >= 300.00),
    total_budget        NUMERIC(12, 2) DEFAULT 0.00,
    schedule_settings   TEXT DEFAULT '{}',
    status              VARCHAR(40) NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft', 'Running', 'Paused', 'Stopped', 'Completed')),
    external_platform_status VARCHAR(64) NOT NULL DEFAULT 'Not Connected',
    external_campaign_id VARCHAR(120),
    created_by          VARCHAR(140) NOT NULL DEFAULT 'Marketing Manager',
    last_action         VARCHAR(100) DEFAULT 'Created',
    last_actor          VARCHAR(140) DEFAULT 'Marketing Manager',
    last_action_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_customer ON marketing_campaigns(customer_id, status);

CREATE TABLE IF NOT EXISTS marketing_audit_events (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64)
                        REFERENCES customers(id) ON DELETE CASCADE,
    entity_type         VARCHAR(64) NOT NULL,
    entity_id           VARCHAR(64) NOT NULL,
    action              VARCHAR(100) NOT NULL,
    actor               VARCHAR(140) NOT NULL,
    details             TEXT DEFAULT '{}',
    ip_address          VARCHAR(64) DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_audit_entity ON marketing_audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_marketing_audit_customer ON marketing_audit_events(customer_id, created_at DESC);

-- =============================================================================
-- 15. SUPER ADMIN CONTROL CENTER RELATIONAL TABLES (/superadmin)
-- =============================================================================

-- 15A. Platform & Business System Users
CREATE TABLE IF NOT EXISTS system_users (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
    full_name           VARCHAR(140) NOT NULL,
    email               VARCHAR(160) NOT NULL UNIQUE,
    username            VARCHAR(80) NOT NULL UNIQUE,
    phone               VARCHAR(32),
    password_hash       TEXT NOT NULL,
    role                VARCHAR(60) NOT NULL DEFAULT 'Super Admin',
    department          VARCHAR(64) NOT NULL DEFAULT 'Super Admin',
    permissions         TEXT NOT NULL DEFAULT '["all"]',
    status              VARCHAR(24) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended', 'inactive')),
    last_login_at       TIMESTAMPTZ,
    created_by          VARCHAR(140) DEFAULT 'system',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_users_email ON system_users(email);
CREATE INDEX IF NOT EXISTS idx_system_users_role ON system_users(role, status);
CREATE INDEX IF NOT EXISTS idx_system_users_dept ON system_users(department, status);

-- 15B. Customer Support Query Conversation Thread Messages
CREATE TABLE IF NOT EXISTS support_query_messages (
    id                  VARCHAR(64) PRIMARY KEY,
    query_id            VARCHAR(64) NOT NULL
                        REFERENCES support_queries(id) ON DELETE CASCADE,
    sender_type         VARCHAR(24) NOT NULL
                        CHECK (sender_type IN ('customer', 'admin', 'internal_note')),
    sender_name         VARCHAR(140) NOT NULL,
    message             TEXT NOT NULL,
    is_internal_note    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sqm_query ON support_query_messages(query_id, created_at ASC);

-- 15C. Official Refund Requests Queue
CREATE TABLE IF NOT EXISTS refund_requests (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    wallet_id           VARCHAR(64)
                        REFERENCES wallets(id) ON DELETE SET NULL,
    original_tx_ref     VARCHAR(120),
    amount              NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reason              TEXT NOT NULL,
    supporting_info     TEXT,
    status              VARCHAR(32) NOT NULL DEFAULT 'Pending'
                        CHECK (status IN ('Pending', 'Under Review', 'Approved', 'Rejected', 'Processing', 'Completed', 'Failed')),
    rejection_reason    TEXT,
    review_notes        TEXT,
    reviewed_by         VARCHAR(140),
    reviewed_at         TIMESTAMPTZ,
    provider_ref        VARCHAR(120),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_customer ON refund_requests(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);

-- 15D. Customer Wallet Top-Up Requests Queue
CREATE TABLE IF NOT EXISTS topup_requests (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    wallet_id           VARCHAR(64)
                        REFERENCES wallets(id) ON DELETE SET NULL,
    amount              NUMERIC(12, 2) NOT NULL CHECK (amount >= 300),
    payment_method      VARCHAR(100) NOT NULL DEFAULT 'Razorpay Secure (UPI/Card)',
    reference_utr       VARCHAR(120) NOT NULL UNIQUE,
    payment_evidence_url TEXT,
    notes               TEXT,
    status              VARCHAR(32) NOT NULL DEFAULT 'Pending'
                        CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Processing')),
    rejection_reason    TEXT,
    processed_by        VARCHAR(140),
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topup_requests_customer ON topup_requests(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_topup_requests_status ON topup_requests(status);

-- 15E. Super Admin Comprehensive Audit Event Logs
CREATE TABLE IF NOT EXISTS superadmin_audit_logs (
    id                  VARCHAR(64) PRIMARY KEY,
    actor_id            VARCHAR(64) NOT NULL,
    actor_name          VARCHAR(140) NOT NULL,
    actor_role          VARCHAR(64) NOT NULL DEFAULT 'Super Admin',
    action_type         VARCHAR(80) NOT NULL,
    target_type         VARCHAR(64) NOT NULL,
    target_id           VARCHAR(64) NOT NULL,
    reason              TEXT,
    details             TEXT DEFAULT '{}',
    ip_address          VARCHAR(64) DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_superadmin_audit_target ON superadmin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_superadmin_audit_created ON superadmin_audit_logs(created_at DESC);

-- 15F. Account Block / Activate Status Change History
CREATE TABLE IF NOT EXISTS account_status_history (
    id                  VARCHAR(64) PRIMARY KEY,
    customer_id         VARCHAR(64) NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    previous_status     VARCHAR(24) NOT NULL,
    new_status          VARCHAR(24) NOT NULL,
    reason              TEXT NOT NULL,
    changed_by          VARCHAR(140) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ash_customer ON account_status_history(customer_id, created_at DESC);

/**
 * AdMafia / Growthline CRM — Normalized Client-Side Relational Database Engine
 *
 * Implements strict per-customer multi-tenant isolation (customer_id foreign keys)
 * across all tables used by:
 *   1. Customer Auth & Onboarding (/#register, /#login, /#workspace-setup)
 *   2. Customer CRM Portal (/app/lead#app/dashboard, #app/lead, #app/follow-ups, #app/wallet, #app/profile)
 *   3. Sales Executive 9-Desk Operations Hub (/sales#dashboard, #customers, #verification, #leads, #profiles, #payments, #wallets, #queries, #tasks, #groups)
 */

export const DB_STORAGE_KEYS = {
  ACTIVE_USER: 'growthline_active_user',
  CUSTOMERS: 'growthline_registered_customers',
  VERIFICATIONS: 'growthline_pending_verifications',
  LEADS: 'growthline_all_leads',
  WALLET_TRANSACTIONS: 'growthline_wallet_transactions',
  TAX_INVOICES: 'growthline_wallet_invoices',
  PAYMENT_RECORDS: 'growthline_payment_records',
  SUPPORT_QUERIES: 'growthline_sales_queries',
  SALES_TASKS: 'growthline_sales_tasks',
  CUSTOMER_GROUPS: 'growthline_customer_groups',
};

const readTable = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const writeTable = (key, rows) => {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch (e) {
    console.error(`Failed writing table ${key}`, e);
  }
};

/**
 * Checks whether a record (lead, wallet transaction, invoice, follow-up, payment)
 * belongs to the specified customer account.
 */
export function recordBelongsToCustomer(record, customer) {
  if (!record || !customer) return false;
  const cId = String(customer.id || '').trim();
  const cPhone = String(customer.phone || '').replace(/\D/g, '').slice(-10);
  const cUser = String(customer.username || '').trim().toLowerCase();

  const recCustId = String(record.customerId || '').trim();
  const recCustPhone = String(record.customerPhone || '').replace(/\D/g, '').slice(-10);
  const recCustUser = String(record.customerUsername || '').trim().toLowerCase();

  // Strict conflict guard: if record explicitly belongs to a different customer identity, reject immediately
  if (recCustId && cId && recCustId !== cId) return false;
  if (recCustPhone && cPhone && recCustPhone !== cPhone) return false;
  if (recCustUser && cUser && recCustUser !== cUser) return false;

  // 1. Authoritative Customer ID match
  if (cId && recCustId && recCustId === cId) return true;
  // 2. Authoritative Phone match
  if (cPhone && recCustPhone && recCustPhone === cPhone) return true;
  if (cPhone && record.phone && String(record.phone).replace(/\D/g, '').slice(-10) === cPhone && (record.type === 'topup' || record.type === 'wallet')) return true;
  // 3. Authoritative Username match
  if (cUser && recCustUser && recCustUser === cUser) return true;

  // 4. Company Name match (only fallback when record has no conflicting customer identity)
  const custCompany = (customer.companyName || customer.name || '').trim().toLowerCase();
  const recCompany = (record.company || record.assignedCompany || record.customerCompanyName || '').trim().toLowerCase();
  if (custCompany && recCompany && custCompany.length > 2 && custCompany === recCompany) return true;
  return false;
}

/**
 * Returns all registered customer accounts (for Sales Desks 01, 03, 04, 05, 06, 09).
 */
export function dbGetAllCustomers() {
  return readTable(DB_STORAGE_KEYS.CUSTOMERS);
}

/**
 * Finds a single registered customer by username, email, phone, or id.
 */
export function dbFindCustomerByIdentifier(identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  const digits = clean.replace(/\D/g, '').slice(-10);
  const customers = dbGetAllCustomers();
  return (
    customers.find(
      (c) =>
        (c.id && c.id.toLowerCase() === clean) ||
        (c.username && c.username.toLowerCase() === clean) ||
        (c.email && c.email.toLowerCase() === clean) ||
        (digits.length === 10 && c.phone === digits)
    ) || null
  );
}

/**
 * Queries strictly isolated records for a specific customer.
 */
export function dbGetCustomerIsolatedData(customer) {
  if (!customer) {
    return {
      leads: [],
      transactions: [],
      invoices: [],
      payments: [],
    };
  }
  const allLeads = readTable(DB_STORAGE_KEYS.LEADS);
  const allTransactions = readTable(DB_STORAGE_KEYS.WALLET_TRANSACTIONS);
  const allInvoices = readTable(DB_STORAGE_KEYS.TAX_INVOICES);
  const allPayments = readTable(DB_STORAGE_KEYS.PAYMENT_RECORDS);

  return {
    leads: allLeads.filter((l) => recordBelongsToCustomer(l, customer)),
    transactions: allTransactions.filter((tx) => recordBelongsToCustomer(tx, customer)),
    invoices: allInvoices.filter((inv) => recordBelongsToCustomer(inv, customer)),
    payments: allPayments.filter((p) => recordBelongsToCustomer(p, customer)),
  };
}


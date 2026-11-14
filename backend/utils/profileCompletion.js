/**
 * Authoritative Business Profile Completion Evaluator (Ad Mafia)
 * Ensures truthful KYC / Profile % calculation and strips legacy fake defaults
 * (such as state="Maharashtra" or category="IT & Software" when location was never entered).
 */

const GENERIC_NAMES = new Set([
  '',
  'registered business',
  'corporate workspace',
  'client member',
  'business workspace',
  'registered organization',
  'client account',
]);

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,24}$/;

export function isMeaningfulText(val) {
  const s = String(val || '').trim();
  if (!s) return false;
  return !GENERIC_NAMES.has(s.toLowerCase());
}

export function sanitizeCustomerProfileFields(raw = {}) {
  const city = String(raw.city ?? raw.address?.city ?? '').trim();
  const rawState = String(raw.state ?? raw.address?.state ?? '').trim();

  // Strip legacy hardcoded 'Maharashtra' if customer never entered a city
  const state = !city && rawState.toLowerCase() === 'maharashtra' ? '' : rawState;

  const rawCategory = String(raw.category ?? '').trim();
  const regTs = raw.registeredAt || raw.registered_at ? new Date(raw.registeredAt || raw.registered_at).getTime() : 0;
  const compTs = raw.completedAt || raw.completed_at ? new Date(raw.completedAt || raw.completed_at).getTime() : 0;
  const wasSavedAfterSignup = Boolean(compTs && regTs && compTs - regTs > 5000);

  // Strip legacy schema default 'IT & Software' on self-registered accounts that haven't filled city yet
  const category =
    !city && !wasSavedAfterSignup && rawCategory === 'IT & Software' ? '' : rawCategory;

  const rawIndustry = String(raw.industry ?? '').trim();
  const industry = !city && !wasSavedAfterSignup && rawIndustry === 'Other' ? '' : rawIndustry;

  return { city, state, category, industry };
}

export function evaluateCustomerProfileCompletion(raw = {}) {
  const { city, state, category, industry } = sanitizeCustomerProfileFields(raw);

  const phoneDigits = String(raw.phone || '').replace(/\D/g, '');
  const hasPhone = phoneDigits.length >= 7;
  const hasContact = isMeaningfulText(raw.contactPerson || raw.contact_person || raw.contact);
  const hasCompany = isMeaningfulText(raw.companyName || raw.company_name || raw.name);
  const cleanEmail = String(raw.email || '').trim().toLowerCase();
  const hasEmail = Boolean(cleanEmail && EMAIL_RE.test(cleanEmail) && !cleanEmail.includes('..'));
  const hasCategory = Boolean(category && category.toLowerCase() !== 'unassigned');
  const hasCity = Boolean(city && city.toLowerCase() !== 'india');
  const hasState = Boolean(state);

  const checks = [
    { key: 'phone', label: 'Verified WhatsApp Mobile', weight: 15, ok: hasPhone },
    { key: 'contactPerson', label: 'Contact Person Name', weight: 15, ok: hasContact },
    { key: 'companyName', label: 'Business / Company Name', weight: 15, ok: hasCompany },
    { key: 'email', label: 'Business Email', weight: 15, ok: hasEmail },
    { key: 'category', label: 'Business Category', weight: 15, ok: hasCategory },
    { key: 'city', label: 'Operating City', weight: 15, ok: hasCity },
    { key: 'state', label: 'State / Province', weight: 10, ok: hasState },
  ];

  const kycPercent = checks.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);
  const missingFields = checks.filter((item) => !item.ok).map((item) => item.label);
  const missingKeys = checks.filter((item) => !item.ok).map((item) => item.key);
  const isComplete = kycPercent === 100 && missingFields.length === 0;

  return {
    kycPercent,
    isComplete,
    profileStatus: isComplete ? 'complete' : 'incomplete',
    missingFields,
    missingKeys,
    sanitized: { city, state, category, industry },
  };
}


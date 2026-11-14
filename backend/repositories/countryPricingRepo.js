import { CountryPricing, CountryPricingAuditLog } from '../models/index.js';

/**
 * Country pricing helpers (MongoDB). Maps Mongo documents back to the legacy snake_case
 * row shape that the React frontend and country detection service consume.
 */

export function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mongo CountryPricing doc (lean) -> legacy snake_case row. */
export function countryPricingToRow(d) {
  if (!d) return null;
  return {
    id: String(d._id),
    country_code: d.countryCode,
    country_name: d.countryName,
    currency_code: d.currencyCode,
    currency_symbol: d.currencySymbol,
    currency_position: d.currencyPosition,
    decimal_precision: d.decimalPrecision,
    daily_min_budget: Number(d.dailyMinBudget),
    monthly_budget: Number(d.monthlyBudget),
    min_wallet_topup: Number(d.minWalletTopup),
    tax_name: d.taxName,
    tax_rate: Number(d.taxRate),
    payment_gateway: d.paymentGateway,
    phone_code: d.phoneCode,
    flag_emoji: d.flagEmoji,
    is_active: Boolean(d.isActive),
    is_default: Boolean(d.isDefault),
    effective_date: d.effectiveDate || d.createdAt || null,
    created_at: d.createdAt || null,
    updated_at: d.updatedAt || null,
  };
}

/** Mongo CountryPricingAuditLog doc (lean) -> legacy snake_case row. */
export function countryPricingAuditToRow(d) {
  if (!d) return null;
  return {
    id: String(d._id),
    country_code: d.countryCode,
    country_name: d.countryName,
    old_pricing: d.oldPricing ?? null,
    new_pricing: d.newPricing ?? null,
    changed_by: d.changedBy,
    change_reason: d.changeReason,
    effective_date: d.effectiveDate || d.createdAt || null,
    created_at: d.createdAt || null,
  };
}

/** Active country pricing rows ordered by is_default DESC, country_name ASC. */
export async function listActiveCountryPricingRows() {
  const docs = await CountryPricing.find({ isActive: true }).lean();
  return sortPricingRows(docs.map(countryPricingToRow));
}

export function sortPricingRows(rows) {
  return rows.sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return String(a.country_name || '').localeCompare(String(b.country_name || ''));
  });
}

/** Find a pricing doc by _id, legacy `cp_xx` id or (case-insensitive) country code. */
export async function findCountryPricingByIdOrCode(idOrCode, { session } = {}) {
  const raw = String(idOrCode ?? '');
  const upper = raw.toUpperCase();
  const or = [{ _id: raw }, { countryCode: upper }];
  if (/^cp_/i.test(raw)) or.push({ countryCode: raw.slice(3).toUpperCase() });
  const q = CountryPricing.findOne({ $or: or });
  if (session) q.session(session);
  return q.lean();
}

export { CountryPricing, CountryPricingAuditLog };

/**
 * Sales Executive Department (Department 2) - authoritative data & state
 */

export const currentSalesRep = {
  id: 'rep_01',
  name: 'Sales Executive',
  email: 'sales@growthline.in',
  role: 'Sales Executive',
  department: 'Sales & Revenue Operations',
  monthlyTarget: 250000,
  closedRevenue: 0,
  winRate: '0%',
  avgDealSize: '₹0',
  avgCloseDays: '0 Days',
  territory: 'All India',
};

export const PIPELINE_STAGES = [
  { id: 'discovery', name: 'Discovery', probability: 20, badgeColor: '#3b82f6' },
  { id: 'pitch', name: 'Pitch & Demo', probability: 40, badgeColor: '#8b5cf6' },
  { id: 'proposal', name: 'Proposal Sent', probability: 60, badgeColor: '#f59e0b' },
  { id: 'negotiation', name: 'Negotiation', probability: 80, badgeColor: '#0ea5e9' },
  { id: 'won', name: 'Closed Won', probability: 100, badgeColor: '#10b981' },
];

export const initialDeals = [];

export const COMMERCIAL_PACKAGES = [
  {
    id: 'starter',
    name: 'Starter Runway',
    amount: 10000,
    setupFee: 2500,
    adCredit: 7500,
    dailyRate: 300,
    runwayDays: 25,
    territory: 'Single City / Ahmedabad',
    badge: 'Popular for Local',
  },
  {
    id: 'growth',
    name: 'Growth Booster',
    amount: 25000,
    setupFee: 4000,
    adCredit: 21000,
    dailyRate: 300,
    runwayDays: 70,
    territory: 'Multi-City / State Tier 1',
    badge: '★ Best Value (Recommended)',
  },
  {
    id: 'scale',
    name: 'Scale Enterprise',
    amount: 50000,
    setupFee: 5000,
    adCredit: 45000,
    dailyRate: 300,
    runwayDays: 150,
    territory: 'Pan-India Territory',
    badge: 'Maximum Ad Pacing',
  },
];

export const initialSalesTasks = [];

export function sanitizePhone10(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d]/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function formatINR(val) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);
}

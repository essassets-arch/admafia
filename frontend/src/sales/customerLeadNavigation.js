export function extractCustomerKey(cust) {
  if (!cust) return '';
  if (typeof cust === 'string') return cust.trim();
  return String(
    cust.id || cust.customerId || cust.phone || cust.username || cust.companyName || cust.name || ''
  ).trim();
}

export function buildCustomerLeadHref(custOrKey, mode = 'add', from = 'leads') {
  const key = extractCustomerKey(custOrKey);
  const params = new URLSearchParams();
  if (key) params.set('customer', key);
  params.set('mode', mode === 'history' ? 'history' : 'add');
  if (from) params.set('from', from);
  return `/sales#customer-leads?${params.toString()}`;
}

export function navigateToCustomerLeadPage(custOrKey, mode = 'add', from = 'leads', event = null) {
  if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1)) {
    return; // Allow native middle-click / Ctrl+click new browser tab
  }
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }
  const key = extractCustomerKey(custOrKey);
  const params = new URLSearchParams();
  if (key) params.set('customer', key);
  params.set('mode', mode === 'history' ? 'history' : 'add');
  if (from) params.set('from', from);
  const nextHash = `#customer-leads?${params.toString()}`;
  try {
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    const scroller = document.querySelector('.sales-content-scroll');
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (_) {}
}

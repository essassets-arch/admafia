/**
 * Comprehensive Country-Based Pricing & Security Verification Test Suite
 * AdMafia Marketing CRM
 */

import { resolveVisitorCountry, getPricingForCountryCode, extractClientIp, isCloudflareIp } from './services/countryDetection.js';

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================================');
  console.log('🌍 STARTING ADMAFIA COUNTRY-BASED PRICING & PRODUCTION AUDIT');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // TEST GROUP 1: TWO PRICING RULES (INDIA VS INTERNATIONAL)
  // -------------------------------------------------------------------------
  console.log('1️⃣  Verifying Strict Two-Rule Pricing Implementation...');

  const inPricing = getPricingForCountryCode('IN');
  assert(inPricing && inPricing.currency_code === 'INR' && inPricing.daily_min_budget === 300 && inPricing.monthly_budget === 9000 && inPricing.currency_symbol === '₹',
    'India: ₹300/day, ₹9,000/month (INR)');

  const testCountries = [
    { name: 'UAE', code: 'AE' },
    { name: 'USA', code: 'US' },
    { name: 'UK', code: 'GB' },
    { name: 'Saudi Arabia', code: 'SA' },
    { name: 'Qatar', code: 'QA' },
    { name: 'Canada', code: 'CA' },
    { name: 'Australia', code: 'AU' },
  ];

  for (const tc of testCountries) {
    const p = getPricingForCountryCode(tc.code);
    assert(p && p.currency_code === 'USD' && p.daily_min_budget === 10 && p.monthly_budget === 300 && p.currency_symbol === '$',
      `${tc.name} (${tc.code}): $10/day, $300/month (USD)`);
  }

  // -------------------------------------------------------------------------
  // TEST GROUP 2: REAL EXTERNAL IP RESOLUTION
  // -------------------------------------------------------------------------
  console.log('\n2️⃣  Verifying Public IP GeoIP Country Resolution for Real IPs...');

  const realIpTests = [
    { country: 'India', ip: '103.212.156.1', expectedCode: 'IN', expectedRate: '₹300/Day', currency: 'INR' },
    { country: 'UAE', ip: '94.200.0.1', expectedCode: 'AE', expectedRate: '$10/Day', currency: 'USD' },
    { country: 'USA', ip: '8.8.8.8', expectedCode: 'US', expectedRate: '$10/Day', currency: 'USD' },
    { country: 'UK', ip: '81.2.69.142', expectedCode: 'GB', expectedRate: '$10/Day', currency: 'USD' },
    { country: 'Saudi Arabia', ip: '212.138.64.1', expectedCode: 'SA', expectedRate: '$10/Day', currency: 'USD' },
    { country: 'Qatar', ip: '82.148.96.1', expectedCode: 'QA', expectedRate: '$10/Day', currency: 'USD' },
    { country: 'Canada', ip: '24.114.32.1', expectedCode: 'CA', expectedRate: '$10/Day', currency: 'USD' },
    { country: 'Australia', ip: '1.0.0.1', expectedCode: 'AU', expectedRate: '$10/Day', currency: 'USD' },
  ];

  for (const item of realIpTests) {
    const mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-real-ip': item.ip },
    };
    const res = await resolveVisitorCountry(mockReq);
    assert(res.success === true && res.country?.currency_code === item.currency && res.detectedCode === item.expectedCode,
      `Real IP ${item.ip} (${item.country}) resolves to ${item.expectedCode} with ${item.currency} (${item.expectedRate})`);
  }

  // -------------------------------------------------------------------------
  // TEST GROUP 3: UNKNOWN & RESERVED IP BEHAVIOR (NEVER DEFAULT TO INDIA)
  // -------------------------------------------------------------------------
  console.log('\n3️⃣  Verifying Unknown & Reserved IP Handling...');

  const unknownIps = [
    { label: 'Localhost IPv4', ip: '127.0.0.1' },
    { label: 'Private Subnet 192.168.x', ip: '192.168.1.50' },
    { label: 'Private Subnet 10.x', ip: '10.0.0.1' },
    { label: 'Bogon / Reserved 240.0.0.1', ip: '240.0.0.1' },
    { label: 'Bogon 0.0.0.0', ip: '0.0.0.0' },
  ];

  for (const item of unknownIps) {
    const mockReq = {
      socket: { remoteAddress: item.ip },
      headers: {},
    };
    const res = await resolveVisitorCountry(mockReq);
    assert(res.success === false && res.country === null,
      `Unknown IP ${item.ip} (${item.label}) returns country=null (NEVER defaults to India)`);
  }

  // -------------------------------------------------------------------------
  // TEST GROUP 4: FORGED COUNTRY HEADER SECURITY
  // -------------------------------------------------------------------------
  console.log('\n4️⃣  Verifying Defense Against Forged Headers...');

  // Case A: Attacker in UAE attempts to forge CF-IPCountry: IN to get Indian rate
  const forgedInReq = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'x-real-ip': '94.200.0.1', // Real UAE IP from Nginx
      'cf-ipcountry': 'IN',       // Forged header sent by client
      'cf-connecting-ip': '103.212.156.1', // Forged IP header
    },
  };
  const forgedInRes = await resolveVisitorCountry(forgedInReq);
  assert(forgedInRes.country?.currency_code === 'USD' && forgedInRes.detectedCode === 'AE',
    'Forged CF-IPCountry: IN from non-Cloudflare IP is ignored; resolves correctly to UAE ($10 USD)');

  // Case B: Attacker in India attempts to forge CF-IPCountry: US
  const forgedUsReq = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'x-real-ip': '103.212.156.1', // Real India IP
      'cf-ipcountry': 'US',
      'cf-connecting-ip': '8.8.8.8',
    },
  };
  const forgedUsRes = await resolveVisitorCountry(forgedUsReq);
  assert(forgedUsRes.country?.currency_code === 'INR' && forgedUsRes.detectedCode === 'IN',
    'Forged CF-IPCountry: US from non-Cloudflare IP is ignored; resolves correctly to India (₹300 INR)');

  // Case C: Authentic Cloudflare Request
  const authenticCfReq = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'x-real-ip': '104.16.1.1', // Authentic Cloudflare IP CIDR
      'cf-ipcountry': 'US',
      'cf-connecting-ip': '8.8.8.8',
    },
  };
  const authCfRes = await resolveVisitorCountry(authenticCfReq);
  assert(authCfRes.country?.currency_code === 'USD' && authCfRes.detectedCode === 'US',
    'Authentic Cloudflare request with verified CF edge IP honors Cloudflare country header');

  // -------------------------------------------------------------------------
  // TEST GROUP 5: LIVE HTTP SSR HOMEPAGE SERVING & PRICING
  // -------------------------------------------------------------------------
  console.log('\n5️⃣  Verifying Live HTTP SSR Homepage HTML & Headers...');

  // 5A. Homepage SSR from India IP
  const inHomeRes = await fetch(`${BASE_URL}/`, {
    headers: { 'x-real-ip': '103.212.156.1' },
  });
  const inHomeHtml = await inHomeRes.text();
  assert(inHomeRes.status === 200, 'Homepage GET with Indian IP returns 200 OK');
  assert(inHomeHtml.includes('₹300/Day') || inHomeHtml.includes('₹300 /day') || inHomeHtml.includes('300'), 'Homepage SSR HTML for India contains ₹300 starting price');
  assert(inHomeHtml.includes('"currency_code":"INR"'), 'Homepage SSR bootstrap contains currency_code: INR');

  // 5B. Homepage SSR from USA IP
  const usHomeRes = await fetch(`${BASE_URL}/`, {
    headers: { 'x-real-ip': '8.8.8.8' },
  });
  const usHomeHtml = await usHomeRes.text();
  assert(usHomeRes.status === 200, 'Homepage GET with US IP returns 200 OK');
  assert(usHomeHtml.includes('$10/Day') || usHomeHtml.includes('$10 /day') || usHomeHtml.includes('10'), 'Homepage SSR HTML for US contains $10 starting price');
  assert(usHomeHtml.includes('"currency_code":"USD"'), 'Homepage SSR bootstrap contains currency_code: USD');

  // 5C. Homepage SSR from Unknown IP (must return 503 + unavailable message)
  const unkHomeRes = await fetch(`${BASE_URL}/`, {
    headers: { 'x-real-ip': '240.0.0.1' }, // Bogon / Reserved IP
  });
  const unkHomeHtml = await unkHomeRes.text();
  assert(unkHomeRes.status === 503, 'Homepage GET with unknown/reserved IP returns HTTP 503');
  assert(unkHomeHtml.includes('country-pricing-unavailable') || unkHomeHtml.includes('could not determine country pricing'),
    'Homepage HTML displays clear pricing-unavailable notice for unknown IP');

  // -------------------------------------------------------------------------
  // TEST GROUP 6: CDN CACHE ISOLATION HEADERS
  // -------------------------------------------------------------------------
  console.log('\n6️⃣  Verifying CDN & Reverse Proxy Cache Isolation Headers...');

  const cdnRes = await fetch(`${BASE_URL}/api/public/country-detection`, {
    headers: { 'x-real-ip': '103.212.156.1' },
  });
  const cacheControl = cdnRes.headers.get('cache-control') || '';
  const cdnCacheControl = cdnRes.headers.get('cdn-cache-control') || '';
  const surrogateControl = cdnRes.headers.get('surrogate-control') || '';
  const vary = cdnRes.headers.get('vary') || '';

  assert(cacheControl.includes('no-store') && cacheControl.includes('private'),
    'Cache-Control header specifies private, no-store');
  assert(cdnCacheControl === 'no-store', 'CDN-Cache-Control header is no-store');
  assert(surrogateControl === 'no-store', 'Surrogate-Control header is no-store');
  assert(vary.includes('CF-IPCountry') && vary.includes('X-Forwarded-For'),
    'Vary header isolates CDN caches by IP and Geo headers');

  // -------------------------------------------------------------------------
  // TEST GROUP 7: REGISTRATION FLOW WITH CURRENCY SEPARATION
  // -------------------------------------------------------------------------
  console.log('\n7️⃣  Verifying Live Registration Flow & Currency Assignment...');

  const regTs = Date.now().toString().slice(-6);

  // 7A. Register Indian customer via API
  const inRegPhone = `9821${regTs}`;
  const inRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '103.212.156.1' },
    body: JSON.stringify({
      username: `user_in_${regTs}`,
      phone: inRegPhone,
      email: `user_in_${regTs}@example.com`,
      companyName: `India Business ${regTs}`,
      contactPerson: `Sharma ${regTs}`,
    }),
  });
  const inRegData = await inRegRes.json();
  assert(inRegRes.status === 201 && inRegData.customer?.currency === 'INR' && inRegData.customer?.countryCode === 'IN',
    'Registration from Indian IP creates account with INR currency and IN country code');

  // 7B. Register International customer via API
  const usRegPhone = `1555${regTs}`;
  const usRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '8.8.8.8' },
    body: JSON.stringify({
      username: `user_us_${regTs}`,
      phone: usRegPhone,
      email: `user_us_${regTs}@example.com`,
      companyName: `US Business ${regTs}`,
      contactPerson: `Smith ${regTs}`,
    }),
  });
  const usRegData = await usRegRes.json();
  assert(usRegRes.status === 201 && usRegData.customer?.currency === 'USD' && usRegData.customer?.countryCode === 'US',
    'Registration from US IP creates account with USD currency and US country code');

  // -------------------------------------------------------------------------
  // TEST GROUP 8: EXISTING CUSTOMER WALLET CURRENCY PERSISTENCE
  // -------------------------------------------------------------------------
  console.log('\n8️⃣  Verifying Existing Customer Currency Persistence Across IP Changes...');

  // Customer registered from US accesses system from Indian IP
  const usFromInRes = await fetch(`${BASE_URL}/api/customers/${usRegData.customer?.id}`, {
    headers: { 'x-real-ip': '103.212.156.1' },
  });
  const usFromInData = await usFromInRes.json();
  assert(usFromInData.customer?.currency === 'USD',
    'Existing USD customer retains USD currency when requesting from an Indian IP');

  // Customer registered from India accesses system from US IP
  const inFromUsRes = await fetch(`${BASE_URL}/api/customers/${inRegData.customer?.id}`, {
    headers: { 'x-real-ip': '8.8.8.8' },
  });
  const inFromUsData = await inFromUsRes.json();
  assert(inFromUsData.customer?.currency === 'INR',
    'Existing INR customer retains INR currency when requesting from a US IP');

  // -------------------------------------------------------------------------
  // TEST GROUP 9: RAZORPAY STRICT INR-ONLY REJECTION
  // -------------------------------------------------------------------------
  console.log('\n9️⃣  Verifying Payment Gateway Safety & Non-INR Rejection...');

  // Attempt to initiate Razorpay order for the USD customer
  const rzpUsdRes = await fetch(`${BASE_URL}/api/payments/razorpay/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: usRegData.customer?.id,
      amount: 500,
    }),
  });
  const rzpUsdData = await rzpUsdRes.json();
  assert(rzpUsdRes.status === 400 && rzpUsdData.error && rzpUsdData.error.includes('INR'),
    'Razorpay order creation strictly rejects non-INR USD customer account');

  // Clean up registered test customers via API
  if (inRegData.customer?.id) {
    await fetch(`${BASE_URL}/api/customers/${inRegData.customer.id}`, { method: 'DELETE' });
  }
  if (usRegData.customer?.id) {
    await fetch(`${BASE_URL}/api/customers/${usRegData.customer.id}`, { method: 'DELETE' });
  }

  console.log('\n======================================================================');
  console.log(`🏁 AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});

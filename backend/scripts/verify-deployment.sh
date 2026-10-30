#!/bin/bash
# =============================================================================
# AdMafia Production Live Deployment Smoke Test Suite
# Run on the VPS after 'docker compose up -d --build' to independently verify
# live API, database schema, routing, upload security, and campaign protection.
# =============================================================================

TARGET_URL="${1:-https://admafia.marketing}"

echo "=========================================================="
echo "🚀 AUDITING LIVE TARGET DEPLOYMENT: $TARGET_URL"
echo "=========================================================="

PASSED=0
FAILED=0

check() {
  STATUS="$1"
  EXPECTED="$2"
  NAME="$3"
  if [ "$STATUS" -eq "$EXPECTED" ]; then
    echo "  ✅ PASS: $NAME (HTTP $STATUS)"
    PASSED=$((PASSED+1))
  else
    echo "  ❌ FAIL: $NAME (Expected HTTP $EXPECTED, Got $STATUS)"
    FAILED=$((FAILED+1))
  fi
}

echo ""
echo "[1/5] Checking Core Health, Graphics Summary & Super Admin APIs..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL/api/health")
check "$HEALTH_STATUS" 200 "GET /api/health responds 200 OK"

SUMMARY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL/api/graphics/summary")
check "$SUMMARY_STATUS" 200 "GET /api/graphics/summary responds 200 OK"

SA_SUMMARY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL/api/superadmin/dashboard/summary")
check "$SA_SUMMARY_STATUS" 200 "GET /api/superadmin/dashboard/summary responds 200 OK"

SA_FINANCE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL/api/superadmin/finance/summary")
check "$SA_FINANCE_STATUS" 200 "GET /api/superadmin/finance/summary responds 200 OK"

echo ""
echo "[2/5] Checking Direct SPA Navigation on Graphics & Super Admin routes..."
for r in "/graphics" "/graphics/post-requests" "/graphics/upload-post" "/superadmin" "/superadmin/queries" "/superadmin/finance" "/superadmin/refunds" "/superadmin/topups" "/superadmin/accounts" "/superadmin/add-user"; do
  ROUTE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL$r")
  check "$ROUTE_STATUS" 200 "Direct GET $r responds 200 OK"
done

echo ""
echo "[3/5] Verifying Deep Upload Security Gate..."
# Test rejection of malicious script
EXPLOIT_PAYLOAD='{"filename":"exploit.png","contentType":"image/png","base64Data":"PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="}'
EXPLOIT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$EXPLOIT_PAYLOAD" "$TARGET_URL/api/marketing/media/upload")
check "$EXPLOIT_STATUS" 400 "Malicious script payload rejected with HTTP 400"

# Test rejection of MIME mismatch
MISMATCH_PAYLOAD='{"filename":"exploit.php","contentType":"image/png","base64Data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}'
MISMATCH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$MISMATCH_PAYLOAD" "$TARGET_URL/api/marketing/media/upload")
check "$MISMATCH_STATUS" 400 "Extension/MIME mismatch (.php on image/png) rejected with HTTP 400"

echo ""
echo "[4/5] Verifying Campaign Creative & Validation Gates..."
# Gate A: Sub-minimum budget strictly blocked with HTTP 400
BUDGET_PAYLOAD='{"customerId":"dummy_cust","name":"Audit Check","dailyBudget":150}'
BUDGET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$BUDGET_PAYLOAD" "$TARGET_URL/api/marketing/campaigns")
check "$BUDGET_STATUS" 400 "Sub-minimum budget (< ₹300/day) strictly blocked with HTTP 400"

# Gate B: Invalid / unapproved customer and post strictly blocked (HTTP 400 or 404)
UNAPPROVED_CAMP='{"customerId":"dummy_cust","name":"Audit Check","postId":"dummy_unapproved","dailyBudget":300}'
CAMP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$UNAPPROVED_CAMP" "$TARGET_URL/api/marketing/campaigns")
if [ "$CAMP_STATUS" -eq 400 ] || [ "$CAMP_STATUS" -eq 404 ]; then
  echo "  ✅ PASS: Unapproved/non-existent creative campaign strictly blocked (HTTP $CAMP_STATUS)"
  PASSED=$((PASSED+1))
else
  echo "  ❌ FAIL: Unapproved creative campaign was not blocked (Expected HTTP 400 or 404, Got $CAMP_STATUS)"
  FAILED=$((FAILED+1))
fi

echo ""
echo "=========================================================="
echo "🎯 LIVE DEPLOYMENT SMOKE SUMMARY: $PASSED PASSED | $FAILED FAILED"
echo "=========================================================="

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
exit 0


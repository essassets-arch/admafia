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
echo "[1/4] Checking Core Health & Graphics Summary..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL/api/health")
check "$HEALTH_STATUS" 200 "GET /api/health responds 200 OK"

SUMMARY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL/api/graphics/summary")
check "$SUMMARY_STATUS" 200 "GET /api/graphics/summary responds 200 OK"

echo ""
echo "[2/4] Checking Direct SPA Navigation on Graphics routes..."
for r in "/graphics" "/graphics/post-requests" "/graphics/upload-post" "/graphics/approved-posts" "/graphics/rejected-posts"; do
  ROUTE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL$r")
  check "$ROUTE_STATUS" 200 "Direct GET $r responds 200 OK"
done

echo ""
echo "[3/4] Verifying Deep Upload Security Gate..."
# Test rejection of malicious script
EXPLOIT_PAYLOAD='{"filename":"exploit.png","contentType":"image/png","base64Data":"PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="}'
EXPLOIT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$EXPLOIT_PAYLOAD" "$TARGET_URL/api/marketing/media/upload")
check "$EXPLOIT_STATUS" 400 "Malicious script payload rejected with HTTP 400"

# Test rejection of MIME mismatch
MISMATCH_PAYLOAD='{"filename":"exploit.php","contentType":"image/png","base64Data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}'
MISMATCH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$MISMATCH_PAYLOAD" "$TARGET_URL/api/marketing/media/upload")
check "$MISMATCH_STATUS" 400 "Extension/MIME mismatch (.php on image/png) rejected with HTTP 400"

echo ""
echo "[4/4] Verifying Campaign Creative Gate..."
# Test unapproved post rejection
UNAPPROVED_CAMP='{"customerId":"dummy_cust","name":"Audit Check","postId":"dummy_unapproved","dailyBudget":300}'
CAMP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$UNAPPROVED_CAMP" "$TARGET_URL/api/marketing/campaigns")
check "$CAMP_STATUS" 400 "Unapproved post rejected from campaign with HTTP 400"

echo ""
echo "=========================================================="
echo "🎯 LIVE DEPLOYMENT SMOKE SUMMARY: $PASSED PASSED | $FAILED FAILED"
echo "=========================================================="

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
exit 0

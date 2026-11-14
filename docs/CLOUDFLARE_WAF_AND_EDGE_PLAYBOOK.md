# AdMafia Cloudflare WAF, Edge Rate-Limiting & Origin Lockdown Playbook

**Domain**: `https://admafia.marketing`  
**Target Scale**: 10,000+ Concurrent Business Accounts  
**Architecture**: Cloudflare Anycast Edge ➔ Origin Firewall (`ufw` Cloudflare IP Lock) ➔ Nginx Reverse Proxy ➔ Hardened Express API + Redis + MongoDB 7.0 Replica Set (`rs0`) / Atlas `M10`.

---

## 1. SSL/TLS & Transport Hardening
1. **SSL/TLS Encryption Mode**: Set strictly to **Full (Strict)** using a 15-year Cloudflare Origin Certificate installed on host Nginx (`/etc/ssl/cloudflare/admafia.pem` & `admafia.key`).
2. **Authenticated Origin Pulls (mTLS)**: Enable **Authenticated Origin Pulls** so Nginx rejects any HTTPS request not cryptographically signed by Cloudflare's client CA.
3. **HSTS**: Enable HSTS (`Max-Age: 12 months`, `Include Subdomains: On`, `No-Sniff: On`, `Preload: On`).
4. **Minimum TLS Version**: `TLS 1.2` (with `TLS 1.3` + `0-RTT` enabled for static assets only).

---

## 2. Cloudflare WAF & Bot Protection Rules
Enable **Cloudflare Managed Ruleset** + **OWASP Core Ruleset**, then configure these 4 custom WAF & Rate-Limiting rules:

### Rule 1 — WhatsApp OTP Bombing & Credential Stuffing Shield
- **Expression**:
  ```txt
  (http.request.uri.path eq "/api/auth/otp/send" and http.request.method eq "POST")
  ```
- **Action**: Rate Limit — **6 requests per 10 minutes per `cf.colo.id` + Client IP** ➔ Block for 30 minutes (`429 Too Many Requests`).

### Rule 2 — Auth Login Brute-Force Shield
- **Expression**:
  ```txt
  (http.request.uri.path in {"/api/auth/login" "/api/auth/admin-login" "/api/auth/otp/verify"} and http.request.method eq "POST")
  ```
- **Action**: Rate Limit — **20 requests per 5 minutes per Client IP** ➔ Managed Challenge / Block.

### Rule 3 — Webhook Bypass Exemption (Razorpay & Meta WhatsApp)
- **Expression**:
  ```txt
  (http.request.uri.path in {"/api/payments/razorpay/webhook" "/api/webhooks/whatsapp"})
  ```
- **Action**: Skip **Browser Integrity Check** & **Bot Fight Mode** (server-side HMAC signature verification enforces authenticity inside Express).

### Rule 4 — Department Admin Geo/ASN Protection (Optional Zero-Trust)
- Protect `/superadmin*` and `/api/superadmin/*` with **Cloudflare Zero Trust Access** (Google Workspace / Email OTP PIN) for founder-level defense-in-depth.

---

## 3. Caching Rules (Zero Cross-Visitor Price or Session Bleed)
1. **Bypass Cache on Dynamic HTML & API**:
   - Match: `http.request.uri.path eq "/"` OR `http.request.uri.path starts_with "/api/"`
   - Cache Eligibility: **Bypass Cache** (ensures `CF-IPCountry` server-side pricing `₹300/day` vs `$10/day` and `HttpOnly` auth cookies are never cached at the edge).
2. **Aggressive Edge Cache on Hashed Vite Bundles**:
   - Match: `http.request.uri.path starts_with "/assets/"`
   - Edge TTL: **1 year (`immutable`)** — offloads >92% of bandwidth at 10,000+ users.

---

## 4. VPS Origin Firewall Lockdown (`ufw` Script)
Never allow attackers to scan your VPS IP directly on ports `80`, `443`, `5000`, `5050`, or `27017` to bypass Cloudflare WAF! Run this script on the VPS as root:

```bash
#!/usr/bin/env bash
set -euo pipefail

ufw default deny incoming
ufw default allow outgoing

# Keep SSH restricted (replace 22 or restrict to admin static IP / Tailscale)
ufw allow 22/tcp

# Allow HTTP/HTTPS ONLY from official Cloudflare IPv4 & IPv6 ranges
for ip in $(curl -fsSL https://www.cloudflare.com/ips-v4); do
  ufw allow proto tcp from "$ip" to any port 80,443 comment 'Cloudflare IPv4'
done

for ip6 in $(curl -fsSL https://www.cloudflare.com/ips-v6); do
  ufw allow proto tcp from "$ip6" to any port 80,443 comment 'Cloudflare IPv6'
done

# Explicitly ensure Docker internal ports are bound to 127.0.0.1 in docker-compose.yml
ufw --force enable
ufw status numbered
```


/**
 * Zero-Drop Mobile & Desktop Razorpay Checkout Orchestrator
 *
 * Solves mobile UPI / App-Switch / In-App WebView payment drops end-to-end:
 *  1. Detects social/ad In-App WebViews (Instagram, Facebook, WhatsApp, etc.) & mobile browsers.
 *  2. Persists `admafia_pending_rzp_order` in localStorage BEFORE opening checkout so background
 *     tab eviction or app-switching to GPay / PhonePe / Paytm auto-reconciles on return.
 *  3. Enables Razorpay top-level `callback_url` + `redirect: true` inside In-App WebViews and
 *     `callback_url` on mobile browsers so UPI deep-links (`upi://`, `intent://`) never get trapped in iframes.
 *  4. Prioritizes UPI Intent apps at the top of mobile checkout, formats `+91` contact, uses valid
 *     `/AdMafia-Logo.png`, enables 4x in-modal retry, and guards against accidental mobile close.
 *  5. Reconciles server-to-server on `ondismiss`, tab focus, `visibilitychange`, and page reload.
 */

export const PENDING_RZP_ORDER_KEY = 'admafia_pending_rzp_order';
const ORDER_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
const inFlightReconciliations = new Map();

export function detectRazorpayEnvironment() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isInAppWebView: false, isMobileDevice: false, source: 'desktop' };
  }
  const ua = String(navigator.userAgent || navigator.vendor || '');

  const isSocialOrEmbeddedWebView =
    /Instagram|FBAN|FBAV|FB_IAB|FBIOS|FB4A|WhatsApp|Line\/|LinkedInApp|Snapchat|Telegram|Twitter|MicroMessenger|; wv\)|\bwv\b/i.test(
      ua
    ) ||
    (/(iPhone|iPod|iPad)/i.test(ua) && !/Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua));

  const isMobileUa =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
    (window.innerWidth <= 860 && ('ontouchstart' in window || Number(navigator.maxTouchPoints || 0) > 0));

  const isInAppWebView = Boolean(isSocialOrEmbeddedWebView);
  const isMobileDevice = Boolean(isInAppWebView || isMobileUa);
  const source = isInAppWebView ? 'mobile_webview' : isMobileDevice ? 'mobile_browser' : 'desktop';

  return { isInAppWebView, isMobileDevice, source };
}

export function savePendingRazorpayOrder(orderMeta) {
  if (typeof window === 'undefined' || !orderMeta?.orderId) return;
  try {
    localStorage.setItem(
      PENDING_RZP_ORDER_KEY,
      JSON.stringify({
        ...orderMeta,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function getPendingRazorpayOrder() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_RZP_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.orderId) return null;
    if (parsed.savedAt && Date.now() - Number(parsed.savedAt) > ORDER_MAX_AGE_MS) {
      localStorage.removeItem(PENDING_RZP_ORDER_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingRazorpayOrder(expectedOrderId = null) {
  if (typeof window === 'undefined') return;
  try {
    if (!expectedOrderId) {
      localStorage.removeItem(PENDING_RZP_ORDER_KEY);
      return;
    }
    const current = getPendingRazorpayOrder();
    if (!current || current.orderId === expectedOrderId) {
      localStorage.removeItem(PENDING_RZP_ORDER_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadRazorpaySdk(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timer = setTimeout(() => finish(Boolean(window.Razorpay)), timeoutMs);

    const existing = document.querySelector('script[src*="checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => {
        clearTimeout(timer);
        finish(Boolean(window.Razorpay));
      });
      existing.addEventListener('error', () => {
        clearTimeout(timer);
        finish(false);
      });
      // Poll briefly in case script finished loading right before listener attached
      setTimeout(() => {
        if (window.Razorpay) {
          clearTimeout(timer);
          finish(true);
        }
      }, 250);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      finish(Boolean(window.Razorpay));
    };
    script.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };
    document.body.appendChild(script);
  });
}

/**
 * Reconciles a pending Razorpay order against the backend (which queries Razorpay API directly
 * and auto-captures any `authorized` payment). Safe to call repeatedly; deduplicates in-flight calls.
 */
export async function reconcilePendingOrderWithBackend(crmApi, overrideMeta = null) {
  const meta = overrideMeta || getPendingRazorpayOrder();
  if (!meta?.orderId || !crmApi?.reconcileRazorpayOrder) return null;

  const key = `${meta.orderId}:${meta.paymentId || ''}`;
  if (inFlightReconciliations.has(key)) {
    return inFlightReconciliations.get(key);
  }

  const promise = (async () => {
    try {
      const res = await crmApi.reconcileRazorpayOrder({
        orderId: meta.orderId,
        paymentId: meta.paymentId || undefined,
        customerId: meta.customerId || undefined,
        phone: meta.phone || undefined,
        username: meta.username || undefined,
      });

      if (res?.status === 'paid') {
        clearPendingRazorpayOrder(meta.orderId);
        try {
          window.dispatchEvent(
            new CustomEvent('admafia_razorpay_order_paid', {
              detail: {
                ...res,
                amount: Number(res.amount || meta.amount || 0),
                orderId: meta.orderId,
              },
            })
          );
        } catch {
          // Ignore custom event errors
        }
      } else if (res?.status === 'failed' || res?.status === 'expired') {
        clearPendingRazorpayOrder(meta.orderId);
      }

      return res;
    } catch (err) {
      console.warn('[Razorpay Reconcile] Check warning:', err?.message || err);
      return null;
    } finally {
      inFlightReconciliations.delete(key);
    }
  })();

  inFlightReconciliations.set(key, promise);
  return promise;
}

/**
 * Unified Standard Checkout Launcher for MarketingWallet, AddFundsModal & MarketingGrowthPaymentModal.
 */
export async function launchRazorpayStandardCheckout({
  crmApi,
  customer,
  amount,
  description,
  onOrderCreated,
  onBeforeOpen,
  onVerified,
  onFailed,
  onDismissed,
  onPendingConfirmation,
}) {
  const numericAmount = Number(amount || 0);
  const cleanPhone = String(customer?.phone || customer?.username || '')
    .replace(/\D/g, '')
    .slice(-10);
  const { isInAppWebView, isMobileDevice, source } = detectRazorpayEnvironment();

  // Run SDK readiness check & backend order creation concurrently to minimize tap-to-open latency on mobile
  const [sdkReady, orderRes] = await Promise.all([
    loadRazorpaySdk(),
    crmApi.createRazorpayOrder({
      customerId: customer?.id,
      phone: cleanPhone || customer?.phone,
      username: customer?.username,
      amount: numericAmount,
      source,
    }),
  ]);

  if (!orderRes?.ok || !orderRes?.orderId) {
    throw new Error(orderRes?.error || 'Could not start Razorpay checkout. Please try again.');
  }

  if (onOrderCreated) {
    onOrderCreated(orderRes);
  }

  const pendingMeta = {
    orderId: orderRes.orderId,
    customerId: customer?.id || orderRes?.customer?.id || '',
    phone: cleanPhone,
    username: customer?.username || '',
    amount: numericAmount,
    source,
  };
  savePendingRazorpayOrder(pendingMeta);

  // Fallback to Hosted Razorpay Payment Link if checkout.js was blocked by network/adblocker
  if (!sdkReady || typeof window === 'undefined' || !window.Razorpay) {
    const linkRes = await crmApi.createRazorpayPaymentLink({
      customerId: customer?.id,
      phone: cleanPhone,
      username: customer?.username,
      amount: numericAmount,
    });
    if (linkRes?.paymentUrl) {
      window.location.assign(linkRes.paymentUrl);
      return { redirectedToPaymentLink: true, orderRes };
    }
    throw new Error('Payment gateway SDK could not be loaded. Please check your internet connection and retry.');
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://admafia.marketing';
  const callbackUrl = orderRes.callbackUrl || `${origin}/api/payments/razorpay/callback`;
  const prefillContact = cleanPhone.length === 10 ? `+91${cleanPhone}` : undefined;
  const prefillName =
    customer?.contactPerson ||
    customer?.companyName ||
    customer?.name ||
    customer?.username ||
    'Ad Mafia Customer';
  const prefillEmail = customer?.email || `${cleanPhone || 'client'}@admafia.marketing`;

  let verificationCompleted = false;
  let lastFailedError = null;

  const options = {
    key: orderRes.keyId,
    amount: orderRes.amount,
    currency: orderRes.currency || 'INR',
    name: 'Ad Mafia',
    description:
      description || `Growth Wallet Instant Top-Up (₹${numericAmount.toLocaleString('en-IN')})`,
    image: `${origin}/AdMafia-Logo.png`,
    order_id: orderRes.orderId,
    prefill: {
      name: prefillName,
      ...(prefillContact ? { contact: prefillContact } : {}),
      email: prefillEmail,
    },
    notes: {
      customer_id: String(customer?.id || ''),
      customer_phone: cleanPhone,
      customer_username: String(customer?.username || ''),
      checkout_source: source,
    },
    retry: {
      enabled: true,
      max_count: 4,
    },
    timeout: 900,
    theme: {
      color: '#4f46e5',
    },
    // On In-App WebViews (Instagram/Facebook/WhatsApp), top-level redirect prevents iframe UPI deep-link blocks.
    // On Mobile Browsers, callback_url provides server-side POST capture if background tab reloads during UPI PIN entry.
    ...(isInAppWebView
      ? {
          callback_url: callbackUrl,
          redirect: true,
        }
      : isMobileDevice
        ? {
            callback_url: callbackUrl,
          }
        : {}),
    ...(isMobileDevice
      ? {
          config: {
            display: {
              blocks: {
                upi_fast: {
                  name: 'Pay via UPI Apps (GPay, PhonePe, Paytm)',
                  instruments: [{ method: 'upi' }],
                },
              },
              sequence: ['block.upi_fast', 'block.other'],
              preferences: {
                show_default_blocks: true,
              },
            },
          },
        }
      : {}),
    handler: async function (response) {
      verificationCompleted = true;
      const paymentId = response?.razorpay_payment_id;
      const orderId = response?.razorpay_order_id || orderRes.orderId;
      const signature = response?.razorpay_signature;

      savePendingRazorpayOrder({ ...pendingMeta, orderId, paymentId });

      const verifyPayload = {
        orderId,
        paymentId,
        signature,
        customerId: customer?.id,
        phone: cleanPhone,
        username: customer?.username,
        amount: numericAmount,
      };

      const attemptVerify = async (attempt = 0) => {
        try {
          const verifyRes = await crmApi.verifyRazorpayPayment(verifyPayload);
          if (verifyRes?.ok) {
            clearPendingRazorpayOrder(orderId);
            if (onVerified) {
              await onVerified({
                amount: numericAmount,
                paymentId,
                orderId,
                verifyRes,
              });
            }
            return true;
          }
          throw new Error(verifyRes?.error || 'Payment verification pending.');
        } catch (err) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            return attemptVerify(attempt + 1);
          }
          // Fallback to server-to-server order reconciliation
          const recRes = await reconcilePendingOrderWithBackend(crmApi, {
            ...pendingMeta,
            orderId,
            paymentId,
          });
          if (recRes?.status === 'paid') {
            if (onVerified) {
              await onVerified({
                amount: Number(recRes.amount || numericAmount),
                paymentId: recRes.paymentId || paymentId,
                orderId,
                verifyRes: recRes,
              });
            }
            return true;
          }
          throw err;
        }
      };

      try {
        await attemptVerify(0);
      } catch (vErr) {
        if (onPendingConfirmation) {
          onPendingConfirmation({
            amount: numericAmount,
            paymentId,
            orderId,
            verifyPayload,
            error: vErr,
          });
        }
      }
    },
    modal: {
      backdropclose: false,
      escape: false,
      handleback: true,
      confirm_close: true,
      animation: true,
      ondismiss: async function () {
        if (verificationCompleted) return;

        // CRITICAL MOBILE SAFETY: Check server-to-server BEFORE assuming checkout was abandoned!
        // Frequently a user authorizes in GPay/PhonePe, switches back, and closes the sheet right as capture finishes.
        const rec = await reconcilePendingOrderWithBackend(crmApi, pendingMeta);
        if (rec?.status === 'paid') {
          verificationCompleted = true;
          if (onVerified) {
            await onVerified({
              amount: Number(rec.amount || numericAmount),
              paymentId: rec.paymentId,
              orderId: orderRes.orderId,
              verifyRes: rec,
            });
          }
          return;
        }

        if (rec?.status === 'pending') {
          // A UPI collect/intent attempt is still live — re-check once more in 4.5s instead of logging a false dismiss!
          if (onPendingConfirmation) {
            onPendingConfirmation({
              amount: numericAmount,
              paymentId: rec.paymentId || orderRes.orderId,
              orderId: orderRes.orderId,
              verifyPayload: null,
            });
          }
          setTimeout(() => {
            reconcilePendingOrderWithBackend(crmApi, pendingMeta);
          }, 4500);
          return;
        }

        clearPendingRazorpayOrder(orderRes.orderId);

        if (lastFailedError) {
          if (onFailed) {
            onFailed(lastFailedError);
          }
          return;
        }

        const dismissRef = `DISMISS-${orderRes.orderId}`;
        if (onDismissed) {
          onDismissed({
            dismissRef,
            orderId: orderRes.orderId,
            amount: numericAmount,
          });
        }
      },
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', function (resp) {
    const failReason = resp?.error?.description || resp?.error?.reason || 'Payment declined by bank or UPI app';
    const failRef = resp?.error?.metadata?.payment_id || `FAIL-${orderRes.orderId}`;
    lastFailedError = {
      failReason,
      failRef,
      orderId: orderRes.orderId,
      amount: numericAmount,
      raw: resp,
    };
    // Note: Because `retry.enabled = true`, Razorpay lets the customer retry inside the modal!
    // We record the failure if they don't succeed and dismiss, OR notify immediately if non-retryable.
    try {
      crmApi
        .recordFailedTransaction({
          customerId: customer?.id,
          phone: customer?.phone,
          username: customer?.username,
          companyName: customer?.companyName || customer?.name,
          amount: numericAmount,
          referenceUtr: failRef,
          description: `Online recharge failed: ${failReason}`,
          failureReason: failReason,
          paymentMethod: 'Razorpay Secure',
        })
        .catch(() => {});
    } catch {
      // Non-fatal
    }
  });

  if (onBeforeOpen) {
    onBeforeOpen(orderRes);
  }

  rzp.open();
  return { rzp, orderRes };
}

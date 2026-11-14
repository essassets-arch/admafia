import React, { useState, useEffect, useRef } from 'react';
import {
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Lock,
  User,
  Mail,
  Phone,
  Building2,
  AtSign,
  Check,
  CheckCircle2,
  AlertCircle,
  Zap,
  MessageSquare,
  Wallet,
  Target,
} from 'lucide-react';
import crmApi from '../services/crmApi';
import countryService, { formatDailyRate, formatDailyBudget } from '../services/countryService';
import WhatsAppOtpModal from '../components/WhatsAppOtpModal';
import { evaluateCustomerProfileCompletion } from '../utils/profileCompletion';

const STRICT_EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,24}$/;

function validateOptionalEmail(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { isEmpty: true, isValid: true, message: '' };
  }
  if (/\s/.test(trimmed) || trimmed.includes('..') || !STRICT_EMAIL_REGEX.test(trimmed)) {
    return {
      isEmpty: false,
      isValid: false,
      message: 'Please enter a valid email address (e.g. name@company.com) or leave blank.',
    };
  }
  return { isEmpty: false, isValid: true, message: 'Valid email format' };
}

function computePasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '#e2e8f0' };
  if (pwd.length < 6) return { score: 1, label: 'Too short (minimum 6 characters)', color: '#ef4444' };
  let score = 2;
  if (pwd.length >= 8 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score = 3;
  if (pwd.length >= 10 && /[^A-Za-z0-9]/.test(pwd)) score = 4;
  const map = {
    2: { label: 'Fair password', color: '#f59e0b' },
    3: { label: 'Good password', color: '#3b82f6' },
    4: { label: 'Strong password', color: '#10b981' },
  };
  return { score, ...map[score] };
}

function sanitizeStoredCustomer(cust) {
  if (!cust || typeof cust !== 'object') return cust;
  const copy = { ...cust };
  delete copy.password;
  delete copy.passwordHash;
  copy.passwordMasked = '••••••••••••';
  return copy;
}

const PIXEL_ID = '1124252446675289';

function ensureAnalyticsPixel() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  try {
    if (!window.fbq) {
      const n = (window.fbq = function (...args) {
        if (n.callMethod) {
          n.callMethod.apply(n, args);
        } else {
          n.queue.push(args);
        }
      });
      if (!window._fbq) window._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      const t = document.createElement('script');
      t.async = true;
      t.src = 'https://connect.facebook.net/en_US/fbevents.js';
      t.onerror = () => {};
      const s = document.getElementsByTagName('script')[0];
      if (s && s.parentNode) s.parentNode.insertBefore(t, s);
      else document.head.appendChild(t);
    }
    if (!window.__amPixelInitialized) {
      window.__amPixelInitialized = true;
      window.fbq('init', PIXEL_ID);
    }
    return window.fbq;
  } catch {
    return null;
  }
}

export function CustomerRegisterPage({ onRegistered, onSwitchToLogin, onBackToWebsite }) {
  const [selectedCountry, setSelectedCountry] = useState(() => countryService.getCurrentCountry());

  useEffect(() => {
    return countryService.subscribe((country) => {
      if (country) setSelectedCountry(country);
    });
  }, []);

  // Track every Register Page visit with Pixel 1124252446675289 (both direct /register loads & SPA transitions)
  useEffect(() => {
    try {
      const pathLower = (window.location.pathname || '').toLowerCase();
      const hashLower = (window.location.hash || '').toLowerCase();
      if (!pathLower.includes('register') && !hashLower.includes('register')) {
        window.history.replaceState({}, '', '/#register');
      }

      const fbqFn = ensureAnalyticsPixel();
      if (!fbqFn) return;

      const currentUrl = (window.location.pathname || '/') + (window.location.hash || '');
      const initialUrl = window.__amInitialPixelUrl || '';
      if (!initialUrl || initialUrl !== currentUrl) {
        fbqFn('track', 'PageView');
      }
      window.__amInitialPixelUrl = null;

      fbqFn('track', 'ViewContent', {
        content_name: 'Register Page',
        content_category: 'Account Registration',
      });
      fbqFn('trackCustom', 'RegisterPageVisit', {
        page: currentUrl,
      });
    } catch {
      // Ignore client ad-blocker restrictions
    }
  }, []);

  // Step 1: Verify WhatsApp | Step 2: Email & Business Details | Step 3: Password & Confirm
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    mobile: '',
    email: '',
    contactPerson: '',
    companyName: '',
    username: '',
    password: '',
    confirmPassword: '',
    terms: true,
  });

  // Step 1 Inline WhatsApp OTP State
  const [otpSent, setOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpVerificationToken, setOtpVerificationToken] = useState('');
  const [verifiedMobile, setVerifiedMobile] = useState('');
  const otpRefs = useRef([]);

  // Step 2 Live Username Availability Check
  const [usernameStatus, setUsernameStatus] = useState({
    state: 'idle', // 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
    message: '',
  });
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false);

  // Step 3 Password Visibility
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Real-time debounced username check when user is on Step 2
  useEffect(() => {
    const clean = formData.username.trim().replace(/^@/, '');
    if (!clean) {
      setUsernameStatus({ state: 'idle', message: '' });
      return undefined;
    }
    if (clean.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(clean)) {
      setUsernameStatus({
        state: 'invalid',
        message: 'Use at least 3 letters, numbers, underscores, or dots.',
      });
      return undefined;
    }

    setUsernameStatus({ state: 'checking', message: 'Checking availability...' });
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await crmApi.checkUsernameAvailability(clean);
        if (cancelled) return;
        if (res?.available) {
          setUsernameStatus({ state: 'available', message: `@${clean} is available` });
        } else {
          setUsernameStatus({
            state: 'taken',
            message: res?.reason || `@${clean} is already taken`,
          });
        }
      } catch {
        if (!cancelled) {
          setUsernameStatus({ state: 'idle', message: '' });
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.username]);

  if (!selectedCountry) {
    return (
      <main role="status">
        Registration is unavailable because we could not determine your billing country. Please retry from a network with a public IP.
      </main>
    );
  }

  const isIndia = selectedCountry?.country_code === 'IN';
  const phoneCode = isIndia ? '+91' : '';
  const dailyRateText = formatDailyRate(selectedCountry);
  const dailyBudgetText = formatDailyBudget(selectedCountry);

  const cleanMobile = formData.mobile.trim();
  const isPhoneValid = isIndia
    ? /^[6-9][0-9]{9}$/.test(cleanMobile)
    : /^[0-9]{7,15}$/.test(cleanMobile);

  const emailCheck = validateOptionalEmail(formData.email);
  const pwdStrength = computePasswordStrength(formData.password);
  const confirmTyped = formData.confirmPassword.length > 0;
  const passwordsMatch =
    formData.password.length >= 6 && formData.password === formData.confirmPassword;

  // Step 1A: Send WhatsApp OTP
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!isPhoneValid) {
      setError(
        isIndia
          ? 'Please enter a valid 10-digit Indian WhatsApp mobile number.'
          : 'Please enter a valid WhatsApp phone number (7 to 15 digits).'
      );
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const otpRes = await crmApi.sendWhatsAppOtp({
        phone: cleanMobile,
        countryCode: selectedCountry.country_code,
        purpose: 'register',
      });
      setOtpSent(true);
      setOtpDigits(['', '', '', '', '', '']);
      setMaskedPhone(otpRes.maskedPhone || `${phoneCode} ${cleanMobile}`);
      setResendCooldown(Number(otpRes.resendCooldownSeconds || otpRes.resendAfterSeconds || 60));
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (apiErr) {
      let msg = apiErr.message || 'Could not send WhatsApp verification code. Please try again.';
      if (msg.toLowerCase().includes('already exists') || apiErr.status === 409) {
        msg = 'An account with this WhatsApp number already exists. Please sign in to your workspace.';
      }
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 1B: Handle 6-digit OTP inputs & paste
  const handleOtpDigitChange = (index, rawVal) => {
    const digit = rawVal.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setError('');
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i += 1) {
      next[i] = pasted[i];
    }
    setOtpDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  const handleVerifyOtpStep = async (e) => {
    if (e) e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits of your WhatsApp verification code.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const verRes = await crmApi.verifyWhatsAppOtp({
        phone: cleanMobile,
        countryCode: selectedCountry.country_code,
        otp: code,
        purpose: 'register',
      });
      setOtpVerificationToken(verRes.otpVerificationToken);
      setVerifiedMobile(cleanMobile);
      setStep(2);
    } catch (verErr) {
      setError(verErr.message || 'Invalid verification code. Please check WhatsApp and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPhoneStep = () => {
    setOtpSent(false);
    setOtpDigits(['', '', '', '', '', '']);
    setOtpVerificationToken('');
    setVerifiedMobile('');
    setError('');
    setStep(1);
  };

  // Auto-suggest clean username when company/contact name is typed (until user edits username directly)
  const handleCompanyOrNameChange = (field, val) => {
    const updated = { ...formData, [field]: val };
    if (!usernameManuallyEdited) {
      const seed = (field === 'companyName' ? val : updated.companyName || val)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 20);
      if (seed.length >= 3) {
        updated.username = seed;
      }
    }
    setFormData(updated);
  };

  // Step 2 -> Step 3 validation
  const handleContinueFromStep2 = async (e) => {
    e.preventDefault();
    setError('');

    if (!emailCheck.isValid) {
      setError(emailCheck.message);
      return;
    }
    if (formData.contactPerson.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (formData.companyName.trim().length < 2) {
      setError('Please enter your business or company name.');
      return;
    }
    const cleanUser = formData.username.trim().replace(/^@/, '');
    if (cleanUser.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(cleanUser)) {
      setError('Workspace username must be at least 3 characters (letters, numbers, underscores, or dots).');
      return;
    }
    if (usernameStatus.state === 'taken') {
      setError(usernameStatus.message || 'This username is already taken. Please choose another.');
      return;
    }

    setIsSubmitting(true);
    try {
      const check = await crmApi.checkUsernameAvailability(cleanUser);
      if (check && check.available === false) {
        setUsernameStatus({
          state: 'taken',
          message: check.reason || `@${cleanUser} is already taken`,
        });
        setError(check.reason || `The username "@${cleanUser}" is already taken.`);
        return;
      }
      setStep(3);
    } catch {
      setStep(3);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3 Final Account Creation
  const handleFinalCreateAccount = async (e) => {
    e.preventDefault();
    setError('');

    if (!otpVerificationToken || !verifiedMobile) {
      setError('Please verify your WhatsApp number first.');
      setStep(1);
      return;
    }
    if (!emailCheck.isValid) {
      setError(emailCheck.message);
      setStep(2);
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match. Please re-enter the exact same password in both fields.');
      return;
    }
    if (!formData.terms) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }

    const cleanUser = formData.username.trim().replace(/^@/, '');
    const cleanCompany = formData.companyName.trim();
    const cleanContact = formData.contactPerson.trim();
    const cleanEmail = formData.email.trim().toLowerCase();

    setIsSubmitting(true);
    try {
      let newCustomer = {
        id: `cust_reg_${verifiedMobile}`,
        username: cleanUser,
        name: cleanCompany,
        companyName: cleanCompany,
        contact: cleanContact,
        contactPerson: cleanContact,
        phone: verifiedMobile,
        email: cleanEmail,
        passwordMasked: '••••••••••••',
        city: '',
        state: '',
        country: selectedCountry.country_name,
        countryCode: selectedCountry.country_code,
        currency: selectedCountry.currency_code,
        currencySymbol: selectedCountry.currency_symbol,
        category: '',
        industry: '',
        website: '',
        domain: '',
        status: 'active',
        profileStatus: 'incomplete',
        profile_status: 'incomplete',
        kycPercent: 40,
        paymentStatus: 'pending',
        payment_status: 'pending',
        amountPaid: 0,
        totalLifetimePaid: 0,
        dailyPacing: selectedCountry.daily_min_budget || (isIndia ? 300 : 10),
        dailyAdSpend: selectedCountry.daily_min_budget || (isIndia ? 300 : 10),
        balance: 0,
        walletBalance: 0,
        runwayDays: 0,
        verified: true,
        phoneVerified: true,
        isSelfRegistered: true,
        completedAt: new Date().toISOString(),
        registeredAt: new Date().toLocaleString('en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        registeredFrom: window.location.origin + '/#register',
      };

      const dbCustomer = await crmApi.registerCustomer({
        username: cleanUser,
        phone: verifiedMobile,
        email: cleanEmail,
        password: formData.password,
        companyName: cleanCompany,
        contactPerson: cleanContact,
        country: selectedCountry.country_name,
        countryCode: selectedCountry.country_code,
        currency: selectedCountry.currency_code,
        initialBudget: selectedCountry.daily_min_budget,
        otpVerificationToken,
      });

      if (dbCustomer) {
        newCustomer = sanitizeStoredCustomer({ ...newCustomer, ...dbCustomer, phoneVerified: true });
      } else {
        newCustomer = sanitizeStoredCustomer(newCustomer);
      }
      const regEval = evaluateCustomerProfileCompletion(newCustomer);
      newCustomer.kycPercent = regEval.kycPercent;
      newCustomer.profileStatus = regEval.profileStatus;
      newCustomer.profile_status = regEval.profileStatus;

      try {
        const fbqFn = ensureAnalyticsPixel();
        if (fbqFn) {
          fbqFn('track', 'CompleteRegistration', {
            status: true,
            currency: selectedCountry?.currency_code || 'INR',
          });
        }
      } catch {
        // Ignore client ad-blocker restrictions
      }

      try {
        localStorage.setItem('growthline_active_user', JSON.stringify(newCustomer));
        window.dispatchEvent(new CustomEvent('growthline_customer_registered', { detail: newCustomer }));
      } catch (storageErr) {
        console.error('Failed to hydrate active customer session', storageErr);
      }

      if (onRegistered) {
        onRegistered(newCustomer);
      } else {
        window.history.pushState({}, '', '/app/lead#app/dashboard');
        window.location.hash = '#app/dashboard';
        window.location.href = '/app/lead#app/dashboard';
      }
    } catch (regErr) {
      const msg = regErr.message || 'Registration could not be completed. Please review your details.';
      if (msg.toLowerCase().includes('username')) {
        setStep(2);
      }
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-fullpage-shell">
      <header className="auth-fullpage-topbar">
        <div className="auth-fullpage-topbar-inner">
          <div
            className="auth-fullpage-brand"
            onClick={onBackToWebsite}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Ad Mafia Marketing"
          >
            <img src="/AdMafia-Logo.png" alt="Ad Mafia Marketing" className="auth-topbar-logo" />
          </div>
          <div className="auth-fullpage-topbar-actions">
            <span className="auth-topbar-Question">Already have an account?</span>
            <button type="button" className="auth-topbar-switch-btn" onClick={onSwitchToLogin}>
              Sign In to Workspace
            </button>
            <button type="button" className="auth-topbar-back-btn" onClick={onBackToWebsite}>
              ← Back to Website
            </button>
          </div>
        </div>
      </header>

      <main className="auth-fullpage-grid">
        <section className="auth-fullpage-showcase">
          <div className="auth-showcase-inner">
            <div className="auth-showcase-topbar">
              <img src="/AdMafia-Logo.png" alt="Ad Mafia Marketing" className="auth-brand-logo" />
              <div className="auth-top-badge">
                <span className="auth-pulse-dot" />
                <span>WHATSAPP VERIFIED ONBOARDING</span>
              </div>
            </div>

            <div className="auth-hero-block">
              <h1 className="auth-showcase-heading">
                Start receiving verified buyer enquiries{' '}
                <span className="auth-showcase-highlight">from {dailyRateText}.</span>
              </h1>
              <p className="auth-showcase-subtext">
                Create your dedicated <strong>Ad Mafia Business Workspace</strong> in 3 simple steps with instant WhatsApp OTP verification. Top up your growth wallet, configure your target city &amp; industry, and receive real-time customer names and unmasked mobile numbers.
              </p>
            </div>

            <div className="auth-showcase-live-card">
              <div className="auth-live-card-header">
                <div className="auth-live-status-group">
                  <span className="auth-pulse-dot" />
                  <span className="auth-live-header-tag">LIVE BUYER LEAD DISPATCH PREVIEW</span>
                </div>
                <div className="auth-live-delivery-pill">
                  <Zap size={12} color="#10b981" />
                  <span>Instant CRM Delivery</span>
                </div>
              </div>

              <div className="auth-live-card-lead-row">
                <div className="auth-live-lead-avatar">VM</div>
                <div className="auth-live-lead-details">
                  <div className="auth-live-lead-name-row">
                    <span className="auth-lead-name">Vikram Mehta</span>
                    <span className="auth-lead-tag-verified">Verified Buyer ✓</span>
                  </div>
                  <div className="auth-lead-phone-row">
                    <span className="auth-lead-phone">{phoneCode} 97•••• 6167</span>
                    <span className="auth-lead-phone-badge">Direct Unmasked Mobile</span>
                  </div>
                  <div className="auth-lead-intent-sub">
                    Verified Buyer Enquiry • Routed to Your CRM Inbox
                  </div>
                </div>
                <div className="auth-live-lead-actions">
                  <span className="auth-action-chip call">
                    <Phone size={12} /> Direct Call
                  </span>
                  <span className="auth-action-chip wa">
                    <MessageSquare size={12} /> WhatsApp
                  </span>
                </div>
              </div>

              <div className="auth-live-card-metrics">
                <div className="auth-metric-item">
                  <small>Minimum Daily Budget</small>
                  <strong>{dailyBudgetText} / Day</strong>
                  <span className="auth-metric-sub">100% Towards Verified Leads</span>
                </div>
                <div className="auth-metric-item highlight">
                  <small>Setup &amp; Platform Fee</small>
                  <strong>Free</strong>
                  <span className="auth-metric-sub">Zero Hidden Cut</span>
                </div>
                <div className="auth-metric-item">
                  <small>Lead Exclusivity</small>
                  <strong>100% Direct</strong>
                  <span className="auth-metric-sub">Never Shared or Resold</span>
                </div>
              </div>
            </div>

            <div className="auth-showcase-steps">
              <div className="auth-showcase-step-item">
                <div className="auth-step-icon emerald">
                  <CheckCircle2 size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>1. WhatsApp Verified Business Identity</h4>
                    <span className="auth-step-tag">Instant OTP</span>
                  </div>
                  <p>Every business workspace is verified via WhatsApp OTP to guarantee 100% authentic accounts.</p>
                </div>
              </div>

              <div className="auth-showcase-step-item">
                <div className="auth-step-icon blue">
                  <Wallet size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>2. Pure Wallet Balance Control (Min {dailyBudgetText})</h4>
                    <span className="auth-step-tag blue">Direct Gateway / Bank UTR</span>
                  </div>
                  <p>Add funds anytime with full daily growth budget control in your local currency.</p>
                </div>
              </div>

              <div className="auth-showcase-step-item">
                <div className="auth-step-icon amber">
                  <Target size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>3. City &amp; Category Matched Buyer Leads</h4>
                    <span className="auth-step-tag amber">Precision Territory Match</span>
                  </div>
                  <p>Connect directly with high-intent customers searching for your services in your city.</p>
                </div>
              </div>
            </div>

            <div className="auth-showcase-footer">
              <div className="auth-trust-pill">
                <ShieldCheck size={14} color="#10b981" />
                <span>256-Bit SSL Encrypted</span>
              </div>
              <span className="auth-trust-dot">•</span>
              <div className="auth-trust-pill">
                <Zap size={14} color="#38bdf8" />
                <span>Real-Time Push Alerts</span>
              </div>
              <span className="auth-trust-dot">•</span>
              <div className="auth-trust-pill">
                <Lock size={14} color="#a855f7" />
                <span>Zero Lock-In</span>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-fullpage-form-pane">
          <div className="auth-fullpage-form-container">
            <div className="auth-fullpage-tabs">
              <button type="button" className="auth-fullpage-tab active">
                Create Business Account
              </button>
              <button type="button" className="auth-fullpage-tab" onClick={onSwitchToLogin}>
                Sign In to Workspace
              </button>
            </div>

            {/* Clean 3-Step Progress Bar */}
            <div className="am-wizard-stepper" aria-label="Account creation progress">
              <div className={`am-wizard-step ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>
                <span className="am-wizard-step-num">{step > 1 ? <Check size={14} strokeWidth={3} /> : '1'}</span>
                <span className="am-wizard-step-label">WhatsApp OTP</span>
              </div>
              <div className={`am-wizard-divider ${step > 1 ? 'done' : ''}`} />
              <div className={`am-wizard-step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>
                <span className="am-wizard-step-num">{step > 2 ? <Check size={14} strokeWidth={3} /> : '2'}</span>
                <span className="am-wizard-step-label">Business Info</span>
              </div>
              <div className={`am-wizard-divider ${step > 2 ? 'done' : ''}`} />
              <div className={`am-wizard-step ${step === 3 ? 'active' : ''}`}>
                <span className="am-wizard-step-num">3</span>
                <span className="am-wizard-step-label">Set Password</span>
              </div>
            </div>

            <div className="auth-card-top" style={{ marginBottom: '18px' }}>
              <h2>
                {step === 1 && (otpSent ? 'Enter WhatsApp Code' : 'Verify Your WhatsApp')}
                {step === 2 && 'Your Business Details'}
                {step === 3 && 'Secure Your Workspace'}
              </h2>
              <p>
                {step === 1 &&
                  (otpSent
                    ? `We sent a 6-digit verification code on WhatsApp to ${maskedPhone}.`
                    : 'Step 1 of 3 — Enter your active WhatsApp mobile number to receive an instant verification code.')}
                {step === 2 &&
                  'Step 2 of 3 — Tell us your business name, optional work email, and workspace handle.'}
                {step === 3 &&
                  'Step 3 of 3 — Choose and confirm a strong password for your Ad Mafia account.'}
              </p>
            </div>

            {error && (
              <div
                className="auth-error-banner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
                {error.toLowerCase().includes('sign in') && (
                  <button
                    type="button"
                    onClick={onSwitchToLogin}
                    style={{
                      background: '#1e293b',
                      color: '#ffffff',
                      border: 'none',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Sign In →
                  </button>
                )}
              </div>
            )}

            {/* ==================== STEP 1: WHATSAPP MOBILE & INLINE OTP ==================== */}
            {step === 1 && !otpSent && (
              <form onSubmit={handleSendOtp} noValidate className="auth-fullpage-form">
                <div className="auth-input-group">
                  <label htmlFor="regMobile">
                    <span>{isIndia ? 'WhatsApp Mobile Number' : 'WhatsApp Number (With Country Code)'}</span>
                    <span className="req-star">*</span>
                  </label>
                  <div
                    className={`clean-input-box ${
                      cleanMobile.length > 0 ? (isPhoneValid ? 'input-box-valid' : '') : ''
                    }`}
                  >
                    {phoneCode ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '0 12px',
                          background: '#f1f5f9',
                          borderRight: '1px solid #e2e8f0',
                          height: '46px',
                          fontWeight: 700,
                          color: '#334155',
                          fontSize: '0.9rem',
                          userSelect: 'none',
                          flexShrink: 0,
                        }}
                      >
                        <span>🇮🇳 {phoneCode}</span>
                      </div>
                    ) : (
                      <div className="input-prefix-icon">
                        <Phone size={17} />
                      </div>
                    )}
                    <input
                      id="regMobile"
                      type="tel"
                      inputMode="numeric"
                      autoFocus
                      maxLength={isIndia ? 10 : 15}
                      placeholder={isIndia ? 'Enter 10-digit WhatsApp number' : 'e.g. 971501234567'}
                      value={formData.mobile}
                      onChange={(e) => {
                        setError('');
                        setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, '') });
                      }}
                      className="clean-input"
                    />
                    {isPhoneValid && (
                      <div style={{ paddingRight: '12px', display: 'flex', alignItems: 'center' }}>
                        <CheckCircle2 size={18} color="#10b981" />
                      </div>
                    )}
                  </div>
                  {cleanMobile.length > 0 && !isPhoneValid ? (
                    <div className="am-field-hint neutral">
                      {isIndia
                        ? `${cleanMobile.length}/10 digits entered (must start with 6, 7, 8, or 9)`
                        : 'Enter 7 to 15 digits including country code'}
                    </div>
                  ) : (
                    <div className="am-field-hint neutral">
                      We will send a 6-digit verification code directly to your WhatsApp.
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn-portal-primary"
                  style={{ marginTop: '10px' }}
                  disabled={isSubmitting || !isPhoneValid}
                >
                  <span>{isSubmitting ? 'Sending Code on WhatsApp...' : 'Send WhatsApp OTP'}</span>
                  <ArrowRight size={18} className="btn-arrow-icon" />
                </button>
              </form>
            )}

            {step === 1 && otpSent && (
              <form onSubmit={handleVerifyOtpStep} noValidate className="auth-fullpage-form">
                <div className="am-verified-chip" style={{ background: '#f8fafc', borderColor: '#e2e8f0', color: '#334155' }}>
                  <div className="am-verified-chip-left">
                    <MessageSquare size={15} color="#16a34a" />
                    <span>
                      WhatsApp: <strong>{phoneCode} {cleanMobile}</strong>
                    </span>
                  </div>
                  <button type="button" className="am-verified-chip-btn" style={{ color: '#4f46e5' }} onClick={handleResetPhoneStep}>
                    Change number
                  </button>
                </div>

                <div className="auth-input-group">
                  <label>
                    <span>6-Digit WhatsApp Verification Code</span>
                    <span className="req-star">*</span>
                  </label>
                  <div className="am-inline-otp-grid" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className="am-inline-otp-digit"
                        aria-label={`Verification code digit ${idx + 1}`}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      Check your WhatsApp messages for the code
                    </span>
                    {resendCooldown > 0 ? (
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>
                        Resend in {resendCooldown}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={isSubmitting}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#16a34a',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Resend code on WhatsApp
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-portal-primary"
                  style={{ marginTop: '12px' }}
                  disabled={isSubmitting || otpDigits.join('').length !== 6}
                >
                  <span>{isSubmitting ? 'Verifying Code...' : 'Verify & Continue'}</span>
                  <ArrowRight size={18} className="btn-arrow-icon" />
                </button>
              </form>
            )}

            {/* ==================== STEP 2: EMAIL (OPTIONAL, LIVE VALIDATED) & BUSINESS INFO ==================== */}
            {step === 2 && (
              <form onSubmit={handleContinueFromStep2} noValidate className="auth-fullpage-form">
                <div className="am-verified-chip">
                  <div className="am-verified-chip-left">
                    <CheckCircle2 size={16} color="#059669" />
                    <span>
                      WhatsApp Verified: <strong>{phoneCode} {verifiedMobile}</strong>
                    </span>
                  </div>
                  <button type="button" className="am-verified-chip-btn" onClick={handleResetPhoneStep}>
                    Change
                  </button>
                </div>

                <div className="auth-input-group">
                  <label htmlFor="regEmail">
                    <span>Work Email Address</span>
                    <span className="am-optional-pill">Optional</span>
                  </label>
                  <div
                    className={`clean-input-box ${
                      !emailCheck.isEmpty ? (emailCheck.isValid ? 'input-box-valid' : 'input-box-error') : ''
                    }`}
                  >
                    <div className="input-prefix-icon">
                      <Mail size={17} />
                    </div>
                    <input
                      id="regEmail"
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="name@yourcompany.com (optional)"
                      value={formData.email}
                      onChange={(e) => {
                        setError('');
                        setFormData({ ...formData, email: e.target.value });
                      }}
                      className="clean-input"
                    />
                    {!emailCheck.isEmpty && (
                      <div style={{ paddingRight: '12px', display: 'flex', alignItems: 'center' }}>
                        {emailCheck.isValid ? (
                          <CheckCircle2 size={17} color="#10b981" />
                        ) : (
                          <AlertCircle size={17} color="#ef4444" />
                        )}
                      </div>
                    )}
                  </div>
                  {!emailCheck.isEmpty && !emailCheck.isValid && (
                    <div className="am-field-hint error">
                      <span>{emailCheck.message}</span>
                    </div>
                  )}
                  {!emailCheck.isEmpty && emailCheck.isValid && (
                    <div className="am-field-hint valid">
                      <span>✓ Email address looks good</span>
                    </div>
                  )}
                </div>

                <div className="auth-form-2col">
                  <div className="auth-input-group">
                    <label htmlFor="regContact">
                      <span>Your Full Name</span>
                      <span className="req-star">*</span>
                    </label>
                    <div className="clean-input-box">
                      <div className="input-prefix-icon">
                        <User size={17} />
                      </div>
                      <input
                        id="regContact"
                        type="text"
                        autoComplete="name"
                        placeholder="e.g. Karan Sharma"
                        value={formData.contactPerson}
                        onChange={(e) => {
                          setError('');
                          handleCompanyOrNameChange('contactPerson', e.target.value);
                        }}
                        className="clean-input"
                      />
                    </div>
                  </div>

                  <div className="auth-input-group">
                    <label htmlFor="regCompany">
                      <span>Business / Company Name</span>
                      <span className="req-star">*</span>
                    </label>
                    <div className="clean-input-box">
                      <div className="input-prefix-icon">
                        <Building2 size={17} />
                      </div>
                      <input
                        id="regCompany"
                        type="text"
                        autoComplete="organization"
                        placeholder="e.g. Apex Realty"
                        value={formData.companyName}
                        onChange={(e) => {
                          setError('');
                          handleCompanyOrNameChange('companyName', e.target.value);
                        }}
                        className="clean-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="auth-input-group">
                  <label htmlFor="regUser">
                    <span>Workspace Username</span>
                    <span className="req-star">*</span>
                  </label>
                  <div
                    className={`clean-input-box ${
                      usernameStatus.state === 'available'
                        ? 'input-box-valid'
                        : usernameStatus.state === 'taken' || usernameStatus.state === 'invalid'
                        ? 'input-box-error'
                        : ''
                    }`}
                  >
                    <div className="input-prefix-icon">
                      <AtSign size={17} />
                    </div>
                    <input
                      id="regUser"
                      type="text"
                      autoComplete="username"
                      placeholder="e.g. apex_realty"
                      value={formData.username}
                      onChange={(e) => {
                        setError('');
                        setUsernameManuallyEdited(true);
                        setFormData({
                          ...formData,
                          username: e.target.value.replace(/\s+/g, '').replace(/^@/, ''),
                        });
                      }}
                      className="clean-input"
                    />
                    {usernameStatus.state === 'available' && (
                      <div style={{ paddingRight: '12px', display: 'flex', alignItems: 'center' }}>
                        <CheckCircle2 size={17} color="#10b981" />
                      </div>
                    )}
                  </div>
                  {usernameStatus.state === 'checking' && (
                    <div className="am-field-hint neutral">{usernameStatus.message}</div>
                  )}
                  {usernameStatus.state === 'available' && (
                    <div className="am-field-hint valid">✓ {usernameStatus.message}</div>
                  )}
                  {(usernameStatus.state === 'taken' || usernameStatus.state === 'invalid') && (
                    <div className="am-field-hint error">{usernameStatus.message}</div>
                  )}
                </div>

                <div className="am-wizard-actions">
                  <button
                    type="button"
                    className="am-btn-back"
                    onClick={handleResetPhoneStep}
                    disabled={isSubmitting}
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    className="btn-portal-primary"
                    style={{ flex: 1, marginTop: 0 }}
                    disabled={
                      isSubmitting ||
                      !emailCheck.isValid ||
                      formData.contactPerson.trim().length < 2 ||
                      formData.companyName.trim().length < 2 ||
                      formData.username.trim().length < 3 ||
                      usernameStatus.state === 'taken' ||
                      usernameStatus.state === 'invalid'
                    }
                  >
                    <span>{isSubmitting ? 'Checking...' : 'Continue to Password'}</span>
                    <ArrowRight size={18} className="btn-arrow-icon" />
                  </button>
                </div>
              </form>
            )}

            {/* ==================== STEP 3: CREATE & CONFIRM PASSWORD ==================== */}
            {step === 3 && (
              <form onSubmit={handleFinalCreateAccount} noValidate className="auth-fullpage-form">
                <div className="am-verified-chip">
                  <div className="am-verified-chip-left">
                    <CheckCircle2 size={16} color="#059669" />
                    <span>
                      {phoneCode} {verifiedMobile} • <strong>@{formData.username.trim()}</strong>
                    </span>
                  </div>
                  <button type="button" className="am-verified-chip-btn" onClick={() => setStep(2)}>
                    Edit details
                  </button>
                </div>

                <div className="auth-input-group">
                  <label htmlFor="regPwd">
                    <span>Create Password</span>
                    <span className="req-star">*</span>
                  </label>
                  <div
                    className={`clean-input-box auth-pwd-box ${
                      formData.password.length >= 6 ? 'input-box-valid' : ''
                    }`}
                  >
                    <div className="input-prefix-icon">
                      <Lock size={17} />
                    </div>
                    <input
                      id="regPwd"
                      type={showPwd ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoFocus
                      placeholder="Minimum 6 characters"
                      value={formData.password}
                      onChange={(e) => {
                        setError('');
                        setFormData({ ...formData, password: e.target.value });
                      }}
                      className="clean-input clean-input-pwd"
                    />
                    <button
                      type="button"
                      className="pwd-toggle-btn"
                      onClick={() => setShowPwd(!showPwd)}
                      title={showPwd ? 'Hide password' : 'Show password'}
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {formData.password.length > 0 && (
                    <>
                      <div className="am-pwd-strength-bars">
                        {[1, 2, 3, 4].map((idx) => (
                          <div
                            key={idx}
                            className="am-pwd-bar"
                            style={{
                              background: idx <= pwdStrength.score ? pwdStrength.color : '#e2e8f0',
                            }}
                          />
                        ))}
                      </div>
                      <div
                        className="am-field-hint"
                        style={{ color: pwdStrength.color, fontWeight: 600 }}
                      >
                        {pwdStrength.label}
                      </div>
                    </>
                  )}
                </div>

                <div className="auth-input-group">
                  <label htmlFor="regConfirmPwd">
                    <span>Confirm Password</span>
                    <span className="req-star">*</span>
                  </label>
                  <div
                    className={`clean-input-box auth-pwd-box ${
                      confirmTyped ? (passwordsMatch ? 'input-box-valid' : 'input-box-error') : ''
                    }`}
                  >
                    <div className="input-prefix-icon">
                      <Lock size={17} />
                    </div>
                    <input
                      id="regConfirmPwd"
                      type={showConfirmPwd ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Re-enter your password to confirm"
                      value={formData.confirmPassword}
                      onChange={(e) => {
                        setError('');
                        setFormData({ ...formData, confirmPassword: e.target.value });
                      }}
                      className="clean-input clean-input-pwd"
                    />
                    <button
                      type="button"
                      className="pwd-toggle-btn"
                      onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                      title={showConfirmPwd ? 'Hide password' : 'Show password'}
                      aria-label={showConfirmPwd ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {confirmTyped && !passwordsMatch && (
                    <div className="am-field-hint error">
                      <span>Passwords do not match yet</span>
                    </div>
                  )}
                  {confirmTyped && passwordsMatch && (
                    <div className="am-field-hint valid">
                      <span>✓ Passwords match</span>
                    </div>
                  )}
                </div>

                <div className="auth-terms-row">
                  <label className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={formData.terms}
                      onChange={(e) => setFormData({ ...formData, terms: e.target.checked })}
                    />
                    <span className="terms-text">
                      I agree to receive WhatsApp verification &amp; lead notifications and accept the{' '}
                      <a href="#terms" onClick={(e) => e.preventDefault()} className="auth-policy-link">
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a href="#privacy" onClick={(e) => e.preventDefault()} className="auth-policy-link">
                        Privacy Policy
                      </a>.
                    </span>
                  </label>
                </div>

                <div className="am-wizard-actions">
                  <button
                    type="button"
                    className="am-btn-back"
                    onClick={() => setStep(2)}
                    disabled={isSubmitting}
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    className="btn-portal-primary"
                    style={{ flex: 1, marginTop: 0 }}
                    disabled={isSubmitting || !passwordsMatch || !formData.terms}
                  >
                    <span>{isSubmitting ? 'Creating Workspace...' : 'Create Verified Account'}</span>
                    <ArrowRight size={18} className="btn-arrow-icon" />
                  </button>
                </div>
              </form>
            )}

            <div className="auth-switch-link">
              Already registered?{' '}
              <button type="button" onClick={onSwitchToLogin} className="link-button-bold">
                Sign In to Workspace
              </button>
            </div>

            <div className="auth-mobile-trust-bar">
              <ShieldCheck size={14} color="#10b981" />
              <span>Official WhatsApp Verified Ad Mafia Client Portal</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function CustomerLoginPage({ onLoggedIn, onSwitchToRegister, onBackToWebsite }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suspensionError, setSuspensionError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(() => countryService.getCurrentCountry());

  // Forgot Password via WhatsApp OTP state
  const [forgotBoxOpen, setForgotBoxOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [sendingResetOtp, setSendingResetOtp] = useState(false);

  // Unified OTP modal for either 'password_reset' or 'verify_phone' (first-login gate)
  const [otpFlow, setOtpFlow] = useState({
    open: false,
    purpose: 'verify_phone',
    phone: '',
    countryCode: 'IN',
    maskedPhone: '',
    cooldown: 60,
    sandboxHint: '',
    pendingCustomer: null,
  });

  useEffect(() => {
    return countryService.subscribe((country) => {
      if (country) setSelectedCountry(country);
    });
  }, []);

  const finalizePortalEntry = (cust) => {
    const safeCust = sanitizeStoredCustomer(cust);
    localStorage.setItem('growthline_active_user', JSON.stringify(safeCust));
    if (onLoggedIn) {
      onLoggedIn(safeCust);
    } else {
      window.history.pushState({}, '', '/app/lead#app/dashboard');
      window.location.hash = '#app/dashboard';
      window.location.href = '/app/lead#app/dashboard';
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setSuspensionError('');

    if (!username.trim() || !password) {
      setLoginError('Please enter your username/mobile/email and password.');
      return;
    }

    setIsSubmitting(true);

    try {
      const authRes = await crmApi.loginCustomer(username.trim(), password);
      const matchedCustomer = authRes?.customer;

      if (!matchedCustomer) {
        setLoginError('No registered account found with these credentials.');
        setIsSubmitting(false);
        return;
      }

      if (matchedCustomer.status === 'suspended') {
        setSuspensionError(
          'Compliance Hold Notice: Your workspace has been suspended by the operations administrator.'
        );
        setIsSubmitting(false);
        return;
      }

      // Mandatory "Every Single User" WhatsApp verification gate for admin-created / legacy unverified accounts
      if (authRes.requiresPhoneVerification || matchedCustomer.phoneVerified === false) {
        const otpRes = await crmApi.sendWhatsAppOtp({
          phone: matchedCustomer.phone,
          countryCode: matchedCustomer.countryCode || selectedCountry?.country_code || 'IN',
          purpose: 'verify_phone',
        });
        setOtpFlow({
          open: true,
          purpose: 'verify_phone',
          phone: matchedCustomer.phone,
          countryCode: matchedCustomer.countryCode || selectedCountry?.country_code || 'IN',
          maskedPhone: otpRes.maskedPhone || matchedCustomer.phone,
          cooldown: otpRes.resendAfterSeconds || 60,
          sandboxHint: otpRes.sandboxOtp || '',
          pendingCustomer: matchedCustomer,
        });
        setIsSubmitting(false);
        return;
      }

      finalizePortalEntry(matchedCustomer);
    } catch (apiErr) {
      if (apiErr.message && apiErr.message.toLowerCase().includes('suspended')) {
        setSuspensionError(apiErr.message);
      } else {
        setLoginError(apiErr.message || 'Invalid credentials. Please verify your username/mobile and password.');
      }
      setIsSubmitting(false);
    }
  };

  const handleSendPasswordResetOtp = async (e) => {
    e.preventDefault();
    const cleanTarget = forgotPhone.replace(/\D/g, '');
    if (cleanTarget.length < 7) {
      setLoginError('Please enter your registered WhatsApp mobile number to receive a password reset OTP.');
      return;
    }
    setSendingResetOtp(true);
    setLoginError('');
    try {
      const otpRes = await crmApi.sendWhatsAppOtp({
        phone: cleanTarget,
        countryCode: selectedCountry?.country_code || 'IN',
        purpose: 'password_reset',
      });
      setOtpFlow({
        open: true,
        purpose: 'password_reset',
        phone: cleanTarget,
        countryCode: selectedCountry?.country_code || 'IN',
        maskedPhone: otpRes.maskedPhone || cleanTarget,
        cooldown: otpRes.resendAfterSeconds || 60,
        sandboxHint: otpRes.sandboxOtp || '',
        pendingCustomer: null,
      });
    } catch (err) {
      setLoginError(err.message || 'Could not send password reset OTP.');
    } finally {
      setSendingResetOtp(false);
    }
  };

  const handleOtpModalVerified = async ({ otpVerificationToken, newPassword }) => {
    if (otpFlow.purpose === 'password_reset') {
      await crmApi.resetPasswordWithOtp({
        phone: otpFlow.phone,
        countryCode: otpFlow.countryCode,
        newPassword,
        otpVerificationToken,
      });
      setOtpFlow((prev) => ({ ...prev, open: false }));
      setForgotBoxOpen(false);
      setUsername(otpFlow.phone);
      setPassword('');
      setResetNotice('Your password has been securely updated via WhatsApp OTP! Please sign in with your new password.');
      return;
    }

    if (otpFlow.purpose === 'verify_phone' && otpFlow.pendingCustomer) {
      const verifyRes = await crmApi.verifyExistingPhone({
        customerId: otpFlow.pendingCustomer.id,
        phone: otpFlow.phone,
        countryCode: otpFlow.countryCode,
        otpVerificationToken,
      });
      if (verifyRes.token) {
        crmApi.saveCustomerToken(verifyRes.token);
      }
      const updatedCust = {
        ...otpFlow.pendingCustomer,
        ...(verifyRes.customer || {}),
        phoneVerified: true,
      };
      setOtpFlow((prev) => ({ ...prev, open: false, pendingCustomer: null }));
      finalizePortalEntry(updatedCust);
    }
  };

  return (
    <div className="auth-fullpage-shell">
      <header className="auth-fullpage-topbar">
        <div className="auth-fullpage-topbar-inner">
          <div
            className="auth-fullpage-brand"
            onClick={onBackToWebsite}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Ad Mafia Marketing"
          >
            <img src="/AdMafia-Logo.png" alt="Ad Mafia Marketing" className="auth-topbar-logo" />
          </div>
          <div className="auth-fullpage-topbar-actions">
            <span className="auth-topbar-Question">Need a client account?</span>
            <button type="button" className="auth-topbar-switch-btn" onClick={onSwitchToRegister}>
              Create Business Account
            </button>
            <button type="button" className="auth-topbar-back-btn" onClick={onBackToWebsite}>
              ← Back to Website
            </button>
          </div>
        </div>
      </header>

      <main className="auth-fullpage-grid">
        <section className="auth-fullpage-showcase">
          <div className="auth-showcase-inner">
            <div className="auth-showcase-topbar">
              <img src="/AdMafia-Logo.png" alt="Ad Mafia Marketing" className="auth-brand-logo" />
              <div className="auth-top-badge">
                <span className="auth-pulse-dot" />
                <span>CUSTOMER COMMAND CENTER</span>
              </div>
            </div>

            <div className="auth-hero-block">
              <h1 className="auth-showcase-heading">
                Welcome back to your{' '}
                <span className="auth-showcase-highlight">Buyer Lead Hub.</span>
              </h1>
              <p className="auth-showcase-subtext">
                Sign in to view real-time buyer leads dispatched to your pipeline, manage your growth wallet balance, and convert enquiries via direct Call &amp; WhatsApp.
              </p>
            </div>

            <div className="auth-showcase-live-card">
              <div className="auth-live-card-header">
                <div className="auth-live-status-group">
                  <span className="auth-pulse-dot" />
                  <span className="auth-live-header-tag">ACTIVE WORKSPACE SYNCHRONIZATION</span>
                </div>
                <div className="auth-live-delivery-pill">
                  <ShieldCheck size={12} color="#10b981" />
                  <span>WhatsApp Verified Access</span>
                </div>
              </div>

              <div className="auth-live-card-lead-row">
                <div className="auth-live-lead-avatar">AM</div>
                <div className="auth-live-lead-details">
                  <div className="auth-live-lead-name-row">
                    <span className="auth-lead-name">Ad Mafia Live Lead Dispatch</span>
                    <span className="auth-lead-tag-verified">24/7 Live Stream ✓</span>
                  </div>
                  <div className="auth-lead-phone-row">
                    <span className="auth-lead-phone">Real-Time Lead Inbox &amp; Wallet Ledger</span>
                  </div>
                  <div className="auth-lead-intent-sub">
                    Instant sync with Sales Operations &amp; Verified Lead Delivery Engine
                  </div>
                </div>
                <div className="auth-live-lead-actions">
                  <span className="auth-action-chip wa">✓ Verified Leads</span>
                </div>
              </div>

              <div className="auth-live-card-metrics">
                <div className="auth-metric-item">
                  <small>Daily Growth Budget</small>
                  <strong>From {formatDailyRate(selectedCountry)}</strong>
                  <span className="auth-metric-sub">Full Pacing Control</span>
                </div>
                <div className="auth-metric-item highlight">
                  <small>Wallet Top-Up</small>
                  <strong>Instant UPI / UTR</strong>
                  <span className="auth-metric-sub">Zero Platform Delay</span>
                </div>
                <div className="auth-metric-item">
                  <small>CRM Access</small>
                  <strong>24/7 Live</strong>
                  <span className="auth-metric-sub">Instant Dispatch</span>
                </div>
              </div>
            </div>

            <div className="auth-showcase-steps">
              <div className="auth-showcase-step-item">
                <div className="auth-step-icon emerald">
                  <Phone size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>Unmasked Buyer Mobile Numbers</h4>
                    <span className="auth-step-tag">Direct Access</span>
                  </div>
                  <p>Call or WhatsApp interested buyers the moment their enquiry hits your CRM.</p>
                </div>
              </div>

              <div className="auth-showcase-step-item">
                <div className="auth-step-icon blue">
                  <Wallet size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>Transparent Wallet &amp; Daily Pacing</h4>
                    <span className="auth-step-tag blue">Live Ledger</span>
                  </div>
                  <p>Track every rupee added to your wallet and adjust your daily pacing limit anytime.</p>
                </div>
              </div>

              <div className="auth-showcase-step-item">
                <div className="auth-step-icon amber">
                  <ShieldCheck size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>Dedicated Account Support Desk</h4>
                    <span className="auth-step-tag amber">Priority Help</span>
                  </div>
                  <p>Raise support tickets or request custom targeting directly from your portal.</p>
                </div>
              </div>
            </div>

            <div className="auth-showcase-footer">
              <div className="auth-trust-pill">
                <ShieldCheck size={14} color="#10b981" />
                <span>HttpOnly JWT Session Security</span>
              </div>
              <span className="auth-trust-dot">•</span>
              <div className="auth-trust-pill">
                <Zap size={14} color="#38bdf8" />
                <span>MongoDB Replica Set Storage</span>
              </div>
              <span className="auth-trust-dot">•</span>
              <div className="auth-trust-pill">
                <Lock size={14} color="#a855f7" />
                <span>Isolated Customer Data</span>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-fullpage-form-pane">
          <div className="auth-fullpage-form-container">
            <div className="auth-fullpage-tabs">
              <button type="button" className="auth-fullpage-tab" onClick={onSwitchToRegister}>
                Create Business Account
              </button>
              <button type="button" className="auth-fullpage-tab active">
                Sign In to Workspace
              </button>
            </div>

            <div className="auth-card-top">
              <h2>Sign In to Workspace</h2>
              <p>Enter your credentials to sign in to your client lead workspace.</p>
            </div>

            {loginError && (
              <div className="auth-error-banner">
                <span className="error-icon">⚠️</span>
                <span>{loginError}</span>
              </div>
            )}

            {resetNotice && (
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  marginBottom: '18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>✓ {resetNotice}</span>
                <button
                  type="button"
                  onClick={() => setResetNotice('')}
                  style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', fontWeight: 800 }}
                >
                  ✕
                </button>
              </div>
            )}

            {suspensionError && (
              <div className="auth-suspension-banner">
                <div className="suspension-header">
                  <span>⛔ Account Suspended (Compliance Hold)</span>
                </div>
                <p>{suspensionError}</p>
                <small>Contact Support Desk: +91 6359 120 081 or info@admafia.marketing</small>
              </div>
            )}

            {forgotBoxOpen && (
              <form
                onSubmit={handleSendPasswordResetOtp}
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '14px',
                  padding: '16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#14532d' }}>Reset Password via WhatsApp OTP</strong>
                  <button
                    type="button"
                    onClick={() => setForgotBoxOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    Cancel
                  </button>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#166534' }}>
                  Enter your registered WhatsApp mobile number to receive a 6-digit password reset code.
                </p>
                <div className="forgot-otp-input-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="tel"
                    required
                    value={forgotPhone}
                    onChange={(e) => setForgotPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 9724916167"
                    style={{
                      flex: '1 1 160px',
                      minWidth: 0,
                      padding: '10px 12px',
                      borderRadius: '9px',
                      border: '1px solid #86efac',
                      fontSize: '0.88rem',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={sendingResetOtp}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '9px',
                      border: 'none',
                      background: '#16a34a',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      cursor: sendingResetOtp ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sendingResetOtp ? 'Sending...' : 'Send OTP →'}
                  </button>
                </div>
              </form>
            )}

            <form onSubmit={handleLogin} noValidate className="auth-fullpage-form">
              <div className="auth-input-group">
                <label htmlFor="logUser">
                  <span>Username, WhatsApp Mobile Number, or Business Email</span>
                  <span className="req-star">*</span>
                </label>
                <div className="clean-input-box">
                  <div className="input-prefix-icon">
                    <User size={17} />
                  </div>
                  <input
                    id="logUser"
                    type="text"
                    required
                    placeholder="e.g. vikram_malhotra or 9724916167"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="clean-input"
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <div className="auth-pwd-header-row">
                  <label htmlFor="logPwd" style={{ margin: 0 }}>
                    <span>Password</span>
                    <span className="req-star">*</span>
                  </label>
                  <button
                    type="button"
                    className="link-button-subtle"
                    onClick={() => {
                      setForgotBoxOpen(true);
                      if (/^\d{7,15}$/.test(username.trim())) {
                        setForgotPhone(username.trim());
                      }
                    }}
                  >
                    Forgot password? (WhatsApp OTP)
                  </button>
                </div>
                <div className="clean-input-box auth-pwd-box">
                  <div className="input-prefix-icon">
                    <Lock size={17} />
                  </div>
                  <input
                    id="logPwd"
                    type={showPwd ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="clean-input clean-input-pwd"
                  />
                  <button
                    type="button"
                    className="pwd-toggle-btn"
                    onClick={() => setShowPwd(!showPwd)}
                    title={showPwd ? 'Hide password' : 'Show password'}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn-portal-primary" style={{ marginTop: '12px' }} disabled={isSubmitting}>
                <span>{isSubmitting ? 'Authenticating...' : 'Sign In to Workspace'}</span>
                <ArrowRight size={18} className="btn-arrow-icon" />
              </button>
            </form>

            <div className="auth-switch-link">
              Don&apos;t have a business account?{' '}
              <button type="button" onClick={onSwitchToRegister} className="link-button-bold">
                Create Business Account
              </button>
            </div>

            <div className="auth-mobile-trust-bar">
              <ShieldCheck size={14} color="#10b981" />
              <span>Official 256-bit Encrypted Ad Mafia Client Portal</span>
            </div>
          </div>
        </section>
      </main>

      <WhatsAppOtpModal
        isOpen={otpFlow.open}
        onClose={() => setOtpFlow((prev) => ({ ...prev, open: false }))}
        phone={otpFlow.phone}
        countryCode={otpFlow.countryCode}
        maskedPhone={otpFlow.maskedPhone}
        purpose={otpFlow.purpose}
        title={
          otpFlow.purpose === 'password_reset'
            ? 'Reset Password via WhatsApp OTP'
            : 'Verify Your WhatsApp Number to Continue'
        }
        subtitle={
          otpFlow.purpose === 'verify_phone'
            ? `For security compliance, every Ad Mafia account must verify its WhatsApp number once. Enter the 6-digit code sent to ${otpFlow.maskedPhone}.`
            : ''
        }
        initialCooldown={otpFlow.cooldown}
        sandboxHint={otpFlow.sandboxHint}
        onVerified={handleOtpModalVerified}
      />
    </div>
  );
}

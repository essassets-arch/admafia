import React, { useState, useEffect } from 'react';
import MetaAdsCalculator from './components/MetaAdsCalculator';
import AuthPage from './components/AuthPage';
import PortalDashboard from './portal/PortalDashboard';
import WorkspaceSetupPage from './portal/WorkspaceSetupPage';
import CheckoutPage from './portal/CheckoutPage';
import SalesLoginPage from './sales/SalesLoginPage';
import SalesExecutiveDashboard from './sales/SalesExecutiveDashboard';
import { CustomerLoginPage, CustomerRegisterPage } from './portal/AuthPages';
import crmApi from './services/crmApi';
import './portal/portal.css';

// One-time cleanup of legacy static/mock data in localStorage for strict customer isolation
try {
  if (typeof window !== 'undefined' && !localStorage.getItem('growthline_clean_isolation_v3')) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('growthline_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('growthline_clean_isolation_v3', 'true');
  }
  if (typeof window !== 'undefined') {
    crmApi.syncStateFromPostgres();
  }
} catch (e) {}

// ---------- CONFIG (yahan apni details daalo) ----------
const site = {
  name: 'AdMafia Marketing',
  url: 'https://admafia.marketing/',       // canonical (trailing slash ke saath)
  email: 'hello@admafia.marketing',        // lead form yahin aayega
  phone: '+91XXXXXXXXXX',
  title: 'Facebook & Instagram Lead Generation Ads from ₹300/Day | AdMafia Marketing',
  desc: 'Get customer enquiries with names and phone numbers through targeted Meta Ads. Start Facebook & Instagram lead generation campaigns from ₹300/day with AdMafia Marketing.',
};

// ---------- CONTENT ----------
const gets = [
  ['Starting budget', '₹300 per day (minimum)'],
  ['Targeted Meta Ads', 'Facebook and Instagram advertising'],
  ['Customer enquiries', 'Receive submitted names and phone numbers'],
  ['Location-based targeting', 'Advertise in your preferred service areas'],
  ['Direct lead follow-up', 'Contact interested customers yourself'],
  ['Campaign optimisation', 'Advertising focused on relevant enquiries'],
];

const steps = [
  ['Tell us about your business', 'Share your business category, services, target location, ideal customers and advertising requirements.'],
  ['We create your Meta Ads campaign', 'Our team plans and runs targeted campaigns on Facebook and Instagram to reach potential customers.'],
  ['Receive customer enquiries', 'When interested users submit their details, you receive the lead information, including name and phone number.'],
  ['Connect and convert', 'Contact your leads, explain your offer, answer questions and turn qualified opportunities into customers.'],
];

const services = [
  ['Facebook Lead Generation Ads', 'Reach potential customers through targeted Facebook campaigns designed to generate enquiries.'],
  ['Instagram Lead Generation Ads', 'Promote your business on Instagram and generate enquiries from users interested in your offerings.'],
  ['Meta Ads Campaign Management', 'Campaign planning, audience targeting, ad creatives and optimisation, managed for you.'],
  ['Local Business Lead Generation', 'Reach customers in your preferred city, area or service location with geo-targeted ads.'],
  ['Service-Based Business Advertising', 'Home services, education, real estate, consulting and other professional services.'],
  ['Customer Enquiry Generation', 'Receive contact information from people who show interest, so your team can follow up directly.'],
];

const why = [
  ['Targeted advertising', 'Reach audiences by campaign objective, location and available Meta targeting options.'],
  ['Direct customer contact', 'Get submitted names and phone numbers without unnecessary intermediaries.'],
  ['Business-focused campaigns', 'Strategies built around your category, services and customer acquisition goals.'],
  ['Flexible requirements', 'Promote services, products, offers or events that meet ad policies.'],
  ['Easy lead follow-up', 'Manage conversations using your own sales process.'],
  ['Performance-oriented', 'Focus on measurable enquiries and ways to improve results.'],
];

const industries = [
  ['Real Estate', 'Property enquiries from potential buyers and tenants.'],
  ['Education & Coaching', 'Students and parents looking for courses, classes and training.'],
  ['Home Services', 'People needing cleaning, repairs, maintenance and household services.'],
  ['Healthcare & Wellness', 'Eligible healthcare and wellness services, in line with ad policies.'],
  ['Automobile Services', 'Enquiries for vehicle services, dealerships and automotive businesses.'],
  ['Professional Services', 'Consulting, legal, financial and other eligible professional services.'],
  ['Beauty & Salon', 'Salon services, beauty treatments and appointment-based offers.'],
  ['Local Retail & Businesses', 'Enquiries for local products, services and promotions.'],
];

const faqs = [
  ['What is AdMafia Marketing?', 'AdMafia Marketing is a business lead generation and digital advertising platform that helps businesses generate customer enquiries through targeted Facebook and Instagram advertising campaigns.'],
  ['How does AdMafia Marketing generate business leads?', 'We create and manage Meta Ads campaigns targeting relevant audiences. When potential customers submit an enquiry, their contact details are collected and shared with the business for follow-up.'],
  ['Will I receive customer names and phone numbers?', 'Yes. When users voluntarily provide their contact information through a lead form, businesses can receive the submitted details, such as names and phone numbers, subject to applicable privacy and advertising requirements.'],
  ['Can I choose my target city or location?', "Yes. You can specify your preferred advertising locations, and campaigns can be configured using Meta's available geographic targeting options."],
  ['Do you provide lead generation services for small businesses?', 'Yes. AdMafia Marketing supports small businesses, local service providers, startups and established businesses seeking customer enquiries through digital advertising.'],
  ['Do you convert leads into customers?', 'AdMafia Marketing focuses on generating customer enquiries. Your business handles customer communication, follow-ups, negotiations and final sales conversions.'],
  ['Are all leads guaranteed to convert into sales?', 'No. Lead quality and conversion depend on audience interest, advertising strategy, pricing, competition and your follow-up process. We do not guarantee that every enquiry will become a paying customer.'],
  ['How can I start generating leads with AdMafia Marketing?', 'Share your business details, advertising objectives and target audience. Our team can then discuss your campaign requirements and the next steps.'],
];

export default function App() {
  const [formData, setFormData] = useState({
    csrf: 'csrf_admafia_marketing_token',
    website: '',
    name: '',
    phone: '',
    business: '',
    city: '',
  });
  const [errors, setErrors] = useState([]);
  const [sent, setSent] = useState(false);
  const resolveView = () => {
    const h = (window.location.hash || '').toLowerCase();
    const p = (window.location.pathname || '').toLowerCase();

    // 1. Direct redirect to normal website if on /app/lead#login or any /app with #login, #signout, or #logout
    // Per User Request: "on https://admafia.marketing/app/lead#login sign out redirect to direct normal website"
    if ((p.includes('/app') || h.includes('app')) && (h.includes('login') || h.includes('signout') || h.includes('logout'))) {
      try {
        localStorage.removeItem('growthline_active_user');
        sessionStorage.clear();
        window.history.replaceState({}, '', '/');
      } catch (e) {}
      window.location.hash = '';
      window.location.href = '/';
      return 'landing';
    }

    // 2. Sales & Admin Operations Desks
    if (p.startsWith('/sales') || h.startsWith('#sales') || p.startsWith('/admin') || h.startsWith('#admin')) {
      if (h.includes('login') || h === '#sales/login') return 'sales-login';
      return 'sales-portal';
    }

    // 3. Customer Portal (/app or /app/lead)
    if (h.includes('#app') || p.startsWith('/app')) {
      let activeUser = null;
      try {
        const raw = localStorage.getItem('growthline_active_user');
        if (raw) activeUser = JSON.parse(raw);
      } catch (e) {}
      if (!activeUser) {
        // Unauthenticated customer visiting portal: redirect to normal website
        try {
          window.history.replaceState({}, '', '/');
        } catch (e) {}
        window.location.hash = '';
        window.location.href = '/';
        return 'landing';
      }
      return 'portal';
    }

    // 4. Dedicated Standalone Workspace Configuration Page (#workspace-setup)
    if (h.includes('#workspace-setup') || h.includes('#profile-setup') || h.includes('#setup') || p.startsWith('/workspace-setup') || p.startsWith('/profile-setup') || p.startsWith('/setup')) return 'workspace-setup';

    // 5. Commercial Package & Payment Funnel (/onboarding/checkout)
    if (h.includes('#checkout') || h.includes('#onboarding') || p.startsWith('/checkout') || p.startsWith('/onboarding')) return 'checkout';

    // 6. Customer Registration (/register or #register)
    if (h.includes('#register') || p.startsWith('/register')) return 'register';

    // 7. Customer Login (/login or #login)
    if (h.includes('#login') || p.startsWith('/login')) return 'login';

    // 8. Auth
    if (h.includes('#auth') || p.startsWith('/auth')) return 'auth';

    return 'landing';
  };

  const [currentView, setCurrentView] = useState(resolveView);

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_active_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.companyName || parsed.name || parsed.phone || parsed.username)) {
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  });

  useEffect(() => {
    const syncUser = () => {
      try {
        const raw = localStorage.getItem('growthline_active_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.companyName || parsed.name || parsed.phone || parsed.username)) {
            setCurrentUser(parsed);
            return;
          }
        }
      } catch (e) {}
      setCurrentUser(null);
    };

    window.addEventListener('growthline_customer_registered', syncUser);
    window.addEventListener('growthline_active_user_changed', syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener('growthline_customer_registered', syncUser);
      window.removeEventListener('growthline_active_user_changed', syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentView(resolveView());
    };
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    let ok = true;
    const newErrors = [];

    // honeypot (bots fill this)
    if (formData.website) {
      ok = false;
    }

    const trimmedName = formData.name.trim();
    const cleanedPhone = formData.phone.replace(/[^\d+]/g, '');

    if (!ok) newErrors.push('Session expire ho gaya, page refresh karke dobara try karein.');
    if (trimmedName.length < 2) newErrors.push('Please enter your name.');
    if (!/^\+?\d{10,13}$/.test(cleanedPhone)) newErrors.push('Please enter a valid phone number.');

    if (newErrors.length === 0) {
      setErrors([]);
      setSent(true);
      // scroll to contact
      const contactElement = document.getElementById('contact');
      if (contactElement) {
        contactElement.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      setErrors(newErrors);
    }
  };

  // View: Sales Executive Login (/sales#login)
  if (currentView === 'sales-login') {
    return (
      <SalesLoginPage
        onLoggedIn={(rep) => {
          window.location.hash = '#dashboard';
          setCurrentView('sales-portal');
        }}
        onSwitchToCustomerPortal={() => {
          window.location.hash = '#login';
          try { window.history.pushState({}, '', '/#login'); } catch(e) {}
          setCurrentView('login');
        }}
        onBackToWebsite={() => {
          window.location.hash = '';
          try { window.history.pushState({}, '', '/'); } catch(e) {}
          setCurrentView('landing');
        }}
      />
    );
  }

  // View: Sales Executive Operations Workspace (/sales#dashboard)
  if (currentView === 'sales-portal') {
    return (
      <SalesExecutiveDashboard
        onSignOut={() => {
          window.location.hash = '#login';
          setCurrentView('sales-login');
        }}
        onBackToWebsite={() => {
          window.location.hash = '';
          try { window.history.pushState({}, '', '/'); } catch(e) {}
          setCurrentView('landing');
        }}
      />
    );
  }

  // View: Dedicated Standalone Workspace Configuration Page (#workspace-setup)
  if (currentView === 'workspace-setup') {
    return (
      <WorkspaceSetupPage
        onSaved={(profileData) => {
          // Success handled in WorkspaceSetupPage
        }}
        onBackToDashboard={() => {
          try { window.history.pushState({}, '', '/app/lead#app/dashboard'); } catch(e) {}
          window.location.hash = '#app/dashboard';
          setCurrentView('portal');
        }}
        onGoToSalesDesk={() => {
          try { window.history.pushState({}, '', '/sales#profiles'); } catch(e) {}
          window.location.hash = '#profiles';
          setCurrentView('sales-portal');
        }}
      />
    );
  }

  // View 1: Customer Portal Dashboard (/app/)
  if (currentView === 'portal') {
    return (
      <PortalDashboard
        key={currentUser?.id || currentUser?.phone || currentUser?.username || 'portal'}
        onSignOut={() => {
          try {
            localStorage.removeItem('growthline_active_user');
            sessionStorage.clear();
          } catch(e) {}
          setCurrentUser(null);
          try {
            window.history.pushState({}, '', '/');
          } catch(e) {}
          window.location.hash = '';
          setCurrentView('landing');
          window.location.href = '/';
        }}
        onBackToWebsite={() => {
          try {
            window.history.pushState({}, '', '/');
          } catch(e) {}
          window.location.hash = '';
          setCurrentView('landing');
          window.location.href = '/';
        }}
      />
    );
  }

  // View 2: Customer Universal Login (/login)
  if (currentView === 'login') {
    return (
      <CustomerLoginPage
        onLoggedIn={(user) => {
          if (user) {
            try { localStorage.setItem('growthline_active_user', JSON.stringify(user)); } catch(e) {}
            setCurrentUser(user);
          }
          try { window.history.pushState({}, '', '/app/lead#app/dashboard'); } catch(e) {}
          window.location.hash = '#app/dashboard';
          setCurrentView('portal');
        }}
        onSwitchToRegister={() => {
          try { window.history.pushState({}, '', '/#register'); } catch(e) {}
          window.location.hash = '#register';
          setCurrentView('register');
        }}
        onBackToWebsite={() => {
          try { window.history.pushState({}, '', '/'); } catch(e) {}
          window.location.hash = '';
          setCurrentView('landing');
          window.location.href = '/';
        }}
      />
    );
  }

  // View 3: Customer Registration (/register)
  if (currentView === 'register') {
    return (
      <CustomerRegisterPage
        onRegistered={(newCustomer) => {
          if (newCustomer) {
            try {
              localStorage.setItem('growthline_active_user', JSON.stringify(newCustomer));
            } catch(e) {}
            setCurrentUser(newCustomer);
          }
          try {
            window.history.pushState({}, '', '/app/lead#app/dashboard');
          } catch(e) {}
          window.location.hash = '#app/dashboard';
          setCurrentView('portal');
        }}
        onSwitchToLogin={() => {
          try { window.history.pushState({}, '', '/#login'); } catch(e) {}
          window.location.hash = '#login';
          setCurrentView('login');
        }}
        onBackToWebsite={() => {
          try { window.history.pushState({}, '', '/'); } catch(e) {}
          window.location.hash = '';
          setCurrentView('landing');
          window.location.href = '/';
        }}
      />
    );
  }

  // View 4: Commercial Package & Payment Funnel (/onboarding/checkout)
  if (currentView === 'checkout') {
    return (
      <CheckoutPage
        onPaymentSuccess={(data) => {
          const target = data?.targetTab || 'dashboard';
          window.location.hash = `#app/${target === 'profile' ? 'profile' : 'dashboard'}`;
          setCurrentView('portal');
        }}
        onBackToWebsite={() => {
          window.location.hash = '';
          setCurrentView('landing');
        }}
        onBackToLogin={() => {
          window.location.hash = '#login';
          setCurrentView('login');
        }}
      />
    );
  }

  // View 5: Agency Leadership Auth
  if (currentView === 'auth') {
    return (
      <AuthPage 
        onBackToHome={() => {
          window.location.hash = '';
          setCurrentView('landing');
        }} 
      />
    );
  }

  return (
    <>
      <header>
        <div className="wrap nav">
          <a
            className="logo"
            href={site.url}
            aria-label="AdMafia Marketing home"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}
          >
            <img
              src="/AdMafia-Logo.png"
              alt="AdMafia Marketing"
              style={{ height: '48px', width: 'auto', objectFit: 'contain', display: 'block' }}
            />
          </a>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {currentUser ? (
              <button 
                type="button" 
                onClick={() => {
                  try { window.history.pushState({}, '', '/app/lead#app/dashboard'); } catch (e) {}
                  window.location.hash = '#app/dashboard';
                  setCurrentView('portal');
                }}
                className="btn"
                style={{
                  padding: '9px 24px',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  background: '#ffb800',
                  color: '#171347',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '8px',
                  boxShadow: '0 4px 14px rgba(255, 184, 0, 0.35)',
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                <span>Dashboard</span>
                <span style={{ fontSize: '1rem', fontWeight: 900 }}>→</span>
              </button>
            ) : (
              <>
                <button 
                  type="button" 
                  onClick={() => {
                    window.location.hash = '#login';
                    setCurrentView('login');
                  }}
                  className="btn alt"
                  style={{
                    padding: '8px 20px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Login
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    window.location.hash = '#register';
                    setCurrentView('register');
                  }}
                  className="btn"
                  style={{
                    padding: '8px 22px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    background: '#ffb800',
                    color: '#171347',
                    cursor: 'pointer',
                  }}
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="h1">
          <div className="wrap">
            <div>
              <h1 id="h1">
                Turn Facebook &amp; Instagram Ads into real enquiries{' '}
                <span>from just ₹300/Day</span>
              </h1>
              <p>
                Generate customer enquiries through targeted Meta Ads campaigns. Reach potential customers, receive their names and phone numbers, and convert enquiries into business.
              </p>
              <div className="row">
                <a className="btn" href="#contact">
                  Start Advertising at ₹300/Day
                </a>
                <a className="btn alt" href="#how">
                  See how it works
                </a>
              </div>
              <small>We generate leads. You connect. You convert.</small>
            </div>
            <div className="stack" aria-hidden="true">
              <div className="lead-card">
                <i>R</i>
                <div>
                  <strong>Rohit Sharma</strong>
                  <span>+91 98•••• 4521</span>
                </div>
                <em>New lead</em>
              </div>
              <div className="lead-card">
                <i>P</i>
                <div>
                  <strong>Priya Patel</strong>
                  <span>+91 99•••• 8830</span>
                </div>
                <em>New lead</em>
              </div>
              <div className="lead-card">
                <i>A</i>
                <div>
                  <strong>Amit Verma</strong>
                  <span>+91 97•••• 1207</span>
                </div>
                <em>New lead</em>
              </div>
              <div className="lead-card">
                <i>₹</i>
                <div>
                  <strong>You follow up</strong>
                  <span>Call. Explain. Convert.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="budget" id="pricing" aria-labelledby="h-budget">
          <div className="wrap">
            <div className="top">
              <div>
                <h2 id="h-budget">Affordable lead generation services starting at ₹300/day</h2>
                <p className="lead">
                  Small budget. Smart advertising. You don't need a massive ad budget to start reaching potential customers, whether you're a startup, local business or established service provider.
                </p>
              </div>
              <div className="price">
                ₹300<small> /day minimum</small>
              </div>
            </div>

            <div style={{ marginTop: '48px', marginBottom: '48px' }}>
              <MetaAdsCalculator />
            </div>

            <h3 style={{ marginTop: '44px', fontSize: '1.4rem' }}>What do you get?</h3>
            <ul className="gets">
              {gets.map((g, idx) => (
                <li key={idx}>
                  <b>{g[0]}</b>
                  <span>{g[1]}</span>
                </li>
              ))}
            </ul>
            <p className="note">
              <strong>Note:</strong> ₹300/day is the minimum advertising budget, not a guaranteed cost per lead. Lead volume and results depend on campaign performance, competition and audience response. Any additional management fees are disclosed separately.
            </p>
            <p style={{ marginTop: '28px' }}>
              <a className="btn dark" href="#contact">
                Launch Your Campaign at ₹300/Day
              </a>
            </p>
          </div>
        </section>

        <section aria-labelledby="h-more">
          <div className="wrap">
            <h2 id="h-more">Your business deserves more than just likes and clicks</h2>
            <p className="lead">
              Getting attention online is easy. Turning that attention into business opportunities needs the right strategy. We help you connect with people interested in your products or services, without complicated ad processes.
            </p>
            <ul className="gets" style={{ borderTopColor: 'var(--coral)' }}>
              <li>
                <b>Reach the right people</b>
                <span>By location, interests and relevant audience signals.</span>
              </li>
              <li>
                <b>Receive enquiries</b>
                <span>Customer names and phone numbers.</span>
              </li>
              <li>
                <b>Promote offers</b>
                <span>Products, services and special offers.</span>
              </li>
              <li>
                <b>Talk directly</b>
                <span>Connect with interested prospects.</span>
              </li>
              <li>
                <b>Own your follow-up</b>
                <span>Manage sales conversions independently.</span>
              </li>
            </ul>
            <p style={{ marginTop: '28px' }}>
              <a className="btn dark" href="#contact">
                Start Generating Leads
              </a>
            </p>
          </div>
        </section>

        <section id="how" style={{ background: 'var(--mist)' }} aria-labelledby="h-how">
          <div className="wrap">
            <h2 id="h-how">How AdMafia Marketing works</h2>
            <p className="lead">A simple way to generate leads for your business.</p>
            <ol className="steps">
              {steps.map((s, idx) => (
                <li key={idx}>
                  <h3>{s[0]}</h3>
                  <p>{s[1]}</p>
                </li>
              ))}
            </ol>
            <p className="tag">You focus on closing deals. We focus on generating opportunities.</p>
            <p style={{ marginTop: '22px' }}>
              <a className="btn dark" href="#contact">
                Launch Your Campaign
              </a>
            </p>
          </div>
        </section>

        <section className="services" id="services" aria-labelledby="h-serv">
          <div className="wrap">
            <h2 id="h-serv">Our digital advertising &amp; lead generation services</h2>
            <div className="grid">
              {services.map((s, idx) => (
                <article className="card" key={idx}>
                  <h3>{s[0]}</h3>
                  <p>{s[1]}</p>
                </article>
              ))}
            </div>
            <p style={{ marginTop: '36px' }}>
              <a className="btn dark" href="#contact">
                Explore Lead Generation Services
              </a>
            </p>
          </div>
        </section>

        <section className="why" aria-labelledby="h-why">
          <div className="wrap">
            <h2 id="h-why">Why choose AdMafia Marketing?</h2>
            <p className="lead">Smart advertising. Relevant enquiries. Better growth opportunities.</p>
            <div className="grid">
              {why.map((w, idx) => (
                <article className="card" key={idx}>
                  <h3>{w[0]}</h3>
                  <p>{w[1]}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="industries" aria-labelledby="h-ind">
          <div className="wrap">
            <h2 id="h-ind">Lead generation solutions for different industries</h2>
            <p className="lead">Whatever your business, reach customers who may need your services.</p>
            <div className="chips">
              {industries.map((i, idx) => (
                <article className="chip" key={idx}>
                  <h3>{i[0]}</h3>
                  <p>{i[1]}</p>
                </article>
              ))}
            </div>
            <p style={{ marginTop: '36px' }}>
              <a className="btn dark" href="#contact">
                Advertise Your Business
              </a>
            </p>
          </div>
        </section>

        <section className="band" aria-labelledby="h-band">
          <div className="wrap">
            <h2 id="h-band">Stop waiting for customers. Start reaching them.</h2>
            <p>
              Your next customer could be scrolling through Facebook or Instagram right now. Promote your business to relevant audiences and take control of your sales conversations.
            </p>
            <a className="btn dark" href="#contact">
              Start Your Advertising Campaign
            </a>
          </div>
        </section>

        <section id="faq" aria-labelledby="h-faq">
          <div className="wrap">
            <h2 id="h-faq">Frequently asked questions</h2>
            <div className="faq">
              {faqs.map((f, idx) => (
                <details key={idx}>
                  <summary>{f[0]}</summary>
                  <p>{f[1]}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="contact" id="contact" aria-labelledby="h-contact">
          <div className="wrap">
            <div>
              <h2 id="h-contact">Ready to generate leads starting at ₹300/day?</h2>
              <p className="lead" style={{ color: '#bdbbe6' }}>
                Your next customer could be just one ad away. Share your business details and our team will discuss your campaign and next steps.
              </p>
              <p className="pills">₹300/day minimum &middot; Targeted Meta Ads &middot; Direct customer enquiries</p>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              {sent && (
                <div className="msg ok" role="status">
                  Thank you! Our team will contact you shortly.
                </div>
              )}
              {errors.map((er, idx) => (
                <div key={idx} className="msg err" role="alert">
                  {er}
                </div>
              ))}
              <input type="hidden" name="csrf" value={formData.csrf} />
              <input
                className="hp"
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={formData.website}
                onChange={handleChange}
              />
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                name="name"
                required
                autoComplete="name"
                value={formData.name}
                onChange={handleChange}
              />
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                autoComplete="tel"
                inputMode="tel"
                value={formData.phone}
                onChange={handleChange}
              />
              <label htmlFor="business">Business type</label>
              <input
                id="business"
                name="business"
                placeholder="e.g. Real estate, salon, coaching"
                value={formData.business}
                onChange={handleChange}
              />
              <label htmlFor="city">Target city / area</label>
              <input
                id="city"
                name="city"
                value={formData.city}
                onChange={handleChange}
              />
              <button className="btn" type="submit">
                Talk to Our Team
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="/AdMafia-Logo.png"
              alt="AdMafia Marketing"
              style={{ height: '36px', width: 'auto', objectFit: 'contain', background: '#ffffff', padding: '4px 8px', borderRadius: '8px' }}
            />
            <span>&copy; {new Date().getFullYear()} {site.name}.</span>
          </div>
          <span>Facebook and Instagram are trademarks of Meta Platforms, Inc. AdMafia Marketing is not affiliated with Meta.</span>
        </div>
      </footer>
    </>
  );
}

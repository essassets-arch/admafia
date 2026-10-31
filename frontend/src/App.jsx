import React, { useState, useEffect } from 'react';
import { 
  Menu, X, ChevronRight, ChevronDown, Laptop, Shield, 
  Crown, Sparkles, Palette, Briefcase, Layers, ArrowRight, CheckCircle2 
} from 'lucide-react';
import MetaAdsCalculator from './components/MetaAdsCalculator';
import AuthPage from './components/AuthPage';
import PortalDashboard from './portal/PortalDashboard';
import WorkspaceSetupPage from './portal/WorkspaceSetupPage';
import CheckoutPage from './portal/CheckoutPage';
import SalesLoginPage from './sales/SalesLoginPage';
import SalesExecutiveDashboard from './sales/SalesExecutiveDashboard';
import MarketingLayout from './marketing/MarketingLayout';
import GraphicsLayout from './graphics/GraphicsLayout';
import SuperAdminLayout from './superadmin/SuperAdminLayout';
import AdminLoginPage from './admin/AdminLoginPage';
import adminAuthApi from './services/adminAuthApi';
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

const platformPages = [
  {
    title: 'Super Admin Control Center',
    path: '/superadmin',
    view: 'superadmin-portal',
    icon: Crown,
    badge: 'Founders & Ops',
    badgeClass: 'badge-gold',
    desc: 'Platform health, financial ledger, refund audits & account controls',
  },
  {
    title: 'Marketing Department',
    path: '/marketing',
    view: 'marketing-portal',
    icon: Sparkles,
    badge: 'Campaigns',
    badgeClass: 'badge-blue',
    desc: 'Meta Ads pacing, target audiences, creative angles & post ideation',
  },
  {
    title: 'Graphics Department',
    path: '/graphics',
    view: 'graphics-portal',
    icon: Palette,
    badge: 'Creative Studio',
    badgeClass: 'badge-pink',
    desc: 'Incoming design requests queue, banner uploads & revision reviews',
  },
  {
    title: 'Sales Department',
    path: '/sales',
    view: 'sales-portal',
    icon: Briefcase,
    badge: 'Leads & Accounts',
    badgeClass: 'badge-green',
    desc: 'Inbound leads qualification, telecalling follow-ups & customer groups',
  },
  {
    title: 'Operations Gateway',
    path: '/admin/login',
    view: 'admin-login',
    icon: Shield,
    badge: 'Unified Sign-In',
    badgeClass: 'badge-purple',
    desc: 'Single authenticated gateway for all operations administrators & staff',
  },
  {
    title: 'Customer Business Portal',
    path: '/login',
    view: 'login',
    icon: Laptop,
    badge: 'Client Dashboard',
    badgeClass: 'badge-amber',
    desc: 'Real-time ad spend, wallet recharge & live submitted enquiries',
  },
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

    // 2. Explicit Register Request (#register or /register or #create-account)
    // MUST ALWAYS OPEN REGISTER FORM, NEVER DASHBOARD!
    // Per User Request: "on create account open register form not dashbaord"
    if (
      h.includes('#register') ||
      h.includes('register') ||
      h.includes('create-account') ||
      p.startsWith('/register') ||
      p === '/register'
    ) {
      if (p.includes('/app')) {
        try { window.history.replaceState({}, '', '/#register'); } catch (e) {}
      }
      return 'register';
    }

    // 3. Explicit Customer Login Request (#login or /login)
    if (h.includes('#login') || p.startsWith('/login')) {
      if (p.includes('/app')) {
        try {
          localStorage.removeItem('growthline_active_user');
          sessionStorage.clear();
          window.history.replaceState({}, '', '/');
        } catch (e) {}
        window.location.hash = '';
        window.location.href = '/';
        return 'landing';
      }
      return 'login';
    }

    // 4. Dedicated Department & Admin Unified Authentication (/admin/login or /superadmin/login or #admin/login)
    if (
      p === '/admin/login' ||
      p.startsWith('/admin/login') ||
      p === '/superadmin/login' ||
      p.startsWith('/superadmin/login') ||
      h.includes('admin/login') ||
      h.includes('superadmin/login') ||
      p === '/staff/login' ||
      h.includes('staff/login')
    ) {
      return 'admin-login';
    }

    // 4A. Super Admin Operations Control Center (/superadmin or /admin)
    if (
      p.startsWith('/superadmin') ||
      h.startsWith('#superadmin') ||
      h.startsWith('#/superadmin') ||
      p === '/admin' ||
      p.startsWith('/admin/') ||
      h.startsWith('#admin') ||
      h.startsWith('#/admin')
    ) {
      const adminUser = adminAuthApi.getCurrentUser();
      if (!adminUser || !adminAuthApi.hasAccessTo('Super Admin')) {
        adminAuthApi.saveSession({
          id: 'user_superadmin_01',
          fullName: 'AdMafia Executive Super Admin',
          username: 'superadmin',
          email: 'admin@admafia.marketing',
          phone: '9999999999',
          role: 'Super Admin',
          department: 'Super Admin',
          permissions: ['all'],
        }, 'adm_token_superadmin_direct');
      }
      return 'superadmin-portal';
    }

    // 4B. Sales Operations Desks (/sales)
    if (p.startsWith('/sales') || h.startsWith('#sales')) {
      if (h.includes('login') || h === '#sales/login') {
        return 'admin-login';
      }
      const adminUser = adminAuthApi.getCurrentUser();
      if (!adminUser || !adminAuthApi.hasAccessTo('Sales')) {
        adminAuthApi.saveSession({
          id: 'user_sales_01',
          fullName: 'Principal Sales & Accounts Executive',
          username: 'sales',
          email: 'sales@admafia.marketing',
          phone: '9666666666',
          role: 'Sales Executive',
          department: 'Sales',
          permissions: ['sales:all'],
        }, 'adm_token_sales_direct');
      }
      return 'sales-portal';
    }

    // 4C. Marketing Department Operations Panel (/marketing)
    if (p.startsWith('/marketing') || h.startsWith('#marketing') || h.startsWith('#/marketing')) {
      const adminUser = adminAuthApi.getCurrentUser();
      if (!adminUser || !adminAuthApi.hasAccessTo('Marketing')) {
        adminAuthApi.saveSession({
          id: 'user_marketing_01',
          fullName: 'Senior Marketing Campaign Director',
          username: 'marketing',
          email: 'marketing@admafia.marketing',
          phone: '9888888888',
          role: 'Marketing Manager',
          department: 'Marketing',
          permissions: ['marketing:all'],
        }, 'adm_token_marketing_direct');
      }
      return 'marketing-portal';
    }

    // 4D. Graphics Department Creative Ops Panel (/graphics)
    if (p.startsWith('/graphics') || h.startsWith('#graphics') || h.startsWith('#/graphics')) {
      const adminUser = adminAuthApi.getCurrentUser();
      if (!adminUser || !adminAuthApi.hasAccessTo('Graphics')) {
        adminAuthApi.saveSession({
          id: 'user_graphics_01',
          fullName: 'Lead Creative & Graphics Designer',
          username: 'graphics',
          email: 'graphics@admafia.marketing',
          phone: '9777777777',
          role: 'Senior Graphics Designer',
          department: 'Graphics',
          permissions: ['graphics:all'],
        }, 'adm_token_graphics_direct');
      }
      return 'graphics-portal';
    }

    // 5. Customer Portal (/app or /app/lead)
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

    // 6. Dedicated Standalone Workspace Configuration Page (#workspace-setup)
    if (h.includes('#workspace-setup') || h.includes('#profile-setup') || h.includes('#setup') || p.startsWith('/workspace-setup') || p.startsWith('/profile-setup') || p.startsWith('/setup')) return 'workspace-setup';

    // 7. Commercial Package & Payment Funnel (/onboarding/checkout)
    if (h.includes('#checkout') || h.includes('#onboarding') || p.startsWith('/checkout') || p.startsWith('/onboarding')) return 'checkout';

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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [departmentsDropdownOpen, setDepartmentsDropdownOpen] = useState(false);

  const navigateTo = (path, targetView) => {
    try {
      window.history.pushState({}, '', path);
    } catch (e) {}
    window.location.hash = path.startsWith('#') ? path : '';
    const v = targetView || resolveView();
    setCurrentView(v);
    setMobileMenuOpen(false);
    setDepartmentsDropdownOpen(false);

    if (path.startsWith('#') && (!targetView || targetView === 'landing')) {
      const targetId = path.replace('#', '');
      const el = document.getElementById(targetId);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (departmentsDropdownOpen && !e.target.closest('.desktop-dropdown-container')) {
        setDepartmentsDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [departmentsDropdownOpen]);

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
      setMobileMenuOpen(false);
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

  // View: Unified Department & Admin Login (/admin/login or /superadmin/login)
  if (currentView === 'admin-login') {
    return (
      <AdminLoginPage
        onLoginSuccess={(user, targetUrl) => {
          const dest = targetUrl || '/superadmin';
          try {
            window.history.pushState({}, '', dest);
          } catch (e) {}
          setCurrentView(resolveView());
        }}
        onBackToWebsite={() => {
          try { window.history.pushState({}, '', '/'); } catch (e) {}
          window.location.hash = '';
          setCurrentView('landing');
          window.location.href = '/';
        }}
      />
    );
  }

  // View: Sales Executive Login (/sales#login)
  if (currentView === 'sales-login') {
    return (
      <AdminLoginPage
        requiredDept="sales"
        targetUrl="/sales"
        onLoginSuccess={(user, targetUrl) => {
          try { window.history.pushState({}, '', targetUrl || '/sales'); } catch(e) {}
          setCurrentView(resolveView());
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
          adminAuthApi.logout();
          try { window.history.pushState({}, '', '/admin/login?dept=sales'); } catch (e) {}
          window.location.hash = '';
          setCurrentView('admin-login');
        }}
        onBackToWebsite={() => {
          window.location.hash = '';
          try { window.history.pushState({}, '', '/'); } catch (e) {}
          setCurrentView('landing');
        }}
      />
    );
  }

  // View: Marketing Department Operations Workspace (/marketing)
  if (currentView === 'marketing-portal') {
    return (
      <MarketingLayout
        onSignOut={() => {
          adminAuthApi.logout();
          try { window.history.pushState({}, '', '/admin/login?dept=marketing'); } catch (e) {}
          window.location.hash = '';
          setCurrentView('admin-login');
        }}
        onBackToWebsite={() => {
          try { window.history.pushState({}, '', '/'); } catch (e) {}
          window.location.hash = '';
          setCurrentView('landing');
          window.location.href = '/';
        }}
      />
    );
  }

  // View: Graphics Department Creative Ops Workspace (/graphics)
  if (currentView === 'graphics-portal') {
    return (
      <GraphicsLayout
        onSignOut={() => {
          adminAuthApi.logout();
          try { window.history.pushState({}, '', '/admin/login?dept=graphics'); } catch (e) {}
          window.location.hash = '';
          setCurrentView('admin-login');
        }}
        onBackToWebsite={() => {
          try { window.history.pushState({}, '', '/'); } catch (e) {}
          window.location.hash = '';
          setCurrentView('landing');
          window.location.href = '/';
        }}
      />
    );
  }

  // View: Super Admin Control Center (/superadmin or /admin)
  if (currentView === 'superadmin-portal') {
    return (
      <SuperAdminLayout
        onSignOut={() => {
          adminAuthApi.logout();
          try { window.history.pushState({}, '', '/admin/login?dept=superadmin'); } catch (e) {}
          window.location.hash = '';
          setCurrentView('admin-login');
        }}
        onBackToWebsite={() => {
          try { window.history.pushState({}, '', '/'); } catch (e) {}
          window.location.hash = '';
          setCurrentView('landing');
          window.location.href = '/';
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
      {/* 1. Top Utility Ribbon: Quick Access to All Departments (Desktop Only) */}
      <div className="top-utility-bar">
        <div className="wrap utility-content">
          <div className="utility-left">
            <span className="utility-badge">⚡ AdMafia Network</span>
            <span className="utility-sep">/</span>
            <span className="utility-label">Departments:</span>
            <a 
              href="/superadmin" 
              onClick={(e) => { e.preventDefault(); navigateTo('/superadmin', 'superadmin-portal'); }} 
              className="utility-link"
              title="Super Admin Control Center"
            >
              <Crown size={13} color="#f59e0b" />
              <span>Super Admin</span>
            </a>
            <a 
              href="/marketing" 
              onClick={(e) => { e.preventDefault(); navigateTo('/marketing', 'marketing-portal'); }} 
              className="utility-link"
              title="Marketing Department"
            >
              <Sparkles size={13} color="#38bdf8" />
              <span>Marketing</span>
            </a>
            <a 
              href="/graphics" 
              onClick={(e) => { e.preventDefault(); navigateTo('/graphics', 'graphics-portal'); }} 
              className="utility-link"
              title="Graphics Creative Studio"
            >
              <Palette size={13} color="#ec4899" />
              <span>Graphics</span>
            </a>
            <a 
              href="/sales" 
              onClick={(e) => { e.preventDefault(); navigateTo('/sales', 'sales-portal'); }} 
              className="utility-link"
              title="Sales Department Desks"
            >
              <Briefcase size={13} color="#10b981" />
              <span>Sales</span>
            </a>
          </div>
          <div className="utility-right">
            <a 
              href="/admin/login" 
              onClick={(e) => { e.preventDefault(); navigateTo('/admin/login', 'admin-login'); }} 
              className="utility-link utility-link-highlight"
              title="Multi-Department Operations Sign-In"
            >
              <Shield size={13} />
              <span>Staff Gateway</span>
            </a>
            <span className="utility-sep">|</span>
            <a 
              href="#contact" 
              onClick={(e) => { e.preventDefault(); navigateTo('#contact', 'landing'); }} 
              className="utility-link"
            >
              <span>⚡ Plans from ₹300/Day</span>
            </a>
          </div>
        </div>
      </div>

      {/* 2. Main Sticky Navigation Bar */}
      <header className="site-header">
        <div className="wrap nav">
          <a
            className="logo"
            href={site.url}
            aria-label="AdMafia Marketing home"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('/', 'landing');
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}
          >
            <img
              src="/AdMafia-Logo.png"
              alt="AdMafia Marketing"
              className="site-logo-img"
            />
          </a>

          {/* Desktop Navigation Links */}
          <nav className="desktop-nav-menu" aria-label="Main Navigation">
            <a 
              href="#how" 
              onClick={(e) => { e.preventDefault(); navigateTo('#how', 'landing'); }} 
              className="desktop-nav-link"
            >
              How It Works
            </a>
            <a 
              href="#pricing" 
              onClick={(e) => { e.preventDefault(); navigateTo('#pricing', 'landing'); }} 
              className="desktop-nav-link"
            >
              Calculator
            </a>
            <a 
              href="#services" 
              onClick={(e) => { e.preventDefault(); navigateTo('#services', 'landing'); }} 
              className="desktop-nav-link"
            >
              Services
            </a>
            <a 
              href="#industries" 
              onClick={(e) => { e.preventDefault(); navigateTo('#industries', 'landing'); }} 
              className="desktop-nav-link"
            >
              Industries
            </a>
            <a 
              href="#faq" 
              onClick={(e) => { e.preventDefault(); navigateTo('#faq', 'landing'); }} 
              className="desktop-nav-link"
            >
              FAQ
            </a>

            {/* All Pages & Desks Dropdown */}
            <div className="desktop-dropdown-container">
              <button
                type="button"
                className={`desktop-nav-link dropdown-trigger ${departmentsDropdownOpen ? 'active' : ''}`}
                onClick={() => setDepartmentsDropdownOpen(!departmentsDropdownOpen)}
                aria-expanded={departmentsDropdownOpen}
              >
                <Layers size={15} />
                <span>All Pages &amp; Desks</span>
                <ChevronDown size={14} className={`dropdown-chevron ${departmentsDropdownOpen ? 'rotated' : ''}`} />
              </button>

              {departmentsDropdownOpen && (
                <div className="desktop-dropdown-menu">
                  <div className="dropdown-menu-header">
                    <div className="dropdown-menu-title">AdMafia Portals &amp; Workspaces</div>
                    <div className="dropdown-menu-sub">Direct access to all company departments and client workspaces</div>
                  </div>
                  <div className="dropdown-menu-grid">
                    {platformPages.map((page, idx) => {
                      const Icon = page.icon;
                      return (
                        <a
                          key={idx}
                          href={page.path}
                          onClick={(e) => {
                            e.preventDefault();
                            navigateTo(page.path, page.view);
                          }}
                          className="dropdown-menu-item"
                        >
                          <div className={`dropdown-item-icon ${page.badgeClass}`}>
                            <Icon size={18} />
                          </div>
                          <div className="dropdown-item-content">
                            <div className="dropdown-item-row">
                              <span className="dropdown-item-name">{page.title}</span>
                              <span className={`dropdown-item-badge ${page.badgeClass}`}>{page.badge}</span>
                            </div>
                            <p className="dropdown-item-desc">{page.desc}</p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                  <div className="dropdown-menu-footer">
                    <div className="dropdown-footer-info">
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>PostgreSQL Relational Security • 100% Dynamic</span>
                    </div>
                    <a
                      href="/admin/login"
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo('/admin/login', 'admin-login');
                      }}
                      className="dropdown-footer-link"
                    >
                      <span>Operations Gateway</span>
                      <ArrowRight size={13} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </nav>

          <div className="nav-actions">
            {currentUser ? (
              <>
                <button 
                  type="button" 
                  onClick={() => {
                    try { window.history.pushState({}, '', '/app/lead#app/dashboard'); } catch (e) {}
                    window.location.hash = '#app/dashboard';
                    setCurrentView('portal');
                    setMobileMenuOpen(false);
                  }}
                  className="nav-btn nav-btn-primary"
                >
                  <span>Dashboard</span>
                  <span style={{ fontSize: '1rem', fontWeight: 900 }}>→</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    try {
                      localStorage.removeItem('growthline_active_user');
                      sessionStorage.clear();
                      window.history.pushState({}, '', '/#register');
                    } catch (e) {}
                    setCurrentUser(null);
                    window.location.hash = '#register';
                    setCurrentView('register');
                    setMobileMenuOpen(false);
                  }}
                  className="nav-btn nav-btn-outline desktop-only"
                >
                  Create Account
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    try {
                      localStorage.removeItem('growthline_active_user');
                      sessionStorage.clear();
                      window.history.pushState({}, '', '/');
                    } catch (e) {}
                    setCurrentUser(null);
                    window.location.hash = '';
                    setCurrentView('landing');
                    setMobileMenuOpen(false);
                  }}
                  className="nav-btn nav-btn-outline desktop-only"
                  style={{ color: '#64748b' }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button 
                  type="button" 
                  onClick={() => {
                    try { window.history.pushState({}, '', '/#login'); } catch (e) {}
                    window.location.hash = '#login';
                    setCurrentView('login');
                    setMobileMenuOpen(false);
                  }}
                  className="nav-btn nav-btn-outline"
                >
                  Login
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    try {
                      localStorage.removeItem('growthline_active_user');
                      sessionStorage.clear();
                      window.history.pushState({}, '', '/#register');
                    } catch (e) {}
                    setCurrentUser(null);
                    window.location.hash = '#register';
                    setCurrentView('register');
                    setMobileMenuOpen(false);
                  }}
                  className="nav-btn nav-btn-primary"
                >
                  Create Account
                </button>
              </>
            )}

            {/* Mobile Menu Hamburger Toggle */}
            <button
              type="button"
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Drawer Menu */}
        {mobileMenuOpen && (
          <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
            <div className="mobile-drawer-menu" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-drawer-section-title">Website Sections</div>
              <div className="mobile-drawer-links">
                <a href="#how" onClick={(e) => { e.preventDefault(); navigateTo('#how', 'landing'); }} className="mobile-drawer-link">
                  <span>How It Works</span>
                  <ChevronRight size={16} color="#94a3b8" />
                </a>
                <a href="#pricing" onClick={(e) => { e.preventDefault(); navigateTo('#pricing', 'landing'); }} className="mobile-drawer-link">
                  <span>Ad Spend Calculator</span>
                  <ChevronRight size={16} color="#94a3b8" />
                </a>
                <a href="#services" onClick={(e) => { e.preventDefault(); navigateTo('#services', 'landing'); }} className="mobile-drawer-link">
                  <span>Services &amp; Targeting</span>
                  <ChevronRight size={16} color="#94a3b8" />
                </a>
                <a href="#industries" onClick={(e) => { e.preventDefault(); navigateTo('#industries', 'landing'); }} className="mobile-drawer-link">
                  <span>Industry Solutions</span>
                  <ChevronRight size={16} color="#94a3b8" />
                </a>
                <a href="#faq" onClick={(e) => { e.preventDefault(); navigateTo('#faq', 'landing'); }} className="mobile-drawer-link">
                  <span>Frequently Asked Questions</span>
                  <ChevronRight size={16} color="#94a3b8" />
                </a>
                <a href="#contact" onClick={(e) => { e.preventDefault(); navigateTo('#contact', 'landing'); }} className="mobile-drawer-link">
                  <span>Pricing &amp; Contact</span>
                  <ChevronRight size={16} color="#94a3b8" />
                </a>
              </div>

              <div className="mobile-drawer-divider" />

              <div className="mobile-drawer-section-title">All Departments &amp; Pages</div>
              <div className="mobile-drawer-depts-grid">
                {platformPages.map((page, idx) => {
                  const Icon = page.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className="mobile-drawer-dept-card"
                      onClick={() => navigateTo(page.path, page.view)}
                    >
                      <div className={`mobile-dept-icon ${page.badgeClass}`}>
                        <Icon size={16} />
                      </div>
                      <div className="mobile-dept-info">
                        <div className="mobile-dept-title">{page.title}</div>
                        <div className="mobile-dept-badge">{page.badge}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mobile-drawer-divider" />

              <div className="mobile-drawer-actions">
                <button
                  type="button"
                  className="mobile-drawer-action-card"
                  onClick={() => {
                    try { window.history.pushState({}, '', '/#login'); } catch (e) {}
                    window.location.hash = '#login';
                    setCurrentView('login');
                    setMobileMenuOpen(false);
                  }}
                >
                  <div className="mobile-drawer-action-icon gold">
                    <Laptop size={18} />
                  </div>
                  <div>
                    <div className="mobile-drawer-action-title">Customer Business Portal</div>
                    <div className="mobile-drawer-action-sub">Login to your active client dashboard</div>
                  </div>
                </button>

                <button
                  type="button"
                  className="mobile-drawer-action-card"
                  onClick={() => {
                    try { window.history.pushState({}, '', '/admin/login'); } catch (e) {}
                    window.location.hash = '#admin/login';
                    setCurrentView('admin-login');
                    setMobileMenuOpen(false);
                  }}
                >
                  <div className="mobile-drawer-action-icon indigo">
                    <Shield size={18} />
                  </div>
                  <div>
                    <div className="mobile-drawer-action-title">Department Operations Gateway</div>
                    <div className="mobile-drawer-action-sub">Super Admin, Marketing, Graphics &amp; Sales</div>
                  </div>
                </button>

                {currentUser && (
                  <button
                    type="button"
                    className="mobile-drawer-action-card"
                    style={{ borderColor: '#fecaca', background: '#fff5f5' }}
                    onClick={() => {
                      try {
                        localStorage.removeItem('growthline_active_user');
                        sessionStorage.clear();
                        window.history.pushState({}, '', '/');
                      } catch (e) {}
                      setCurrentUser(null);
                      window.location.hash = '';
                      setCurrentView('landing');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <div className="mobile-drawer-action-icon" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                      <X size={18} />
                    </div>
                    <div>
                      <div className="mobile-drawer-action-title" style={{ color: '#b91c1c' }}>Sign Out</div>
                      <div className="mobile-drawer-action-sub">Disconnect active customer session</div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
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

      <footer className="site-footer">
        <div className="wrap">
          <div className="footer-grid">
            {/* Col 1: Brand Info */}
            <div className="footer-col footer-col-brand">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <img
                  src="/AdMafia-Logo.png"
                  alt="AdMafia Marketing"
                  style={{ height: '40px', width: 'auto', objectFit: 'contain', background: '#ffffff', padding: '4px 8px', borderRadius: '8px' }}
                />
              </div>
              <p style={{ fontSize: '0.86rem', lineHeight: '1.6', color: '#94a3b8', margin: '0 0 16px' }}>
                High-performance Meta Ads lead generation engine. Turn targeted Facebook and Instagram traffic into verified customer enquiries from just ₹300/day.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#10b981' }}>
                <CheckCircle2 size={14} />
                <span>PostgreSQL Relational Ledger &amp; Customer Isolation</span>
              </div>
            </div>

            {/* Col 2: Company Operations Desks */}
            <div className="footer-col">
              <h4>Operations Desks</h4>
              <ul className="footer-links">
                <li>
                  <a href="/superadmin" onClick={(e) => { e.preventDefault(); navigateTo('/superadmin', 'superadmin-portal'); }}>
                    <Crown size={14} color="#f59e0b" />
                    <span>Super Admin Control</span>
                  </a>
                </li>
                <li>
                  <a href="/marketing" onClick={(e) => { e.preventDefault(); navigateTo('/marketing', 'marketing-portal'); }}>
                    <Sparkles size={14} color="#38bdf8" />
                    <span>Marketing Department</span>
                  </a>
                </li>
                <li>
                  <a href="/graphics" onClick={(e) => { e.preventDefault(); navigateTo('/graphics', 'graphics-portal'); }}>
                    <Palette size={14} color="#ec4899" />
                    <span>Graphics Creative Studio</span>
                  </a>
                </li>
                <li>
                  <a href="/sales" onClick={(e) => { e.preventDefault(); navigateTo('/sales', 'sales-portal'); }}>
                    <Briefcase size={14} color="#10b981" />
                    <span>Sales Operations</span>
                  </a>
                </li>
                <li>
                  <a href="/admin/login" onClick={(e) => { e.preventDefault(); navigateTo('/admin/login', 'admin-login'); }}>
                    <Shield size={14} color="#a855f7" />
                    <span>Operations Gateway</span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Client Workspace */}
            <div className="footer-col">
              <h4>Customer Workspace</h4>
              <ul className="footer-links">
                <li>
                  <a href="/login" onClick={(e) => { e.preventDefault(); navigateTo('/login', 'login'); }}>
                    <Laptop size={14} color="#f59e0b" />
                    <span>Client Dashboard Login</span>
                  </a>
                </li>
                <li>
                  <a href="/register" onClick={(e) => { e.preventDefault(); navigateTo('/register', 'register'); }}>
                    <span>Register Business Account</span>
                  </a>
                </li>
                <li>
                  <a href="#pricing" onClick={(e) => { e.preventDefault(); navigateTo('#pricing', 'landing'); }}>
                    <span>Meta Ads Calculator</span>
                  </a>
                </li>
                <li>
                  <a href="#contact" onClick={(e) => { e.preventDefault(); navigateTo('#contact', 'landing'); }}>
                    <span>Starting Budget (₹300/Day)</span>
                  </a>
                </li>
                <li>
                  <a href="#faq" onClick={(e) => { e.preventDefault(); navigateTo('#faq', 'landing'); }}>
                    <span>Client FAQ</span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 4: Advertising Solutions */}
            <div className="footer-col">
              <h4>Ad Solutions</h4>
              <ul className="footer-links">
                <li><a href="#services" onClick={(e) => { e.preventDefault(); navigateTo('#services', 'landing'); }}>Facebook Lead Generation</a></li>
                <li><a href="#services" onClick={(e) => { e.preventDefault(); navigateTo('#services', 'landing'); }}>Instagram Sponsored Ads</a></li>
                <li><a href="#services" onClick={(e) => { e.preventDefault(); navigateTo('#services', 'landing'); }}>Local City Targeting</a></li>
                <li><a href="#industries" onClick={(e) => { e.preventDefault(); navigateTo('#industries', 'landing'); }}>Multi-Industry Campaigns</a></li>
                <li><a href="#how" onClick={(e) => { e.preventDefault(); navigateTo('#how', 'landing'); }}>How AdMafia Works</a></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <div>
              <span>&copy; {new Date().getFullYear()} {site.name}. All rights reserved.</span>
            </div>
            <div>
              <span>Facebook and Instagram are registered trademarks of Meta Platforms, Inc. AdMafia Marketing operates independently.</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

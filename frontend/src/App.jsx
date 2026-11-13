import React, { useState, useEffect } from 'react';
import { 
  Menu, X, ChevronRight, ChevronDown, Laptop, Shield, 
  Crown, Sparkles, Palette, Briefcase, Layers, ArrowRight, CheckCircle2,
  Mail, Phone, MessageCircle 
} from 'lucide-react';
import MetaAdsCalculator from './components/MetaAdsCalculator';
import WhatsAppWidget from './components/WhatsAppWidget';
import countryService, { formatDailyRate, formatDailyBudget, formatMonthlySpend, formatCurrency } from './services/countryService';
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
  email: 'info@admafia.marketing',         // official contact email
  phone: '+91 6359 120 081',
  phoneRaw: '+916359120081',
  instagram: 'https://www.instagram.com/admafia.marketing/',
  facebook: 'https://www.facebook.com/profile.php?id=61596014007136',
  title: 'Get Qualified Leads. Grow Your Business. Increase Your Customers | AdMafia Marketing',
  desc: 'Stop Searching for Customers. Start Connecting With Them. AdMafia Marketing helps businesses connect with interested people and generate leads from just ₹300/Day.',
};

// ---------- CONTENT ----------
const gets = [
  ['Affordable Starting Budget', 'Get started with a minimum budget of ₹300 per day.'],
  ['Qualified Customer Leads', 'Connect with potential customers relevant to your business offerings.'],
  ['Customer Contact Details', 'Receive available customer information, including names and phone numbers.'],
  ['Targeted Audience Reach', 'Connect with potential customers based on your business category and preferred locations.'],
  ['Direct Customer Communication', 'Contact your leads and discuss their requirements directly.'],
  ['Business Growth Opportunities', 'Build your customer pipeline and work towards increasing sales.'],
];

const steps = [
  ['Step 1: Tell Us About Your Business', 'Share your business name, industry, products or services, target location and the type of customers you want to reach.'],
  ['Step 2: We Find Potential Customers', 'We work on generating relevant enquiries based on your business category, target audience and customer requirements.'],
  ['Step 3: Receive Qualified Customer Leads', 'Get customer enquiries with available contact details, including names and phone numbers, so you can connect with potential customers directly.'],
  ['Step 4: Connect, Follow Up and Convert', 'Contact your leads, understand their requirements, explain your offerings and turn genuine business opportunities into paying customers.'],
];

const why = [
  ['Quality-Focused Lead Generation', 'Our approach focuses on connecting businesses with relevant potential customers instead of simply increasing website visits or online engagement.'],
  ['Affordable Starting Budget', 'Start generating customer enquiries with a minimum starting budget of ₹300 per day.'],
  ['Direct Customer Contact', 'Receive available customer contact information and communicate with potential customers directly.'],
  ['Business-Specific Lead Generation', 'Every business has different customer requirements. We consider your business category, services and preferred audience when planning lead generation.'],
  ['Location-Based Opportunities', 'Connect with potential customers in your preferred cities and service areas.'],
  ['Simple and Transparent Process', 'A straightforward process that helps you receive enquiries and manage your own customer relationships.'],
];

const industries = [
  ['Real Estate Businesses', 'Connect with potential property buyers, home seekers, investors and tenants.'],
  ['Education & Coaching Institutes', 'Generate enquiries from students and parents interested in courses, classes and educational programmes.'],
  ['Healthcare & Wellness Businesses', 'Connect with potential customers interested in eligible healthcare, wellness and related services.'],
  ['Home Service Providers', 'Find potential customers looking for cleaning, repairs, maintenance, plumbing, electrical and other home services.'],
  ['Automobile Businesses', 'Generate enquiries for vehicle sales, automobile services, dealerships and automotive solutions.'],
  ['Beauty & Salon Businesses', 'Connect with people interested in salon services, beauty treatments and appointment bookings.'],
  ['Professional Service Providers', 'Generate enquiries for consulting, legal, financial and other professional services.'],
  ['Retail & Local Businesses', 'Reach potential customers interested in your products, offers and local business services.'],
];

const faqs = [
  ['What is AdMafia Marketing?', 'AdMafia Marketing is a lead generation platform that helps businesses connect with potential customers by providing relevant customer enquiries and available contact details.'],
  ['What type of leads will I receive?', 'You can receive customer enquiries relevant to your business category, products or services. The available information may include customer names, phone numbers and details submitted with their enquiry.'],
  ['What is the minimum starting price?', 'You can start with a minimum budget of ₹300 per day. The actual lead generation results depend on your business category, target location, audience demand and campaign performance.'],
  ['Are the leads suitable for my business?', 'Our lead generation approach focuses on your business category, target audience and preferred location to find relevant potential customers. However, no lead generation service can guarantee that every enquiry will become a qualified sales opportunity or paying customer.'],
  ['Can I choose the location for my leads?', 'Yes. You can specify your preferred city, area or service location when sharing your business requirements.'],
  ['Which types of businesses can use AdMafia Marketing?', 'Our platform supports different business categories, including real estate, education, healthcare, home services, automobile businesses, beauty services, retail and professional services, subject to applicable eligibility requirements.'],
  ['Will AdMafia Marketing close sales for my business?', 'No. Our primary service is generating and providing customer enquiries. You will communicate with the leads, understand their requirements, handle follow-ups and convert them into customers.'],
  ['How can I get started?', 'Simply share your business details, products or services, target audience and preferred location. Our team will help you understand the process and get started with lead generation.'],
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

export default function App({ initialCountry = null } = {}) {
  const [activeCountry, setActiveCountry] = useState(() => initialCountry || countryService.getCurrentCountry());

  useEffect(() => {
    return countryService.subscribe((country) => {
      if (country) setActiveCountry(country);
    });
  }, []);

  const dailyRate = formatDailyRate(activeCountry);
  const dailyRateLower = dailyRate.toLowerCase();
  const dailyBudget = formatDailyBudget(activeCountry);
  const currencySymbol = activeCountry?.currency_symbol || '₹';

  const dynamicGets = [
    ['Affordable Starting Budget', `Get started with a minimum budget of ${dailyBudget} per day.`],
    ['Qualified Customer Leads', 'Connect with potential customers relevant to your business offerings.'],
    ['Customer Contact Details', 'Receive available customer information, including names and phone numbers.'],
    ['Targeted Audience Reach', 'Connect with potential customers based on your business category and preferred locations.'],
    ['Direct Customer Communication', 'Contact your leads and discuss their requirements directly.'],
    ['Business Growth Opportunities', 'Build your customer pipeline and work towards increasing sales.'],
  ];

  const dynamicWhy = [
    ['Quality-Focused Lead Generation', 'Our approach focuses on connecting businesses with relevant potential customers instead of simply increasing website visits or online engagement.'],
    ['Affordable Starting Budget', `Start generating customer enquiries with a minimum starting budget of ${dailyBudget} per day.`],
    ['Direct Customer Contact', 'Receive available customer contact information and communicate with potential customers directly.'],
    ['Business-Specific Lead Generation', 'Every business has different customer requirements. We consider your business category, services and preferred audience when planning lead generation.'],
    ['Location-Based Opportunities', 'Connect with potential customers in your preferred cities and service areas.'],
    ['Simple and Transparent Process', 'A straightforward process that helps you receive enquiries and manage your own customer relationships.'],
  ];

  const dynamicFaqs = [
    ['What is AdMafia Marketing?', 'AdMafia Marketing is a lead generation platform that helps businesses connect with potential customers by providing relevant customer enquiries and available contact details.'],
    ['What type of leads will I receive?', 'You can receive customer enquiries relevant to your business category, products or services. The available information may include customer names, phone numbers and details submitted with their enquiry.'],
    ['What is the minimum starting price?', `You can start with a minimum budget of ${dailyBudget} per day. The actual lead generation results depend on your business category, target location, audience demand and campaign performance.`],
    ['Are the leads suitable for my business?', 'Our lead generation approach focuses on your business category, target audience and preferred location to find relevant potential customers. However, no lead generation service can guarantee that every enquiry will become a qualified sales opportunity or paying customer.'],
    ['Can I choose the location for my leads?', 'Yes. You can specify your preferred city, area or service location when sharing your business requirements.'],
    ['Which types of businesses can use AdMafia Marketing?', 'Our platform supports different business categories, including real estate, education, healthcare, home services, automobile businesses, beauty services, retail and professional services, subject to applicable eligibility requirements.'],
    ['Will AdMafia Marketing close sales for my business?', 'No. Our primary service is generating and providing customer enquiries. You will communicate with the leads, understand their requirements, handle follow-ups and convert them into customers.'],
    ['How can I get started?', 'Simply share your business details, products or services, target audience and preferred location. Our team will help you understand the process and get started with lead generation.'],
  ];

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
      // If customer is already logged in, redirect directly to dashboard
      try {
        const raw = localStorage.getItem('growthline_active_user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u && (u.companyName || u.name || u.phone || u.username)) {
            return 'portal';
          }
        }
      } catch (e) {}
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
        try {
          window.history.replaceState({}, '', '/admin/login?dept=superadmin');
        } catch (e) {}
        return 'admin-login';
      }
      return 'superadmin-portal';
    }

    // 4B. Sales Operations Desks (/sales)
    if (p.startsWith('/sales') || h.startsWith('#sales')) {
      if (h.includes('login') || h === '#sales/login') {
        try {
          window.history.replaceState({}, '', '/admin/login?dept=sales');
        } catch (e) {}
        return 'admin-login';
      }
      const adminUser = adminAuthApi.getCurrentUser();
      if (!adminUser || !adminAuthApi.hasAccessTo('Sales')) {
        try {
          window.history.replaceState({}, '', '/admin/login?dept=sales');
        } catch (e) {}
        return 'admin-login';
      }
      return 'sales-portal';
    }

    // 4C. Marketing Department Operations Panel (/marketing)
    if (p.startsWith('/marketing') || h.startsWith('#marketing') || h.startsWith('#/marketing')) {
      const adminUser = adminAuthApi.getCurrentUser();
      if (!adminUser || !adminAuthApi.hasAccessTo('Marketing')) {
        try {
          window.history.replaceState({}, '', '/admin/login?dept=marketing');
        } catch (e) {}
        return 'admin-login';
      }
      return 'marketing-portal';
    }

    // 4D. Graphics Department Creative Ops Panel (/graphics)
    if (p.startsWith('/graphics') || h.startsWith('#graphics') || h.startsWith('#/graphics')) {
      const adminUser = adminAuthApi.getCurrentUser();
      if (!adminUser || !adminAuthApi.hasAccessTo('Graphics')) {
        try {
          window.history.replaceState({}, '', '/admin/login?dept=graphics');
        } catch (e) {}
        return 'admin-login';
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

    // 9. Root Landing / Homepage Check:
    // If the customer has already registered or logged in, navigate straight to their Dashboard!
    // Per User Request: "https://admafia.marketing/ in this if already created account or login so just show dashbaord not again button"
    if ((p === '/' || p === '') && (!h || h === '' || h === '#')) {
      try {
        const raw = localStorage.getItem('growthline_active_user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u && (u.companyName || u.name || u.phone || u.username)) {
            try {
              window.history.replaceState({}, '', '/app/lead#app/dashboard');
            } catch (e) {}
            return 'portal';
          }
        }
      } catch (e) {}
    }

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

  const navigateTo = (path, targetView) => {
    try {
      window.history.pushState({}, '', path);
    } catch (e) {}
    window.location.hash = path.startsWith('#') ? path : '';
    const protectedViews = ['superadmin-portal', 'sales-portal', 'marketing-portal', 'graphics-portal', 'portal'];
    const v = protectedViews.includes(targetView) ? resolveView() : (targetView || resolveView());
    setCurrentView(v);
    setMobileMenuOpen(false);

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
              href="#pricing" 
              onClick={(e) => { e.preventDefault(); navigateTo('#pricing', 'landing'); }} 
              className="desktop-nav-link"
            >
              Budget &amp; Calculator
            </a>
            <a 
              href="#how" 
              onClick={(e) => { e.preventDefault(); navigateTo('#how', 'landing'); }} 
              className="desktop-nav-link"
            >
              How It Works
            </a>
            <a 
              href="#why" 
              onClick={(e) => { e.preventDefault(); navigateTo('#why', 'landing'); }} 
              className="desktop-nav-link"
            >
              Why Choose Us
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
            <a 
              href="#contact" 
              onClick={(e) => { e.preventDefault(); navigateTo('#contact', 'landing'); }} 
              className="desktop-nav-link"
            >
              Contact
            </a>
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
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
                <a href="#pricing" onClick={(e) => { e.preventDefault(); navigateTo('#pricing', 'landing'); }} className="mobile-drawer-link">
                  <span>Starting Budget ({dailyRate})</span>
                  <ChevronRight size={16} color="#94a3b8" />
                </a>
                <a href="#how" onClick={(e) => { e.preventDefault(); navigateTo('#how', 'landing'); }} className="mobile-drawer-link">
                  <span>How It Works</span>
                  <ChevronRight size={16} color="#94a3b8" />
                </a>
                <a href="#why" onClick={(e) => { e.preventDefault(); navigateTo('#why', 'landing'); }} className="mobile-drawer-link">
                  <span>Why Choose AdMafia</span>
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
                  <span>Contact &amp; Get Leads</span>
                  <ChevronRight size={16} color="#94a3b8" />
                </a>
              </div>

              {currentUser && (
                <>
                  <div className="mobile-drawer-divider" />
                  <div className="mobile-drawer-actions">
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
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main>
        {/* Section 1: Hero Section */}
        <section className="hero" aria-labelledby="h1">
          <div className="wrap">
            <div>
              <div className="hero-badge">
                <Sparkles size={16} />
                <span>Start Generating Leads from Just {dailyRate}!</span>
              </div>
              <h1 id="h1">{`Start Generating Leads from Just ${dailyRate}!`}</h1>
              <div className="hero-subhead">
                Stop Searching for Customers. Start Connecting With Them.
              </div>
              <div className="row">
                {currentUser ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => navigateTo('/app/lead#app/dashboard', 'portal')}
                  >
                    Open Client Dashboard →
                  </button>
                ) : (
                  <a className="btn" href="#contact">
                    Get Qualified Leads
                  </a>
                )}
                <a className="btn alt" href="#how">
                  Start Growing Your Business
                </a>
              </div>
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
                <i>{currencySymbol}</i>
                <div>
                  <strong>Direct Customer Connect</strong>
                  <span>Call. Explain. Convert.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Affordable Lead Generation Services Starting at Daily Minimum */}
        <section className="budget" id="pricing" aria-labelledby="h-budget">
          <div className="wrap">
            <div className="top">
              <div>
                <h2 id="h-budget">Affordable Lead Generation Services Starting at {dailyRate}</h2>
                <div className="section-subhead">
                  More Opportunities for Your Business. Without a Huge Budget.
                </div>
                <p className="lead" style={{ marginTop: '12px', fontWeight: 700, color: 'var(--ink2)', fontSize: '1.08rem' }}>
                  Start with a minimum budget of just {dailyBudget} per day and create more opportunities to grow your customer base.
                </p>
              </div>
              <div className="price">
                {dailyBudget}<small> /day minimum</small>
              </div>
            </div>

            <div style={{ marginTop: '48px', marginBottom: '48px' }}>
              <MetaAdsCalculator initialCountry={activeCountry} />
            </div>

            <h3 style={{ marginTop: '44px', fontSize: '1.45rem', fontWeight: 800 }}>
              What Do You Get with AdMafia Marketing?
            </h3>
            <ul className="gets">
              {dynamicGets.map((g, idx) => (
                <li key={idx}>
                  <b>{g[0]}</b>
                  <span>{g[1]}</span>
                </li>
              ))}
            </ul>

            <p className="tag" style={{ marginTop: '36px' }}>
              Your Business Needs Customers. We Help You Find Them.
            </p>

            <div style={{ marginTop: '24px' }}>
              {currentUser ? (
                <button
                  type="button"
                  className="btn dark"
                  onClick={() => navigateTo('/app/lead#app/dashboard', 'portal')}
                >
                  Open Client Dashboard →
                </button>
              ) : (
                <a className="btn dark" href="#contact">
                  Start Generating Leads at {dailyRate}
                </a>
              )}
            </div>

            <p className="note" style={{ marginTop: '32px' }}>
              <strong>Note:</strong> {dailyRate} is the minimum starting budget, not a guaranteed cost per lead. Lead volume and quality may vary depending on business category, audience demand, location and campaign performance. A lead indicates interest, not a guaranteed purchase or sale.
            </p>
          </div>
        </section>

        {/* Section 3: How AdMafia Marketing Works */}
        <section id="how" style={{ background: 'var(--mist)' }} aria-labelledby="h-how">
          <div className="wrap">
            <h2 id="h-how">How AdMafia Marketing Works</h2>
            <div className="section-subhead">
              From Finding Potential Customers to Growing Your Business.
            </div>
            <p className="lead" style={{ marginTop: '14px' }}>
              Getting new customers doesn't have to be complicated. Our simple lead generation process helps you connect with potential buyers.
            </p>
            <ol className="steps">
              {steps.map((s, idx) => (
                <li key={idx}>
                  <h3>{s[0]}</h3>
                  <p>{s[1]}</p>
                </li>
              ))}
            </ol>
            <p className="tag">
              We Bring You Opportunities. You Turn Them into Business.
            </p>
            <p style={{ marginTop: '24px' }}>
              <a className="btn dark" href="#contact">
                Get Started Today
              </a>
            </p>
          </div>
        </section>

        {/* Section 4: Why Choose AdMafia Marketing? */}
        <section className="why" id="why" aria-labelledby="h-why">
          <div className="wrap">
            <h2 id="h-why">Why Choose AdMafia Marketing?</h2>
            <div className="section-subhead gold">
              Your Business Growth Starts with the Right Customers.
            </div>
            <div className="grid">
              {dynamicWhy.map((w, idx) => (
                <article className="card" key={idx}>
                  <h3>{w[0]}</h3>
                  <p>{w[1]}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Section 5: Lead Generation Solutions for Every Business */}
        <section id="industries" aria-labelledby="h-ind">
          <div className="wrap">
            <h2 id="h-ind">Lead Generation Solutions for Every Business</h2>
            <div className="section-subhead">
              Whatever You Sell, We Help You Find Potential Customers.
            </div>
            <p className="lead" style={{ marginTop: '14px' }}>
              AdMafia Marketing helps businesses across different industries generate relevant customer enquiries.
            </p>
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
                Get Leads for Your Industry
              </a>
            </p>
          </div>
        </section>

        {/* Section 6: Stop Waiting for Customers. Start Growing Your Business. */}
        <section className="band" aria-labelledby="h-band">
          <div className="wrap">
            <h2 id="h-band">Stop Waiting for Customers. Start Growing Your Business.</h2>
            <div className="band-subhead">
              Your Next Customer Could Be Waiting for the Right Opportunity to Connect.
            </div>
            <div className="band-tagline-main">
              Starting at Just {dailyRate}.
            </div>
            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a className="btn dark" href="#contact">
                Start Generating Leads
              </a>
              <a 
                className="btn alt" 
                href="#contact"
              >
                Contact Our Team
              </a>
            </div>
          </div>
        </section>

        {/* Section 7: Frequently Asked Questions */}
        <section id="faq" aria-labelledby="h-faq">
          <div className="wrap">
            <h2 id="h-faq">Frequently Asked Questions</h2>
            <div className="faq">
              {dynamicFaqs.map((f, idx) => (
                <details key={idx}>
                  <summary>{f[0]}</summary>
                  <p>{f[1]}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Section 8: Final CTA */}
        <section className="contact" id="contact" aria-labelledby="h-contact">
          <div className="wrap">
            <div>
              <h2 id="h-contact">More Leads. More Conversations. More Opportunities to Grow.</h2>
              <p className="lead" style={{ color: '#d9d7f5', fontSize: '1.18rem', marginTop: '18px', lineHeight: '1.5' }}>
                Your business deserves a consistent opportunity to reach new customers.
              </p>
              <p style={{ color: '#bdbbe6', fontSize: '1.05rem', lineHeight: '1.6', marginTop: '10px' }}>
                Start generating relevant customer enquiries with AdMafia Marketing.
              </p>
              <div style={{ marginTop: '28px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 184, 0, 0.15)', padding: '10px 22px', borderRadius: '999px', border: '1px solid rgba(255, 184, 0, 0.45)' }}>
                <span style={{ color: '#d9d7f5', fontSize: '1rem', fontWeight: 600 }}>Starting Budget:</span>
                <strong style={{ color: '#ffb800', fontSize: '1.3rem', fontWeight: 800 }}>{dailyRate}</strong>
              </div>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              {sent && (
                <div className="msg ok" role="status">
                  Thank you! Our team will contact you shortly to start generating leads.
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
                placeholder="Full Name"
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
                placeholder={activeCountry?.phone_code ? `${activeCountry.phone_code} mobile number` : 'Mobile number'}
                value={formData.phone}
                onChange={handleChange}
              />
              <label htmlFor="business">Business type</label>
              <input
                id="business"
                name="business"
                placeholder="e.g. Real estate, education, healthcare, salon"
                value={formData.business}
                onChange={handleChange}
              />
              <label htmlFor="city">Target city / area</label>
              <input
                id="city"
                name="city"
                placeholder="e.g. Mumbai, Delhi NCR, Ahmedabad, Pan India"
                value={formData.city}
                onChange={handleChange}
              />
              <button className="btn" type="submit" style={{ fontWeight: 700 }}>
                Get Started Now | Generate Leads for My Business
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <div className="footer-grid">
            {/* Col 1: Brand Info & Social Links */}
            <div className="footer-col footer-col-brand">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <img
                  src="/AdMafia-Logo.png"
                  alt="AdMafia Marketing"
                  style={{ height: '40px', width: 'auto', objectFit: 'contain', background: '#ffffff', padding: '4px 8px', borderRadius: '8px' }}
                />
              </div>
              <p style={{ fontSize: '0.86rem', lineHeight: '1.6', color: '#94a3b8', margin: '0 0 16px' }}>
                Get qualified leads, grow your business, and increase your customers. AdMafia Marketing helps businesses connect directly with interested buyers with names and phone numbers starting from just {dailyRateLower}.
              </p>
              
              <div className="footer-social-links">
                <a
                  href={site.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-social-btn instagram"
                  title="Follow AdMafia on Instagram"
                  aria-label="Instagram"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                  </svg>
                  <span>Instagram</span>
                </a>
                <a
                  href={site.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-social-btn facebook"
                  title="Connect with AdMafia on Facebook"
                  aria-label="Facebook"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span>Facebook</span>
                </a>
              </div>
            </div>

            {/* Col 2: Customer Workspace */}
            <div className="footer-col">
              <h4>Customer Workspace</h4>
              <ul className="footer-links">
                {currentUser ? (
                  <>
                    <li>
                      <a href="/app/lead#app/dashboard" onClick={(e) => { e.preventDefault(); navigateTo('/app/lead#app/dashboard', 'portal'); }}>
                        <Laptop size={14} color="#10b981" />
                        <span>Go to Client Dashboard →</span>
                      </a>
                    </li>
                    <li>
                      <a href="#signout" onClick={(e) => {
                        e.preventDefault();
                        try {
                          localStorage.removeItem('growthline_active_user');
                          sessionStorage.clear();
                        } catch (err) {}
                        setCurrentUser(null);
                        navigateTo('/', 'landing');
                      }}>
                        <span style={{ color: '#94a3b8' }}>Sign Out ({currentUser.companyName || currentUser.name || 'Client'})</span>
                      </a>
                    </li>
                  </>
                ) : (
                  <>
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
                  </>
                )}
                <li>
                  <a href="#pricing" onClick={(e) => { e.preventDefault(); navigateTo('#pricing', 'landing'); }}>
                    <span>Budget &amp; Calculator</span>
                  </a>
                </li>
                <li>
                  <a href="#contact" onClick={(e) => { e.preventDefault(); navigateTo('#contact', 'landing'); }}>
                    <span>Starting Budget ({dailyRate})</span>
                  </a>
                </li>
                <li>
                  <a href="#faq" onClick={(e) => { e.preventDefault(); navigateTo('#faq', 'landing'); }}>
                    <span>Client FAQ</span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Lead Solutions */}
            <div className="footer-col">
              <h4>Lead Solutions</h4>
              <ul className="footer-links">
                <li><a href="#pricing" onClick={(e) => { e.preventDefault(); navigateTo('#pricing', 'landing'); }}>Starting Budget ({dailyRate})</a></li>
                <li><a href="#how" onClick={(e) => { e.preventDefault(); navigateTo('#how', 'landing'); }}>How AdMafia Works</a></li>
                <li><a href="#why" onClick={(e) => { e.preventDefault(); navigateTo('#why', 'landing'); }}>Why Choose AdMafia</a></li>
                <li><a href="#industries" onClick={(e) => { e.preventDefault(); navigateTo('#industries', 'landing'); }}>Industry Solutions</a></li>
                <li><a href="#contact" onClick={(e) => { e.preventDefault(); navigateTo('#contact', 'landing'); }}>Get Qualified Leads</a></li>
              </ul>
            </div>

            {/* Col 4: Contact & Support */}
            <div className="footer-col">
              <h4>Contact &amp; Support</h4>
              <ul className="footer-links">
                <li>
                  <a href={`mailto:${site.email}`} className="footer-contact-item">
                    <Mail size={15} color="#ffb800" />
                    <span>{site.email}</span>
                  </a>
                </li>
                <li>
                  <a href={`tel:${site.phoneRaw}`} className="footer-contact-item">
                    <Phone size={15} color="#10b981" />
                    <span>{site.phone}</span>
                  </a>
                </li>
                <li>
                  <a 
                    href={`https://wa.me/916359120081?text=${encodeURIComponent('Hi AdMafia Team, I want to start Meta Ads lead generation for my business.')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="footer-contact-item"
                  >
                    <MessageCircle size={15} color="#22c55e" />
                    <span>WhatsApp Support</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <div>
              <span>&copy; {new Date().getFullYear()} {site.name}. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
      <WhatsAppWidget />
    </>
  );
}

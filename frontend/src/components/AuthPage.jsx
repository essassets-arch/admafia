import React, { useState } from 'react';
import { CustomerLoginPage, CustomerRegisterPage } from '../portal/AuthPages';

/**
 * Unified Customer & Agency Authentication Entry (/auth)
 * Enforces mandatory WhatsApp OTP verification and secure JWT sessions.
 */
export default function AuthPage({ onBackToHome, onAuthenticated }) {
  const [mode, setMode] = useState('login');

  if (mode === 'register') {
    return (
      <CustomerRegisterPage
        onRegistered={onAuthenticated}
        onSwitchToLogin={() => setMode('login')}
        onBackToWebsite={onBackToHome}
      />
    );
  }

  return (
    <CustomerLoginPage
      onLoggedIn={onAuthenticated}
      onSwitchToRegister={() => setMode('register')}
      onBackToWebsite={onBackToHome}
    />
  );
}

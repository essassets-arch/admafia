import React from 'react';
import { formatDailyRate, formatMonthlySpend } from '../services/countryService';

export default function CheckoutPage({ country, onBackToWebsite, onBackToLogin }) {
  const dailyRate = formatDailyRate(country);
  const monthlySpend = formatMonthlySpend(country);

  return (
    <main className="country-pricing-unavailable" style={{ maxWidth: 760, margin: '64px auto', padding: 32 }}>
      <h1>AdMafia campaign budget</h1>
      <p>Minimum advertising budget: <strong>{dailyRate}</strong></p>
      <p>30-day budget: <strong>{monthlySpend}</strong></p>
      <p>Payment is not taken on this page. Sign in or register to continue to your wallet. Wallet credits are added only after the payment provider confirms the transaction on our server.</p>
      {country?.currency_code === 'USD' && (
        <p role="status">International USD wallet payments are not enabled yet. No payment will be requested until gateway approval and verification testing are complete.</p>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
        <a className="btn dark" href="/register">Register Business Account</a>
        <button type="button" className="btn" onClick={onBackToLogin}>Sign in</button>
        <button type="button" className="btn alt" onClick={onBackToWebsite}>Back to website</button>
      </div>
    </main>
  );
}
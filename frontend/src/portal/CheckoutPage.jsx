import React from 'react';
import { formatDailyRate, formatMonthlySpend } from '../services/countryService';

export default function CheckoutPage({ country, onBackToWebsite, onBackToLogin }) {
  const dailyRate = formatDailyRate(country);
  const monthlySpend = formatMonthlySpend(country);

  return (
    <main className="country-pricing-unavailable checkout-page-main">
      <style>{`
        .checkout-page-main {
          max-width: 760px;
          margin: 64px auto;
          padding: 32px;
          box-sizing: border-box;
        }
        @media (max-width: 640px) {
          .checkout-page-main {
            margin: 24px auto;
            padding: 22px 16px;
          }
          .checkout-page-main h1 {
            font-size: 1.5rem;
            line-height: 1.25;
          }
          .checkout-page-actions {
            flex-direction: column;
            align-items: stretch;
          }
          .checkout-page-actions .btn {
            width: 100%;
            text-align: center;
            justify-content: center;
          }
        }
      `}</style>
      <h1>Ad Mafia Growth Wallet</h1>
      <p>Minimum daily growth budget: <strong>{dailyRate}</strong></p>
      <p>30-day growth projection: <strong>{monthlySpend}</strong></p>
      <p>Payment is not taken on this page. Sign in or register to continue to your Growth Wallet. Wallet credits are added only after the payment provider confirms the transaction on our server.</p>
      {country?.currency_code === 'USD' && (
        <p role="status">International USD wallet payments are not enabled yet. No payment will be requested until gateway approval and verification testing are complete.</p>
      )}
      <div className="checkout-page-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
        <a className="btn dark" href="/register">Register Business Account</a>
        <button type="button" className="btn" onClick={onBackToLogin}>Sign in</button>
        <button type="button" className="btn alt" onClick={onBackToWebsite}>Back to website</button>
      </div>
    </main>
  );
}
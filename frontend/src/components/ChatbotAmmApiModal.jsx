import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Send, RefreshCw, Key, Terminal, Hash } from 'lucide-react';
import Swal from 'sweetalert2';

export default function ChatbotAmmApiModal({
  isOpen,
  onClose,
  fetchWebhookInfo,
  testLeadFn,
  rotateKeyFn = null,
  onLeadDispatched = null,
}) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const [selectedAmm, setSelectedAmm] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testName, setTestName] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [rotating, setRotating] = useState(false);

  const loadInfo = async () => {
    if (!fetchWebhookInfo) return;
    setLoading(true);
    try {
      const res = await fetchWebhookInfo();
      if (res && res.ok) {
        setInfo(res);
        if (!selectedAmm && res.directory?.length > 0) {
          setSelectedAmm(res.directory[0].marketingCode || '#AMM01');
        }
      }
    } catch (err) {
      console.error('[ChatbotAmmApiModal] Failed to load info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadInfo();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyText = (text, key) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(''), 1800);
  };

  const handleTestSend = async (e) => {
    e.preventDefault();
    if (!testLeadFn) return;
    const cleanDigits = String(testPhone || '').replace(/\D/g, '').slice(-10);
    if (cleanDigits.length !== 10 || !['6', '7', '8', '9'].includes(cleanDigits[0])) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Buyer Mobile',
        text: 'Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
      });
      return;
    }
    setSendingTest(true);
    try {
      const res = await testLeadFn({
        marketingCode: selectedAmm || '#AMM01',
        phone: cleanDigits,
        name: testName.trim() || undefined,
      });
      if (res && res.ok) {
        setTestPhone('');
        setTestName('');
        if (onLeadDispatched) onLeadDispatched(res);
        Swal.fire({
          icon: 'success',
          title: `Routed to ${res.marketingCode}!`,
          text: res.message,
          timer: 2600,
          showConfirmButton: false,
        });
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Webhook Dispatch Error',
        text: err.message || 'Failed to route lead by #AMM code.',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleRotate = async () => {
    if (!rotateKeyFn) return;
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'Rotate Chatbot API Key?',
      text: 'Any external chatbot using the old key will need the new key immediately.',
      showCancelButton: true,
      confirmButtonText: 'Rotate Key',
      confirmButtonColor: '#ef4444',
    });
    if (!confirm.isConfirmed) return;
    setRotating(true);
    try {
      const res = await rotateKeyFn();
      if (res?.secret) {
        setInfo((prev) => (prev ? { ...prev, apiKey: res.secret } : prev));
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: res.rotated ? 'New API key generated!' : res.note || 'Key pinned in .env',
          showConfirmButton: false,
          timer: 2400,
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Rotate Failed', text: err.message });
    } finally {
      setRotating(false);
    }
  };

  const curlSnippet = info
    ? `curl -X POST "${info.webhookUrl}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Webhook-Key: ${info.apiKey}" \\\n  -d '{"marketingCode":"${selectedAmm || '#AMM01'}","phone":"9876543210","name":"Rahul Patel","message":"Interested #AMM01"}'`
    : '';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.76)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--adm-bg-card, #ffffff)',
          color: 'var(--adm-text-primary, #0f172a)',
          borderRadius: 16,
          border: '1px solid var(--adm-border-strong, #cbd5e1)',
          maxWidth: 760,
          width: '100%',
          maxHeight: '90dvh',
          overflowY: 'auto',
          padding: 22,
          boxShadow: '0 24px 50px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '5px 9px',
                  fontSize: '0.75rem',
                  fontWeight: 900,
                }}
              >
                #AMM01 API
              </span>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>
                Chatbot &amp; Multi-Channel Auto-Lead Routing
              </h3>
            </div>
            <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: 'var(--adm-text-muted, #64748b)' }}>
              Put <strong>#AMM01, #AMM02, #AMM03...</strong> in any WhatsApp Bot, ManyChat, Wati, AiSensy, n8n, or Ad flow. Your bot calls this API and drops the buyer lead straight into that client&apos;s dashboard automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--adm-border, #e2e8f0)',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: 'var(--adm-text-muted, #64748b)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {loading || !info ? (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--adm-text-muted, #64748b)' }}>
            <RefreshCw size={20} className="spin" style={{ marginBottom: 8 }} />
            <div>Loading Chatbot Webhook credentials &amp; #AMM client directory...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Endpoint + Key */}
            <div
              style={{
                background: 'var(--adm-bg-subtle, #f8fafc)',
                border: '1px solid var(--adm-border, #e2e8f0)',
                borderRadius: 12,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase', marginBottom: 4 }}>
                  POST Webhook Endpoint URL
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--adm-bg-card, #ffffff)',
                      border: '1px solid var(--adm-border-strong, #cbd5e1)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {info.webhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(info.webhookUrl, 'url')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #4f46e5',
                      background: '#4f46e5',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '0.76rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    {copiedField === 'url' ? <Check size={14} /> : <Copy size={14} />}
                    {copiedField === 'url' ? 'Copied' : 'Copy URL'}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Secret Header (`X-Webhook-Key`)
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <code
                    style={{
                      flex: 1,
                      minWidth: 200,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--adm-bg-card, #ffffff)',
                      border: '1px solid var(--adm-border-strong, #cbd5e1)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {info.apiKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(info.apiKey, 'key')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--adm-border-strong, #cbd5e1)',
                      background: 'var(--adm-bg-card, #ffffff)',
                      color: 'var(--adm-text-primary, #0f172a)',
                      fontWeight: 800,
                      fontSize: '0.76rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    {copiedField === 'key' ? <Check size={14} color="#059669" /> : <Key size={14} />}
                    {copiedField === 'key' ? 'Copied' : 'Copy Key'}
                  </button>
                  {rotateKeyFn && (
                    <button
                      type="button"
                      disabled={rotating}
                      onClick={handleRotate}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(239,68,68,0.4)',
                        background: 'rgba(239,68,68,0.08)',
                        color: '#ef4444',
                        fontWeight: 800,
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                      }}
                    >
                      {rotating ? '...' : 'Rotate Key'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* cURL / JSON Payload Example */}
            <div
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                borderRadius: 12,
                padding: 12,
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Terminal size={13} /> Ready-to-Paste Chatbot Request (JSON / cURL)
                </span>
                <button
                  type="button"
                  onClick={() => copyText(curlSnippet, 'curl')}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '4px 9px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {copiedField === 'curl' ? '✓ Copied' : 'Copy Snippet'}
                </button>
              </div>
              <pre style={{ margin: 0, fontSize: '0.74rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {curlSnippet}
              </pre>
            </div>

            {/* Live Test Simulator */}
            <form
              onSubmit={handleTestSend}
              style={{
                border: '1px solid rgba(16, 185, 129, 0.35)',
                background: 'rgba(16, 185, 129, 0.06)',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#059669', marginBottom: 8 }}>
                ⚡ Live Simulator: Route a Lead Straight to a Client by #AMM Code
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                <select
                  value={selectedAmm}
                  onChange={(e) => setSelectedAmm(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--adm-border-strong, #cbd5e1)',
                    background: 'var(--adm-bg-card, #ffffff)',
                    color: 'var(--adm-text-primary, #0f172a)',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                  }}
                >
                  {(info.directory || []).map((d) => (
                    <option key={d.customerId} value={d.marketingCode}>
                      {d.marketingCode} — {d.companyName}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  placeholder="Buyer 10-digit mobile..."
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--adm-border-strong, #cbd5e1)',
                    background: 'var(--adm-bg-card, #ffffff)',
                    color: 'var(--adm-text-primary, #0f172a)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                  }}
                />
                <input
                  type="text"
                  placeholder="Buyer Name (optional)"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--adm-border-strong, #cbd5e1)',
                    background: 'var(--adm-bg-card, #ffffff)',
                    color: 'var(--adm-text-primary, #0f172a)',
                    fontSize: '0.82rem',
                  }}
                />
                <button
                  type="submit"
                  disabled={sendingTest}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#059669',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Send size={14} />
                  {sendingTest ? 'Routing...' : 'Route Lead'}
                </button>
              </div>
            </form>

            {/* Client #AMM Directory */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase', marginBottom: 6 }}>
                Active Client #AMM Code Directory ({(info.directory || []).length} Clients)
              </div>
              <div
                style={{
                  maxHeight: 190,
                  overflowY: 'auto',
                  border: '1px solid var(--adm-border, #e2e8f0)',
                  borderRadius: 10,
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--adm-bg-subtle, #f8fafc)', textAlign: 'left' }}>
                      <th style={{ padding: '7px 10px' }}>Code</th>
                      <th style={{ padding: '7px 10px' }}>Client</th>
                      <th style={{ padding: '7px 10px' }}>Category &amp; City</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(info.directory || []).map((d) => (
                      <tr key={d.customerId} style={{ borderTop: '1px solid var(--adm-border-subtle, #f1f5f9)' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 900, fontFamily: 'monospace', color: '#4f46e5' }}>
                          {d.marketingCode || '—'}
                        </td>
                        <td style={{ padding: '7px 10px', fontWeight: 700 }}>
                          {d.companyName} <span style={{ color: '#64748b', fontWeight: 500 }}>(+91 {d.phone})</span>
                        </td>
                        <td style={{ padding: '7px 10px', color: 'var(--adm-text-muted, #64748b)' }}>
                          {[d.category, d.city].filter(Boolean).join(' • ') || '—'}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => copyText(d.marketingCode, d.customerId)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              border: '1px solid var(--adm-border, #e2e8f0)',
                              background: 'transparent',
                              color: 'var(--adm-text-primary, #0f172a)',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {copiedField === d.customerId ? '✓ Copied' : <><Hash size={11} /> Copy</>}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

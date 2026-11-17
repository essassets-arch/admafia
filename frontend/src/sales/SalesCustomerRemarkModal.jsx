import React, { useState } from 'react';
import {
  X,
  Phone,
  MessageSquare,
  Calendar,
  CheckCircle2,
  Clock,
  Trash2,
  FileText,
  Plus,
} from 'lucide-react';
import Swal from 'sweetalert2';
import crmApi from '../services/crmApi';
import adminAuthApi from '../services/adminAuthApi';

export function getCustomerFollowUpState(cust) {
  if (!cust) return { urgency: 'none', hasRemark: false, count: 0 };
  const remarks = Array.isArray(cust.salesRemarks) ? cust.salesRemarks : [];
  const latestNote = String(cust.latestSalesRemark || remarks[0]?.note || '').trim();
  const hasRemark = Boolean(latestNote || remarks.length > 0);
  const status = String(cust.followUpStatus || remarks[0]?.followUpStatus || 'none');
  const rawDate = cust.nextFollowUpAt || (status === 'pending' ? remarks[0]?.followUpAt : null);

  if (status !== 'pending' || !rawDate) {
    return {
      urgency: 'none',
      hasRemark,
      latestNote,
      latestBy: cust.latestSalesRemarkBy || remarks[0]?.authorName || '',
      count: remarks.length || (latestNote ? 1 : 0),
      followUpDate: null,
    };
  }

  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) {
    return {
      urgency: 'none',
      hasRemark,
      latestNote,
      latestBy: cust.latestSalesRemarkBy || remarks[0]?.authorName || '',
      count: remarks.length || (latestNote ? 1 : 0),
      followUpDate: null,
    };
  }

  const now = new Date();
  const istToday = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const istTarget = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  let urgency = 'upcoming';
  if (d.getTime() < now.getTime()) {
    urgency = 'overdue';
  } else if (istTarget === istToday) {
    urgency = 'today';
  }

  return {
    urgency,
    hasRemark,
    latestNote,
    latestBy: cust.latestSalesRemarkBy || remarks[0]?.authorName || '',
    count: remarks.length || (latestNote ? 1 : 0),
    followUpDate: d,
  };
}

export function formatIstShortDateTime(dateVal) {
  if (!dateVal) return '';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function SalesRemarkInlineBadge({ customer, onOpen }) {
  const info = getCustomerFollowUpState(customer);
  if (!info.hasRemark && info.urgency === 'none') return null;

  const badgePalette =
    info.urgency === 'overdue'
      ? {
          bg: 'rgba(239, 68, 68, 0.12)',
          border: 'rgba(239, 68, 68, 0.35)',
          color: '#ef4444',
          label: `⏰ Overdue: ${formatIstShortDateTime(info.followUpDate)}`,
        }
      : info.urgency === 'today'
      ? {
          bg: 'rgba(245, 158, 11, 0.14)',
          border: 'rgba(245, 158, 11, 0.38)',
          color: '#d97706',
          label: `📅 Today: ${formatIstShortDateTime(info.followUpDate)}`,
        }
      : info.urgency === 'upcoming'
      ? {
          bg: 'rgba(99, 102, 241, 0.12)',
          border: 'rgba(99, 102, 241, 0.32)',
          color: '#6366f1',
          label: `📅 Next: ${formatIstShortDateTime(info.followUpDate)}`,
        }
      : null;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (onOpen) onOpen(customer);
      }}
      title={info.latestNote ? `Sales Remark: ${info.latestNote} (Click to manage)` : 'Click to view/add Sales remark'}
      style={{
        marginTop: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        cursor: 'pointer',
        maxWidth: 270,
      }}
    >
      {badgePalette && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            alignSelf: 'flex-start',
            background: badgePalette.bg,
            border: `1px solid ${badgePalette.border}`,
            color: badgePalette.color,
            borderRadius: 6,
            padding: '1px 7px',
            fontSize: '0.68rem',
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {badgePalette.label}
        </span>
      )}
      {info.latestNote && (
        <div
          style={{
            fontSize: '0.72rem',
            color: 'var(--adm-text-body, #334155)',
            background: 'var(--adm-bg-muted, #f1f5f9)',
            border: '1px solid var(--adm-border, #e2e8f0)',
            borderRadius: 6,
            padding: '2px 7px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 600,
          }}
        >
          📝 {info.latestNote}
        </div>
      )}
    </div>
  );
}

const QUICK_REMARK_CHIPS = [
  'Called — No Answer',
  'Sent WhatsApp Details',
  'Will Recharge Today',
  'Requested Callback',
  'Guided Profile Completion',
  'High Intent — Ready to Start',
];

function computePresetDateTimeLocal(presetKey) {
  const now = new Date();
  let target = null;
  if (presetKey === '2h') {
    target = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  } else if (presetKey === 'tomorrow_11am') {
    target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(11, 0, 0, 0);
  } else if (presetKey === '2d') {
    target = new Date(now);
    target.setDate(target.getDate() + 2);
    target.setHours(11, 0, 0, 0);
  } else if (presetKey === 'next_week') {
    target = new Date(now);
    target.setDate(target.getDate() + 7);
    target.setHours(11, 0, 0, 0);
  }
  if (!target) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}

export default function SalesCustomerRemarkModal({ customer, onClose, onCustomerUpdated }) {
  const [note, setNote] = useState('');
  const [followUpPreset, setFollowUpPreset] = useState('none'); // 'none' | '2h' | 'tomorrow_11am' | '2d' | 'next_week' | 'custom'
  const [customFollowUp, setCustomFollowUp] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyActionId, setBusyActionId] = useState('');

  if (!customer) return null;

  const remarksList = Array.isArray(customer.salesRemarks) ? customer.salesRemarks : [];
  const fupInfo = getCustomerFollowUpState(customer);
  const currentStaff = adminAuthApi.getCurrentUser();
  const authorName =
    currentStaff?.name || currentStaff?.fullName || currentStaff?.username || 'Sales Executive';

  const syncUpdatedCustomerEverywhere = (updatedCust) => {
    if (!updatedCust) return;
    try {
      const raw = localStorage.getItem('growthline_registered_customers');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const next = list.map((item) =>
            item.id === updatedCust.id || item.phone === updatedCust.phone
              ? { ...item, ...updatedCust }
              : item
          );
          localStorage.setItem('growthline_registered_customers', JSON.stringify(next));
        }
      }
    } catch (e) {}
    if (onCustomerUpdated) {
      onCustomerUpdated(updatedCust);
    }
  };

  const handleSelectFollowUpPreset = (key) => {
    setFollowUpPreset(key);
    if (key === 'none') {
      setCustomFollowUp('');
    } else if (key !== 'custom') {
      setCustomFollowUp(computePresetDateTimeLocal(key));
    }
  };

  const handleAppendChip = (chipText) => {
    setNote((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return chipText;
      if (trimmed.includes(chipText)) return prev;
      return `${trimmed} • ${chipText}`;
    });
  };

  const handleSaveRemark = async (e) => {
    if (e) e.preventDefault();
    const cleanNote = note.trim();
    if (!cleanNote) {
      Swal.fire({
        icon: 'warning',
        title: 'Remark Required',
        text: 'Please type a short call remark or click one of the quick preset tags.',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    setSaving(true);
    try {
      const targetId = customer.id || customer.phone || customer.username;
      const followUpIso =
        followUpPreset !== 'none' && customFollowUp
          ? new Date(customFollowUp).toISOString()
          : null;

      const res = await crmApi.addCustomerSalesRemark(targetId, {
        note: cleanNote,
        followUpAt: followUpIso,
        followUpStatus: followUpIso ? 'pending' : 'none',
        authorName,
      });

      if (res?.customer) {
        syncUpdatedCustomerEverywhere(res.customer);
      }
      setNote('');
      setFollowUpPreset('none');
      setCustomFollowUp('');

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: followUpIso ? 'Remark & follow-up saved!' : 'Sales remark saved!',
        showConfirmButton: false,
        timer: 2200,
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Could Not Save Remark',
        text: err.message || 'Failed to save customer remark.',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkFollowUpDone = async () => {
    setBusyActionId('mark_done');
    try {
      const targetId = customer.id || customer.phone || customer.username;
      const res = await crmApi.updateCustomerFollowUpStatus(targetId, {
        followUpStatus: 'done',
      });
      if (res?.customer) {
        syncUpdatedCustomerEverywhere(res.customer);
      }
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Follow-up marked completed!',
        showConfirmButton: false,
        timer: 2000,
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Update Failed',
        text: err.message || 'Could not update follow-up status.',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      setBusyActionId('');
    }
  };

  const handleDeleteRemark = async (remarkId) => {
    if (!remarkId) return;
    setBusyActionId(remarkId);
    try {
      const targetId = customer.id || customer.phone || customer.username;
      const res = await crmApi.deleteCustomerSalesRemark(targetId, remarkId);
      if (res?.customer) {
        syncUpdatedCustomerEverywhere(res.customer);
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Delete Failed',
        text: err.message || 'Could not delete remark.',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      setBusyActionId('');
    }
  };

  const cleanPhone = String(customer.phone || '').replace(/\D/g, '').slice(-10);
  const displayCompany = customer.companyName || customer.name || `@${customer.username}`;

  return (
    <div className="sales-modal-overlay" onClick={onClose} style={{ zIndex: 100020 }}>
      <div
        className="sales-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 620,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--adm-bg-card, #ffffff)',
          color: 'var(--adm-text-primary, #0f172a)',
          border: '1px solid var(--adm-border-strong, #cbd5e1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            paddingBottom: 14,
            borderBottom: '1px solid var(--adm-border, #e2e8f0)',
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <span className="sales-dept-badge">Sales Follow-Up &amp; Call Remarks</span>
            <h3
              style={{
                margin: '5px 0 3px',
                fontSize: '1.18rem',
                fontWeight: 800,
                color: 'var(--adm-text-primary, #0f172a)',
              }}
            >
              {displayCompany}
            </h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                fontSize: '0.8rem',
                color: 'var(--adm-text-muted, #64748b)',
              }}
            >
              <span>@{customer.username}</span>
              {cleanPhone && <span>• +91 {cleanPhone}</span>}
              {customer.city && <span>• {customer.city}</span>}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {cleanPhone && (
              <>
                <a
                  href={`tel:${cleanPhone}`}
                  className="desk-action-btn"
                  style={{ textDecoration: 'none', fontWeight: 700 }}
                  title={`Call +91 ${cleanPhone}`}
                >
                  <Phone size={13} /> Call
                </a>
                <a
                  href={`https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(customer.contact || customer.contactPerson || displayCompany)},%20Ad%20Mafia%20team%20here%20following%20up%20regarding%20your%20workspace.`}
                  target="_blank"
                  rel="noreferrer"
                  className="desk-action-btn"
                  style={{
                    textDecoration: 'none',
                    fontWeight: 700,
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: '#10b981',
                    borderColor: 'rgba(16, 185, 129, 0.32)',
                  }}
                  title="Chat on WhatsApp"
                >
                  <MessageSquare size={13} /> WhatsApp
                </a>
              </>
            )}
            <button type="button" className="desk-close-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Active Pending Follow-up Banner */}
        {fupInfo.urgency !== 'none' && fupInfo.followUpDate && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              padding: '10px 14px',
              borderRadius: 12,
              marginBottom: 14,
              background:
                fupInfo.urgency === 'overdue'
                  ? 'rgba(239, 68, 68, 0.10)'
                  : 'rgba(245, 158, 11, 0.12)',
              border: `1px solid ${
                fupInfo.urgency === 'overdue'
                  ? 'rgba(239, 68, 68, 0.35)'
                  : 'rgba(245, 158, 11, 0.35)'
              }`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', fontWeight: 700 }}>
              <Clock size={16} color={fupInfo.urgency === 'overdue' ? '#ef4444' : '#d97706'} />
              <span>
                {fupInfo.urgency === 'overdue' ? 'Overdue Follow-Up:' : 'Scheduled Follow-Up:'}{' '}
                <strong>{formatIstShortDateTime(fupInfo.followUpDate)} (IST)</strong>
              </span>
            </div>
            <button
              type="button"
              disabled={busyActionId === 'mark_done'}
              onClick={handleMarkFollowUpDone}
              style={{
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CheckCircle2 size={13} />
              {busyActionId === 'mark_done' ? 'Updating...' : 'Mark Follow-Up Done'}
            </button>
          </div>
        )}

        {/* Add New Remark Form */}
        <form onSubmit={handleSaveRemark}>
          <div style={{ marginBottom: 10 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.76rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--adm-text-muted, #64748b)',
                marginBottom: 6,
              }}
            >
              Quick Call Outcome Tags (1-Click Fill)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_REMARK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAppendChip(chip)}
                  style={{
                    background: 'var(--adm-bg-muted, #f1f5f9)',
                    color: 'var(--adm-text-body, #334155)',
                    border: '1px solid var(--adm-border-strong, #cbd5e1)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 800,
                color: 'var(--adm-text-primary, #0f172a)',
                marginBottom: 6,
              }}
            >
              Sales Remark / Follow-Up Note *
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  handleSaveRemark(e);
                }
              }}
              placeholder="Write what customer said, payment commitment, callback time, or next action..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1.5px solid var(--adm-border-strong, #cbd5e1)',
                background: 'var(--adm-bg-input, #ffffff)',
                color: 'var(--adm-text-primary, #0f172a)',
                fontSize: '0.88rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          {/* Next Follow-Up Schedule Selector */}
          <div
            style={{
              background: 'var(--adm-bg-subtle, #f8fafc)',
              border: '1px solid var(--adm-border, #e2e8f0)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.78rem',
                fontWeight: 800,
                color: 'var(--adm-text-secondary, #1e293b)',
                marginBottom: 8,
              }}
            >
              <Calendar size={14} color="#6366f1" />
              <span>Schedule Next Follow-Up Reminder (Optional)</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: followUpPreset !== 'none' ? 10 : 0 }}>
              {[
                { key: 'none', label: 'No Reminder' },
                { key: '2h', label: 'Today (+2 Hrs)' },
                { key: 'tomorrow_11am', label: 'Tomorrow 11 AM' },
                { key: '2d', label: 'In 2 Days' },
                { key: 'next_week', label: 'Next Week' },
                { key: 'custom', label: 'Custom Date/Time' },
              ].map((opt) => {
                const isActive = followUpPreset === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleSelectFollowUpPreset(opt.key)}
                    style={{
                      background: isActive ? '#4f46e5' : 'var(--adm-bg-card, #ffffff)',
                      color: isActive ? '#ffffff' : 'var(--adm-text-body, #334155)',
                      border: `1px solid ${isActive ? '#4f46e5' : 'var(--adm-border-strong, #cbd5e1)'}`,
                      borderRadius: 8,
                      padding: '5px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {followUpPreset !== 'none' && (
              <input
                type="datetime-local"
                value={customFollowUp}
                onChange={(e) => {
                  setCustomFollowUp(e.target.value);
                  setFollowUpPreset('custom');
                }}
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  background: 'var(--adm-bg-input, #ffffff)',
                  color: 'var(--adm-text-primary, #0f172a)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              />
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 18 }}>
            <button
              type="button"
              onClick={onClose}
              className="desk-action-btn"
              style={{ padding: '8px 14px' }}
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving}
              className="sales-btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 18px',
                fontWeight: 800,
              }}
            >
              <Plus size={15} strokeWidth={2.5} />
              {saving ? 'Saving...' : 'Save Remark'}
            </button>
          </div>
        </form>

        {/* Chronological Remark History Timeline */}
        <div
          style={{
            borderTop: '1px solid var(--adm-border, #e2e8f0)',
            paddingTop: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--adm-text-muted, #64748b)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FileText size={14} /> Remark History ({remarksList.length})
            </span>
          </div>

          {remarksList.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '18px 12px',
                borderRadius: 10,
                background: 'var(--adm-bg-subtle, #f8fafc)',
                border: '1px dashed var(--adm-border-strong, #cbd5e1)',
                color: 'var(--adm-text-muted, #64748b)',
                fontSize: '0.82rem',
              }}
            >
              No sales remarks added for this user yet. Add your first call note above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
              {remarksList.map((rmk) => (
                <div
                  key={rmk.remarkId || rmk.createdAt}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--adm-bg-subtle, #f8fafc)',
                    border: '1px solid var(--adm-border, #e2e8f0)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 4,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.73rem',
                          fontWeight: 800,
                          color: '#6366f1',
                          background: 'rgba(99, 102, 241, 0.12)',
                          padding: '1px 7px',
                          borderRadius: 6,
                        }}
                      >
                        {rmk.authorName || 'Sales Executive'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)' }}>
                        {formatIstShortDateTime(rmk.createdAt)}
                      </span>
                      {rmk.followUpAt && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 6,
                            background:
                              rmk.followUpStatus === 'done'
                                ? 'rgba(16, 185, 129, 0.14)'
                                : 'rgba(245, 158, 11, 0.14)',
                            color: rmk.followUpStatus === 'done' ? '#10b981' : '#d97706',
                          }}
                        >
                          {rmk.followUpStatus === 'done'
                            ? `✓ Follow-up Done (${formatIstShortDateTime(rmk.followUpAt)})`
                            : `📅 Follow-up: ${formatIstShortDateTime(rmk.followUpAt)}`}
                        </span>
                      )}
                    </div>

                    {rmk.remarkId && (
                      <button
                        type="button"
                        disabled={busyActionId === rmk.remarkId}
                        onClick={() => handleDeleteRemark(rmk.remarkId)}
                        title="Delete remark"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--adm-text-muted, #94a3b8)',
                          cursor: 'pointer',
                          padding: 2,
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--adm-text-primary, #0f172a)',
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {rmk.note}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

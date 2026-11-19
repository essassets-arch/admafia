import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { Clock, Calendar, Edit3 } from 'lucide-react';

/**
 * Formats an ISO / Date value into a crisp IST stamp: e.g. "18 Nov, 05:15 PM"
 */
export function formatIstShortDateTime(dateInput) {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats minutes into readable hours + minutes: e.g. 1350 -> "22h 30m", 1590 -> "26h 30m"
 */
export function formatHoursMinutes(totalMinutes) {
  const mins = Math.max(0, Math.round(Number(totalMinutes || 0)));
  if (mins < 1) return '<1m';
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs === 0) return `${rem}m`;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/**
 * Converts a Date/ISO into `YYYY-MM-DDTHH:mm` in Asia/Kolkata for `<input type="datetime-local">`
 */
export function toIstDatetimeLocalValue(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hh = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hh}:${map.minute}`;
}

/**
 * Resolves human label for a YYYY-MM-DD paid slot date relative to Today IST
 */
export function buildPaidSlotLabel(dateIso) {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso).trim())) return '';
  const cleanIso = String(dateIso).trim();
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m, d] = cleanIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const shortLabel = dt.toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  const [ty, tm, td] = todayIso.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
  const diffDays = Math.round((dt.getTime() - todayUtc.getTime()) / 86400000);
  if (diffDays === 0) return `Today • ${shortLabel}`;
  if (diffDays === -1) return `Yesterday • ${shortLabel}`;
  if (diffDays === 1) return `Tomorrow • ${shortLabel}`;
  return shortLabel;
}

/**
 * Opens a clean 2-field modal so Marketing can set/adjust exact Meta Ad Start Time (IST) & Paid Slot Day
 */
export async function promptEditCampaignTiming({
  companyName = 'Client',
  campaignId = '',
  customerId = '',
  currentStartedAt = null,
  currentPaidSlotDateIso = '',
  currentCycleHours = 24,
  onSave,
}) {
  const defaultLocal = toIstDatetimeLocalValue(currentStartedAt || new Date());
  const defaultSlot =
    currentPaidSlotDateIso ||
    (defaultLocal ? defaultLocal.slice(0, 10) : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  const defaultHours = Number(currentCycleHours || 24);

  const { value: formVals, isConfirmed } = await Swal.fire({
    title: `Set Ad Run Window — ${companyName}`,
    html: `
      <div style="text-align:left; font-size:0.86rem; line-height:1.5;">
        <div style="margin-bottom:12px;">
          <label style="display:block; font-weight:800; margin-bottom:4px;">1. Exact Ad Start Date &amp; Time (IST) *</label>
          <input id="swal-camp-start" type="datetime-local" value="${defaultLocal}" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box; font-size:0.9rem;" />
          <div style="font-size:0.74rem; color:#64748b; margin-top:3px;">Set the exact time you switched ON this ad in Meta Ads Manager.</div>
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block; font-weight:800; margin-bottom:4px;">2. Running For Which Paid Slot Day? *</label>
          <input id="swal-camp-slot" type="date" value="${defaultSlot}" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box; font-size:0.9rem;" />
          <div style="font-size:0.74rem; color:#64748b; margin-top:3px;">Which client paid date (₹300 slot) this ad run belongs to.</div>
        </div>
        <div>
          <label style="display:block; font-weight:800; margin-bottom:4px;">3. Target Optimization Cycle (Hours)</label>
          <input id="swal-camp-hours" type="number" min="1" max="720" step="1" value="${defaultHours}" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box; font-size:0.9rem;" />
          <div style="font-size:0.74rem; color:#64748b; margin-top:3px;">Default is 24 hours (1 paid day = 24h, 2 paid days = 48h).</div>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonColor: '#4f46e5',
    confirmButtonText: 'Save Run Window',
    preConfirm: () => {
      const startVal = document.getElementById('swal-camp-start')?.value;
      const slotVal = document.getElementById('swal-camp-slot')?.value;
      const hoursVal = Number(document.getElementById('swal-camp-hours')?.value || 24);
      if (!startVal) {
        Swal.showValidationMessage('Please enter the campaign start date & time.');
        return false;
      }
      // Interpret datetime-local explicitly as Asia/Kolkata (+05:30)
      const isoWithIstOffset = `${startVal}:00+05:30`;
      const parsed = new Date(isoWithIstOffset);
      if (Number.isNaN(parsed.getTime())) {
        Swal.showValidationMessage('Invalid start date/time.');
        return false;
      }
      return {
        campaignId,
        customerId,
        startedAt: parsed.toISOString(),
        paidSlotDateIso: slotVal || startVal.slice(0, 10),
        cycleHours: Math.max(1, Math.min(720, Math.round(hoursVal || 24))),
      };
    },
  });

  if (isConfirmed && formVals && typeof onSave === 'function') {
    await onSave(formVals);
  }
}

/**
 * Live-ticking Campaign Run Window Card:
 * Shows (1) Paid Slot Day ("Running For Which Day"), (2) Exact From -> To IST Time,
 * and (3) Live Active Hours + Remaining / Over-24h Alert!
 */
export function CampaignRunWindowCard({
  startedAt,
  paidSlotDateIso,
  runningForDayLabel,
  cycleHours = 24,
  isSpilloverUnpaidToday = false,
  onEditTiming = null,
  compact = false,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  if (!startedAt) return null;
  const startDt = new Date(startedAt);
  if (Number.isNaN(startDt.getTime())) return null;

  const effectiveHours = Math.max(1, Number(cycleHours || 24));
  const endDt = new Date(startDt.getTime() + effectiveHours * 3600000);
  const elapsedMins = Math.max(0, Math.round((nowMs - startDt.getTime()) / 60000));
  const targetMins = effectiveHours * 60;
  const remainingMins = Math.max(0, targetMins - elapsedMins);
  const overMins = Math.max(0, elapsedMins - targetMins);
  const isOverCycle = elapsedMins >= targetMins;
  const pct = Math.min(100, Math.round((elapsedMins / Math.max(1, targetMins)) * 100));

  const dayText =
    runningForDayLabel ||
    buildPaidSlotLabel(paidSlotDateIso || startDt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));

  const barColor = isOverCycle
    ? isSpilloverUnpaidToday
      ? '#ef4444'
      : '#f59e0b'
    : isSpilloverUnpaidToday
      ? '#f59e0b'
      : '#10b981';

  return (
    <div
      style={{
        marginTop: compact ? 4 : 6,
        padding: compact ? '6px 8px' : '7px 10px',
        borderRadius: 9,
        background: isOverCycle && isSpilloverUnpaidToday
          ? 'rgba(239, 68, 68, 0.10)'
          : isSpilloverUnpaidToday
            ? 'rgba(245, 158, 11, 0.10)'
            : 'var(--adm-bg-subtle, rgba(99, 102, 241, 0.07))',
        border: `1px solid ${
          isOverCycle && isSpilloverUnpaidToday
            ? 'rgba(239, 68, 68, 0.4)'
            : isSpilloverUnpaidToday
              ? 'rgba(245, 158, 11, 0.4)'
              : 'var(--adm-border, rgba(148, 163, 184, 0.28))'
        }`,
        minWidth: compact ? 205 : 225,
        fontSize: '0.71rem',
        lineHeight: 1.4,
      }}
    >
      {/* 1. Running For Which Paid Day */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontWeight: 900,
            color: isSpilloverUnpaidToday ? '#d97706' : '#4f46e5',
          }}
        >
          <Calendar size={11} />
          <span>For Day: {dayText || 'Active Slot'}</span>
        </span>

        {typeof onEditTiming === 'function' && (
          <button
            type="button"
            onClick={onEditTiming}
            title="Set exact Meta Ad start time & paid slot day"
            style={{
              background: 'transparent',
              border: '1px solid var(--adm-border, rgba(148, 163, 184, 0.4))',
              borderRadius: 5,
              padding: '1px 5px',
              cursor: 'pointer',
              color: 'var(--adm-text-muted, #64748b)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: '0.64rem',
              fontWeight: 800,
            }}
          >
            <Edit3 size={10} />
            <span>Set Time</span>
          </button>
        )}
      </div>

      {/* 2. Exact From -> To IST Timestamps */}
      <div style={{ color: 'var(--adm-text-body, #334155)', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.69rem' }}>
        <div>🟢 From: {formatIstShortDateTime(startDt)}</div>
        <div>🏁 {effectiveHours}h End: {formatIstShortDateTime(endDt)}</div>
      </div>

      {/* 3. Live Active Hours + Progress Bar */}
      <div style={{ marginTop: 5 }}>
        <div
          style={{
            width: '100%',
            height: 5,
            borderRadius: 999,
            background: 'rgba(148, 163, 184, 0.25)',
            overflow: 'hidden',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: barColor,
              borderRadius: 999,
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 900, color: barColor }}>
            <Clock size={11} />
            <span>
              Active: {formatHoursMinutes(elapsedMins)} / {effectiveHours}h
            </span>
          </span>

          {isOverCycle ? (
            <span style={{ fontWeight: 900, color: isSpilloverUnpaidToday ? '#ef4444' : '#d97706' }}>
              +{formatHoursMinutes(overMins)} OVER {effectiveHours}h!
            </span>
          ) : (
            <span style={{ fontWeight: 800, color: 'var(--adm-text-muted, #64748b)' }}>
              {formatHoursMinutes(remainingMins)} left
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

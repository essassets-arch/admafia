import React, { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import emperorBannerImg from '../assets/emperor-banner.jpg';
import { SmartTable } from '../components/SmartTabulator';
import {
  evaluateCustomerProfileCompletion,
  sanitizeCustomerProfileFields,
} from '../utils/profileCompletion';

// Formatting Helpers
export function getKolkataWeekDays(weekOffset = 0) {
  // Current time in Asia/Kolkata
  const kolkataNowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const now = new Date(kolkataNowStr);

  const currentDayOfWeek = now.getDay(); // 0 is SUN, 1 is MON, ..., 6 is SAT
  const distToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + distToMonday + (weekOffset * 7));
  monday.setHours(0, 0, 0, 0);

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayCodes = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateNum = d.getDate();
    const monthShort = d.toLocaleString('en-US', { month: 'short' });
    const isToday = (weekOffset === 0 && d.toDateString() === now.toDateString());
    const isPast = d < new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const year = d.getFullYear();
    const month2 = String(d.getMonth() + 1).padStart(2, '0');
    const day2 = String(dateNum).padStart(2, '0');
    const isoDate = `${year}-${month2}-${day2}`;

    days.push({
      code: dayCodes[i],
      label: dayNames[i],
      dateNumber: dateNum,
      month: monthShort,
      dateFormatted: `${dateNum} ${monthShort}`,
      fullDateString: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      isoDate,
      isToday,
      isPast,
    });
  }
  return days;
}

function formatMinimalMaskedPhone(phone, maskedPhone, isUnmasked = true) {
  if (!isUnmasked) {
    if (maskedPhone && /[*•X]/i.test(String(maskedPhone))) {
      return maskedPhone;
    }
    const digits = String(phone || '').replace(/\D/g, '').slice(-10);
    if (digits.length === 10) {
      return `+91 ${digits.slice(0, 2)}••••••${digits.slice(-2)}`;
    }
    return maskedPhone || '+91 98••••••23';
  }
  if (phone) {
    const digits = String(phone).replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? `+91 ${digits}` : phone;
  }
  return maskedPhone || '+91 9820011223';
}

function formatMinimalDateTime(createdAt) {
  if (createdAt && (createdAt.includes('pm') || createdAt.includes('am'))) {
    return createdAt;
  }
  return 'Today, 01:57 pm';
}



export default function LeadHubOverview({
  customer,
  leads,
  followUps,
  walletBalance,
  onNavigate,
  onOpenAddLead,
  onOpenScheduleFollowUp,
  onOpenAddFunds,
  onOpenSetDailyLimit,
  onOpenLanguageModal,
  onOpenConfigureDomain,
  onOpenCompleteRegistration,
  onToggleCampaign,
  onUpdateCustomer,
  onUnbookFutureDate,
  onUpdateLead,
  t,
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const daysList = getKolkataWeekDays(weekOffset);
  const savedCurrency = String(customer?.currency || 'INR').toUpperCase();
  const currencySymbol = savedCurrency === 'USD' ? '$' : '₹';
  const dailySpend = Number(customer.dailyAdSpend || (savedCurrency === 'USD' ? 10 : 300));
  const currentTodayItem = daysList.find((d) => d.isToday) || daysList[0];
  const todayCode = currentTodayItem?.code || 'MON';

  // Compute how many UNBOOKED days are funded by the current wallet balance
  const fundedRunwayDays = dailySpend > 0 ? Math.floor(walletBalance / dailySpend) : 0;

  // Authoritative set of dates ALREADY PAID & DEBITED in MongoDB (consumes 0 from current walletBalance)
  const paidDatesSet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(customer.bookedDates)) {
      customer.bookedDates.forEach((iso) => {
        if (iso) set.add(String(iso).trim());
      });
    }
    const kolkataTodayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (customer.isDeductedToday) {
      set.add(kolkataTodayIso);
    }
    if (customer.lastDeductedAt) {
      try {
        const lastIso = new Date(customer.lastDeductedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        if (lastIso === kolkataTodayIso) set.add(kolkataTodayIso);
      } catch (e) {}
    }
    return set;
  }, [customer.bookedDates, customer.isDeductedToday, customer.lastDeductedAt]);

  const isDayBooked = (dayObj) => {
    if (!dayObj) return false;
    return paidDatesSet.has(dayObj.isoDate);
  };

  const isTodayBooked = Boolean(currentTodayItem && paidDatesSet.has(currentTodayItem.isoDate));
  const { kolkataTodayIso, kolkataTomorrowIso, tomorrowCode, tomorrowDisplayLabel } = useMemo(() => {
    const kNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const tIso = `${kNow.getFullYear()}-${String(kNow.getMonth() + 1).padStart(2, '0')}-${String(kNow.getDate()).padStart(2, '0')}`;
    const tom = new Date(kNow);
    tom.setDate(kNow.getDate() + 1);
    const tomIso = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;
    const tCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const tomLabel = tom.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
    return {
      kolkataTodayIso: tIso,
      kolkataTomorrowIso: tomIso,
      tomorrowCode: tCodes[tom.getDay()],
      tomorrowDisplayLabel: tomLabel,
    };
  }, []);
  const isTomorrowBooked = paidDatesSet.has(kolkataTomorrowIso);

  const [activeDays, setActiveDays] = useState(() => {
    const raw = Array.isArray(customer?.activeDays)
      ? customer.activeDays.map((d) => String(d).trim().toUpperCase()).filter(Boolean)
      : [];
    return raw.length > 0 ? raw : [tomorrowCode];
  });

  const [scheduledDates, setScheduledDates] = useState(() => {
    const rawIso = Array.isArray(customer?.scheduledDates)
      ? customer.scheduledDates
          .map((s) => String(s || '').trim())
          .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && (s > kolkataTodayIso || paidDatesSet.has(s)))
      : [];
    if (rawIso.length > 0) return rawIso;
    if (customer?.schedulePreset === 'clear') return Array.from(paidDatesSet);
    return Array.from(paidDatesSet);
  });
  const [unmaskedLeads, setUnmaskedLeads] = useState({});

  React.useEffect(() => {
    const raw = Array.isArray(customer?.activeDays)
      ? customer.activeDays.map((d) => String(d).trim().toUpperCase()).filter(Boolean)
      : [];
    const merged = new Set(raw.length > 0 ? raw : (customer?.schedulePreset === 'clear' ? [] : [tomorrowCode]));
    daysList.forEach((d) => {
      if (paidDatesSet.has(d.isoDate)) merged.add(d.code);
    });
    setActiveDays(Array.from(merged));

    const rawIso = Array.isArray(customer?.scheduledDates)
      ? customer.scheduledDates
          .map((s) => String(s || '').trim())
          .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && (s > kolkataTodayIso || paidDatesSet.has(s)))
      : [];
    if (rawIso.length > 0) {
      const isoSet = new Set([...rawIso, ...Array.from(paidDatesSet)]);
      setScheduledDates(Array.from(isoSet).sort());
    } else {
      setScheduledDates(Array.from(paidDatesSet).sort());
    }
  }, [customer?.activeDays, customer?.scheduledDates, customer?.schedulePreset, paidDatesSet, tomorrowCode, kolkataTodayIso]);

  // Global funded/paid ISO date set across ALL weeks (Current Week + Next Week + Future):
  // - Advance Next-Day Rule: Unbooked dates MUST be strictly > kolkataTodayIso (Tomorrow onwards)
  // - Clamps total unpaid scheduled dates strictly to `fundedRunwayDays`
  const { effectiveScheduledIsoSet, effectiveWeekDaysSet, unpaidSelectedCount, remainingFundedSlots } = useMemo(() => {
    const isoSet = new Set();
    let unpaidUsed = 0;

    // 1. Always include all already-paid dates
    paidDatesSet.forEach((iso) => isoSet.add(iso));

    // 2. Include user-selected strictly future ISO dates (> Today) up to fundedRunwayDays
    const uniqueCandidates = Array.from(new Set(scheduledDates))
      .filter((iso) => iso > kolkataTodayIso && !paidDatesSet.has(iso))
      .sort((a, b) => a.localeCompare(b));

    for (const iso of uniqueCandidates) {
      if (unpaidUsed < fundedRunwayDays) {
        isoSet.add(iso);
        unpaidUsed++;
      }
    }

    const weekCodeSet = new Set();
    daysList.forEach((d) => {
      if (isoSet.has(d.isoDate)) {
        weekCodeSet.add(d.code);
      }
    });

    return {
      effectiveScheduledIsoSet: isoSet,
      effectiveWeekDaysSet: weekCodeSet,
      unpaidSelectedCount: unpaidUsed,
      remainingFundedSlots: Math.max(0, fundedRunwayDays - unpaidUsed),
    };
  }, [daysList, paidDatesSet, scheduledDates, fundedRunwayDays, kolkataTodayIso]);

  const paidInWeekCount = daysList.filter((d) => paidDatesSet.has(d.isoDate)).length;
  const totalBookedCount = paidInWeekCount;
  const effectiveActiveCount = effectiveWeekDaysSet.size;
  const weeklyPacing = effectiveActiveCount * dailySpend;
  const weekRangeStr = `${daysList[0].dateFormatted} – ${daysList[6].dateFormatted} ${daysList[6].fullDateString.split(' ')[2]}`;

  const isMarketingLiveToday = Boolean(
    customer.adCampaignActive && (isTodayBooked || effectiveScheduledIsoSet.has(kolkataTodayIso))
  );

  const isPaymentDone = customer.paymentStatus === 'paid' || customer.payment_status === 'paid' || (walletBalance > 0);
  const profEval = evaluateCustomerProfileCompletion(customer);
  const sanitizedProfile = sanitizeCustomerProfileFields(customer);
  const isProfileDone = profEval.isComplete;
  const isFullyComplete = isPaymentDone && isProfileDone;

  // Interactive Inline Quick-Complete Profile State (renders ONLY missing fields)
  const [quickProfile, setQuickProfile] = useState(() => ({
    companyName: customer?.companyName || customer?.name || '',
    contactPerson: customer?.contactPerson || customer?.contact || '',
    email: customer?.email || '',
    category: sanitizedProfile.category || '',
    city: sanitizedProfile.city || '',
    state: sanitizedProfile.state || '',
  }));
  const [isSavingQuickProfile, setIsSavingQuickProfile] = useState(false);

  React.useEffect(() => {
    const clean = sanitizeCustomerProfileFields(customer);
    setQuickProfile((prev) => ({
      companyName: prev.companyName || customer?.companyName || customer?.name || '',
      contactPerson: prev.contactPerson || customer?.contactPerson || customer?.contact || '',
      email: prev.email || customer?.email || '',
      category: prev.category || clean.category || '',
      city: prev.city || clean.city || '',
      state: prev.state || clean.state || '',
    }));
  }, [customer?.companyName, customer?.contactPerson, customer?.email, customer?.category, customer?.city, customer?.state]);

  const liveQuickEval = evaluateCustomerProfileCompletion({
    ...customer,
    ...quickProfile,
    completedAt: new Date(Date.now() + 60000).toISOString(),
  });

  const handleSaveQuickProfile = async (e) => {
    e.preventDefault();
    if (!onUpdateCustomer) return;
    setIsSavingQuickProfile(true);
    const completedIso = new Date().toISOString();
    const updates = {
      companyName: (quickProfile.companyName || customer?.companyName || '').trim(),
      name: (quickProfile.companyName || customer?.companyName || '').trim(),
      contactPerson: (quickProfile.contactPerson || customer?.contactPerson || '').trim(),
      contact: (quickProfile.contactPerson || customer?.contactPerson || '').trim(),
      email: (quickProfile.email || customer?.email || '').trim(),
      category: (quickProfile.category || sanitizedProfile.category || '').trim(),
      industry: (customer?.industry || quickProfile.category || sanitizedProfile.category || '').trim(),
      city: (quickProfile.city || sanitizedProfile.city || '').trim(),
      state: (quickProfile.state || sanitizedProfile.state || '').trim(),
      completedAt: completedIso,
      verified: true,
    };
    onUpdateCustomer(updates);
    setIsSavingQuickProfile(false);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Profile saved! Priority territory matching updated.',
      showConfirmButton: false,
      timer: 2600,
    });
  };

  const toggleDay = (dayTarget) => {
    const code = typeof dayTarget === 'string' ? dayTarget : dayTarget?.code;
    const dayObj = typeof dayTarget === 'object' ? dayTarget : daysList.find((d) => d.code === code);
    const isTargetBooked = dayObj ? isDayBooked(dayObj) : (code === currentTodayItem.code && isTodayBooked);

    if (isTargetBooked) {
      if (dayObj?.isoDate && dayObj.isoDate > kolkataTodayIso && typeof onUnbookFutureDate === 'function') {
        Swal.fire({
          icon: 'question',
          title: `Cancel Future Booking (${dayObj.dateFormatted})?`,
          html: `You pre-booked <strong>${dayObj.label}, ${dayObj.dateFormatted}</strong> for <strong>${currencySymbol}${dailySpend}</strong>.<br/><br/>Since this day hasn't started yet, cancelling now returns <strong>${currencySymbol}${dailySpend}</strong> straight back to your Growth Wallet.`,
          showCancelButton: true,
          confirmButtonText: `Cancel Slot & Refund ${currencySymbol}${dailySpend}`,
          confirmButtonColor: '#ef4444',
          cancelButtonText: 'Keep Booked',
        }).then((res) => {
          if (res.isConfirmed) {
            onUnbookFutureDate(dayObj.isoDate);
          }
        });
        return;
      }

      Swal.fire({
        icon: 'info',
        title: dayObj?.isPast ? 'Past Delivery Completed' : 'Today\'s Delivery Already Paid & Booked',
        text: dayObj?.isPast
          ? `${dayObj.label} (${dayObj.dateFormatted}) was already delivered and settled.`
          : `Today's ${currencySymbol}${dailySpend} budget is already paid and locked. You can pause or resume today anytime at ${currencySymbol}0 extra cost.`,
        confirmButtonText: 'Understood',
        confirmButtonColor: '#059669',
      });
      return;
    }

    if (dayObj?.isPast) {
      return;
    }

    // Advance Next-Day Booking Rule: Customers cannot book Today on the spot!
    if (dayObj?.isToday || dayObj?.isoDate === kolkataTodayIso) {
      Swal.fire({
        icon: 'info',
        title: 'Advance Booking Required — Starts Tomorrow!',
        html: `
          <div style="text-align: left; font-size: 0.88rem; color: #334155; line-height: 1.55;">
            Same-day activation is closed so our team gets proper preparation time for your <strong>campaign strategy, custom creatives, and targeting setup</strong>.<br/><br/>
            ${
              isTomorrowBooked
                ? `✓ <strong>Tomorrow (${tomorrowDisplayLabel})</strong> is already paid &amp; booked! Select any other upcoming day to schedule extra delivery.`
                : `Book <strong>Tomorrow (${tomorrowDisplayLabel})</strong> in advance (${currencySymbol}${dailySpend}) so everything goes live smoothly tomorrow!`
            }
          </div>
        `,
        showCancelButton: !isTomorrowBooked,
        confirmButtonText: isTomorrowBooked
          ? 'Got It'
          : walletBalance >= dailySpend
            ? `📅 Book Tomorrow (${tomorrowDisplayLabel}) — ${currencySymbol}${dailySpend}`
            : `+ Top Up ${currencySymbol}${dailySpend} for Tomorrow`,
        confirmButtonColor: '#4f46e5',
        cancelButtonText: 'Close',
      }).then((res) => {
        if (!res.isConfirmed || isTomorrowBooked) return;
        if (walletBalance < dailySpend) {
          if (onOpenAddFunds) onOpenAddFunds();
          return;
        }
        const nextIsoList = Array.from(new Set([...Array.from(paidDatesSet), kolkataTomorrowIso])).sort();
        setScheduledDates(nextIsoList);
        if (onUpdateCustomer) {
          onUpdateCustomer({
            activeDays: Array.from(new Set([...activeDays.filter((c) => c !== todayCode || isTodayBooked), tomorrowCode])),
            scheduledDates: nextIsoList,
            schedulePreset: 'custom',
          });
        }
      });
      return;
    }

    const targetIso = dayObj?.isoDate;
    const isCurrentlySelected = targetIso
      ? effectiveScheduledIsoSet.has(targetIso)
      : effectiveWeekDaysSet.has(code);

    const deriveWeekdayCodesFromIsoList = (isoList) => {
      const codeMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const cSet = new Set();
      isoList.forEach((iso) => {
        if (iso < kolkataTodayIso && !paidDatesSet.has(iso)) return;
        const [y, m, d] = iso.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        if (!Number.isNaN(dt.getTime())) cSet.add(codeMap[dt.getUTCDay()]);
      });
      return Array.from(cSet);
    };

    if (isCurrentlySelected) {
      const nextIsoList = Array.from(effectiveScheduledIsoSet).filter((iso) => iso !== targetIso).sort();
      const nextCodes = deriveWeekdayCodesFromIsoList(nextIsoList);
      try { window.sessionStorage.setItem('admafia_active_schedule_preset', nextIsoList.length === 0 ? 'clear' : 'custom'); } catch (e) {}
      setScheduledDates(nextIsoList);
      setActiveDays(nextCodes);
      if (onUpdateCustomer) {
        onUpdateCustomer({
          activeDays: nextCodes,
          scheduledDates: nextIsoList,
          schedulePreset: nextIsoList.length === 0 ? 'clear' : 'custom',
        });
      }
      return;
    }

    // Strict Pre-Schedule Wallet Runway Guard: prevent scheduling unfunded days!
    if (remainingFundedSlots <= 0) {
      const targetLabel = dayObj ? `${dayObj.label} (${dayObj.dateFormatted})` : code;
      Swal.fire({
        icon: 'warning',
        title: `Top Up ${currencySymbol}${dailySpend} to Unlock ${dayObj?.label || code}`,
        html: fundedRunwayDays === 0
          ? `Your Growth Wallet has <strong style="color:#ef4444;">${currencySymbol}${walletBalance.toLocaleString()}</strong> available${isTodayBooked ? ' after today\'s paid delivery' : ''}.<br/><br/>Each scheduled delivery day requires <strong>${currencySymbol}${dailySpend.toLocaleString()}</strong> in wallet balance. Top up now to unlock and schedule <strong>${targetLabel}</strong>.`
          : `Your <strong>${currencySymbol}${walletBalance.toLocaleString()}</strong> wallet balance is already allocated across <strong>${fundedRunwayDays}</strong> scheduled day${fundedRunwayDays > 1 ? 's' : ''}.<br/><br/>Top up <strong>${currencySymbol}${dailySpend.toLocaleString()}</strong> more to add <strong>${targetLabel}</strong>, or unselect another scheduled day first.`,
        showCancelButton: true,
        confirmButtonText: `+ Top Up ${currencySymbol}${dailySpend.toLocaleString()} Now`,
        confirmButtonColor: '#4f46e5',
        cancelButtonText: 'Cancel',
      }).then((res) => {
        if (res.isConfirmed && onOpenAddFunds) {
          onOpenAddFunds();
        }
      });
      return;
    }

    const nextIsoList = Array.from(new Set([...Array.from(effectiveScheduledIsoSet), ...(targetIso ? [targetIso] : [])])).sort();
    const nextCodes = deriveWeekdayCodesFromIsoList(nextIsoList);
    try { window.sessionStorage.setItem('admafia_active_schedule_preset', 'custom'); } catch (e) {}
    setScheduledDates(nextIsoList);
    setActiveDays(nextCodes);
    if (onUpdateCustomer) {
      onUpdateCustomer({
        activeDays: nextCodes,
        scheduledDates: nextIsoList,
        schedulePreset: 'custom',
      });
    }
  };

  const handleSelectPresetDays = (preset) => {
    const bookedCodesInView = daysList.filter((d) => isDayBooked(d)).map((d) => d.code);
    const allBookedIso = Array.from(paidDatesSet).sort();

    if (preset === 'clear') {
      try { window.sessionStorage.setItem('admafia_active_schedule_preset', 'clear'); } catch (e) {}
      setScheduledDates(allBookedIso);
      setActiveDays(bookedCodesInView);
      if (allBookedIso.length > 0) {
        Swal.fire({
          icon: 'info',
          title: 'Unpaid Days Cleared',
          text: 'All upcoming unpaid days were cleared. Already-paid days remain locked.',
          confirmButtonText: 'Understood',
          confirmButtonColor: '#059669',
        });
      }
      if (onUpdateCustomer) {
        onUpdateCustomer({
          activeDays: bookedCodesInView,
          scheduledDates: allBookedIso,
          schedulePreset: 'clear',
        });
      }
      return;
    }

    let rawTarget = [];
    if (preset === 'all') rawTarget = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    if (preset === 'weekdays') rawTarget = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    if (preset === 'weekends') rawTarget = ['SAT', 'SUN'];

    // Advance Next-Day Rule: Exclude BOTH past days AND unbooked Today (`iso > kolkataTodayIso`)!
    let targetWeekDays = daysList;
    let candidateDays = targetWeekDays.filter(
      (d) => rawTarget.includes(d.code) && d.isoDate > kolkataTodayIso && !isDayBooked(d)
    );
    let switchedToNextWeek = false;
    if (candidateDays.length === 0 && weekOffset === 0) {
      targetWeekDays = getKolkataWeekDays(1);
      candidateDays = targetWeekDays.filter(
        (d) => rawTarget.includes(d.code) && d.isoDate > kolkataTodayIso && !paidDatesSet.has(d.isoDate)
      );
      switchedToNextWeek = candidateDays.length > 0;
    }

    const validTargetCodes = Array.from(
      new Set([...bookedCodesInView, ...candidateDays.map((d) => d.code)])
    );
    const unpaidNeededCount = candidateDays.length;

    if (unpaidNeededCount === 0 && bookedCodesInView.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Selected Days Are Already Booked or Ended',
        text: 'Switch to "Next Week ›" to pre-book upcoming advance days.',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    if (unpaidNeededCount > fundedRunwayDays) {
      const requiredBal = unpaidNeededCount * dailySpend;
      const shortfall = Math.max(dailySpend, Math.ceil(requiredBal - walletBalance));
      const presetTitle = preset === 'all' ? 'Upcoming Advance Days' : preset === 'weekdays' ? 'Upcoming Weekdays (Mon–Fri)' : 'Upcoming Weekends (Sat–Sun)';
      Swal.fire({
        icon: 'warning',
        title: `Wallet Top-Up Required for ${presetTitle}`,
        html: `
          <div style="text-align: left; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px; margin: 10px 0; font-family: inherit;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: #64748b; font-size: 0.84rem;">Advance Unpaid Days:</span>
              <strong style="color: #0f172a; font-size: 0.92rem;">${unpaidNeededCount} day${unpaidNeededCount > 1 ? 's' : ''} × ${currencySymbol}${dailySpend.toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: #64748b; font-size: 0.84rem;">Required Wallet Balance:</span>
              <strong style="color: #4f46e5; font-size: 0.95rem;">${currencySymbol}${requiredBal.toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: #64748b; font-size: 0.84rem;">Current Wallet Balance:</span>
              <strong style="color: #64748b; font-size: 0.92rem;">${currencySymbol}${walletBalance.toLocaleString()}</strong>
            </div>
            <div style="border-top: 1px dashed #cbd5e1; padding-top: 6px; display: flex; justify-content: space-between;">
              <span style="color: #dc2626; font-weight: 700; font-size: 0.85rem;">Top-Up Needed:</span>
              <strong style="color: #dc2626; font-size: 1rem;">+${currencySymbol}${shortfall.toLocaleString()}</strong>
            </div>
          </div>
          <p style="font-size: 0.84rem; color: #475569; margin: 0;">Top up your Growth Wallet first to pre-book all ${unpaidNeededCount} advance days.</p>
        `,
        showCancelButton: true,
        confirmButtonText: `+ Top Up ${currencySymbol}${shortfall.toLocaleString()} Now`,
        confirmButtonColor: '#4f46e5',
        cancelButtonText: 'Cancel',
      }).then((res) => {
        if (res.isConfirmed && onOpenAddFunds) {
          onOpenAddFunds();
        }
      });
      return;
    }

    const validTargetIso = Array.from(
      new Set([
        ...Array.from(paidDatesSet),
        ...candidateDays.map((d) => d.isoDate),
      ])
    ).sort();

    if (switchedToNextWeek) setWeekOffset(1);
    try { window.sessionStorage.setItem('admafia_active_schedule_preset', preset); } catch (e) {}
    setScheduledDates(validTargetIso);
    setActiveDays(validTargetCodes);

    if (onUpdateCustomer) {
      onUpdateCustomer({
        activeDays: validTargetCodes,
        scheduledDates: validTargetIso,
        schedulePreset: preset,
      });
    }
  };

  // Active High-Priority Enquiries (excluding dropped leads)
  const activePipelineLeads = (leads || []).filter((l) => l.status !== 'Dropped');
  const recentPreviewLeads = activePipelineLeads.slice(0, 5);
  const totalLeadsCount = activePipelineLeads.length;
  const unreadEnquiriesCount = activePipelineLeads.filter((l) => !l.read).length;
  const todayLeadsCount = activePipelineLeads.filter(
    (l) => l.dateGroup === 'today' || (l.createdAt && l.createdAt.includes('Today'))
  ).length;
  const respondedLeadsCount = activePipelineLeads.filter(
    (l) => l.read || l.status === 'In Follow-up' || l.status === 'Callback' || l.status === 'Converted'
  ).length;
  const responseRatePct = totalLeadsCount > 0 ? Math.round((respondedLeadsCount / totalLeadsCount) * 100) : 0;

  const togglePhoneReveal = (leadId) => {
    setUnmaskedLeads((prev) => ({ ...prev, [leadId]: !prev[leadId] }));
  };

  const handleMoveToFollowUp = (leadId) => {
    if (onUpdateLead) {
      onUpdateLead(leadId, { status: 'In Follow-up' });
    }
  };

  const handleMarkLeadRead = (lead) => {
    if (onUpdateLead && !lead.read) {
      onUpdateLead(lead.id, { read: true });
    }
  };

  const handleDropLead = (leadId) => {
    if (onUpdateLead) {
      onUpdateLead(leadId, { status: 'Dropped' });
    }
  };

  const lockedHeldCount = Number(customer?.lockedHeldLeadsCount ?? customer?.heldLeadsCount ?? 0);
  const topupShortfallForUnlock = Math.max(dailySpend, Math.ceil(dailySpend - walletBalance));

  return (
    <div className="portal-overview-view">
      {/* 0A. OPTION B LOCKED BUYER ENQUIRIES CONVERSION BANNER (Zero Phone Leakage Until Paid!) */}
      {lockedHeldCount > 0 && (
        <div
          role="region"
          aria-label="Locked waiting buyer enquiries"
          style={{
            background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 55%, #fde68a 100%)',
            border: '2px solid #f59e0b',
            borderRadius: '16px',
            padding: '16px 20px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            boxShadow: '0 10px 26px rgba(217, 119, 6, 0.16)',
          }}
        >
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: '#b45309',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '4px 10px',
                  borderRadius: '999px',
                }}
              >
                🔒 {lockedHeldCount} Waiting Buyer {lockedHeldCount === 1 ? 'Enquiry' : 'Enquiries'} Locked
              </span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e' }}>
                Instant Auto-Unlock Enabled
              </span>
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.04rem', fontWeight: 800, color: '#78350f', lineHeight: 1.3 }}>
              {lockedHeldCount} Verified Buyer {lockedHeldCount === 1 ? 'Mobile Number Is' : 'Mobile Numbers Are'} Waiting in Your Queue!
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e', lineHeight: 1.45 }}>
              {walletBalance >= dailySpend
                ? `Pre-book your next delivery slot (${currencySymbol}${dailySpend}) to unlock all ${lockedHeldCount} waiting buyer contact${lockedHeldCount === 1 ? '' : 's'} into My Leads immediately.`
                : `Top up ${currencySymbol}${topupShortfallForUnlock.toLocaleString('en-IN')} in your Growth Wallet to pre-book tomorrow's slot and unlock all ${lockedHeldCount} buyer contact${lockedHeldCount === 1 ? '' : 's'} instantly.`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (walletBalance >= dailySpend && onToggleCampaign) {
                onToggleCampaign(true);
              } else if (onOpenAddFunds) {
                onOpenAddFunds();
              }
            }}
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 20px',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(79, 70, 229, 0.32)',
              whiteSpace: 'nowrap',
            }}
          >
            {walletBalance >= dailySpend
              ? `🔓 Book Next Day (${currencySymbol}${dailySpend}) & Unlock ${lockedHeldCount} →`
              : `⚡ Recharge ${currencySymbol}${topupShortfallForUnlock.toLocaleString('en-IN')} & Unlock ${lockedHeldCount} →`}
          </button>
        </div>
      )}

      {/* 0. INTERACTIVE INLINE QUICK-COMPLETE PROFILE CARD (encourages 100% completion in 10 seconds) */}
      {!profEval.isComplete && (
        <form
          onSubmit={handleSaveQuickProfile}
          className="am-quick-profile-card"
          role="region"
          aria-label="Quick business profile completion"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: liveQuickEval.isComplete ? '#059669' : '#d97706',
                    color: '#ffffff',
                    fontSize: '0.73rem',
                    fontWeight: 800,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                    padding: '4px 11px',
                    borderRadius: '999px',
                    transition: 'background 0.25s ease',
                  }}
                >
                  {liveQuickEval.isComplete ? '✓ Ready to Unlock 100%' : `⚡ Unlock Priority Leads • ${liveQuickEval.kycPercent}% Ready`}
                </span>
                <span className="am-quick-profile-meta-count" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e' }}>
                  {profEval.missingFields.length} quick {profEval.missingFields.length === 1 ? 'detail' : 'details'} left
                </span>
              </div>
              <h3 className="am-quick-profile-heading" style={{ margin: '0 0 4px', fontSize: '1.04rem', fontWeight: 800, color: '#78350f', lineHeight: 1.3 }}>
                Finish Your Business Profile Inline to Match Exact Buyer Leads in Your City
              </h3>
            </div>

            {/* Live Animated Readiness Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '200px', flex: '0 1 260px' }}>
              <div
                className="am-quick-profile-track"
                style={{
                  flex: 1,
                  height: '9px',
                  background: 'rgba(217, 119, 6, 0.18)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${liveQuickEval.kycPercent}%`,
                    height: '100%',
                    background: liveQuickEval.isComplete
                      ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
                    borderRadius: '999px',
                    transition: 'width 0.28s ease, background 0.28s ease',
                  }}
                />
              </div>
              <strong className={`am-quick-profile-pct ${liveQuickEval.isComplete ? 'is-complete' : ''}`} style={{ fontSize: '0.84rem', fontWeight: 800, color: liveQuickEval.isComplete ? '#059669' : '#92400e' }}>
                {liveQuickEval.kycPercent}%
              </strong>
            </div>
          </div>

          <div className="am-quick-profile-grid">
            {profEval.missingKeys.includes('companyName') && (
              <div className="am-quick-profile-field">
                <label>Business / Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Builders Pvt Ltd"
                  value={quickProfile.companyName}
                  onChange={(e) => setQuickProfile((p) => ({ ...p, companyName: e.target.value }))}
                />
              </div>
            )}
            {profEval.missingKeys.includes('category') && (
              <div className="am-quick-profile-field">
                <label>Business Category *</label>
                <select
                  required
                  value={quickProfile.category}
                  onChange={(e) => setQuickProfile((p) => ({ ...p, category: e.target.value }))}
                >
                  <option value="">Select Category...</option>
                  <option value="Real Estate & Infrastructure">Real Estate &amp; Infrastructure</option>
                  <option value="IT & Software">IT &amp; Software</option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Healthcare & Wellness">Healthcare &amp; Wellness</option>
                  <option value="Construction & Building Materials">Construction &amp; Building Materials</option>
                  <option value="Education & Coaching">Education &amp; Coaching</option>
                  <option value="Financial & Consulting">Financial &amp; Consulting</option>
                  <option value="Retail & E-commerce">Retail &amp; E-commerce</option>
                  <option value="Organic Food & FMCG">Organic Food &amp; FMCG</option>
                  <option value="Hardware & Computer Accessories">Hardware &amp; Computer Accessories</option>
                  <option value="Electrical Products">Electrical Products</option>
                  <option value="Digital Marketing">Digital Marketing</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            )}
            {profEval.missingKeys.includes('city') && (
              <div className="am-quick-profile-field">
                <label>Operating City *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Surat, Mumbai, Bengaluru"
                  value={quickProfile.city}
                  onChange={(e) => setQuickProfile((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
            )}
            {profEval.missingKeys.includes('state') && (
              <div className="am-quick-profile-field">
                <label>State / Province *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gujarat, Maharashtra"
                  value={quickProfile.state}
                  onChange={(e) => setQuickProfile((p) => ({ ...p, state: e.target.value }))}
                />
              </div>
            )}
            {profEval.missingKeys.includes('contactPerson') && (
              <div className="am-quick-profile-field">
                <label>Contact Person *</label>
                <input
                  type="text"
                  required
                  placeholder="Your full name"
                  value={quickProfile.contactPerson}
                  onChange={(e) => setQuickProfile((p) => ({ ...p, contactPerson: e.target.value }))}
                />
              </div>
            )}
            {profEval.missingKeys.includes('email') && (
              <div className="am-quick-profile-field">
                <label>Business Email *</label>
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={quickProfile.email}
                  onChange={(e) => setQuickProfile((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
            <button
              type="button"
              className="am-quick-profile-link"
              onClick={() => onNavigate && onNavigate('profile')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#92400e',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Open Full Business Profile →
            </button>
            <button
              type="submit"
              disabled={isSavingQuickProfile}
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 20px',
                fontSize: '0.86rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 6px 16px rgba(79, 70, 229, 0.28)',
                whiteSpace: 'nowrap',
              }}
            >
              {isSavingQuickProfile ? 'Saving...' : 'Save & Unlock Priority Leads →'}
            </button>
          </div>
        </form>
      )}

      {/* 1. Breadcrumbs & Title */}
      <div className="overview-top-breadcrumb-bar">
        <div className="breadcrumb-line">
          <span className="crumb-root">Lead Hub</span>
          <span className="crumb-slash">/</span>
          <span className="crumb-current">Overview</span>
        </div>
        <div className="live-pipeline-active-badge">
          <span className="pulse-emerald-dot"></span> Live Pipeline Active
        </div>
      </div>

      <div className="overview-title-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>Workspace Overview</h1>
          <p className="overview-desc-lead">
            Schedule delivery days, track verified buyer enquiries, and manage your daily pacing budget.
          </p>
        </div>

        {/* Right side top: Growth Wallet Card & First-Payment CTA (if unpaid) */}
        <div className="overview-header-actions-cluster" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginLeft: 'auto', maxWidth: '100%' }}>
          {/* 1. GROWTH WALLET Card */}
          <div
            className="header-ad-wallet-card"
            title="Growth Wallet Balance"
            onClick={onOpenAddFunds}
          >
            <div className="header-wallet-icon-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
              </svg>
            </div>
            <div className="header-wallet-text-col">
              <span className="header-wallet-tag">GROWTH WALLET</span>
              <strong className="header-wallet-val">{currencySymbol}{walletBalance.toFixed(0)}</strong>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddFunds();
              }}
              className="btn-header-topup-exact"
            >
              + Top Up
            </button>
          </div>

          {/* 2. Activate Wallet CTA (Only shown when initial payment is still pending) */}
          {!isPaymentDone && onOpenCompleteRegistration && (
            <button
              type="button"
              onClick={onOpenCompleteRegistration}
              className="header-complete-reg-exact"
              title="Fund wallet to activate lead delivery"
            >
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.28)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #ffffff' }} />
              </span>
              <span className="header-reg-text">Fund &amp; Activate Delivery</span>
            </button>
          )}
        </div>
      </div>

        {/* 3. Lead Delivery & Pacing Control */}
      <div className="pacing-control-master-card">
        {/* Master Top Header */}
        <div className="pacing-master-header-exact">
          <div className="pacing-master-left-group">
            {/* Dark Slate Square Icon Box with Pause / Play */}
            <div className={`pacing-status-icon-box ${customer.adCampaignActive ? 'is-live' : 'is-paused'}`}>
              {customer.adCampaignActive ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" fill="#ffffff" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16" fill="#ffffff" rx="1" />
                  <rect x="14" y="4" width="4" height="16" fill="#ffffff" rx="1" />
                </svg>
              )}
            </div>

            <div className="pacing-master-title-stack">
              <div className="pacing-title-line-exact">
                <h2>Lead Delivery &amp; Pacing Control</h2>
                <span className={`badge-marketing-pill-exact ${customer.adCampaignActive ? 'live' : 'off'}`}>
                  {customer.adCampaignActive ? (
                    <>
                      <span className="live-dot-pulse"></span>
                      <span>LEAD DELIVERY IS LIVE</span>
                    </>
                  ) : (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="5" y="4" width="4" height="16" rx="1" />
                        <rect x="15" y="4" width="4" height="16" rx="1" />
                      </svg>
                      <span>LEAD DELIVERY IS OFF</span>
                    </>
                  )}
                </span>
              </div>
              <p className="pacing-master-subtitle-exact">
                Pre-book your active days in advance (starting from <strong>Tomorrow, {tomorrowDisplayLabel}</strong>) so our team prepares your strategy &amp; creatives ahead of launch. Daily pacing of <strong>{currencySymbol}{dailySpend}</strong> is deducted on booking.
              </p>
            </div>
          </div>

          {/* Right: DELIVERY STATUS Paused (Off) + Start / Stop Action Button */}
          <div className="pacing-status-toggle-cluster">
            <div
              className="pacing-status-text-stack"
              onClick={() => onToggleCampaign && onToggleCampaign(!customer.adCampaignActive)}
              style={{ cursor: 'pointer' }}
              title={customer.adCampaignActive ? 'Click to Pause Lead Delivery' : 'Click to Activate Lead Delivery'}
            >
              <span className="pacing-status-mini-label">DELIVERY STATUS</span>
              <strong
                className="pacing-status-state-text"
                style={{
                  color: customer.adCampaignActive ? '#059669' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  justifyContent: 'flex-end',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: customer.adCampaignActive ? '#10b981' : '#94a3b8',
                    display: 'inline-block',
                    boxShadow: customer.adCampaignActive ? '0 0 8px #10b981' : 'none',
                  }}
                />
                {customer.adCampaignActive
                  ? 'Running (Active)'
                  : isTodayBooked
                    ? 'Paused (Today Paid ✓)'
                    : isTomorrowBooked
                      ? `Booked for Tomorrow (${tomorrowDisplayLabel}) ✓`
                      : 'Advance Booking Open'}
              </strong>
              {!customer.adCampaignActive && isTodayBooked ? (
                <span
                  style={{ fontSize: '0.70rem', color: '#059669', fontWeight: 800, marginTop: 2 }}
                  title="Today's delivery was already paid — resume anytime for free"
                >
                  ✓ {currencySymbol}0 to Resume Today
                </span>
              ) : !customer.adCampaignActive && isTomorrowBooked ? (
                <span
                  style={{ fontSize: '0.70rem', color: '#4f46e5', fontWeight: 800, marginTop: 2 }}
                  title="Strategy & creative preparation in progress for Tomorrow"
                >
                  🎯 Strategy &amp; Creative Prep in Progress
                </span>
              ) : !customer.adCampaignActive && walletBalance < dailySpend ? (
                <span
                  style={{ fontSize: '0.70rem', color: '#e11d48', fontWeight: 800, marginTop: 2, cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenAddFunds) onOpenAddFunds();
                  }}
                  title="Click to Top Up Wallet"
                >
                  ⚠️ Top Up {currencySymbol}{dailySpend} to Book Tomorrow
                </span>
              ) : null}
            </div>

            {/* Single Action Button: Resume/Stop when Today is pre-booked, or Book Next Day in advance */}
            <div className="pacing-start-stop-single-button">
              {customer.adCampaignActive ? (
                <button
                  type="button"
                  className="btn-proper-pacing-stop is-active"
                  onClick={() => onToggleCampaign && onToggleCampaign(false)}
                  title="Click to Pause Lead Delivery"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-proper-pacing-start is-active"
                  onClick={() => onToggleCampaign && onToggleCampaign(true)}
                  title={
                    isTodayBooked
                      ? `Resume today's already-paid delivery (${currencySymbol}0)`
                      : `Pre-book next available day in advance (${currencySymbol}${dailySpend})`
                  }
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>{isTodayBooked ? 'Resume' : isTomorrowBooked ? '+ Next Day' : 'Book Tomorrow'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3 Metric Cards Grid (Daily Growth Budget, Active Schedule, Current Wallet) */}
        <div className="pacing-three-cards-grid">
          {/* Card 1: DAILY GROWTH BUDGET */}
          <div className="pacing-metric-card-exact">
            <div className="pacing-card-top-row">
              <div className="pacing-card-label-with-icon">
                <span className="pacing-icon-dollar">{currencySymbol}</span>
                <span className="pacing-card-exact-label">DAILY GROWTH BUDGET</span>
              </div>
              <button
                type="button"
                onClick={onOpenSetDailyLimit}
                className="btn-pacing-link-purple"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span>Set Amount</span>
              </button>
            </div>

            <div className="pacing-card-main-val-row">
              <div className="pacing-val-with-unit">
                <strong className="pacing-big-amount">{currencySymbol}{dailySpend}</strong>
                <span className="pacing-unit-sub">/ active day</span>
              </div>
              <span className="pacing-meta-verified-pill">Verified Active</span>
            </div>

            <div className="pacing-card-footer-line">
              <span>Pacing auto-managed</span>
            </div>
          </div>

          {/* Card 2: ACTIVE SCHEDULE */}
          <div className="pacing-metric-card-exact">
            <div className="pacing-card-top-row">
              <div className="pacing-card-label-with-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.3">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span className="pacing-card-exact-label">ACTIVE SCHEDULE</span>
              </div>
            </div>

            <div className="pacing-card-main-val-row">
              <strong className="pacing-big-amount">{effectiveActiveCount} of 7 Days Scheduled</strong>
            </div>

            <div className="pacing-card-footer-between">
              <span>Weekly pacing: <strong>{currencySymbol}{weeklyPacing.toLocaleString(savedCurrency === 'INR' ? 'en-IN' : 'en-US')}</strong></span>
              <span className={`pacing-days-badge ${totalBookedCount > 0 ? 'tone-emerald' : 'tone-neutral'}`} style={{ background: totalBookedCount > 0 ? '#ecfdf5' : '#f8fafc', color: totalBookedCount > 0 ? '#047857' : '#64748b', fontWeight: 800 }}>
                {totalBookedCount > 0 ? `🎯 ${totalBookedCount}d Paid` : `${effectiveActiveCount}d Funded`}
              </span>
            </div>
          </div>

          {/* Card 3: CURRENT WALLET */}
          <div className="pacing-metric-card-exact">
            <div className="pacing-card-top-row">
              <div className="pacing-card-label-with-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.3">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <span className="pacing-card-exact-label">CURRENT WALLET</span>
              </div>
              <button
                type="button"
                onClick={onOpenAddFunds}
                className="btn-pacing-link-purple"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Top Up</span>
              </button>
            </div>

            <div className="pacing-card-main-val-row">
              <strong className="pacing-big-amount">{currencySymbol}{walletBalance.toFixed(0)}</strong>
            </div>

            <div className="pacing-card-footer-between">
              <span>
                Extra Runway:{' '}
                <strong className={!isTodayBooked && walletBalance < dailySpend ? 'text-red-alert' : ''}>
                  {fundedRunwayDays} {fundedRunwayDays === 1 ? 'day' : 'days'} funded
                </strong>
              </span>
              {isTodayBooked && walletBalance < dailySpend ? (
                <span style={{ color: '#047857', fontWeight: 800 }}>✓ Today Paid • Top Up for Future Days</span>
              ) : walletBalance < dailySpend ? (
                <span className="text-red-alert" style={{ fontWeight: 800 }}>● Balance is Low (Needs Top Up)</span>
              ) : customer.adCampaignActive ? (
                <span style={{ color: '#047857', fontWeight: 800 }}>● {fundedRunwayDays}d Extra Funded</span>
              ) : (
                <span style={{ color: '#0284c7', fontWeight: 800 }}>● Ready to Activate (Click Start)</span>
              )}
            </div>
          </div>
        </div>

        {/* Day Selection Engine: SELECT ACTIVE DELIVERY DAYS */}
        <div className="select-marketing-days-engine">
          <div className="engine-header-row">
            <div className="engine-title-with-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.3">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span className="engine-title-text">
                SELECT DELIVERY DAYS ({effectiveActiveCount} OF 7 DAYS SCHEDULED
                {totalBookedCount > 0 ? ` • ${totalBookedCount} PAID` : ''})
              </span>
              {remainingFundedSlots > 0 ? (
                <span className="engine-booked-highlight-pill tone-blue" style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  borderRadius: '9999px',
                  padding: '3px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginLeft: '8px'
                }}>
                  ✨ {remainingFundedSlots} Funded {remainingFundedSlots === 1 ? 'Day' : 'Days'} Ready to Pick
                </span>
              ) : isTodayBooked && fundedRunwayDays === 0 ? (
                <span
                  className="engine-booked-highlight-pill tone-emerald"
                  style={{
                    background: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #10b981',
                    borderRadius: '9999px',
                    padding: '3px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: '8px',
                    cursor: 'pointer',
                  }}
                  onClick={onOpenAddFunds}
                  title="Today is paid! Click to add balance if you want to schedule extra upcoming days."
                >
                  ✓ Today Paid • + Top Up {currencySymbol}{dailySpend}/day for Extra Days
                </span>
              ) : fundedRunwayDays === 0 ? (
                <span
                  className="engine-booked-highlight-pill tone-rose"
                  style={{
                    background: '#fff1f2',
                    color: '#e11d48',
                    border: '1px solid #fda4af',
                    borderRadius: '9999px',
                    padding: '3px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: '8px',
                    cursor: 'pointer',
                  }}
                  onClick={onOpenAddFunds}
                  title="Top up your Growth Wallet to unlock scheduling"
                >
                  🔒 Top Up {currencySymbol}{dailySpend}/day to Unlock Days
                </span>
              ) : (
                <span className="engine-booked-highlight-pill tone-emerald" style={{
                  background: '#ecfdf5',
                  color: '#047857',
                  border: '1px solid #10b981',
                  borderRadius: '9999px',
                  padding: '3px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginLeft: '8px',
                }}>
                  ✓ All {fundedRunwayDays} Funded {fundedRunwayDays === 1 ? 'Day' : 'Days'} Scheduled
                </span>
              )}
            </div>

            <div className="engine-preset-buttons-row">
              {/* All 7 Days */}
              <button
                type="button"
                className={`btn-preset-chip ${effectiveActiveCount === 7 ? 'active-purple' : ''}`}
                onClick={() => handleSelectPresetDays('all')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span>All 7 Days</span>
                {fundedRunwayDays < 6 && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.4">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}
              </button>

              {/* Mon - Fri (5 Days) */}
              <button
                type="button"
                className={`btn-preset-chip ${effectiveActiveCount === 5 && !effectiveWeekDaysSet.has('SAT') && !effectiveWeekDaysSet.has('SUN') ? 'active-purple' : ''}`}
                onClick={() => handleSelectPresetDays('weekdays')}
              >
                <span>Mon - Fri</span>
                {fundedRunwayDays < 4 && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.4">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}
              </button>

              {/* Sat - Sun (Weekends) */}
              <button
                type="button"
                className={`btn-preset-chip ${effectiveActiveCount === 2 && effectiveWeekDaysSet.has('SAT') && effectiveWeekDaysSet.has('SUN') ? 'active-purple' : ''}`}
                onClick={() => handleSelectPresetDays('weekends')}
              >
                <span>Sat - Sun</span>
                {fundedRunwayDays < 2 && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.4">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}
              </button>

              {/* Clear */}
              <button
                type="button"
                className="btn-preset-chip clear"
                onClick={() => handleSelectPresetDays('clear')}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Real-Time Weekly Calendar Navigation Toolbar */}
          <div className="engine-week-calendar-toolbar">
            <div className="week-nav-left-group">
              <button
                type="button"
                className="btn-week-step-nav"
                onClick={() => setWeekOffset((prev) => prev - 1)}
                title="View Previous Week"
              >
                ‹ Prev Week
              </button>
              <div className="week-range-indicator-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.4">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span className="week-range-text">Week of {weekRangeStr}</span>
                {weekOffset === 0 ? (
                  <span className="live-week-pill">● Current Week (IST)</span>
                ) : (
                  <button
                    type="button"
                    className="btn-jump-current-week"
                    onClick={() => setWeekOffset(0)}
                  >
                    Jump to Current Week ↺
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn-week-step-nav"
                onClick={() => setWeekOffset((prev) => prev + 1)}
                title="View Next Week"
              >
                Next Week ›
              </button>
            </div>

            <div className="week-timezone-badge" title="Dynamic real calendar dates computed in Asia/Kolkata">
              <span>Timezone: Asia/Kolkata</span>
            </div>
          </div>

          {/* 7 Day Cards */}
          <div className="seven-days-cards-grid-exact">
            {daysList.map((d) => {
              const isBooked = isDayBooked(d);
              const isPastUnbooked = Boolean(d.isPast && !isBooked);
              const isTodayUnbooked = Boolean(d.isToday && !isBooked);
              const isTomorrowUnbooked = Boolean(d.isoDate === kolkataTomorrowIso && !isBooked);
              const isSelected = Boolean(effectiveScheduledIsoSet.has(d.isoDate) || isBooked);
              const canSelectWithWallet =
                !isBooked && !isSelected && !isPastUnbooked && !isTodayUnbooked && remainingFundedSlots > 0;

              return (
                <div
                  key={d.code}
                  className={`seven-day-card-exact ${isBooked ? 'is-ad-booked is-selected' : isSelected ? 'is-selected' : 'is-unselected'} ${d.isToday ? 'is-today' : ''}`}
                  style={
                    isPastUnbooked
                      ? { opacity: 0.52, cursor: 'not-allowed', filter: 'grayscale(0.35)' }
                      : isTodayUnbooked
                        ? { opacity: 0.78, borderStyle: 'dashed' }
                        : undefined
                  }
                  onClick={() => {
                    if (!isPastUnbooked) toggleDay(d);
                  }}
                  title={
                    isBooked
                      ? `${d.label} (${d.dateFormatted}): Already paid & booked`
                      : isPastUnbooked
                        ? `${d.label} (${d.dateFormatted}): Past date has ended`
                        : isTodayUnbooked
                          ? `Same-day booking closed (Strategy & Creative Prep) — book Tomorrow (${tomorrowDisplayLabel}) onwards`
                          : isSelected
                            ? `Click to unschedule ${d.label} (${d.dateFormatted})`
                            : canSelectWithWallet
                              ? `Click to pre-book ${d.label} (${d.dateFormatted}) in advance`
                              : `Locked — Top up ${currencySymbol}${dailySpend} to pre-book ${d.label} (${d.dateFormatted})`
                  }
                >
                  {/* Floating badge */}
                  {d.isToday && (
                    <span className="today-floating-pill">
                      {isBooked ? 'Today Live' : 'Prep Day'}
                    </span>
                  )}
                  {!d.isToday && isTomorrowUnbooked && (
                    <span className="today-floating-pill" style={{ background: '#4f46e5' }}>
                      Next Slot
                    </span>
                  )}
                  {isBooked && (
                    <span className="ad-booked-floating-badge">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginRight: '2px' }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {d.isPast ? 'Delivered' : 'Paid'}
                    </span>
                  )}

                  <div className="day-code-title">{d.code}</div>
                  <div className="day-calendar-date">{d.dateFormatted}</div>
                  <div className="day-sub-label">{d.label}</div>

                  {/* Price tag */}
                  <div className={`day-price-badge ${isBooked ? 'booked' : isSelected ? 'selected' : 'unselected'}`}>
                    {isPastUnbooked || isTodayUnbooked ? '—' : `${currencySymbol}${dailySpend}`}
                  </div>

                  {isBooked ? (
                    <div className="day-status-micro-text booked">
                      {d.isPast ? '✓ DELIVERED' : '🔒 PAID & BOOKED'}
                    </div>
                  ) : isPastUnbooked ? (
                    <div className="day-status-micro-text available" style={{ color: '#94a3b8' }}>
                      ENDED
                    </div>
                  ) : isTodayUnbooked ? (
                    <div className="day-status-micro-text available" style={{ color: '#64748b', fontWeight: 800 }}>
                      ⏳ BOOK TOMORROW
                    </div>
                  ) : isSelected ? (
                    <div className="day-status-micro-text selected">✓ SCHEDULED</div>
                  ) : canSelectWithWallet ? (
                    <div className="day-status-micro-text available" style={{ color: '#4f46e5', fontWeight: 800 }}>
                      + BOOK IN ADVANCE
                    </div>
                  ) : (
                    <div className="day-status-micro-text available" style={{ color: '#d97706', fontWeight: 800 }}>
                      🔒 TOP UP {currencySymbol}{dailySpend}
                    </div>
                  )}

                  {/* Bottom Status Wrap */}
                  <div className="day-bottom-status-wrap">
                    {isBooked ? (
                      <div className="day-check-circle is-booked-lock-pill" style={{ background: '#059669', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px', padding: '0 6px', width: 'auto', minWidth: '38px', borderRadius: '9999px', height: '22px' }} title={`${d.label} (${d.dateFormatted}) is paid & locked`}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </div>
                    ) : isPastUnbooked || isTodayUnbooked ? (
                      <div className="day-lock-icon" style={{ opacity: 0.55 }} title={isTodayUnbooked ? 'Same-day closed — book Tomorrow onwards' : 'Past calendar day'}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8' }}>⏳</span>
                      </div>
                    ) : isSelected ? (
                      <div className="day-check-circle" title={`Click to unschedule ${d.label} (${d.dateFormatted})`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : canSelectWithWallet ? (
                      <div
                        className="day-lock-icon"
                        style={{ borderColor: '#818cf8', background: '#eef2ff', color: '#4f46e5' }}
                        title={`Click to schedule ${d.label} (${d.dateFormatted})`}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.6" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </div>
                    ) : (
                      <div className="day-lock-icon" title={`Top up ${currencySymbol}${dailySpend} to unlock ${d.label}`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.3">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Today Status & Budget Action Box */}
          <div className="today-campaign-bottom-bar-exact">
            <div className="today-status-info-left">
              <span className="today-day-prefix">Today ({currentTodayItem.label}):</span>
              <span className={`today-campaign-state ${isMarketingLiveToday ? 'state-live' : 'state-off'}`}>
                <span className="bullet-dot">●</span>
                {isMarketingLiveToday
                  ? (isTodayBooked
                    ? `Lead Delivery is LIVE (Today's ${currencySymbol}${dailySpend} Paid & Booked ✓)`
                    : 'Lead Delivery is LIVE (Active Schedule)')
                  : isTodayBooked
                  ? `Lead Delivery is PAUSED by You — Today is Already Paid ✓ (Click Resume Above for ${currencySymbol}0)`
                  : walletBalance < dailySpend
                  ? `Lead Delivery is OFF (Top Up ${currencySymbol}${dailySpend} to Activate Today)`
                  : 'Lead Delivery is OFF (Wallet Funded — Click Start to Activate Today)'}
              </span>
              {isTodayBooked && (
                <span className="pill-ad-booked-badge">
                  {customer.adCampaignActive ? '🎯 Paid & Delivering' : '✓ Today Paid'}
                </span>
              )}
              {fundedRunwayDays > 0 && !isTodayBooked && (
                <span className="pill-ad-booked-badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #10b981' }}>
                  ✓ {fundedRunwayDays} {fundedRunwayDays === 1 ? 'Day' : 'Days'} Funded
                </span>
              )}
            </div>

            <div className="today-budget-actions-right">
              <div className="today-ad-budget-text-wrap">
                <span className="budget-sub-label">Today&apos;s Growth Budget:</span>
                <strong className="budget-val-purple">{currencySymbol}{dailySpend}</strong>
                <span className="budget-per-day">/day</span>
              </div>
              <button
                type="button"
                onClick={onOpenSetDailyLimit}
                className="btn-set-amount-purple-pill"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span>Set Amount (Min {currencySymbol}{savedCurrency === 'USD' ? 10 : 300})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Overall Performance */}
      <div className="overall-performance-master-card">
        <div className="perf-master-header">
          <div>
            <h2>Overall Performance</h2>
            <p className="perf-master-sub">
              Real-time inbound buyer enquiries, response rate &amp; unread queue
            </p>
          </div>
        </div>

        <div className="perf-three-stat-grid">
          {/* Total Enquiries */}
          <div className="perf-box-card" onClick={() => onNavigate('leads')}>
            <span className="perf-box-label">Total Enquiries</span>
            <div className="perf-box-number">{totalLeadsCount.toLocaleString('en-IN')}</div>
            <div className="perf-box-today text-green">+{todayLeadsCount} Today</div>
            <div className="perf-box-records">{totalLeadsCount} live records in feed</div>
          </div>

          {/* Responded */}
          <div className="perf-box-card" onClick={() => onNavigate('followups')}>
            <span className="perf-box-label">Responded / Follow-up</span>
            <div className="perf-box-number">{respondedLeadsCount.toLocaleString('en-IN')}</div>
            <div className="perf-box-today text-emerald">{responseRatePct}% {totalLeadsCount > 0 ? 'Addressed' : 'Active'}</div>
            <div className="perf-box-records">✓ {respondedLeadsCount} of {totalLeadsCount} contacted</div>
          </div>

          {/* Unread Enquiries (100% Real Metric — replaces hardcoded 02m:15s) */}
          <div className="perf-box-card" onClick={() => onNavigate('leads')}>
            <span className="perf-box-label">Unread Enquiries</span>
            <div className="perf-box-number">{unreadEnquiriesCount.toLocaleString('en-IN')}</div>
            <div className="perf-box-today text-gold" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <span>{unreadEnquiriesCount === 0 ? '✓ All Caught Up' : '⚡ Needs Call / WhatsApp'}</span>
            </div>
            <div className="perf-box-records">Click to view &amp; filter by date</div>
          </div>
        </div>
      </div>

      {/* 5. Promotional Banner Image — Redirects to https://emperorsmartsolutions.com/ */}
      <a
        href="https://emperorsmartsolutions.com/"
        target="_blank"
        rel="noopener noreferrer"
        title="Visit Emperor Smart Solutions — https://emperorsmartsolutions.com/"
        style={{
          display: 'block',
          width: '100%',
          borderRadius: '18px',
          overflow: 'hidden',
          marginBottom: '24px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 10px 30px -8px rgba(15, 23, 42, 0.22)',
          textDecoration: 'none',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          cursor: 'pointer',
          position: 'relative',
          background: '#0a0d2c',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 16px 36px -8px rgba(79, 70, 229, 0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 10px 30px -8px rgba(15, 23, 42, 0.22)';
        }}
      >
        <img
          src={emperorBannerImg}
          alt="Emperor Smart Solutions — Custom Web, App & Enterprise Software Development (https://emperorsmartsolutions.com/)"
          style={{
            width: '100%',
            maxHeight: '230px',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
          }}
        />
      </a>

      {/* 6. Recent Enquiries Preview (Latest 5 — Full Date-Filtered Pipeline lives in My Leads) */}
      <div className="recent-priority-enquiries-panel">
        <div className="priority-panel-header">
          <div>
            <h2>Latest 5 Buyer Enquiries</h2>
            <div className="realtime-inbound-tag">Real-Time Preview</div>
            <p className="priority-panel-desc">
              Quick preview of your 5 most recent numbers. Open My Leads for date-range filters &amp; follow-ups.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('leads')}
            className="btn-all-leads-arrow"
          >
            View All My Leads ({totalLeadsCount}) &amp; Date Filters &rarr;
          </button>
        </div>

        {/* Minimal Preview Table */}
        <div style={{ marginBottom: 20 }}>
          <SmartTable
            title="Latest Enquiries"
            defaultPageSize={5}
            minimal
            exportFilename="latest-enquiries"
          >
            <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Prospect Mobile</th>
                  <th>Access / Gate Status</th>
                  <th>Received Time</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentPreviewLeads.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="proper-list-empty-state" style={{ padding: '32px 20px' }}>
                        <div className="empty-icon">
                          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </div>
                        <h3>No active enquiries yet</h3>
                        <p>Verified buyer mobile numbers will appear here as soon as they are dispatched.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentPreviewLeads.map((item, idx) => {
                    const hasDialablePhone = Boolean(item.phone && !/[*•X]/i.test(String(item.phone)));
                    const isUnmasked =
                      unmaskedLeads[item.id] !== undefined
                        ? Boolean(unmaskedLeads[item.id])
                        : item.unmasked !== undefined
                        ? Boolean(item.unmasked)
                        : hasDialablePhone;
                    const displayPhone = formatMinimalMaskedPhone(item.phone, item.maskedPhone, isUnmasked);
                    const displayTime = formatMinimalDateTime(item.createdAt);
                    const cleanDigits = String(item.phone || '').replace(/[^\d]/g, '');
                    const waPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
                    const targetOrg = item.company || item.assignedCompany || customer?.companyName || customer?.name || 'Ad Mafia';
                    const waGreeting = `https://wa.me/${waPhone}?text=Hello,%20thank%20you%20for%20your%20inquiry%20with%20${encodeURIComponent(targetOrg)}.`;
                    const isInFollowUp = item.status === 'In Follow-up' || item.status === 'Callback';
                    const canContact = isUnmasked && hasDialablePhone;
                    const btnCompact = { height: 30, padding: '0 10px', fontSize: '0.76rem', borderRadius: 7 };

                    return (
                      <tr
                        key={item.id || `ov_lead_${idx}`}
                        className={!item.read ? 'am-unread-lead-row' : undefined}
                      >
                        {/* Col 1: Prospect Mobile */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <div
                              className={`phone-icon-circle ${isInFollowUp ? 'fup' : ''}`}
                              style={{ width: 34, height: 34, borderRadius: 10, position: 'relative' }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                              </svg>
                              {!item.read && (
                                <span
                                  aria-hidden="true"
                                  style={{
                                    position: 'absolute',
                                    top: -2,
                                    right: -2,
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#2563eb',
                                    border: '1.5px solid #ffffff',
                                  }}
                                />
                              )}
                            </div>

                            <div className="phone-text-wrap" style={{ gap: 3 }}>
                              <div className="phone-digits-line" style={{ flexWrap: 'wrap', gap: 6 }}>
                                <span className="phone-strong" style={{ fontSize: '0.94rem' }}>
                                  {displayPhone}
                                </span>
                                {item.unmasked === false && hasDialablePhone && (
                                  <button
                                    type="button"
                                    className="btn-phone-eye-toggle"
                                    onClick={() => togglePhoneReveal(item.id)}
                                    title={isUnmasked ? 'Hide phone number' : 'Reveal phone number'}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                  </button>
                                )}
                                {!item.read && <span className="unread-micro-tag">NEW</span>}
                              </div>
                              {isInFollowUp && (
                                <span
                                  className="fup-status-tag tone-pink"
                                  style={{
                                    background: '#fdf2f8',
                                    color: '#be185d',
                                    border: '1px solid #fbcfe8',
                                    padding: '1px 7px',
                                    borderRadius: 999,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    width: 'fit-content',
                                  }}
                                >
                                  In Follow-up
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Col 2: Access / Gate Status */}
                        <td>
                          {isFullyComplete ? (
                            <span className="proper-step-badge tone-emerald" style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>Active Lead ✓</span>
                            </span>
                          ) : isPaymentDone ? (
                            <span className="proper-step-badge tone-blue" style={{ background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                              <span>Step 2 Required</span>
                            </span>
                          ) : (
                            <span className="proper-step-badge tone-amber">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.5">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              <span>Step 1 Required</span>
                            </span>
                          )}
                        </td>

                        {/* Col 3: Received Time */}
                        <td>
                          <div className="time-display-wrap">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span>{displayTime}</span>
                          </div>
                        </td>

                        {/* Col 4: Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div className="list-actions-group" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            {/* 1. Call */}
                            {canContact ? (
                              <a
                                href={`tel:${item.phone}`}
                                className="btn-list-action call"
                                style={btnCompact}
                                title={`Call ${displayPhone}`}
                                onClick={() => handleMarkLeadRead(item)}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                                <span>Call</span>
                              </a>
                            ) : (
                              <button
                                type="button"
                                className="btn-list-action call"
                                disabled
                                style={{ ...btnCompact, opacity: 0.5, cursor: 'not-allowed' }}
                                title="Unlock prospect contact to initiate call"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <span>Call</span>
                              </button>
                            )}

                            {/* 2. Chat */}
                            {canContact ? (
                              <a
                                href={waGreeting}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-list-action chat"
                                style={btnCompact}
                                title="Chat on WhatsApp"
                                onClick={() => handleMarkLeadRead(item)}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                </svg>
                                <span>Chat</span>
                              </a>
                            ) : (
                              <button
                                type="button"
                                className="btn-list-action chat"
                                disabled
                                style={{ ...btnCompact, opacity: 0.5, cursor: 'not-allowed' }}
                                title="Unlock prospect contact to chat on WhatsApp"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <span>Chat</span>
                              </button>
                            )}

                            {/* 3. In Follow-up */}
                            <button
                              type="button"
                              className={`btn-list-action followup ${isInFollowUp ? 'in-fup' : ''}`}
                              style={btnCompact}
                              onClick={() => handleMoveToFollowUp(item.id)}
                              title={isInFollowUp ? 'Already in Follow-ups' : 'Move lead to Follow-ups'}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              <span>In Follow-up</span>
                            </button>

                            {/* 4. Read (Permanent: once read, stays read) */}
                            <button
                              type="button"
                              className={`btn-list-action read ${item.read ? 'is-read' : ''}`}
                              style={{
                                ...btnCompact,
                                ...(item.read ? { cursor: 'default', opacity: 0.85 } : {}),
                              }}
                              onClick={() => handleMarkLeadRead(item)}
                              disabled={Boolean(item.read)}
                              title={item.read ? 'Lead Read' : 'Mark as Read'}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                {item.read ? (
                                  <polyline points="20 6 9 17 4 12" />
                                ) : (
                                  <>
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </>
                                )}
                              </svg>
                              <span>{item.read ? 'Read ✓' : 'Mark Read'}</span>
                            </button>

                            {/* 5. Drop */}
                            <button
                              type="button"
                              className="btn-list-action drop"
                              style={btnCompact}
                              onClick={() => handleDropLead(item.id)}
                              title="Drop lead and remove from active pipeline"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="8.5" cy="7" r="4" />
                                <line x1="23" y1="11" x2="17" y2="11" />
                              </svg>
                              <span>Drop</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </SmartTable>
        </div>

        {/* Footer Guarantee Bar */}
        <div className="leads-verified-footer-container">
          <div className="verified-intent-tag-text">
            All leads are verified with phone, locality &amp; requirement intent tags.
          </div>
          <button
            type="button"
            onClick={() => onNavigate('leads')}
            className="btn-open-dedicated-hub-pill"
          >
            Open Dedicated Lead Hub ({totalLeadsCount} Total Leads)
          </button>
        </div>
      </div>
    </div>
  );
}

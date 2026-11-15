import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, ExternalLink, BellRing, Send, X } from 'lucide-react';
import crmApi, { getActiveAuthToken } from '../services/crmApi';
import { subscribeToRealtimeNotifications, enableBrowserPushNotifications } from '../services/firebaseClient';
import { useAdminTheme } from '../utils/adminTheme';

/**
 * Universal Real-Time Notification Bell (Google Firebase FCM + Live SSE)
 * Mounted across Super Admin, Sales, Marketing, Graphics, and Customer Portal headers.
 */
export default function NotificationBell({ variant = 'light', adminThemeAware = false, onNavigateLink }) {
  const { isDark: adminDark } = useAdminTheme({ syncDocument: false });
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [testPushSent, setTestPushSent] = useState(false);
  const [pushPerm, setPushPerm] = useState(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [toastItem, setToastItem] = useState(null);
  const wrapRef = useRef(null);

  const isItemRead = (item) => Boolean(item?.isRead || item?.read);

  const loadNotifications = async () => {
    if (!getActiveAuthToken()) return;
    try {
      const res = await crmApi.getNotifications(25);
      if (Array.isArray(res?.notifications)) {
        setItems(res.notifications);
      }
      if (typeof res?.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch (err) {
      // Quietly ignore if unauthenticated
    }
  };

  useEffect(() => {
    loadNotifications();
    const unsubscribe = subscribeToRealtimeNotifications({
      onStatusChange: (connected) => setLiveConnected(connected),
      onNotification: (notif) => {
        const normalized = { ...notif, isRead: false };
        setItems((prev) => [normalized, ...prev.filter((item) => item.id !== normalized.id)].slice(0, 30));
        setUnreadCount((prev) => prev + 1);
        setToastItem(normalized);
        setTimeout(() => {
          setToastItem((curr) => (curr && curr.id === normalized.id ? null : curr));
        }, 7500);
      },
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handleEnablePush = async () => {
    const res = await enableBrowserPushNotifications({ promptIfDefault: true });
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPerm(Notification.permission);
    }
    return res;
  };

  const handleTestPush = async () => {
    if (testingPush) return;
    setTestingPush(true);
    setTestPushSent(false);
    try {
      if (pushPerm === 'default') {
        await handleEnablePush();
      } else if (pushPerm === 'granted') {
        await enableBrowserPushNotifications({ promptIfDefault: false }).catch(() => {});
      }
      await crmApi.sendTestNotification();
      setTestPushSent(true);
      await loadNotifications();
      setTimeout(() => setTestPushSent(false), 3000);
    } catch (e) {
      // Ignore transient errors
    } finally {
      setTestingPush(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await crmApi.markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true, read: true })));
      setUnreadCount(0);
    } catch (e) {}
  };

  const handleSelectItem = async (item) => {
    if (!isItemRead(item) && item.id) {
      try {
        await crmApi.markNotificationRead(item.id);
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true, read: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (e) {}
    }
    setOpen(false);
    if (item.deepLink) {
      if (onNavigateLink) {
        onNavigateLink(item.deepLink);
      } else {
        window.location.href = item.deepLink;
      }
    }
  };

  const isInsideAdminScope =
    adminThemeAware ||
    (typeof document !== 'undefined' && Boolean(wrapRef.current?.closest?.('.adm-theme-scope')));
  const isDark = variant === 'dark' || (isInsideAdminScope && adminDark);
  const surfaceBg = isDark ? '#111827' : '#ffffff';
  const headerBg = isDark ? '#0b1120' : '#f8fafc';
  const borderCol = isDark ? '#1e293b' : '#e2e8f0';
  const rowBorderCol = isDark ? 'rgba(148, 163, 184, 0.12)' : '#f1f5f9';
  const titleCol = isDark ? '#f8fafc' : '#0f172a';
  const bodyCol = isDark ? '#cbd5e1' : '#475569';
  const mutedCol = isDark ? '#94a3b8' : '#64748b';

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      {pushPerm === 'default' && (
        <button
          type="button"
          className="am-notif-enable-pill"
          onClick={handleEnablePush}
          title="Enable browser & desktop push notifications"
          style={{
            background: '#eff6ff',
            color: '#1d4ed8',
            border: '1px solid #bfdbfe',
            borderRadius: '9px',
            padding: '6px 10px',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            whiteSpace: 'nowrap',
          }}
        >
          <BellRing size={13} /> Enable Alerts
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) loadNotifications();
        }}
        title="Real-Time Notifications (Firebase FCM & Live Stream)"
        aria-label="Notifications"
        style={{
          position: 'relative',
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          border: isDark ? '1px solid rgba(255,255,255,0.16)' : '1px solid #cbd5e1',
          background: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff',
          color: isDark ? '#f8fafc' : '#334155',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              minWidth: '18px',
              height: '18px',
              padding: '0 5px',
              borderRadius: '999px',
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '0.68rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #ffffff',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <span
          title={liveConnected ? 'Live Stream Connected' : 'Sync Mode'}
          style={{
            position: 'absolute',
            bottom: '3px',
            right: '3px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: liveConnected ? '#10b981' : '#94a3b8',
          }}
        />
      </button>

      {/* Instant Floating Toast for New Push Event */}
      {toastItem && !open && (
        <div
          className="am-notif-toast"
          onClick={() => {
            const item = toastItem;
            setToastItem(null);
            handleSelectItem(item);
          }}
          style={{
            position: 'fixed',
            top: '72px',
            right: '20px',
            zIndex: 99999,
            width: '340px',
            background: '#0f172a',
            color: '#f8fafc',
            padding: '13px 15px',
            borderRadius: '13px',
            boxShadow: '0 20px 45px rgba(15, 23, 42, 0.42)',
            border: '1px solid rgba(16, 185, 129, 0.55)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
              ● Live Push Notification
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setToastItem(null);
              }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '3px' }}>{toastItem.title}</div>
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45 }}>{toastItem.body}</div>
        </div>
      )}

      {open && (
        <div
          className="am-notif-dropdown"
          style={{
            position: 'absolute',
            top: '44px',
            right: 0,
            width: 'min(370px, 92vw)',
            maxHeight: '470px',
            background: surfaceBg,
            borderRadius: '14px',
            boxShadow: isDark ? '0 24px 56px rgba(0, 0, 0, 0.55)' : '0 20px 50px rgba(15, 23, 42, 0.22)',
            border: `1px solid ${borderCol}`,
            zIndex: 99995,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            color: titleCol,
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: `1px solid ${rowBorderCol}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: headerBg,
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '0.9rem', color: titleCol }}>Notifications</strong>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: liveConnected ? (isDark ? 'rgba(16, 185, 129, 0.16)' : '#dcfce7') : (isDark ? '#1e293b' : '#f1f5f9'),
                  color: liveConnected ? (isDark ? '#34d399' : '#15803d') : mutedCol,
                }}
              >
                {liveConnected ? 'LIVE' : 'SYNC'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleTestPush}
                disabled={testingPush}
                title="Send a real Firebase FCM + Live Stream test notification to this device"
                style={{
                  background: testPushSent ? '#dcfce7' : '#eff6ff',
                  border: testPushSent ? '1px solid #86efac' : '1px solid #bfdbfe',
                  borderRadius: '6px',
                  padding: '4px 9px',
                  color: testPushSent ? '#15803d' : '#1d4ed8',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: testingPush ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap',
                }}
              >
                <Send size={11} /> {testingPush ? 'Sending…' : testPushSent ? 'Sent ✓' : 'Test Push'}
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <CheckCheck size={14} /> Read all
                </button>
              )}

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {pushPerm === 'default' && (
            <div
              style={{
                padding: '9px 14px',
                background: '#eff6ff',
                borderBottom: '1px solid #dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '0.76rem', color: '#1e40af', fontWeight: 600 }}>
                Enable instant browser push alerts (FCM)
              </span>
              <button
                type="button"
                onClick={handleEnablePush}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 9px',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap',
                }}
              >
                <BellRing size={12} /> Enable
              </button>
            </div>
          )}

          {pushPerm === 'denied' && (
            <div
              style={{
                padding: '8px 14px',
                background: '#fef2f2',
                borderBottom: '1px solid #fecaca',
                fontSize: '0.74rem',
                color: '#b91c1c',
                fontWeight: 600,
              }}
            >
              Browser OS notifications are blocked in site settings (click the lock/tune icon in your address bar ➔ Notifications ➔ Allow).
            </div>
          )}

          <div className="am-notif-scroll-list" style={{ overflowY: 'auto', maxHeight: '360px' }}>
            {items.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: mutedCol, fontSize: '0.84rem' }}>
                No notifications yet. Real-time lead, wallet, and account events will appear here instantly.
              </div>
            ) : (
              items.map((item) => {
                const read = isItemRead(item);
                return (
                  <div
                    key={item.id || item._id}
                    onClick={() => handleSelectItem(item)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: `1px solid ${rowBorderCol}`,
                      background: read ? surfaceBg : (isDark ? 'rgba(59, 130, 246, 0.12)' : '#f0f9ff'),
                      cursor: 'pointer',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        marginTop: '6px',
                        flexShrink: 0,
                        background: read ? (isDark ? '#475569' : '#cbd5e1') : '#3b82f6',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '3px' }}>
                        <strong style={{ fontSize: '0.83rem', color: titleCol }}>{item.title}</strong>
                        {item.deepLink && <ExternalLink size={12} color={mutedCol} style={{ flexShrink: 0 }} />}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: bodyCol, lineHeight: 1.45 }}>{item.body}</p>
                      {item.createdAt && (
                        <span style={{ fontSize: '0.69rem', color: mutedCol, marginTop: '4px', display: 'inline-block' }}>
                          {new Date(item.createdAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .am-notif-enable-pill {
            display: none !important;
          }
          .am-notif-dropdown {
            position: fixed !important;
            top: 60px !important;
            left: 10px !important;
            right: 10px !important;
            width: auto !important;
            max-width: none !important;
            max-height: calc(100dvh - 80px) !important;
          }
          .am-notif-toast {
            left: 10px !important;
            right: 10px !important;
            width: auto !important;
          }
        }
      `}</style>
    </div>
  );
}

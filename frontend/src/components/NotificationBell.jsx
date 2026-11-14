import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, ExternalLink, BellRing, X } from 'lucide-react';
import crmApi, { getActiveAuthToken } from '../services/crmApi';
import { subscribeToRealtimeNotifications, enableBrowserPushNotifications } from '../services/firebaseClient';

/**
 * Universal Real-Time Notification Bell (FCM + SSE)
 * Mounted across Super Admin, Sales, Marketing, Graphics, and Customer Portal headers.
 */
export default function NotificationBell({ variant = 'light', onNavigateLink }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const [pushPerm, setPushPerm] = useState(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [toastItem, setToastItem] = useState(null);
  const wrapRef = useRef(null);

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
        setItems((prev) => [notif, ...prev.filter((item) => item.id !== notif.id)].slice(0, 30));
        setUnreadCount((prev) => prev + 1);
        setToastItem(notif);
        setTimeout(() => {
          setToastItem((curr) => (curr && curr.id === notif.id ? null : curr));
        }, 5500);
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
    const res = await enableBrowserPushNotifications();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPerm(Notification.permission);
    }
    return res;
  };

  const handleMarkAllRead = async () => {
    try {
      await crmApi.markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {}
  };

  const handleSelectItem = async (item) => {
    if (!item.read && item.id) {
      try {
        await crmApi.markNotificationRead(item.id);
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
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

  const isDark = variant === 'dark';

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
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
          title={liveConnected ? 'Live Stream Connected' : 'Polling Mode'}
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
          onClick={() => {
            const item = toastItem;
            setToastItem(null);
            handleSelectItem(item);
          }}
          style={{
            position: 'fixed',
            top: '70px',
            right: '20px',
            zIndex: 9998,
            width: '320px',
            background: '#0f172a',
            color: '#f8fafc',
            padding: '12px 14px',
            borderRadius: '12px',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.35)',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
              ● Live Alert
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
          <div style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: '2px' }}>{toastItem.title}</div>
          <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.4 }}>{toastItem.body}</div>
        </div>
      )}

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '44px',
            right: 0,
            width: 'min(360px, 92vw)',
            maxHeight: '460px',
            background: '#ffffff',
            borderRadius: '14px',
            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.22)',
            border: '1px solid #e2e8f0',
            zIndex: 9995,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            color: '#0f172a',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Notifications</strong>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: liveConnected ? '#dcfce7' : '#f1f5f9',
                  color: liveConnected ? '#15803d' : '#64748b',
                }}
              >
                {liveConnected ? 'LIVE' : 'SYNC'}
              </span>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
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

          <div style={{ overflowY: 'auto', maxHeight: '360px' }}>
            {items.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                No notifications yet. Real-time lead, wallet, and account events will appear here instantly.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id || item._id}
                  onClick={() => handleSelectItem(item)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid #f1f5f9',
                    background: item.read ? '#ffffff' : '#f0f9ff',
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
                      background: item.read ? '#cbd5e1' : '#2563eb',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '3px' }}>
                      <strong style={{ fontSize: '0.83rem', color: '#0f172a' }}>{item.title}</strong>
                      {item.deepLink && <ExternalLink size={12} color="#64748b" style={{ flexShrink: 0 }} />}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#475569', lineHeight: 1.45 }}>{item.body}</p>
                    {item.createdAt && (
                      <span style={{ fontSize: '0.69rem', color: '#94a3b8', marginTop: '4px', display: 'inline-block' }}>
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
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


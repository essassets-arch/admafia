import { useState, useEffect } from 'react';

/**
 * SSR-safe responsive viewport hook.
 * Used to mount single-instance interactive header widgets (such as NotificationBell)
 * in the active visible bar (mobile top bar vs desktop top bar) without opening
 * duplicate SSE streams or hiding controls behind `display: none`.
 */
export function useIsMobileViewport(breakpoint = 960) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= breakpoint;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia ? window.matchMedia(`(max-width: ${breakpoint}px)`) : null;

    const handleChange = () => {
      setIsMobile(window.innerWidth <= breakpoint);
    };

    handleChange();

    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      window.addEventListener('resize', handleChange);
      return () => {
        mq.removeEventListener('change', handleChange);
        window.removeEventListener('resize', handleChange);
      };
    }

    window.addEventListener('resize', handleChange);
    return () => window.removeEventListener('resize', handleChange);
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobileViewport;

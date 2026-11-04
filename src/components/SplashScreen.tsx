import { useEffect, useRef, useState } from 'react';

/** Shown once per browser session (not again after logging out or on refresh in the same tab). */
const SEEN_KEY = 'botika_splash_seen';

export function splashSeen(): boolean {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return true; } // storage blocked: skip it
}

/**
 * Animated splash screen before the Login page: the BulanBotikaCare logo zooms in at the center, then the system
 * name and place appear, a short progress line fills, and the screen fades out to reveal the Login page.
 * Tap / click, Enter, Space or Escape skips it. With "reduce motion" turned on it is shorter and without zooming.
 */
export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const finish = () => {
    if (done.current) return;
    done.current = true;
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ }
    setLeaving(true);
    window.setTimeout(onDone, reduce ? 250 : 600); // matches the fade-out below
  };

  useEffect(() => {
    const timer = window.setTimeout(finish, reduce ? 1400 : 2900);
    // Enter / Space / Escape skip it (and do not reach the login form under it, e.g. an empty submit).
    const onKey = (e: KeyboardEvent) => { if (['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); finish(); } };
    document.addEventListener('keydown', onKey, true);
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`splash ${leaving ? 'splash-leaving' : ''} ${reduce ? 'splash-reduced' : ''}`} onClick={finish}
      role="status" aria-live="polite" aria-label="BulanBotikaCare is loading">
      <div className="splash-glow" aria-hidden="true" />
      <div className="splash-content">
        <div className="splash-logo" aria-hidden="true">
          <span className="splash-ring" />
          <span className="splash-ring splash-ring-2" />
          <svg viewBox="0 0 96 96" className="splash-mark">
            <rect x="6" y="6" width="84" height="84" rx="24" />
            <path d="M40 24h16v16h16v16H56v16H40V56H24V40h16z" />
          </svg>
        </div>
        <h1 className="splash-name">Bulan<span>BotikaCare</span></h1>
        <p className="splash-place">Botika ng Bayan · Bulan, Sorsogon</p>
        <div className="splash-progress" aria-hidden="true"><span /></div>
      </div>
      <span className="splash-skip" aria-hidden="true">Tap to skip</span>
    </div>
  );
}

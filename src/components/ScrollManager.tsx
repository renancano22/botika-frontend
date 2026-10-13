import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { jumpToTop, jumpWhenReady } from '../scroll';

/** Scroll position of each visited page (by history entry), so Back returns to the same spot. */
const positions = new Map<string, number>();

/**
 * Makes navigation land in the right place right away:
 *  - opening another page starts at its top (not halfway down where the last page was);
 *  - a link with #section jumps straight to that section (waiting for it to load) and highlights it;
 *  - Back / Forward return to where the user was on that page;
 *  - changing a filter or tab on the same page keeps the position.
 */
export default function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const currentKey = useRef(location.key);
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // Remember where the user is on the current page.
  useEffect(() => {
    const key = location.key;
    const save = () => { if (currentKey.current === key) positions.set(key, window.scrollY); };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [location.key]);

  useLayoutEffect(() => {
    currentKey.current = location.key;
    const samePage = previousPath.current === location.pathname;
    previousPath.current = location.pathname;

    if (location.hash) {
      jumpWhenReady(decodeURIComponent(location.hash.slice(1)));
      return;
    }
    if (navType === 'POP') {
      const y = positions.get(location.key);
      if (y === undefined) { if (!samePage) jumpToTop(); return; }
      // The page may still be loading its data: keep trying for a moment until it is tall enough.
      const deadline = performance.now() + 1500;
      const restore = () => {
        window.scrollTo({ top: y, left: 0, behavior: 'auto' });
        if (Math.abs(window.scrollY - y) > 2 && performance.now() < deadline) requestAnimationFrame(restore);
      };
      restore();
      return;
    }
    if (!samePage) jumpToTop();
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

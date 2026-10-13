/**
 * Navigation scrolling helpers.
 * The page jumps straight to the destination (no long visible scroll), then the destination
 * fades in with a short highlight so the user sees where they landed.
 */

/** Height of the sticky top bar plus a little space, so the destination is not hidden under it. */
const TOP_OFFSET = 76;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Short fade-in + highlight ring on the element the user was taken to. */
export function flash(el: Element) {
  if (prefersReducedMotion()) return;
  el.classList.remove('jump-flash');
  void (el as HTMLElement).offsetWidth; // restart the animation if it is already running
  el.classList.add('jump-flash');
  window.setTimeout(() => el.classList.remove('jump-flash'), 1000);
}

/** Jumps directly to an element (or the element with this id) and highlights it. Returns false if not found. */
export function jumpTo(target: Element | string | null | undefined, { highlight = true } = {}): boolean {
  const el = typeof target === 'string' ? document.getElementById(target.replace(/^#/, '')) : target;
  if (!el) return false;
  const top = el.getBoundingClientRect().top + window.scrollY - TOP_OFFSET;
  window.scrollTo({ top: Math.max(0, top), left: 0, behavior: 'auto' });
  if (highlight) flash(el);
  return true;
}

/** Waits (up to `timeoutMs`) for an element that is still loading, then jumps to it. */
export function jumpWhenReady(id: string, timeoutMs = 3000) {
  const deadline = performance.now() + timeoutMs;
  const tryJump = () => {
    if (jumpTo(id)) return;
    if (performance.now() < deadline) requestAnimationFrame(tryJump);
  };
  tryJump();
}

/** Jumps to the top of the page instantly. */
export function jumpToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

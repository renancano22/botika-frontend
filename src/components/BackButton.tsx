import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useGoBack } from '../hooks';

/** In-app history index kept by React Router (0 = first page opened in this tab). */
export const hasPreviousPage = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

/**
 * Links in the main navigation (side menu, logo, profile picture) open pages with this state, so a main
 * section opened from the menu shows no back arrow. Pages opened from inside another page (a dashboard card,
 * an alert, a "View all" link) show one.
 */
export const NAV_STATE = { nav: true } as const;

/**
 * "<" back button: its own row at the upper-left of the page, above the page heading and outside any
 * card or coloured banner (the same place on every page, desktop and mobile). Icon only, no text.
 *  - Nested pages (details, forms, edit): always shown. Goes to the previous page in the history (with its
 *    filters and search); when the page was opened directly, goes to `fallback` (its parent page).
 *  - linkedOnly (main sections such as Requests or Medicine List): shown only when the page was opened
 *    from inside another page, never when opened from the side menu or directly.
 *  - onClick: own back action (e.g. leaving Edit Profile without saving).
 */
export default function BackButton({ fallback = '/dashboard', light = false, linkedOnly = false, onClick, label = 'Go back' }: {
  fallback?: string; light?: boolean; linkedOnly?: boolean; onClick?: () => void; label?: string;
}) {
  const goBack = useGoBack(fallback);
  const location = useLocation();
  // Decided when the page opens: later filter changes on the same page keep it as it was.
  const [openedFromPage] = useState(() => hasPreviousPage() && !(location.state as { nav?: boolean } | null)?.nav);
  if (linkedOnly && !openedFromPage) return null;
  return (
    <div className="page-back">
      <button type="button" className={`back-btn ${light ? 'back-btn-light' : ''}`} onClick={onClick ?? goBack} aria-label={label} title={label}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
    </div>
  );
}

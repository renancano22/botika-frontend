import { useGoBack } from '../hooks';

/** In-app history index kept by React Router (0 = first page opened in this tab). */
export const hasPreviousPage = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

/**
 * The same back button on every page: only a "<" chevron, top-left beside the page title.
 * Goes to the previous page in the browser history (its filters, tabs and scroll come back with it);
 * when the page was opened directly (no previous in-app page) it goes to `fallback` instead.
 *  - light: white version for the green page headers
 *  - onlyWithHistory: hide it when there is no previous page (dashboards are the home page)
 *  - onClick: own back action (e.g. leaving Edit Profile)
 */
export default function BackButton({ fallback = '/dashboard', light = false, onlyWithHistory = false, onClick, label = 'Go back' }: {
  fallback?: string; light?: boolean; onlyWithHistory?: boolean; onClick?: () => void; label?: string;
}) {
  const goBack = useGoBack(fallback);
  if (onlyWithHistory && !hasPreviousPage()) return null;
  return (
    <button type="button" className={`back-btn ${light ? 'back-btn-light' : ''}`} onClick={onClick ?? goBack} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

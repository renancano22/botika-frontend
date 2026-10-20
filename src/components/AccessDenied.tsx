import { Link } from 'react-router-dom';
import { useGoBack } from '../hooks';
import { useAuth } from '../auth';
import { FEATURE_NAME } from '../permissions';
import { ROLE_LABEL } from '../api';

const LOCK = 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v2';

/**
 * Shown instead of a page or feature the user is not allowed to use
 * (their role cannot use it, or the administrator turned it off in User Permissions).
 */
export default function AccessDenied({ feature }: { feature?: string }) {
  const { user } = useAuth();
  const goBack = useGoBack('/dashboard');
  const name = feature ? FEATURE_NAME[feature.split('|')[0]] : undefined;
  return (
    <div className="page page-narrow">
      <section className="card access-denied" role="alert" aria-labelledby="ad-title">
        <span className="access-denied-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={LOCK} /></svg>
        </span>
        <span className="access-denied-code">Error 403</span>
        <h1 id="ad-title">Access Denied</h1>
        <p>
          You do not have permission to access {name ?? 'this page'}.
          {user && user.role !== 'admin' && <> Your account ({ROLE_LABEL[user.role]}) is not allowed to use this feature.</>}
        </p>
        <p className="muted small">If you believe you need access, please contact the Botika ng Bayan administrator.</p>
        <div className="access-denied-actions">
          <button type="button" className="btn btn-outline" onClick={goBack}>Go back</button>
          <Link className="btn" to="/dashboard">Go to dashboard</Link>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api, formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Loading } from '../../components/ui';
import BackButton from '../../components/BackButton';
import { confirmAction, LoadError, toast } from '../../components/feedback';
import type { PermissionItem, RolePermissions } from '../../types';

interface PermissionsData {
  roles: RolePermissions[];
  admin_only: { module: string; label: string }[];
}

const ROLE_ICON: Record<string, string> = {
  staff: 'M12 3v18M3 12h18M7 7h10v10H7z',
  resident: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
};
const LOCK = 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z';
const SHIELD = 'M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6zM9 12l2 2 4-4';

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

/** Groups permissions by module, keeping the order of the list. */
function byModule(items: PermissionItem[]): [string, PermissionItem[]][] {
  const groups = new Map<string, PermissionItem[]>();
  items.forEach((p) => groups.set(p.module, [...(groups.get(p.module) ?? []), p]));
  return [...groups.entries()];
}

/**
 * Admin → User Permissions: turn features on or off for Pharmacy Staff and Residents.
 * The server checks the same permissions on every request; the administrator always has full access.
 */
export default function Permissions() {
  const { data, errorInfo, loading, reload, setData } = useApi<PermissionsData>('/permissions');
  const [role, setRole] = useState<'staff' | 'resident'>('staff');
  // Changes not saved yet: permission key → allowed.
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const current = data?.roles.find((r) => r.role === role);
  const value = (p: PermissionItem) => draft[p.key] ?? p.allowed;
  const changes = useMemo(() => current?.permissions.filter((p) => draft[p.key] !== undefined && draft[p.key] !== p.allowed) ?? [], [current, draft]);
  const allowedCount = current?.permissions.filter(value).length ?? 0;
  const isDefault = current?.permissions.every((p) => p.allowed === p.default) ?? true;

  // Leaving the page with unsaved changes asks the browser to confirm.
  useEffect(() => {
    if (!changes.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes.length]);

  const switchRole = async (next: 'staff' | 'resident') => {
    if (next === role) return;
    if (changes.length) {
      const leave = await confirmAction({
        tone: 'warning',
        title: 'Discard unsaved changes?',
        message: `You changed ${changes.length} permission${changes.length === 1 ? '' : 's'} for ${current?.label} that ${changes.length === 1 ? 'is' : 'are'} not saved yet.`,
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
      });
      if (!leave) return;
    }
    setDraft({});
    setRole(next);
  };

  // Related features (the server applies the same rule): turning a feature on also turns on the one it is
  // used from, and turning that one off also turns off the features that need it.
  const byKey = useMemo(() => Object.fromEntries((current?.permissions ?? []).map((p) => [p.key, p])), [current]);
  const dependents = (key: string) => (current?.permissions ?? []).filter((x) => x.requires?.includes(key));
  const toggle = (p: PermissionItem) => {
    const next = !value(p);
    setDraft((d) => {
      const copy = { ...d };
      const set = (key: string, v: boolean) => {
        const item = byKey[key];
        if (!item) return;
        if (v === item.allowed) delete copy[key]; else copy[key] = v;
      };
      set(p.key, next);
      if (next) (p.requires ?? []).forEach((k) => set(k, true));
      if (!next) dependents(p.key).forEach((x) => set(x.key, false));
      return copy;
    });
  };

  const save = () => {
    if (!current || !changes.length || saving) return;
    const off = changes.filter((p) => !draft[p.key]);
    const on = changes.filter((p) => draft[p.key]);
    return confirmAction({
      tone: off.length ? 'warning' : 'primary',
      title: `Save permissions for ${current.label}?`,
      message: <>These changes apply to <strong>every {current.label.toLowerCase()} account</strong> right away.</>,
      details: (
        <div className="perm-summary">
          {off.length > 0 && <p><strong>Turned off:</strong> {off.map((p) => p.label).join(', ')}</p>}
          {on.length > 0 && <p><strong>Turned on:</strong> {on.map((p) => p.label).join(', ')}</p>}
        </div>
      ),
      confirmLabel: 'Save changes',
      busyLabel: 'Saving…',
      onConfirm: async () => {
        setSaving(true);
        try {
          const res = await api.put<PermissionsData>(`/permissions/${current.role}`, {
            permissions: Object.fromEntries(changes.map((p) => [p.key, draft[p.key]])),
          });
          setData(res.data);
          setDraft({});
          toast.success('Permissions saved', { description: `${current.label} permissions were updated. ${changes.length} change${changes.length === 1 ? '' : 's'} applied.` });
        } finally { setSaving(false); }
      },
    });
  };

  const resetDefaults = () => {
    if (!current) return;
    return confirmAction({
      tone: 'warning',
      title: 'Reset to default permissions?',
      message: <>All {current.label.toLowerCase()} accounts get the standard access again (every feature of their role turned on).</>,
      confirmLabel: 'Reset to default',
      busyLabel: 'Resetting…',
      onConfirm: async () => {
        const res = await api.post<PermissionsData>(`/permissions/${current.role}/reset`);
        setData(res.data);
        setDraft({});
        toast.success('Permissions reset', { description: `${current.label} accounts now have the default access.` });
      },
    });
  };

  return (
    <div className="page perm-page">
      <BackButton linkedOnly />
      <header className="page-head">
        <div>
          <div className="page-title"><h1>User Permissions</h1></div>
          <p className="muted">Choose which features Pharmacy Staff and Residents can use. Turned-off features are hidden from their menu and blocked by the system.</p>
        </div>
      </header>

      {loading && !data ? <Loading /> : !data ? <LoadError error={errorInfo} onRetry={() => reload()} /> : <>
        <div className="perm-admin-note">
          <span className="perm-admin-icon"><Icon d={SHIELD} size={22} /></span>
          <div>
            <strong>Administrator — full access</strong>
            <p>The administrator can always use every feature, so the system can never be locked.</p>
          </div>
        </div>

        <div className="perm-roles" role="tablist" aria-label="User role">
          {data.roles.map((r) => {
            const count = r.permissions.filter((p) => (r.role === role ? value(p) : p.allowed)).length;
            return (
              <button key={r.role} type="button" role="tab" aria-selected={role === r.role}
                className={`perm-role ${role === r.role ? 'active' : ''}`} onClick={() => switchRole(r.role)}>
                <span className="perm-role-icon"><Icon d={ROLE_ICON[r.role]} /></span>
                <span className="perm-role-text">
                  <strong>{r.label}</strong>
                  <small>{count} of {r.permissions.length} features allowed</small>
                </span>
              </button>
            );
          })}
        </div>

        {current && (
          <section className="card perm-card" aria-label={`${current.label} permissions`}>
            <div className="perm-card-head">
              <div>
                <h2>{current.label}</h2>
                <p className="muted small">
                  {allowedCount} of {current.permissions.length} features allowed
                  {current.updated_at && ` · Last changed ${formatDate(current.updated_at, true)}${current.updated_by ? ` by ${current.updated_by}` : ''}`}
                </p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={resetDefaults} disabled={isDefault && !changes.length}>Reset to default</button>
            </div>

            {byModule(current.permissions).map(([module, items]) => (
              <div className="perm-group" key={module}>
                <h3>{module}</h3>
                <ul>
                  {items.map((p) => {
                    const on = value(p);
                    const changed = draft[p.key] !== undefined;
                    return (
                      <li key={p.key} className={`perm-row ${on ? '' : 'is-off'} ${changed ? 'is-changed' : ''}`}>
                        <div className="perm-text" id={`perm-${p.key}`}>
                          <strong>{p.label}{changed && <span className="perm-changed">Not saved</span>}</strong>
                          <span>{p.description}</span>
                          {(() => {
                            const needs = (p.requires ?? []).filter((k) => byKey[k]).map((k) => `“${byKey[k].label}”`);
                            if (!needs.length) return null;
                            const one = needs.length === 1;
                            return (
                              <small className="perm-needs">
                                Needs {one ? needs[0] : `${needs.slice(0, -1).join(', ')} and ${needs[needs.length - 1]}`} — turned on with {one ? 'it' : 'them'}, and off when {one ? 'it is' : 'either is'} off.
                              </small>
                            );
                          })()}
                        </div>
                        <button type="button" role="switch" aria-checked={on} aria-labelledby={`perm-${p.key}`}
                          className={`switch ${on ? 'on' : ''}`} onClick={() => toggle(p)} disabled={saving}>
                          <span className="switch-knob" />
                          <span className="switch-label">{on ? 'Allowed' : 'Off'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}

        <section className="card perm-card">
          <div className="perm-card-head">
            <div>
              <h2>Administrator only</h2>
              <p className="muted small">These features cannot be given to Pharmacy Staff or Residents.</p>
            </div>
          </div>
          <ul className="perm-locked">
            {data.admin_only.map((p) => (
              <li key={`${p.module}-${p.label}`}>
                <Icon d={LOCK} size={16} />
                <span><strong>{p.label}</strong> <small className="muted">· {p.module}</small></span>
              </li>
            ))}
          </ul>
        </section>

        {changes.length > 0 && (
          <div className="perm-savebar" role="region" aria-label="Unsaved changes">
            <span><strong>{changes.length}</strong> unsaved change{changes.length === 1 ? '' : 's'} for {current?.label}</span>
            <div>
              <button type="button" className="btn btn-outline" onClick={() => setDraft({})} disabled={saving}>Discard</button>
              <button type="button" className="btn" onClick={save} disabled={saving}>Save changes</button>
            </div>
          </div>
        )}
      </>}
    </div>
  );
}

import type { RegistrationForm } from './registration';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const REGISTRATION_DRAFT_KEY = 'botika_registration_draft_v1';
export const RESET_DRAFT_KEY = 'botika_reset_draft_v1';
const DRAFT_LIFETIME = 30 * 60 * 1000;
const CODE_LIFETIME = 10 * 60 * 1000;
const REGISTRATION_FIELDS = { name: 100, barangay: 100, address_line: 120, contact_no: 24, email: 255 } as const;
type RegistrationDetails = Pick<RegistrationForm, keyof typeof REGISTRATION_FIELDS>;

function browserStorage(): DraftStorage | null {
  try { return window.sessionStorage; } catch { return null; }
}
function remove(key: string, storage: DraftStorage | null) {
  try { storage?.removeItem(key); } catch { /* Storage can be disabled or full. */ }
}
function read(key: string, storage: DraftStorage | null, now: number): Record<string, unknown> | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)
      || value.updatedAt > now || now - value.updatedAt >= DRAFT_LIFETIME || !value.data || typeof value.data !== 'object') {
      remove(key, storage); return null;
    }
    return value.data;
  } catch { remove(key, storage); return null; }
}
function write(key: string, data: object, storage: DraftStorage | null, now: number) {
  try { storage?.setItem(key, JSON.stringify({ version: 1, updatedAt: now, data })); } catch { /* The form still works without storage. */ }
}

/** Explicit allowlist: passwords, confirmation, reset codes and validation approvals are never persisted. */
export function readRegistrationDraft(storage = browserStorage(), now = Date.now()): { details: RegistrationDetails; restored: boolean } {
  const data = read(REGISTRATION_DRAFT_KEY, storage, now);
  const details = Object.fromEntries(Object.entries(REGISTRATION_FIELDS).map(([key, limit]) => [key,
    typeof data?.[key] === 'string' ? (data[key] as string).slice(0, limit) : ''])) as RegistrationDetails;
  return { details, restored: Object.values(details).some(Boolean) };
}
export function saveRegistrationDraft(form: RegistrationDetails, storage = browserStorage(), now = Date.now()) {
  const details = Object.fromEntries(Object.entries(REGISTRATION_FIELDS).map(([key, limit]) => [key,
    String(form[key as keyof RegistrationDetails] ?? '').slice(0, limit)]));
  if (!Object.values(details).some(Boolean)) remove(REGISTRATION_DRAFT_KEY, storage);
  else write(REGISTRATION_DRAFT_KEY, details, storage, now);
}
export function readResetDraft(storage = browserStorage(), now = Date.now()) {
  const data = read(RESET_DRAFT_KEY, storage, now);
  const login = typeof data?.login === 'string' ? data.login.slice(0, 255) : '';
  const timestamp = typeof data?.requestedAt === 'number' && Number.isFinite(data.requestedAt) ? data.requestedAt : null;
  const validCodePeriod = !!login && timestamp !== null && timestamp <= now && now - timestamp < CODE_LIFETIME;
  return { login, requestedAt: validCodePeriod ? timestamp : null, expired: !!login && timestamp !== null && !validCodePeriod };
}
export function saveResetDraft(login: string, requestedAt: number | null, storage = browserStorage(), now = Date.now()) {
  if (!login) remove(RESET_DRAFT_KEY, storage);
  else write(RESET_DRAFT_KEY, { login: login.slice(0, 255), requestedAt }, storage, now);
}
export function clearRegistrationDraft(storage = browserStorage()) { remove(REGISTRATION_DRAFT_KEY, storage); }
export function clearResetDraft(storage = browserStorage()) { remove(RESET_DRAFT_KEY, storage); }
export function clearAuthDrafts(storage = browserStorage()) { clearRegistrationDraft(storage); clearResetDraft(storage); }

import type { User } from './types';

/**
 * User Permissions and Restrictions (Admin → User Permissions).
 * The server sends the features each user may use with /me; the menu, pages and buttons follow it,
 * and the server checks the same permissions again on every request.
 *
 * Several keys separated by "|" mean "any of these".
 */
export function hasPermission(user: User | null | undefined, keys: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const granted = user.permissions ?? [];
  return keys.split('|').some((k) => granted.includes(k));
}

/** Sent by the API layer when the server refused an action because of a permission (403). */
export const PERMISSION_DENIED = 'botika:permission-denied';

/** Page and feature names used on the Access Denied page. */
export const FEATURE_NAME: Record<string, string> = {
  'medicines.view': 'the Medicine List',
  'medicines.manage': 'adding and editing medicines',
  'inventory.view': 'Stock & Batches',
  'inventory.manage': 'recording stock-in and stock-out',
  'requests.view': 'requests',
  'requests.review': 'approving and rejecting requests',
  'dispensing.dispense': 'dispensing medicines',
  'residents.register': 'registering walk-in residents',
  'dispensing.records': 'the dispensing records',
  'requests.create': 'submitting medicine requests',
  'restock.create': 'submitting restock requests',
  'requests.cancel': 'cancelling requests',
  'history.view': 'your medicine history',
  'notifications.view': 'notifications',
  'profile.edit': 'editing your profile',
};

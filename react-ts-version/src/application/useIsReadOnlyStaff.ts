import { useEffect } from 'react';
import { create } from 'zustand';
import { auth } from '@/infrastructure/firebase';

/**
 * Owner decision 11.10.2026: a staff account may be read-only — it sees the
 * whole system and changes nothing. It is not a fourth role: the account signs
 * in as teacher or admin, and syncUserRoles adds the custom claim
 * `readOnly: true` to every sign-in of an address whose authorizedTeachers
 * document carries `readOnly: true`.
 *
 * The rules and the Cloud Functions are what enforce it (canWrite(),
 * assertCanWrite). This hook only lets the screens say so and disable every
 * control that changes state.
 */
export const READ_ONLY_TITLE = 'צפייה בלבד';
export const READ_ONLY_BANNER_TEXT = 'צפייה בלבד: אפשר לראות הכול, ואי אפשר לשנות דבר.';

interface ReadOnlyStaffState {
  readOnly: boolean;
  setReadOnly: (readOnly: boolean) => void;
}

export const useReadOnlyStaffStore = create<ReadOnlyStaffState>((set) => ({
  readOnly: false,
  setReadOnly: (readOnly) => set({ readOnly }),
}));

/** True when the token's claims mark a read-only staff sign-in. */
export function claimsAreReadOnly(claims: Record<string, unknown> | null | undefined): boolean {
  return claims?.readOnly === true;
}

interface TokenUser {
  getIdTokenResult?: () => Promise<{ claims: Record<string, unknown> }>;
}

let watching = false;

/** Follows the ID token (sign-in, sign-out, refresh, new claims) once per page. */
export function watchReadOnlyStaffClaims(): void {
  if (watching) return;
  let a: { onIdTokenChanged?: (cb: (u: TokenUser | null) => void) => unknown } | undefined;
  try {
    a = auth as unknown as typeof a;
  } catch {
    return; // no auth instance (tests, inert stub)
  }
  if (typeof a?.onIdTokenChanged !== 'function') return;
  watching = true;
  try {
    a.onIdTokenChanged((u) => {
      if (!u || typeof u.getIdTokenResult !== 'function') {
        useReadOnlyStaffStore.getState().setReadOnly(false);
        return;
      }
      u.getIdTokenResult()
        .then((t) => useReadOnlyStaffStore.getState().setReadOnly(claimsAreReadOnly(t?.claims)))
        .catch(() => { /* the claims stay as last read */ });
    });
  } catch {
    watching = false;
  }
}

/** The one selector every staff screen uses. */
export function useIsReadOnlyStaff(): boolean {
  useEffect(() => {
    watchReadOnlyStaffClaims();
  }, []);
  return useReadOnlyStaffStore((s) => s.readOnly);
}

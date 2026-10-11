import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {
  claimsForSignIn,
  entryRole,
  envFallbackRole,
  isReadOnlyEntry,
  parseRequestedRole,
  withReadOnlyFlag,
  type RoleClaims,
} from "./roleClaims";

/**
 * Owner decision 11.10.2026 (read-only staff) and PRD Module 1 §ג: the
 * authorizedTeachers document is the single source of a staff account's
 * authorisation. A change to it reached the account only at its next sign-in
 * (syncUserRoles), so a teacher made read-only — or an admin made a teacher —
 * kept the old claims in every open tab until the session ended. When the
 * document's role or read-only flag changes, the account's claims are stamped
 * again from the same rules syncUserRoles uses, and its refresh tokens are
 * revoked so the change applies within the hour an ID token lives.
 *
 * syncUserRoles itself writes this document on every sign-in (updatedAt);
 * such a write changes neither the role nor the flag and does nothing here.
 */

type Entry = Record<string, unknown> | null | undefined;

/** The role or the read-only flag the document grants changed (updatedAt alone is no change). */
export function staffEntryChanged(before: Entry, after: Entry): boolean {
  if (!before || !after) return false;
  return entryRole(before) !== entryRole(after) || isReadOnlyEntry(before) !== isReadOnlyEntry(after);
}

/**
 * The claims syncUserRoles would stamp for this entry, keeping the role the
 * account last signed in as (an admin address signed in as the teacher stays
 * the teacher). No staff role on the account yet: the admin side, as for a
 * sign-in without a request (claimsForSignIn's fail-closed rule).
 */
export function claimsAfterEntryChange(currentClaims: RoleClaims | null | undefined, after: Entry): RoleClaims {
  const requestedRole = parseRequestedRole({ role: currentClaims?.role });
  const isAdmin = entryRole(after) === "admin";
  return withReadOnlyFlag(
    claimsForSignIn({ isAuthorizedAdmin: isAdmin, isAuthorizedTeacher: !isAdmin }, requestedRole),
    isReadOnlyEntry(after)
  );
}

export const resyncStaffClaimsOnEntryChange = onDocumentUpdated("authorizedTeachers/{email}", async (event) => {
  const email = String(event.params.email || "").toLowerCase().trim();
  if (!email) return;
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!staffEntryChanged(before, after)) return;
  // The owner's emergency addresses take their authorisation from the
  // environment, never from this document (syncUserRoles).
  if (envFallbackRole(email)) return;

  let user: admin.auth.UserRecord;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (err: any) {
    // Never signed in: the next sign-in stamps the claims from the document.
    if (err?.code === "auth/user-not-found") return;
    throw err;
  }

  const claims = claimsAfterEntryChange(user.customClaims, after);
  await admin.auth().setCustomUserClaims(user.uid, claims);
  await admin.auth().revokeRefreshTokens(user.uid);
  logger.info(
    `Staff claims re-synced after a whitelist change (uid ${user.uid}): role=${claims.role}${claims.readOnly === true ? " (read-only)" : ""}; refresh tokens revoked.`
  );
});

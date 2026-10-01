import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { GUEST_CLAIMS } from "./roleClaims";

/**
 * PRD Module 1 §ג: fail-closed staff authorisation. The register (13.9.2026):
 * "`authorizedTeachers` הוא מקור האמת היחיד, ומחיקת מורה שוללת כניסה".
 *
 * Deleting the whitelist document only stopped the next sign-in through the
 * app. The claims syncUserRoles stamped stayed on the account, so a tab that
 * was already open — or any direct use of the account — kept teacher access.
 * When the document goes, the claims go with it and the refresh tokens are
 * revoked: an open session loses access within the hour its ID token lives.
 */
export const revokeRemovedStaff = onDocumentDeleted("authorizedTeachers/{email}", async (event) => {
  const email = String(event.params.email || "").toLowerCase().trim();
  if (!email) return;

  let uid: string;
  try {
    uid = (await admin.auth().getUserByEmail(email)).uid;
  } catch (err: any) {
    // Never signed in: there are no claims to take back.
    if (err?.code === "auth/user-not-found") return;
    throw err;
  }

  // Re-added in the meantime (delete then add of the same address): keep it.
  const stillListed = await admin.firestore().collection("authorizedTeachers").doc(email).get();
  if (stillListed.exists) return;

  await admin.auth().setCustomUserClaims(uid, { ...GUEST_CLAIMS });
  await admin.auth().revokeRefreshTokens(uid);
  logger.info(`Staff access revoked for a removed whitelist entry (uid ${uid}).`);
});

import * as admin from "firebase-admin";
import * as dotenv from "dotenv";

admin.initializeApp();

// Load local .env file explicitly to guarantee key loading in emulator
dotenv.config();

// Export the Role Synchronization module
export { syncUserRoles } from "./syncUserRoles";
export { revokeRemovedStaff } from "./revokeRemovedStaff";
// A change to an authorizedTeachers entry's role or read-only flag re-stamps the claims and revokes the refresh tokens.
export { resyncStaffClaimsOnEntryChange } from "./resyncStaffClaims";

// Export the Gemini Proxy from the new module
export { callGeminiSocraticProxy } from "./geminiProxy";
// The coaching cards the client refuses, recorded beside the server's (owner, 11.10.2026, item 13-1).
export { reportSocraticRejection } from "./socraticRejectionReport";

// Module 13 / 27: AI engine health & call counters for the admin console (staff only).
export { getAiServiceStatus } from "./aiMonitoring";

// Export the Transaction Guard module
// validateAndStoreTelemetry was removed. It validated the payload, stored
// nothing — the storage line was a commented-out sketch — logged "ingested"
// and returned { success: true }. An offline client that trusted that answer
// dequeued and dropped the event. No client called it.
// verifyTeacherSSO and onStudentEvent were removed for the same reason (no
// caller): staff sign-in is syncUserRoles + authorizedTeachers, and learner
// telemetry is written to telemetry_logs under the Firestore rules.

// Export the Google Drive Admin PDF Report module
export { exportAdminReportToDrive, backupAndResetSessionData, exportResearchDataset, logMeetingDownload } from "./exportDriveReport";
// Module 23א §ג: the daily copy of Storage-only reset backups to the Drive folder "3 גיבויים".
export { copyStorageBackupsToDrive } from "./backupDriveCopy";
// Module 23א §ג: recording chunks that reach the server after a full learner or system reset.
export { onLateRecordingChunk, onLateRecordingFlag } from "./lateRecordings";
// Module 23א §ב.2 (owner, 12.10.2026): the actions a learner reset cleared, read-only from the backup.
export { getClearedActionsFromBackup } from "./clearedActions";
// Owner decision 11.10.2026: the weekly report of coaching cards the validator rejected (Drive folder "1 דוחות").
export { weeklyAiRejectionsReport } from "./aiRejectionsReport";

// Export WP6 Cloud Functions (Module 14, 20, 22, 24, 27)
// createSessionWithServerDeadline was removed (no caller); the meeting's clock is startedAt on the RTDB node active_class_session.
export { onSessionCompleteTrigger, onMeetingCompletionMarked, onMeetingTelemetryArrived } from "./sessionTrigger";
// PRD 14 §ב1 + owner decision 29.9.2026: the teacher closing meeting 2 completes every learner who started it.
export { onMeeting2ClosedByTeacher, onMeeting2CompletionRecorded } from "./meeting2Close";
// PRD Module 20 §ב: the teacher's approval in "שלב החלוקה למסלולים" — the server writes the session document and the learner-record mirror.
export { approveTeacherGate } from "./teacherGate";
// Owner decision 2.10.2026 (catch-up time): the server opens and closes the catch-up rounds and counts their minutes.
export { onCatchUpSessionWrite } from "./catchUpRounds";
// PRD 14 §ב0 / Module 3: the catch-up note is checked for identifying details on the server too, where it is stored.
export { scrubCatchUpNotes } from "./catchUpNoteScrub";
export { generatePedagogicalReportPDF, getPedagogicalReportDownloadUrl } from "./pedagogicalReport";
// Module 23, owner decision 6.9.2026 (register item 9): a class report for every meeting.
export { generateClassMeetingReport, getClassReportDownloadUrl } from "./classReport";
export { hourlyAdminAggregator } from "./adminAggregator";
export { sendTeacherAdminMessage } from "./teacherAdminChat";
// Module 25 §ד, owner's decision 26.9.2026: printable login cards for the 12 learners.
export { getStudentLoginCards } from "./studentLoginCards";
// Modules 1 §א and 25 §ב.3: personal 4-digit learner access codes (teacher and admin).
export { getLearnerAccessCodes, regenerateLearnerAccessCode } from "./learnerAccessCodes";
// Module 21: screen recordings of earlier versions, moved off the learner record on the teacher's press.
export { moveLegacyRecordings } from "./moveLegacyRecordings";

export { authenticateStudentSession, releaseStudentSession } from "./authenticateStudentSession";




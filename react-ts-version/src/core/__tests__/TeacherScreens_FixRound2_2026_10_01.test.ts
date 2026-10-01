import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { chapterForSeek, type RecordingChapter } from '@/infrastructure/services/LearnerJourneyService';
import { buildSessionRows, sessionStateLabelHe } from '@/core/sessionPicker';
import { buildSupportProfilePayload, hasEnhancedSupport } from '@/core/supportProfile';

/**
 * Fix round 2 (1.10.2026), the teacher's screens. Each block names the defect
 * it pins. Pure rules are tested directly; wiring inside the large dashboard
 * components is asserted at the source, as the rest of this suite does.
 */
const repo = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf-8');
const src = (p: string) => repo(`react-ts-version/src/${p}`);

describe('Module 21 §ב — the chapter that bounds playback is the one the teacher jumped into', () => {
  // Meeting 2's correction round brings the learner back to a failed task: the
  // same exercise has a second, later chapter.
  const chapters: RecordingChapter[] = [
    { exerciseId: 'q3', start: 1000, end: 2000 },
    { exerciseId: 'q4', start: 2000, end: 3000 },
    { exerciseId: 'q3', start: 5000, end: 6000 },
  ];

  it('the second attempt is played to its own end, not stopped at the first one', () => {
    expect(chapterForSeek(chapters, 'q3', 5000)).toEqual(chapters[2]);
    expect(chapterForSeek(chapters, 'q3', 5500)).toEqual(chapters[2]);
  });

  it('a row between chunks belongs to the nearest chapter of that exercise', () => {
    expect(chapterForSeek(chapters, 'q3', 4900)).toEqual(chapters[2]);
    expect(chapterForSeek(chapters, 'q3', 2100)).toEqual(chapters[0]);
  });

  it('without a jump, the first chapter; without an exercise, none', () => {
    expect(chapterForSeek(chapters, 'q3', undefined)).toEqual(chapters[0]);
    expect(chapterForSeek(chapters, null, 5000)).toBeNull();
    expect(chapterForSeek(chapters, 'q9', 5000)).toBeNull();
  });
});

describe('Module 21 §ה — a recording that fails to load: the quiet message, no SDK text', () => {
  const journey = src('presentation/pages/TeacherDashboard/components/LearnerJourney.tsx');
  it('the error is not put on screen, and the player makes no claim that there is no recording', () => {
    expect(journey).not.toContain('לא ניתן לקרוא את ההקלטות');
    expect(journey).not.toMatch(/setRecordingError\(err/);
    expect(journey).toContain('setRecordingFailed(true)');
    expect(journey).toMatch(/recordingFailed\s*\?\s*'הפעולות המתועדות מוצגות בטבלה\.'/);
    expect(journey).toContain('וידאו השחזור בהכנה');
  });

  it('the chapters reach the player timeline and select like the chips', () => {
    expect(journey).toContain('chapters={timelineChapters}');
    expect(journey).toContain('onChapterSelect={(i) => selectChapter(chapters[i])}');
    expect(journey).toContain('chapterForSeek(chapters, selectedExercise, seekRequest?.t)');
  });
});

describe('Module 14 §ב0 — the picker does not call a held meeting "never opened"', () => {
  it('finished by some learners: says how many', () => {
    const rows = buildSessionRows([4, 4, 3, 4], null);
    expect(rows[3]).toMatchObject({ sessionNumber: 4, state: 'partial', completedCount: 3, learnerCount: 4 });
    expect(sessionStateLabelHe(rows[3])).toBe('סיימו 3 מתוך 4');
    expect(sessionStateLabelHe(rows[2])).toBe('הושלם');
  });

  it('finished by none: "טרם הושלם", which is true whether or not it was opened', () => {
    const rows = buildSessionRows([4, 4, 3, 4], null);
    expect(rows[4].state).toBe('pending');
    expect(sessionStateLabelHe(rows[4])).toBe('טרם הושלם');
  });

  it('the open meeting is "פעיל כעת"', () => {
    const rows = buildSessionRows([4, 4], 5);
    expect(sessionStateLabelHe(rows[4])).toBe('פעיל כעת');
  });

  it('the dashboard builds its picker from it, and no longer writes "טרם נפתח"', () => {
    const dash = src('presentation/pages/TeacherDashboard.tsx');
    expect(dash).toContain('buildSessionRows(');
    expect(dash).toContain('sessionStateLabelHe(row)');
    expect(dash).not.toContain("'טרם נפתח'");
  });
});

describe('Module 19 — the profile is support_profile_id, and nothing writes the legacy alias', () => {
  it('a switch-off removes a legacy true, so the profile really goes off', () => {
    const legacy: Record<string, unknown> = { enhanced_support_profile: true };
    expect(hasEnhancedSupport(legacy)).toBe(true); // records nobody has switched since are still read
    // RTDB update(): a null deletes the key.
    const applied = { ...legacy };
    for (const [k, v] of Object.entries(buildSupportProfilePayload(false, 't'))) {
      if (v === null) delete applied[k];
      else applied[k] = v;
    }
    expect(hasEnhancedSupport(applied)).toBe(false);
  });

  it('the resets remove the alias instead of writing it', () => {
    const store = src('application/useStore.ts');
    expect(store).not.toContain('enhanced_support_profile: false');
  });

  it('the radar announces the profile only, not quiet mode or the addition-grid flags', () => {
    const grid = src('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
    expect(grid).toContain('const enhancedSupport = hasEnhancedSupport(data);');
    expect(grid).not.toMatch(/hasEnhancedSupport\(data\)\s*\|\|/);
  });
});

describe('Module 20 — the class-management card fills the path the teacher approved', () => {
  const card = src('presentation/pages/TeacherDashboard/ClassManagement.tsx');
  it('reads teacher_selected_path, not the recommendation', () => {
    expect(card).toContain('data.teacher_selected_path ?? data.pedagogicalPath');
    expect(card).toContain("student.approvedPath === 'ירוק'");
    expect(card).toContain("student.approvedPath === 'צמצום פערי קדם'");
    expect(card).not.toMatch(/isApproved && student\.recommendedPath ===/);
  });
});

describe('Module 22 §ב.1 — tier 1 scans the box as the teacher types and blocks "send"', () => {
  const dash = src('presentation/pages/TeacherDashboard.tsx');
  it('a live scan of the input, a disabled button and a notice under the box', () => {
    expect(dash).toMatch(/const adminInputPiiNotice = useMemo\(\(\) => \{[\s\S]*?validateChatInputForPII\(adminInputText\)[\s\S]*?\}, \[adminInputText\]\);/);
    expect(dash).toContain('disabled={!adminInputText.trim() || isSendingAdmin || adminInputPiiNotice !== null}');
    expect(dash).toContain('id="admin-chat-pii-notice"');
    expect(dash).toContain('if (adminInputPiiNotice) return;');
  });
});

describe('Module 4 / register deviation 14 — the class document carries no updated_at', () => {
  it('the activation removes it instead of writing it', () => {
    const dash = src('presentation/pages/TeacherDashboard.tsx');
    expect(dash).toContain('updated_at: deleteField(),');
    expect(dash).not.toContain('updated_at: now,');
  });
});

describe('Module 23 §ה — a PDF the server could not produce: the PRD text', () => {
  it('generateMeetingReport uses REPORT_PROCESSING_TEXT for it', () => {
    const svc = src('infrastructure/services/LearnerJourneyService.ts');
    expect(svc).toContain('pdfFailed ? REPORT_PROCESSING_TEXT : null');
    expect(svc).not.toContain('קובץ ה-PDF שלו לא נשמר הפעם');
  });
});

describe('Module 23 §ב — layer 1 names every physical aid of the PRD', () => {
  const report = repo('functions/src/pedagogicalReport.ts');
  it('under 50%: ten frames and counting sticks', () => {
    expect(report).toContain('המלצה לעבודה בקבוצה הומוגנית קטנה, תיווך פרונטלי צמוד של המורה ושימוש בתבניות עשר פיזיות ומקלות מנייה.');
  });
  it('50%–75%: heterogeneous group, peers, a physical abacus', () => {
    expect(report).toContain('המלצה לעבודה בקבוצה הטרוגנית, שיח עמיתים ופתרון בעיות משותף באמצעות חשבונייה פיזית.');
  });
  it("over 75%: the grade-3 challenge and depth tasks, an erasable board and number cards", () => {
    expect(report).toContain("המלצה לעבודה עצמאית עם משימות האתגר והעומק של כיתה ג' ושימוש בלוח מחיק פיזי וכרטיסיות מספרים.");
  });
  it('the class report labels name the counting sticks too', () => {
    expect(repo('functions/src/reportHtml.ts')).toContain('תבניות עשר פיזיות ומקלות מנייה');
    expect(src('infrastructure/services/ClassReportService.ts')).toContain('תבניות עשר פיזיות ומקלות מנייה');
  });
});

describe('Module 1 §ג — a failed staff sign-in returns home quietly', () => {
  const login = src('presentation/pages/Login.tsx');
  const sso = login.slice(login.indexOf('const handleGoogleSSO'), login.indexOf('const roleTitle'));
  it('no reason and no technical text on screen; back to the home page', () => {
    expect(sso).toContain('navigate("/", { replace: true });');
    expect(sso).not.toContain('Firebase Auth. פנה');
    expect(sso).not.toContain('שגיאת תקשורת ברשת');
    expect(sso).not.toMatch(/setErrorMsg\(ours \? msg/);
  });
});

describe('Teacher screens — smaller defects of the screen audit', () => {
  it('the projector board raises no learner telemetry', () => {
    const sync = src('infrastructure/services/FirebaseSyncService.ts');
    expect(sync).toContain('if (useWorkspaceStore.getState().projectorBoard) return null;');
  });

  it('the projector header carries no internal module name', () => {
    expect(src('presentation/pages/ProjectorSandboxPage.tsx')).not.toContain('מודול 15 •');
  });

  it('the chat header shows the learner number, and the chat tab opens on a waiting message', () => {
    const dash = src('presentation/pages/TeacherDashboard.tsx');
    expect(dash).toContain("{selectedStudentId.replace(/\\D/g, '') || '?'}");
    expect(dash).toMatch(/if \(tab === "chat_students"\) \{[\s\S]*?allStudents\.find\(\(s\) => hasUnread\(s\.studentId\)\)/);
  });

  it('the catalog sentence of the class report never names a learner who has no data', () => {
    const panel = src('presentation/pages/TeacherDashboard/components/ClassMeetingReportPanel.tsx');
    expect(panel).toContain('report.learnersWithoutScore.filter((id) => !report.learnersWithoutData.includes(id))');
  });

  it('the radar window keeps its actions in view and says when the learner called for help', () => {
    const grid = src('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
    expect(grid).toContain('flex-1 min-h-0 overflow-y-auto p-6 md:p-8');
    expect(grid).toContain('shrink-0 px-6 md:px-8 py-4 border-t');
    expect(grid).toContain('<span>התלמיד ביקש עזרה</span>');
  });

  it('the reset window\'s close button has a name', () => {
    expect(src('presentation/pages/TeacherDashboard/components/ResetConfirmationModal.tsx')).toContain('aria-label="סגירת החלון"');
  });
});

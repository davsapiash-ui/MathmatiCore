import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Teacher-dashboard control audit — each case pins a control that used to look
 * functional while doing nothing, lying about its outcome, or (worst) quietly
 * bypassing the Module 20 teacher approval gate.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

const dash = read('../../../TeacherDashboard.tsx');
const gate = read('../TeacherApprovalGate.tsx');
const gateCore = read('../../../../../core/teacherGate.ts');
const sync = read('../../../../../infrastructure/services/FirebaseSyncService.ts');
const drawer = read('../StudentLearningConditionsDrawer.tsx');
const chatStore = read('../../../../../application/useChatStore.ts');
const floatChat = read('../FloatingChatPanel.tsx');
const fsRules = read('../../../../../../../firestore.rules');
const dbRules = read('../../../../../../../database.rules.json');
const chatFn = read('../../../../../../../functions/src/teacherAdminChat.ts');
const sessionFn = read('../../../../../../../functions/src/sessionTrigger.ts');

describe('Module 20: the approval gate cannot be bypassed or mis-routed', () => {
  it('saving learning conditions never implies a gate override', () => {
    // The old default `?? true` meant an ASD/scaffold save stamped
    // physicalOverride: true — a full bypass of the teacher gate.
    expect(sync.includes('overrideData.physicalOverride ?? true')).toBe(false);
    expect(sync.includes('overrideData.physicalOverride ?? false')).toBe(true);
    // Gate flags are written only when explicitly supplied.
    expect(sync.includes('gateFlagsSupplied')).toBe(true);
    // The drawer passes the no-bypass intent explicitly and keeps the flag out
    // of its raw RTDB updates.
    expect(drawer.includes('physicalOverride: false as const')).toBe(true);
    expect(drawer.includes('physicalOverride: _noGateChange, ...rtdbPayload')).toBe(true);
  });

  it('the approval path falls back to the LIVE recommendation, never to green', () => {
    expect(gate.includes("selectedPaths[studentId] || 'green_path'")).toBe(false);
    expect(gate.includes('selectedPaths[s.studentId] ?? s.recommendedPath')).toBe(true);
  });

  it('batch approval is built at click time from waiting learners and reports a real tally', () => {
    expect(gate).toMatch(/waitingStudents\.forEach\(\(s\) => \{\s*pathMap\[s\.studentId\] = effectivePath\(s\);/);
    expect(dash.includes('if (await handleApproveGateStudent(sId, path)) succeeded++;')).toBe(true);
    expect(dash.includes("toast.success('כל התלמידים הממתינים אושרו בהצלחה למפגש 3! 🚀')")).toBe(false);
  });

  it('the canonical RTDB mirror must land or the approval fails loudly', () => {
    expect(gateCore).toMatch(/await update\(ref\(database, `users\/students\/student_user\$\{num\}`\), mirror\);/);
    expect(gateCore).toMatch(/reason:\s*'write_failed',\s*message:\s*'האישור נכתב ב-Firestore/);
  });

  it('generating a report no longer bricks the gate: the session allowlist carries the report fields', () => {
    expect(fsRules.includes("'pedagogical_report_pdf_path'")).toBe(true);
    expect(fsRules.includes("'pedagogical_report_generated_at'")).toBe(true);
  });

  it('gate strengths come from the learner\'s real Q-Matrix results, not two hard-coded strings', () => {
    expect(dash.includes("['המרה בעשרות', 'ערך מיקום']")).toBe(false);
    expect(dash.includes('qm[t.id] === false')).toBe(true);
  });
});

describe('Session activation', () => {
  it('a rejected Firestore batch is surfaced to the teacher, and support profiles are not clobbered', () => {
    expect(dash.includes('המפגש שודר לתלמידים, אך עדכון מסמכי הכיתה בשרת נדחה')).toBe(true);
    expect(dash.includes('support_profile_id: `profile_student_${studentNum}`')).toBe(false);
    expect(dash.includes('support_profile_version: 1')).toBe(false);
  });

  it('active_class_session accepts a teacher==true claim like every other node', () => {
    expect(dbRules).toMatch(/"active_class_session"[\s\S]{0,400}auth\.token\.teacher == true/);
  });
});

describe('Server callables gained the role checks their rules assume', () => {
  it('sendTeacherAdminMessage is staff-only', () => {
    expect(chatFn.includes('Only teachers and admins may use this channel.')).toBe(true);
  });
  it('createSessionWithServerDeadline is staff or the owning learner', () => {
    expect(sessionFn.includes("Not authorized for this learner's session.")).toBe(true);
  });
});

describe('Chat honesty', () => {
  it('the admin drawer and the student chat no longer share one input state', () => {
    expect(dash.includes('const [adminInputText, setAdminInputText] = useState("")')).toBe(true);
    expect(dash).toMatch(/value=\{adminInputText\}/);
  });

  it('the admin unread badge counts the Firestore admin channel, not the RTDB student store', () => {
    expect(dash).toMatch(/adminMessages\.filter\(\(m\) => m\.senderId === 'admin' && !m\.read\)\.length/);
  });

  it('sendMessage drops an addressee-less message instead of falling back to a personal id', () => {
    expect(chatStore.includes("receiverId || '1002220159'")).toBe(false);
    expect(chatStore.includes('sendMessage called without a receiver')).toBe(true);
    // Rollback failures now toast instead of vanishing silently.
    expect(chatStore.includes('שליחת ההודעה נכשלה מול השרת')).toBe(true);
  });

  it('clear-history toasts the real server outcome and the minimize button has a handler', () => {
    expect(chatStore.includes("return remove(ref(database, `chat_messages/${norm}`));")).toBe(true);
    expect(floatChat.includes('Promise.resolve(clearStudentMessages(normStudentId))')).toBe(true);
    expect(floatChat).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); setIsMinimized\(\(v\) => !v\); \}\}/);
  });
});

describe('Dead controls removed / dead screens exposed', () => {
  it('the hint/intervention pipeline that wrote fields nothing reads is gone', () => {
    for (const gone of ['handleHintClick', 'handleAssignIntervention', 'handleAlertResponse', 'teacher_hint', 'activeIntervention:', '_handleToggleGlobalChat']) {
      expect(dash.includes(gone)).toBe(false);
    }
  });

  it('ClassManagement is reachable from the sidebar', () => {
    expect(dash.includes('ניהול כיתה ותנאי למידה')).toBe(true);
  });

  it('the clustering filter actually filters the group cards, with one threshold', () => {
    expect(dash).toMatch(/activeClusterFilter === 'decimal_structure'\) &&/);
    expect(dash).toMatch(/activeClusterFilter === 'algebraic_reasoning'\) &&/);
    const widgets = read('../ClusteringWidgets.tsx');
    expect(widgets.includes('used < 0.8, so its counts disagreed')).toBe(true); // comment only
    expect(widgets.includes('< 0.5')).toBe(true);
  });

  it('the dead radar live-feed subscription in the heatmap is gone', () => {
    const heat = read('../HeatmapGrid.tsx');
    expect(heat.includes('feedItems')).toBe(false);
  });
});

describe('Resets and reports tell the truth', () => {
  it('the system reset forwards the mandatory reason note to the audit log', () => {
    const store = read('../../../../../application/useStore.ts');
    expect(store).toMatch(/reset_level: 'system',\s*reason,\s*reason_note: reasonNote \|\| ''/);
  });

  it('a failed reset keeps the confirmation dialog open (callers rethrow)', () => {
    const cm = read('../../ClassManagement.tsx');
    const heat = read('../HeatmapGrid.tsx');
    expect(cm.includes('throw err; // keep the confirmation dialog open')).toBe(true);
    expect((heat.match(/throw err; \/\/ keep the dialog open/g) || []).length).toBe(2);
  });

  it('a report that does not exist yet renders as "no report", not as an error banner', () => {
    const lj = read('../LearnerJourney.tsx');
    const panel = read('../ClassMeetingReportPanel.tsx');
    expect(lj.includes('isMissingReport(err)')).toBe(true);
    expect(panel.includes('isMissingReport(err)')).toBe(true);
  });

  it('"סמן כטופל" awaits the server and reports failure', () => {
    expect(drawer.includes('await Promise.all(ids.map((id) => update(')).toBe(true);
    expect(drawer.includes('סימון הטיפול נדחה בשרת')).toBe(true);
  });
});

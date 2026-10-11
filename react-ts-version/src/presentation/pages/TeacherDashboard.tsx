import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useDismissableOverlay } from "@/hooks/useDismissableOverlay";
import { Logo } from "@/presentation/components/ui/Logo";
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { DataGrid } from "@/presentation/design-system/DataGrid";
import { useAuthStore } from "@/application/useAuthStore";
import { READ_ONLY_TITLE, useIsReadOnlyStaff, useReadOnlyStaffStore } from "@/application/useIsReadOnlyStaff";
import { ReadOnlyBanner } from "@/presentation/components/ui/ReadOnlyBanner";
import { useAdminStore } from "@/application/useAdminStore";
import { useChatStore, normalizeStudentId, type ChatMessage } from "@/application/useChatStore";
import { extractTeacherId } from "@/infrastructure/services/FirebaseSyncService";
import { useStore, type StudentData } from "@/application/useStore";
import { toast } from "sonner";
import { ref, onValue, set, update, onDisconnect, serverTimestamp } from "firebase/database";
import { getClassSessionStatus, getSessionAutoCloseAt, isClassSessionLive, lastRunFields, readLastClosedRun, readSessionStartedAt, TEACHER_DISCONNECT_GRACE_MS, type ClassSessionStatus, type LastClosedRun } from "@/core/classSession";
import { buildUnfinishedLearners, needsReason } from "@/core/catchUpUnfinished";
import { COMPLETED_MEETINGS_KEY, WORKSPACE_BY_MEETING_KEY, isMeetingFinished } from "@/core/meetingCompletion";
import { workspaceSavedAt } from "@/core/workspaceSnapshot";
import type { CatchUpAction, CatchUpReasonEntry, CatchUpRecord, UnfinishedLearner } from "@/core/catchUp";
import { recordCatchUpReasons, subscribeCatchUpRecords } from "@/infrastructure/services/CatchUpService";
import { CatchUpReasonsDialog } from "./TeacherDashboard/components/CatchUpReasonsDialog";
import { MediationPendingButton } from "./TeacherDashboard/components/MediationJournal";
import { MediationQueue } from "./TeacherDashboard/components/MediationQueue";
import { CloseMeetingChecklist } from "./TeacherDashboard/components/CloseMeetingChecklist";
import { MeetingSummaryPanel } from "./TeacherDashboard/components/MeetingSummaryPanel";
import { TeacherTabHeader } from "./TeacherDashboard/components/TeacherTabHeader";
import { RadarColourMap } from "./TeacherDashboard/components/RadarColourMap";
import { useMediationEvents, useOpenMediationEvents, useTeacherMediationStore, useTeacherMediationSync } from "@/application/useTeacherMediationStore";
import { LESSON_FLOW_HE, buildMeetingSummary, type MeetingSummary } from "@/core/teacherLessonFlow";
import { clearHelpRequest } from "@/infrastructure/services/HelpRequestService";
import { getHesitationThresholdSeconds, useHesitationThresholdSeconds } from "@/core/hesitationCalibration";
import { QUEUE_HE } from "@/core/teacherMediation";
import { useProjectorMode } from "@/application/useProjectorMode";
import { TeacherGuideDownloadButton } from './TeacherDashboard/components/TeacherGuideDownloadButton';
import { database, auth, functions, firestore, serverNow, fetchServerClockOffset, isServerClockKnown } from "@/infrastructure/firebase";
import { doc, getDoc, onSnapshot, collection, writeBatch, deleteField } from "firebase/firestore";
import { activationMirror } from "@/core/classActivationMirror";
import type { SessionDocument, PedagogicalPath } from "@/types";
import { httpsCallable } from "firebase/functions";
import { MotionConfig } from "framer-motion";
import { ensureStaffRoleClaims } from "@/infrastructure/services/staffRoleClaims";
import { SocraticEngine } from "@/infrastructure/services/SocraticEngine";
import { indexedDBQueue } from "@/infrastructure/services/IndexedDBQueue";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Send, MessageCircle, ShieldAlert, Sliders, Search, Check, CheckCheck, Sparkles, Users, Mail, Radar, LayoutGrid, FileText, School, PanelRightClose, PanelRightOpen, Play, Pause, Square, Lock, Clock, Timer, Undo2 } from "lucide-react";

import { ClassManagement, CLASS_MANAGEMENT_TITLE_HE } from "./TeacherDashboard/ClassManagement";
import { LearnerJourney } from "./TeacherDashboard/components/LearnerJourney";
import { ClassMeetingReportPanel } from "./TeacherDashboard/components/ClassMeetingReportPanel";
import { StudentLearningConditionsDrawer } from "./TeacherDashboard/components/StudentLearningConditionsDrawer";
import { TeacherGateApprovalDrawer } from "./TeacherDashboard/components/TeacherGateApprovalDrawer";
import { FloatingChatPanel } from "./TeacherDashboard/components/FloatingChatPanel";
import { HeatmapGrid, focusTileGateApproval } from "./TeacherDashboard/components/HeatmapGrid";
import { ClusteringWidgets, isStudentBelow } from "./TeacherDashboard/components/ClusteringWidgets";
import { TeacherGenderSetting } from "./TeacherDashboard/components/TeacherGenderSetting";
import { useTeacherGender, useTeacherGenderStore } from "@/application/useTeacherGender";
import { teacherSentenceHe } from "@/core/teacherGender";
import { buildGateStudentItem, buildGateStudentItems, buildUnfinishedMeeting2Items, gateLearnerNumber, unfinishedMeeting2AsLearners, NO_RECOMMENDATION_HE, type GateStudentItem } from "./TeacherDashboard/gateEvidence";
import { SessionActivationModal, type SessionRow } from "./TeacherDashboard/components/SessionActivationModal";
import { buildSessionRows, sessionStateLabelHe } from "@/core/sessionPicker";
import { getSessionDurationMinutes } from "@/core/classSession";
import { isHeartbeatFresh, readLastPing } from "@/core/presence";
import {
  CONCEPT_LABELS_HE,
  DIAGNOSTIC_DOMAINS,
  REGROUPING_KIND_LABELS_HE,
  TASKS as DIAGNOSTIC_TASKS,
  computeRegroupingDomain,
  diagnosticTaskLabelHe,
  getQTaskStatus,
  readQTaskValue,
  type RegroupingKindScore,
} from "@/core/QMatrix";
import { validateChatInputForPII, anonymizeChatMessageBody, reportPiiFilterFailure } from "@/core/security/PiiFilter";
import { approveTeacherGate } from "@/core/teacherGate";
import { PILOT_CLASS_ID, PILOT_SCHOOL_ID } from "@/core/pilotInstitution";
import { meetingLabelHe, meetingShortLabelHe } from "@/core/stationNames";
import { MEETING_FORMAL_HE } from "@/core/meetingFormalNames";
import { PROJECTOR_CHIP_HE, ROUTE_NAME_HE, TEACHER_GATE_HE, routeNameHe } from "@/core/routeLabels";

/**
 * Two per-meeting maps of one learner (workspaceByMeeting, completedMeetings)
 * from two rows of one snapshot, key by key; null when neither has any.
 */
/** A read-only staff sign-in (owner decision 11.10.2026): no automatic write either. */
const isReadOnlyNow = () => useReadOnlyStaffStore.getState().readOnly;

function mergeByMeeting(
  earlier: unknown,
  later: unknown,
  pick: (a: any, b: any) => unknown
): Record<string, unknown> | null {
  const a = earlier && typeof earlier === 'object' ? (earlier as Record<string, unknown>) : {};
  const b = later && typeof later === 'object' ? (later as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = key in a && a[key] ? pick(a[key], value) : value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The learner a report link names ("7", "student_7", "student_user7"), as the
 * canonical id — or null when the link names no learner of the class.
 * Learners are 1–12 only: "99" used to be clamped to learner 12 and "0" to
 * learner 1, so a wrong link opened another child's report.
 */
function routeLearnerId(routeId: string | undefined): string | null {
  const m = /^(?:student_user|student_|user)?(\d{1,2})$/.exec((routeId ?? '').trim().toLowerCase());
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? `student_user${n}` : null;
}

type TabType =
  | "heatmap"
  | "clustering"
  | "diagnostic_reports"
  | "chat_students"
  | "class_management";


/**
 * How long a close/open from the catch-up dialog waits for the reasons to be
 * saved before it goes ahead anyway (the write stays queued). Never longer: a
 * meeting must stay closable on a slow or missing network.
 */
const CATCH_UP_SAVE_WAIT_MS = 5_000;

/** The automatic close (45 minutes, or the disconnect window) was refused by the server. */
const AUTO_CLOSE_NOT_SAVED_HE = 'הסגירה האוטומטית של המפגש לא נשמרה בשרת. אצל התלמידים המפגש כבר נסגר.';

/** The live bar while the meeting is paused: after the connected learners and the minutes, and as the chip's tooltip. */
const PAUSED_BAR_LINE_HE = 'העבודה של התלמידים שמורה. "המשיכו את המפגש" מחזיר אותם לאותה נקודה.';

export function TeacherDashboard() {
  const { id: routeStudentId } = useParams<{ id: string }>();
  const routeLearner = routeLearnerId(routeStudentId);
  /** The link names a learner that is not in the class (not 1–12). */
  const routeLearnerUnknown = Boolean(routeStudentId) && routeLearner === null;
  const { user } = useAuthStore();
  const { messages, sendMessage, markAsRead, markAllAsRead, initSync } = useChatStore();
  // The pause and close toasts quote the children's screen, so they read the
  // same choice the children's screens do (core/teacherGender.ts) — with or
  // without the side menu that shows it.
  useTeacherGender();
  // Owner decision 11.10.2026: a read-only staff account sees everything and
  // changes nothing; every control that writes is disabled with this title.
  const readOnly = useIsReadOnlyStaff();
  // Module 15: whether the learners' screens are locked for a demonstration (read only here).
  const isProjectorModeActive = useProjectorMode();

  useEffect(() => {
    initSync();
    const unsubAdmin = useAdminStore.getState().initAdminSubscriptions();
    const unsubStore = useStore.getState().initStoreSubscriptions();
    return () => {
      if (unsubAdmin) unsubAdmin();
      if (unsubStore) unsubStore();
    };
  }, [initSync]);

  const [students, setStudents] = useState<Record<string, StudentData>>(() => {
    const allSt = useStore.getState().students;
    const initial: Record<string, StudentData> = {};
    for (const [id, s] of Object.entries(allSt)) {
      // Preserve real qMatrixResults and traceData already in the store — do NOT zero them out.
      initial[id] = {
        ...s,
        studentId: id,
        classId: 'demo',
        traceData: s.traceData ?? { hesitation_events: 0, undo_clicks: 0 },
        qMatrixResults: s.qMatrixResults ?? {},
      };
    }
    return initial;
  });

  // The side menu folded to icons (owner, 6.10.2026). Below 1600px it starts as
  // the icon rail, so the radar gets the width (owner, 11.10.2026); the
  // teacher's own choice, once made, wins and is remembered in this browser
  // only — the page works the same without it.
  const [sidebarChoice, setSidebarChoice] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem('teacher_sidebar_collapsed');
      return v === '1' ? true : v === '0' ? false : null;
    } catch { return null; }
  });
  const [isNarrowScreen, setIsNarrowScreen] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 1599px)').matches
      : typeof window !== 'undefined' && window.innerWidth < 1600);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(max-width: 1599px)');
    const onChange = () => setIsNarrowScreen(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  const sidebarCollapsed = sidebarChoice ?? isNarrowScreen;
  // The teacher screens' own type (index.css, .teacher-ui), on <html> so the drawers in portals get it too.
  useEffect(() => {
    document.documentElement.classList.add('teacher-ui');
    return () => document.documentElement.classList.remove('teacher-ui');
  }, []);
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    try { localStorage.setItem('teacher_sidebar_collapsed', next ? '1' : '0'); } catch { /* storage unavailable */ }
    setSidebarChoice(next);
  };
  // Personal reports: the class report folded to one line unless the teacher
  // opened it (remembered in this browser; owner, 6.10.2026).
  const [classReportOpen, setClassReportOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('teacher_class_report_open') === '1'; } catch { return false; }
  });
  const toggleClassReport = () => {
    setClassReportOpen((o) => {
      try { localStorage.setItem('teacher_class_report_open', o ? '0' : '1'); } catch { /* storage unavailable */ }
      return !o;
    });
  };
  const [activeTab, setActiveTab] = useState<TabType>(
    routeStudentId ? "diagnostic_reports" : "heatmap",
  );
  const [activeClusterFilter, setActiveClusterFilter] = useState<string | null>(null);

  const [inputText, setInputText] = useState("");
  // The admin drawer used to share inputText with the student chat, so a
  // half-typed message to one leaked into the other.
  const [adminInputText, setAdminInputText] = useState("");
  const [isSendingAdmin, setIsSendingAdmin] = useState(false);
  const isSendingAdminRef = useRef(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(routeLearner);
  const [selectedReplayStudentId, setSelectedReplayStudentId] = useState<string | null>(routeLearner);
  // The learner drawer holds the learner's id, not a copy of the learner: the
  // copy froze at the moment it was opened, so after "סמנו כטופל" the help
  // banner stayed, and a hand raised while it was open never appeared. The
  // drawer's learner is read from the live list below (drawerStudent).
  const [drawerStudentId, setDrawerStudentId] = useState<string | null>(null);
  const [gateStudent, setGateStudent] = useState<StudentData | null>(null);
  const [floatingChatStudent, setFloatingChatStudent] = useState<StudentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // onValue fires its error callback for a permission rejection, but for a
  // database that never answers (captive portal, blocked websocket, a
  // wrong databaseURL) it fires nothing at all — and the spinner below has no
  // other way out. The teacher stood in front of the class watching it turn.
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  // The server refused the read (the signed-in account is not a teacher's):
  // checking the internet does not help, signing in as the teacher does.
  const [loadRefused, setLoadRefused] = useState(false);

  // Update active tab and selected student based on route params (PRD 4.3 Navigation Redundancy)
  useEffect(() => {
    if (routeStudentId) {
      // An unknown learner selects no one: the reports tab says so.
      setSelectedStudentId(routeLearner);
      setSelectedReplayStudentId(routeLearner);
      setActiveTab("diagnostic_reports");
      // Clean up the URL so it doesn't stay if they close it, or leave it. The PRD just says we support it.
    }
  }, [routeStudentId, routeLearner]);

  // --- Module 20: Firestore Live Session 2 Diagnostic Documents (WP6 Integration) ---
  const [firestoreSession2Docs, setFirestoreSession2Docs] = useState<Record<string, SessionDocument>>({});
  const [isApprovingGate, setIsApprovingGate] = useState(false);

  useEffect(() => {
    try {
      const sessionsColRef = collection(firestore, 'sessions');
      const unsub = onSnapshot(sessionsColRef, (snapshot) => {
        const docMap: Record<string, SessionDocument> = {};
        snapshot.forEach((d) => {
          if (d.id.startsWith('session_02_student_')) {
            const studentNumMatch = d.id.match(/\d+$/);
            if (studentNumMatch) {
              const studentNum = studentNumMatch[0];
              docMap[`student_${studentNum}`] = d.data() as SessionDocument;
              docMap[studentNum] = d.data() as SessionDocument;
            }
          }
        });
        setFirestoreSession2Docs(docMap);
      }, (err) => {
        console.error('[TeacherDashboard] Firestore "sessions" listener error (check security rules / permissions):', err);
      });
      return () => unsub();
    } catch (e) {
      console.error('[TeacherDashboard] Failed to init Firestore sessions listener:', e);
    }
  }, []);

  // --- Class Session Management (Manual Start/Stop) ---
  const [isClassSessionActive, setIsClassSessionActive] = useState(false);
  // Owner decision (6.9.2026, register item 7): start / pause / close, each
  // reaching the learners live. 'paused' keeps the meeting open with the
  // learners waiting in place.
  const [classSessionStatus, setClassSessionStatus] = useState<ClassSessionStatus>('closed');
  const [_sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [selectedSessionNum, setSelectedSessionNum] = useState<number>(1);
  // Module 14 §ב0: the eight-session picker is always visible, so its choice must
  // not be the live session number (that only changes on a confirmed activation).
  const [pickedSessionNum, setPickedSessionNum] = useState<number>(1);

  // Measure 5 (owner, 11.10.2026): the mediation events of the open meeting's
  // run and the teacher's records of them, for the bubbles, the counter, the
  // tiles, the tile drawer and the close dialog.
  useTeacherMediationSync(isClassSessionActive ? selectedSessionNum : null, isClassSessionActive ? _sessionStartTime : null);
  const unrecordedMediationCount = useOpenMediationEvents().length;
  const mediationEvents = useMediationEvents();
  const [mediationPendingOpen, setMediationPendingOpen] = useState(false);
  // Below 1024px (a tablet in portrait) the queue and the colour map are a bottom sheet (owner, 11.10.2026).
  const [queueSheetOpen, setQueueSheetOpen] = useState(false);
  // One closing checklist (owner, 11.10.2026): help calls, the projector, the
  // reasons of who did not finish, and the unrecorded mediation events.
  const [closeChecklistOpen, setCloseChecklistOpen] = useState(false);
  // The teacher-only summary of the meeting she has just closed (owner, 11.10.2026).
  const [meetingSummary, setMeetingSummary] = useState<MeetingSummary | null>(null);
  // Keeps the calibration listener alive for the summary's colour rule (Module 26).
  useHesitationThresholdSeconds();
  // Module 14 §ב0: activation goes through an explicit confirmation window
  const [pendingActivationSession, setPendingActivationSession] = useState<number | null>(null);
  // Module 14 §ב1: teacher-only, one-time-per-session deadline notice
  const [deadlineNotice, setDeadlineNotice] = useState<{ sessionNumber: number; minutes: number } | null>(null);
  // Module 22 §ב: the admin consultation channel lives in a sliding side drawer
  // opened by the envelope icon — not in a dashboard tab.
  const [isAdminChatDrawerOpen, setIsAdminChatDrawerOpen] = useState(false);
  // מסמך העיצוב §1.2: המגירה הוגדרה כחלון מודאלי אבל לא נסגרה ב-Escape,
  // לא לכדה פוקוס ולא החזירה אותו — כך שהמורה המשיכה לטייל במקלדת בין
  // כפתורי הדשבורד שמאחוריה.
  const adminChatDrawerRef = useDismissableOverlay<HTMLDivElement>(
    isAdminChatDrawerOpen,
    () => setIsAdminChatDrawerOpen(false)
  );
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const isUpdatingSessionRef = useRef(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  // Re-reads the last live record into the dashboard (set by the listener below).
  const reapplySessionStateRef = useRef<() => void>(() => {});
  // The class record as the database last sent it: the teacher's close reads
  // the meeting and the server start of the run it ends (lastRunFields).
  const liveRecordRef = useRef<Record<string, unknown> | null>(null);
  // Catch-up time (owner decision 2.10.2026): the run the last close ended —
  // after a close by time, whose reasons are still missing is read from it.
  const [lastClosedRun, setLastClosedRun] = useState<LastClosedRun | null>(null);

  // Whether this page reaches the database now (`.info/connected`). A write to
  // active_class_session made while it does not is applied locally at once —
  // the listener already shows the meeting open, paused or closed — and sent
  // when the connection returns; its promise does not settle before then. The
  // controls awaited it, so with the Wi-Fi down the activation window spun with
  // "ביטול" disabled, and pause / resume / close stayed disabled, until the
  // network came back.
  const rtdbConnectedRef = useRef(false);
  const onOfflineRef = useRef(new Set<() => void>());
  useEffect(() => {
    return onValue(ref(database, '.info/connected'), (snap) => {
      rtdbConnectedRef.current = snap.val() === true;
      if (!rtdbConnectedRef.current) [...onOfflineRef.current].forEach((fn) => fn());
    });
  }, []);

  /**
   * Waits for a meeting-control write while the database is reachable.
   * 'confirmed': the server took it. 'queued': the page is (or went) offline,
   * so the write waits in the SDK and goes out when the connection returns —
   * nothing cancels it. A refusal before that rejects; a refusal of a queued
   * write arrives later, through onLateFailure.
   */
  const awaitSessionWrite = (
    write: Promise<unknown>,
    onLateFailure: (err: unknown) => void
  ): Promise<'confirmed' | 'queued'> =>
    new Promise((resolve, reject) => {
      let settled = false;
      const queued = () => {
        if (settled) return;
        settled = true;
        onOfflineRef.current.delete(queued);
        resolve('queued');
      };
      write.then(
        () => {
          onOfflineRef.current.delete(queued);
          if (!settled) { settled = true; resolve('confirmed'); }
        },
        (err) => {
          onOfflineRef.current.delete(queued);
          if (!settled) { settled = true; reject(err); } else onLateFailure(err);
        }
      );
      if (!rtdbConnectedRef.current) queued();
      else onOfflineRef.current.add(queued);
    });

  // Sync active class session with Firebase.
  // A session with a teacherDisconnectedAt stamp older than the grace window
  // counts as closed (core/classSession.ts); the interval re-evaluates the window
  // since its expiry produces no server event.
  useEffect(() => {
    const sessionRef = ref(database, 'active_class_session');
    let lastVal: Record<string, unknown> | null = null;

    let autoClosedStart: number | null = null;
    let lastLiveSessionNum: number | null = null;
    // The stamps in the record are the server's. Until the database has
    // reported the server clock in this page, serverNow() is only this
    // laptop's clock, and a laptop X minutes fast would close the meeting for
    // the whole class after 45 − X minutes. So until then no time limit is
    // decided here: the record is read without its stamps, and the 45-minute
    // close is neither shown nor written. The clock's arrival re-evaluates.
    const timedRecord = (): Record<string, unknown> | null =>
      lastVal && !isServerClockKnown() ? { ...lastVal, startedAt: null, teacherDisconnectedAt: null } : lastVal;
    const applySessionState = () => {
      const val = timedRecord();
      liveRecordRef.current = lastVal;
      setLastClosedRun((prev) => {
        const next = readLastClosedRun(lastVal);
        return prev && next && prev.meeting === next.meeting && prev.startedAt === next.startedAt && prev.byTime === next.byTime ? prev : next;
      });
      if (lastVal && val && isClassSessionLive(val)) {
        const liveNum = (lastVal.sessionNumber as number) || 1;
        setIsClassSessionActive(true);
        setClassSessionStatus(getClassSessionStatus(val));
        // The server's start stamp (Module 14 §ב). Until the placeholder of
        // our own write resolves, keep what activation set (serverNow()).
        const serverStart = readSessionStartedAt(lastVal);
        setSessionStartTime((prev) => serverStart ?? prev ?? serverNow());
        setSelectedSessionNum(liveNum);
        // Follow the live session in the picker only when it actually changes,
        // so a pause/resume write never discards a choice the teacher is making.
        if (liveNum !== lastLiveSessionNum) {
          lastLiveSessionNum = liveNum;
          setPickedSessionNum(liveNum);
        }
        return;
      }
      lastLiveSessionNum = null;
      // 45-minute hard cap (core/classSession.ts): every client already treats
      // the meeting as closed; the teacher's client, the one allowed to write,
      // also records the close so the shared record says so. Once per start.
      const autoCloseAt = getSessionAutoCloseAt(val);
      const startedAt = readSessionStartedAt(val);
      if (lastVal?.active === true && autoCloseAt !== null && serverNow() >= autoCloseAt && startedAt !== autoClosedStart && !isReadOnlyNow()) {
        autoClosedStart = startedAt;
        // Read before the write: the SDK raises our own set() on this listener
        // at once, and lastVal is then the closed record (sessionNumber null).
        const closedMeeting = Number(lastVal.sessionNumber);
        set(sessionRef, {
          active: false,
          status: 'closed',
          sessionNumber: null,
          endedAt: Date.now(),
          endedBy: 'auto_45min',
          teacherId: (lastVal.teacherId as string) || 'teacher',
          // Catch-up time: which run ended, for the reasons asked later.
          ...lastRunFields(closedMeeting, startedAt),
        }).catch((err) => {
          console.warn('[TeacherDashboard] recording the 45-minute close failed:', err);
          toast.error(AUTO_CLOSE_NOT_SAVED_HE, { id: 'auto-close-not-saved' });
        });
        // A meeting 2 closed by time completes no one (owner decision 2.10.2026):
        // the teacher is told where the learners who did not finish are.
        toast.info(
          closedMeeting === 2
            ? `המפגש נסגר אוטומטית: עברו 45 דקות מההפעלה. מי שלא סיים מופיע ב"${CLASS_MANAGEMENT_TITLE_HE}", תחת "${TEACHER_GATE_HE}", ושם אפשר לפתוח שוב את המפגש לכיתה.`
            : 'המפגש נסגר אוטומטית: עברו 45 דקות מההפעלה.'
        );
      }
      setIsClassSessionActive(false);
      setClassSessionStatus('closed');
      setSessionStartTime(null);
    };
    reapplySessionStateRef.current = applySessionState;

    const unsub = onValue(
      sessionRef,
      (snap) => {
        lastVal = snap.exists() ? snap.val() : null;
        applySessionState();
      },
      (err) => {
        console.error('[TeacherDashboard] RTDB "active_class_session" listener error:', err);
      }
    );
    const graceTimer = setInterval(applySessionState, 30000);
    let mounted = true;
    fetchServerClockOffset()
      .then(() => { if (mounted) applySessionState(); })
      .catch(() => {});
    return () => {
      mounted = false;
      reapplySessionStateRef.current = () => {};
      unsub();
      clearInterval(graceTimer);
    };
  }, []);

  // PRD v7.1 Module 14 §ב1: on reaching session_deadline_time the LEARNER's screen
  // changes in no way; the teacher dashboard alone surfaces a one-time dismissible
  // popup "עברו X דקות", where X is derived from the session's configured duration
  // (20 / 25 / 15) and never a hardcoded constant. Once dismissed it never returns,
  // so the shown-marker is persisted per session activation.
  // The live bar's clock (owner, 10.10.2026): minutes since the activation,
  // against the meeting's time limit (Module 14 §ב), refreshed twice a minute.
  // Information for the teacher only — nothing here locks or closes anything.
  const [elapsedMinutes, setElapsedMinutes] = useState<number | null>(null);
  useEffect(() => {
    if (!isClassSessionActive || !_sessionStartTime) { setElapsedMinutes(null); return; }
    const tick = () => setElapsedMinutes(Math.max(0, Math.floor((serverNow() - _sessionStartTime) / 60_000)));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [isClassSessionActive, _sessionStartTime]);

  useEffect(() => {
    if (!isClassSessionActive || !_sessionStartTime) return;

    const minutes = getSessionDurationMinutes(selectedSessionNum);
    const deadlineAt = _sessionStartTime + minutes * 60 * 1000;
    const seenKey = `mathmaticore_deadline_notice_${selectedSessionNum}_${_sessionStartTime}`;

    const evaluate = () => {
      // The start stamp is the server's, so the elapsed time is too (Module 14 §ב),
      // and not before the server clock has been read (the 15s tick retries).
      if (!isServerClockKnown() || serverNow() < deadlineAt) return;
      try {
        if (localStorage.getItem(seenKey) === '1') return;
        localStorage.setItem(seenKey, '1');
      } catch {
        // Storage unavailable: still show once for this mount.
      }
      setDeadlineNotice({ sessionNumber: selectedSessionNum, minutes });
    };

    evaluate();
    const timer = setInterval(evaluate, 15000);
    return () => clearInterval(timer);
  }, [isClassSessionActive, _sessionStartTime, selectedSessionNum]);

  // The notice belongs to the open meeting; the summary to the one just closed.
  useEffect(() => {
    if (isClassSessionActive) setMeetingSummary(null);
    else setDeadlineNotice(null);
  }, [isClassSessionActive]);


  // Teacher-disconnect grace window (core/classSession.ts, 15 minutes).
  // PRD v7.1 Module 14: an opened session must survive a momentary teacher
  // disconnect (refresh, network blip, laptop sleep). Instead of closing the
  // session on disconnect, the server stamps teacherDisconnectedAt; clients
  // treat the session as closed only after the grace window of continuous
  // offline time, and a teacher who is back within it clears the stamp.
  //
  // This block used to also write a presence record to users/teachers/{uid}
  // on every connect, every 5 seconds and on disconnect. The database rules
  // let only an admin write there, so every one of those writes was refused —
  // an unhandled rejection on each reconnect and a permission warning every 5
  // seconds — and nothing in the app or the functions reads that presence.
  useEffect(() => {
    const activeSessionRef = ref(database, 'active_class_session');
    const disconnectStampRef = ref(database, 'active_class_session/teacherDisconnectedAt');

    // An onDisconnect hook fires once and is gone. This block used to run on
    // mount only, so after the FIRST blip (Wi-Fi drop, laptop lid) the server
    // stamped the disconnect, the dashboard reconnected — and nothing cleared the
    // stamp or re-armed the hook. Five minutes later all twelve learners saw
    // "המורה סגרה את המפגש" though she had pressed nothing. It now runs on every
    // (re)connect.
    let isConnected = false;
    // Whether THIS page lost its connection and got it back. A reload, and the
    // closing of a second dashboard tab or of the projector window, stamp the
    // disconnect too — and each raised "החיבור התנתק לרגע וחזר" on a page whose
    // connection never dropped. The stamp is still cleared; only a page that
    // dropped tells the teacher.
    let droppedHere = false;
    const armPresence = () => {
      // A read-only account is not the teacher of the lesson: its page arms no
      // disconnect stamp that could close the meeting for the learners.
      if (isReadOnlyNow()) return;
      // Cancel any legacy whole-session close hook an older client left armed,
      // then stamp the disconnect time. A refused hook must not surface as an
      // unhandled rejection; the grace window then simply is not armed.
      try {
        onDisconnect(activeSessionRef).cancel().catch(() => {});
        onDisconnect(disconnectStampRef).set(serverTimestamp()).catch(() => {});
      } catch (e) {
        console.warn('[TeacherDashboard] onDisconnect registration notice:', e);
      }
    };
    const unsubConnected = onValue(ref(database, '.info/connected'), (snap) => {
      const connectedNow = snap.val() === true;
      if (isConnected && !connectedNow) droppedHere = true;
      isConnected = connectedNow;
      if (isConnected) armPresence();
    });

    // The stamp is decided on the record the server holds, which reaches this
    // listener after the reconnect — never at the moment of reconnecting. The
    // stamp used to be cleared right then, blindly: a laptop that woke after
    // the grace window had expired, when the learners had long seen "המורה
    // סגרה את התחנה", cleared it and reopened the meeting for all twelve by
    // itself. PRD Module 14 §ב0: only the teacher opens a meeting (register
    // item 21). Past the window the meeting stays closed, and the record says
    // so in the shape the teacher's own close writes.
    //
    // Closing a SECOND dashboard tab stamps the disconnect too, while this one
    // is alive and never reconnects. A connected dashboard clears a stamp it
    // sees within the window, and tells the teacher. Her connection dropping is
    // invisible to her — the children carry on working and her screen looks
    // normal — but it starts the window after which the lesson closes for all
    // twelve of them. She should know it happened, and that nothing was lost.
    const unsubStamp = onValue(activeSessionRef, (snap) => {
      const rec = snap.exists() ? (snap.val() as Record<string, unknown>) : null;
      const stamp = typeof rec?.teacherDisconnectedAt === 'number' ? rec.teacherDisconnectedAt : null;
      if (!rec || stamp === null || !isConnected || isReadOnlyNow()) return;
      const graceMinutes = Math.round(TEACHER_DISCONNECT_GRACE_MS / 60000);
      if (rec.active === true && serverNow() - stamp > TEACHER_DISCONNECT_GRACE_MS) {
        // A meeting also past its 45-minute limit (left open yesterday) is
        // closed by the time-limit path above: one write and one toast, not
        // two closes with two contradicting reasons.
        const capAt = getSessionAutoCloseAt(rec);
        if (isServerClockKnown() && capAt !== null && serverNow() >= capAt) return;
        droppedHere = false;
        set(activeSessionRef, {
          active: false,
          status: 'closed',
          sessionNumber: null,
          endedAt: Date.now(),
          endedBy: 'teacher_disconnect_grace',
          teacherId: (rec.teacherId as string) || user?.uid || 'teacher',
          // Catch-up time: which run ended, for the reasons asked later.
          ...lastRunFields(rec.sessionNumber, readSessionStartedAt(rec)),
        }).catch((err) => {
          console.warn('[TeacherDashboard] closing after the disconnect grace failed:', err);
          toast.error(AUTO_CLOSE_NOT_SAVED_HE, { id: 'auto-close-not-saved' });
        });
        toast.info(
          `החיבור שלכם למערכת היה מנותק יותר מ-${graceMinutes} דקות, ולכן המפגש נסגר אצל התלמידים. כדי להמשיך, הפעילו את המפגש מחדש.`,
          { duration: 10000, id: 'teacher-reconnected' }
        );
        return;
      }
      set(disconnectStampRef, null).catch(() => {});
      armPresence();
      const dropped = droppedHere;
      droppedHere = false;
      // A stamp on a closed meeting (the hook outlives a close) is only cleared,
      // and so is one this page's own connection did not cause.
      if (rec.active !== true || !dropped) return;
      toast.info(
        `החיבור שלכם למערכת התנתק לרגע וחזר. המפגש נשאר פתוח והתלמידים המשיכו לעבוד. אם החיבור ייפול ליותר מ-${graceMinutes} דקות, המפגש ייסגר אצלם.`,
        { duration: 10000, id: 'teacher-reconnected' }
      );
    });

    return () => {
      unsubConnected();
      unsubStamp();
    };
  }, [user?.uid]);

  // The activation window for meeting N, left open while N was opened from
  // another dashboard tab (or device), closes without writing. Confirming it
  // used to write the record again, restarting N's start stamp and with it the
  // 45-minute limit (register item 8) for a meeting already under way.
  useEffect(() => {
    if (
      pendingActivationSession !== null &&
      !isStartingSession &&
      isClassSessionActive &&
      selectedSessionNum === pendingActivationSession
    ) {
      setPendingActivationSession(null);
      toast.info(`${meetingShortLabelHe(pendingActivationSession)}: המפגש כבר פתוח עכשיו.`, { id: 'session-already-active' });
    }
  }, [pendingActivationSession, isStartingSession, isClassSessionActive, selectedSessionNum]);

  const handleStartClassSession = async (sessionNum: number) => {
    const now = Date.now();
    const activeSessionId = `session_0${sessionNum}`;
    // Module 25 §ב.1: the pilot's one class — from the spec, not from whatever
    // class happens to be first in the admin store.
    const classId = PILOT_CLASS_ID;
    const schoolId = PILOT_SCHOOL_ID;

    try {
      // 1. Synchronize custom claims if needed
      if (auth.currentUser) {
        try {
          await ensureStaffRoleClaims("teacher");
        } catch (roleErr) {
          console.warn('[TeacherDashboard] Role sync notice (non-fatal):', roleErr);
        }
      }

      // Wake the coaching card's server instance, so the first child's card
      // does not pay its cold start on top of the model (1.10.2026). No model
      // call, nothing written, never awaited: the activation does not wait.
      SocraticEngine.warmUp();

      // 2. Primary Realtime Database Broadcast (Instant client sync for all 12 student pods <1000ms)
      // PRD Module 14 §ב: "השרת הוא מקור האמת היחיד והמוחלט עבור זמן המפגש".
      // The start is stamped by the server, like teacherDisconnectedAt below:
      // a teacher laptop 46 minutes slow used to write a start that every
      // reader (on serverNow()) already saw as past the 45-minute cap
      // (register item 8), and a fast one stretched the meeting.
      const outcome = await awaitSessionWrite(
        set(ref(database, 'active_class_session'), {
          active: true,
          status: 'active',
          sessionNumber: sessionNum,
          startedAt: serverTimestamp(),
          teacherId: user?.uid || 'teacher',
        }),
        (lateErr) => {
          // Refused after the connection returned: the SDK has already put the
          // previous record back on screen.
          console.error('Error starting class session (queued write):', lateErr);
          toast.error('פתיחת המפגש נדחתה על ידי השרת כשהחיבור חזר. נסו להפעיל שוב.');
        }
      );

      // The grace window: (re)arm only the disconnect stamp; never a whole-session
      // close hook. The set() above already cleared any stale stamp value.
      try {
        onDisconnect(ref(database, 'active_class_session/teacherDisconnectedAt')).set(serverTimestamp()).catch(() => {});
      } catch (discErr) {
        console.warn('[TeacherDashboard] onDisconnect stamp notice:', discErr);
      }

      // 3. Secondary Firestore atomic batch update for class & student documents (PRD v7.1 Module 14 §ב0)
      //
      // Not awaited. The RTDB broadcast above is what opens the meeting for
      // the class; this is a mirror. A Firestore write does not fail while
      // the server is unreachable — it waits — and awaiting it left the
      // activation window spinning, with "ביטול" disabled, long after every
      // learner was already in the meeting: the teacher could not reach
      // pause or close until she reloaded (live teacher↔learner scenario,
      // 28.9.2026). The mirror now completes in the background, and a
      // rejection still tells the teacher.
      //
      // The documents are read first: class_type (set by the admin, Module 25)
      // and students/*.created_at (Appendix A §1) are written only when missing
      // (core/classActivationMirror.ts). When they cannot be read (offline),
      // the merge leaves both as they are.
      const mirrorWrite = async () => {
        const classRef = doc(firestore, 'classes', classId);
        const studentRefs = Array.from({ length: 12 }, (_, i) => doc(firestore, 'students', `student_user${i + 1}`));
        let classDoc: Record<string, unknown> | null | undefined;
        let studentDocs: Array<Record<string, unknown> | null | undefined> = [];
        try {
          const [classSnap, ...studentSnaps] = await Promise.all([classRef, ...studentRefs].map((r) => getDoc(r)));
          classDoc = classSnap.exists() ? (classSnap.data() as Record<string, unknown>) : null;
          studentDocs = studentSnaps.map((snap) => (snap.exists() ? (snap.data() as Record<string, unknown>) : null));
        } catch (readErr) {
          console.warn('[TeacherDashboard] class documents could not be read before the mirror write:', readErr);
        }
        const mirror = activationMirror({
          classId, schoolId, teacherUid: user?.uid || null, activeSessionId, now, classDoc, studentDocs,
        });
        const batch = writeBatch(firestore);
        batch.set(
          classRef,
          {
            ...mirror.classFields,
            // Module 4 lists the class document's fields "strictly"; register
            // deviation 14 adds four, and `updated_at` is not one of them. It
            // was written here on every activation; the copy earlier
            // activations left on the document is removed.
            updated_at: deleteField(),
          },
          { merge: true }
        );
        // Module 19: support_profile_id/version belong to the silent
        // adaptation flow — stamping fixed values here on every activation
        // reset any adjusted profile back to its default.
        studentRefs.forEach((studentRef, i) => {
          batch.set(studentRef, mirror.studentFields.get(i + 1) ?? {}, { merge: true });
        });
        await batch.commit();
      };
      mirrorWrite().catch((firestoreErr) => {
        console.warn('[TeacherDashboard] Firestore class session sync failed:', firestoreErr);
        toast.warning('המפגש שודר לתלמידים, אך עדכון מסמכי הכיתה בשרת נדחה. ודאו שהחשבון משויך לכיתה.');
      });

      // The listener has usually set the server's stamp already (the SDK raises
      // our own write locally, resolved on the server clock); never overwrite it.
      // Only when no stamp has arrived yet, an estimate on the server clock.
      setSessionStartTime((prev) => prev ?? serverNow());
      setSelectedSessionNum(sessionNum);
      setPickedSessionNum(sessionNum);
      setClassSessionStatus('active');
      setIsClassSessionActive(true);
      if (outcome === 'queued') {
        toast.info('אין חיבור לאינטרנט. המפגש ייפתח כשהחיבור יחזור.', { id: 'session-write-offline' });
      } else {
        toast.success(`${meetingShortLabelHe(sessionNum)}: המפגש נפתח לכל תלמידי הכיתה.`);
      }
      return true;
    } catch (err: any) {
      console.error('Error starting class session:', err);
      // A refused write is undone by the SDK, which puts the record that was
      // there back on screen — a meeting the teacher opened earlier may still
      // be open. Setting "no meeting" here hid its pause and close buttons for
      // up to 30 seconds. The dashboard shows the live record instead.
      reapplySessionStateRef.current();

      const errCode = String(err?.code || '');
      const errMsg = String(err?.message || '');
      if (errCode.includes('permission-denied') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('permission')) {
        toast.error('ההרשאה נדחתה על ידי השרת. ודאו שהתחברתם לחשבון מורה מורשה.');
      } else {
        toast.error('שגיאה בהפעלת המפגש מול השרת. אנא בדקו את החיבור לרשת.');
      }
      return false;
    }
  };

  /**
   * Writes the teacher's close. Resolves true when the close was taken (or
   * queued offline), false when it was refused or another control was busy.
   * The button goes through requestCloseClassSession, which asks the
   * catch-up reasons first.
   */
  const handleEndClassSession = async (): Promise<boolean> => {
    if (isUpdatingSession || isUpdatingSessionRef.current) return false;
    isUpdatingSessionRef.current = true;
    setIsUpdatingSession(true);
    // The run this close ends, read before the write (the SDK raises our own
    // set() on the listener at once, and the record is then the closed one).
    const endingRun = lastRunFields(
      liveRecordRef.current?.sessionNumber ?? selectedSessionNum,
      readSessionStartedAt(liveRecordRef.current) ?? _sessionStartTime
    );
    try {
      if (auth.currentUser) {
        try {
          await ensureStaffRoleClaims("teacher");
        } catch (roleErr) {
          console.warn('[TeacherDashboard] Role sync notice (non-fatal):', roleErr);
        }
      }
      const outcome = await awaitSessionWrite(
        set(ref(database, 'active_class_session'), {
          active: false,
          status: 'closed',
          sessionNumber: null,
          endedAt: Date.now(),
          teacherId: user?.uid || 'teacher',
          // PRD 14 §ב1: is_completed follows the seven tasks "או לפי סגירה יזומה
          // של המורה". This marker is what tells the server that this close is
          // the teacher's (a reset writes the same record without it): closing
          // meeting 2 completes every learner who started it and did not finish
          // (functions/src/meeting2Close.ts; owner decision 29.9.2026).
          closedBy: 'teacher',
          // Catch-up time (owner decision 2.10.2026): which run ended.
          ...endingRun,
        }),
        (lateErr) => {
          console.error('Error ending class session (queued write):', lateErr);
          toast.error('שגיאה בסגירת המפגש מול השרת.');
        }
      );
      setIsClassSessionActive(false);
      setClassSessionStatus('closed');
      setSessionStartTime(null);
      if (outcome === 'queued') {
        toast.info('אין חיבור לאינטרנט. המפגש ייסגר כשהחיבור יחזור.', { id: 'session-write-offline' });
      } else {
        // A learner who finished sees the end screen, not the close screen (PRD 14 §ב0).
        toast.info(`המפגש נסגר. מי שלא סיים רואה "${teacherSentenceHe('closedTitle', useTeacherGenderStore.getState().gender)}"; מי שסיים רואה את מסך הסיום.`);
      }
      return true;
    } catch (err) {
      console.error('Error ending class session:', err);
      toast.error('שגיאה בסגירת המפגש מול השרת.');
      return false;
    } finally {
      isUpdatingSessionRef.current = false;
      setIsUpdatingSession(false);
    }
  };

  // Pause keeps the meeting open (active: true) and stamps status: 'paused';
  // every learner's screen shows the waiting overlay in place. Resume clears it.
  const handlePauseClassSession = async () => {
    if (readOnly || isUpdatingSession || isUpdatingSessionRef.current) return;
    isUpdatingSessionRef.current = true;
    setIsUpdatingSession(true);
    try {
      const outcome = await awaitSessionWrite(
        update(ref(database, 'active_class_session'), { status: 'paused', pausedAt: Date.now() }),
        (lateErr) => {
          console.error('Error pausing class session (queued write):', lateErr);
          toast.error('שגיאה בהשהיית המפגש מול השרת.');
        }
      );
      setClassSessionStatus('paused');
      if (outcome === 'queued') {
        toast.info('אין חיבור לאינטרנט. המפגש יושהה כשהחיבור יחזור.', { id: 'session-write-offline' });
      } else {
        toast.info('המפגש נעצר.');
      }
    } catch (err) {
      console.error('Error pausing class session:', err);
      toast.error('שגיאה בהשהיית המפגש מול השרת.');
    } finally {
      isUpdatingSessionRef.current = false;
      setIsUpdatingSession(false);
    }
  };

  const handleResumeClassSession = async () => {
    if (readOnly || isUpdatingSession || isUpdatingSessionRef.current) return;
    isUpdatingSessionRef.current = true;
    setIsUpdatingSession(true);
    try {
      const outcome = await awaitSessionWrite(
        update(ref(database, 'active_class_session'), { status: 'active', pausedAt: null, resumedAt: Date.now() }),
        (lateErr) => {
          console.error('Error resuming class session (queued write):', lateErr);
          toast.error('שגיאה בהמשך המפגש מול השרת.');
        }
      );
      setClassSessionStatus('active');
      if (outcome === 'queued') {
        toast.info('אין חיבור לאינטרנט. המפגש ימשיך כשהחיבור יחזור.', { id: 'session-write-offline' });
      } else {
        toast.success('המפגש ממשיך. התלמידים חזרו לעבודה מאותה נקודה.');
      }
    } catch (err) {
      console.error('Error resuming class session:', err);
      toast.error('שגיאה בהמשך המפגש מול השרת.');
    } finally {
      isUpdatingSessionRef.current = false;
      setIsUpdatingSession(false);
    }
  };

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Multi-Tenant context: TEACHER_ID is the canonical ID of the logged-in teacher (e.g. "12345" if rawUid is "teacher_12345" or "12345")
  // All student queries map under this ID.
  const TEACHER_ID = useMemo(() => {
    return extractTeacherId(user?.email, (user?.uid || user?.id) as string);
  }, [user]);

  useEffect(() => {
    const studentsRef = ref(database, 'users/students');
    const watchdog = setTimeout(() => {
      setIsLoading((still) => {
        if (still) setLoadTimedOut(true);
        return false;
      });
    }, 15000);
    const unsubscribe = onValue(studentsRef, (snapshot) => {
      clearTimeout(watchdog);
      setLoadTimedOut(false);
      setLoadRefused(false);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        const rawData = snapshot.val();
        const data = (rawData && typeof rawData === 'object') ? rawData : {};
        const allStudents = useStore.getState().students;
        const formattedStudents: Record<string, StudentData> = {};

        // 1. Add base demo students first — preserve their real qMatrixResults from the store
        for (const [id, s] of Object.entries(allStudents)) {
          formattedStudents[id] = {
            studentId: id,
            classId: 'demo',
            name: s.name,
            qMatrixResults: s.qMatrixResults ?? {
              task1_zero_placeholder: null,
              task3_flexible_regrouping: null,
              task4_basic_addition_fluency: null,
              task5_small_change: null,
              task6_subtraction_regrouping: null,
              task7_missing_subtrahend: null,
              task8_missing_addend: null,
            },
            traceData: s.traceData ?? { hesitation_events: 0, undo_clicks: 0 },
            completedMeeting2: s.completedMeeting2 ?? false,
            routeRecommendation: s.routeRecommendation ?? null,
            routeStatus: s.routeStatus ?? null,
            additionBoardEnabled: s.additionBoardEnabled ?? false,
          } as any;
        }

        // 2. Override with live cloud data.
        //
        // A learner can sit under several keys (student_user3, student_3, user3, 3).
        // Only the canonical student_userN carries presence; the learner's client
        // also writes its workspace state to userN, with no isOnline / lastPing.
        // Keys were merged in plain key order, "userN" sorts after
        // "student_userN", so the alias won: every learner read "לא מחובר" in the
        // reports tab, the learner list and the chat header during a live lesson,
        // and the zeros a full reset writes to the alias overrode the real
        // progress. Aliases first, the canonical record last.
        const canonicalLast = (key: string) => (/^student_user\d+$/.test(key) ? 1 : 0);
        const seenInSnapshot = new Set<string>();
        Object.keys(data).sort((a, b) => canonicalLast(a) - canonicalLast(b)).forEach((uid) => {
          const row = data[uid] ?? {};
          const normUid = normalizeStudentId(uid);
          // Only map to normalized pilot IDs (student_user1..student_user12)
          if (!normUid.startsWith('student_user')) return;

          let cleanName = row.name ?? row.profile?.displayName ?? row.studentName ?? formattedStudents[normUid]?.name ?? normUid.replace('student_user', 'תלמיד ');
          if (cleanName === 'student' || cleanName.startsWith('user') || cleanName.toLowerCase().startsWith('student_') || cleanName.startsWith('משתמש')) {
            const num = normUid.replace(/[^0-9]/g, '');
            cleanName = num ? `תלמיד ${num}` : cleanName;
          }

          // For a learner the snapshot contains, the snapshot is the truth. The
          // previous local copy used to be the fallback for every field, and the
          // database delivers a field a reset has just cleared as an ABSENT key —
          // so the old route status, recommendation, Q-matrix and workspace state
          // stayed on the teacher's screen until she reloaded the page. Only an
          // earlier alias row of THIS snapshot may fill a gap.
          const existingLocal = seenInSnapshot.has(normUid) ? formattedStudents[normUid] : undefined;
          seenInSnapshot.add(normUid);

          formattedStudents[normUid] = {
            ...(existingLocal || {}),
            ...row,
            studentId: normUid,
            classId: row.classId ?? existingLocal?.classId ?? 'live',
            name: cleanName,
            // Server stamp against the server clock (Module 18 §ג, core/presence.ts).
            isOnline: Boolean(row.isOnline === true && row.onlineStatus !== 'offline' && isHeartbeatFresh(row.lastPing)),
            lastPing: readLastPing(row.lastPing),
            lastActivityTimestamp: row.lastActivityTimestamp || 0,
            lastAction: row.isOnline === true ? (row.lastAction || 'פעיל') : 'לא מחובר',
            hasJoinedSession: row.hasJoinedSession === true || row.sessionJoined === true,
            highestCompletedMeeting: typeof row.highestCompletedMeeting === 'number' 
              ? row.highestCompletedMeeting 
              : (existingLocal?.highestCompletedMeeting ?? 0),
            physicalOverride: row.physicalOverride === true || row.physicalOverrideActive === true,
            physicalOverrideActive: row.physicalOverrideActive === true || row.physicalOverride === true,
            workspaceState: row.workspaceState || existingLocal?.workspaceState || null,
            // Catch-up time (core/meetingCompletion.ts): the saved copy of every
            // meeting and the meetings finished. An alias row of this snapshot
            // may fill a meeting the canonical row lacks; of two copies of one
            // meeting, the later by its stamp.
            [WORKSPACE_BY_MEETING_KEY]: mergeByMeeting(
              (existingLocal as Record<string, unknown> | undefined)?.[WORKSPACE_BY_MEETING_KEY],
              row[WORKSPACE_BY_MEETING_KEY],
              (a, b) => (workspaceSavedAt(b) > workspaceSavedAt(a) ? b : a)
            ),
            [COMPLETED_MEETINGS_KEY]: mergeByMeeting(
              (existingLocal as Record<string, unknown> | undefined)?.[COMPLETED_MEETINGS_KEY],
              row[COMPLETED_MEETINGS_KEY],
              (a, b) => a || b
            ),
            qMatrixResults: Object.assign(
              {},
              existingLocal?.qMatrixResults || {},
              row.qMatrixResults || {}
            ),
            // The learner's browser computes the mastery profile at the end of
            // meeting 2 and syncs it (useStore.updateConceptMastery →
            // syncConceptMastery). This builder never carried it onto the row,
            // so s.conceptMastery was undefined for every learner on the
            // teacher's screen — and every consumer guards on it. The result:
            // all six clustering widgets counted 0 and hid themselves, the
            // class skills chart skipped every learner and drew six empty
            // bars, and the "learners with a mastery profile" counter read 0.
            // The tab looked like a class that had never been assessed.
            conceptMastery: row.conceptMastery || existingLocal?.conceptMastery || undefined,
            traceData: {
              hesitation_events: typeof row.traceData?.hesitation_events === 'number'
                ? row.traceData.hesitation_events
                : (typeof row.workspaceState?.hesitationCount === 'number' ? row.workspaceState.hesitationCount : (row.hesitating?.hesitating ? 1 : 0)),
              undo_clicks: typeof row.traceData?.undo_clicks === 'number'
                ? row.traceData.undo_clicks
                : (typeof row.workspaceState?.undoCount === 'number' ? row.workspaceState.undoCount : 0),
            },
            completedMeeting2: row.completedMeeting2 ?? existingLocal?.completedMeeting2 ?? false,
            routeRecommendation: row.routeRecommendation ?? existingLocal?.routeRecommendation ?? null,
            routeStatus: row.routeStatus ?? existingLocal?.routeStatus ?? null,
            additionBoardEnabled: Boolean(row.additionBoardEnabled || row.forceAdditionHelper || existingLocal?.additionBoardEnabled),
            forceAdditionHelper: Boolean(row.forceAdditionHelper || existingLocal?.forceAdditionHelper),
            scaffoldLevel: row.scaffoldLevel !== undefined ? row.scaffoldLevel : existingLocal?.scaffoldLevel,
            pedagogicalPath: row.pedagogicalPath || existingLocal?.pedagogicalPath,
            graded_track: row.graded_track === true,
            teacher_gate_approved: row.teacher_gate_approved ?? existingLocal?.teacher_gate_approved ?? false,
            reflections: row.reflections ?? existingLocal?.reflections ?? null,
            currentTask: row.workspaceState?.standardTaskIdx || 0,
            sessionNum: row.workspaceState?.sessionNumber || 1,
            radar: {
              hesitations: Math.max(row.workspaceState?.hesitationCount || 0, row.hesitating?.hesitating ? 1 : 0),
              deletions: row.workspaceState?.undoCount || 0,
            },
          } as any;
        });
        setStudents(formattedStudents);
        useStore.setState({ students: formattedStudents, firebaseLoaded: true });
        setIsLoading(false);
      }, 300);
    }, (error) => {
      console.error("Firebase permission denied or network error on users/students:", error);
      clearTimeout(watchdog);
      const refusal = `${(error as { code?: string })?.code ?? ''} ${error?.message ?? ''}`;
      setLoadRefused(/permission[_ -]?denied/i.test(refusal));
      setLoadTimedOut(true);
      setIsLoading(false);
    });
    return () => {
      clearTimeout(watchdog);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      unsubscribe();
    };
  }, [TEACHER_ID, user?.role]);

  // Clustering Logic based on Q-Matrix
  // Memoized: a fresh array identity every render made downstream useMemos
  // (incl. the alerts list) recompute on every keystroke.
  const allStudents = useMemo(() => {
    const list: StudentData[] = [];
    for (let i = 1; i <= 12; i++) {
      const normId = `student_user${i}`;
      const stdId = `student_${i}`;
      const numId = String(i);
      const studentObj = students[normId] || students[stdId] || students[numId];
      if (studentObj) {
        list.push({ ...studentObj, studentId: normId, name: `תלמיד ${i}` });
      }
    }
    return list;
  }, [students]);

  // The drawer's learner, live (see drawerStudentId).
  const drawerStudent = useMemo(
    () => (drawerStudentId ? allStudents.find((s) => s.studentId === drawerStudentId) ?? null : null),
    [allStudents, drawerStudentId]
  );


  // Module 14 §ב0: the picker must show all eight sessions AND the state of each
  // (buildSessionRows: open now, finished by all, by some, or by none).
  const sessionRows: SessionRow[] = useMemo(
    // Per meeting (completedMeetings/m{N}, core/meetingCompletion.ts): a learner
    // who missed meeting 3 and finished meeting 4 is not counted in meeting 3.
    () => buildSessionRows(
      allStudents.map((s) => (meeting: number) => isMeetingFinished(s as unknown as Record<string, unknown>, meeting)),
      isClassSessionActive ? selectedSessionNum : null,
    ),
    [allStudents, isClassSessionActive, selectedSessionNum]
  );

  // שלושת התחומים של מסמך 03 (§"מפגש שתיים"): המבנה העשרוני והאפס, הקבצה
  // ופריטה, וחישוב במאונך. החלטת בעל המוצר 26.9.2026.
  const decimalStructureGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.decimal_structure < 0.5
  );
  // "הקבצה ופריטה": אין ערבוב (הוראת בעל המוצר 26.9.2026). לומד שייך לקבוצה אם
  // המספר המאוחד מתחת ל-0.5 או אם אחד משני החלקים לבדו מתחתיו — אותו כלל
  // (isStudentBelow) משמש את הווידג'ט, את הכרטיס ואת התרשים. המספר המאוחד
  // מחושב מתוצאות המשימות עצמן כשהן קיימות, לא מהפרופיל השמור.
  const regroupingFluencyGroup = allStudents.filter(
    (s) => s.conceptMastery && isStudentBelow(s, 'regrouping_fluency', 0.5)
  );
  const proceduralFluencyGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.procedural_fluency < 0.5
  );

  // הקבצה = משימות 5 ו-6, פריטה = משימות 3 ו-7. שני החלקים מוצגים ליד המאוחד.
  const regroupingOf = (s: StudentData) =>
    computeRegroupingDomain(
      s.qMatrixResults as Record<string, unknown> | undefined,
      s.conceptMastery?.regrouping_fluency
    );
  const regroupingKindCell = (score: RegroupingKindScore) =>
    score.ratio === null ? "טרם ניגש" : `${Math.round(score.ratio * 100)}% (${score.succeeded}/${score.attempted})`;

  // כמה תלמידים כבר סיימו את מפגש האבחון ויש להם פרופיל שליטה. בלי המספר
  // הזה גרף שמציג אפס נראה בדיוק כמו כיתה בלי פערים.
  const studentsWithMastery = useMemo(
    () => allStudents.filter((s) => Boolean(s.conceptMastery)).length,
    [allStudents]
  );

  // An empty group table: nobody assessed yet, or nobody struggling there.
  // Both used to read "אין נתונים להצגה".
  const emptyGroupHe = studentsWithMastery === 0
    ? 'אין עדיין נתונים: אף תלמיד לא סיים את מפגש 2.'
    : 'אין תלמידים שמתקשים בתחום הזה.';

  const approveRoute = useStore((s) => s.approveRoute);

  // Aggregate data for Chart
  const qMatrixData = useMemo(() => {
    const counts = DIAGNOSTIC_DOMAINS.map((domain) => ({ name: CONCEPT_LABELS_HE[domain], success: 0, struggle: 0 }));
    allStudents.forEach((s) => {
      if (!s.conceptMastery) return;
      DIAGNOSTIC_DOMAINS.forEach((domain, i) => {
        // Same rule as the widget and the group card (isStudentBelow), at the chart's 0.8 bar.
        if (isStudentBelow(s, domain, 0.8)) counts[i].struggle++; else counts[i].success++;
      });
    });
    return counts;
  }, [allStudents]);

  // --- Module 20: Diagnostic Gate Students Computation (WP6 Formulas & Firestore Sync) ---
  // gateEvidence.ts: the one reading of the matrix recommendation, the meeting-2
  // score and the tasks that need support — the table, the drawer and the
  // learner journey's badge all take it from there.
  const gateStudentItems: GateStudentItem[] = useMemo(
    () => buildGateStudentItems(students, firestoreSession2Docs),
    [students, firestoreSession2Docs]
  );

  /** The same evidence for one learner, whether or not meeting 2 is finished. */
  const gateEvidenceFor = (studentId: string | null | undefined): GateStudentItem | null => {
    const n = gateLearnerNumber(studentId);
    return n === null ? null : buildGateStudentItem(n, students, firestoreSession2Docs);
  };

  // Started meeting 2 and did not finish (owner decision 2.10.2026). While
  // meeting 2 is open they are simply still working; once it is closed —
  // by time too — they wait for the teacher, so the tab counts them.
  const unfinishedMeeting2 = useMemo(
    () => buildUnfinishedMeeting2Items(students, firestoreSession2Docs),
    [students, firestoreSession2Docs]
  );
  const isMeeting2Open = isClassSessionActive && selectedSessionNum === 2;

  const pendingApprovalsBadgeCount =
    gateStudentItems.filter((g) => !g.isApproved).length + (isMeeting2Open ? 0 : unfinishedMeeting2.length);

  // The side action queue (owner, 11.10.2026): the radar's help flags, and in
  // meeting 2 the learners waiting at the gate.
  const learnerNumberOf = (studentId: string): number | null => {
    const n = parseInt(String(studentId).replace(/\D/g, ''), 10);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
  };
  const queueLearners = allStudents
    .map((s) => ({ studentNumber: learnerNumberOf(s.studentId), helpRequested: Boolean(s.helpRequested || s.handRaised) }))
    .filter((l): l is { studentNumber: number; helpRequested: boolean } => l.studentNumber !== null);
  const queueGateLearners = isMeeting2Open
    ? gateStudentItems.filter((g) => !g.isApproved).map((g) => gateLearnerNumber(g.studentId)).filter((n): n is number => n !== null)
    : [];
  // The queue's gate item leads to the approval on the learner's tile (owner, 11.10.2026: no approval of its
  // own); the evidence drawer only if the tile is not on screen.
  const openGateForLearner = (n: number) => {
    if (focusTileGateApproval(n)) return;
    const st = allStudents.find((s) => learnerNumberOf(s.studentId) === n);
    if (st) setGateStudent(st);
  };

  // ── Catch-up time ──────────────────────────────────────────────────────────
  // Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \
  // זמן נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה
  // למפגש הבא". The meeting the bar speaks of: the open one, or the one the
  // last close ended. Its run started at the server stamp of that opening.
  const catchUpMeeting: number | null = isClassSessionActive ? selectedSessionNum : lastClosedRun?.meeting ?? null;
  const catchUpRunStartedAt: number | null = isClassSessionActive ? _sessionStartTime : lastClosedRun?.startedAt ?? null;

  // Started and not finished. Meeting 2 keeps its own reading (#207, the gate tab).
  const unfinishedInCatchUpMeeting: UnfinishedLearner[] = useMemo(() => {
    if (catchUpMeeting === null) return [];
    if (catchUpMeeting === 2) return unfinishedMeeting2AsLearners(unfinishedMeeting2);
    return buildUnfinishedLearners(students as unknown as Record<string, Record<string, unknown>>, catchUpMeeting);
  }, [catchUpMeeting, students, unfinishedMeeting2]);

  /** "N תלמידים (עוד) לא סיימו את מפגש M": the strip's heading, and the bar's chip during a meeting. */
  const catchUpHeadingHe = unfinishedInCatchUpMeeting.length === 1
    ? `תלמיד אחד ${isClassSessionActive ? 'עוד ' : ''}לא סיים את מפגש ${catchUpMeeting}`
    : `${unfinishedInCatchUpMeeting.length} תלמידים ${isClassSessionActive ? 'עוד ' : ''}לא סיימו את מפגש ${catchUpMeeting}`;

  // The reasons already recorded for that meeting (catchup_records), live.
  const [catchUpRecords, setCatchUpRecords] = useState<{ meeting: number; records: Record<number, CatchUpRecord> } | null>(null);
  useEffect(() => {
    if (catchUpMeeting === null) return;
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeCatchUpRecords(catchUpMeeting, (records) => setCatchUpRecords({ meeting: catchUpMeeting, records }));
    } catch (err) {
      console.warn('[TeacherDashboard] catch-up records listener notice:', err);
    }
    return () => { if (unsub) unsub(); };
  }, [catchUpMeeting]);

  /** The unfinished learners of `meeting` with no reason recorded since this run started. */
  const learnersNeedingReason = (meeting: number, runStartedAt: number | null): UnfinishedLearner[] => {
    if (meeting !== catchUpMeeting) return [];
    const records = catchUpRecords?.meeting === meeting ? catchUpRecords.records : {};
    // No start stamp yet (our own activation's placeholder): every reason
    // recorded before now belongs to an earlier run.
    const since = runStartedAt ?? serverNow();
    return unfinishedInCatchUpMeeting.filter((l) => needsReason(records[l.studentNumber], since));
  };

  const [catchUpDialog, setCatchUpDialog] = useState<{
    meeting: number;
    trigger: 'close' | 'open_other';
    nextMeeting: number | null;
    learners: UnfinishedLearner[];
    /** The meeting was open when the dialog was asked for (a reopen closes it first). */
    wasOpen: boolean;
  } | null>(null);
  const [isSavingCatchUp, setIsSavingCatchUp] = useState(false);
  /** The teacher cancelled the dialog while its reasons were being saved: the action is not taken. */
  const catchUpCancelledRef = useRef(false);
  /**
   * One submission of the dialog = one round id (recordedAt). When the chosen
   * action then fails (the close or the open is refused) and the teacher tries
   * again, the same id is reused and learners already written are skipped, so a
   * retry never adds a second round — and never doubles the catch-up minutes.
   */
  const catchUpSubmissionRef = useRef<{ meeting: number; action: CatchUpAction; recordedAt: number; written: Set<number>; done: boolean } | null>(null);

  /** Opens a meeting for the class, with the activation window's busy state. */
  const openMeetingForClass = async (meeting: number): Promise<boolean> => {
    setIsStartingSession(true);
    try {
      return await handleStartClassSession(meeting);
    } finally {
      setIsStartingSession(false);
    }
  };

  /** Learners whose help call is on now (the radar's blue tiles). */
  const helpLearnerNumbers = queueLearners.filter((l) => l.helpRequested).map((l) => l.studentNumber).sort((a, b) => a - b);

  /**
   * The summary of the open meeting at this moment, before the close turns
   * every tile grey: read-only, from the records and the mediation log.
   */
  const captureMeetingSummary = (): MeetingSummary | null => {
    if (!isClassSessionActive) return null;
    return buildMeetingSummary({
      records: students as unknown as Record<string, Record<string, unknown>>,
      meeting: selectedSessionNum,
      events: mediationEvents,
      serverNow: serverNow(),
      hesitationThresholdSeconds: getHesitationThresholdSeconds(),
    });
  };

  /** The teacher's close, then the summary of what was closed. */
  const closeWithSummary = async (): Promise<boolean> => {
    const summary = captureMeetingSummary();
    const ok = await handleEndClassSession();
    if (ok && summary) setMeetingSummary(summary);
    return ok;
  };

  /** Step 1 of the checklist: every open help call marked handled, in one click. */
  const clearAllHelpCalls = async () => {
    if (readOnly) return;
    try {
      await Promise.all(helpLearnerNumbers.map((n) => clearHelpRequest(`student_user${n}`)));
    } catch (err) {
      console.error('[TeacherDashboard] clearing the help calls failed:', err);
      toast.error(LESSON_FLOW_HE.clearAllHelpFailed);
    }
  };

  /**
   * "סגרו את המפגש" (owner, 11.10.2026): one checklist when there is anything to
   * look at — help calls, the projector, who did not finish (their reasons stay
   * mandatory), unrecorded mediation events, and in meeting 2 what the close
   * does. With nothing to look at, the close goes ahead as before.
   */
  const requestCloseClassSession = async () => {
    if (isUpdatingSession || isUpdatingSessionRef.current || isSavingCatchUp) return;
    const learners = learnersNeedingReason(selectedSessionNum, _sessionStartTime);
    if (learners.length > 0) {
      setCatchUpDialog({ meeting: selectedSessionNum, trigger: 'close', nextMeeting: null, learners, wasOpen: true });
    }
    if (learners.length > 0 || helpLearnerNumbers.length > 0 || isProjectorModeActive || unrecordedMediationCount > 0 || selectedSessionNum === 2) {
      setCloseChecklistOpen(true);
      return;
    }
    await closeWithSummary();
  };

  /**
   * The activation window confirmed meeting `next`. While another meeting N is
   * open, or N was the last one and closed by time, its unfinished learners'
   * reasons come first. Returns true when the dialog took over.
   */
  const catchUpBeforeOpening = (next: number): boolean => {
    const meeting = catchUpMeeting;
    if (meeting === null) return false;
    const openNow = isClassSessionActive;
    if (!openNow && !lastClosedRun?.byTime) return false;
    const learners = learnersNeedingReason(meeting, catchUpRunStartedAt);
    if (learners.length === 0) return false;
    setCatchUpDialog({ meeting, trigger: 'open_other', nextMeeting: next, learners, wasOpen: openNow });
    return true;
  };

  /**
   * The teacher's choice in the dialog. The reasons are written first, but the
   * close or open never depends on them: the wait is bounded
   * (CATCH_UP_SAVE_WAIT_MS), and after a refusal, a timeout or a missing sign-in
   * the chosen action still goes ahead — a meeting must always be closable,
   * offline too, as it was before the dialog existed. A write still in flight
   * stays queued by the Firestore SDK; if it is finally refused, one toast says
   * so. Cancelling while saving stops the action. Then:
   *   reopen   — the meeting is closed (when open) and opened again for the
   *              class: a new run, whose start opens the catch-up rounds.
   *   continue — the close, or the other meeting, goes ahead as before.
   */
  const handleCatchUpChoice = async (action: CatchUpAction, entries: CatchUpReasonEntry[]) => {
    const d = catchUpDialog;
    if (!d || isSavingCatchUp) return;
    catchUpCancelledRef.current = false;
    setIsSavingCatchUp(true);
    try {
      const prev = catchUpSubmissionRef.current;
      const sub = prev && !prev.done && prev.meeting === d.meeting && prev.action === action
        ? prev
        : { meeting: d.meeting, action, recordedAt: serverNow(), written: new Set<number>(), done: false };
      catchUpSubmissionRef.current = sub;

      const notSavedHe = catchUpNotSavedHe(d, action);
      // The Firebase Auth uid: the rules require recorded_by == request.auth.uid.
      // The app's user.uid is the display id "teacher_<id>", which the rules refuse.
      const teacherUid = auth.currentUser?.uid || '';
      const toWrite = entries.filter((e) => !sub.written.has(e.studentNumber));
      let saved: 'saved' | 'refused' | 'slow' = 'saved';
      if (!teacherUid) {
        saved = 'refused';
      } else if (toWrite.length > 0) {
        const all = Promise.all(toWrite.map((entry) =>
          recordCatchUpReasons({ meeting: d.meeting, action, entries: [entry], teacherUid, recordedAt: sub.recordedAt })
            .then(() => { sub.written.add(entry.studentNumber); })));
        saved = await Promise.race([
          all.then(() => 'saved' as const, (err) => {
            console.error('[TeacherDashboard] recording catch-up reasons failed:', err);
            return 'refused' as const;
          }),
          new Promise<'slow'>((resolve) => setTimeout(() => resolve('slow'), CATCH_UP_SAVE_WAIT_MS)),
        ]);
        if (saved === 'slow') {
          // Still queued (offline / slow network). Only a final refusal is reported.
          all.catch((err) => {
            console.error('[TeacherDashboard] recording catch-up reasons failed later:', err);
            toast.error(notSavedHe);
          });
        }
      }
      if (catchUpCancelledRef.current) return;
      setCatchUpDialog(null);
      setCloseChecklistOpen(false);

      let ok: boolean;
      if (action === 'reopen') {
        // Meeting 2: the teacher's close (closedBy 'teacher') completes every
        // learner who started it (meeting2Close.ts) — the opposite of giving
        // them time. A catch-up of meeting 2 therefore starts a new run in
        // place, with no close in between; only "סגרו את המפגש" completes.
        ok = !(d.wasOpen && d.meeting !== 2 && !(await handleEndClassSession())) && (await openMeetingForClass(d.meeting));
      } else if (d.trigger === 'close') {
        ok = await closeWithSummary();
      } else {
        ok = d.nextMeeting === null || (await openMeetingForClass(d.nextMeeting));
      }
      if (ok) sub.done = true;
      // A meeting this dialog opened is the teacher's own activation: she lands
      // on the radar, as from the activation window (PRD 14 §ב, owner 10.10.2026).
      const openedMeeting = action === 'reopen' || (d.trigger !== 'close' && d.nextMeeting !== null);
      if (ok && openedMeeting) handleTabChange("heatmap");
      if (saved === 'refused' && ok) toast.error(notSavedHe);
    } finally {
      setIsSavingCatchUp(false);
    }
  };

  /** "The reasons were not saved, but …" — what did happen, for the toast. */
  const catchUpNotSavedHe = (d: NonNullable<typeof catchUpDialog>, action: CatchUpAction): string => {
    if (action === 'reopen') return `הסיבות לא נשמרו, ולכן זמן ההשלמה לא יתועד. מפגש ${d.meeting} נפתח שוב.`;
    if (d.trigger === 'close') return `הסיבות לא נשמרו, אבל מפגש ${d.meeting} נסגר.`;
    return d.nextMeeting !== null ? `הסיבות לא נשמרו, אבל מפגש ${d.nextMeeting} נפתח.` : 'הסיבות לא נשמרו.';
  };

  const handleApproveGateStudent = async (studentId: string, path: PedagogicalPath): Promise<boolean> => {
    setIsApprovingGate(true);
    const normNum = studentId.replace(/\D/g, '') || '1';

    try {
      // Every approval surface must go through the one canonical implementation
      // (core/teacherGate.ts) so the Firestore SessionDocument stays the sole
      // source of truth and the RTDB mirror always reaches student_user{N} —
      // the exact key the student's own live listener reads (see
      // normalizeStudentId / StudentWorkspacePage). A hand-duplicated write
      // here that missed that key previously left the student stuck on the
      // approval-waiting screen even though Firestore showed "approved".
      const result = await approveTeacherGate(studentId, path, user?.uid || null);

      if (!result.ok) {
        toast.error(result.message);
        return false;
      }

      // Optimistic local Zustand update — cover every alias this codebase's
      // RTDB writes fan out to (student_userN, student_N, bare N), since
      // whichever of those actually exist as separate entries in local state
      // should reflect the approval immediately without waiting on the RTDB
      // round trip.
      approveRoute(`student_user${normNum}`);
      approveRoute(`student_${normNum}`);
      approveRoute(normNum);

      toast.success(`תלמיד ${normNum} אושר ל${meetingShortLabelHe(3)} (${ROUTE_NAME_HE[path]}).`);
      return true;
    } catch (err: any) {
      console.error('[TeacherDashboard] Gate approval write failed:', err);
      toast.error(`שגיאה ב${TEACHER_GATE_HE}: ${err?.message || 'אנא בדקו את החיבור לרשת'}`);
      return false;
    } finally {
      setIsApprovingGate(false);
    }
  };

  const handleBatchApproveAll = async (pathMap: Record<string, PedagogicalPath>) => {
    const entries = Object.entries(pathMap);
    if (entries.length === 0) {
      toast.info('אין תלמידים הממתינים לאישור.');
      return;
    }
    setIsApprovingGate(true);
    try {
      // The old version toasted "כולם אושרו בהצלחה" unconditionally — even when
      // every single approval failed (each failure toasts and returns quietly).
      let succeeded = 0;
      for (const [sId, path] of entries) {
        if (await handleApproveGateStudent(sId, path)) succeeded++;
      }
      if (succeeded === entries.length) {
        // Only the learners with a recommendation are in the map; the rest still wait (owner, 11.10.2026).
        toast.success(succeeded === 1 ? 'המסלול המומלץ אושר לתלמיד אחד.' : `המסלול המומלץ אושר ל-${succeeded} תלמידים.`);
      } else if (succeeded > 0) {
        toast.warning(`אושרו ${succeeded} מתוך ${entries.length} תלמידים. עבור השאר הוצגה שגיאה מפורטת.`);
      }
    } finally {
      setIsApprovingGate(false);
    }
  };

  const handleTabChange = (
    tab:
      | "heatmap"
      | "clustering"
      | "diagnostic_reports"
      | "chat_students"
      | "class_management",
  ) => {
    setActiveTab(tab);
    setInputText("");
    // The chat opens on a learner who wrote and is waiting. The learner chosen
    // in the reports tab is selected here too, and the chat opened on that
    // learner's conversation while another learner's message sat unread.
    if (tab === "chat_students") {
      const hasUnread = (id: string) => {
        const normId = normalizeStudentId(id);
        return messages.some((m) => normalizeStudentId(m.senderId) === normId && !m.read);
      };
      if (!selectedStudentId || !hasUnread(selectedStudentId)) {
        const waiting = allStudents.find((s) => hasUnread(s.studentId));
        if (waiting) setSelectedStudentId(waiting.studentId);
      }
    }
  };

  // For Admin Chat — Module 22 lives in Firestore `messages` (written only by
  // the sendTeacherAdminMessage callable), not in the RTDB chat store used for
  // teacher<->student chat. Reading the RTDB store here meant admin replies
  // could never appear no matter how many were sent.
  const [adminMessages, setAdminMessages] = useState<ChatMessage[]>([]);
  useEffect(() => {
    if (!user?.uid) return;
    // The admin console lists teachers under an email-derived key, and that is
    // what it addresses replies to — the raw auth uid never appears there.
    const teacherKey = user.email ? String(user.email).trim().replace(/[@.#$[\]]/g, '_') : user.uid;
    const isMine = (id: string) => id === teacherKey || id === user.uid;

    const unsub = onSnapshot(collection(firestore, "messages"), (snapshot) => {
      const mine = snapshot.docs
        .map((d) => {
          const raw = d.data() as any;
          return {
            id: d.id,
            senderId: raw.sender_id,
            senderName: raw.sender_id === 'admin' ? 'הנהלה' : 'מורה',
            receiverId: raw.receiver_id,
            text: raw.message_body,
            timestamp: raw.timestamp,
            read: Boolean(raw.read),
          } as ChatMessage;
        })
        .filter(
          (m) =>
            (isMine(m.senderId) && m.receiverId === "admin") ||
            (m.senderId === "admin" && isMine(m.receiverId)),
        )
        .sort((a, b) => a.timestamp - b.timestamp);
      setAdminMessages(mine);
    }, (err) => {
      console.error('[Module 22] Firestore admin-chat listener error:', err);
    });
    return () => unsub();
  }, [user?.uid, user?.email]);

  // The drawer opens at its newest message and follows each new one, as the
  // learner chat does.
  const adminMessagesScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = adminMessagesScrollRef.current;
    if (isAdminChatDrawerOpen && el) el.scrollTop = el.scrollHeight;
  }, [isAdminChatDrawerOpen, adminMessages.length]);

  // For Student Chat
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  const filteredChatStudents = useMemo(() => {
    return allStudents.filter(
      (s) =>
        !studentSearchQuery.trim() ||
        (s.name || "").toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
        (s.studentId || "").toLowerCase().includes(studentSearchQuery.toLowerCase())
    );
  }, [allStudents, studentSearchQuery]);

  const studentMessages = useMemo(() => {
    if (!user || !selectedStudentId) return [];
    const targetId = normalizeStudentId(selectedStudentId);
    const chatMessages = messages.filter(
      (m) => normalizeStudentId(m.senderId) === targetId || normalizeStudentId(m.receiverId) === targetId
    );
    return chatMessages.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, user, selectedStudentId]);

  // The newest message and the typing line are where the teacher works: open a
  // conversation at its end, follow each new message, and put the cursor in the box.
  const studentMessagesScrollRef = useRef<HTMLDivElement>(null);
  const studentChatInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = studentMessagesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeTab, selectedStudentId, studentMessages.length]);
  useEffect(() => {
    if (activeTab === "chat_students" && selectedStudentId) {
      studentChatInputRef.current?.focus({ preventScroll: true });
    }
  }, [activeTab, selectedStudentId]);

  // Auto-select student with unread messages when opening Student Chat
  useEffect(() => {
    if (activeTab === "chat_students" && !selectedStudentId && allStudents.length > 0) {
      const studentWithUnread = allStudents.find((s) => {
        const normId = normalizeStudentId(s.studentId);
        return messages.some((m) => normalizeStudentId(m.senderId) === normId && !m.read);
      });
      if (studentWithUnread) {
        setSelectedStudentId(studentWithUnread.studentId);
      }
    }
  }, [activeTab, selectedStudentId, allStudents, messages]);

  useEffect(() => {
    if (!user || readOnly) return;
    
    // Process admin messages. They live in Firestore `messages` (Module 22),
    // so they are marked read there — this used to call the RTDB chat
    // store’s markAsRead, which never contains an admin message, and the
    // badge never cleared. The rules let the receiving teacher change
    // exactly the `read` field.
    if (isAdminChatDrawerOpen) {
      const unreadAdmin = adminMessages.filter(m => m.senderId === "admin" && !m.read);
      if (unreadAdmin.length > 0) {
        const batch = writeBatch(firestore);
        unreadAdmin.forEach((m) => batch.update(doc(firestore, "messages", m.id), { read: true }));
        batch.commit().catch((err) => {
          console.warn("[Module 22] mark-read failed:", err);
          toast.error('ההודעות מההנהלה לא סומנו כנקראו. סגרו את החלון ופתחו אותו שוב.', { id: 'admin-mark-read-failed' });
        });
      }
    }
    
    // Process student messages
    if (activeTab === "chat_students" && selectedStudentId && user.role !== "admin") {
      const targetId = normalizeStudentId(selectedStudentId);
      const unreadStudent = messages.filter(m => normalizeStudentId(m.senderId) === targetId && !m.read);
      if (unreadStudent.length > 0) {
        markAsRead(user.uid as string, targetId);
      }
    }
  }, [isAdminChatDrawerOpen, activeTab, selectedStudentId, messages, adminMessages, user, markAsRead, readOnly]);

  // PRD 7.3 Module 22 §ב.1: "הלקוח סורק בזמן אמת את תיבת הקלט. אם זוהו ...
  // כפתור השליחה נחסם ומוצגת התראה עדינה". The scan used to run only on
  // "send", and answered with a toast; the button stayed enabled meanwhile.
  const adminInputPiiNotice = useMemo(() => {
    if (!adminInputText.trim()) return null;
    // PRD Module 3 §א (v7.9): a filter failure locks nothing; it is logged.
    try {
      const validation = validateChatInputForPII(adminInputText);
      return validation.valid ? null : (validation.errorHe || 'הודעה מכילה פרטים מזהים. יש להשתמש במזהה 1-12 בלבד.');
    } catch (err) {
      reportPiiFilterFailure('TeacherDashboard admin chat (live scan)', err);
      return null;
    }
  }, [adminInputText]);

  const handleSendAdmin = async () => {
    if (readOnly || !adminInputText.trim() || !user || isSendingAdmin || isSendingAdminRef.current) return;
    if (adminInputPiiNotice) return; // the notice is already on screen, under the box
    isSendingAdminRef.current = true;
    setIsSendingAdmin(true);

    // Module 22: Tier 1 client-side check. PRD Module 3 §א (v7.9): if the
    // filter itself fails, nothing is locked — the failure is logged and the
    // message goes on to the server, whose anonymizer still runs on it.
    let validation: { valid: boolean; errorHe?: string } = { valid: true };
    try {
      validation = validateChatInputForPII(adminInputText);
    } catch (err) {
      reportPiiFilterFailure('TeacherDashboard admin chat', err);
    }
    if (!validation.valid) {
      toast.warning(validation.errorHe || 'הודעה מכילה פרטים מזהים. יש להשתמש במזהה 1-12 בלבד.');
      isSendingAdminRef.current = false;
      setIsSendingAdmin(false);
      return;
    }
    const cleanText = anonymizeChatMessageBody(adminInputText.trim());

    // Module 22: Tier 2 anonymization is a *server-side* guarantee, and the
    // admin console reads this channel from Firestore `messages`. Writing
    // straight to RTDB here (as this used to) skipped the roster-based name
    // substitution entirely and dropped the message into a store no admin
    // ever reads — it looked sent and reached nobody.
    // Module 22 §ה: with no network the message is queued (IndexedDB, Module 17)
    // and sent through the same Cloud Function when the connection returns, so
    // the server-side anonymizer still runs on it. client_message_id is the
    // document id on the server: a retry overwrites, never duplicates.
    const payload = {
      receiver_id: "admin",
      message_body: cleanText,
      school_id: useAuthStore.getState().activeClass?.school_id || "school_pilot_01",
      class_name: "המבקרים",
      client_message_id: `tam_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    };
    const queueForReconnect = async () => {
      await indexedDBQueue.enqueueCallable("sendTeacherAdminMessage", payload, payload.client_message_id);
      setAdminInputText("");
      toast.info('אין חיבור לרשת. ההודעה נשמרה ותישלח להנהלה כשהחיבור יחזור.');
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await queueForReconnect();
        return;
      }
      const sendFn = httpsCallable(functions, "sendTeacherAdminMessage");
      await sendFn(payload);
      setAdminInputText("");
    } catch (err) {
      const code = String((err as { code?: string })?.code ?? '');
      const transient = code.endsWith('unavailable') || code.endsWith('deadline-exceeded') || code.endsWith('internal')
        || (typeof navigator !== 'undefined' && navigator.onLine === false);
      if (transient) {
        await queueForReconnect();
        return;
      }
      console.error('[Module 22] Failed to send teacher-admin message:', err);
      toast.error('שגיאה בשליחת ההודעה להנהלה. בדקו את חיבור הרשת ונסו שוב.');
    } finally {
      isSendingAdminRef.current = false;
      setIsSendingAdmin(false);
    }
  };

  // The same live scan for the learner chat (PRD Module 3 §א / 22 §ב.1): the
  // notice sits under the box and the send stays blocked while it shows —
  // also when the scan itself fails. It used to be a toast after "send".
  const studentInputPiiNotice = useMemo(() => {
    if (!inputText.trim()) return null;
    // PRD Module 3 §א (v7.9): a filter failure locks nothing; it is logged.
    try {
      const validation = validateChatInputForPII(inputText);
      return validation.valid ? null : (validation.errorHe || 'הודעה מכילה פרטים מזהים. יש להשתמש במזהה 1-12 בלבד.');
    } catch (err) {
      reportPiiFilterFailure('TeacherDashboard learner chat (live scan)', err);
      return null;
    }
  }, [inputText]);

  const handleSendStudent = () => {
    if (readOnly || !inputText.trim() || !user || !selectedStudentId) return;
    if (studentInputPiiNotice) return; // the notice is already on screen, under the box

    // Module 22: Tier 1 client-side check. PRD Module 3 §א (v7.9): if the
    // filter itself fails, nothing is locked — the failure is logged and the
    // message goes.
    let validation: { valid: boolean; errorHe?: string } = { valid: true };
    try {
      validation = validateChatInputForPII(inputText);
    } catch (err) {
      reportPiiFilterFailure('TeacherDashboard learner chat', err);
    }
    if (!validation.valid) {
      toast.warning(validation.errorHe || 'הודעה מכילה פרטים מזהים. יש להשתמש במזהה 1-12 בלבד.');
      return;
    }

    const cleanText = anonymizeChatMessageBody(inputText.trim());
    const targetId = normalizeStudentId(selectedStudentId);

    sendMessage(
      user.uid as string,
      // שם המורה אינו נשמר בשום מקום במערכת; ההודעה נושאת תפקיד, לא שם.
      "מורה",
      targetId,
      cleanText,
    );
    setInputText("");
  };

  // Counted from the Firestore admin channel (adminMessages) — the RTDB chat
  // store this used to filter never contains admin messages, so the badge was
  // permanently zero.
  const unreadAdminCount = useMemo(
    () => adminMessages.filter((m) => m.senderId === 'admin' && !m.read).length,
    [adminMessages]
  );

  const unreadStudentsCount = useMemo(() => {
    if (!user) return 0;
    const validStudentIds = new Set(allStudents.map((s) => normalizeStudentId(s.studentId)));
    return messages.filter((m) => {
      if (m.read) return false;
      const normSender = normalizeStudentId(m.senderId);
      return validStudentIds.has(normSender);
    }).length;
  }, [messages, user, allStudents]);
  const onlineCount = useMemo(() => allStudents.filter((s) => Boolean(s.isOnline)).length, [allStudents]);
  // The live bar's message button (owner, 10.10.2026): a learner's unread
  // message opens that learner's floating panel over the current tab, so the
  // teacher answers without leaving the radar; with nothing unread it opens
  // the students' chat tab.
  const openUnreadStudentChat = () => {
    const unread = messages.find((m) => !m.read && allStudents.some((s) => normalizeStudentId(s.studentId) === normalizeStudentId(m.senderId)));
    const learner = unread ? allStudents.find((s) => normalizeStudentId(s.studentId) === normalizeStudentId(unread.senderId)) : undefined;
    if (learner) openLearnerChat(learner);
    else handleTabChange('chat_students');
  };
  // On the radar tab the conversation opens inline in the side action queue
  // (owner, 11.10.2026), so the floating panel never covers the queue; on the
  // other tabs it is the floating panel, as before.
  function openLearnerChat(st: StudentData) {
    const n = learnerNumberOf(st.studentId);
    if (activeTab === 'heatmap' && n !== null) {
      setDrawerStudentId(null);
      useTeacherMediationStore.getState().setExpandedLearner(n);
      return;
    }
    setFloatingChatStudent(st);
  }
  useEffect(() => {
    if (activeTab !== 'heatmap' || !floatingChatStudent) return;
    const n = learnerNumberOf(floatingChatStudent.studentId);
    if (n !== null) useTeacherMediationStore.getState().setExpandedLearner(n);
    setFloatingChatStudent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, floatingChatStudent]);

  // New help calls and learner messages while the teacher is on another tab:
  // a short toast that leads to the radar's queue (owner, 11.10.2026). Not for
  // a read-only account, which records nothing.
  const queueSeenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const fresh = queueLearners.filter((l) => l.helpRequested).map((l) => `help:${l.studentNumber}`);
    const unread = messages
      .filter((m) => !m.read && /^student_user\d{1,2}$/.test(String(m.senderId)))
      .map((m) => `chat:${m.id}:${m.senderId}`);
    const keys = [...fresh, ...unread];
    if (queueSeenRef.current === null) {
      queueSeenRef.current = new Set(keys);
      return;
    }
    const seen = queueSeenRef.current;
    const added = keys.filter((k) => !seen.has(k));
    // A cleared call may come again later: forget the keys no longer present.
    queueSeenRef.current = new Set(keys);
    // A read-only account gets the same toasts (owner, 11.10.2026): they only point to the queue.
    if (activeTab === 'heatmap' || added.length === 0) return;
    for (const k of added) {
      const n = Number(k.startsWith('help:') ? k.slice(5) : k.split(':').pop()!.replace(/\D/g, ''));
      toast(k.startsWith('help:') ? QUEUE_HE.newHelpToast(n) : QUEUE_HE.newChatToast(n), {
        id: k,
        action: { label: QUEUE_HE.toQueue, onClick: () => handleTabChange('heatmap') },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueLearners.map((l) => `${l.studentNumber}:${l.helpRequested}`).join(','), messages, activeTab]);

  if (isLoading) {
    // Skeleton placeholders in the shape of the page (owner, 11.10.2026), not a spinner. Still: no pulse.
    return (
      <div className="flex h-screen bg-stone-50 dark:bg-slate-950" dir="rtl" data-testid="dashboard-skeleton">
        <div className="hidden md:block w-56 shrink-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800" />
        <div className="flex-1 p-5 flex flex-col gap-4">
          <div className="h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-slate-200/70 dark:bg-slate-800" />
            ))}
          </div>
          <p role="status" className="sr-only">טוען נתוני תלמידים...</p>
        </div>
      </div>
    );
  }

  return (
    // Motion on the teacher screens follows the viewer's "reduce motion" setting (owner, 11.10.2026).
    <MotionConfig reducedMotion="user">
    <div
      // overflow-x-clip, not -hidden: "hidden" turns this element into the scroll
      // container of the sticky side menu, and since it never scrolls itself
      // the menu scrolled away with the page.
      // md and up: the shell is exactly the screen, the side menu stands still
      // and only the page (main) scrolls, with its own scrollbar beside it
      // (owner, 6.10.2026: the page scrolled with the window's bar, beyond the
      // menu, and the bar beside the page belonged to the menu).
      className="flex flex-col min-h-screen md:h-screen bg-stone-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 selection:bg-violet-100 overflow-x-clip"
      data-load-timed-out={loadTimedOut ? 'true' : undefined}
      dir="rtl"
    >
      <ReadOnlyBanner />
      {loadTimedOut && (
        <div role="alert" className="w-full bg-rose-50 border-b border-rose-200 text-rose-800 text-sm font-bold px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span>
            {loadRefused
              ? 'לחשבון שבו התחברתם אין הרשאה לנתוני הכיתה. התנתקו והתחברו שוב בחשבון המורה.'
              : 'לא התקבלה תשובה ממסד הנתונים. מה שמוצג כאן עלול להיות לא מעודכן — בדקו את החיבור לאינטרנט.'}
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 min-h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
          >
            נסו שוב
          </button>
        </div>
      )}
      {/* The banner above sits over the whole width; the side menu and the
          page share the row below it. */}
      <div className="flex flex-col md:flex-row flex-1 min-w-0 md:min-h-0">
      {/* Sidebar — stays in place while the page scrolls (md and up), so the
          tabs and the sign-out are always in reach. */}
        {/* The menu folds to a strip of icons (owner, 6.10.2026), so the page gets
            the width. Its own scrollbar, when it needs one, sits on the outer
            edge of the screen ([direction:ltr]), away from the page's. */}
        <aside data-collapsed={sidebarCollapsed ? 'true' : undefined} className={`w-full ${sidebarCollapsed ? 'md:w-16' : 'md:w-56 2xl:w-72'} bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-l border-slate-200/80 dark:border-slate-800 flex flex-col z-20 transition-all shrink-0 md:sticky md:top-0 md:self-start md:h-full overflow-y-auto custom-scrollbar md:[direction:ltr] md:[&>*]:[direction:rtl]`}>
        <div className={`h-20 flex items-center justify-between gap-2 border-b border-ws-surface2 bg-white/40 dark:bg-slate-800/40 shrink-0 ${sidebarCollapsed ? 'px-6 md:px-0 md:justify-center' : 'px-6'}`}>
          {/* The dashboard stays mounted across its own routes, so the link
              alone left the teacher on the tab she was on. */}
          <div onClick={() => handleTabChange("heatmap")} className={sidebarCollapsed ? 'md:hidden' : ''}>
            <Logo size="md" to="/dashboard" textClassName="font-display text-ws-ink" />
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            data-testid="sidebar-toggle"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'פתיחת התפריט' : 'כיווץ התפריט'}
            title={sidebarCollapsed ? 'פתיחת התפריט' : 'כיווץ התפריט'}
            className="hidden md:inline-flex items-center justify-center w-9 h-9 rounded-xl text-ws-soft hover:bg-ws-bg hover:text-ws-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 cursor-pointer"
          >
            {sidebarCollapsed ? <PanelRightOpen className="w-5 h-5" /> : <PanelRightClose className="w-5 h-5" />}
          </button>
        </div>
        
        <div className={`border-b border-ws-surface2 ${sidebarCollapsed ? 'p-4 md:p-2' : 'p-4'}`}>
          <h2 className={`font-display font-bold text-sm text-slate-500 dark:text-slate-400 tracking-tight mb-1 truncate ${sidebarCollapsed ? 'md:sr-only' : ''}`}>
            תחנת עבודה מורה
          </h2>
          
          <div className={sidebarCollapsed ? 'mt-2 md:mt-0' : 'mt-2'}>
            <button
              // One named window: a second click brings the same projector
              // window back instead of opening another, and each extra window
              // released the children's screens when it opened or closed.
              onClick={() => window.open('/projector', 'mathmaticore_projector')}
              title="ארגז חול למקרן"
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 px-3 py-2 min-h-9 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 font-semibold text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
              <span className={sidebarCollapsed ? 'md:sr-only' : 'truncate'}>ארגז חול למקרן</span>
            </button>
            <div className="mt-2">
              <TeacherGuideDownloadButton collapsed={sidebarCollapsed} />
            </div>
          </div>
        </div>

        <nav role="tablist" aria-orientation="vertical" aria-label="המסך של המורה" className={`flex-1 flex flex-col gap-2 ${sidebarCollapsed ? 'p-4 md:p-2' : 'p-4'}`}>
          <div className={`text-[10px] font-bold text-slate-600  mb-2 mt-2 px-2 uppercase tracking-widest ${sidebarCollapsed ? 'md:sr-only' : ''}`}>
            פדגוגיה ומעקב
          </div>
          <button
            id="tour-tab-heatmap"
            onClick={() => handleTabChange("heatmap")}
              role="tab"
              aria-selected={activeTab === "heatmap"}
            className={`relative w-full flex items-center text-right px-3 py-2.5 ${sidebarCollapsed ? 'md:px-0 md:justify-center' : ''} rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${activeTab === "heatmap" ? "bg-violet-50 text-violet-800 dark:bg-violet-950/60 dark:text-violet-100 font-semibold" : "hover:bg-ws-bg text-ws-soft "}`}
            title="הרדאר הפדגוגי השקט"
          >
            <span className="flex items-center gap-2 min-w-0"><Radar className="w-4 h-4 shrink-0" aria-hidden="true" /><span className={sidebarCollapsed ? 'md:sr-only' : 'truncate'}>הרדאר הפדגוגי השקט</span></span>
          </button>
          <button
            id="tour-tab-clustering"
            onClick={() => handleTabChange("clustering")}
              role="tab"
              aria-selected={activeTab === "clustering"}
            className={`relative w-full flex items-center text-right px-3 py-2.5 ${sidebarCollapsed ? 'md:px-0 md:justify-center' : ''} rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${activeTab === "clustering" ? "bg-violet-50 text-violet-800 dark:bg-violet-950/60 dark:text-violet-100 font-semibold" : "hover:bg-ws-bg  text-ws-soft "}`}
            title="מיפוי מיומנויות כיתתי"
          >
            <span className="flex items-center gap-2 min-w-0"><LayoutGrid className="w-4 h-4 shrink-0" aria-hidden="true" /><span className={sidebarCollapsed ? 'md:sr-only' : 'truncate'}>מיפוי מיומנויות כיתתי</span></span>
          </button>
          <button
            id="tour-tab-reports"
            onClick={() => handleTabChange("diagnostic_reports")}
              role="tab"
              aria-selected={activeTab === "diagnostic_reports"}
            className={`relative w-full flex items-center text-right px-3 py-2.5 ${sidebarCollapsed ? 'md:px-0 md:justify-center' : ''} rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${activeTab === "diagnostic_reports" ? "bg-violet-50 text-violet-800 dark:bg-violet-950/60 dark:text-violet-100 font-semibold" : "hover:bg-ws-bg text-ws-soft "}`}
            title="דוחות אבחון אישיים"
          >
            <span className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 shrink-0" aria-hidden="true" /><span className={sidebarCollapsed ? 'md:sr-only' : 'truncate'}>דוחות אבחון אישיים</span></span>
          </button>
          {/* One place for every decision about a learner (owner, 11.10.2026): שלב החלוקה למסלולים lives
              inside "ניהול כיתה ומסלולים", and its badge counts the learners waiting there. */}
          <button
            onClick={() => handleTabChange("class_management")}
              role="tab"
              aria-selected={activeTab === "class_management"}
            className={`relative w-full flex justify-between items-center gap-2 text-right px-3 py-2.5 ${sidebarCollapsed ? 'md:px-0 md:justify-center' : ''} rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${activeTab === "class_management" ? "bg-violet-50 text-violet-800 dark:bg-violet-950/60 dark:text-violet-100 font-semibold" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            <span className="flex items-center gap-2 min-w-0" title={CLASS_MANAGEMENT_TITLE_HE}><School className="w-4 h-4 shrink-0" aria-hidden="true" /><span className={sidebarCollapsed ? 'md:sr-only' : 'truncate'}>{CLASS_MANAGEMENT_TITLE_HE}</span></span>
            {/* Badge: learners waiting at the Module 20 gate. */}
            {pendingApprovalsBadgeCount > 0 && (
              <span
                className={`shrink-0 bg-violet-700 text-white text-xs font-bold px-2 py-0.5 rounded-full${sidebarCollapsed ? ' md:absolute md:top-0.5 md:left-1.5 md:min-w-[18px] md:h-[18px] md:px-1 md:py-0 md:text-[10px] md:leading-[18px] md:text-center' : ''}`}
                title={`ממתינים ב${TEACHER_GATE_HE}: ${pendingApprovalsBadgeCount}`}
              >
                {pendingApprovalsBadgeCount}
              </span>
            )}
          </button>

          <div className={`text-[10px] font-bold text-slate-600  mb-2 mt-6 px-2 uppercase tracking-widest ${sidebarCollapsed ? 'md:sr-only' : ''}`}>
            תקשורת וצ'אט
          </div>
          <button
            id="tour-tab-chat"
            onClick={() => handleTabChange("chat_students")}
              role="tab"
              aria-selected={activeTab === "chat_students"}
            className={`relative w-full flex justify-between items-center gap-2 text-right px-3 py-2.5 ${sidebarCollapsed ? 'md:px-0 md:justify-center' : ''} rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${activeTab === "chat_students" ? "bg-violet-50 text-violet-800 dark:bg-violet-950/60 dark:text-violet-100 font-semibold" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            <span className="flex items-center gap-2 min-w-0" title="צ'אט עם תלמידים"><MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" /><span className={sidebarCollapsed ? 'md:sr-only' : 'truncate'}>צ'אט עם תלמידים</span></span>
            {unreadStudentsCount > 0 && (
              <span className={`shrink-0 bg-violet-700 text-white text-xs font-bold px-2 py-0.5 rounded-full${sidebarCollapsed ? ' md:absolute md:top-0.5 md:left-1.5 md:min-w-[18px] md:h-[18px] md:px-1 md:py-0 md:text-[10px] md:leading-[18px] md:text-center' : ''}`}>
                {unreadStudentsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsAdminChatDrawerOpen(true)}
            className={`relative w-full flex justify-between items-center gap-2 text-right px-3 py-2.5 ${sidebarCollapsed ? 'md:px-0 md:justify-center' : ''} rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${isAdminChatDrawerOpen ? "bg-violet-50 text-violet-800 dark:bg-violet-950/60 dark:text-violet-100 font-semibold" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            <span className="flex items-center gap-2 min-w-0" title="צ'אט הנהלה"><Mail className="w-4 h-4 shrink-0" /><span className={sidebarCollapsed ? 'md:sr-only' : 'truncate'}>צ'אט הנהלה</span></span>
            {unreadAdminCount > 0 && (
              <span className={`shrink-0 bg-violet-700 text-white text-xs font-bold px-2 py-0.5 rounded-full${sidebarCollapsed ? ' md:absolute md:top-0.5 md:left-1.5 md:min-w-[18px] md:h-[18px] md:px-1 md:py-0 md:text-[10px] md:leading-[18px] md:text-center' : ''}`}>
                {unreadAdminCount}
              </span>
            )}
          </button>
        </nav>
        
        <div className={`border-t border-ws-surface2 bg-white/40 dark:bg-slate-800/40 mt-auto shrink-0 flex flex-col gap-3 ${sidebarCollapsed ? 'p-4 md:p-2' : 'p-4'}`}>
          <div className={sidebarCollapsed ? 'md:hidden' : ''}><TeacherGenderSetting /></div>
          <LogoutButton className={`w-full gap-3 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors rounded-xl py-3 ${sidebarCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'}`} labelClassName={sidebarCollapsed ? 'md:sr-only' : ''} />
        </div>
      </aside>

      {/* Main Content */}
      {/* On the student chat the page itself does not scroll: main takes exactly the
          screen height and the conversation fills what the session bar leaves, so
          the typing line is always in view. Only the message list scrolls. */}
      {/* md:p-5, not p-8 (owner, 11.10.2026): the radar's twelve tiles fit a
          1366×768 laptop screen without scrolling. */}
      <main className={`flex-1 min-w-0 md:min-h-0 md:h-full overflow-y-auto custom-scrollbar p-4 md:p-5 relative ${activeTab === "chat_students" || activeTab === "heatmap" ? "md:flex md:flex-col" : ""}`}>

        {/* Class Session Control Bar — the one bar for the live lesson (owner,
            10.10.2026): it stays at the top of the page on every tab, so the
            three actions of Module 14 §ב, the clock and the learners' messages
            are always one click away. Icons, not emoji (DESIGN_SYSTEM_RULES 1.1). */}
        {/* One row from md up (owner, 11.10.2026): it used to stack below
            1700px and push the radar under the fold of a 1366×768 laptop. */}
        {/* The one "glass" touch (owner, 11.10.2026): the sticky bar is translucent with a blur; its text sits on the white row inside, so contrast stays AA. */}
        <div data-testid="live-session-bar" className="sticky -top-4 md:-top-5 z-30 -mx-4 md:-mx-5 -mt-4 md:-mt-5 px-4 md:px-5 pt-3 pb-2 mb-[clamp(8px,1vw,16px)] bg-stone-50/70 dark:bg-slate-950/70 backdrop-blur-md shrink-0">
        <div data-testid="live-session-bar-row" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:flex-wrap lg:flex-nowrap items-center justify-between gap-x-3 gap-y-2">
          {/* State and time on one line (owner, 11.10.2026); the state is the chip. The open meeting's
              full name is shown beside it, never only as a tooltip and never cut off: the picker beside
              the actions shows the meeting picked to open next, which may be another one. */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0 flex items-center gap-2">
                {classSessionStatus !== 'active' && classSessionStatus !== 'paused' && (
                  <h3 className="font-bold text-sm leading-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
                    {'ניהול המפגש בזמן אמת'}
                  </h3>
                )}
                {classSessionStatus === 'active' && (
                  <span className="shrink-0 bg-violet-50 text-violet-800 border border-violet-200 dark:bg-violet-950/50 dark:text-violet-100 dark:border-violet-800 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-600"></span>
                    פתוח ללמידה
                  </span>
                )}
                {classSessionStatus === 'paused' && (
                  <span title={PAUSED_BAR_LINE_HE} className="shrink-0 bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    מושהה · התלמידים ממתינים
                  </span>
                )}
                {(classSessionStatus === 'active' || classSessionStatus === 'paused') && (
                  <span data-testid="live-session-meeting" className="min-w-0 text-xs font-semibold leading-snug text-slate-800 dark:text-slate-100">
                    {meetingLabelHe(selectedSessionNum)}
                  </span>
                )}
              <p className="min-w-0 truncate text-slate-600 dark:text-slate-300 text-xs leading-snug" data-testid="live-session-line">
                {classSessionStatus === 'active' || classSessionStatus === 'paused'
                  ? (
                    <>
                      {/* Said by the badge above; kept for screen readers (owner, 11.10.2026: one row). */}
                      {classSessionStatus === 'active' && (
                        <span className="sr-only">{`מפגש ${selectedSessionNum} פתוח כעת עבור התלמידים בכיתה.`}</span>
                      )}
                      {' '}
                      {/* PRD 14 §ב: the connected learners and the minutes, while the meeting is paused too. */}
                      {/* Short on the bar, the full sentence in the tooltip (owner, 11.10.2026). */}
                      <span
                        data-testid="live-session-status"
                        title={`${onlineCount} מתוך 12 מחוברים${elapsedMinutes === null ? '' : ` · ${elapsedMinutes === 1 ? 'חלפה דקה אחת' : `חלפו ${elapsedMinutes} דקות`} מתוך ${getSessionDurationMinutes(selectedSessionNum)}`}`}
                        className="font-medium tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap"
                      >
                        {`${onlineCount}/12 מחוברים${elapsedMinutes === null ? '' : ` · ${elapsedMinutes} מתוך ${getSessionDurationMinutes(selectedSessionNum)} דק׳`}`}
                      </span>
                      {classSessionStatus === 'paused' && <>{' · '}{PAUSED_BAR_LINE_HE}</>}
                    </>
                  )
                  : pickedSessionNum >= 3 && pickedSessionNum <= 7
                      // The prepare step (owner, 11.10.2026): the demonstration on the projector comes first.
                      ? <span data-testid="prepare-reminder" className="font-bold text-slate-800 dark:text-slate-100">{LESSON_FLOW_HE.prepare(pickedSessionNum)}</span>
                      : 'בחרו מפגש ולחצו על "הפעילו מפגש" כדי לפתוח את הלמידה לתלמידים.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap lg:flex-nowrap items-center gap-1.5 w-full md:w-auto justify-end">
            {/* Module 15 (owner, 11.10.2026): the teacher sees that the learners' screens are locked for a
                demonstration. Read only — the projector page alone writes this record. */}
            {isProjectorModeActive && (
              <span data-testid="projector-chip" className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-violet-50 dark:bg-violet-950/50 border border-violet-300 dark:border-violet-800 text-violet-900 dark:text-violet-100 text-xs font-extrabold">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                {PROJECTOR_CHIP_HE}
              </span>
            )}
            {/* Catch-up time during an open meeting: a chip; its list opens under it (owner, 11.10.2026).
                With no meeting open the full strip below says the same. */}
            {isClassSessionActive && catchUpMeeting !== null && unfinishedInCatchUpMeeting.length > 0 && (
              <details data-testid="catchup-chip" className="relative">
                <summary title={catchUpHeadingHe} className="list-none inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer whitespace-nowrap hover:bg-slate-50">
                  {`${unfinishedInCatchUpMeeting.length} עוד לא סיימו`}
                </summary>
                <div className="absolute z-40 top-full mt-1 left-0 w-64 p-2 flex flex-col gap-1 rounded-xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-stone-800 shadow-xl">
                <h3 className="px-2 text-xs font-extrabold text-stone-950 dark:text-stone-100">{catchUpHeadingHe}</h3>
                <ul className="flex flex-col gap-1">
                  {unfinishedInCatchUpMeeting.map((l) => (
                    <li key={l.studentNumber} className="px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-200">
                      תלמיד {l.studentNumber} · {l.stoppedAtHe}
                    </li>
                  ))}
                </ul>
                </div>
              </details>
            )}
            {/* Measure 5 (owner, 11.10.2026): every unrecorded mediation event of the meeting. */}
            <MediationPendingButton readOnly={readOnly} open={mediationPendingOpen} onOpenChange={setMediationPendingOpen} />
            {/* Below 1024px: the queue and the colour map open as a bottom sheet (owner, 11.10.2026). */}
            {activeTab === 'heatmap' && (
              <button
                type="button"
                data-testid="queue-sheet-toggle"
                onClick={() => setQueueSheetOpen((o) => !o)}
                aria-expanded={queueSheetOpen}
                className="lg:hidden inline-flex items-center gap-1.5 min-h-9 px-2.5 py-1.5 bg-white hover:bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-xs cursor-pointer transition-colors"
              >
                <Users className="w-4 h-4" aria-hidden="true" />
                <span>{QUEUE_HE.title}</span>
                {helpLearnerNumbers.length > 0 && (
                  <span className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-black">{helpLearnerNumbers.length}</span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={openUnreadStudentChat}
              aria-label={unreadStudentsCount > 0 ? `הודעות מתלמידים, ${unreadStudentsCount} שלא נקראו` : 'הודעות מתלמידים'}
              title="הודעות מתלמידים"
              className="relative inline-flex items-center gap-1.5 min-h-9 px-2.5 py-1.5 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden lg:inline whitespace-nowrap">הודעות מתלמידים</span>
              {unreadStudentsCount > 0 && (
                <span data-testid="live-bar-unread" className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-violet-700 text-white text-[11px] font-black">
                  {unreadStudentsCount}
                </span>
              )}
            </button>
            {/* Module 14 §ב0: the picker shows all eight sessions and their state at all
                times. Opening another session replaces the active one directly — a
                session stays active until the teacher opens a different one. */}
            <span aria-hidden="true" className="hidden md:block w-px h-6 mx-1 bg-slate-200 dark:bg-slate-700" />
            <select
              value={pickedSessionNum}
              onChange={(e) => setPickedSessionNum(parseInt(e.target.value, 10))}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-2 min-h-9 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer w-44 min-[1800px]:w-auto truncate"
            >
              {sessionRows.map((row) => (
                <option key={row.sessionNumber} value={row.sessionNumber}>
                  {`${meetingShortLabelHe(row.sessionNumber)} — ${sessionStateLabelHe(row)}`}
                </option>
              ))}
            </select>

            {!(isClassSessionActive && pickedSessionNum === selectedSessionNum) && (
            <button
              onClick={() => setPendingActivationSession(pickedSessionNum)}
              disabled={readOnly || (isClassSessionActive && pickedSessionNum === selectedSessionNum) || isUpdatingSession || isStartingSession}
              title={readOnly ? READ_ONLY_TITLE : isClassSessionActive && pickedSessionNum === selectedSessionNum ? `${meetingShortLabelHe(pickedSessionNum)} כבר פתוח עכשיו` : `פתיחת ${meetingShortLabelHe(pickedSessionNum)} לכל הכיתה`}
              className="px-3 min-h-9 bg-violet-700 hover:bg-violet-800 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4" aria-hidden="true" />
              <span>הפעילו מפגש</span>
            </button>
            )}
            {isClassSessionActive && (
              <>
                {classSessionStatus === 'paused' ? (
                  <button
                    onClick={handleResumeClassSession}
                    disabled={readOnly || isUpdatingSession}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className="px-3 min-h-9 bg-violet-700 hover:bg-violet-800 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {isUpdatingSession ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span>המשיכו את המפגש</span>
                  </button>
                ) : (
                  <button
                    onClick={handlePauseClassSession}
                    disabled={readOnly || isUpdatingSession}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className="px-3 min-h-9 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-800 dark:text-slate-100 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {isUpdatingSession ? (
                      <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Pause className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span>עצרו את המפגש</span>
                  </button>
                )}
                <button
                  onClick={() => { void requestCloseClassSession(); }}
                  disabled={readOnly || isUpdatingSession || isSavingCatchUp}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className="px-3 min-h-9 bg-white hover:bg-stone-50 dark:bg-slate-900 dark:hover:bg-stone-900/40 border-2 border-stone-400 dark:border-stone-600 disabled:text-slate-400 disabled:cursor-not-allowed text-stone-900 dark:text-stone-100 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {isUpdatingSession ? (
                    <span className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Square className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>סגרו את המפגש</span>
                </button>
              </>
            )}

          </div>
        </div>
        {/* Module 14 §ב1 (owner, 11.10.2026): the one-time "עברו X דקות" is a banner in the bar that the
            teacher closes with a click — it no longer stops her work with a window. Same trigger, same text. */}
        {deadlineNotice !== null && (
          <div role="status" data-testid="deadline-banner" className="mt-2 flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-950/50 border border-violet-300 dark:border-violet-800 text-violet-950 dark:text-violet-100">
            <span className="flex items-center gap-2 text-sm font-black">
              <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
              {LESSON_FLOW_HE.deadline(deadlineNotice.minutes)}
            </span>
            <button
              type="button"
              data-testid="deadline-banner-dismiss"
              onClick={() => setDeadlineNotice(null)}
              className="px-3 py-1.5 min-h-9 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold cursor-pointer"
            >
              {LESSON_FLOW_HE.deadlineDismiss}
            </button>
          </div>
        )}
        </div>

        {/* The meeting just closed, for the class discussion: teacher-only, anonymous (owner, 11.10.2026). */}
        {meetingSummary !== null && !isClassSessionActive && (
          <MeetingSummaryPanel summary={meetingSummary} thresholdSeconds={getHesitationThresholdSeconds()} onClose={() => setMeetingSummary(null)} />
        )}

        {/* Catch-up time (owner decision 2.10.2026): who started the open (or
            the last) meeting and has not finished it, and where they stopped.
            After a close by time this is where the teacher sees them; the
            reasons are asked at the next close or opening. */}
        {/* During an open meeting this is the chip in the bar above (owner, 11.10.2026). */}
        {!isClassSessionActive && catchUpMeeting !== null && unfinishedInCatchUpMeeting.length > 0 && (
          <section
            aria-labelledby="catchup-unfinished-title"
            className="mb-4 shrink-0 bg-stone-50 dark:bg-stone-950/30 border border-stone-200 dark:border-stone-900 rounded-2xl px-5 py-3 flex flex-col gap-2"
          >
            <h3 id="catchup-unfinished-title" className="font-extrabold text-sm text-stone-950 dark:text-stone-100">
              {catchUpHeadingHe}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {unfinishedInCatchUpMeeting.map((l) => (
                <li
                  key={l.studentNumber}
                  className="px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-stone-200 dark:border-stone-800 text-xs font-bold text-slate-800 dark:text-slate-200"
                >
                  תלמיד {l.studentNumber} · {l.stoppedAtHe}
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeTab === "heatmap" && (
          <div className="md:flex-1 md:min-h-0 flex flex-col">
            {/* Owner, 11.10.2026: no page heading here — the twelve tiles fit a
                1366×768 screen — and the side action queue beside the grid (on
                the left in RTL), never over it. */}
            <div data-testid="radar-and-queue" className="flex flex-col lg:flex-row items-start lg:items-stretch gap-[clamp(12px,1.1vw,24px)] flex-1 min-h-0">
              <div className="flex-1 min-w-0 min-h-0 w-full self-stretch flex flex-col">
                <HeatmapGrid
                  onDrillDown={(studentId) => {
                    const norm = normalizeStudentId(studentId);
                    const student = allStudents.find(s => s.studentId === studentId || normalizeStudentId(s.studentId) === norm);
                    if (student) setDrawerStudentId(normalizeStudentId(student.studentId));
                  }}
                />
              </div>
              {/* The left column (owner, 11.10.2026): the action queue first, the colour map under it. The queue
                  shrinks and scrolls inside itself; the map stays whole, so the page never scrolls twice. */}
              {/* Widths per screen (owner, 11.10.2026): 320px on a laptop, 360px from 1440, 400px from 1920. Below
                  1024px it is a bottom sheet opened from the bar ("תור פעולות"). */}
              <div
                data-testid="radar-side-column"
                data-sheet-open={queueSheetOpen ? 'true' : undefined}
                className={`lg:w-80 min-[1440px]:w-[22.5rem] min-[1920px]:w-[25rem] shrink-0 lg:min-h-0 lg:self-stretch flex flex-col gap-3 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[75dvh] max-lg:overflow-y-auto max-lg:p-3 max-lg:bg-stone-50 max-lg:dark:bg-slate-950 max-lg:rounded-t-2xl max-lg:shadow-2xl max-lg:border-t max-lg:border-slate-200 ${queueSheetOpen ? '' : 'max-lg:hidden'}`}
              >
                <button type="button" onClick={() => setQueueSheetOpen(false)} className="lg:hidden self-end px-3 py-1.5 min-h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">
                  סגירה
                </button>
                <MediationQueue
                  learners={queueLearners}
                  gateLearners={queueGateLearners}
                  onOpenGate={openGateForLearner}
                  readOnly={readOnly}
                  teacherId={(user?.uid as string) || TEACHER_ID}
                />
                <RadarColourMap />
              </div>
            </div>
          </div>
        )}

        {activeTab === "clustering" && (
          <div>
            {/* One title line and one sentence, as on every teacher tab (owner, 11.10.2026). The count says
                whether the empty groups mean "no data yet" or "no difficulty". */}
            <TeacherTabHeader
              title="מיפוי מיומנויות כיתתי"
              icon={LayoutGrid}
              sentence="הכיתה מחולקת לפי שלושת תחומי האבחון: המבנה העשרוני והאפס, הקבצה ופריטה, וחישוב במאונך."
              aside={
                <div className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  מבוסס על {studentsWithMastery} מתוך {allStudents.length || 12} תלמידים
                </div>
              }
            />

            {studentsWithMastery === 0 && (
              <div
                role="status"
                className="mb-3 flex items-start gap-3 rounded-2xl border border-stone-200 dark:border-stone-900 bg-stone-50 dark:bg-stone-950/30 px-4 py-3"
              >
                <div>
                  <p className="font-bold text-stone-950 dark:text-stone-100">מיפוי המיומנויות עדיין ריק</p>
                  <p className="text-sm text-stone-900/80 dark:text-stone-200/80 mt-1">
                    המיפוי נוצר לכל תלמיד בסיום מפגש האבחון (מפגש 2). כל עוד אף תלמיד לא סיים אותו,
                    הקבוצות והגרף שלמטה ריקים — זה אינו אומר שאין פערים.
                  </p>
                </div>
              </div>
            )}

            {/* Interactive Concept Group Widgets */}
            <div className="mb-3">
              <ClusteringWidgets 
                students={allStudents} 
                activeFilter={activeClusterFilter} 
                onFilterChange={setActiveClusterFilter} 
              />
            </div>

            <AccessibleCard className="p-4 bg-white dark:bg-slate-900 mb-3 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl">
              <h2 className="text-base font-black mb-2 text-slate-900 dark:text-slate-100">
                התפלגות שליטה במיומנויות (כיתה שלמה)
              </h2>
              <div className="h-[240px] w-full" dir="ltr">
                {qMatrixData.every(d => d.success === 0 && d.struggle === 0) ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-slate-800" dir="rtl">
                    <p className="font-bold text-base text-slate-600 dark:text-slate-300">אין עדיין נתונים מהתלמידים</p>
                    <p className="text-sm opacity-80 mt-1">התפלגות השליטה תוצג כאן לאחר סיום שלב האבחון</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={qMatrixData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="currentColor"
                        className="text-slate-200 opacity-50"
                      />
                      <XAxis
                        dataKey="name"
                        fontSize={13}
                        tickLine={false}
                        axisLine={false}
                        tick={{
                          fill: "currentColor",
                          className: "text-ws-soft",
                        }}
                        dy={10}
                      />
                      <YAxis
                        orientation="right"
                        fontSize={13}
                        tickLine={false}
                        axisLine={false}
                        tick={{
                          fill: "currentColor",
                          className: "text-ws-soft",
                        }}
                        dx={-10}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "rgba(15, 23, 42, 0.9)",
                          color: "white",
                          backdropFilter: "blur(12px)",
                          boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.2)",
                        }}
                        cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
                      />
                      <Legend wrapperStyle={{ paddingTop: "20px" }} />
                      <Bar
                        dataKey="success"
                        name="שליטה במיומנות (%)"
                        stackId="a"
                        fill="#3b82f6"
                        radius={[0, 0, 6, 6]}
                      />
                      <Bar
                        dataKey="struggle"
                        name="קושי (%)"
                        stackId="a"
                        fill="#f43f5e"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </AccessibleCard>

            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 pb-4">
              {(!activeClusterFilter || activeClusterFilter === 'decimal_structure') && (
              <AccessibleCard className="flex flex-col p-4 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-violet-600"></div>
                <div>
                  <h3 className="text-base font-black mb-1 text-slate-900 dark:text-slate-100">
                    {CONCEPT_LABELS_HE.decimal_structure}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-2 text-xs leading-relaxed">
                    תלמידים שהתקשו בקריאה וכתיבה של מספר עם אפס (משימה 1), בערך הספרה (משימה 2), בפירוק מספר לרכיביו (משימה 4) או בחיסור עם פריטה אחת כשבמחוסר יש 0 בטור העשרות (משימה 7).
                  </p>
                  <div className="rounded-xl overflow-y-auto max-h-[160px] border border-slate-200 dark:border-slate-800">
                    <DataGrid
                      emptyMessage={emptyGroupHe}
                      columns={[
                        { key: "name", header: "תלמיד" },
                        { key: "mastery", header: "רמת שליטה" },
                      ]}
                      data={decimalStructureGroup.map((s) => ({
                        id: s.studentId,
                        name: s.name,
                        mastery: s.conceptMastery ? `${Math.round(s.conceptMastery.decimal_structure * 100)}%` : "חסר מידע",
                      }))}
                    />
                  </div>
                </div>
              </AccessibleCard>
              )}

              {/* "הקבצה ופריטה" is one number in the profile; the teacher sees its two
                  parts beside it, never merged silently (owner, 26.9.2026):
                  הקבצה = tasks 5 and 6, פריטה = tasks 3 and 7. */}
              {(!activeClusterFilter || activeClusterFilter === 'regrouping_fluency') && (
              <AccessibleCard className="flex flex-col p-4 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-violet-600"></div>
                <div>
                  <h3 className="text-base font-black mb-1 text-slate-900 dark:text-slate-100">
                    {CONCEPT_LABELS_HE.regrouping_fluency}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-2 text-xs leading-relaxed">
                    הקבצה: המרת יחידות לעשרות (משימה 5) וחיבור עם המרה (משימה 6). פריטה: חיסור עם פריטה (משימה 3) וחיסור עם פריטה אחת כשבמחוסר יש 0 בטור העשרות (משימה 7). "רמת שליטה" מאחדת את ארבע המשימות; שני החלקים מוצגים לצידה.
                  </p>
                  <div className="rounded-xl overflow-y-auto max-h-[160px] border border-slate-200 dark:border-slate-800">
                    <DataGrid
                      emptyMessage={emptyGroupHe}
                      columns={[
                        { key: "name", header: "תלמיד" },
                        { key: "mastery", header: "רמת שליטה" },
                        { key: "grouping", header: REGROUPING_KIND_LABELS_HE.grouping },
                        { key: "decomposition", header: REGROUPING_KIND_LABELS_HE.decomposition },
                      ]}
                      data={regroupingFluencyGroup.map((s) => {
                        const view = regroupingOf(s);
                        return {
                          id: s.studentId,
                          name: s.name,
                          mastery: view.combined === null ? "חסר מידע" : `${Math.round(view.combined * 100)}%`,
                          grouping: regroupingKindCell(view.split.grouping),
                          decomposition: regroupingKindCell(view.split.decomposition),
                        };
                      })}
                    />
                  </div>
                </div>
              </AccessibleCard>
              )}

              {(!activeClusterFilter || activeClusterFilter === 'procedural_fluency') && (
              <AccessibleCard className="flex flex-col p-4 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-violet-600"></div>
                <div>
                  <h3 className="text-base font-black mb-1 text-slate-900 dark:text-slate-100">
                    {CONCEPT_LABELS_HE.procedural_fluency}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-2 text-xs leading-relaxed">
                    תלמידים שהתקשו בתרגילי החיבור והחיסור במאונך (משימות 3, 6 ו-7).
                  </p>
                  <div className="rounded-xl overflow-y-auto max-h-[160px] border border-slate-200 dark:border-slate-800">
                    <DataGrid
                      emptyMessage={emptyGroupHe}
                      columns={[
                        { key: "name", header: "תלמיד" },
                        { key: "mastery", header: "רמת שליטה" },
                      ]}
                      data={proceduralFluencyGroup.map((s) => ({
                        id: s.studentId,
                        name: s.name,
                        mastery: s.conceptMastery ? `${Math.round(s.conceptMastery.procedural_fluency * 100)}%` : "חסר מידע",
                      }))}
                    />
                  </div>
                </div>
              </AccessibleCard>
              )}
            </div>
          </div>
        )}


        {activeTab === "class_management" && (
          <div>
            <ClassManagement
              allStudents={allStudents}
              activeSessionNumber={isClassSessionActive ? selectedSessionNum : null}
              onDrillDown={(studentId) => {
                const norm = normalizeStudentId(studentId);
                const student = allStudents.find(s => s.studentId === studentId || normalizeStudentId(s.studentId) === norm);
                if (student) setDrawerStudentId(normalizeStudentId(student.studentId));
              }}
              // Module 20: שלב החלוקה למסלולים for the whole class — the batch approval and the learners
              // who did not finish meeting 2 (Module 14 §ב), with the reopen through the activation window.
              gate={{
                students: gateStudentItems,
                onApproveAll: handleBatchApproveAll,
                isLoading: isApprovingGate,
                unfinished: unfinishedMeeting2,
                isMeeting2Open,
                onReopenMeeting2: () => {
                  // The dashboard's own activation window (Module 14 §ב0).
                  setPickedSessionNum(2);
                  setPendingActivationSession(2);
                },
              }}
              // The learner's diagnostic evidence, in the gate drawer (the same evidence: gateEvidenceFor).
              onOpenGateEvidence={(studentId) => {
                const norm = normalizeStudentId(studentId);
                const student = allStudents.find(s => s.studentId === studentId || normalizeStudentId(s.studentId) === norm);
                if (student) setGateStudent(student);
              }}
              onOpenReport={(studentId) => {
                const id = normalizeStudentId(studentId);
                setSelectedStudentId(id);
                setSelectedReplayStudentId(id);
                setActiveTab("diagnostic_reports");
              }}
            />
          </div>
        )}

        {activeTab === "diagnostic_reports" && (
          <div>
            <TeacherTabHeader
              title="דוחות אבחון אישיים"
              icon={FileText}
              sentence="לכל תלמיד: מסע הלמידה, מיפוי מיומנויות היסוד וסיכום האבחון והמסלול."
            />

            {/* Module 23, owner decision 6.9.2026 (register item 9): every
                meeting has a class report beside the learner reports. */}
            {/* Folded to one line by default (owner, 6.10.2026: the screen was
                crowded); the panel itself is unchanged when opened. */}
            <div className="mb-3">
              <button
                type="button"
                onClick={toggleClassReport}
                aria-expanded={classReportOpen}
                data-testid="class-report-toggle"
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl border border-ws-surface2 bg-ws-surface text-sm font-black text-ws-ink hover:border-violet-600/40 cursor-pointer"
              >
                <span className="flex items-center gap-2 min-w-0"><Users className="w-4 h-4 text-violet-500" aria-hidden="true" />דוח כיתה למפגש</span>
                <span className="text-xs font-bold text-ws-soft">{classReportOpen ? 'הסתרה ▴' : 'הצגה ▾'}</span>
              </button>
              {classReportOpen && (
                <div className="mt-2">
                  <ClassMeetingReportPanel />
                </div>
              )}
            </div>

            {(() => {
              // כיתה ריקה מציגה את מצב הבחירה הריק שלמטה. ברירת מחדל ל'student_user1'
              // הייתה גורמת לכך שאם במקרה קיימת רשומה מקומית לתלמיד 1, הדוח שלו
              // היה נפתח בלי שאיש בחר בו.
              // A link to a learner who is not in the class opens no report
              // (routeLearnerUnknown) until the teacher picks one from the list.
              const noLearnerFromLink = routeLearnerUnknown && !selectedReplayStudentId;
              const effectiveReplayStudentId = noLearnerFromLink ? '' : selectedReplayStudentId || allStudents[0]?.studentId || '';
              const s = noLearnerFromLink ? undefined : students[effectiveReplayStudentId] || allStudents.find(st => st.studentId === effectiveReplayStudentId || normalizeStudentId(st.studentId) === normalizeStudentId(effectiveReplayStudentId)) || allStudents[0];

              const qMatrix = s?.qMatrixResults || {};
              const traceData = s?.traceData || { hesitation_events: 0, undo_clicks: 0, semantic_trace: [] };

              // מסמך העיצוב §1.1: אסור להעביר סטטוס בצבע בלבד — צבע, אייקון
              // וטקסט עברי מפורש, שלושתם יחד. הקריאה עצמה עוברת דרך
              // getQTaskStatus כדי ששלושת המצבים יזוהו כאן בדיוק כמו בשער
              // המעבר (מודול 20).
              const getQStatus = (val: unknown) => {
                switch (getQTaskStatus(val)) {
                  case 'not_attempted':
                    return { text: 'טרם ניגש', icon: '—', color: 'text-slate-600 dark:text-slate-500' };
                  case 'mastered':
                    return { text: 'שולט', icon: '✓', color: 'text-violet-700 dark:text-violet-300' };
                  default:
                    return { text: 'דרוש חיזוק', icon: '▲', color: 'text-rose-700 dark:text-rose-400' };
                }
              };

              return (
                <>
                {noLearnerFromLink && (
                  <p role="alert" className="mb-4 rounded-2xl border border-stone-200 dark:border-stone-900 bg-stone-50 dark:bg-stone-950/30 px-5 py-3 text-sm font-bold text-stone-950 dark:text-stone-100">
                    הקישור לא מוביל לאף תלמיד בכיתה. מספרי התלמידים הם 1 עד 12. בחרו תלמיד מהרשימה.
                  </p>
                )}
                <div className="flex flex-col gap-3">
                  {/* Student picker: one compact row of numbers above the report
                      (owner, 6.10.2026), instead of a column beside it, so the
                      report gets the full width. */}
                  <div role="group" aria-label="תלמידי הכיתה" data-testid="report-student-picker" className="flex items-center gap-1.5 flex-wrap bg-ws-surface/80 border border-ws-surface2 shadow-sm rounded-2xl px-3 py-2">
                    <span className="text-xs font-bold text-ws-soft ml-1">תלמידי הכיתה ({allStudents.length}):</span>
                      {allStudents.map(studentItem => {
                        const sNumItem = studentItem.studentId.replace(/\D/g, '') || studentItem.studentId;
                        const isSelected = effectiveReplayStudentId === studentItem.studentId || 
                                           normalizeStudentId(effectiveReplayStudentId) === normalizeStudentId(studentItem.studentId);
                        
                        return (
                          <button
                            key={studentItem.studentId}
                            type="button"
                            onClick={() => {
                              setSelectedReplayStudentId(studentItem.studentId);
                              setSelectedStudentId(studentItem.studentId);
                            }}
                            aria-pressed={isSelected}
                            aria-label={`תלמיד ${sNumItem}${studentItem.isOnline ? ', מחובר' : ''}`}
                            title={`תלמיד ${sNumItem}${studentItem.isOnline ? ' · מחובר כעת' : ''}`}
                            className={`relative min-w-9 h-9 px-2 inline-flex items-center justify-center rounded-xl text-sm font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                                : 'bg-white dark:bg-slate-800 text-ws-ink border-slate-200 dark:border-slate-700 hover:bg-ws-bg/80'
                            }`}
                          >
                            {sNumItem}
                            {studentItem.isOnline && <span aria-hidden="true" className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-violet-400" />}
                          </button>
                        );
                      })}
                  </div>

                  {/* Main Profile Area */}
                  <div className="flex-1 flex flex-col gap-3">
                    {!s ? (
                      <div className="p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4 text-slate-600">
                          <Users className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-ws-ink mb-2">יש לבחור תלמיד מהרשימה להצגת מסע הלמידה ודוח האבחון</h3>
                      </div>
                    ) : (
                      (() => {
                        // Progress comes only from what the learner actually finished (highestCompletedMeeting,
                        // written by the learner's own session-complete transaction and zeroed by a reset).
                        const highestDone = typeof s.highestCompletedMeeting === 'number' ? s.highestCompletedMeeting : 0;
                        const hasCompletedDiagnosticM2 = Boolean(s.completedMeeting2 || highestDone >= 2);
                        const hasStarted = hasCompletedDiagnosticM2 || highestDone >= 1;
                        // The badge below says "מסלול מומלץ". It used to be decided by live
                        // hesitation / undo counters of whatever meeting the learner is in,
                        // and could contradict the gate tab. It now comes from the same gate
                        // evidence as the gate tab and the drawer (gateEvidence.ts), and says
                        // "טרם נקבעה" when the diagnostic has no recommendation yet.
                        const sNum = (s.studentId || effectiveReplayStudentId).replace(/\D/g, '') || s.studentId;
                        const journeyRecommendation = gateEvidenceFor(sNum)?.recommendedPath ?? null;

                        return (
                          <div>
                            {/* Top Action Bar: Open Drawer for Physical Override & Full Student Profile */}
                            <div className="mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                              <div className="flex items-center gap-3">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                  תלמיד {sNum}
                                </h3>
                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
                                  s.isOnline
                                    ? 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-300'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                                }`}>
                                  <span className={`w-2 h-2 rounded-full ${s.isOnline ? 'bg-violet-600' : 'bg-slate-400'}`} />
                                  {s.isOnline ? 'מחובר כעת' : 'לא מחובר'}
                                </span>
                                {s.physicalOverride && (
                                  <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-xs font-bold px-2.5 py-1 rounded-full border border-purple-200 dark:border-purple-800">
                                    התאמת תנאים ידנית פעילה
                                  </span>
                                )}
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                                  !hasCompletedDiagnosticM2
                                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                                    : journeyRecommendation === 'remediation_path'
                                    ? 'bg-stone-50 text-stone-700 border-stone-200'
                                    : journeyRecommendation === 'green_path'
                                    ? 'bg-violet-50 text-violet-800 border-violet-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                  {!hasCompletedDiagnosticM2
                                    ? (hasStarted ? 'מפגש 1 הושלם — ממתין לאבחון במפגש 2' : 'טרם התחיל — אין נתונים')
                                    : `מסלול מומלץ: ${routeNameHe(journeyRecommendation) ?? NO_RECOMMENDATION_HE}`}
                                </span>
                              </div>

                              <div className="flex items-center gap-2.5 flex-wrap">
                                {/* Button 1: Learning conditions adjustment (Available across all sessions 1-8) */}
                                <button
                                  onClick={() => setDrawerStudentId(normalizeStudentId(s.studentId))}
                                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/70 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm transition-all active:scale-95 cursor-pointer"
                                  title="שחזור מהלכים, צ'אט ואיפוס"
                                >
                                  <Sliders className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                                  <span>חלונית הלומד</span>
                                </button>

                                {/* Button 2: Teacher Gate Approval (Available ONLY when completing Session 2 / at Gate) */}
                                {hasCompletedDiagnosticM2 && (
                                  <button
                                    onClick={() => setGateStudent(s)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-700 hover:bg-violet-800 text-white font-bold text-xs rounded-xl shadow-md shadow-violet-600/25 transition-all active:scale-95 cursor-pointer"
                                    title={`${TEACHER_GATE_HE}: אישור המסלול למפגש 3`}
                                  >
                                    <Sparkles className="w-4 h-4 text-stone-300" />
                                    <span>{TEACHER_GATE_HE}</span>
                                    {!(s.routeStatus === 'APPROVED' || (s as any).teacher_gate_approved) && (
                                      <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-md font-semibold">ממתין לאישור</span>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Video Replay & Logs Summary Banner */}
                            <div className="mb-3">
                              <LearnerJourney studentId={effectiveReplayStudentId} />
                            </div>

                            {/* Q-Matrix & traces. The meeting is picked once, in the journey
                                above; the skill map is meeting 2's diagnostic and stands on its
                                own (owner, 6.10.2026: a second meeting picker here was the same
                                choice twice). */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3">
                              {/* Q-Matrix Report */}
                              {(
                                <AccessibleCard className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl h-full">
                                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100 mb-1">
                                    תוצאות מיפוי מיומנויות היסוד ({meetingShortLabelHe(2)})
                                  </h3>
                                  <p className="text-xs text-ws-soft mb-4">שבע משימות אבחון בשלושה תחומים: המבנה העשרוני והאפס, הקבצה ופריטה, וחישוב במאונך. ליד משימה שמודדת הקבצה או פריטה כתוב איזו מהשתיים. "שליטה" מעידה על פתרון מדויק בניסיון ראשון.</p>
                                  <div className="grid grid-cols-1 gap-2 text-sm">
                                    {DIAGNOSTIC_TASKS.map((task, i) => {
                                      const status = getQStatus(
                                        readQTaskValue(qMatrix as Record<string, unknown>, task.id)
                                      );
                                      return (
                                        <div key={task.id} className="flex items-center justify-between gap-3 bg-ws-bg px-3 py-2 rounded-xl border border-ws-surface2">
                                          <span className="text-ws-ink text-xs font-bold">
                                            <span className="text-ws-soft ml-1">{i + 1}.</span>
                                            {diagnosticTaskLabelHe(task)}
                                          </span>
                                          <span className={`font-semibold text-xs whitespace-nowrap flex items-center gap-1 ${status.color}`}>
                                            <span aria-hidden="true">{status.icon}</span>
                                            {status.text}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </AccessibleCard>
                              )}

                              {/* Trace Data & AI Plan */}
                              <AccessibleCard className="p-4 border shadow-sm rounded-2xl flex flex-col h-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 mb-3">
                                  סיכום האבחון והמסלול
                                </h3>
                                
                                <div className="flex-1 flex flex-col gap-4">
                                  {/* Trace Logs Summary */}
                                  <div className="flex gap-4">
                                    <div className="flex-1 flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"><Timer className="w-4 h-4" aria-hidden="true" /></div>
                                        <span className="font-semibold text-sm">אירועי היסוס (חשיבה ארוכה)</span>
                                      </div>
                                      <span className="text-xl font-black text-slate-900 dark:text-slate-100">{traceData.hesitation_events || 0}</span>
                                    </div>
                                    <div className="flex-1 flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"><Undo2 className="w-4 h-4" aria-hidden="true" /></div>
                                        <span className="font-semibold text-sm">פעולות בקרה וויסות עצמי (מחיקה וביטול פעולה)</span>
                                      </div>
                                      <span className="text-xl font-black text-slate-900 dark:text-slate-100">{traceData.undo_clicks || 0}</span>
                                    </div>
                                  </div>

                                  {/* Clinical Diagnosis & Action Plan - Only rendered when real diagnostic exists */}
                                  {!hasCompletedDiagnosticM2 ? (
                                    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-violet-100 dark:border-violet-900 shadow-sm">
                                      <h4 className="font-black text-slate-900 dark:text-slate-100 mb-2 text-sm">
                                        סטטוס מיפוי פדגוגי
                                      </h4>
                                      <div className="bg-violet-50/60 p-3.5 rounded-xl border border-violet-100 text-violet-950 text-xs leading-relaxed">
                                        <p className="font-bold mb-1">
                                          {hasStarted ? `${meetingShortLabelHe(1)} (${MEETING_FORMAL_HE[1]}) הושלם.` : 'התלמיד עדיין לא סיים אף מפגש.'}
                                        </p>
                                        <p className="text-violet-800">
                                          מיפוי מיומנויות היסוד, שאינו מוצג לתלמיד כמבחן, והמלצת המסלול ({ROUTE_NAME_HE.green_path} או {ROUTE_NAME_HE.remediation_path}) ייבנו רק מביצועי התלמיד במפגש 2.
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-violet-100 dark:border-violet-900 shadow-sm">
                                      <h4 className="font-black text-slate-900 dark:text-slate-100 mb-3 text-sm">
                                        המלצות פדגוגיות ומסלול מותאם למפגש 3 ואילך:
                                      </h4>
                                      <div className="flex gap-3">
                                        <UdlButton 
                                          size="sm" 
                                          semanticColor="primary"
                                          className="flex-1 font-bold shadow-md shadow-violet-500/20 cursor-pointer"
                                          onClick={() => {
                                          handleTabChange("class_management");
                                        }}
                                      >
                                        מעבר ל{CLASS_MANAGEMENT_TITLE_HE}
                                      </UdlButton>
                                      <button
                                        onClick={() => setGateStudent(s)}
                                        className="px-4 py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/50 dark:hover:bg-violet-900 text-violet-700 dark:text-violet-300 font-bold text-xs rounded-xl border border-violet-200 dark:border-violet-800 transition-all cursor-pointer flex items-center gap-1.5"
                                      >
                                        <Sparkles className="w-3.5 h-3.5 text-stone-500" />
                                        <span>{TEACHER_GATE_HE}</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </AccessibleCard>
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ADMIN CHAT */}
        {/* PRD v7.1 Module 22 §ב: the consultation channel is a sliding side
            drawer opened by the envelope icon in the toolbar — never a page tab. */}
        {isAdminChatDrawerOpen && (
          <>
            <div
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-[9998] animate-in fade-in"
              onClick={() => setIsAdminChatDrawerOpen(false)}
            />
            <div
              ref={adminChatDrawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="ערוץ שיח ניהולי"
              dir="rtl"
              className="fixed top-0 right-0 bottom-0 z-[9999] w-full sm:w-[520px] h-[100dvh] flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300"
            >
            {/* Header */}
            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-violet-700 text-white flex items-center justify-center shadow-lg shadow-stone-500/20 shrink-0">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                    הנהלה ותמיכה טכנית
                  </h3>
                  {/* No presence line: the channel is asynchronous (Module 22), and
                      the fixed green dot showed with nobody on the other side. */}
                </div>
              </div>
              <button
                onClick={() => setIsAdminChatDrawerOpen(false)}
                aria-label="סגירת ערוץ השיח"
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:hover:text-white font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Chat Messages View */}
            <div ref={adminMessagesScrollRef} data-testid="admin-chat-messages" className="flex-1 min-h-0 p-5 overflow-y-auto flex flex-col gap-4 bg-slate-50/50 dark:bg-slate-950/50">
              {adminMessages.length === 0 ? (
                <div className="m-auto text-center flex flex-col items-center justify-center text-slate-600 max-w-sm">
                  <div className="w-16 h-16 rounded-full bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center mb-3 text-violet-500">
                    <MessageCircle className="w-8 h-8 opacity-40" />
                  </div>
                  <h4 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-1">אין הודעות קודמות</h4>
                  <p className="text-xs text-slate-600">תוכלו להקליד פנייה חדשה למנהל המערכת.</p>
                </div>
              ) : (
                adminMessages.map((msg) => {
                  // The channel is already filtered to this teacher and management;
                  // the server stamps her email-derived key, never the auth uid.
                  const isMe = msg.senderId !== "admin";
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                    >
                      <div
                        className={`px-4 py-2.5 rounded-2xl shadow-md ${
                          isMe
                            ? "bg-violet-700 text-white rounded-tl-xs"
                            : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-tr-xs"
                        }`}
                      >
                        {msg.text && <p className="leading-relaxed text-sm">{msg.text}</p>}
                      </div>
                      <div className="text-[10px] font-medium text-slate-600 mt-1 px-2 flex items-center gap-1">
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isMe && (
                          msg.read ? (
                            <span title="נקרא על ידי הנהלה"><CheckCheck className="w-3.5 h-3.5 text-violet-500" /></span>
                          ) : (
                            <span title="נשלח בהצלחה"><Check className="w-3.5 h-3.5 text-slate-600" /></span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Footer - ALWAYS VISIBLE AT BOTTOM (shrink-0) */}
            <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 z-20">
            {adminInputPiiNotice && (
              <p id="admin-chat-pii-notice" role="status" className="px-4 pt-3 text-xs font-bold text-stone-800 dark:text-stone-300">
                {adminInputPiiNotice}
              </p>
            )}
            <div className="p-3.5 flex items-center gap-2.5">
              <input
                type="text"
                value={adminInputText}
                onChange={(e) => setAdminInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendAdmin()}
                placeholder="הקלידו הודעה למנהל המערכת..."
                disabled={readOnly || isSendingAdmin}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                aria-invalid={adminInputPiiNotice ? true : undefined}
                aria-describedby={adminInputPiiNotice ? "admin-chat-pii-notice" : undefined}
                className={`flex-1 bg-slate-50 dark:bg-slate-800 border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all text-slate-900 dark:text-white disabled:opacity-60 ${adminInputPiiNotice ? 'border-stone-400 focus:ring-stone-400' : 'border-slate-200 dark:border-slate-700 focus:ring-violet-500'}`}
              />

              <button
                onClick={handleSendAdmin}
                disabled={readOnly || !adminInputText.trim() || isSendingAdmin || adminInputPiiNotice !== null}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                aria-label="שליחת ההודעה"
                className="rounded-full w-10 h-10 flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white transition-all disabled:opacity-40 shadow-md shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4 -mr-0.5" aria-hidden="true" />
              </button>
            </div>
            </div>
            </div>
          </>
        )}

        {/* STUDENTS CHAT */}
        {activeTab === "chat_students" && (
          <div className={`h-[calc(100dvh-110px)] md:h-auto md:flex-1 md:min-h-[320px] flex flex-col md:flex-row bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden`}>
            {/* Student List Sidebar */}
            <div
              className={`${selectedStudentId ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-l border-slate-200 dark:border-slate-800 flex-col h-full bg-slate-50/50 dark:bg-slate-900/50 shrink-0`}
            >
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                    שיחות עם תלמידים
                  </h3>
                  <div className="flex items-center gap-2">
                    {unreadStudentsCount > 0 && (
                      <button
                        onClick={() => markAllAsRead()}
                        disabled={readOnly}
                        className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:underline transition-colors px-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                        title={readOnly ? READ_ONLY_TITLE : "סמנו את כל ההודעות כנקראו"}
                      >
                        סמנו הכול כנקרא
                      </button>
                    )}
                    <span className="text-xs font-bold px-2.5 py-1 bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-full border border-violet-200/50 dark:border-violet-800/40">
                      {filteredChatStudents.length} תלמידים
                    </span>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-600 absolute right-3 top-3" />
                  <input
                    type="text"
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    placeholder="חפשו תלמיד לפי מספר..."
                    className="w-full pl-3 pr-9 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {filteredChatStudents.length === 0 ? (
                  <div className="text-center text-xs text-slate-600 py-8">לא נמצאו תלמידים מתאימים.</div>
                ) : (
                  filteredChatStudents.map((student) => {
                    const normId = normalizeStudentId(student.studentId);
                    const unreadCount = messages.filter(
                      (m) => normalizeStudentId(m.senderId) === normId && !m.read
                    ).length;
                    const isSelected = selectedStudentId === student.studentId;
                    const lastStudentMsg = messages
                      .filter(m => normalizeStudentId(m.senderId) === normId || normalizeStudentId(m.receiverId) === normId)
                      .sort((a, b) => b.timestamp - a.timestamp)[0];

                    return (
                      <button
                        key={student.studentId}
                        onClick={() => {
                          setSelectedStudentId(student.studentId);
                          setInputText("");
                        }}
                        className={`w-full text-right p-3 rounded-2xl flex items-center justify-between transition-all ${
                          isSelected 
                            ? "bg-violet-600 text-white font-bold shadow-md shadow-violet-600/20" 
                            : "hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm shrink-0 relative ${
                              isSelected ? "bg-white/20 text-white" : "bg-violet-700"
                            }`}
                          >
                            {(student.studentId.replace(/\D/g, '') || '1')}
                            {/* The radar's own signal — hesitating NOW. The old one was
                                any hesitation ever counted, and stuck on meeting 2's number. */}
                            {student.isOnline && (student as { hesitating?: { hesitating?: boolean } }).hesitating?.hesitating === true && (
                              <div
                                className="absolute -top-1 -right-1 bg-stone-500 text-white rounded-full p-0.5 shadow-md"
                                title="מהסס עכשיו"
                              >
                                <ShieldAlert className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col text-right overflow-hidden">
                            <span className={`font-bold text-sm truncate ${isSelected ? "text-white" : "text-slate-900 dark:text-white"}`}>
                              תלמיד {student.studentId.replace(/\D/g, '') || student.studentId}
                            </span>
                            <span className={`text-xs truncate ${isSelected ? "text-violet-100" : "text-slate-600"}`}>
                              {lastStudentMsg?.text || 'לחצו לפתיחת שיחה'}
                            </span>
                          </div>
                        </div>
                        {unreadCount > 0 && (
                          <span className="bg-violet-700 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-md shrink-0">
                            {unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Main Chat Area */}
            <div className={`${!selectedStudentId ? "hidden md:flex" : "flex"} flex-1 flex-col h-full bg-slate-50/50 dark:bg-slate-950/50 relative overflow-hidden`}>
              {selectedStudentId ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm z-10 shrink-0">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedStudentId(null)}
                        className="md:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold"
                      >
                        &rarr; חזרה
                      </button>
                      {/* The learner's number, as in the list beside it. The first
                          letter of "תלמיד N" put a "ת" here for every learner. */}
                      <div className="w-10 h-10 rounded-full bg-violet-700 flex items-center justify-center font-bold text-white shadow-md text-base shrink-0" aria-hidden="true">
                        {selectedStudentId.replace(/\D/g, '') || '?'}
                      </div>
                      {(() => {
                        // The full list: with a search typed, the open learner may be
                        // filtered out, and the header then read "לא מחובר" and the raw id.
                        const openId = normalizeStudentId(selectedStudentId);
                        const currentStudent = allStudents.find((s) => normalizeStudentId(s.studentId) === openId);
                        const isStudentOnline = Boolean(currentStudent?.isOnline);
                        return (
                          <div>
                            <h3 className="font-bold text-base text-slate-900 dark:text-white">
                              {currentStudent?.name || `תלמיד ${selectedStudentId.replace(/\D/g, '') || '?'}`}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`w-2 h-2 rounded-full ${isStudentOnline ? 'bg-violet-600' : 'bg-slate-400'}`}></span>
                              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                                {isStudentOnline ? 'מחובר כעת' : 'לא מחובר'}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Messages Scroll Area */}
                  <div ref={studentMessagesScrollRef} className="flex-1 min-h-0 p-5 overflow-y-auto flex flex-col gap-4">
                    {studentMessages.length === 0 ? (
                      <div className="m-auto text-center flex flex-col items-center justify-center text-slate-600 max-w-sm">
                        <div className="w-16 h-16 rounded-full bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center mb-3 text-violet-500">
                          <MessageCircle className="w-8 h-8 opacity-40" />
                        </div>
                        <h4 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-1">אין הודעות קודמות</h4>
                        <p className="text-xs text-slate-600">הקלידו הודעה או שלחו רמז פדגוגי לתלמיד.</p>
                      </div>
                    ) : (
                      studentMessages.map((msg) => {
                        const targetId = normalizeStudentId(selectedStudentId);
                        const isMe = normalizeStudentId(msg.senderId) !== targetId;
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                          >
                            <div
                              className={`px-4 py-2.5 rounded-2xl shadow-md ${
                                isMe
                                  ? "bg-violet-700 text-white rounded-tl-xs"
                                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-tr-xs"
                              }`}
                            >
                              {msg.text && <p className="leading-relaxed text-sm">{msg.text}</p>}
                            </div>
                            <div className="text-[10px] font-medium text-slate-600 mt-1 px-2 flex items-center gap-1">
                              <span>
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {isMe && (
                                msg.read ? (
                                  <span title="נקרא על ידי התלמיד"><CheckCheck className="w-3.5 h-3.5 text-violet-500" /></span>
                                ) : (
                                  <span title="נשלח בהצלחה"><Check className="w-3.5 h-3.5 text-slate-600" /></span>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Input Footer - ALWAYS VISIBLE AT BOTTOM (shrink-0) */}
                  <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 z-20">
                  {studentInputPiiNotice && (
                    <p id="student-chat-pii-notice" role="status" className="px-4 pt-3 text-xs font-bold text-stone-800 dark:text-stone-300">
                      {studentInputPiiNotice}
                    </p>
                  )}
                  <div className="p-3.5 flex items-center gap-2.5">
                    <input
                      ref={studentChatInputRef}
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendStudent()}
                      placeholder="הקלידו הודעה לתלמיד..."
                      disabled={readOnly}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      aria-invalid={studentInputPiiNotice ? true : undefined}
                      aria-describedby={studentInputPiiNotice ? "student-chat-pii-notice" : undefined}
                      className={`flex-1 bg-slate-50 dark:bg-slate-800 border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all text-slate-900 dark:text-white ${studentInputPiiNotice ? 'border-stone-400 focus:ring-stone-400' : 'border-slate-200 dark:border-slate-700 focus:ring-violet-500'}`}
                    />

                    <button
                      onClick={handleSendStudent}
                      disabled={readOnly || !inputText.trim() || studentInputPiiNotice !== null}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      aria-label="שליחת ההודעה"
                      className="rounded-full w-10 h-10 flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white transition-all disabled:opacity-40 shadow-md shrink-0"
                    >
                      <Send className="w-4 h-4 -mr-0.5" aria-hidden="true" />
                    </button>
                  </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-950/50">
                  <div className="w-20 h-20 rounded-3xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center mb-4 text-violet-600 dark:text-violet-400 shadow-sm border border-violet-100 dark:border-violet-900/50">
                    <MessageCircle className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                    שיחות פדגוגיות עם תלמידים
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm leading-relaxed">
                    בחרו תלמיד מהרשימה מימין כדי להציג את היסטוריית השיחה ולהעביר הנחיות או רמזים פדגוגיים בזמן אמת.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {drawerStudent && (
          <StudentLearningConditionsDrawer
            student={drawerStudent}
            activeSessionNumber={isClassSessionActive ? selectedSessionNum : null}
            onClose={() => setDrawerStudentId(null)}
            onOpenChat={(st) => openLearnerChat(st)}
            onOpenFullJourney={(sId) => {
              setSelectedStudentId(sId);
              setSelectedReplayStudentId(sId);
              setActiveTab("diagnostic_reports");
              setDrawerStudentId(null);
            }}
          />
        )}

        {gateStudent && (
          <TeacherGateApprovalDrawer
            student={gateStudent}
            evidence={gateEvidenceFor(gateStudent.studentId)}
            onClose={() => setGateStudent(null)}
            onApproveSuccess={() => {
              // Approval handled inside with toast and state updates
            }}
          />
        )}
        {floatingChatStudent && (
          <FloatingChatPanel
            // A panel per learner: text typed to one never stays for the next.
            // The learner is read live, so the online dot follows the heartbeat.
            key={normalizeStudentId(floatingChatStudent.studentId)}
            student={allStudents.find((st) => normalizeStudentId(st.studentId) === normalizeStudentId(floatingChatStudent.studentId)) ?? floatingChatStudent}
            onClose={() => setFloatingChatStudent(null)}
            teacherId={(user?.uid as string) || TEACHER_ID}
          />
        )}

        {/* Module 14 §ב0: explicit confirmation before opening a session for the class */}
        <SessionActivationModal
          isOpen={pendingActivationSession !== null}
          sessionNumber={pendingActivationSession}
          sessions={sessionRows}
          isStarting={isStartingSession}
          onClose={() => {
            if (!isStartingSession) {
              setPendingActivationSession(null);
            }
          }}
          onConfirm={async (sessionNum) => {
            // Already open (from another dashboard tab): a second write would
            // restart its start stamp and with it the 45-minute limit.
            if (isClassSessionActive && selectedSessionNum === sessionNum) {
              setPendingActivationSession(null);
              return;
            }
            // Catch-up time: the open (or time-closed) meeting's unfinished
            // learners get their reasons first; the dialog then opens one of
            // the two meetings.
            if (catchUpBeforeOpening(sessionNum)) {
              setPendingActivationSession(null);
              return;
            }
            setIsStartingSession(true);
            try {
              const success = await handleStartClassSession(sessionNum);
              if (success) {
                setPendingActivationSession(null);
                // The lesson starts: the teacher lands on the radar (owner,
                // 10.10.2026). Only on her own activation — never on a change
                // that arrives from elsewhere, so no tab ever moves under her.
                handleTabChange("heatmap");
              }
            } finally {
              setIsStartingSession(false);
            }
          }}
        />

        {closeChecklistOpen && isClassSessionActive && (
          <CloseMeetingChecklist
            meeting={selectedSessionNum}
            helpLearners={helpLearnerNumbers}
            onClearAllHelp={clearAllHelpCalls}
            projectorOn={isProjectorModeActive}
            reasonLearners={catchUpDialog?.trigger === 'close' ? catchUpDialog.learners : []}
            isSaving={isSavingCatchUp}
            busy={isUpdatingSession}
            readOnly={readOnly}
            onReopen={(entries) => { void handleCatchUpChoice('reopen', entries); }}
            onContinue={(entries) => { void handleCatchUpChoice('continue', entries); }}
            onClose={() => { setCloseChecklistOpen(false); void closeWithSummary(); }}
            onCancel={() => {
              // Also while saving: the teacher is never held here; the chosen action is then not taken.
              if (isSavingCatchUp) catchUpCancelledRef.current = true;
              setCatchUpDialog(null);
              setCloseChecklistOpen(false);
            }}
          />
        )}

        {/* Catch-up time (owner decision 2.10.2026): why each learner did not
            finish, before the close or the other meeting is written. */}
        {catchUpDialog !== null && !closeChecklistOpen && (
          <CatchUpReasonsDialog
            isOpen
            meeting={catchUpDialog.meeting}
            learners={catchUpDialog.learners}
            trigger={catchUpDialog.trigger}
            nextMeeting={catchUpDialog.nextMeeting}
            isMeeting2={catchUpDialog.meeting === 2}
            isSaving={isSavingCatchUp}
            onReopen={(entries) => { void handleCatchUpChoice('reopen', entries); }}
            onContinue={(entries) => { void handleCatchUpChoice('continue', entries); }}
            onCancel={() => {
              // Also while saving: the teacher is never held here; the chosen action is then not taken.
              if (isSavingCatchUp) catchUpCancelledRef.current = true;
              setCatchUpDialog(null);
            }}
          />
        )}

      </main>
      </div>
    </div>
    </MotionConfig>
  );
}


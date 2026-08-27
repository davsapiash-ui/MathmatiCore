import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { Logo } from "@/presentation/components/ui/Logo";
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { DataGrid } from "@/presentation/design-system/DataGrid";
import { useAuthStore } from "@/application/useAuthStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useChatStore, normalizeStudentId, isTeacherOrAdminId, type ChatMessage } from "@/application/useChatStore";
import { extractTeacherId } from "@/infrastructure/services/FirebaseSyncService";
import { useStore, type StudentData } from "@/application/useStore";
import { toast } from "sonner";
import { ref, onValue, remove, set, update, query, limitToLast } from "firebase/database";
import { database, auth, functions, firestore } from "@/infrastructure/firebase";
import { doc, getDoc, updateDoc, setDoc, onSnapshot, collection } from "firebase/firestore";
import type { SessionDocument, PedagogicalPath } from "@/types";
import { httpsCallable } from "firebase/functions";
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
import { Send, MessageCircle, ShieldAlert, Sliders, Search, Check, CheckCheck, Sparkles, Users } from "lucide-react";

import { ClassManagement } from "./TeacherDashboard/ClassManagement";
import { StudentReplayAndLogs } from "./TeacherDashboard/components/StudentReplayAndLogs";
import { StudentLearningConditionsDrawer } from "./TeacherDashboard/components/StudentLearningConditionsDrawer";
import { TeacherGateApprovalDrawer } from "./TeacherDashboard/components/TeacherGateApprovalDrawer";
import { FloatingChatPanel } from "./TeacherDashboard/components/FloatingChatPanel";
import { HeatmapGrid } from "./TeacherDashboard/components/HeatmapGrid";
import { ClusteringWidgets } from "./TeacherDashboard/components/ClusteringWidgets";
import { TeacherApprovalGate, type GateStudentItem } from "./TeacherDashboard/components/TeacherApprovalGate";
import { SocraticEngine, type PendingAIApproval } from "@/infrastructure/services/SocraticEngine";
import type { RadarAlert } from "@/types/dashboard";
import { CONCEPT_LABELS_HE } from "@/core/QMatrix";
import { validateChatInputForPII, anonymizeChatMessageBody } from "@/core/security/PiiFilter";

const getStudentKPIs = (student: StudentData, messages: ChatMessage[]) => {
  const undo = student.traceData?.undo_clicks || 0;
  const hesitation = student.traceData?.hesitation_events || 0;
  const errors = (student as any).errorCount || (student as any).errors || 0;
  const guesses = (student as any).guessCount || (student as any).distractorClicks || 0;
  const hasHistory = (student.highestCompletedMeeting || 0) > 0 || Boolean(student.completedMeeting2) || undo > 0 || hesitation > 0 || errors > 0;

  if (!hasHistory) {
    return {
      hasData: false,
      persistence: 0,
      efficiency: 0,
      dialogueQuality: 0,
    };
  }

  // SRL Canonical Persistence Ratio: (U / (U + E + G)) * 100 with safe 0/0/0 handling
  const safeU = Math.max(0, undo);
  const safeE = Math.max(0, errors);
  const safeG = Math.max(0, guesses);
  const denominator = safeU + safeE + safeG;
  const persistence = denominator <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((safeU / denominator) * 100)));

  const meeting2Bonus = student.completedMeeting2 ? 10 : 0;
  const efficiencyScore = 90 - 2.5 * (undo + hesitation) + meeting2Bonus;
  const efficiency = Math.round(Math.max(0, Math.min(100, efficiencyScore)));

  const teacherMsgs = messages.filter(msg => msg.receiverId === student.studentId && msg.senderId !== student.studentId);
  let dialogueQuality = 0;
  if (teacherMsgs.length > 0) {
    const keywords = ["איך", "כיצד", "למה", "מדוע", "אסטרטגיה", "שלב", "דרך", "מחשבה", "פריטה", "קיבוץ", "המרה"];
    const matchingMsgs = teacherMsgs.filter(msg => 
      keywords.some(keyword => msg.text.includes(keyword))
    );
    dialogueQuality = Math.round((matchingMsgs.length / teacherMsgs.length) * 100);
  }

  return {
    hasData: true,
    persistence,
    efficiency,
    dialogueQuality
  };
};

type TabType =
  | "heatmap"
  | "clustering"
  | "alerts"
  | "diagnostic_reports"
  | "chat_admin"
  | "chat_students"
  | "class_management"
  | "approvals";

/**
 * Analyzes teacher's query to generate contextual AI responses and dynamic plan updates.
 */
function generateCoPilotResponse(
  query: string,
  currentTasks: any[],
  studentName: string
): { aiResponse: string; updatedTasks?: any[] } {
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  // 1. Exercise additions (e.g. הוסף תרגיל, להוסיף משימה, add exercise)
  if (/הוסף|להוסיף|הוספה|תרגיל נוסף|משימה חדשה|תרגילים נוספים|add/i.test(lowerQuery)) {
    const newTaskIndex = (currentTasks?.length || 0) + 1;
    const numA = Math.floor(Math.random() * 400) + 100;
    const numB = Math.floor(Math.random() * 400) + 100;
    const newTask = {
      id: `custom_ai_${Date.now()}`,
      type: 'vertical_addition',
      titleHe: `תרגיל מותאם אישית ${newTaskIndex}`,
      instructionHe: `תרגיל נוסף שנבנה על פי בקשתך עבור ${studentName}`,
      numberA: numA,
      numberB: numB,
      scaffoldLevel: 1,
      correctAnswer: numA + numB
    };
    const newTasks = [...(currentTasks || []), newTask];
    return {
      aiResponse: `הוספתי תרגיל חדש ("${newTask.titleHe}") לתוכנית הלמידה עבור ${studentName}. כעת התוכנית כוללת ${newTasks.length} משימות.`,
      updatedTasks: newTasks
    };
  }

  // 2. Difficulty / Scaffolding adjustments (e.g. הקל/הורד קושי/רמה/פיגום vs הקשה/העלה קושי/אתגר)
  if (/רמה|קושי|להקל|קל|פשוט|פיגום|scaffold|סיוע|עזרה|תמיכה|להקשות|קשה|אתגר/i.test(lowerQuery)) {
    const wantsEasier = /להקל|קל|פשוט|פיגום|scaffold|סיוע|עזרה|תמיכה|הורד|להוריד/i.test(lowerQuery);
    if (currentTasks && currentTasks.length > 0) {
      const updatedTasks = currentTasks.map((task: any) => {
        const currentScaffold = typeof task.scaffoldLevel === 'number' ? task.scaffoldLevel : 0;
        const newScaffold = wantsEasier 
          ? Math.min(2, currentScaffold + 1) 
          : Math.max(0, currentScaffold - 1);
        return { ...task, scaffoldLevel: newScaffold };
      });
      const scaffoldDesc = wantsEasier ? 'תמיכה מוגברת (פיגום מורחב)' : 'אתגר מוגבר (פיגום מצומצם)';
      return {
        aiResponse: `עדכנתי את רמת התמיכה והפיגום בכל ${updatedTasks.length} התרגילים עבור ${studentName} לרמת ${scaffoldDesc}.`,
        updatedTasks
      };
    }
    return {
      aiResponse: `ניתחתי את בקשתך להתאמת רמת הקושי עבור ${studentName}. התוכנית תותאם ברגע שתחולל משימות.`
    };
  }

  // 3. Removal / Deletion of tasks (e.g. מחק, הסר, הורד תרגיל, delete, remove)
  if (/מחק|להסיר|הסר|הורד|להוריד|צמצם|להפחית|delete|remove/i.test(lowerQuery)) {
    if (currentTasks && currentTasks.length > 1) {
      const updatedTasks = currentTasks.slice(0, currentTasks.length - 1);
      return {
        aiResponse: `הסרתי את המשימה האחרונה מתוכנית הלמידה של ${studentName}. כעת נותרו ${updatedTasks.length} משימות.`,
        updatedTasks
      };
    }
    if (currentTasks && currentTasks.length === 1) {
      return {
        aiResponse: `קיים תרגיל יחיד בתוכנית של ${studentName}. מומלץ לא למחוק את כל המשימות כדי לשמור על רצף למידה.`
      };
    }
    return {
      aiResponse: `אין משימות קיימות למחיקה בתוכנית של ${studentName}.`
    };
  }

  // 4. Topic / Skill Focus Areas (e.g. חיבור, חיסור, כפל, חילוק, שברים, focus)
  if (/חיבור|חיסור|כפל|חילוק|שברים|משוואות|גיאומטריה|נושא|דגש|חיזוק|focus/i.test(lowerQuery)) {
    let topicName = 'מיומנויות יסוד';
    if (lowerQuery.includes('חיבור')) topicName = 'חיבור';
    else if (lowerQuery.includes('חיסור')) topicName = 'חיסור';
    else if (lowerQuery.includes('כפל')) topicName = 'כפל';
    else if (lowerQuery.includes('חילוק')) topicName = 'חילוק';
    else if (lowerQuery.includes('שברים')) topicName = 'שברים';

    if (currentTasks && currentTasks.length > 0) {
      const updatedTasks = currentTasks.map((t: any) => ({
        ...t,
        titleHe: `${t.titleHe ? t.titleHe.split(' - ')[0] : 'תרגיל'} - דגש ${topicName}`,
        instructionHe: `פתור את התרגיל תוך התמקדות במיומנות ${topicName} עבור ${studentName}`
      }));
      return {
        aiResponse: `התאמתי את משימות הלימוד עבור ${studentName} להתמקדות בנושא ${topicName}. כותרות והוראות המשימות עודכנו בעורך.`,
        updatedTasks
      };
    }
    return {
      aiResponse: `רשמתי לפניי להתמקד בנושא ${topicName} עבור ${studentName} במפגש הקרוב.`
    };
  }

  // 5. General Plan Modifications / Adjustments (e.g. עדכן, שנה, ערוך, תוכנית, התאמה)
  if (/עדכן|שנה|ערוך|תקן|התאם|סדר|תוכנית|שינוי|תוכניות|update|plan|modify/i.test(lowerQuery)) {
    const count = currentTasks?.length || 0;
    return {
      aiResponse: `עדכנתי את תוכנית הלמידה עבור ${studentName} בהתאם להנחיה "${trimmedQuery}". התוכנית כוללת כעת ${count} משימות מותאמות.`
    };
  }

  // 6. Contextual Dynamic Fallback (Extracting key phrases from prompt)
  const words = trimmedQuery.split(/\s+/).filter(w => w.length > 2);
  const keywordSummary = words.length > 0 ? `בנושא "${words.slice(0, 3).join(' ')}"` : '';
  return {
    aiResponse: `קיבלתי את הבקשה ${keywordSummary} עבור ${studentName}. עדכנתי את הגדרות ה-Co-Pilot והתאמתי את תוכנית הלימודים בהתאם.`
  };
}

export function TeacherDashboard({ hideSidebar = false }: { hideSidebar?: boolean }) {
  const { id: routeStudentId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const { messages, sendMessage, markAsRead, initSync } = useChatStore();

  useEffect(() => {
    initSync();
    const unsubAdmin = useAdminStore.getState().initAdminSubscriptions();
    const unsubStore = useStore.getState().initStoreSubscriptions();
    return () => {
      if (unsubAdmin) unsubAdmin();
      if (unsubStore) unsubStore();
    };
  }, [initSync]);

  const teacherFileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const [sendingImage, setSendingImage] = useState(false);

  const _handleToggleGlobalChat = (enabled: boolean) => {
    useStore.setState({ globalChatEnabled: enabled });
    set(ref(database, 'system_control/globalChatEnabled'), enabled).catch(console.error);
  };
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

  const [activeTab, setActiveTab] = useState<TabType>(
    routeStudentId ? "diagnostic_reports" : "heatmap",
  );
  const [activeClusterFilter, setActiveClusterFilter] = useState<string | null>(null);

  const [inputText, setInputText] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    routeStudentId || null,
  );
  const [selectedReplayStudentId, setSelectedReplayStudentId] = useState<string | null>(
    routeStudentId || null,
  );
  const [drawerStudent, setDrawerStudent] = useState<StudentData | null>(null);
  const [gateStudent, setGateStudent] = useState<StudentData | null>(null);
  const [floatingChatStudent, setFloatingChatStudent] = useState<StudentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Update active tab and selected student based on route params (PRD 4.3 Navigation Redundancy)
  useEffect(() => {
    if (routeStudentId) {
      setSelectedStudentId(routeStudentId);
      setSelectedReplayStudentId(routeStudentId);
      setActiveTab("diagnostic_reports");
      // Clean up the URL so it doesn't stay if they close it, or leave it. The PRD just says we support it.
    }
  }, [routeStudentId]);

  const [teacherApprovals, setTeacherApprovals] = useState<PendingAIApproval[]>([]);
  const [fallbackApprovals, setFallbackApprovals] = useState<PendingAIApproval[]>([]);

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
  const [_sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [selectedSessionNum, setSelectedSessionNum] = useState<number>(1);

  // Sync active class session with Firebase
  useEffect(() => {
    const sessionRef = ref(database, 'active_class_session');
    const unsub = onValue(
      sessionRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          if (val && val.active) {
            setIsClassSessionActive(true);
            setSessionStartTime(val.startedAt || Date.now());
            setSelectedSessionNum(val.sessionNumber || 1);
            return;
          }
        }
        setIsClassSessionActive(false);
        setSessionStartTime(null);
      },
      (err) => {
        console.error('[TeacherDashboard] RTDB "active_class_session" listener error:', err);
      }
    );
    return () => unsub();
  }, []);

  // Auto-sync teacher role claim on dashboard mount
  useEffect(() => {
    if (auth.currentUser) {
      auth.currentUser.getIdTokenResult().then((tokenResult) => {
        if (!tokenResult.claims.role || (tokenResult.claims.role !== "teacher" && tokenResult.claims.role !== "admin")) {
          const syncCallable = httpsCallable(functions, "syncUserRoles");
          syncCallable()
            .then(() => auth.currentUser?.getIdToken(true))
            .catch((e) => console.warn("Auto-sync role warning:", e));
        }
      }).catch(console.warn);
    }
  }, []);

  const handleStartClassSession = async (sessionNum: number) => {
    const now = Date.now();
    setSessionStartTime(now);
    setSelectedSessionNum(sessionNum);
    setIsClassSessionActive(true);
    try {
      if (auth.currentUser) {
        try {
          const tokenRes = await auth.currentUser.getIdTokenResult();
          if (!tokenRes.claims.role || (tokenRes.claims.role !== "teacher" && tokenRes.claims.role !== "admin")) {
            const syncCallable = httpsCallable(functions, "syncUserRoles");
            await syncCallable();
            await auth.currentUser.getIdToken(true);
          }
        } catch (roleErr) {
          console.warn('[TeacherDashboard] Role sync notice (non-fatal):', roleErr);
        }
      }
      await set(ref(database, 'active_class_session'), {
        active: true,
        sessionNumber: sessionNum,
        startedAt: now,
        teacherId: user?.uid || 'teacher',
      });
      toast.success(`שיעור ${sessionNum} הופעל בהצלחה לכלל תלמידי הכיתה! 🚀`);
    } catch (err) {
      console.error('Error starting class session:', err);
      toast.error('שגיאה בהפעלת המפגש מול השרת. אנא בדוק חיבור לרשת.');
    }
  };

  const handleEndClassSession = async () => {
    setIsClassSessionActive(false);
    setSessionStartTime(null);
    try {
      if (auth.currentUser) {
        try {
          const tokenRes = await auth.currentUser.getIdTokenResult();
          if (!tokenRes.claims.role || (tokenRes.claims.role !== "teacher" && tokenRes.claims.role !== "admin")) {
            const syncCallable = httpsCallable(functions, "syncUserRoles");
            await syncCallable();
            await auth.currentUser.getIdToken(true);
          }
        } catch (roleErr) {
          console.warn('[TeacherDashboard] Role sync notice (non-fatal):', roleErr);
        }
      }
      await set(ref(database, 'active_class_session'), {
        active: false,
        sessionNumber: null,
        endedAt: Date.now(),
        teacherId: user?.uid || 'teacher',
      });
      toast.info('המפגש הכיתתי נסגר בהצלחה. כלל התלמידים מועברים למצב המתנה.');
    } catch (err) {
      console.error('Error ending class session:', err);
      toast.error('שגיאה בסגירת המפגש מול השרת.');
    }
  };

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [editingApproval, setEditingApproval] = useState<PendingAIApproval | null>(null);
  const [editedTasks, setEditedTasks] = useState<any[] | null>(null);
  const [coPilotChat, setCoPilotChat] = useState<{ role: 'ai' | 'teacher', text: string }[]>([
    { role: 'ai', text: 'שלום מורה! אני עוזר הפדגוגיה הדיגיטלי שלך. תוכל לבקש ממני להתאים את מסלול הלימוד של תלמיד, לשנות דרגת קושי או להוסיף רמזים מותאמים אישית.' }
  ]);
  const [_inputPrompt, _setInputPrompt] = useState('');
  const [coPilotInput, setCoPilotInput] = useState('');
  const [_isProcessingAI, _setIsProcessingAI] = useState(false);

  const pendingApprovals = useMemo(() => {
    const map = new Map<string, PendingAIApproval>();
    teacherApprovals.forEach(a => map.set(a.id, a));
    fallbackApprovals.forEach(a => map.set(a.id, a));
    return Array.from(map.values());
  }, [teacherApprovals, fallbackApprovals]);

  // Multi-Tenant context: TEACHER_ID is the canonical ID of the logged-in teacher (e.g. "12345" if rawUid is "teacher_12345" or "12345")
  // All student queries and pending AI approval paths map under this ID.
  const TEACHER_ID = useMemo(() => {
    return extractTeacherId(user?.email, (user?.uid || user?.id) as string);
  }, [user]);

  useEffect(() => {
    const studentsRef = ref(database, 'users/students');
    const unsubscribe = onValue(studentsRef, (snapshot) => {
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

        // 2. Override with live cloud data
        Object.keys(data).forEach((uid) => {
          const row = data[uid] ?? {};
          const normUid = normalizeStudentId(uid);
          // Only map to normalized pilot IDs (student_user1..student_user12)
          if (!normUid.startsWith('student_user')) return;

          let cleanName = row.name ?? row.profile?.displayName ?? row.studentName ?? formattedStudents[normUid]?.name ?? normUid.replace('student_user', 'תלמיד ');
          if (cleanName === 'student' || cleanName.startsWith('user') || cleanName.toLowerCase().startsWith('student_') || cleanName.startsWith('משתמש')) {
            const num = normUid.replace(/[^0-9]/g, '');
            cleanName = num ? `תלמיד ${num}` : cleanName;
          }

          const existingLocal = formattedStudents[normUid];

          formattedStudents[normUid] = {
            ...(existingLocal || {}),
            ...row,
            studentId: normUid,
            classId: row.classId ?? existingLocal?.classId ?? 'live',
            name: cleanName,
            isOnline: Boolean(row.isOnline === true && row.onlineStatus !== 'offline' && (row.lastPing ? Math.abs(Date.now() - row.lastPing) <= 12000 : false)),
            lastPing: row.lastPing || 0,
            lastActivityTimestamp: row.lastActivityTimestamp || 0,
            lastAction: row.isOnline === true ? (row.lastAction || 'פעיל') : 'לא מחובר',
            hasJoinedSession: row.hasJoinedSession === true || row.sessionJoined === true,
            highestCompletedMeeting: typeof row.highestCompletedMeeting === 'number' 
              ? row.highestCompletedMeeting 
              : (existingLocal?.highestCompletedMeeting ?? 0),
            physicalOverride: row.physicalOverride === true || row.physicalOverrideActive === true,
            physicalOverrideActive: row.physicalOverrideActive === true || row.physicalOverride === true,
            workspaceState: row.workspaceState || existingLocal?.workspaceState || null,
            qMatrixResults: Object.assign(
              {},
              existingLocal?.qMatrixResults || {},
              row.qMatrixResults || {}
            ),
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
            diagnosticReport: row.diagnosticReport ?? existingLocal?.diagnosticReport ?? null,
            additionBoardEnabled: row.additionBoardEnabled ?? existingLocal?.additionBoardEnabled ?? false,
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
      setIsLoading(false);
    });
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      unsubscribe();
    };
  }, [TEACHER_ID, user?.role]);

  useEffect(() => {
    try {
      const rootPendingRef = ref(database, 'ai_pending_approvals');
      const unsubscribe = onValue(
        rootPendingRef,
        (snap) => {
          if (!snap.exists()) {
            setTeacherApprovals([]);
            setFallbackApprovals([]);
            return;
          }
          const raw = snap.val() || {};
          const allList: PendingAIApproval[] = [];
          Object.keys(raw).forEach((k) => {
            const item = raw[k];
            if (item && typeof item === 'object') {
              if (item.studentId || item.suggestedRoute) {
                allList.push({ id: k, ...item });
              } else {
                Object.keys(item).forEach((subK) => {
                  const subItem = item[subK];
                  if (subItem && typeof subItem === 'object') {
                    allList.push({ id: subK, ...subItem });
                  }
                });
              }
            }
          });
          setTeacherApprovals(allList);
        },
        (err) => {
          console.error('[TeacherDashboard] RTDB "ai_pending_approvals" listener error:', err);
        }
      );
      return () => unsubscribe();
    } catch {
      SocraticEngine.getPendingApprovals(TEACHER_ID).then(setTeacherApprovals).catch((err) => {
        console.warn('Fallback SocraticEngine pending approvals notice:', err);
      });
    }
  }, [TEACHER_ID]);

  const handleHintClick = (studentId: string) => {
    const normId = normalizeStudentId(studentId);
    const hintPayload = {
      timestamp: Date.now(),
      message: "המורה שלח/ה לך רמז: נסה/י להשתמש בלוח העשרות כדי לפרוט."
    };
    // 1. Write the hint flag to Firebase so the student gets an actual popup
    set(ref(database, `users/students/${studentId}/teacher_hint`), hintPayload).then(() => {
      if (normId !== studentId) {
        set(ref(database, `users/students/${normId}/teacher_hint`), hintPayload).catch((err) => {
          console.warn('Teacher hint mirror notice:', err);
        });
      }
      // 2. Switch to chat so the teacher can follow up manually
      setSelectedStudentId(studentId);
      setActiveTab("chat_students");
      toast.success(`רמז נשלח בהצלחה לתלמיד! 💡`);
    }).catch((err: any) => {
      console.error("Failed to send hint:", err);
      toast.error("שגיאה בשליחת הרמז לתלמיד.");
    });
  };

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


  const decimalStructureGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.decimal_structure < 0.5
  );
  const _numberMagnitudeGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.number_magnitude < 0.5
  );
  const regroupingFluencyGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.regrouping_fluency < 0.5
  );
  const proceduralFluencyGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.procedural_fluency < 0.5
  );
  const relationalThinkingGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.relational_thinking < 0.5
  );
  const algebraicReasoningGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.algebraic_reasoning < 0.5
  );



  const pendingRouteStudents = allStudents.filter(
    (s) => s.routeStatus === 'PENDING',
  );

  const approveRoute = useStore((s) => s.approveRoute);

  // Aggregate data for Chart
  const qMatrixData = useMemo(() => {
    let ds_s = 0, ds_f = 0,
        nm_s = 0, nm_f = 0,
        rf_s = 0, rf_f = 0,
        pf_s = 0, pf_f = 0,
        rt_s = 0, rt_f = 0,
        ar_s = 0, ar_f = 0;
    
    allStudents.forEach((s) => {
      if (!s.conceptMastery) return;
      if (s.conceptMastery.decimal_structure >= 0.8) ds_s++; else ds_f++;
      if (s.conceptMastery.number_magnitude >= 0.8) nm_s++; else nm_f++;
      if (s.conceptMastery.regrouping_fluency >= 0.8) rf_s++; else rf_f++;
      if (s.conceptMastery.procedural_fluency >= 0.8) pf_s++; else pf_f++;
      if (s.conceptMastery.relational_thinking >= 0.8) rt_s++; else rt_f++;
      if (s.conceptMastery.algebraic_reasoning >= 0.8) ar_s++; else ar_f++;
    });

    return [
      { name: CONCEPT_LABELS_HE.decimal_structure, success: ds_s, struggle: ds_f },
      { name: CONCEPT_LABELS_HE.number_magnitude, success: nm_s, struggle: nm_f },
      { name: CONCEPT_LABELS_HE.regrouping_fluency, success: rf_s, struggle: rf_f },
      { name: CONCEPT_LABELS_HE.procedural_fluency, success: pf_s, struggle: pf_f },
      { name: CONCEPT_LABELS_HE.relational_thinking, success: rt_s, struggle: rt_f },
      { name: CONCEPT_LABELS_HE.algebraic_reasoning, success: ar_s, struggle: ar_f },
    ];
  }, [allStudents]);

  // Generate trace data alerts

  const [firebaseAlerts, setFirebaseAlerts] = useState<RadarAlert[]>([]);

  useEffect(() => {
    const alertsQuery = query(ref(database, 'radar_alerts'), limitToLast(50));
    const unsub = onValue(
      alertsQuery,
      (snapshot) => {
        try {
          const rawData = snapshot.val();
          const data = (rawData && typeof rawData === 'object') ? rawData : null;
          if (data) {
            const parsed = Object.keys(data).map(key => {
              const row = data[key as keyof typeof data];
              const rawId = row.studentId ?? row.rawStudentId ?? row.student ?? row.username;
              return {
                ...row,
                firebaseKey: key,
                studentId: row.studentId ?? row.studentName ?? rawId ?? 'תלמיד',
                rawStudentId: rawId,
              };
            }).reverse();
            setFirebaseAlerts(parsed);
          } else {
            setFirebaseAlerts([]);
          }
        } catch (e) {
          console.error("Error parsing radar alerts:", e);
          setFirebaseAlerts([]);
        }
      },
      (err) => {
        console.error('[TeacherDashboard] RTDB "radar_alerts" listener error:', err);
      }
    );
    return () => unsub();
  }, []);

  const allAlerts = useMemo(() => {
    // Only show firebase alerts from the last 90 minutes for real-time relevance
    const ninetyMinsAgo = Date.now() - 90 * 60 * 1000;
    return firebaseAlerts
      .filter(a => a.timestamp > ninetyMinsAgo)
      .map(a => {
        const actualStudent = students[a.rawStudentId] || Object.values(students).find((s: StudentData) => s.studentId === a.rawStudentId || s.name === a.rawStudentId);
        return {
          ...a,
          studentId: actualStudent?.name ?? a.studentId,
        };
      })
      .filter(a => {
        const actualStudent = students[a.rawStudentId] || Object.values(students).find((s: StudentData) => s.studentId === a.rawStudentId || s.name === a.rawStudentId);
        // Only show alerts for students in this teacher's class
        const isMyStudent = !!actualStudent;
        
        // Anti-leakage: must belong to this teacher (fallback to true for legacy alerts without teacherId, but reset will clean them)
        const aAny = a as any;
        const isMyTeacher = aAny.teacherId ? aAny.teacherId === TEACHER_ID : true;
        
        // Help alerts and radar calls stay persistent even if student disconnected!
        return isMyStudent && isMyTeacher;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [firebaseAlerts, students, TEACHER_ID]);

  const handleAssignIntervention = async (clusterName: string, studentList: StudentData[]) => {
    try {
      for (const s of studentList) {
        const norm = normalizeStudentId(s.studentId);
        await update(ref(database, `users/students/${norm}`), {
          activeIntervention: clusterName,
          interventionAssignedAt: Date.now()
        });
      }
      toast.success(`פעילות "${clusterName}" הוקצתה בהצלחה ל-${studentList.length} תלמידים! 🎯`);
    } catch (err) {
      console.error('Error assigning intervention:', err);
      toast.error('שגיאה בהקצאת הפעילות. בדוק חיבור לרשת.');
    }
  };

  const handleAlertResponse = (alert: RadarAlert, responseType: string, responseText: string) => {
    // 1. Record the intervention in the student's trace data
    if (alert.rawStudentId) {
      const interventionId = Date.now().toString();
      set(ref(database, `users/students/${alert.rawStudentId}/traceData/interventions/${interventionId}`), {
        timestamp: Date.now(),
        alertType: alert.type || 'UNKNOWN',
        responseType,
        responseText
      });
    }

    // 2. Execute any specific logic for the response
    if (responseType === 'HINT') {
      handleHintClick(alert.rawStudentId);
      toast.success(`נשלח רמז אישי לתלמיד ${alert.studentId || ''}`);
    } else if (responseType === 'PHYSICAL') {
      toast.success(`סומן: ניגשת פיזית לתלמיד ${alert.studentId || ''}`);
    } else if (responseType === 'ACKNOWLEDGED') {
      toast.info('ההתראה סומנה כטופלה והוסרה');
    }

    // 3. Dismiss the alert from the radar queue
    if (alert.firebaseKey) {
      remove(ref(database, `radar_alerts/${alert.firebaseKey}`));
    }
  };

  // --- Module 20: Diagnostic Gate Students Computation (WP6 Formulas & Firestore Sync) ---
  const gateStudentItems: GateStudentItem[] = useMemo(() => {
    const items: GateStudentItem[] = [];
    for (let i = 1; i <= 12; i++) {
      const sId = `student_${i}`;
      const studentData = students[sId] || students[String(i)];
      const session2Doc = firestoreSession2Docs[sId] || firestoreSession2Docs[String(i)];

      const isCompleted = Boolean(
        session2Doc?.is_completed ||
        studentData?.completedMeeting2 ||
        studentData?.session_2_completed ||
        (studentData?.highestCompletedMeeting && studentData.highestCompletedMeeting >= 2) ||
        studentData?.routeStatus === 'PENDING_TEACHER_APPROVAL'
      );

      if (!isCompleted) continue;

      const isApproved = Boolean(
        session2Doc?.teacher_gate_approved ||
        studentData?.teacher_gate_approved ||
        studentData?.routeStatus === 'APPROVED'
      );

      // Score percent strictly from Firestore Session Document (NO synthetic default)
      const hasRealScore = typeof session2Doc?.session_score_percent === 'number';
      const scorePercent = hasRealScore ? session2Doc.session_score_percent : null;

      // WP6 Canonical Threshold Formula: >= 50% -> green_path, < 50% -> remediation_path
      const recommendedPath: PedagogicalPath =
        session2Doc?.matrix_recommended_path ||
        (scorePercent !== null && scorePercent >= 50 ? 'green_path' : 'remediation_path');

      items.push({
        studentId: sId,
        anonymousLabel: `תלמיד ${i}`,
        session2Doc,
        recommendedPath,
        isApproved,
        scoreSummary: scorePercent !== null
          ? `ציון דיאגנוסטי: ${Math.round(scorePercent)}% (7 משימות חובה)`
          : 'סיום ראשוני — ממתין לחישוב מדדים',
        errorNodes: scorePercent !== null && scorePercent < 50 ? ['המרה בעשרות', 'ערך מיקום'] : undefined,
      });
    }
    return items;
  }, [students, firestoreSession2Docs]);

  const handleApproveGateStudent = async (studentId: string, path: PedagogicalPath) => {
    setIsApprovingGate(true);
    const normNum = studentId.replace(/\D/g, '') || '1';
    const sessionDocId = `session_02_student_${normNum}`;
    const normId = `student_${normNum}`;
    const now = Date.now();

    try {
      // 1. Verify existence of real SessionDocument in Cloud Firestore (Zero Fake Scores)
      const sessionDocRef = doc(firestore, 'sessions', sessionDocId);
      const sessionSnap = await getDoc(sessionDocRef);

      if (!sessionSnap.exists()) {
        toast.error(`לא נמצא מסמך אבחון (Session 2) עבור תלמיד ${normNum}. לא ניתן לאשר מעבר טרם סיום המפגש בפועל.`);
        return;
      }

      const existingData = sessionSnap.data() as SessionDocument;
      if (existingData.is_completed === false) {
        toast.error(`תלמיד ${normNum} טרם השלים את כל משימות החובה במפגש 2. לא ניתן לאשר מעבר.`);
        return;
      }

      // 2. Update real existing Firestore document strictly (no synthetic fallback documents)
      await updateDoc(sessionDocRef, {
        teacher_gate_approved: true,
        teacher_selected_path: path,
        gate_approved_at: now,
        gate_approved_by: user?.uid || 'teacher',
      });

      // 3. Write to Firebase RTDB for instantaneous reactive unlock
      const gatePayload = {
        routeStatus: 'APPROVED',
        teacher_gate_approved: true,
        teacher_selected_path: path,
        gate_approved_at: now,
        gate_approved_by: user?.uid || 'teacher',
      };
      await update(ref(database, `users/students/${normId}`), gatePayload);
      if (normId !== normNum) {
        await update(ref(database, `users/students/${normNum}`), gatePayload).catch(() => {});
      }

      // 4. Update local Zustand state
      approveRoute(normId);
      approveRoute(normNum);

      toast.success(`תלמיד ${normNum} אושר בהצלחה למפגש 3 (${path === 'green_path' ? 'מסלול ירוק' : 'מסלול צהוב'})! 🛡️`);
    } catch (err: any) {
      console.error('[TeacherDashboard] Gate approval write failed:', err);
      toast.error(`שגיאה באישור שער המעבר: ${err?.message || 'אנא בדוק חיבור לרשת'}`);
    } finally {
      setIsApprovingGate(false);
    }
  };

  const handleBatchApproveAll = async (pathMap: Record<string, PedagogicalPath>) => {
    setIsApprovingGate(true);
    try {
      for (const [sId, path] of Object.entries(pathMap)) {
        await handleApproveGateStudent(sId, path);
      }
      toast.success('כל התלמידים הממתינים אושרו בהצלחה למפגש 3! 🚀');
    } catch (err) {
      console.error('[TeacherDashboard] Batch gate approval error:', err);
      toast.error('שגיאה באישור הקבוצתי.');
    } finally {
      setIsApprovingGate(false);
    }
  };

  const handleTabChange = (
    tab:
      | "heatmap"
      | "clustering"
      | "alerts"
      | "diagnostic_reports"
      | "chat_admin"
      | "chat_students"
      | "class_management"
      | "approvals",
  ) => {
    setActiveTab(tab);
    setInputText("");
  };

  // For Admin Chat
  const adminMessages = useMemo(() => {
    if (!user) return [];
    return messages
      .filter(
        (m) =>
          (m.senderId === user.uid && m.receiverId === "admin") ||
          (m.senderId === "admin" && m.receiverId === user.uid),
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, user]);

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

  const processedMessages = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    
    // Process admin messages
    if (activeTab === "chat_admin" && user.role !== "admin") {
      const unreadAdmin = messages.filter(m => m.senderId === "admin" && m.receiverId === user.uid && !m.read && !processedMessages.current.has(m.id));
      if (unreadAdmin.length > 0) {
        unreadAdmin.forEach(m => processedMessages.current.add(m.id));
        markAsRead(user.uid as string, "admin");
      }
    }
    
    // Process student messages
    if (activeTab === "chat_students" && selectedStudentId && user.role !== "admin") {
      const targetId = normalizeStudentId(selectedStudentId);
      const unreadStudent = messages.filter(m => normalizeStudentId(m.senderId) === targetId && !m.read && !processedMessages.current.has(m.id));
      if (unreadStudent.length > 0) {
        unreadStudent.forEach(m => processedMessages.current.add(m.id));
        markAsRead(user.uid as string, targetId);
      }
    }
  }, [activeTab, selectedStudentId, messages, user, markAsRead]);

  const handleSendAdmin = () => {
    if (!inputText.trim() || !user) return;

    // Module 22: Tier 1 Client-Side Regex Validation (Fail-Closed Architecture)
    try {
      const validation = validateChatInputForPII(inputText);
      if (!validation.valid) {
        toast.warning(validation.errorHe || 'הודעה מכילה פרטים מזהים (PII). יש להשתמש במזהה 1-12 בלבד.');
        return;
      }

      // Module 22: Tier 2 Sanitization / Anonymization Service
      const cleanText = anonymizeChatMessageBody(inputText.trim());

      sendMessage(
        user.uid as string,
        (user.displayName as string) || "מורה",
        "admin",
        cleanText,
      );
      setInputText("");
    } catch (err) {
      console.error('[Module 3/22 Fail-Closed] PII scanning error caught:', err);
      toast.error('שגיאה בבדיקת אבטחה (PII). שליחת ההודעה נחסמה להגנה על פרטיות התלמידים.');
      return;
    }
  };

  const handleSendStudent = () => {
    if (!inputText.trim() || !user || !selectedStudentId) return;

    // Module 22: Tier 1 Client-Side Regex Validation (Fail-Closed Architecture)
    try {
      const validation = validateChatInputForPII(inputText);
      if (!validation.valid) {
        toast.warning(validation.errorHe || 'הודעה מכילה פרטים מזהים (PII). יש להשתמש במזהה 1-12 בלבד.');
        return;
      }

      const cleanText = anonymizeChatMessageBody(inputText.trim());
      const targetId = normalizeStudentId(selectedStudentId);

      sendMessage(
        user.uid as string,
        (user.displayName as string) || "מורה",
        targetId,
        cleanText,
      );
      setInputText("");
    } catch (err) {
      console.error('[Module 3/22 Fail-Closed] PII scanning error caught:', err);
      toast.error('שגיאה בבדיקת אבטחה (PII). שליחת ההודעה נחסמה להגנה על פרטיות התלמידים.');
      return;
    }
  };

  const unreadAdminCount = useMemo(() => {
    if (!user) return 0;
    const userUid = (user.uid || "").toLowerCase().trim();
    const userEmail = (user.email || "").toLowerCase().trim();
    return messages.filter((m) => {
      if (m.senderId !== "admin" || m.read) return false;
      const recv = (m.receiverId || "").toLowerCase().trim();
      return (
        recv === userUid ||
        recv === userEmail ||
        recv.includes(userUid) ||
        userUid.includes(recv) ||
        isTeacherOrAdminId(recv)
      );
    }).length;
  }, [messages, user]);

  const unreadStudentsCount = useMemo(() => {
    if (!user) return 0;
    return messages.filter((m) => {
      if (m.read) return false;
      return !isTeacherOrAdminId(m.senderId) || m.senderId.startsWith("student_");
    }).length;
  }, [messages, user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-600 font-medium">טוען נתוני תלמידים...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${hideSidebar ? 'w-full' : 'md:flex-row min-h-screen'} bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 overflow-x-hidden`}
      dir="rtl"
    >
      {/* Top Sub-Navigation Bar when embedded inside Admin view */}
      {hideSidebar && (
        <div className="bg-white text-slate-900 p-4 rounded-2xl mb-6 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-extrabold text-sm tracking-tight text-slate-900">תצוגת מורה אדמיניסטרטיבית</span>
          </div>

          <div className="flex flex-wrap gap-1.5 overflow-x-auto custom-scrollbar py-1">
            <button
              onClick={() => handleTabChange("heatmap")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "heatmap" ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              מפת חום ורדאר
            </button>
            <button
              onClick={() => handleTabChange("clustering")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "clustering" ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              מיפוי מיומנויות כיתתי
            </button>
            <button
              onClick={() => handleTabChange("diagnostic_reports")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "diagnostic_reports" ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              דו"חות אבחון אישיים
            </button>
            <button
              onClick={() => handleTabChange("approvals")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "approvals" ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              אישור תוכניות ושער מעבר
            </button>
            <button
              onClick={() => handleTabChange("chat_students")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === "chat_students" ? "bg-indigo-600 text-white shadow-md" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              <span>צ'אט תלמידים</span>
              {unreadStudentsCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-md animate-pulse">
                  {unreadStudentsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange("chat_admin")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === "chat_admin" ? "bg-indigo-600 text-white shadow-md" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              <span>צ'אט הנהלה</span>
              {unreadAdminCount > 0 && (
                <span className="bg-indigo-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-md animate-bounce">
                  {unreadAdminCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      {!hideSidebar && (
        <aside className="w-full md:w-64 lg:w-72 bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-l border-slate-200/80 dark:border-slate-800 flex flex-col shadow-md z-20 transition-all shrink-0 md:min-h-screen sticky top-0 md:h-screen overflow-y-auto custom-scrollbar">
        <div className="h-20 flex items-center gap-3 px-6 border-b border-ws-surface2 bg-white/40 dark:bg-slate-800/40 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-display font-black text-lg rotate-[-4deg] shrink-0 shadow-lg shadow-indigo-500/25">
            M
          </div>
          <Logo textClassName="font-display text-ws-ink" />
        </div>
        
        <div className="p-6 border-b border-ws-surface2">
          <h2 className="font-display font-black text-xl text-ws-ink tracking-tight mb-2">
            תחנת עבודה מורה
          </h2>
          
          <div className="mt-4">
            <button
              onClick={() => window.open('/projector', '_blank')}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 shadow-md font-bold text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
              <span>ארגז חול למקרן</span>
            </button>
          </div>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2">
          <div className="text-[10px] font-bold text-slate-400  mb-2 mt-2 px-2 uppercase tracking-widest">
            פדגוגיה ומעקב
          </div>
          <button
            id="tour-tab-heatmap"
            onClick={() => handleTabChange("heatmap")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 ${activeTab === "heatmap" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft "}`}
          >
            רדאר פדגוגי שקט (<span dir="ltr">Silent Radar</span>)
          </button>
          <button
            id="tour-tab-clustering"
            onClick={() => handleTabChange("clustering")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 ${activeTab === "clustering" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            מיפוי כיתתי (<span dir="ltr">Q-Matrix</span>)
          </button>
          <button
            id="tour-tab-reports"
            onClick={() => handleTabChange("diagnostic_reports")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 ${activeTab === "diagnostic_reports" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft "}`}
          >
            דו"חות אבחון אישיים
          </button>
          <button
            onClick={() => handleTabChange("approvals")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 ${activeTab === "approvals" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft "}`}
          >
            <span>אישור משימות <span dir="ltr">AI</span></span>
            {pendingRouteStudents.length > 0 && (
              <span className="bg-ws-accent text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                {pendingRouteStudents.length}
              </span>
            )}
          </button>

          <div className="text-[10px] font-bold text-slate-400  mb-2 mt-6 px-2 uppercase tracking-widest">
            תקשורת וצ'אט
          </div>
          <button
            id="tour-tab-chat"
            onClick={() => handleTabChange("chat_students")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 ${activeTab === "chat_students" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            <span>צ'אט עם תלמידים</span>
            {unreadStudentsCount > 0 && (
              <span className="bg-rose-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-rose-500/30 badge-alert animate-soft-heartbeat">
                {unreadStudentsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange("chat_admin")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 ${activeTab === "chat_admin" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            <span>צ'אט הנהלה</span>
            {unreadAdminCount > 0 && (
              <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-lg shadow-indigo-600/30 animate-bounce">
                {unreadAdminCount}
              </span>
            )}
          </button>
        </nav>
        
        <div className="p-4 border-t border-ws-surface2 bg-white/40 dark:bg-slate-800/40 mt-auto shrink-0">
          <LogoutButton className="w-full justify-start gap-3 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors rounded-xl px-4 py-3" />
        </div>
      </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 relative">
        {/* Subtle background glow effect */}
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent pointer-events-none -z-10"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-tl from-cyan-500/5 via-transparent to-transparent pointer-events-none -z-10 rounded-full blur-3xl"></div>

        {/* Class Session Control Bar */}
        {/* Class Session Control Bar — Bright, Clean & Accessible */}
        <div className="mb-6 bg-white text-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm ${isClassSessionActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {isClassSessionActive ? '🟢' : '🏫'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-slate-900">
                  {isClassSessionActive ? `מפגש ${selectedSessionNum} פעיל בכיתה` : 'ניהול מפגש בלייב'}
                </h3>
                {isClassSessionActive && (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    פתוח ללמידה
                  </span>
                )}
              </div>
              <p className="text-slate-600 text-xs mt-1">
                {isClassSessionActive
                  ? `מפגש ${selectedSessionNum} פתוח כעת עבור התלמידים בכיתה.`
                  : 'בחר מפגש ולחץ על "הפעל מפגש" כדי לפתוח את הלמידה לתלמידים.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            {isClassSessionActive ? (
              <button
                onClick={handleEndClassSession}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <span>⏹️</span>
                <span>סגור מפגש</span>
              </button>
            ) : (
              <>
                <select
                  value={selectedSessionNum}
                  onChange={(e) => setSelectedSessionNum(parseInt(e.target.value, 10))}
                  className="bg-white text-slate-800 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                    <option key={num} value={num}>
                      מפגש {num}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => handleStartClassSession(selectedSessionNum)}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <span>▶️</span>
                  <span>הפעל מפגש</span>
                </button>
              </>
            )}

            <button
              onClick={async () => {
                if (window.confirm("האם לאפס את כל נתוני השימוש במערכת (הודעות צ'אט, התראות וסטטוס תלמידים) למצב פתיחה נקי?")) {
                  await useStore.getState().resetEntireSystemUsageData();
                  toast.success("כל נתוני השימוש במערכת אופסו בהצלחה למצב פתיחה נקי!");
                }
              }}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 border border-slate-300/80 cursor-pointer shadow-sm"
              title="איפוס מלא של נתוני שימוש במערכת"
            >
              <span>🔄</span>
              <span>איפוס נתוני שימוש</span>
            </button>
          </div>
        </div>

        {activeTab === "heatmap" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-6">
              <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
                לוח בקרה כיתתי ומפת חום בזמן אמת
              </h1>
              <p className="text-ws-soft mt-2 text-lg">
                ניטור 12 תלמידים אנונימיים, רדאר פדגוגי שקט ומרחב למידה דיגיטלי.
              </p>
            </header>
            <HeatmapGrid
              onDrillDown={(studentId) => {
                const norm = normalizeStudentId(studentId);
                const student = allStudents.find(s => s.studentId === studentId || normalizeStudentId(s.studentId) === norm);
                if (student) setDrawerStudent(student);
              }}
            />
          </div>
        )}

        {activeTab === "clustering" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-700 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
                  קיבוץ תלמידים לפי מיומנויות ופערי למידה
                </h1>
                <p className="text-ws-soft mt-2 text-base md:text-lg">
                  אבחון וחלוקה אוטומטית של הכיתה ב-6 מיומנויות ליבה במתמטיקה למתן תרגול דיפרנציאלי ומותאם אישית.
                </p>
              </div>
            </header>

            {/* Interactive Concept Group Widgets */}
            <div className="mb-6">
              <ClusteringWidgets 
                students={allStudents} 
                activeFilter={activeClusterFilter} 
                onFilterChange={setActiveClusterFilter} 
              />
            </div>

            <AccessibleCard className="p-8 bg-ws-surface/80 backdrop-blur-xl mb-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-xl transition-all duration-300 border border-ws-surface2 rounded-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                <span className="w-1.5 h-6 bg-ws-accentSoft0 rounded-full"></span>
                התפלגות שליטה במיומנויות (כיתה שלמה)
              </h2>
              <div className="h-[350px] w-full relative z-10" dir="ltr">
                {qMatrixData.every(d => d.success === 0 && d.struggle === 0) ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="text-5xl mb-4 opacity-40 animate-pulse">📊</span>
                    <p className="font-bold text-lg text-slate-600 dark:text-slate-300">אין עדיין נתונים מהתלמידים</p>
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
                        name="מאבק / פער (%)"
                        stackId="a"
                        fill="#f43f5e"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </AccessibleCard>

            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 pb-6">
              <AccessibleCard className="flex flex-col justify-between p-6 bg-ws-surface/80 backdrop-blur-xl shadow-md hover:shadow-xl transition-all duration-300 border border-ws-surface2 rounded-2xl relative overflow-hidden group min-h-[340px]">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                <div>
                  <h3 className="text-xl font-bold mb-3 text-ws-ink">
                    הבנת המבנה העשרוני ושומר מקום
                  </h3>
                  <p className="text-ws-soft mb-4 text-sm leading-relaxed">
                    תלמידים שהתקשו בהבנת האפס כשומר מקום או זיהוי ערך המקום במערכת העשרונית.
                  </p>
                  <div className="rounded-xl overflow-y-auto max-h-[160px] border border-ws-surface2 shadow-inner">
                    <DataGrid
                      columns={[
                        { key: "name", header: "שם תלמיד" },
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
                <UdlButton
                  semanticColor="primary"
                  className="mt-4 w-full shadow-md shadow-blue-500/20 font-bold tracking-wide py-2.5"
                  onClick={() => handleAssignIntervention('מבנה עשרוני וערך המקום', decimalStructureGroup)}
                >
                  הקצאת תרגול מותאם
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="flex flex-col justify-between p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300 border border-slate-200 rounded-2xl relative overflow-hidden group min-h-[340px]">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-purple-500 to-indigo-500"></div>
                <div>
                  <h3 className="text-xl font-bold mb-3 text-slate-900">
                    גמישות בהמרה ופריטה
                  </h3>
                  <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                    תלמידים המקובעים לייצוג הקנוני ומתקשים לפרוט עשרות ליחידות.
                  </p>
                  <div className="rounded-xl overflow-y-auto max-h-[160px] border border-slate-200 shadow-inner">
                    <DataGrid
                      columns={[
                        { key: "name", header: "שם תלמיד" },
                        { key: "mastery", header: "רמת שליטה" },
                      ]}
                      data={regroupingFluencyGroup.map((s) => ({
                        id: s.studentId,
                        name: s.name,
                        mastery: s.conceptMastery ? `${Math.round(s.conceptMastery.regrouping_fluency * 100)}%` : "חסר מידע",
                      }))}
                    />
                  </div>
                </div>
                <UdlButton
                  semanticColor="primary"
                  className="mt-4 w-full shadow-md shadow-purple-500/20 font-bold tracking-wide py-2.5"
                  onClick={() => handleAssignIntervention('גמישות בהמרה ופריטה', regroupingFluencyGroup)}
                >
                  הקצאת סדנת חקר
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="flex flex-col justify-between p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300 border border-slate-200 rounded-2xl relative overflow-hidden group min-h-[340px]">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-rose-500 to-red-500"></div>
                <div>
                  <h3 className="text-xl font-bold mb-3 text-slate-900">
                    שליטה בפרוצדורות ובעובדות
                  </h3>
                  <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                    תלמידים שזקוקים לחיזוק האלגוריתם המסורתי בחיבור וחיסור.
                  </p>
                  <div className="rounded-xl overflow-y-auto max-h-[160px] border border-slate-200 shadow-inner">
                    <DataGrid
                      columns={[
                        { key: "name", header: "שם תלמיד" },
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
                <UdlButton
                  semanticColor="primary"
                  className="mt-4 w-full shadow-md shadow-rose-500/20 font-bold tracking-wide py-2.5"
                  onClick={() => handleAssignIntervention('שליטה בפרוצדורות ובעובדות', proceduralFluencyGroup)}
                >
                  הקצאת תרגול מותאם
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="flex flex-col justify-between p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300 border border-slate-200 rounded-2xl relative overflow-hidden group min-h-[340px]">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-slate-500 to-gray-500"></div>
                <div>
                  <h3 className="text-xl font-bold mb-3 text-slate-900">
                    חשיבה יחסית (Relational Thinking)
                  </h3>
                  <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                    תלמידים שמתקשים לגזור עובדה חדשה מתוך עובדה ידועה ללא חישוב מחדש.
                  </p>
                  <div className="rounded-xl overflow-y-auto max-h-[160px] border border-slate-200 shadow-inner">
                    <DataGrid
                      columns={[
                        { key: "name", header: "שם תלמיד" },
                        { key: "mastery", header: "רמת שליטה" },
                      ]}
                      data={relationalThinkingGroup.map((s) => ({
                        id: s.studentId,
                        name: s.name,
                        mastery: s.conceptMastery ? `${Math.round(s.conceptMastery.relational_thinking * 100)}%` : "חסר מידע",
                      }))}
                    />
                  </div>
                </div>
                <UdlButton
                  semanticColor="primary"
                  className="mt-4 w-full shadow-md shadow-slate-500/20 font-bold tracking-wide py-2.5"
                  onClick={() => handleAssignIntervention('חשיבה יחסית', relationalThinkingGroup)}
                >
                  הקצה חקר יחסים
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="flex flex-col justify-between p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300 border border-slate-200 rounded-2xl relative overflow-hidden group min-h-[340px]">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-500 to-orange-500"></div>
                <div>
                  <h3 className="text-xl font-bold mb-3 text-slate-900">
                    חשיבה אלגברית ומציאת נעלם
                  </h3>
                  <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                    תלמידים המתקשים להבין את סימן השוויון כמאזניים ואת הדינמיקה של משוואה.
                  </p>
                  <div className="rounded-xl overflow-y-auto max-h-[160px] border border-slate-200 shadow-inner">
                    <DataGrid
                      columns={[
                        { key: "name", header: "שם תלמיד" },
                        { key: "mastery", header: "רמת שליטה" },
                      ]}
                      data={algebraicReasoningGroup.map((s) => ({
                        id: s.studentId,
                        name: s.name,
                        mastery: s.conceptMastery ? `${Math.round(s.conceptMastery.algebraic_reasoning * 100)}%` : "חסר מידע",
                      }))}
                    />
                  </div>
                </div>
                <UdlButton
                  semanticColor="primary"
                  className="mt-4 w-full shadow-md shadow-amber-500/20 font-bold tracking-wide py-2.5"
                  onClick={() => handleAssignIntervention('חשיבה אלגברית ומציאת נעלם', algebraicReasoningGroup)}
                >
                  הקצאת מודל מאזניים
                </UdlButton>
              </AccessibleCard>
            </div>
          </div>
        )}


        {activeTab === "class_management" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ClassManagement
              allStudents={allStudents}
              onDrillDown={(studentId) => {
                const norm = normalizeStudentId(studentId);
                const student = allStudents.find(s => s.studentId === studentId || normalizeStudentId(s.studentId) === norm);
                if (student) setDrawerStudent(student);
              }}
            />
          </div>
        )}

        {activeTab === "diagnostic_reports" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-10">
              <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
                דו"חות אבחון אישיים
              </h1>
              <p className="text-ws-soft mt-3 text-lg">
                תצוגה חכמה המשולבת שחזור מהלכים, נתוני רדאר, פירוט מיומנויות ותוכנית עבודה מותאמת אישית.
              </p>
            </header>

            {(() => {
              const effectiveReplayStudentId = selectedReplayStudentId || (allStudents.length > 0 ? allStudents[0].studentId : 'student_user1');
              const s = students[effectiveReplayStudentId] || allStudents.find(st => st.studentId === effectiveReplayStudentId || normalizeStudentId(st.studentId) === normalizeStudentId(effectiveReplayStudentId)) || allStudents[0];

              const qMatrix = s?.qMatrixResults || {};
              const traceData = s?.traceData || { hesitation_events: 0, undo_clicks: 0, semantic_trace: [] };

              const getQStatus = (val: any) => {
                if (val === undefined || val === null) return { text: 'טרם נבדק', color: 'text-slate-400' };
                if (val === 'success' || val === true) return { text: 'שולט', color: 'text-green-600' };
                return { text: 'דרוש חיזוק', color: 'text-red-500' };
              };

              return (
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Sidebar: Student List */}
                  <AccessibleCard className="w-full lg:w-64 shrink-0 p-4 bg-ws-surface/80 backdrop-blur-xl border border-ws-surface2 shadow-sm rounded-2xl h-fit max-h-[80vh] overflow-y-auto">
                    <h3 className="font-bold text-ws-ink mb-4 px-2 flex items-center justify-between">
                      <span>תלמידי הכיתה</span>
                      <span className="text-xs bg-ws-surface2 text-ws-soft px-2 py-0.5 rounded-full font-mono">
                        {allStudents.length}
                      </span>
                    </h3>
                    <div className="space-y-1">
                      {allStudents.map(studentItem => {
                        const sNumItem = studentItem.studentId.replace(/\D/g, '') || studentItem.studentId;
                        const isSelected = effectiveReplayStudentId === studentItem.studentId || 
                                           normalizeStudentId(effectiveReplayStudentId) === normalizeStudentId(studentItem.studentId);
                        
                        return (
                          <button
                            key={studentItem.studentId}
                            onClick={() => {
                              setSelectedReplayStudentId(studentItem.studentId);
                              setSelectedStudentId(studentItem.studentId);
                            }}
                            className={`w-full flex items-center justify-between p-3 rounded-xl text-sm font-bold transition-all text-right cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                : 'text-ws-ink hover:bg-ws-bg/80'
                            }`}
                          >
                            <span>תלמיד {sNumItem}</span>
                            <span className={`w-2 h-2 rounded-full ${studentItem.isOnline ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                          </button>
                        );
                      })}
                    </div>
                  </AccessibleCard>

                  {/* Main Profile Area */}
                  <div className="flex-1 flex flex-col gap-6">
                    {!s ? (
                      <div className="p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4 text-slate-400">
                          <Users className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-ws-ink mb-2">בחר תלמיד להצגת דו"ח האבחון</h3>
                      </div>
                    ) : (
                      (() => {
                        const socraticApproval = s.diagnosticReport || pendingApprovals.find(a => a.studentId === effectiveReplayStudentId || normalizeStudentId(a.studentId) === normalizeStudentId(effectiveReplayStudentId));
                        const hasCompletedDiagnosticM2 = Boolean(
                          s.completedMeeting2 || 
                          (typeof s.highestCompletedMeeting === 'number' && s.highestCompletedMeeting >= 2) ||
                          socraticApproval
                        );
                        const isStruggling = (traceData.hesitation_events || 0) > 2 || (traceData.undo_clicks || 0) > 1 || s.routeRecommendation === 'YELLOW';
                        const sNum = (s.studentId || effectiveReplayStudentId).replace(/\D/g, '') || s.studentId;

                        const clinicalText = (socraticApproval as any)?.clinicalDiagnosisHe || (s.diagnosticReport as any)?.clinicalDiagnosisHe || "";
                        const actionPlanText = (socraticApproval as any)?.actionPlanHe || (s.diagnosticReport as any)?.actionPlanHe || "";
                        const displayTasks = (socraticApproval as any)?.tasks || (s.diagnosticReport as any)?.tasks || [];

                        const q1 = getQStatus(qMatrix.task1_zero_placeholder);
                        const q3 = getQStatus(qMatrix.task3_flexible_regrouping);
                        const q4 = getQStatus(qMatrix.task4_basic_addition_fluency);
                        const q6 = getQStatus(qMatrix.task6_subtraction_regrouping);
                        const q7 = getQStatus(qMatrix.task7_missing_subtrahend);
                        const q8 = getQStatus(qMatrix.task8_missing_addend);

                        const q46Status = (!qMatrix.task4_basic_addition_fluency && !qMatrix.task6_subtraction_regrouping)
                          ? { text: 'טרם נבדק', color: 'text-slate-400' }
                          : (qMatrix.task4_basic_addition_fluency === 'success' && qMatrix.task6_subtraction_regrouping === 'success')
                          ? { text: 'שולט', color: 'text-green-600' }
                          : { text: 'פער בעובדות יסוד', color: 'text-red-500' };

                        return (
                          <div className="animate-in fade-in zoom-in-95 duration-300">
                            {/* Top Action Bar: Open Drawer for Physical Override & Full Student Profile */}
                            <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                              <div className="flex items-center gap-3">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                  תלמיד {sNum}
                                </h3>
                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
                                  s.isOnline
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                                }`}>
                                  <span className={`w-2 h-2 rounded-full ${s.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                  {s.isOnline ? 'מחובר כעת' : 'לא מחובר'}
                                </span>
                                {s.physicalOverride && (
                                  <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-xs font-bold px-2.5 py-1 rounded-full border border-purple-200 dark:border-purple-800">
                                    עקיפה פיזית פעילה
                                  </span>
                                )}
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                                  !hasCompletedDiagnosticM2
                                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                                    : isStruggling
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                  {!hasCompletedDiagnosticM2
                                    ? 'מפגש 1 הושלם — ממתין לאבחון במפגש 2'
                                    : isStruggling
                                    ? 'מסלול מומלץ: צמצום פערי קדם (צהוב)'
                                    : 'מסלול מומלץ: ירוק (מואץ)'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2.5 flex-wrap">
                                {/* Button 1: Learning conditions adjustment (Available across all sessions 1-8) */}
                                <button
                                  onClick={() => setDrawerStudent(s)}
                                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/70 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm transition-all active:scale-95 cursor-pointer"
                                  title="התאמת רמת פיגום, עזרים ושקט חזותי"
                                >
                                  <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                  <span>התאמת תנאי למידה</span>
                                </button>

                                {/* Button 2: Teacher Gate Approval (Available ONLY when completing Session 2 / at Gate) */}
                                {hasCompletedDiagnosticM2 && (
                                  <button
                                    onClick={() => setGateStudent(s)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 transition-all active:scale-95 cursor-pointer"
                                    title="אישור מסלול ותוכנית תרגילים למפגש 3"
                                  >
                                    <Sparkles className="w-4 h-4 text-amber-300" />
                                    <span>אישור תוכנית ומסלול — שער מורה</span>
                                    <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-md font-semibold">ממתין לאישור</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Video Replay & Logs Summary Banner */}
                            <div className="mb-6">
                              <StudentReplayAndLogs studentId={effectiveReplayStudentId} />
                            </div>

                            {/* Main Content Row: Q-Matrix & Traces */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                              {/* Q-Matrix Report */}
                              <AccessibleCard className="p-6 bg-white border border-ws-surface2 shadow-md rounded-2xl h-full">
                                <h3 className="text-xl font-bold text-ws-ink mb-4 flex items-center gap-2">
                                  <span className="text-ws-accent">📊</span>
                                  תוצאות ה-Q-Matrix (אבחון סמוי)
                                </h3>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                    <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">שומר מקום (אפס)</span>
                                    <span className={`font-semibold ${q1.color}`}>
                                      {q1.text}
                                    </span>
                                  </div>
                                  <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                    <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">גמישות מחשבתית</span>
                                    <span className={`font-semibold ${q3.color}`}>
                                      {q3.text}
                                    </span>
                                  </div>

                                  <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                    <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">חיבור וחיסור</span>
                                    <span className={`font-semibold ${q46Status.color}`}>
                                      {q46Status.text}
                                    </span>
                                  </div>
                                  <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                    <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">מציאת מחסר</span>
                                    <span className={`font-semibold ${q7.color}`}>
                                      {q7.text}
                                    </span>
                                  </div>
                                  <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                    <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">מציאת מחבר</span>
                                    <span className={`font-semibold ${q8.color}`}>
                                      {q8.text}
                                    </span>
                                  </div>
                                </div>
                              </AccessibleCard>

                              {/* Trace Data & AI Plan */}
                              <AccessibleCard className="p-6 border shadow-md rounded-2xl flex flex-col h-full bg-indigo-50/40 border-indigo-100">
                                <h3 className="text-xl font-bold text-ws-ink mb-4 flex items-center gap-2">
                                  <span className="text-ws-accent">🤖</span>
                                  המלצת Socratic Engine וסיכום אבחון
                                </h3>
                                
                                <div className="flex-1 flex flex-col gap-4">
                                  {/* Trace Logs Summary */}
                                  <div className="flex gap-4">
                                    <div className="flex-1 flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-sm">⏱️</div>
                                        <span className="font-semibold text-sm">אירועי היסוס (חשיבה ארוכה)</span>
                                      </div>
                                      <span className="text-xl font-black text-orange-600">{traceData.hesitation_events || 0}</span>
                                    </div>
                                    <div className="flex-1 flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-sm">↩️</div>
                                        <span className="font-semibold text-sm">ביטולי פעולה (מחיקה/חזרה)</span>
                                      </div>
                                      <span className="text-xl font-black text-red-600">{traceData.undo_clicks || 0}</span>
                                    </div>
                                  </div>

                                  {/* Quantitative KPIs */}
                                  {(() => {
                                    const kpis = getStudentKPIs(s, messages);
                                    return (
                                      <div className="bg-white p-4 rounded-xl border border-slate-200">
                                        <h4 className="font-bold text-sm text-slate-800 mb-3">מדדי ביצוע כמותיים (KPIs):</h4>
                                        <div className="grid grid-cols-3 gap-3 text-xs">
                                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 shadow-sm">
                                            <div className="flex justify-between font-bold mb-1">
                                              <span>התמדה:</span>
                                              <span className="text-blue-600">{kpis.persistence}%</span>
                                            </div>
                                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                              <div className="bg-blue-500 h-full rounded-full" style={{ width: `${kpis.persistence}%` }}></div>
                                            </div>
                                          </div>
                                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 shadow-sm">
                                            <div className="flex justify-between font-bold mb-1">
                                              <span>יעילות:</span>
                                              <span className="text-emerald-600">{kpis.efficiency}%</span>
                                            </div>
                                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${kpis.efficiency}%` }}></div>
                                            </div>
                                          </div>

                                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 shadow-sm">
                                            <div className="flex justify-between font-bold mb-1">
                                              <span>איכות דיאלוג:</span>
                                              <span className="text-purple-600">{kpis.dialogueQuality}%</span>
                                            </div>
                                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                              <div className="bg-purple-500 h-full rounded-full" style={{ width: `${kpis.dialogueQuality}%` }}></div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Clinical Diagnosis & Action Plan - Only rendered when real diagnostic exists */}
                                  {!hasCompletedDiagnosticM2 ? (
                                    <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm">
                                      <h4 className="font-bold text-indigo-900 mb-2 text-base flex items-center gap-2">
                                        <span className="text-indigo-600">ℹ️</span>
                                        סטטוס מיפוי פדגוגי
                                      </h4>
                                      <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100 text-indigo-950 text-xs leading-relaxed">
                                        <p className="font-bold mb-1">מפגש 1 (ארגז החול והיכרות) הושלם בהצלחה.</p>
                                        <p className="text-indigo-800">
                                          האבחון הפדגוגי הסמוי (Q-Matrix) והמלצת המסלול (ירוק/צהוב) ייבנו באופן אותנטי על בסיס ביצועי התלמיד במפגש 2.
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm">
                                      <h4 className="font-bold text-indigo-900 mb-3 text-lg flex items-center gap-2">
                                        <span className="text-indigo-600">🎯</span>
                                        המלצות ומסלול אדפטיבי למפגש 3 ואילך:
                                      </h4>
                                      {clinicalText && (
                                        <p className="text-sm text-indigo-800 leading-relaxed mb-4 bg-indigo-50/50 p-3.5 rounded-lg border border-indigo-100">
                                          <strong className="block mb-1 text-indigo-950 font-bold">אבחון קליני:</strong>
                                          {clinicalText}
                                        </p>
                                      )}
                                      {actionPlanText && (
                                        <p className="text-sm text-indigo-800 leading-relaxed mb-4 bg-indigo-50/50 p-3.5 rounded-lg border border-indigo-100">
                                          <strong className="block mb-1 text-indigo-950 font-bold">תוכנית פעולה מוצעת:</strong>
                                          {actionPlanText}
                                        </p>
                                      )}
                                      
                                      {displayTasks && displayTasks.length > 0 && (
                                        <>
                                          <h5 className="font-bold text-sm text-indigo-900 mb-3">תרגילים מותאמים אישית שהוכנו עבור התלמיד:</h5>
                                          <div className="grid gap-2 mb-5">
                                            {displayTasks.map((task: any, idx: number) => (
                                              <div key={idx} className="bg-slate-50 p-3 rounded-lg flex items-center justify-between border border-slate-200 shadow-sm">
                                                <div className="flex items-center gap-3">
                                                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                                                  <span className="font-semibold text-sm text-indigo-950">{task.titleHe}</span>
                                                </div>
                                                <div className="text-sm font-bold text-indigo-700 bg-white border border-indigo-100 px-3 py-1 rounded-md" dir="ltr">
                                                  {task.numberA} {task.isSubtraction ? '-' : '+'} {task.numberB} = ?
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </>
                                      )}

                                      <div className="flex gap-3">
                                        <UdlButton 
                                          size="sm" 
                                          semanticColor="primary"
                                          className="flex-1 font-bold shadow-md shadow-indigo-500/20 cursor-pointer"
                                          onClick={() => {
                                          handleTabChange("approvals");
                                        }}
                                      >
                                        מעבר למסך אישורים ראשי
                                      </UdlButton>
                                      <button
                                        onClick={() => setGateStudent(s)}
                                        className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer flex items-center gap-1.5"
                                      >
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        <span>אישור שער ועריכת תרגילים</span>
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
              );
            })()}
          </div>
        )}

        {activeTab === "approvals" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-8">
            {/* Module 20: Canonical Zero-PII Teacher Approval Gate (WP6 Firestore & RTDB Sync) */}
            <TeacherApprovalGate
              students={gateStudentItems}
              onApproveStudent={handleApproveGateStudent}
              onApproveAll={handleBatchApproveAll}
              isLoading={isApprovingGate}
            />

            <div className="flex flex-col gap-6">
              {pendingRouteStudents.length === 0 ? (
                <div className="text-center py-20 text-ws-soft bg-ws-surface/50 backdrop-blur-md rounded-2xl border-2 border-dashed border-ws-surface2 shadow-sm">
                  <div className="w-16 h-16 mx-auto mb-4 bg-ws-bg rounded-full flex items-center justify-center">
                    <ShieldAlert className="w-8 h-8 text-ws-soft" />
                  </div>
                  <p className="text-xl font-bold">אין תלמידים הממתינים לאישור מסלול.</p>
                </div>
              ) : (
                pendingRouteStudents.map(student => (
                  <AccessibleCard key={student.studentId} className="p-8 bg-ws-surface border border-ws-surface2 shadow-lg rounded-3xl">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-ws-ink">תלמיד {student.studentId.replace(/\D/g, '') || student.studentId}</h3>
                        <p className="text-sm text-ws-soft mt-1">מזהה: {student.studentId} | סיום מפגש 2</p>
                      </div>
                      <div className="flex gap-3">
                        <UdlButton 
                          semanticColor="primary" 
                          size="sm" 
                          className="font-bold shadow-md shadow-ws-accent/20"
                          onClick={async () => {
                            const prevRouteStatus = student.routeStatus;
                            approveRoute(student.studentId);
                            
                            // Realtime signal for student's waiting screen
                            const normId = normalizeStudentId(student.studentId);
                            await update(ref(database, `users/students/${normId}`), {
                              teacher_gate_approved: true,
                              routeStatus: 'APPROVED',
                              teacher_approved_at: Date.now(),
                              teacher_approved_by: user?.uid || 'teacher'
                            }).catch(console.error);

                            const allPending = [...teacherApprovals, ...fallbackApprovals];
                            const approval = allPending.find((a) => a.studentId === student.studentId);
                            if (approval) {
                              try {
                                const isFallback = fallbackApprovals.some(a => a.id === approval.id);
                                const targetTeacherId = isFallback ? "teacher-1" : TEACHER_ID;
                                await SocraticEngine.approveTasks(targetTeacherId, approval.id, approval.studentId, approval.tasks);
                              } catch (err) {
                                console.error('Firebase task approval failed:', err);
                                // Optimistic rollback
                                useStore.setState((state) => {
                                  const s = state.students[student.studentId];
                                  if (!s) return state;
                                  return {
                                    students: {
                                      ...state.students,
                                      [student.studentId]: {
                                        ...s,
                                        routeStatus: prevRouteStatus || 'PENDING_TEACHER_APPROVAL'
                                      }
                                    }
                                  };
                                });
                                toast.error('שגיאה באישור המשימות ב-Firebase. הפעולה בוטלה.');
                              }
                            }
                          }}
                        >
                          {(() => {
                            const allPending = [...teacherApprovals, ...fallbackApprovals];
                            const approval = allPending.find((a) => a.studentId === student.studentId) as any;
                            return `אישור ופתיחת שיעור ${approval?.targetSession || '3'}`;
                          })()}
                        </UdlButton>
                        <UdlButton 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            const allPending = [...teacherApprovals, ...fallbackApprovals];
                            const approval = allPending.find((a) => a.studentId === student.studentId);
                            if (approval) {
                              setEditingApproval(approval);
                              setEditedTasks([...approval.tasks]);
                              setCoPilotChat([
                                { role: 'ai', text: `שלום! אני סוכן ה-AI. התוכנית למפגש ${approval.targetSession || '3'} עבור תלמיד ${student.studentId.replace(/\D/g, '') || student.studentId} מוכנה. תוכל לערוך אותה כאן, או לבקש ממני לשנות משהו.` }
                              ]);
                            }
                          }}
                        >
                          דחייה / עריכה
                        </UdlButton>
                      </div>
                    </div>
                    
                    <div className="bg-ws-accentSoft/30 p-5 rounded-2xl border border-ws-accent/10 mb-6">
                      <h4 className="font-bold text-ws-accent mb-2 flex items-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        המלצת נתב הלמידה (Curriculum Router):
                      </h4>
                      <p className="text-ws-ink font-medium leading-relaxed">
                        מערכת הניתוב ממליצה על שיבוץ התלמיד ל<strong>{student.routeRecommendation === 'YELLOW' ? 'מסלול צהוב (מבוסס תמיכה)' : 'מסלול ירוק (אתגר מתקדם)'}</strong>.<br/>
                        {student.routeRecommendation === 'YELLOW' 
                          ? 'המלצה זו מבוססת על זיהוי פערי ליבה (כגון חוסר שליטה בעובדות יסוד או היסוסים מרובים) במהלך מפגש האבחון. התלמיד יקבל פיגומים (Scaffolding) מותאמים במפגש 3.' 
                          : 'התלמיד הפגין שליטה טובה במיומנויות הבסיס וללא סימני מאבק קוגניטיבי מהותיים. מפגש 3 יאתגר אותו בבעיות מתקדמות ללא פיגומים מיותרים.'}
                      </p>
                    </div>

                    {/* Quantitative KPIs */}
                    {(() => {
                      const kpis = getStudentKPIs(student, messages);
                      return (
                        <div className="mb-6 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
                          <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <span>📈</span>
                            מדדי ביצוע כמותיים (KPIs):
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                              <span className="text-xs text-ws-soft block mb-1">מדד התמדה (Persistence)</span>
                              <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{kpis.hasData ? `${kpis.persistence}%` : 'טרם החל'}</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${kpis.hasData ? kpis.persistence : 0}%` }}></div>
                              </div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                              <span className="text-xs text-ws-soft block mb-1">יעילות (Efficiency)</span>
                              <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{kpis.hasData ? `${kpis.efficiency}%` : 'טרם החל'}</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${kpis.hasData ? kpis.efficiency : 0}%` }}></div>
                              </div>
                            </div>

                            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                              <span className="text-xs text-ws-soft block mb-1">איכות דיאלוג (Dialogue)</span>
                              <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{kpis.hasData ? `${kpis.dialogueQuality}%` : 'טרם החל'}</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                                <div className="bg-purple-500 h-full rounded-full" style={{ width: `${kpis.hasData ? kpis.dialogueQuality : 0}%` }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* AI Socratic Engine Diagnosis: Macro and Micro */}
                    {(() => {
                      const approval = pendingApprovals.find(a => a.studentId === student.studentId) as any;
                      // Support both legacy (clinicalDiagnosisHe) and new (macroBlueprintHe)
                      if (!approval || (!approval.macroBlueprintHe && !approval.clinicalDiagnosisHe)) return null;
                      
                      const macroText = approval.macroBlueprintHe || approval.clinicalDiagnosisHe;
                      const microText = approval.microBlueprintHe || approval.actionPlanHe;

                      return (
                        <div className="flex flex-col gap-3 mb-5">
                          {/* MACRO VIEW */}
                          <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-5">
                            <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2 text-sm">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                              תחזית מאקרו (מעוף הציפור למפגשים 3-7):
                            </h4>
                            <p className="text-blue-900 text-sm leading-relaxed">{macroText}</p>
                          </div>
                          
                          {/* MICRO VIEW */}
                          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-5">
                            <h4 className="font-bold text-emerald-900 mb-2 flex items-center gap-2 text-sm">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                              תוכנית מיקרו (עבודת נמלה לשיעור הקרוב):
                            </h4>
                            <p className="text-emerald-900 text-sm leading-relaxed">{microText}</p>
                          </div>
                          
                          {/* VIDEO BOOKMARKS PLACEHOLDER */}
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                            <div className="bg-slate-200 p-2 rounded-full">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                            </div>
                            <div className="text-sm">
                              <strong className="text-slate-700 block">סימניות וידאו (Semantic Bookmarks)</strong>
                              <span className="text-slate-500">ה-AI סימן אירועי היסוס קריטיים במפגש הקודם (זמינים בלשונית ה-Replays לבחינה).</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <h4 className="font-bold text-lg mb-3">מדדי אבחון קריטיים (Q-Matrix):</h4>
                    <div className="grid gap-3">
                        <div className="bg-ws-bg p-4 rounded-xl flex items-center justify-between border border-ws-surface2">
                          <div>
                            <span className="font-semibold">מאבק קוגניטיבי סמוי</span>
                          </div>
                          <div className="text-sm font-bold text-ws-soft">
                            {student.traceData?.hesitation_events || 0} היסוסים, {student.traceData?.undo_clicks || 0} חזרות
                          </div>
                        </div>
                        <div className="bg-ws-bg p-4 rounded-xl flex items-center justify-between border border-ws-surface2">
                          <div>
                            <span className="font-semibold">בסיס עשרוני וחיבור</span>
                          </div>
                          <div className={`text-sm font-bold ${(student.qMatrixResults?.task4_basic_addition_fluency && student.qMatrixResults.task4_basic_addition_fluency !== 'success') ? 'text-red-500' : 'text-green-500'}`}>
                            {(student.qMatrixResults?.task4_basic_addition_fluency && student.qMatrixResults.task4_basic_addition_fluency !== 'success') ? 'נכשל' : 'תקין'}
                          </div>
                        </div>
                    </div>
                  </AccessibleCard>
                ))
              )}
            </div>
          </div>
        )}

        {/* ADMIN CHAT */}
        {activeTab === "chat_admin" && (
          <div className="h-[calc(100vh-110px)] max-h-[calc(100vh-110px)] flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-in fade-in duration-300">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                    הנהלה ותמיכה טכנית
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      זמין כעת לפניות ותמיכה
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Messages View */}
            <div className="flex-1 min-h-0 p-5 overflow-y-auto flex flex-col gap-4 bg-slate-50/50 dark:bg-slate-950/50">
              {adminMessages.length === 0 ? (
                <div className="m-auto text-center flex flex-col items-center justify-center text-slate-400 max-w-sm">
                  <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center mb-3 text-indigo-500">
                    <MessageCircle className="w-8 h-8 opacity-40" />
                  </div>
                  <h4 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-1">אין הודעות קודמות</h4>
                  <p className="text-xs text-slate-500">תוכל להקליד פנייה חדשה או לשלוח צילום מסך למנהל המערכת.</p>
                </div>
              ) : (
                adminMessages.map((msg) => {
                  const isMe = msg.senderId === user?.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                    >
                      <div
                        className={`px-4 py-2.5 rounded-2xl shadow-md ${
                          isMe
                            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tl-xs"
                            : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-tr-xs"
                        }`}
                      >
                        {msg.text && <p className="leading-relaxed text-sm">{msg.text}</p>}
                      </div>
                      <div className="text-[10px] font-medium text-slate-400 mt-1 px-2 flex items-center gap-1">
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isMe && (
                          msg.read ? (
                            <span title="נקרא על ידי הנהלה"><CheckCheck className="w-3.5 h-3.5 text-emerald-500" /></span>
                          ) : (
                            <span title="נשלח בהצלחה"><Check className="w-3.5 h-3.5 text-slate-400" /></span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Footer - ALWAYS VISIBLE AT BOTTOM (shrink-0) */}
            <div className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2.5 shrink-0 z-20">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendAdmin()}
                placeholder="הקלד הודעה למנהל המערכת..."
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900 dark:text-white"
              />

              <button
                onClick={handleSendAdmin}
                disabled={!inputText.trim()}
                className="rounded-full w-10 h-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white transition-all disabled:opacity-40 shadow-md shrink-0"
              >
                <Send className="w-4 h-4 -mr-0.5" />
              </button>
            </div>
          </div>
        )}

        {/* STUDENTS CHAT */}
        {activeTab === "chat_students" && (
          <div className="h-[calc(100vh-110px)] max-h-[calc(100vh-110px)] flex flex-col md:flex-row bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-in fade-in duration-300">
            {/* Student List Sidebar */}
            <div
              className={`${selectedStudentId ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-l border-slate-200 dark:border-slate-800 flex-col h-full bg-slate-50/50 dark:bg-slate-900/50 shrink-0`}
            >
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                    שיחות עם תלמידים
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-200/50 dark:border-indigo-800/40">
                    {filteredChatStudents.length} תלמידים
                  </span>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="text"
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    placeholder="חפש תלמיד לפי שם..."
                    className="w-full pl-3 pr-9 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {filteredChatStudents.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 py-8">לא נמצאו תלמידים מתאימים.</div>
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
                            ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20" 
                            : "hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm shrink-0 relative ${
                              isSelected ? "bg-white/20 text-white" : "bg-gradient-to-tr from-indigo-500 to-purple-600"
                            }`}
                          >
                            {(student.studentId.replace(/\D/g, '') || '1')}
                            {student.traceData?.hesitation_events > 0 && (
                              <div
                                className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 shadow-md"
                                title="מאבק קוגניטיבי"
                              >
                                <ShieldAlert className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col text-right overflow-hidden">
                            <span className={`font-bold text-sm truncate ${isSelected ? "text-white" : "text-slate-900 dark:text-white"}`}>
                              תלמיד {student.studentId.replace(/\D/g, '') || student.studentId}
                            </span>
                            <span className={`text-xs truncate ${isSelected ? "text-indigo-100" : "text-slate-400"}`}>
                              {lastStudentMsg ? (lastStudentMsg.text || '📷 תמונה מצורפת') : 'לחץ לפתיחת שיחה'}
                            </span>
                          </div>
                        </div>
                        {unreadCount > 0 && (
                          <span className="bg-rose-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-md shrink-0 animate-bounce">
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
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-md text-base shrink-0">
                        {
                          (filteredChatStudents.find((s) => s.studentId === selectedStudentId)?.name || selectedStudentId || 'U')[0]
                        }
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">
                          {
                            filteredChatStudents.find((s) => s.studentId === selectedStudentId)?.name || selectedStudentId
                          }
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            תלמיד פעיל
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messages Scroll Area */}
                  <div className="flex-1 min-h-0 p-5 overflow-y-auto flex flex-col gap-4">
                    {studentMessages.length === 0 ? (
                      <div className="m-auto text-center flex flex-col items-center justify-center text-slate-400 max-w-sm">
                        <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center mb-3 text-indigo-500">
                          <MessageCircle className="w-8 h-8 opacity-40" />
                        </div>
                        <h4 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-1">אין הודעות קודמות</h4>
                        <p className="text-xs text-slate-500">הקלד הודעה או שלח רמז פדגוגי לתלמיד.</p>
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
                                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tl-xs"
                                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-tr-xs"
                              }`}
                            >
                              {msg.text && <p className="leading-relaxed text-sm">{msg.text}</p>}
                            </div>
                            <div className="text-[10px] font-medium text-slate-400 mt-1 px-2 flex items-center gap-1">
                              <span>
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {isMe && (
                                msg.read ? (
                                  <span title="נקרא על ידי התלמיד"><CheckCheck className="w-3.5 h-3.5 text-emerald-500" /></span>
                                ) : (
                                  <span title="נשלח בהצלחה"><Check className="w-3.5 h-3.5 text-slate-400" /></span>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Input Footer - ALWAYS VISIBLE AT BOTTOM (shrink-0) */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2.5 shrink-0 z-20">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendStudent()}
                      placeholder="הקלד הודעה לתלמיד..."
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900 dark:text-white"
                    />

                    <button
                      onClick={handleSendStudent}
                      disabled={!inputText.trim()}
                      className="rounded-full w-10 h-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white transition-all disabled:opacity-40 shadow-md shrink-0"
                    >
                      <Send className="w-4 h-4 -mr-0.5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-950/50">
                  <div className="w-20 h-20 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-900/50">
                    <MessageCircle className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                    שיחות פדגוגיות עם תלמידים
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
                    בחר תלמיד מהרשימה מימין כדי להציג את היסטוריית השיחה ולהעביר הנחיות או רמזים פדגוגיים בזמן אמת.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {/* AI Co-Pilot Modal */}
        {editingApproval && editedTasks && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-slate-200" dir="rtl">
              
              <div className="flex-none bg-gradient-to-l from-indigo-900 to-indigo-700 text-white p-5 flex justify-between items-center shadow-md z-10">
                <div>
                  <h2 className="text-2xl font-black flex items-center gap-2">
                    <MessageCircle className="w-6 h-6 text-indigo-300" />
                    Teacher-AI Co-Pilot
                  </h2>
                  <p className="text-indigo-200 text-sm mt-1">
                    עריכת התוכנית למפגש הבא עבור {editingApproval.studentName}
                  </p>
                </div>
                <button 
                  onClick={() => { setEditingApproval(null); setEditedTasks(null); }}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  ✖
                </button>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Right side: Blueprint Editor (Tasks) */}
                <div className="flex-1 bg-slate-50 border-l border-slate-200 overflow-y-auto p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-slate-800">עורך תוכנית הלמידה (Blueprint)</h3>
                    <UdlButton 
                      size="sm"
                      onClick={() => {
                        const newTask = {
                          id: `custom_${Date.now()}`,
                          type: 'vertical_addition',
                          titleHe: 'תרגיל מותאם אישית',
                          instructionHe: 'פתרו את התרגיל:',
                          numberA: 1000,
                          numberB: 1000,
                          correctAnswer: 2000
                        };
                        setEditedTasks([...editedTasks, newTask]);
                      }}
                    >
                      + הוסף תרגיל
                    </UdlButton>
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    {editedTasks.map((task, idx) => (
                      <div key={task.id || idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">שלב {idx + 1}: {task.type}</span>
                          <button 
                            onClick={() => {
                              const newTasks = [...editedTasks];
                              newTasks.splice(idx, 1);
                              setEditedTasks(newTasks);
                            }}
                            className="text-red-500 hover:text-red-700 text-sm font-bold"
                          >
                            מחק
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">כותרת המשימה</label>
                            <input 
                              type="text" 
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                              value={task.titleHe || ''}
                              onChange={(e) => {
                                const newTasks = [...editedTasks];
                                newTasks[idx].titleHe = e.target.value;
                                setEditedTasks(newTasks);
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">הוראה לתלמיד</label>
                            <input 
                              type="text" 
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                              value={task.instructionHe || ''}
                              onChange={(e) => {
                                const newTasks = [...editedTasks];
                                newTasks[idx].instructionHe = e.target.value;
                                setEditedTasks(newTasks);
                              }}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">מספר א'</label>
                            <input 
                              type="number" 
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                              value={task.numberA || ''}
                              onChange={(e) => {
                                const newTasks = [...editedTasks];
                                newTasks[idx].numberA = parseInt(e.target.value, 10);
                                setEditedTasks(newTasks);
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">מספר ב'</label>
                            <input 
                              type="number" 
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                              value={task.numberB || ''}
                              onChange={(e) => {
                                const newTasks = [...editedTasks];
                                newTasks[idx].numberB = parseInt(e.target.value, 10);
                                setEditedTasks(newTasks);
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">רמת פיגום (Scaffold)</label>
                            <select 
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                              value={task.scaffoldLevel || 0}
                              onChange={(e) => {
                                const newTasks = [...editedTasks];
                                newTasks[idx].scaffoldLevel = parseInt(e.target.value, 10);
                                setEditedTasks(newTasks);
                              }}
                            >
                              <option value={0}>ללא פיגום (0)</option>
                              <option value={1}>פיגום חלקי (1)</option>
                              <option value={2}>פיגום מלא (2)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Left side: Chat with AI */}
                <div className="w-[400px] flex flex-col bg-white">
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                    {coPilotChat.map((msg, i) => (
                      <div key={i} className={`flex flex-col max-w-[90%] ${msg.role === 'teacher' ? 'self-start items-start' : 'self-end items-end'}`}>
                        <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm ${msg.role === 'teacher' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'}`}>
                          {msg.text}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1 font-bold">
                          {msg.role === 'teacher' ? 'את/ה' : 'Co-Pilot AI'}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="p-4 border-t border-slate-200 bg-slate-50">
                    <form 
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!coPilotInput.trim()) return;
                        const userQuery = coPilotInput.trim();
                        const newChat = [...coPilotChat, { role: 'teacher' as const, text: userQuery }];
                        setCoPilotChat(newChat);
                        setCoPilotInput('');
                        
                        const studentName = editingApproval?.studentName || 'התלמיד/ה';
                        const { aiResponse, updatedTasks } = generateCoPilotResponse(userQuery, editedTasks || [], studentName);
                        if (updatedTasks) {
                          setEditedTasks(updatedTasks);
                        }

                        setCoPilotChat(prev => [...prev, { role: 'ai' as const, text: aiResponse }]);
                      }}
                    >
                      <input 
                        type="text"
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        placeholder="בקש מה-AI לשנות משהו..."
                        value={coPilotInput}
                        onChange={(e) => setCoPilotInput(e.target.value)}
                      />
                      <button type="submit" className="bg-indigo-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-colors">
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              <div className="flex-none p-5 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                <button 
                  className="px-6 py-2 rounded-xl text-red-600 font-bold hover:bg-red-50 transition-colors"
                  onClick={async () => {
                    const isFallback = fallbackApprovals.some(a => a.id === editingApproval.id);
                    const targetTeacherId = isFallback ? "teacher-1" : TEACHER_ID;
                    try {
                      await SocraticEngine.rejectTasks(targetTeacherId, editingApproval.id);
                      setTeacherApprovals(prev => prev.filter(a => a.id !== editingApproval.id));
                      setFallbackApprovals(prev => prev.filter(a => a.id !== editingApproval.id));
                      setEditingApproval(null);
                      setEditedTasks(null);
                    } catch (err) {
                      console.error(err);
                      toast.error('שגיאה בדחיית המשימות');
                    }
                  }}
                >
                  דחיית תוכנית
                </button>
                <div className="flex gap-3">
                  <UdlButton 
                    variant="outline"
                    onClick={async () => {
                      const isFallback = fallbackApprovals.some(a => a.id === editingApproval.id);
                      const targetTeacherId = isFallback ? "teacher-1" : TEACHER_ID;
                      try {
                        await SocraticEngine.updatePendingTasks(targetTeacherId, editingApproval.id, editedTasks);
                        toast.success('טיוטה נשמרה בהצלחה.');
                        setEditingApproval(null);
                        setEditedTasks(null);
                      } catch (err) {
                        console.error(err);
                        toast.error('שגיאה בשמירת הטיוטה');
                      }
                    }}
                  >
                    שמור טיוטה
                  </UdlButton>
                  <UdlButton 
                    semanticColor="primary"
                    onClick={async () => {
                      const isFallback = fallbackApprovals.some(a => a.id === editingApproval.id);
                      const targetTeacherId = isFallback ? "teacher-1" : TEACHER_ID;
                      try {
                        await SocraticEngine.approveTasks(targetTeacherId, editingApproval.id, editingApproval.studentId, editedTasks);
                        toast.success('התוכנית אושרה והופעלה בהצלחה.');
                        setEditingApproval(null);
                        setEditedTasks(null);
                      } catch (err) {
                        console.error('Firebase task approval failed:', err);
                        toast.error('שגיאה באישור המשימות ב-Firebase.');
                      }
                    }}
                  >
                    אשר והפעל תוכנית
                  </UdlButton>
                </div>
              </div>
            </div>
          </div>
        )}

        {drawerStudent && (
          <StudentLearningConditionsDrawer
            student={drawerStudent}
            onClose={() => setDrawerStudent(null)}
            onOpenChat={(st) => setFloatingChatStudent(st)}
          />
        )}

        {gateStudent && (
          <TeacherGateApprovalDrawer
            student={gateStudent}
            onClose={() => setGateStudent(null)}
            onApproveSuccess={() => {
              // Approval handled inside with toast and state updates
            }}
          />
        )}
        {floatingChatStudent && (
          <FloatingChatPanel
            student={floatingChatStudent}
            onClose={() => setFloatingChatStudent(null)}
            teacherId={(user?.uid as string) || TEACHER_ID}
          />
        )}
      </main>
    </div>
  );
}


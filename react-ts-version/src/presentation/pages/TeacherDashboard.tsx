import { useState, useEffect, useMemo, useRef } from "react";
import { Logo } from "@/presentation/components/ui/Logo";
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { DataGrid } from "@/presentation/design-system/DataGrid";
import { useAuthStore } from "@/application/useAuthStore";
import { useChatStore } from "@/application/useChatStore";
import { useStore, type StudentData } from "@/application/useStore";
import { ref, onValue, remove, set } from "firebase/database";
import { database, authReady } from "@/infrastructure/firebase";
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
import { Send, MessageCircle, ShieldAlert } from "lucide-react";
import { ReplayViewer } from "@/presentation/components/ReplayViewer";
import { ClassManagement } from "./TeacherDashboard/ClassManagement";
import { SocraticEngine, type PendingAIApproval } from "@/infrastructure/services/SocraticEngine";
import { useTeacherTour } from "./TeacherDashboard/useTeacherTour";

export function TeacherDashboard() {
  useTeacherTour();
  const { user } = useAuthStore();
  const { messages, sendMessage, sendImageMessage, markAsRead } = useChatStore();
  const { resetTraceData } = useStore();
  const teacherFileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const [sendingImage, setSendingImage] = useState(false);
  const [students, setStudents] = useState<Record<string, any>>(() => {
    const allSt = useStore.getState().students;
    const initial: Record<string, any> = {};
    for (const [id, s] of Object.entries(allSt)) {
      initial[id] = { ...s, studentId: id, classId: 'demo', traceData: { hesitation_events: 0, undo_clicks: 0 }, qMatrixResults: {} };
    }
    return initial;
  });

  const [activeTab, setActiveTab] = useState<
    | "clustering"
    | "alerts"
    | "diagnostic_reports"
    | "chat_admin"
    | "chat_students"
    | "class_management"
    | "approvals"
  >("clustering");

  const [inputText, setInputText] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  );
  
  const [selectedReplayStudentId, setSelectedReplayStudentId] = useState<string | null>(null);
  const [liveReplayEvents, setLiveReplayEvents] = useState<any[]>([]);

  useEffect(() => {
    if (selectedReplayStudentId) {
      // Attach only after the auth session exists — listeners attached pre-auth
      // are cancelled with permission-denied and never retry.
      let unsubscribe: (() => void) | undefined;
      let cancelled = false;
      authReady.then(() => {
      if (cancelled) return;
      const replayRef = ref(database, `replays/${selectedReplayStudentId}`);
      unsubscribe = onValue(replayRef, (snapshot) => {
         if (snapshot.exists()) {
            const data = snapshot.val();
            // Structure is replays/{uid}/{sessionTimestamp}/{pushId} — flatten TWO levels
            // (a single-level flatten produced session-objects instead of rrweb events,
            // which crashed the player). Sessions and events sort chronologically by key.
            const sessionKeys = Object.keys(data).sort();
            const latestSessionKey = sessionKeys[sessionKeys.length - 1];
            if (!latestSessionKey) {
              setLiveReplayEvents([]);
              return;
            }

            const session = data[latestSessionKey];
            if (!session || typeof session !== 'object') {
              setLiveReplayEvents([]);
              return;
            }

            const events = Object.keys(session).sort().flatMap((k) => {
              const item = session[k];
              if (typeof item === 'string') {
                try {
                  return JSON.parse(item);
                } catch {
                  return [];
                }
              }
              return [item];
            }).filter((e) => e && typeof e === 'object' && 'type' in e);
            setLiveReplayEvents(events);
         } else {
            setLiveReplayEvents([]);
         }
      });
      });
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    } else {
      setLiveReplayEvents([]);
    }
  }, [selectedReplayStudentId]);
  
  const [teacherApprovals, setTeacherApprovals] = useState<PendingAIApproval[]>([]);
  const [fallbackApprovals, setFallbackApprovals] = useState<PendingAIApproval[]>([]);
  const [seekToTime, setSeekToTime] = useState<number | undefined>();

  const pendingApprovals = useMemo(() => {
    const map = new Map<string, PendingAIApproval>();
    teacherApprovals.forEach(a => map.set(a.id, a));
    fallbackApprovals.forEach(a => map.set(a.id, a));
    return Array.from(map.values());
  }, [teacherApprovals, fallbackApprovals]);
  
  // Extract dynamic teacher ID from the logged-in user (format is usually "teacher_12345" or just ID)
  const TEACHER_ID = user?.uid?.replace("teacher_", "") || "teacher-1";

  useEffect(() => {
    const studentsRef = ref(database, 'users/students');
    const unsubscribe = onValue(studentsRef, (snapshot) => {
      const data = snapshot.val() ?? {};
      const allStudents = useStore.getState().students;
      const formattedStudents: Record<string, StudentData> = {};

      // 1. Add base demo students first
      for (const [id, s] of Object.entries(allStudents)) {
        formattedStudents[id] = {
          studentId: id,
          classId: 'demo',
          name: s.name,
          qMatrixResults: {
            task1_zero_placeholder: null,
            task2_estimation_error_margin: null,
            task3_flexible_regrouping: null,
            task4_basic_addition_fluency: null,
            task5_small_change: null,
            task6_subtraction_regrouping: null,
            task7_missing_subtrahend: null,
            task8_missing_addend: null,
          },
          traceData: { hesitation_events: 0, undo_clicks: 0 },
          completedMeeting2: false,
          routeRecommendation: null,
          routeStatus: null,
        } as any; // Using base structure
      }

      // 2. Override with live cloud data
      Object.keys(data).forEach((uid) => {
        const row = data[uid] ?? {};
        let cleanName = row.name ?? row.profile?.displayName ?? row.studentName ?? formattedStudents[uid]?.name ?? uid.replace('student_','');
        if (cleanName === 'student' || cleanName === 'student_user1' || cleanName.toLowerCase().startsWith('student_')) {
            cleanName = uid.replace('student_', ''); // Force 'user1'
        }

        formattedStudents[uid] = {
          studentId: uid,
          classId: row.classId ?? 'live',
          name: cleanName,
          qMatrixResults: {
            task1_zero_placeholder: null,
            task2_estimation_error_margin: null,
            task3_flexible_regrouping: null,
            task4_basic_addition_fluency: null,
            task5_small_change: null,
            task6_subtraction_regrouping: null,
            task7_missing_subtrahend: null,
            task8_missing_addend: null,
            ...(row.qMatrixResults ?? {}),
          },
          traceData: {
            hesitation_events: row.traceData?.hesitation_events ?? row.workspaceState?.hesitationCount ?? 0,
            undo_clicks: row.traceData?.undo_clicks ?? row.workspaceState?.undoCount ?? 0,
          },
          completedMeeting2: row.completedMeeting2 ?? false,
          routeRecommendation: row.routeRecommendation ?? null,
          routeStatus: row.routeStatus ?? null,
          diagnosticReport: row.diagnosticReport ?? null,
          // Support legacy props expected by some components
          currentTask: row.workspaceState?.standardTaskIdx || 0,
          sessionNum: row.workspaceState?.sessionNumber || 1,
          radar: {
            hesitations: row.workspaceState?.hesitationCount || 0,
            deletions: row.workspaceState?.undoCount || 0,
          },
        } as any;
      });
      setStudents(formattedStudents);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Live subscription (a one-time get() left the badge stale until full reload).
    try {
      // Listen to both the actual teacher ID and the fallback "teacher-1" queue 
      // used by students who aren't explicitly linked to a teacher yet
      const pendingRef = ref(database, `ai_pending_approvals/${TEACHER_ID}`);
      const fallbackRef = ref(database, `ai_pending_approvals/teacher-1`);

      const handleData = (snapshot: any) => {
        const data = snapshot.val();
        return data ? Object.keys(data).map((key) => ({ id: key, ...data[key] })) : [];
      };

      const unsubscribe1 = onValue(pendingRef, (snap) => {
        setTeacherApprovals(handleData(snap));
      });
      
      const unsubscribe2 = onValue(fallbackRef, (snap) => {
        setFallbackApprovals(handleData(snap));
      });

      return () => { unsubscribe1(); unsubscribe2(); };
    } catch {
      SocraticEngine.getPendingApprovals(TEACHER_ID).then(setTeacherApprovals).catch(() => {});
    }
  }, [TEACHER_ID]);

  const handleHintClick = (studentId: string) => {
    // 1. Write the hint flag to Firebase so the student gets an actual popup
    set(ref(database, `users/students/${studentId}/teacher_hint`), {
      timestamp: Date.now(),
      message: "המורה שלח לך רמז: נסה להשתמש בלוח העשרות כדי לפרוט."
    }).then(() => {
      // 2. Switch to chat so the teacher can follow up manually
      setSelectedStudentId(studentId);
      setActiveTab("chat_students");
    }).catch((err: any) => {
      console.error("Failed to send hint:", err);
      alert("שגיאה בשליחת הרמז לתלמיד.");
    });
  };

  // Clustering Logic based on Q-Matrix
  // Memoized: a fresh array identity every render made downstream useMemos
  // (incl. the alerts list) recompute on every keystroke.
  // Live cloud students override local demo entries with the same id.
  const allStudents = useMemo(
    () => Object.values(students),
    [students]
  );


  const basicAdditionGroup = allStudents.filter(
    (s) => s.qMatrixResults.task4_basic_addition_fluency && s.qMatrixResults.task4_basic_addition_fluency !== 'success',
  );
  const flexibilityGroup = allStudents.filter(
    (s) => s.qMatrixResults.task3_flexible_regrouping && s.qMatrixResults.task3_flexible_regrouping !== 'success',
  );
  const zeroPlaceholderGroup = allStudents.filter(
    (s) => s.qMatrixResults.task1_zero_placeholder && s.qMatrixResults.task1_zero_placeholder !== 'success',
  );
  const estimationGroup = allStudents.filter(
    (s) =>
      s.qMatrixResults.task2_estimation_error_margin &&
      s.qMatrixResults.task2_estimation_error_margin !== 'success',
  );
  const basicSubtractionGroup = allStudents.filter(
    (s) => s.qMatrixResults.task6_subtraction_regrouping && s.qMatrixResults.task6_subtraction_regrouping !== 'success',
  );
  const missingSubtrahendGroup = allStudents.filter(
    (s) => s.qMatrixResults.task7_missing_subtrahend && s.qMatrixResults.task7_missing_subtrahend !== 'success',
  );
  const missingAddendGroup = allStudents.filter(
    (s) => s.qMatrixResults.task8_missing_addend && s.qMatrixResults.task8_missing_addend !== 'success',
  );
  const smallChangeGroup = allStudents.filter(
    (s) => s.qMatrixResults.task5_small_change && s.qMatrixResults.task5_small_change !== 'success',
  );

  const translateRootCause = (tag: string | null | undefined) => {
    if (!tag) return "לא נבדק";
    const map: Record<string, string> = {
      'procedural_error': 'שגיאה באלגוריתם',
      'basic_facts_deficit': 'קושי בעובדות יסוד',
      'canonical_fixation': 'קיבעון קנוני',
      'regrouping_deficit': 'קושי מהותי בפריטה/המרה',
      'zero_placeholder_hundreds_error': 'השמטת אפס (מאות)',
      'zero_placeholder_global_error': 'אי-הבנת שומר מקום',
      'estimation_range_error': 'חריגה משמעותית בטווח האומדן',
      'estimation_precision_fixation': 'ניסיון לדייק במקום לאמוד',
      'small_change_confusion': 'בלבול בהשפעת שינוי קטן',
      'directional_error': 'בלבול בכיוון הפעולה (חיבור/חיסור)',
      'regrouping_anxiety': 'חשש מפריטה (חוסר הבנה מוחשית)',
      'subtraction_operation_deficit': 'קושי בחיסור בסיסי',
      'algebraic_concept_deficit': 'קושי בהבנת מאזניים (אלגברה)',
      'computational_fluency_deficit': 'חוסר שטף חישובי',
      'missing_addend_deficit': 'קושי במציאת מחבר',
      'inverse_operation_gap': 'פער בקשר חיבור-חיסור',
    };
    return map[tag] || tag;
  };

  const pendingRouteStudents = allStudents.filter(
    (s) => s.routeStatus === 'PENDING',
  );

  const approveRoute = useStore((s) => s.approveRoute);

  // Aggregate data for Chart
  const qMatrixData = useMemo(() => {
    let t1s = 0, t1f = 0,
        t2s = 0, t2f = 0,
        t3s = 0, t3f = 0,
        t4s = 0, t4f = 0,
        t5s = 0, t5f = 0,
        t6s = 0, t6f = 0,
        t7s = 0, t7f = 0,
        t8s = 0, t8f = 0;
    
    allStudents.forEach((s) => {
      if (s.qMatrixResults.task1_zero_placeholder === 'success') t1s++;
      else if (s.qMatrixResults.task1_zero_placeholder) t1f++;

      if (s.qMatrixResults.task2_estimation_error_margin === 'success') t2s++;
      else if (s.qMatrixResults.task2_estimation_error_margin) t2f++;

      if (s.qMatrixResults.task3_flexible_regrouping === 'success') t3s++;
      else if (s.qMatrixResults.task3_flexible_regrouping) t3f++;

      if (s.qMatrixResults.task4_basic_addition_fluency === 'success') t4s++;
      else if (s.qMatrixResults.task4_basic_addition_fluency) t4f++;

      if (s.qMatrixResults.task5_small_change === 'success') t5s++;
      else if (s.qMatrixResults.task5_small_change) t5f++;

      if (s.qMatrixResults.task6_subtraction_regrouping === 'success') t6s++;
      else if (s.qMatrixResults.task6_subtraction_regrouping) t6f++;

      if (s.qMatrixResults.task7_missing_subtrahend === 'success') t7s++;
      else if (s.qMatrixResults.task7_missing_subtrahend) t7f++;

      if (s.qMatrixResults.task8_missing_addend === 'success') t8s++;
      else if (s.qMatrixResults.task8_missing_addend) t8f++;
    });

    return [
      { name: "חיבור בסיסי", success: t4s, struggle: t4f },
      { name: "תחושת מספר", success: t5s, struggle: t5f },
      { name: "חיסור עם פריטה", success: t6s, struggle: t6f },
      { name: "שומר מקום (אפס)", success: t1s, struggle: t1f },
      { name: "גמישות מחשבתית", success: t3s, struggle: t3f },
      { name: "אומדן", success: t2s, struggle: t2f },
      { name: "מציאת מחסר", success: t7s, struggle: t7f },
      { name: "מציאת מחובר", success: t8s, struggle: t8f },
    ];
  }, [allStudents]);

  // Generate trace data alerts

  const [firebaseAlerts, setFirebaseAlerts] = useState<any[]>([]);

  useEffect(() => {
    const alertsRef = ref(database, 'radar_alerts');
    const unsub = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsed = Object.keys(data).map(key => {
          const rawId = data[key].rawStudentId ?? data[key].student ?? data[key].username;
          // Look up the actual name from the formatted students list (handles 'user1', 'user2' etc)
          const actualStudent = useStore.getState().students[rawId] || Object.values(useStore.getState().students).find((s: any) => s.studentId === rawId || s.name === rawId);
          
          return {
            ...data[key],
            firebaseKey: key,
            // Prioritize the actual known name from the store, fallback to whatever was saved, then rawId
            studentId: actualStudent?.name ?? data[key].studentId ?? data[key].studentName ?? rawId ?? 'תלמיד',
            rawStudentId: rawId,
          };
        }).reverse();
        setFirebaseAlerts(parsed);
      } else {
        setFirebaseAlerts([]);
      }
    });
    return () => unsub();
  }, []);

  const allAlerts = useMemo(() => {
    // Only show firebase alerts from the last 12 hours
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    return firebaseAlerts
      .filter(a => a.timestamp > twelveHoursAgo)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [firebaseAlerts]);

  const handleMarkAsRead = (alert: any) => {
    if (alert.firebaseKey?.startsWith('hesitation-') || alert.firebaseKey?.startsWith('undo-')) {
      // Actually reset the counters in Firebase so the alert clears globally
      if (alert.rawStudentId) {
        set(ref(database, `users/students/${alert.rawStudentId}/traceData`), { 
          hesitation_events: 0, 
          undo_clicks: 0, 
          lastUpdate: Date.now() 
        });
        set(ref(database, `users/students/${alert.rawStudentId}/workspaceState/hesitationCount`), 0);
        set(ref(database, `users/students/${alert.rawStudentId}/workspaceState/undoCount`), 0);
      }
      resetTraceData(alert.rawStudentId);
    } else if (alert.firebaseKey) {
      remove(ref(database, `radar_alerts/${alert.firebaseKey}`));
    }
  };

  const handleTabChange = (
    tab:
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
  const chatStudents = allStudents;

  const studentMessages = useMemo(() => {
    if (!user || !selectedStudentId) return [];
    const chatMessages = messages.filter(
      (m) => m.senderId === selectedStudentId || m.receiverId === selectedStudentId
    );
    return chatMessages.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, user, selectedStudentId]);

  useEffect(() => {
    if (activeTab === "chat_admin" && user) {
      markAsRead(user.uid, "admin");
    }
    if (activeTab === "chat_students" && user && selectedStudentId) {
      markAsRead(user.uid, selectedStudentId);
    }
  }, [activeTab, selectedStudentId, messages, user, markAsRead]);

  const handleSendAdmin = () => {
    if (!inputText.trim() || !user) return;
    sendMessage(
      user.uid,
      user.displayName || "מורה",
      "admin",
      inputText.trim(),
    );
    setInputText("");
  };

  const handleSendStudent = () => {
    if (!inputText.trim() || !user || !selectedStudentId) return;
    sendMessage(
      user.uid,
      user.displayName || "מורה",
      selectedStudentId,
      inputText.trim(),
    );
    setInputText("");
  };

  const handleTeacherImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedStudentId) return;
    setSendingImage(true);
    try {
      await sendImageMessage(user.uid, user.displayName || 'מורה', selectedStudentId, file);
    } finally {
      setSendingImage(false);
      if (teacherFileInputRef.current) teacherFileInputRef.current.value = '';
    }
  };

  const handleAdminImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setSendingImage(true);
    try {
      await sendImageMessage(user.uid, user.displayName || 'מורה', 'admin', file);
    } finally {
      setSendingImage(false);
      if (adminFileInputRef.current) adminFileInputRef.current.value = '';
    }
  };

  const unreadAdminCount = messages.filter(
    (m) => m.senderId === "admin" && m.receiverId === user?.uid && !m.read,
  ).length;

  const unreadStudentsCount = messages.filter(
    (m) => m.senderId !== "admin" && m.senderId !== user?.uid && m.receiverId === user?.uid && !m.read,
  ).length;

  return (
    <div
      className="flex flex-col md:flex-row h-full min-h-full bg-ws-bg overflow-hidden font-sans text-ws-ink selection:bg-ws-accentSoft0/30"
      dir="rtl"
    >
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-ws-surface/80 backdrop-blur-xl border-b md:border-b-0 md:border-l border-ws-surface2 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-20 transition-all overflow-y-auto max-h-full no-scrollbar">
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
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl transition-all shadow-md font-bold text-sm"
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
            id="tour-tab-clustering"
            onClick={() => handleTabChange("clustering")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "clustering" ? "bg-ws-accentSoft text-ws-accent Soft0/10  font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            מיפוי כיתתי (<span dir="ltr">Q-Matrix</span>)
          </button>
          <button
            id="tour-tab-reports"
            onClick={() => handleTabChange("diagnostic_reports")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "diagnostic_reports" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft "}`}
          >
            דו"חות אבחון אישיים
          </button>
          <button
            onClick={() => handleTabChange("approvals")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "approvals" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft "}`}
          >
            <span>אישור משימות <span dir="ltr">AI</span></span>
            {pendingRouteStudents.length > 0 && (
              <span className="bg-ws-accent text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                {pendingRouteStudents.length}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange("class_management")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "class_management" ? "bg-ws-accentSoft text-ws-accent Soft0/10  font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            ניהול כיתה ותלמידים
          </button>

          <div className="text-[10px] font-bold text-slate-400  mb-2 mt-6 px-2 uppercase tracking-widest">
            תקשורת וצ'אט
          </div>
          <button
            id="tour-tab-chat"
            onClick={() => handleTabChange("chat_students")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "chat_students" ? "bg-ws-accentSoft text-ws-accent Soft0/10  font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            <span>צ'אט עם תלמידים</span>
            {unreadStudentsCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-red-500/30 animate-pulse">
                {unreadStudentsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange("chat_admin")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "chat_admin" ? "bg-ws-accentSoft text-ws-accent Soft0/10  font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            <span>צ'אט הנהלה</span>
            {unreadAdminCount > 0 && (
              <span className="bg-ws-accentSoft0 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-amber-500/30 animate-bounce">
                {unreadAdminCount}
              </span>
            )}
          </button>
        </nav>
        
        <div className="p-4 border-t border-ws-surface2 bg-white/40 dark:bg-slate-800/40 mt-auto shrink-0">
          <LogoutButton className="w-full justify-start gap-3 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors rounded-xl px-4 py-3" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        {/* Subtle background glow effect */}
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent pointer-events-none -z-10"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-tl from-cyan-500/5 via-transparent to-transparent pointer-events-none -z-10 rounded-full blur-3xl"></div>

        {activeTab === "clustering" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-10">
              <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
                קיבוץ תלמידים לפי פערי למידה
              </h1>
              <p className="text-ws-soft  mt-3 text-lg">
                המערכת מקבצת תלמידים באופן אוטומטי על בסיס מודל ה-<span dir="ltr">Q-Matrix</span>.
              </p>
            </header>

            <AccessibleCard className="p-8 bg-ws-surface/80  backdrop-blur-xl mb-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                <span className="w-1.5 h-6 bg-ws-accentSoft0 rounded-full"></span>
                התפלגות שליטה במיומנויות (כיתה שלמה)
              </h2>
              <div className="h-[350px] w-full relative z-10" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={qMatrixData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="currentColor"
                      className="text-slate-200  opacity-50"
                    />
                    <XAxis
                      dataKey="name"
                      fontSize={13}
                      tickLine={false}
                      axisLine={false}
                      tick={{
                        fill: "currentColor",
                        className: "text-ws-soft ",
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
                        className: "text-ws-soft ",
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
              </div>
            </AccessibleCard>

            <div className="flex gap-6 pb-6 overflow-x-auto snap-x snap-mandatory hide-scrollbar" style={{ scrollbarWidth: 'none' }}>
              <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group flex-shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-rose-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  חיבור במאונך של מספרים
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהתקשו בפעולות חיבור בסיסיות ללא המרה.
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "errors", header: "זיהוי כשל" },
                    ]}
                    data={basicAdditionGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      errors: translateRootCause(s.qMatrixResults.task4_basic_addition_fluency),
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-6 w-full shadow-lg shadow-indigo-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה תרגול מותאם
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group flex-shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  פירוק והרכבה לפי המבנה העשרוני
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהצליחו לפרק רק בצורה הקנונית וזקוקים לתרגול גמישות בהמרה.
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "reps", header: "זיהוי כשל" },
                    ]}
                    data={flexibilityGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      reps: translateRootCause(s.qMatrixResults.task3_flexible_regrouping),
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-6 w-full shadow-lg shadow-indigo-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה סדנת חקר
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group flex-shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  המבנה העשרוני והמושג ספרה
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהתקשו בהבנת האפס כשומר מקום במערכת העשרונית.
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "errors", header: "זיהוי כשל" },
                    ]}
                    data={zeroPlaceholderGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      errors: translateRootCause(s.qMatrixResults.task1_zero_placeholder),
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-6 w-full shadow-lg shadow-blue-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה תרגול מותאם
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group flex-shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  רצף וסדר על ישר המספרים (משימה 2)
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שחרגו מטווח הטעות המותר בהערכת הכמויות.
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "margin", header: "זיהוי כשל" },
                    ]}
                    data={estimationGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      margin: translateRootCause(s.qMatrixResults.task2_estimation_error_margin),
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-6 w-full shadow-lg shadow-emerald-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה המחשה חזותית
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group flex-shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-fuchsia-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  חיסור עם פריטה מוחשית (משימה 6)
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהתקשו בתהליך הפריטה (חרדת פריטה) או שחסרות להם עובדות יסוד בחיסור.
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "errors", header: "זיהוי כשל" },
                    ]}
                    data={basicSubtractionGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      errors: translateRootCause(s.qMatrixResults.task6_subtraction_regrouping),
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-6 w-full shadow-lg shadow-pink-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה בלוקים ווירטואליים
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group flex-shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  מציאת מחסר (משימה 7)
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהתקשו במציאת איבר חסר באמצע המשוואה.
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "errors", header: "זיהוי כשל" },
                    ]}
                    data={missingSubtrahendGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      errors: translateRootCause(s.qMatrixResults.task7_missing_subtrahend),
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-6 w-full shadow-lg shadow-amber-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה מודל מאזניים
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group flex-shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 to-amber-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  מציאת מחובר (משימה 8)
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהתקשו בהבנת חשיבה אלגברית והקשר בין חיבור לחיסור.
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "errors", header: "זיהוי כשל" },
                    ]}
                    data={missingAddendGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      errors: translateRootCause(s.qMatrixResults.task8_missing_addend),
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-6 w-full shadow-lg shadow-yellow-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה מודל מאזניים
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group flex-shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-500 to-gray-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  תחושת מספר וגמישות (משימה 5)
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שנפלו במלכודת הגמישות ולא זיהו את השינוי הקטן.
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "errors", header: "זיהוי כשל" },
                    ]}
                    data={smallChangeGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      errors: translateRootCause(s.qMatrixResults.task5_small_change),
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-6 w-full shadow-lg shadow-slate-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה חקר יחסים
                </UdlButton>
              </AccessibleCard>
            </div>
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-10">
              <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
                התראות זמן אמת (רדאר)
              </h1>
              <p className="text-ws-soft  mt-3 text-lg">
                זיהוי מאבקים קוגניטיביים ושיוט פסיבי ללא הפרעה לתלמיד.
              </p>
            </header>
            <div className="grid gap-6">
              {allAlerts.length === 0 ? (
                <div className="text-center py-20 text-ws-soft  bg-white/50  backdrop-blur-md rounded-2xl border-2 border-dashed border-slate-300  shadow-sm">
                  <div className="w-16 h-16 mx-auto mb-4 bg-ws-bg  rounded-full flex items-center justify-center">
                    <ShieldAlert className="w-8 h-8 text-slate-300 " />
                  </div>
                  <p className="text-xl font-bold text-slate-400">
                    אין התראות חדשות. הכיתה עובדת מצוין!
                  </p>
                </div>
              ) : (
                allAlerts.map((alert) => (
                  <div
                    key={alert.firebaseKey}
                    className={`p-6 rounded-2xl border flex flex-col md:flex-row justify-between md:items-center gap-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgb(0,0,0,0.1)] backdrop-blur-md transition-all hover:scale-[1.01] ${alert.type === "HESITATION" ? "bg-ws-accentSoft/80  border-amber-200 " : "bg-red-50/80  border-red-200 "}`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`mt-1 w-3 h-3 rounded-full animate-ping ${alert.type === "HESITATION" ? "bg-ws-accentSoft0" : "bg-red-500"}`}
                      ></div>
                      <div>
                        <div className="font-black text-lg text-ws-ink ">
                          {alert.studentId || "תלמיד"} -
                          <span
                            className={
                              alert.type === "HESITATION"
                                ? "text-amber-600 "
                                : "text-red-600 "
                            }
                          >
                            {alert.type === "HESITATION"
                              ? " עצירה ממושכת (מאבק קוגניטיבי)"
                              : " מחיקות רבות (שיוט פסיבי)"}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-ws-soft  mt-2 flex items-center gap-4">
                          <span className="bg-white/50 /50 px-3 py-1 rounded-md">
                            משימה: {alert.taskId}
                          </span>
                          <span className="bg-white/50 /50 px-3 py-1 rounded-md">
                            שעת האירוע:{" "}
                            {new Date(alert.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <UdlButton
                        size="sm"
                        semanticColor="primary"
                        className="shadow-lg shadow-blue-500/20 font-bold"
                        onClick={() => handleHintClick(alert.rawStudentId)}
                      >
                        שלח רמז אישי
                      </UdlButton>
                      <UdlButton
                        size="sm"
                        variant="outline"
                        className="bg-white/50  backdrop-blur-sm border-ws-surface2  hover:bg-ws-bg "
                        onClick={() => handleMarkAsRead(alert)}
                      >
                        סמן כנקרא
                      </UdlButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "class_management" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ClassManagement allStudents={allStudents} />
          </div>
        )}

        {activeTab === "diagnostic_reports" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-10">
              <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
                דו"חות אבחון אישיים
              </h1>
              <p className="text-ws-soft mt-3 text-lg">
                תצוגה חכמה המשלבת וידאו, נתוני רדאר, פירוט מיומנויות (Q-Matrix) ותוכנית עבודה מומלצת.
              </p>
            </header>

            <div className="flex gap-6">
              {/* Sidebar: Student List */}
              <AccessibleCard className="w-64 shrink-0 p-4 bg-ws-surface/80 backdrop-blur-xl border border-ws-surface2 shadow-sm rounded-2xl h-fit max-h-[80vh] overflow-y-auto">
                <h3 className="font-bold text-ws-ink mb-4 px-2">תלמידי הכיתה</h3>
                <div className="flex flex-col gap-1">
                  {allStudents.map(s => {
                    const isCompleted = s.completedMeeting2;
                    return (
                      <button
                        key={s.studentId}
                        onClick={() => setSelectedReplayStudentId(s.studentId)}
                        className={`w-full text-right px-3 py-2 rounded-lg transition-all text-sm flex items-center justify-between ${
                          selectedReplayStudentId === s.studentId 
                            ? "bg-ws-accent text-white font-bold shadow-md" 
                            : "hover:bg-ws-bg text-ws-ink"
                        }`}
                      >
                        <span>{s.name}</span>
                        {isCompleted && <span className={`w-2 h-2 rounded-full ${selectedReplayStudentId === s.studentId ? 'bg-white' : 'bg-green-500'}`} title="מוכן לאבחון (סיים מפגש 2)"></span>}
                      </button>
                    );
                  })}
                </div>
              </AccessibleCard>

              {/* Main Profile Area */}
              <div className="flex-1 flex flex-col gap-6">
                {!selectedReplayStudentId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-ws-surface/30 rounded-3xl border-2 border-dashed border-ws-surface2">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                      <span className="text-2xl">🎓</span>
                    </div>
                    <h3 className="text-xl font-bold text-ws-ink mb-2">בחר תלמיד להצגת דו"ח האבחון</h3>
                    <p className="text-ws-soft max-w-md">
                      הדו"ח מציג שילוב של סרטון סשן הלמידה, תוצאות ה-Q-Matrix של התלמיד, וההמלצות הפדגוגיות שנוצרו על ידי מנוע ה-AI.
                    </p>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const s = students[selectedReplayStudentId];
                      if (!s) return null;
                      const hasRecording = liveReplayEvents.length > 2;
                      const socraticApproval = s.diagnosticReport || pendingApprovals.find(a => a.studentId === selectedReplayStudentId);

                      return (
                        <div className="animate-in fade-in zoom-in-95 duration-300">
                          {/* Top Row: Q-Matrix & Traces */}
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                            {/* Q-Matrix Report */}
                            <AccessibleCard className="p-6 bg-white border border-ws-surface2 shadow-md rounded-2xl">
                              <h3 className="text-xl font-bold text-ws-ink mb-4 flex items-center gap-2">
                                <span className="text-ws-accent">📊</span>
                                תוצאות ה-Q-Matrix
                              </h3>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                  <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">שומר מקום (אפס)</span>
                                  <span className={`font-semibold ${s.qMatrixResults.task1_zero_placeholder && s.qMatrixResults.task1_zero_placeholder !== 'success' ? 'text-red-500' : s.qMatrixResults.task1_zero_placeholder === 'success' ? 'text-green-600' : 'text-slate-400'}`}>
                                    {s.qMatrixResults.task1_zero_placeholder === null ? 'טרם נבדק' : s.qMatrixResults.task1_zero_placeholder === 'success' ? 'שולט' : 'דרוש חיזוק'}
                                  </span>
                                </div>
                                <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                  <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">גמישות מחשבתית</span>
                                  <span className={`font-semibold ${s.qMatrixResults.task3_flexible_regrouping && s.qMatrixResults.task3_flexible_regrouping !== 'success' ? 'text-red-500' : s.qMatrixResults.task3_flexible_regrouping === 'success' ? 'text-green-600' : 'text-slate-400'}`}>
                                    {s.qMatrixResults.task3_flexible_regrouping === null ? 'טרם נבדק' : s.qMatrixResults.task3_flexible_regrouping === 'success' ? 'שולט' : 'דרוש חיזוק'}
                                  </span>
                                </div>
                                <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                  <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">אומדן שגיאה</span>
                                  <span className={`font-semibold ${s.qMatrixResults.task2_estimation_error_margin && s.qMatrixResults.task2_estimation_error_margin !== 'success' ? 'text-red-500' : s.qMatrixResults.task2_estimation_error_margin === 'success' ? 'text-green-600' : 'text-slate-400'}`}>
                                    {s.qMatrixResults.task2_estimation_error_margin === null ? 'טרם נבדק' : s.qMatrixResults.task2_estimation_error_margin !== 'success' ? `חריגה (מעל 20%)` : 'בטווח המותר'}
                                  </span>
                                </div>
                                <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                  <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">חיבור וחיסור</span>
                                  <span className={`font-semibold ${(s.qMatrixResults.task4_basic_addition_fluency && s.qMatrixResults.task4_basic_addition_fluency !== 'success') || (s.qMatrixResults.task6_subtraction_regrouping && s.qMatrixResults.task6_subtraction_regrouping !== 'success') ? 'text-red-500' : (s.qMatrixResults.task4_basic_addition_fluency === 'success' && s.qMatrixResults.task6_subtraction_regrouping === 'success') ? 'text-green-600' : 'text-slate-400'}`}>
                                    {(s.qMatrixResults.task4_basic_addition_fluency === null && s.qMatrixResults.task6_subtraction_regrouping === null) ? 'טרם נבדק' : ((s.qMatrixResults.task4_basic_addition_fluency && s.qMatrixResults.task4_basic_addition_fluency !== 'success') || (s.qMatrixResults.task6_subtraction_regrouping && s.qMatrixResults.task6_subtraction_regrouping !== 'success')) ? 'פער בעובדות יסוד' : 'שולט'}
                                  </span>
                                </div>
                                <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                  <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">מציאת מחסר</span>
                                  <span className={`font-semibold ${s.qMatrixResults.task7_missing_subtrahend && s.qMatrixResults.task7_missing_subtrahend !== 'success' ? 'text-red-500' : s.qMatrixResults.task7_missing_subtrahend === 'success' ? 'text-green-600' : 'text-slate-400'}`}>
                                    {s.qMatrixResults.task7_missing_subtrahend === null ? 'טרם נבדק' : s.qMatrixResults.task7_missing_subtrahend === 'success' ? 'שולט' : 'דרוש חיזוק'}
                                  </span>
                                </div>
                                <div className="bg-ws-bg p-3 rounded-xl border border-ws-surface2">
                                  <span className="block text-ws-soft mb-1 text-xs font-bold uppercase">מציאת מחבר</span>
                                  <span className={`font-semibold ${s.qMatrixResults.task8_missing_addend && s.qMatrixResults.task8_missing_addend !== 'success' ? 'text-red-500' : s.qMatrixResults.task8_missing_addend === 'success' ? 'text-green-600' : 'text-slate-400'}`}>
                                    {s.qMatrixResults.task8_missing_addend === null ? 'טרם נבדק' : s.qMatrixResults.task8_missing_addend === 'success' ? 'שולט' : 'דרוש חיזוק'}
                                  </span>
                                </div>
                              </div>
                            </AccessibleCard>

                            {/* Trace Data & AI Plan */}
                            <AccessibleCard className={`p-6 border shadow-md rounded-2xl flex flex-col ${socraticApproval ? 'bg-indigo-50/50 border-indigo-100' : 'bg-white border-ws-surface2'}`}>
                              <h3 className="text-xl font-bold text-ws-ink mb-4 flex items-center gap-2">
                                <span className="text-ws-accent">🤖</span>
                                {socraticApproval ? 'המלצת Socratic Engine וסיכום אבחון' : 'מדדי למידה סמויים'}
                              </h3>
                              
                              <div className="flex-1 flex flex-col gap-4">
                                {/* Trace Logs Summary */}
                                <div className="flex gap-4">
                                  <div className="flex-1 flex items-center justify-between p-3 bg-ws-bg rounded-xl border border-ws-surface2">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-sm">⏱️</div>
                                      <span className="font-semibold text-sm">אירועי היסוס (חשיבה ארוכה)</span>
                                    </div>
                                    <span className="text-xl font-black text-orange-600">{s.traceData.hesitation_events}</span>
                                  </div>
                                  <div className="flex-1 flex items-center justify-between p-3 bg-ws-bg rounded-xl border border-ws-surface2">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-sm">↩️</div>
                                      <span className="font-semibold text-sm">ביטולי פעולה (מחיקה/חזרה)</span>
                                    </div>
                                    <span className="text-xl font-black text-red-600">{s.traceData.undo_clicks}</span>
                                  </div>
                                </div>

                                {/* Analytical Report */}
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                  <h4 className="font-bold text-slate-800 mb-3 text-lg flex items-center gap-2">
                                    <span className="text-ws-accent">📋</span>
                                    מצב נוכחי (ניתוח אוטומטי):
                                  </h4>
                                  <p className="text-sm text-slate-700 leading-relaxed mb-4">
                                    התלמיד חווה <strong className="text-orange-600">{s.traceData.hesitation_events}</strong> אירועי היסוס המעידים על מאבק קוגניטיבי, וביצע <strong className="text-red-600">{s.traceData.undo_clicks}</strong> מחיקות או חזרות. 
                                    ניתוח הפעולות בוידאו יחד עם מטריצת המיומנויות (Q-Matrix) מצביע על כך ש
                                    {s.qMatrixResults.task3_flexible_regrouping === 'canonical_fixation' ? ' נראה כי קיים קושי בגמישות מחשבתית וצורך בהמחשה מוחשית (באמצעות בלוקים) של פעולת הפריטה לפני תרגול במאונך.' : s.qMatrixResults.task3_flexible_regrouping === 'success' ? ' קיימת הבנה מוחשית וכמותית טובה של פריטה והמרה.' : ' טרם נאספו מספיק נתונים לקביעת הבנה מוחשית של המרות.'}
                                    {(s.qMatrixResults.task7_missing_subtrahend === 'algebraic_concept_deficit' || s.qMatrixResults.task8_missing_addend === 'algebraic_concept_deficit') ? ' ניכר קושי מהותי בחשיבה אלגברית והבנת משמעות סימן השוויון כמאזניים.' : (s.qMatrixResults.task7_missing_subtrahend === 'success' || s.qMatrixResults.task8_missing_addend === 'success') ? ' ניכרת יכולת טובה מאוד בחשיבה אלגברית ומציאת נעלם.' : ''}
                                  </p>
                                </div>

                                {socraticApproval && (
                                  <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100 shadow-sm mt-2">
                                    <h4 className="font-bold text-indigo-900 mb-3 text-lg flex items-center gap-2">
                                      <span className="text-indigo-600">🎯</span>
                                      המלצות ומסלול אדפטיבי למפגשים 3, 4, 5, 6, ו-7:
                                    </h4>
                                    <p className="text-sm text-indigo-800 leading-relaxed mb-5 bg-white p-4 rounded-lg border border-indigo-100/50">
                                      <strong className="block mb-1 text-indigo-900">אבחון קליני:</strong>
                                      {socraticApproval.clinicalDiagnosisHe || "לא נרשמו תובנות מהאבחון."}
                                    </p>
                                    <p className="text-sm text-indigo-800 leading-relaxed mb-5 bg-white p-4 rounded-lg border border-indigo-100/50">
                                      <strong className="block mb-1 text-indigo-900">תוכנית פעולה מוצעת:</strong>
                                      {socraticApproval.actionPlanHe || "לא נקבעה תוכנית."}
                                    </p>
                                    
                                    <h5 className="font-bold text-sm text-indigo-900 mb-3">תרגילים רצויים שנוצרו עבור התלמיד:</h5>
                                    <div className="grid gap-2 mb-5">
                                      {socraticApproval.tasks.map((task: any, idx: number) => (
                                        <div key={idx} className="bg-white p-3 rounded-lg flex items-center justify-between border border-indigo-100 shadow-sm">
                                          <div className="flex items-center gap-3">
                                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                                            <span className="font-semibold text-sm text-indigo-900">{task.titleHe}</span>
                                          </div>
                                          <div className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-md" dir="ltr">
                                            {task.numberA} {task.isSubtraction ? '-' : '+'} {task.numberB} = ?
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <UdlButton 
                                      size="sm" 
                                      semanticColor="primary"
                                      className="w-full font-bold shadow-md shadow-indigo-500/20"
                                      onClick={() => {
                                        handleTabChange("approvals");
                                      }}
                                    >
                                      עבור למסך האישורים להחלת התוכנית על התלמיד
                                    </UdlButton>
                                  </div>
                                )}
                              </div>
                            </AccessibleCard>
                          </div>

                          {/* Video Replay & Logs Dashboard */}
                          <AccessibleCard className="p-0 bg-white border border-ws-surface2 shadow-xl rounded-2xl overflow-hidden relative">
                            <div className="p-6 border-b border-ws-surface2 flex items-center justify-between">
                              <h3 className="text-xl font-bold text-ws-ink flex items-center gap-3">
                                <span className={`w-3 h-3 rounded-full ${hasRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}></span>
                                צפייה בהקלטת סשן הלמידה
                              </h3>
                              <div className="text-sm font-medium text-ws-soft">
                                {hasRecording ? `נמצאו ${liveReplayEvents.length} פריימים לניתוח` : 'לא נמצאה הקלטה לסשן זה'}
                              </div>
                            </div>
                            
                            <div className="flex flex-col xl:flex-row min-h-[600px] bg-slate-50">
                              {/* Logs Sidebar */}
                              <div className="w-full xl:w-80 bg-white border-b xl:border-b-0 xl:border-l border-ws-surface2 overflow-y-auto p-4 flex flex-col gap-3">
                                <h4 className="font-bold text-ws-ink mb-2">ציר זמן אירועים</h4>
                                {allAlerts.filter((a: any) => a.student === selectedReplayStudentId).length === 0 ? (
                                  <p className="text-sm text-ws-soft">אין אירועי מעקב לתלמיד זה.</p>
                                ) : (
                                  allAlerts.filter((a: any) => a.student === selectedReplayStudentId)
                                    .sort((a: any, b: any) => a.timestamp - b.timestamp)
                                    .map((alert: any) => (
                                    <button
                                      key={alert.id}
                                      onClick={() => setSeekToTime(alert.timestamp)}
                                      className="text-right p-3 rounded-lg border border-ws-surface2 bg-ws-bg hover:bg-ws-surface hover:border-ws-accent/50 transition-all flex flex-col gap-1 w-full"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-lg">
                                          {alert.type === 'HESITATION' ? '⏱️' : alert.type === 'PASSIVE_DRIFTING' ? '↩️' : alert.type === 'TASK_ERROR' ? '❌' : '⚠️'}
                                        </span>
                                        <span className="font-bold text-sm text-ws-ink">
                                          {alert.type === 'HESITATION' ? 'היסוס ממושך' : alert.type === 'PASSIVE_DRIFTING' ? 'מחיקות מרובות' : alert.type === 'TASK_ERROR' ? 'שגיאה במשימה' : alert.type}
                                        </span>
                                      </div>
                                      <div className="text-xs text-ws-soft font-mono">
                                        {new Date(alert.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                      </div>
                                    </button>
                                  ))
                                )}
                              </div>
                              
                              {/* Player Container */}
                              <div className="flex-1 relative flex items-center justify-center p-6 bg-slate-100/50">
                                {hasRecording ? (
                                  <div className="w-full flex items-center justify-center rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-white">
                                    <ReplayViewer events={liveReplayEvents} seekToTime={seekToTime} />
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center text-ws-soft py-20 w-full h-full">
                                    <span className="text-4xl mb-3">🎥</span>
                                    <p>התלמיד טרם ביצע פעולות שנקלטו ברדאר</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </AccessibleCard>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "approvals" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-10">
              <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
                אישור משימות <span dir="ltr">AI</span> (<span dir="ltr">Socratic Engine</span>)
              </h1>
              <p className="text-ws-soft  mt-3 text-lg">
                אישור ותיקוף מסלולי למידה אדפטיביים שנוצרו על ידי המערכת.
              </p>
            </header>
            
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
                        <h3 className="text-2xl font-bold text-ws-ink">{student.name || student.studentId}</h3>
                        <p className="text-sm text-ws-soft mt-1">מזהה: {student.studentId} | סיום מפגש 2</p>
                      </div>
                      <div className="flex gap-3">
                        <UdlButton 
                          semanticColor="primary" 
                          size="sm" 
                          className="font-bold shadow-md shadow-ws-accent/20"
                          onClick={async () => {
                            // Local state for this browser's UI…
                            approveRoute(student.studentId);
                            // …AND the Firebase write the student's browser actually waits on
                            // (approved_tasks/{studentId}) — without it meeting 3 stays locked forever.
                            const approval = pendingApprovals.find((a) => a.studentId === student.studentId);
                            if (approval) {
                              try {
                                await SocraticEngine.approveTasks(TEACHER_ID, approval.id, approval.studentId, approval.tasks);
                              } catch {
                                /* offline — local approval still recorded; Firebase retry on next click */
                              }
                            }
                          }}
                        >
                          אישור מסלול
                        </UdlButton>
                        <UdlButton 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            const allPending = [...teacherApprovals, ...fallbackApprovals];
                            const approval = allPending.find((a) => a.studentId === student.studentId);
                            if (approval) {
                              try {
                                await SocraticEngine.rejectTasks(TEACHER_ID, approval.id);
                                setTeacherApprovals(prev => prev.filter(a => a.id !== approval.id));
                                setFallbackApprovals(prev => prev.filter(a => a.id !== approval.id));
                              } catch {
                                /* offline */
                              }
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

                    {/* AI Socratic Engine Diagnosis */}
                    {(() => {
                      const approval = pendingApprovals.find(a => a.studentId === student.studentId);
                      if (!approval || !approval.clinicalDiagnosisHe) return null;
                      return (
                        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 mb-4">
                          <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2 text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                            אבחון קליני (Socratic AI Engine):
                          </h4>
                          <p className="text-amber-900 text-sm leading-relaxed mb-3">{approval.clinicalDiagnosisHe}</p>
                          <h5 className="font-bold text-amber-800 text-sm mb-1">תוכנית פעולה מוצעת:</h5>
                          <p className="text-amber-900 text-sm leading-relaxed">{approval.actionPlanHe}</p>
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
                            {student.traceData.hesitation_events} היסוסים, {student.traceData.undo_clicks} חזרות
                          </div>
                        </div>
                        <div className="bg-ws-bg p-4 rounded-xl flex items-center justify-between border border-ws-surface2">
                          <div>
                            <span className="font-semibold">בסיס עשרוני וחיבור</span>
                          </div>
                          <div className={`text-sm font-bold ${(student.qMatrixResults.task4_basic_addition_fluency && student.qMatrixResults.task4_basic_addition_fluency !== 'success') ? 'text-red-500' : 'text-green-500'}`}>
                            {(student.qMatrixResults.task4_basic_addition_fluency && student.qMatrixResults.task4_basic_addition_fluency !== 'success') ? 'נכשל' : 'תקין'}
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
          <div className="flex-1 flex flex-col bg-slate-50/50 /50 backdrop-blur-sm rounded-2xl border border-ws-surface2  shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 h-full">
            <div className="p-4 bg-white/80  backdrop-blur-xl border-b border-ws-surface2  flex items-center gap-4 shadow-sm z-10">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-xl text-ws-ink ">
                  הנהלה ותמיכה טכנית
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-2 h-2 rounded-full bg-ws-accentSoft0 animate-pulse"></span>
                  <span className="text-xs text-ws-soft  font-medium">
                    זמין כעת לשיחה
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4 relative">
              <div className="absolute inset-0 bg-ws-bg/50 /50 pointer-events-none -z-10"></div>
              {adminMessages.length === 0 ? (
                <div className="m-auto text-center flex flex-col items-center justify-center text-slate-400">
                  <MessageCircle className="w-16 h-16 mb-4 opacity-20" />
                  <p className="font-medium text-lg">
                    אין הודעות. שלח הודעה למנהל המערכת.
                  </p>
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
                        className={`px-5 py-3 rounded-2xl shadow-md ${isMe ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tl-sm" : "bg-white/90  backdrop-blur-md border border-ws-surface2  text-ws-ink  rounded-tr-sm"}`}
                      >
                        {msg.text && <span>{msg.text}</span>}
                        {msg.imageUrl && (
                          <img
                            src={msg.imageUrl}
                            alt="תמונה"
                            className="max-w-[220px] max-h-[220px] rounded-xl mt-1 object-cover cursor-pointer block"
                            onClick={() => window.open(msg.imageUrl, '_blank')}
                          />
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-slate-400  mt-2 px-2 tracking-wider">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 bg-white/80  backdrop-blur-xl border-t border-ws-surface2 ">
              <input
                ref={adminFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAdminImageSelect}
              />
              <div className="flex gap-3 items-center">
                <button
                  type="button"
                  onClick={() => alert("הקלטת שמע אינה זמינה כעת.")}
                  className="flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80 hover:bg-slate-200 text-ws-soft transition-all shadow-sm"
                  title="הקלטת שמע"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-mic"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => adminFileInputRef.current?.click()}
                  disabled={sendingImage}
                  className="flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80 hover:bg-slate-200 text-ws-soft transition-all shadow-sm disabled:opacity-40"
                  title="שלח תמונה"
                >
                  {sendingImage ? (
                    <span className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-image"
                    >
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                    </svg>
                  )}
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendAdmin()}
                  placeholder="הקלד הודעה למנהל המערכת..."
                  className="flex-1 bg-ws-bg/80 /80 border border-ws-surface2  rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-ws-ink  shadow-inner"
                />
                <UdlButton
                  onClick={handleSendAdmin}
                  disabled={!inputText.trim()}
                  className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-all disabled:opacity-50 shadow-lg shadow-blue-500/30"
                >
                  <Send className="w-5 h-5 -ml-1" />
                </UdlButton>
              </div>
            </div>
          </div>
        )}

        {/* STUDENTS CHAT */}
        {activeTab === "chat_students" && (
          <div className="flex-1 flex flex-col md:flex-row bg-slate-50/50 /50 backdrop-blur-sm rounded-2xl border border-ws-surface2  shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 h-full">
            {/* Student List */}
            <div
              className={`${selectedStudentId ? "hidden md:flex" : "flex"} w-full md:w-72 bg-white/80  backdrop-blur-xl border-b md:border-b-0 md:border-l border-ws-surface2  flex-col h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)]`}
            >
              <div className="p-6 border-b border-ws-surface2 flex flex-col gap-3">
                <div>
                  <h3 className="font-bold text-xl text-ws-ink ">
                    שיחות עם תלמידים
                  </h3>
                  <p className="text-xs text-ws-soft mt-1 font-medium">
                    בחר תלמיד לתחילת צ'אט אישי
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatStudents.map((student) => {
                  const unreadCount = messages.filter(
                    (m) =>
                      m.senderId === student.studentId &&
                      !m.read,
                  ).length;
                  return (
                    <button
                      key={student.studentId}
                      onClick={() => {
                        setSelectedStudentId(student.studentId);
                        setInputText("");
                      }}
                      className={`w-full text-right p-4 rounded-xl flex items-center justify-between transition-all ${selectedStudentId === student.studentId ? "bg-ws-accentSoft Soft0/10 shadow-sm border border-cyan-200/50 " : "hover:bg-ws-bg/80  border border-transparent"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-inner relative ${selectedStudentId === student.studentId ? "bg-gradient-to-tr from-cyan-500 to-blue-500" : "bg-slate-300  text-ws-soft "}`}
                        >
                          {(student.name || student.studentId || 'U')[0]}
                          {student.traceData?.hesitation_events > 0 && (
                            <div
                              className="absolute -top-1 -right-1 bg-ws-accentSoft0 rounded-full p-0.5 shadow-md"
                              title="מאבק קוגניטיבי"
                            >
                              <ShieldAlert className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        <span
                          className={`font-bold text-base ${selectedStudentId === student.studentId ? "text-cyan-800 " : "text-slate-700 "}`}
                        >
                          {student.name || student.studentId}
                        </span>
                      </div>
                      {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-lg shadow-red-500/30 animate-bounce">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Student Chat Area */}
            <div
              className={`${!selectedStudentId ? "hidden md:flex" : "flex"} flex-1 flex-col relative h-full bg-slate-50/50 /50`}
            >
              {selectedStudentId ? (
                <>
                  <div className="p-4 bg-white/80  backdrop-blur-xl border-b border-ws-surface2  flex items-center gap-4 shadow-sm z-10">
                    <button
                      onClick={() => setSelectedStudentId(null)}
                      className="md:hidden p-2 rounded-lg bg-ws-bg  text-ws-soft  hover:text-ws-ink "
                    >
                      &rarr;
                    </button>
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20 text-xl">
                      {
                        (chatStudents.find((s) => s.studentId === selectedStudentId)?.name || selectedStudentId || 'U')[0]
                      }
                    </div>
                    <div>
                      <h3 className="font-bold text-xl text-ws-ink ">
                        {
                          chatStudents.find((s) => s.studentId === selectedStudentId)?.name || selectedStudentId
                        }
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 rounded-full bg-ws-accentSoft0"></span>
                        <span className="text-xs text-ws-soft  font-medium">
                          מחובר
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4 relative">
                    <div className="absolute inset-0 bg-ws-bg/50 /50 pointer-events-none -z-10"></div>
                    {studentMessages.length === 0 ? (
                      <div className="m-auto text-center flex flex-col items-center justify-center text-slate-400">
                        <MessageCircle className="w-16 h-16 mb-4 opacity-20" />
                        <p className="font-medium text-lg">
                          אין הודעות. התחל שיחה חדשה.
                        </p>
                      </div>
                    ) : (
                      studentMessages.map((msg) => {
                        const isMe = msg.senderId === user?.uid;
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                          >
                            <div
                              className={`px-5 py-3 rounded-2xl shadow-md ${
                                isMe
                                  ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-tl-sm"
                                  : "bg-white/90 backdrop-blur-md border border-ws-surface2 text-ws-ink rounded-tr-sm"
                              }`}
                            >
                              {msg.text && <span>{msg.text}</span>}
                              {msg.imageUrl && (
                                <img
                                  src={msg.imageUrl}
                                  alt="תמונה"
                                  className="max-w-[220px] max-h-[220px] rounded-xl mt-1 object-cover cursor-pointer block"
                                  onClick={() => window.open(msg.imageUrl, '_blank')}
                                />
                              )}
                            </div>
                            <span className="text-[10px] font-medium text-slate-400  mt-2 px-2 tracking-wider">
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="p-4 bg-white/80 backdrop-blur-xl border-t border-ws-surface2">
                    <input
                      ref={teacherFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleTeacherImageSelect}
                    />
                    <div className="flex gap-3 items-center">
                      <button
                        type="button"
                        onClick={() => teacherFileInputRef.current?.click()}
                        disabled={sendingImage || !selectedStudentId}
                        title="שלח תמונה"
                        className="flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80 hover:bg-slate-200 text-ws-soft transition-all shadow-sm disabled:opacity-40"
                      >
                        {sendingImage ? (
                          <span className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                            <circle cx="9" cy="9" r="2" />
                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                          </svg>
                        )}
                      </button>
                       <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSendStudent()
                        }
                        placeholder="הקלד הודעה לתלמיד..."
                        className="flex-1 bg-ws-bg/80 /80 border border-ws-surface2  rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all text-ws-ink  shadow-inner"
                      />
                      <UdlButton
                        onClick={handleSendStudent}
                        disabled={!inputText.trim()}
                        className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white transition-all disabled:opacity-50 shadow-lg shadow-cyan-500/30"
                      >
                        <Send className="w-5 h-5 -ml-1" />
                      </UdlButton>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center flex-col text-slate-400 gap-6">
                  <div className="w-32 h-32 rounded-full bg-ws-bg/50  border-2 border-dashed border-ws-surface2  flex items-center justify-center">
                    <MessageCircle className="w-12 h-12 opacity-30" />
                  </div>
                  <h3 className="text-2xl font-bold text-ws-soft ">
                    בחר תלמיד להתחלת שיחה
                  </h3>
                  <p className="text-ws-soft max-w-sm text-center">
                    תוכל לתת משוב אישי, לשלוח רמזים, או לעזור בזמן אמת.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

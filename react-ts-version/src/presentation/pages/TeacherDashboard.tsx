import { useState, useEffect, useMemo, useRef } from "react";
import { Logo } from "@/presentation/components/ui/Logo";
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { DataGrid } from "@/presentation/design-system/DataGrid";
import { useAuthStore } from "@/application/useAuthStore";
import { useChatStore, type ChatMessage } from "@/application/useChatStore";
import { useStore, type StudentData } from "@/application/useStore";
import { ref, onValue, remove, set } from "firebase/database";
import { database } from "@/infrastructure/firebase";
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

import { ClassManagement } from "./TeacherDashboard/ClassManagement";
import { StudentReplayAndLogs } from "./TeacherDashboard/components/StudentReplayAndLogs";
import { SocraticEngine, type PendingAIApproval } from "@/infrastructure/services/SocraticEngine";
import { useTeacherTour } from "./TeacherDashboard/useTeacherTour";
import type { RadarAlert } from "@/types/dashboard";
import { CONCEPT_LABELS_HE } from "@/core/QMatrix";

const getStudentKPIs = (student: StudentData, messages: ChatMessage[]) => {
  // 1. Persistence
  const undo = student.traceData?.undo_clicks || 0;
  const hesitation = student.traceData?.hesitation_events || 0;
  const persistenceScore = 70 + Math.min(20, undo * 3) + Math.min(15, hesitation * 1.5);
  const persistence = Math.round(Math.min(100, persistenceScore));

  // 2. Efficiency
  const meeting2Bonus = student.completedMeeting2 ? 10 : 0;
  const efficiencyScore = 90 - 2.5 * (undo + hesitation) + meeting2Bonus;
  const efficiency = Math.round(Math.max(0, Math.min(100, efficiencyScore)));

  // 3. Estimation Accuracy
  const margin = student.qMatrixResults?.task2_estimation_error_margin;
  let estimationAccuracy = 80;
  if (margin === 'success') {
    estimationAccuracy = 94;
  } else if (margin !== null && margin !== undefined) {
    estimationAccuracy = 68;
  }

  // 4. Dialogue Quality
  const teacherMsgs = messages.filter(msg => msg.receiverId === student.studentId && msg.senderId !== student.studentId);
  let dialogueQuality = 85;
  if (teacherMsgs.length > 0) {
    const keywords = ["איך", "כיצד", "למה", "מדוע", "אסטרטגיה", "שלב", "דרך", "מחשבה", "פריטה", "קיבוץ", "המרה"];
    const matchingMsgs = teacherMsgs.filter(msg => 
      keywords.some(keyword => msg.text.includes(keyword))
    );
    dialogueQuality = Math.round((matchingMsgs.length / teacherMsgs.length) * 100);
  }

  return {
    persistence,
    efficiency,
    estimationAccuracy,
    dialogueQuality
  };
};

export function TeacherDashboard() {
  useTeacherTour();
  const { user } = useAuthStore();
  const { messages, sendMessage, sendImageMessage, markAsRead } = useChatStore();

  const teacherFileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const [sendingImage, setSendingImage] = useState(false);
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
  
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReplayStudentId, setSelectedReplayStudentId] = useState<string | null>(null);

  const [teacherApprovals, setTeacherApprovals] = useState<PendingAIApproval[]>([]);
  const [fallbackApprovals, setFallbackApprovals] = useState<PendingAIApproval[]>([]);

  // Teacher-AI Co-Pilot States
  const [editingApproval, setEditingApproval] = useState<PendingAIApproval | null>(null);
  const [editedTasks, setEditedTasks] = useState<any[] | null>(null);
  const [coPilotChat, setCoPilotChat] = useState<{ role: 'ai' | 'teacher', text: string }[]>([
    { role: 'ai', text: 'שלום! אני סוכן ה-AI. התוכנית למפגש הקרוב מוכנה. תוכל לאשר אותה, לערוך אותה כאן, או לבקש ממני לשנות משהו (למשל: "הורד את רמת הקושי של תרגיל 1").' }
  ]);
  const [coPilotInput, setCoPilotInput] = useState('');


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
          // Use real data from useStore (written by session 2 at completion via updateQMatrix)
          qMatrixResults: s.qMatrixResults ?? {
            task1_zero_placeholder: null,
            task2_estimation_error_margin: null,
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
        
        const isAdmin = user?.role === 'admin';
        // Multi-tenant filtering: Only load students belonging to this teacher (or unassigned/demo)
        if (!isAdmin && row.teacherId && row.teacherId !== TEACHER_ID && row.teacherId !== "teacher-1") {
          return; // Skip students from other teachers
        }

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
            hesitation_events: Math.max(row.traceData?.hesitation_events || 0, row.workspaceState?.hesitationCount || 0),
            undo_clicks: Math.max(row.traceData?.undo_clicks || 0, row.workspaceState?.undoCount || 0),
          },
          completedMeeting2: row.completedMeeting2 ?? false,
          routeRecommendation: row.routeRecommendation ?? null,
          routeStatus: row.routeStatus ?? null,
          diagnosticReport: row.diagnosticReport ?? null,
          additionBoardEnabled: row.additionBoardEnabled ?? false,
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
      setIsLoading(false);
    }, (error) => {
      console.error("Firebase permission denied or network error on users/students:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [TEACHER_ID, user?.role]);

  useEffect(() => {
    // Live subscription (a one-time get() left the badge stale until full reload).
    try {
      // Listen to both the actual teacher ID and the fallback "teacher-1" queue 
      // used by students who aren't explicitly linked to a teacher yet
      const pendingRef = ref(database, `ai_pending_approvals/${TEACHER_ID}`);
      const fallbackRef = ref(database, `ai_pending_approvals/teacher-1`);

      const handleData = (snapshot: any) => {
        const rawData = snapshot.val();
        const data = (rawData && typeof rawData === 'object') ? rawData : {};
        return Object.keys(data).map((key) => ({ id: key, ...data[key as keyof typeof data] }));
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


  const decimalStructureGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.decimal_structure < 0.8
  );
  const numberMagnitudeGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.number_magnitude < 0.8
  );
  const regroupingFluencyGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.regrouping_fluency < 0.8
  );
  const proceduralFluencyGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.procedural_fluency < 0.8
  );
  const relationalThinkingGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.relational_thinking < 0.8
  );
  const algebraicReasoningGroup = allStudents.filter(
    (s) => s.conceptMastery && s.conceptMastery.algebraic_reasoning < 0.8
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
    const alertsRef = ref(database, 'radar_alerts');
    const unsub = onValue(alertsRef, (snapshot) => {
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
    });
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
        // Filter out disconnected students
        const isOnline = actualStudent?.isOnline !== false;
        
        // Anti-leakage: must belong to this teacher (fallback to true for legacy alerts without teacherId, but reset will clean them)
        const aAny = a as any;
        const isMyTeacher = aAny.teacherId ? aAny.teacherId === TEACHER_ID : true;
        
        return isMyStudent && isOnline && isMyTeacher;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [firebaseAlerts, students, TEACHER_ID]);

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
    }

    // 3. Dismiss the alert from the radar queue (without resetting the overall traceData)
    if (alert.firebaseKey) {
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
      const unreadStudent = messages.filter(m => m.senderId === selectedStudentId && m.receiverId === user.uid && !m.read && !processedMessages.current.has(m.id));
      if (unreadStudent.length > 0) {
        unreadStudent.forEach(m => processedMessages.current.add(m.id));
        markAsRead(user.uid as string, selectedStudentId);
      }
    }
  }, [activeTab, selectedStudentId, messages, user, markAsRead]);

  const handleSendAdmin = () => {
    if (!inputText.trim() || !user) return;
    sendMessage(
      user.uid as string,
      (user.displayName as string) || "מורה",
      "admin",
      inputText.trim(),
    );
    setInputText("");
  };

  const handleSendStudent = () => {
    if (!inputText.trim() || !user || !selectedStudentId) return;
    sendMessage(
      user.uid as string,
      (user.displayName as string) || "מורה",
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
      await sendImageMessage(user.uid as string, (user.displayName as string) || 'מורה', selectedStudentId, file);
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
      await sendImageMessage(user.uid as string, (user.displayName as string) || 'מורה', 'admin', file);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-600 dark:text-slate-400 font-medium">טוען נתוני תלמידים...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col md:flex-row h-[100dvh] bg-ws-bg overflow-hidden font-sans text-ws-ink selection:bg-ws-accentSoft0/30"
      dir="rtl"
    >
      {/* Sidebar */}
      <aside className="sticky top-0 w-full md:w-64 bg-ws-surface/80 backdrop-blur-xl border-b md:border-b-0 md:border-l border-ws-surface2 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-20 transition-all overflow-y-auto max-h-[100dvh] no-scrollbar shrink-0">
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
            onClick={() => handleTabChange("alerts")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 ${activeTab === "alerts" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft "}`}
          >
            <span>התראות זמן אמת (רדאר)</span>
            {allAlerts.length > 0 && (
              <span className="bg-rose-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-rose-500/30 badge-alert animate-soft-heartbeat">
                {allAlerts.length}
              </span>
            )}
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
          <button
            onClick={() => handleTabChange("class_management")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 ${activeTab === "class_management" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            ניהול כיתה ותלמידים
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

            <AccessibleCard className="p-8 bg-ws-surface/80  backdrop-blur-xl mb-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-ws-surface2  rounded-2xl relative overflow-hidden group">
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
                )}
              </div>
            </AccessibleCard>

            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 pb-6">
              <AccessibleCard className="flex flex-col h-full p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  הבנת המבנה העשרוני ושומר מקום
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהתקשו בהבנת האפס כשומר מקום או זיהוי ערך המקום במערכת העשרונית.
                </p>
                <div className="relative z-10 rounded-xl overflow-y-auto max-h-[300px] border border-ws-surface2 shadow-inner">
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
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-auto pt-6 w-full shadow-lg shadow-blue-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצאת תרגול מותאם
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="flex flex-col h-full p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  תחושת גודל ואומדן
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שמתקשים להעריך ולמקם מספרים על הרצף.
                </p>
                <div className="relative z-10 rounded-xl overflow-y-auto max-h-[300px] border border-ws-surface2 shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "mastery", header: "רמת שליטה" },
                    ]}
                    data={numberMagnitudeGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      mastery: s.conceptMastery ? `${Math.round(s.conceptMastery.number_magnitude * 100)}%` : "חסר מידע",
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-auto pt-6 w-full shadow-lg shadow-emerald-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצאת המחשה חזותית
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="flex flex-col h-full p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  גמישות בהמרה ופריטה
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים המקובעים לייצוג הקנוני ומתקשים לפרוט עשרות ליחידות.
                </p>
                <div className="relative z-10 rounded-xl overflow-y-auto max-h-[300px] border border-ws-surface2 shadow-inner">
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
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-auto pt-6 w-full shadow-lg shadow-indigo-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצאת סדנת חקר
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="flex flex-col h-full p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-rose-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  שליטה בפרוצדורות ובעובדות
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שזקוקים לחיזוק האלגוריתם המסורתי בחיבור וחיסור.
                </p>
                <div className="relative z-10 rounded-xl overflow-y-auto max-h-[300px] border border-ws-surface2 shadow-inner">
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
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-auto pt-6 w-full shadow-lg shadow-red-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצאת תרגול מותאם
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="flex flex-col h-full p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-500 to-gray-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  חשיבה יחסית (Relational Thinking)
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שמתקשים לגזור עובדה חדשה מתוך עובדה ידועה ללא חישוב מחדש.
                </p>
                <div className="relative z-10 rounded-xl overflow-y-auto max-h-[300px] border border-ws-surface2 shadow-inner">
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
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-auto pt-6 w-full shadow-lg shadow-slate-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה חקר יחסים
                </UdlButton>
              </AccessibleCard>

              <AccessibleCard className="flex flex-col h-full p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  חשיבה אלגברית ומציאת נעלם
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים המתקשים להבין את סימן השוויון כמאזניים ואת הדינמיקה של משוואה.
                </p>
                <div className="relative z-10 rounded-xl overflow-y-auto max-h-[300px] border border-ws-surface2 shadow-inner">
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
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-auto pt-6 w-full shadow-lg shadow-amber-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצאת מודל מאזניים
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
                <div className="text-center py-20 text-ws-soft bg-white/50 backdrop-blur-md rounded-2xl border-2 border-dashed border-slate-300 shadow-sm">
                  <div className="w-16 h-16 mx-auto mb-4 bg-ws-bg rounded-full flex items-center justify-center">
                    <ShieldAlert className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-xl font-bold text-slate-400">
                    אין התראות חדשות. הכיתה עובדת מצוין!
                  </p>
                </div>
              ) : (
                (() => {
                  const groupedAlerts = allAlerts.reduce((acc, alert) => {
                    const sId = alert.studentId || "תלמיד אנונימי";
                    if (!acc[sId]) acc[sId] = { studentId: sId, alerts: [] };
                    acc[sId].alerts.push(alert);
                    return acc;
                  }, {} as Record<string, { studentId: string, alerts: typeof allAlerts }>);

                  return (
                    <div className="grid gap-6 md:grid-cols-2">
                      {Object.values(groupedAlerts).map(group => {
                        const isRed = group.alerts.some(a => a.type === "TAB_ESCAPE" || a.type === "PASSIVE_DRIFTING");
                        
                        return (
                          <div key={group.studentId} className={`p-6 rounded-3xl border shadow-sm backdrop-blur-md transition-all hover:scale-[1.01] ${isRed ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full animate-ping ${isRed ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                                <div>
                                  <h3 className="font-bold text-xl text-slate-800">{group.studentId}</h3>
                                  <p className="text-sm text-slate-500">{group.alerts.length} אירועים נרשמו לאחרונה</p>
                                </div>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${isRed ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                                {isRed ? 'SOS קוגניטיבי / חוסר מיקוד' : 'התראת אוטומציה / פיגום מוזרק'}
                              </span>
                            </div>
                            
                            <div className="flex flex-col gap-2 mb-6 max-h-[150px] overflow-y-auto pr-2">
                              {group.alerts.map((a, i) => (
                                <div key={i} className="text-sm text-slate-600 bg-white/70 p-3 rounded-lg border border-white/50 flex justify-between items-center">
                                  <div>
                                    <span className="font-bold text-slate-800 ml-2">{new Date(a.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                                    {a.type === "HESITATION" ? "מאבק קוגניטיבי (עצירה)" : a.type === "TAB_ESCAPE" ? "נטישת חלון" : a.type === "PASSIVE_DRIFTING" ? "שיוט פסיבי (מחיקות)" : a.type}
                                  </div>
                                  <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">משימה: {a.taskId || "?"}</span>
                                </div>
                              ))}
                            </div>
                            
                            <div className="flex gap-2">
                              <UdlButton size="sm" semanticColor="primary" className="flex-1 shadow-md shadow-blue-500/20" onClick={() => handleAlertResponse(group.alerts[0], 'HINT', 'נשלח רמז אישי')}>שלח רמז אישי</UdlButton>
                              <UdlButton size="sm" semanticColor="secondary" className="flex-1 bg-purple-100 hover:bg-purple-200 text-purple-700 shadow-sm" onClick={() => handleAlertResponse(group.alerts[0], 'PHYSICAL', 'ניגשתי פיזית לתלמיד')}>ניגשתי פיזית</UdlButton>
                              <UdlButton size="sm" variant="outline" className="flex-1 bg-white/50" onClick={() => {
                                group.alerts.forEach(a => handleAlertResponse(a, 'ACKNOWLEDGED', 'סומן כנקרא (ללא התערבות)'));
                              }}>סמן הכל כנקרא</UdlButton>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
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
                      const socraticApproval = s.diagnosticReport || pendingApprovals.find(a => a.studentId === selectedReplayStudentId);

                      return (
                        <div className="animate-in fade-in zoom-in-95 duration-300">
                          {/* Video Replay & Logs Summary Banner */}
                          <div className="mb-6">
                            <StudentReplayAndLogs studentId={selectedReplayStudentId} />
                          </div>

                          {/* Main Content Row: Q-Matrix & Traces */}
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                            {/* Q-Matrix Report */}
                            <AccessibleCard className="p-6 bg-white border border-ws-surface2 shadow-md rounded-2xl h-full">
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
                            <AccessibleCard className={`p-6 border shadow-md rounded-2xl flex flex-col h-full ${socraticApproval ? 'bg-indigo-50/50 border-indigo-100' : 'bg-white border-ws-surface2'}`}>
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

                                {/* Quantitative KPIs */}
                                {(() => {
                                  const kpis = getStudentKPIs(s, messages);
                                  return (
                                    <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-150 dark:border-slate-800">
                                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-3">מדדי ביצוע כמותיים (KPIs):</h4>
                                      <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 shadow-sm">
                                          <div className="flex justify-between font-bold mb-1">
                                            <span>מדד התמדה:</span>
                                            <span className="text-blue-600">{kpis.persistence}%</span>
                                          </div>
                                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                            <div className="bg-blue-500 h-full rounded-full" style={{ width: `${kpis.persistence}%` }}></div>
                                          </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 shadow-sm">
                                          <div className="flex justify-between font-bold mb-1">
                                            <span>יעילות:</span>
                                            <span className="text-emerald-600">{kpis.efficiency}%</span>
                                          </div>
                                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${kpis.efficiency}%` }}></div>
                                          </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 shadow-sm">
                                          <div className="flex justify-between font-bold mb-1">
                                            <span>דיוק אומדן:</span>
                                            <span className="text-amber-600">{kpis.estimationAccuracy}%</span>
                                          </div>
                                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                            <div className="bg-amber-500 h-full rounded-full" style={{ width: `${kpis.estimationAccuracy}%` }}></div>
                                          </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 shadow-sm">
                                          <div className="flex justify-between font-bold mb-1">
                                            <span>איכות דיאלוג:</span>
                                            <span className="text-purple-600">{kpis.dialogueQuality}%</span>
                                          </div>
                                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                            <div className="bg-purple-500 h-full rounded-full" style={{ width: `${kpis.dialogueQuality}%` }}></div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Analytical Report */}
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                  <h4 className="font-bold text-slate-800 mb-3 text-lg flex items-center gap-2">
                                    <span className="text-ws-accent">📋</span>
                                    מצב נוכחי (ניתוח אוטומטי):
                                  </h4>
                                  <p className="text-sm text-slate-700 leading-relaxed mb-4">
                                    התלמיד חווה <strong className="text-orange-600">{s.traceData.hesitation_events}</strong> אירועי היסוס המעידים על מאבק קוגניטיבי, וביצע <strong className="text-red-600">{s.traceData.undo_clicks}</strong> מחיקות או חזרות. 
                                    ניתוח הפעולות בווידאו יחד עם מטריצת המיומנויות (Q-Matrix) מצביע על כך ש
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
                                      {(socraticApproval as any).clinicalDiagnosisHe || "לא נרשמו תובנות מהאבחון."}
                                    </p>
                                    <p className="text-sm text-indigo-800 leading-relaxed mb-5 bg-white p-4 rounded-lg border border-indigo-100/50">
                                      <strong className="block mb-1 text-indigo-900">תוכנית פעולה מוצעת:</strong>
                                      {(socraticApproval as any).actionPlanHe || "לא נקבעה תוכנית."}
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
                                            {task.numberA} {task.isSubtraction ? '-' : '﬩'} {task.numberB} = ?
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
                שער אישור מחזורי (<span dir="ltr">Recurring Teacher Gate</span>)
              </h1>
              <p className="text-ws-soft  mt-3 text-lg">
                אישור הפלט הדיאגנוסטי של ה-AI (מאקרו ומיקרו) כדי להתיר (Unlock) את שיעורי ההמשך (3-7).
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
                            const allPending = [...teacherApprovals, ...fallbackApprovals];
                            const approval = allPending.find((a) => a.studentId === student.studentId);
                            if (approval) {
                              try {
                                const isFallback = fallbackApprovals.some(a => a.id === approval.id);
                                const targetTeacherId = isFallback ? "teacher-1" : TEACHER_ID;
                                await SocraticEngine.approveTasks(targetTeacherId, approval.id, approval.studentId, approval.tasks);
                              } catch (err) {
                                console.error('Firebase task approval failed:', err);
                                alert('שגיאה באישור המשימות ב-Firebase.');
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
                                { role: 'ai', text: `שלום! אני סוכן ה-AI. התוכנית למפגש ${approval.targetSession || '3'} עבור ${student.name} מוכנה. תוכל לערוך אותה כאן, או לבקש ממני לשנות משהו.` }
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
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{kpis.persistence}%</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${kpis.persistence}%` }}></div>
                              </div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                              <span className="text-xs text-ws-soft block mb-1">יעילות (Efficiency)</span>
                              <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{kpis.efficiency}%</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${kpis.efficiency}%` }}></div>
                              </div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                              <span className="text-xs text-ws-soft block mb-1">דיוק אומדן (Estimation)</span>
                              <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{kpis.estimationAccuracy}%</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${kpis.estimationAccuracy}%` }}></div>
                              </div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                              <span className="text-xs text-ws-soft block mb-1">איכות דיאלוג (Dialogue)</span>
                              <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{kpis.dialogueQuality}%</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                                <div className="bg-purple-500 h-full rounded-full" style={{ width: `${kpis.dialogueQuality}%` }}></div>
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
                      className={`w-full text-right p-4 rounded-xl flex items-center justify-between transition-all ${selectedStudentId === student.studentId ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm border border-cyan-200/50 " : "hover:bg-ws-bg/80  border border-transparent"}`}
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
                        const newChat = [...coPilotChat, { role: 'teacher' as const, text: coPilotInput }];
                        setCoPilotChat(newChat);
                        setCoPilotInput('');
                        
                        // Fake AI response for now
                        setTimeout(() => {
                          setCoPilotChat(prev => [...prev, { role: 'ai', text: 'מצוין, עדכנתי את התוכנית בהתאם לבקשתך. תוכל לראות את השינויים בעורך התוכנית מימין.' }]);
                        }, 1000);
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
                      alert('שגיאה בדחיית המשימות');
                    }
                  }}
                >
                  דחה ומחק לחלוטין
                </button>
                <div className="flex gap-3">
                  <UdlButton 
                    variant="outline"
                    onClick={async () => {
                      const isFallback = fallbackApprovals.some(a => a.id === editingApproval.id);
                      const targetTeacherId = isFallback ? "teacher-1" : TEACHER_ID;
                      try {
                        await SocraticEngine.updatePendingTasks(targetTeacherId, editingApproval.id, editedTasks);
                        alert('טיוטה נשמרה בהצלחה. תוכל להמשיך לערוך אותה מאוחר יותר.');
                        setEditingApproval(null);
                        setEditedTasks(null);
                      } catch (err) {
                        console.error(err);
                        alert('שגיאה בשמירת הטיוטה');
                      }
                    }}
                  >
                    שמור טיוטה (Save Draft)
                  </UdlButton>
                  <UdlButton 
                    semanticColor="primary"
                    onClick={async () => {
                      const isFallback = fallbackApprovals.some(a => a.id === editingApproval.id);
                      const targetTeacherId = isFallback ? "teacher-1" : TEACHER_ID;
                      try {
                        await SocraticEngine.approveTasks(targetTeacherId, editingApproval.id, editingApproval.studentId, editedTasks);
                        setEditingApproval(null);
                        setEditedTasks(null);
                      } catch (err) {
                        console.error('Firebase task approval failed:', err);
                        alert('שגיאה באישור המשימות ב-Firebase.');
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
      </main>
    </div>
  );
}


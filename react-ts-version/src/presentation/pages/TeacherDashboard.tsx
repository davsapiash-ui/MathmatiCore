import { useState, useEffect, useMemo } from "react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { DataGrid } from "@/presentation/design-system/DataGrid";
import { useAuthStore } from "@/application/useAuthStore";
import { useChatStore } from "@/application/useChatStore";
import { useStore } from "@/application/useStore";
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
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";
import { ReplayViewer } from "@/presentation/components/ReplayViewer";
import { MOCK_RRWEB_EVENTS } from "@/infrastructure/mockRrwebEvents";
import { ClassManagement } from "./TeacherDashboard/ClassManagement";

export function TeacherDashboard() {
  const { user } = useAuthStore();
  const { messages, sendMessage, markAsRead } = useChatStore();
  const { students, resetTraceData } = useStore();

  const [activeTab, setActiveTab] = useState<
    | "clustering"
    | "alerts"
    | "replays"
    | "chat_admin"
    | "chat_students"
    | "class_management"
  >("clustering");

  const [inputText, setInputText] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  );

  const handleHintClick = (studentId: string) => {
    setSelectedStudentId(studentId);
    setActiveTab("chat_students");
  };

  // Clustering Logic based on Q-Matrix
  const allStudents = Object.values(students);

  const basicAdditionGroup = allStudents.filter(
    (s) => s.qMatrixResults.task4_basic_addition_fluency === false,
  );
  const flexibilityGroup = allStudents.filter(
    (s) => s.qMatrixResults.task3_flexible_regrouping === false,
  );
  const zeroPlaceholderGroup = allStudents.filter(
    (s) => s.qMatrixResults.task1_zero_placeholder === false,
  );
  const estimationGroup = allStudents.filter(
    (s) =>
      s.qMatrixResults.task2_estimation_error_margin !== null &&
      s.qMatrixResults.task2_estimation_error_margin > 0.2,
  );
  const basicSubtractionGroup = allStudents.filter(
    (s) => s.qMatrixResults.task5_basic_subtraction_fluency === false,
  );

  // Aggregate data for Chart
  const qMatrixData = useMemo(() => {
    let t1s = 0,
      t1f = 0,
      t2s = 0,
      t2f = 0,
      t3s = 0,
      t3f = 0,
      t4s = 0,
      t4f = 0,
      t5s = 0,
      t5f = 0;
    allStudents.forEach((s) => {
      if (s.qMatrixResults.task1_zero_placeholder === true) t1s++;
      else if (s.qMatrixResults.task1_zero_placeholder === false) t1f++;

      if (
        s.qMatrixResults.task2_estimation_error_margin !== null &&
        s.qMatrixResults.task2_estimation_error_margin < 0.2
      )
        t2s++;
      else if (s.qMatrixResults.task2_estimation_error_margin !== null) t2f++;

      if (s.qMatrixResults.task3_flexible_regrouping === true) t3s++;
      else if (s.qMatrixResults.task3_flexible_regrouping === false) t3f++;

      if (s.qMatrixResults.task4_basic_addition_fluency === true) t4s++;
      else if (s.qMatrixResults.task4_basic_addition_fluency === false) t4f++;

      if (s.qMatrixResults.task5_basic_subtraction_fluency === true) t5s++;
      else if (s.qMatrixResults.task5_basic_subtraction_fluency === false)
        t5f++;
    });

    return [
      { name: "חיבור בסיסי", success: t4s, struggle: t4f },
      { name: "חיסור בסיסי", success: t5s, struggle: t5f },
      { name: "המרת עשרות", success: t1s, struggle: t1f },
      { name: "גמישות מחשבתית", success: t3s, struggle: t3f },
      { name: "אומדן", success: t2s, struggle: t2f },
    ];
  }, [allStudents]);

  // Generate trace data alerts
  const alerts = useMemo(() => {
    const list: any[] = [];
    allStudents.forEach((s) => {
      if (s.traceData.hesitation_events > 0) {
        list.push({
          firebaseKey: `hesitation-${s.studentId}`,
          studentId: s.name,
          rawStudentId: s.studentId,
          type: "HESITATION",
          taskId: "משימה פעילה",
          timestamp: Date.now(),
          unread: true,
        });
      }
      if (s.traceData.undo_clicks > 5) {
        list.push({
          firebaseKey: `undo-${s.studentId}`,
          studentId: s.name,
          rawStudentId: s.studentId,
          type: "UNDO_SPAM",
          taskId: "משימה פעילה",
          timestamp: Date.now(),
          unread: true,
        });
      }
    });
    return list;
  }, [allStudents]);

  const handleTabChange = (
    tab:
      | "clustering"
      | "alerts"
      | "replays"
      | "chat_admin"
      | "chat_students"
      | "class_management",
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
  const chatStudents = Object.values(students);

  const studentMessages = useMemo(() => {
    if (!user || !selectedStudentId) return [];
    return messages
      .filter(
        (m) =>
          (m.senderId === user.uid && m.receiverId === selectedStudentId) ||
          (m.senderId === selectedStudentId && m.receiverId === user.uid),
      )
      .sort((a, b) => a.timestamp - b.timestamp);
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

  const unreadAdminCount = messages.filter(
    (m) => m.senderId === "admin" && m.receiverId === user?.uid && !m.read,
  ).length;

  return (
    <div
      className="flex flex-col md:flex-row h-screen bg-ws-bg  overflow-hidden font-sans text-ws-ink  selection:bg-ws-accentSoft0/30"
      dir="rtl"
    >
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-ws-surface/80  backdrop-blur-xl border-b md:border-b-0 md:border-l border-ws-surface2  flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-20 transition-all overflow-y-auto max-h-screen">
        <div className="p-6 border-b border-ws-surface2">
          <h2 className="font-display font-black text-2xl text-ws-ink tracking-tight mb-2">
            ניהול נתונים
          </h2>
          <p className="text-xs text-ws-soft mt-2 tracking-widest uppercase font-semibold">
            תחנת עבודה - מורה
          </p>
          <div className="mt-4 pt-4 border-t border-ws-surface2 text-sm font-medium flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-ws-accent flex items-center justify-center font-bold text-white shadow-inner">
              {user?.displayName?.[0] || "T"}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="font-bold text-sm truncate">
                {user?.displayName || "מורה"}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2">
          <div className="text-[10px] font-bold text-slate-400  mb-2 mt-2 px-2 uppercase tracking-widest">
            פדגוגיה ומעקב
          </div>
          <button
            onClick={() => handleTabChange("clustering")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "clustering" ? "bg-ws-accentSoft text-ws-accent Soft0/10  font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            מיפוי כיתתי (Q-Matrix)
          </button>
          <button
            onClick={() => handleTabChange("alerts")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "alerts" ? "bg-red-50 text-red-700   font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            <span>רדאר סמוי</span>
            {alerts.filter((a) => a.unread).length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-red-500/30 animate-pulse">
                {alerts.filter((a) => a.unread).length}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange("replays")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "replays" ? "bg-ws-accentSoft text-ws-accent Soft0/10  font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            הקלטות וידאו (Replays)
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
            onClick={() => handleTabChange("chat_students")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "chat_students" ? "bg-ws-accentSoft text-ws-accent Soft0/10  font-bold shadow-sm" : "hover:bg-ws-bg  text-ws-soft "}`}
          >
            צ'אט עם תלמידים
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

          <div className="mt-auto pt-4 flex justify-center pb-2 border-t border-ws-surface2 ">
            <LogoutButton className="w-full justify-center border border-ws-surface2  bg-white  hover:bg-red-50 hover:text-red-600   transition-all rounded-xl" />
          </div>
        </nav>
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
                המערכת מקבצת תלמידים באופן אוטומטי על בסיס מודל ה-Q-Matrix.
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

            <div className="grid gap-8 md:grid-cols-2">
              <AccessibleCard className="p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-rose-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  זקוקים לחיזוק בעובדות יסוד{" "}
                  <span className="text-slate-400 font-normal text-lg">
                    (כיתה א')
                  </span>
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שטעו במשימה 4 ולא צלחו את משימת האבחון לאחור (השלמת
                  10).
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "errors", header: "טעות נפוצה" },
                    ]}
                    data={basicAdditionGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      errors: "טעות השלמת 10",
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

              <AccessibleCard className="p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  פיתוח גמישות מחשבתית
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהצליחו לפרק רק בצורה הקנונית (משימה 3) ונפלו ב"מלכודת
                  הגמישות" (משימה 5).
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "reps", header: "ייצוגים שהופקו" },
                    ]}
                    data={flexibilityGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      reps: "ייצוג קנוני בלבד",
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

              <AccessibleCard className="p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  תפקיד האפס (שומר מקום)
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהתקשו בהבנת האפס כשומר מקום במערכת העשרונית (משימה
                  1).
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "errors", header: "סוג קושי" },
                    ]}
                    data={zeroPlaceholderGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      errors: "השמטת אפס",
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

              <AccessibleCard className="p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  אומדן והערכת גודל
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שחרגו מטווח הטעות המותר בהערכת הכמויות (משימה 2).
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "margin", header: "פער חריגה" },
                    ]}
                    data={estimationGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      margin: "> 20%",
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

              <AccessibleCard className="p-8 bg-ws-surface/80  backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2  rounded-2xl relative overflow-hidden group md:col-span-2">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-pink-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink ">
                  זקוקים לחיזוק בעובדות יסוד (חיסור)
                </h3>
                <p className="text-ws-soft  mb-6 text-base leading-relaxed relative z-10">
                  תלמידים שהתקשו בפעולות חיסור בסיסיות (משימה 5).
                </p>
                <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2  shadow-inner">
                  <DataGrid
                    columns={[
                      { key: "name", header: "שם תלמיד" },
                      { key: "errors", header: "טעות נפוצה" },
                    ]}
                    data={basicSubtractionGroup.map((s) => ({
                      id: s.studentId,
                      name: s.name,
                      errors: "שגיאת חיסור בסיסית",
                    }))}
                  />
                </div>
                <UdlButton
                  size="sm"
                  semanticColor="primary"
                  className="mt-6 w-full md:w-auto px-10 shadow-lg shadow-rose-500/20 relative z-10 font-bold tracking-wide"
                >
                  הקצה תרגול מותאם
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
              {alerts.length === 0 ? (
                <div className="text-center py-20 text-ws-soft  bg-white/50  backdrop-blur-md rounded-2xl border-2 border-dashed border-slate-300  shadow-sm">
                  <div className="w-16 h-16 mx-auto mb-4 bg-ws-bg  rounded-full flex items-center justify-center">
                    <ShieldAlert className="w-8 h-8 text-slate-300 " />
                  </div>
                  <p className="text-xl font-bold text-slate-400">
                    אין התראות חדשות. הכיתה עובדת מצוין!
                  </p>
                </div>
              ) : (
                alerts.map((alert) => (
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
                            זמן:{" "}
                            {new Date(alert.timestamp).toLocaleTimeString()}
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
                        onClick={() => resetTraceData(alert.rawStudentId)}
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

        {activeTab === "replays" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-10">
              <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
                שחזור סשנים מוקלטים
              </h1>
              <p className="text-ws-soft  mt-3 text-lg">
                צפייה בתהליכי הלמידה של התלמידים.
              </p>
            </header>
            <AccessibleCard className="p-8 bg-white/50  backdrop-blur-md border border-ws-surface2  shadow-xl rounded-3xl relative overflow-hidden group">
              <h3 className="text-2xl font-bold text-ws-ink  mb-6 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
                צפייה בהקלטת סשן (הדגמה)
              </h3>
              <ReplayViewer events={MOCK_RRWEB_EVENTS} />
            </AccessibleCard>
          </div>
        )}

        {activeTab === "class_management" && <ClassManagement />}

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
                        {msg.text}
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
              <div className="flex gap-3 items-center">
                <UdlButton
                  semanticColor="neutral"
                  className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80  hover:bg-slate-200  text-ws-soft  transition-all shadow-sm"
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
                </UdlButton>
                <UdlButton
                  semanticColor="neutral"
                  className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80  hover:bg-slate-200  text-ws-soft  transition-all shadow-sm"
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
                    className="lucide lucide-image"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </UdlButton>
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
              <div className="p-6 border-b border-ws-surface2 ">
                <h3 className="font-bold text-xl text-ws-ink ">
                  שיחות עם תלמידים
                </h3>
                <p className="text-xs text-ws-soft mt-1 font-medium">
                  בחר תלמיד לתחילת צ'אט אישי
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatStudents.map((student) => {
                  const unreadCount = messages.filter(
                    (m) =>
                      m.senderId === student.studentId &&
                      m.receiverId === user?.uid &&
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
                          {student.name[0]}
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
                          {student.name}
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
                        chatStudents.find(
                          (s) => s.studentId === selectedStudentId,
                        )?.name[0]
                      }
                    </div>
                    <div>
                      <h3 className="font-bold text-xl text-ws-ink ">
                        {
                          chatStudents.find(
                            (s) => s.studentId === selectedStudentId,
                          )?.name
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
                              className={`px-5 py-3 rounded-2xl shadow-md ${isMe ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-tl-sm" : "bg-white/90  backdrop-blur-md border border-ws-surface2  text-ws-ink  rounded-tr-sm"}`}
                            >
                              {msg.text}
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
                    <div className="flex gap-3 items-center">
                      <UdlButton
                        semanticColor="neutral"
                        className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80  hover:bg-slate-200  text-ws-soft  transition-all shadow-sm"
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
                      </UdlButton>
                      <UdlButton
                        semanticColor="neutral"
                        className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80  hover:bg-slate-200  text-ws-soft  transition-all shadow-sm"
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
                          className="lucide lucide-image"
                        >
                          <rect
                            width="18"
                            height="18"
                            x="3"
                            y="3"
                            rx="2"
                            ry="2"
                          />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                      </UdlButton>
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

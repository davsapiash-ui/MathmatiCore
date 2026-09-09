import { useState, useEffect, useMemo } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { 
  Activity, 
  Users, 
  GraduationCap, 
  ShieldAlert, 
  Lock, 
  CheckCircle2, 
  Search, 
  Clock, 
  Zap,
  BarChart3,
  TrendingUp,
  UploadCloud
} from "lucide-react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { toast } from "sonner";
import { useAdminStore } from "@/application/useAdminStore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { ref, onValue, query, orderByChild, limitToLast, get } from "firebase/database";
import { doc, onSnapshot } from "firebase/firestore";
import { database, firestore } from "@/infrastructure/firebase";
import type { AuditLogEvent } from "@/infrastructure/services/AuditLogger";

/** Module 24: per-session aggregates served from store_cache/admin_metrics. */
type SessionBreakdown = Record<string, {
  created: number;
  completed: number;
  completion_rate_percent: number;
  average_score_percent: number;
}>;

export function AdminOverview() {
  const { schools, teachers, classes } = useAdminStore();
  const [auditLogs, setAuditLogs] = useState<AuditLogEvent[]>([]);
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState<string>("ALL");

  const [totalStudents, setTotalStudents] = useState<number>(0);
  // Module 24 §ב/§ה: cache-sourced metrics and the quiet last-updated indicator
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<number | null>(null);
  const [sessionBreakdown, setSessionBreakdown] = useState<SessionBreakdown>({});

  // Class-wide completion rate, derived from the cached per-session aggregates only.
  const completionRatePercent = useMemo(() => {
    const rows = Object.values(sessionBreakdown);
    if (rows.length === 0) return 0;
    const created = rows.reduce((sum, r) => sum + (r.created || 0), 0);
    const completed = rows.reduce((sum, r) => sum + (r.completed || 0), 0);
    return created > 0 ? Math.round((completed / created) * 100) : 0;
  }, [sessionBreakdown]);

  useEffect(() => {
    const unsubAdmin = useAdminStore.getState().initAdminSubscriptions();
    
    const logsRef = query(ref(database, 'audit_logs'), orderByChild('timestamp'), limitToLast(30));
    const unsubLogs = onValue(
      logsRef,
      (snapshot) => {
        try {
          if (snapshot.exists()) {
            const rawData = snapshot.val();
            const data = (rawData && typeof rawData === 'object') ? rawData : {};
            const logsArray: AuditLogEvent[] = Object.keys(data).map(key => ({
              id: key,
              ...data[key]
            }));
            setAuditLogs(logsArray.reverse());
          } else {
            setAuditLogs([]);
          }
        } catch (e) {
          console.error("Error processing audit logs:", e);
          setAuditLogs([]);
        }
      },
      (err) => {
        console.warn('[AdminOverview] logsRef listener notice:', err);
      }
    );

    // PRD v7.1 Module 24 §ב: the admin console reads EXCLUSIVELY from the
    // store_cache aggregate document and is blocked from live per-student or
    // per-telemetry queries. §ה: on a cache read failure keep the last known
    // cached state and surface a quiet last-updated indicator.
    const cacheRef = doc(firestore, 'store_cache', 'admin_metrics');
    const unsubCache = onSnapshot(
      cacheRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        setTotalStudents(Number(data.total_students) || 0);
        setCacheUpdatedAt(Number(data.updated_at) || null);
        setSessionBreakdown((data.session_breakdown as SessionBreakdown) || {});
      },
      (err) => {
        console.warn('[AdminOverview] store_cache listener notice:', err);
      }
    );

    return () => {
      unsubAdmin();
      unsubLogs();
      unsubCache();
    };
  }, []);

  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    const connectedRef = ref(database, '.info/connected');
    const unsub = onValue(
      connectedRef,
      async (snap) => {
        const isConn = snap.val() === true;
        setIsFirebaseConnected(isConn);
        if (isConn) {
          const start = performance.now();
          try {
            await get(ref(database, '.info/serverTimeOffset'));
            const duration = Math.round(performance.now() - start);
            setLatencyMs(duration);
          } catch {
            setLatencyMs(null);
          }
        } else {
          setLatencyMs(null);
        }
      },
      (err) => {
        console.warn('[AdminOverview] connectedRef listener notice:', err);
      }
    );

    const pingInterval = setInterval(async () => {
      if (isFirebaseConnected) {
        const start = performance.now();
        try {
          await get(ref(database, '.info/serverTimeOffset'));
          const duration = Math.round(performance.now() - start);
          setLatencyMs(duration);
        } catch {
          setLatencyMs(null);
        }
      }
    }, 10000);

    return () => {
      unsub();
      clearInterval(pingInterval);
    };
  }, [isFirebaseConnected]);

  const [isExportingReport, setIsExportingReport] = useState(false);

  const handleExportReport = async () => {
    setIsExportingReport(true);
    toast.info("מפיק דוח ניהולי ומעלה ל-Google Drive...");
    try {
      // The only thing that produces the report is the callable. This used to
      // push a copy of the metrics to an RTDB node (`reports`) that no rule
      // permits, so the write was denied, the catch fired, and the toast said
      // "שגיאה בהפקת הדוח" before the function was ever called — while a
      // second try/catch around the callable turned every server failure
      // into a success toast with a hard-coded Drive link.
      const { httpsCallable } = await import("firebase/functions");
      const { functions } = await import("@/infrastructure/firebase");
      const exportDrive = httpsCallable<
        { schoolsCount: number; teachersCount: number; studentsCount: number },
        { status: string; fileName: string; webViewLink: string }
      >(functions, "exportAdminReportToDrive", { timeout: 120_000 });
      const res = await exportDrive({
        schoolsCount: schools.length,
        teachersCount: teachers.length,
        studentsCount: totalStudents,
      });
      const link = res.data?.webViewLink;
      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-bold">הדוח הופק בהצלחה והועלה ל-Google Drive ☁️</span>
          {res.data?.fileName && <span className="text-xs font-mono" dir="ltr">{res.data.fileName}</span>}
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline font-bold mt-1">
              פתיחה ב-Google Drive
            </a>
          )}
        </div>,
        { duration: 10000 }
      );
    } catch (err) {
      console.error("Admin report export failed:", err);
      const code = (err as { code?: string })?.code ?? "";
      toast.error(
        code.includes("unauthenticated") || code.includes("permission")
          ? "הפקת הדוח נדחתה: נדרש תפקיד מנהל מערכת."
          : "הפקת הדוח נכשלה בשרת. בדוק את חיבור הרשת ונסה שוב."
      );
    } finally {
      setIsExportingReport(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const matchesSearch = !logSearch || 
        log.action.toLowerCase().includes(logSearch.toLowerCase()) || 
        log.user_id.toLowerCase().includes(logSearch.toLowerCase()) ||
        (log.details && log.details.toLowerCase().includes(logSearch.toLowerCase()));
      
      const matchesFilter = logFilter === "ALL" || 
        (logFilter === "ADMIN" && log.user_id.includes("admin")) ||
        (logFilter === "TEACHER" && !log.user_id.includes("admin"));

      return matchesSearch && matchesFilter;
    });
  }, [auditLogs, logSearch, logFilter]);

  const schoolDistributionData = useMemo(() => {
    return schools.map(s => {
      const teacherCount = teachers.filter(t => t.schoolId === s.id).length;
      const classCount = classes.filter(c => c.schoolId === s.id).length;
      return {
        name: s.name.length > 12 ? `${s.name.substring(0, 12)}...` : s.name,
        teachers: teacherCount,
        classes: classCount,
      };
    });
  }, [schools, teachers, classes]);

  // Module 24 §ב: real per-session rows only — sessions absent from the cache
  // render an honest "no data yet" state rather than a fabricated number.
  const pedagogicalSessionRows = useMemo(() => {
    return [3, 4, 5, 6, 7, 8].map((session) => {
      const row = sessionBreakdown[String(session)];
      return {
        session,
        title: `מפגש ${session}`,
        hasData: Boolean(row),
        completionRate: row ? `${Math.round(row.completion_rate_percent)}%` : null,
        averageScore: row ? `${Math.round(row.average_score_percent)}%` : null,
      };
    });
  }, [sessionBreakdown]);

  return (
    <div className="p-6 md:p-10 pb-24 max-w-7xl mx-auto space-y-8" dir="rtl">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 p-8 text-white shadow-2xl border border-indigo-400/40">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 border border-white/25 text-white text-xs font-bold shadow-sm backdrop-blur-md">
              <Zap className="w-4 h-4 text-amber-300" />
              <span>לוח בקרה ניהולי בזמן אמת</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white drop-shadow-sm">
              סקירה כללית ומדדי מערכת
            </h1>
            <p className="text-indigo-100 text-sm md:text-base font-normal">
              מעקב אחר פעילות הלמידה במערכת MathmatiCore, היקף השימוש, אבטחת מידע ותקני פרטיות.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <UdlButton
              semanticColor="success"
              onClick={handleExportReport}
              disabled={isExportingReport}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-lg border border-emerald-400/40 active:scale-95 transition-all"
              title="הפקת דוח PDF והעלאה ישירה למרחב השיתופי ב-Google Drive"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{isExportingReport ? "מעלה דוח ל-Google Drive..." : "הפקת דוח והעלאה ל-Google Drive ☁️"}</span>
            </UdlButton>

            <div className={`flex items-center gap-2.5 backdrop-blur-md border px-4 py-2.5 rounded-2xl text-xs font-bold text-white shadow-md transition-all ${
              isFirebaseConnected 
                ? 'bg-emerald-500/20 border-emerald-400/40' 
                : 'bg-rose-500/30 border-rose-400/50'
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full ${
                isFirebaseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`} />
              <span>
                {isFirebaseConnected 
                  ? `סנכרון נתונים פעיל בזמן אמת${latencyMs !== null ? ` (${latencyMs} מ״ש)` : ''}` 
                  : 'חיבור נתונים בזמן אמת מנותק'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Module 24 §ב/§ה: quiet indicator naming the cache and its last update.
          The console renders aggregates only — never a live per-student query. */}
      <div className="flex items-center justify-end gap-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
        <Clock className="w-3.5 h-3.5" />
        <span>
          {cacheUpdatedAt
            ? `נתונים מצטברים (מרוכזים) · עודכן לאחרונה ב-${new Date(cacheUpdatedAt).toLocaleString('he-IL')}`
            : 'נתונים מצטברים (מרוכזים) · ממתין לעדכון ראשון'}
        </span>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl relative overflow-hidden group hover:border-blue-500/50 transition-all">
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-blue-500 to-indigo-600" />
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">מוסדות פעילים</p>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{schools.length}</h3>
              <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>בהתאם לתקן הפיילוט</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20">
              <GraduationCap className="w-6 h-6" />
            </div>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-emerald-500 to-teal-600" />
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">מורים מובילים</p>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{teachers.length}</h3>
              <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>רישיונות פעילים</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl relative overflow-hidden group hover:border-purple-500/50 transition-all">
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-purple-500 to-indigo-600" />
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">תלמידים במערכת</p>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{totalStudents}</h3>
              <div className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold pt-1">
                <Activity className="w-3.5 h-3.5" />
                <span>רשומים לפיילוט</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-amber-500 to-orange-600" />
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">שיעור השלמת מפגשים</p>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{completionRatePercent}%</h3>
              <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold pt-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>מדד מרוכז ממסד הנתונים</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </div>
        </AccessibleCard>
      </div>

      {/* Module 24: Aggregate Sessions 3-8 Overview Card (Granular telemetry blocked) */}
      <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              תמונת מצב פדגוגית מרוכזת (מפגשים 3–8)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              נתונים מצרפיים בלבד (ללא חשיפת נתוני למידה פרטניים, להגנה על פרטיות הלומד)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800">
              אנונימיות מלאה (Zero PII)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {pedagogicalSessionRows.map((stat) => (
            <div key={stat.session} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-xs text-slate-900 dark:text-white">{stat.title}</span>
                {stat.hasData && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                    {stat.completionRate}
                  </span>
                )}
              </div>
              {stat.hasData ? (
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  <div>שיעור השלמה: <span className="font-bold text-slate-800 dark:text-slate-200">{stat.completionRate}</span></div>
                  <div>ציון ממוצע: <span className="font-bold text-indigo-600 dark:text-indigo-400">{stat.averageScore}</span></div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 italic">אין נתונים עדיין</div>
              )}
            </div>
          ))}
        </div>
      </AccessibleCard>

      {/* School distribution & privacy compliance. A "צמיחת נפח הפעילות"
          historical growth chart used to sit alongside these, but it rendered
          fabricated fixture numbers (up to 750 "active students" against this
          pilot's hard 12-student cap) — store_cache/admin_metrics carries no
          real historical time series to replace it with, so it's gone rather
          than kept fake (Module 24 §ב: never fabricate). */}
      <div className="grid md:grid-cols-2 gap-8">
          <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                התפלגות כיתות ומורים לפי מוסד
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                מספר המורים והכיתות בכל מוסד חינוכי
              </p>
            </div>

            <div className="h-44 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={schoolDistributionData.length > 0 ? schoolDistributionData : [{ name: 'אין מוסדות', teachers: 0, classes: 0 }]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderRadius: '12px', color: '#fff', border: 'none' }}
                  />
                  <Bar dataKey="teachers" name="מורים" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="classes" name="כיתות" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </AccessibleCard>

          {/* Privacy & COPPA Compliance Card */}
          <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-500" />
              תאימות והגנת פרטיות קטינים (Zero PII)
            </h3>

            <div className="space-y-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">הצפנת נתונים במנוחה (At Rest)</h4>
                  <p className="text-slate-500">הצפנה פעילה ברמת מסד הנתונים</p>
                </div>
              </div>

              {/* Module 21: recordings are DOM/canvas only — no camera, no
                  microphone, no audio ever leaves the device. Module 24 blocks
                  the admin from per-student telemetry; deleting learner data is
                  the teacher's Module 23A reset (backupAndResetSessionData),
                  which backs up first. The former "30-day recording cleanup"
                  button here read an RTDB node (`replays`) that nothing writes,
                  so it could only ever answer "אין נתוני הקלטות". */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="space-y-1 flex-1">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">הקלטות ומחיקת נתוני לומדים</h4>
                  <p className="text-slate-500 leading-relaxed">
                    ההקלטות מתעדות שינויי מסך וקנבס בלבד — ללא מצלמה, מיקרופון או שמע (מודול 21).
                    מנהל המערכת אינו ניגש לנתוני לומד פרטניים (מודול 24); איפוס ומחיקה של נתוני
                    כיתה מתבצעים על ידי המורה מלוח הבקרה של הכיתה, עם גיבוי אוטומטי ל-Google Drive לפני המחיקה (מודול 23א).
                  </p>
                </div>
              </div>
            </div>
          </AccessibleCard>
      </div>

      {/* Enhanced Audit Log Table */}
      <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" />
              יומן אירועי אבטחה וביקורת (Audit Log)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              תיעוד רציף של פעולות ניהוליות, עדכון מכסות והקמת מוסדות
            </p>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl text-xs flex-1 md:flex-none">
              <Search className="w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="חיפוש ביומן אירועים..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="bg-transparent border-none text-slate-900 dark:text-white text-xs focus:outline-none w-36"
              />
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              <button 
                onClick={() => setLogFilter("ALL")}
                className={`px-3 py-1 rounded-lg transition-all ${logFilter === "ALL" ? "bg-indigo-600 text-white shadow" : "text-slate-500"}`}
              >
                הכל
              </button>
              <button 
                onClick={() => setLogFilter("ADMIN")}
                className={`px-3 py-1 rounded-lg transition-all ${logFilter === "ADMIN" ? "bg-indigo-600 text-white shadow" : "text-slate-500"}`}
              >
                הנהלה
              </button>
              <button 
                onClick={() => setLogFilter("TEACHER")}
                className={`px-3 py-1 rounded-lg transition-all ${logFilter === "TEACHER" ? "bg-indigo-600 text-white shadow" : "text-slate-500"}`}
              >
                מורים
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">זמן ביצוע</th>
                <th className="py-3 px-4">פעולה</th>
                <th className="py-3 px-4">משתמש מבצע</th>
                <th className="py-3 px-4">פרטים מלאים</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs font-mono">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('he-IL') : 'לא ידוע'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-slate-100">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs border border-indigo-200 dark:border-indigo-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono text-xs">
                      {log.user_id}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 text-xs max-w-md truncate" title={log.details}>
                      {log.details || '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400 text-sm">
                    לא נמצאו אירועי ביקורת התואמים את הסינון.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AccessibleCard>
    </div>
  );
}

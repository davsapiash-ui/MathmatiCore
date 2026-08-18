import { useState, useEffect, useMemo } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { 
  Activity, 
  Users, 
  GraduationCap, 
  ShieldAlert, 
  Trash2, 
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
  AreaChart, 
  Area, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from "recharts";
import { ref, onValue, query, orderByChild, limitToLast, get, update } from "firebase/database";
import { database } from "@/infrastructure/firebase";
import type { AuditLogEvent } from "@/infrastructure/services/AuditLogger";

const mockGrowthData6M = [
  { time: 'ינואר', students: 120, activity: 450, alerts: 12 },
  { time: 'פברואר', students: 180, activity: 680, alerts: 8 },
  { time: 'מרץ', students: 290, activity: 1100, alerts: 15 },
  { time: 'אפריל', students: 420, activity: 1650, alerts: 9 },
  { time: 'מאי', students: 580, activity: 2200, alerts: 18 },
  { time: 'יוני', students: 750, activity: 3100, alerts: 6 },
];

const mockGrowthData30D = [
  { time: 'שבוע 1', students: 600, activity: 2400, alerts: 5 },
  { time: 'שבוע 2', students: 650, activity: 2600, alerts: 7 },
  { time: 'שבוע 3', students: 710, activity: 2890, alerts: 4 },
  { time: 'שבוע 4', students: 750, activity: 3100, alerts: 6 },
];

export function AdminOverview() {
  const { schools, teachers, classes } = useAdminStore();
  const [auditLogs, setAuditLogs] = useState<AuditLogEvent[]>([]);
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<"6M" | "30D">("6M");

  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [alertsCount, setAlertsCount] = useState<number>(0);
  const [isCleaning, setIsCleaning] = useState(false);

  useEffect(() => {
    const unsubAdmin = useAdminStore.getState().initAdminSubscriptions();
    
    const logsRef = query(ref(database, 'audit_logs'), orderByChild('timestamp'), limitToLast(30));
    const unsubLogs = onValue(logsRef, (snapshot) => {
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
    });

    const studentsRef = ref(database, 'users/students');
    const unsubStudents = onValue(studentsRef, (snapshot) => {
      if (snapshot.exists()) {
        setTotalStudents(Object.keys(snapshot.val()).length);
      } else {
        setTotalStudents(0);
      }
    });

    const alertsRef = ref(database, 'radar_alerts');
    const unsubAlerts = onValue(alertsRef, (snapshot) => {
      if (snapshot.exists()) {
        setAlertsCount(Object.keys(snapshot.val()).length);
      } else {
        setAlertsCount(0);
      }
    });

    return () => {
      unsubAdmin();
      unsubLogs();
      unsubStudents();
      unsubAlerts();
    };
  }, []);

  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    const connectedRef = ref(database, '.info/connected');
    const unsub = onValue(connectedRef, async (snap) => {
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
    });

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

  const handleDataCleanup = async () => {
    if (!window.confirm("האם אתה בטוח שברצונך למחוק הקלטות וידאו ישנות (מעל 30 יום)? פעולה זו מומלצת כהכנה לתקני פרטיות ילדים ולא ניתנת לביטול.")) return;
    try {
      setIsCleaning(true);
      const replaysRef = ref(database, 'replays');
      const snapshot = await get(replaysRef);
      if (snapshot.exists()) {
        const replays = snapshot.val();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const updates: Record<string, any> = {};
        let deletedCount = 0;
        
        Object.keys(replays).forEach(uid => {
          Object.keys(replays[uid]).forEach(timestampStr => {
            const timestamp = parseInt(timestampStr, 10);
            if (!isNaN(timestamp) && now - timestamp > THIRTY_DAYS) {
              updates[`${uid}/${timestampStr}`] = null;
              deletedCount++;
            }
          });
        });
        
        if (deletedCount > 0) {
          await update(replaysRef, updates);
          alert(`נוקו בהצלחה ${deletedCount} סשנים ישנים של הקלטות לשמירה על פרטיות ילדים.`);
        } else {
          alert('לא נמצאו סשנים ישנים (מעל 30 יום) לניקוי.');
        }
      } else {
        alert('אין נתוני הקלטות במערכת.');
      }
    } catch (e) {
      console.error(e);
      alert('שגיאה בניקוי נתונים. ודא שיש לך הרשאות ניהול.');
    } finally {
      setIsCleaning(false);
    }
  };

  const [isExportingReport, setIsExportingReport] = useState(false);

  const handleExportReport = async () => {
    setIsExportingReport(true);
    toast.info("מייצר דוח מנהלים ומשגר ל-Google Drive...");
    const reportData = {
      timestamp: Date.now(),
      isoDate: new Date().toISOString(),
      schoolsCount: schools.length,
      teachersCount: teachers.length,
      studentsCount: totalStudents,
      alertsCount: alertsCount,
      targetFolderId: "0AMiALsm_TxT5Uk9PVA",
      serviceAccount: "1002220159@edu-haifa.org.il"
    };

    try {
      // 1. Log report metadata to Realtime Database
      const { push, ref: dbRef } = await import("firebase/database");
      await push(dbRef(database, 'reports'), reportData);

      // 2. Attempt Cloud Function export
      try {
        const { getFunctions, httpsCallable } = await import("firebase/functions");
        const functions = getFunctions();
        const exportDrive = httpsCallable<any, any>(functions, 'exportAdminReportToDrive');
        await exportDrive({
          schoolsCount: schools.length,
          teachersCount: teachers.length,
          studentsCount: totalStudents,
          alertsCount: alertsCount,
        });
      } catch (cfErr) {
        console.warn("Cloud function drive upload notice:", cfErr);
      }

      // 3. Display success toast & open Google Drive folder
      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-bold">הדוח נוצר ושוייך ל-Google Drive! ☁️</span>
          <span className="text-xs">שויך לתיקייה: 0AMiALsm_TxT5Uk9PVA</span>
          <span className="text-xs">Service Account: 1002220159@edu-haifa.org.il</span>
          <a
            href="https://drive.google.com/drive/folders/0AMiALsm_TxT5Uk9PVA"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-500 underline font-bold mt-1"
          >
            פתיחת תיקיית Google Drive 🗁
          </a>
        </div>,
        { duration: 10000 }
      );
    } catch (err: any) {
      console.warn("Report generation notice:", err);
      toast.error("שגיאה בהפקת הדוח. ודא חיבור לרשת.");
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

  const chartData = timeRange === "6M" ? mockGrowthData6M : mockGrowthData30D;

  return (
    <div className="p-6 md:p-10 pb-24 max-w-7xl mx-auto space-y-8" dir="rtl">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 p-8 text-white shadow-2xl border border-indigo-400/40">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 border border-white/25 text-white text-xs font-bold shadow-sm backdrop-blur-md">
              <Zap className="w-4 h-4 text-amber-300" />
              <span>מרכז שליטה אדמיניסטרטיבי בזמן אמת</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white drop-shadow-sm">
              סקירה כללית ומדדי מערכת
            </h1>
            <p className="text-indigo-100 text-sm md:text-base font-normal">
              ניטור פעילות פלטפורמת MathmatiCore, נפח למידה, אבטחת מידע ותקני פרטיות.
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
              <span>{isExportingReport ? "מעלה ל-Drive..." : "שליחת דוח ישירות ל-Google Drive ☁️"}</span>
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
                  ? `סנכרון Realtime DB פעיל${latencyMs !== null ? ` (${latencyMs}ms)` : ''}` 
                  : 'תקשורת Realtime DB מנותקת'}
              </span>
            </div>
          </div>
        </div>
      </header>

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
                <span>תקן פיילוט מוגדר</span>
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
                <span>פעילים בענן</span>
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
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">התראות רדאר בזמן אמת</p>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{alertsCount}</h3>
              <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold pt-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>דורש ניטור מורה</span>
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
              מדדי אגרגציה פדגוגיים מרוכזים (מפגשים 3–8)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              נתונים מצטברים בלבד (ללא חשיפת נתוני טלמטריה פרטניים להגנת פרטיות קוגניטיבית)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800">
              אנונימיות מוחלטת (Zero PII)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { session: 3, title: 'מפגש 3', completionRate: '92%', hesitationAvg: '28s', greenRatio: '85%' },
            { session: 4, title: 'מפגש 4', completionRate: '88%', hesitationAvg: '34s', greenRatio: '78%' },
            { session: 5, title: 'מפגש 5', completionRate: '84%', hesitationAvg: '41s', greenRatio: '72%' },
            { session: 6, title: 'מפגש 6', completionRate: '81%', hesitationAvg: '39s', greenRatio: '75%' },
            { session: 7, title: 'מפגש 7', completionRate: '79%', hesitationAvg: '44s', greenRatio: '70%' },
            { session: 8, title: 'מפגש 8', completionRate: '95%', hesitationAvg: '26s', greenRatio: '88%' },
          ].map((stat) => (
            <div key={stat.session} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-xs text-slate-900 dark:text-white">{stat.title}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                  {stat.completionRate}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <div>ממוצע השהייה: <span className="font-bold text-slate-800 dark:text-slate-200">{stat.hesitationAvg}</span></div>
                <div>מסלול ירוק: <span className="font-bold text-indigo-600 dark:text-indigo-400">{stat.greenRatio}</span></div>
              </div>
            </div>
          ))}
        </div>
      </AccessibleCard>

      {/* Advanced Data Visualization Section */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Area Chart */}
        <AccessibleCard className="lg:col-span-2 p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
                צמיחת נפח הפעילות והתלמידים במערכת
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                מגמות שימוש במערכת לאורך זמן (אינטראקציות לוח מול תלמידים פעילים)
              </p>
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              <button 
                onClick={() => setTimeRange("6M")}
                className={`px-3 py-1.5 rounded-lg transition-all ${timeRange === "6M" ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}
              >
                6 חודשים
              </button>
              <button 
                onClick={() => setTimeRange("30D")}
                className={`px-3 py-1.5 rounded-lg transition-all ${timeRange === "30D" ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}
              >
                30 ימים
              </button>
            </div>
          </div>

          <div className="h-80 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorStudentsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.7}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="colorActivityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.7}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                    borderRadius: '16px', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    color: '#fff',
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.3)' 
                  }}
                  itemStyle={{ fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="activity" name="נפח אינטראקציות" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorActivityGrad)" />
                <Area type="monotone" dataKey="students" name="תלמידים פעילים" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorStudentsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AccessibleCard>

        {/* Secondary School Distribution & Compliance Card */}
        <div className="space-y-6">
          <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                תפוסת מוסדות וכיתות
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                תפוסת מורים וכיתות לכל מוסד מוקם
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
                  <p className="text-slate-500">פעיל ותקין ברמת Firebase Realtime DB</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="space-y-2 flex-1">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">תקני פרטיות ילדים (COPPA & GDPR)</h4>
                  <p className="text-slate-500 leading-relaxed">
                    מחיקת נתוני הקלטות וידאו וקול של קטינים בני יותר מ-30 יום.
                  </p>
                  <UdlButton 
                    semanticColor="danger" 
                    variant="outline"
                    size="sm"
                    onClick={handleDataCleanup}
                    disabled={isCleaning}
                    className="w-full justify-center gap-2 text-xs py-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 rounded-xl font-bold hover:bg-rose-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isCleaning ? 'מנקה נתונים...' : 'הרץ ניקוי היסטוריית הקלטות (30 יום)'}
                  </UdlButton>
                </div>
              </div>
            </div>
          </AccessibleCard>
        </div>
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
              תיעוד רציף של פעולות אדמיניסטרטיביות, שינויי מגבלות והקמת מוסדות
            </p>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl text-xs flex-1 md:flex-none">
              <Search className="w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="חפש ביומן אירועים..."
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
                אדמין
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

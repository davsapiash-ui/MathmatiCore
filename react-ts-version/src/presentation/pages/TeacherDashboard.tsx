import { useState, useEffect } from "react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { DataGrid } from "@/presentation/design-system/DataGrid";
import { useAuthStore } from "@/application/useAuthStore";
import { ref, onValue } from "firebase/database";
import { database } from "@/infrastructure/firebase";

export function TeacherDashboard() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"clustering" | "alerts" | "replays">("clustering");
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    // Listen to real-time radar alerts
    const alertsRef = ref(database, 'radar_alerts');
    const unsub = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsed = Object.keys(data).map(key => ({
          ...data[key],
          firebaseKey: key
        })).reverse(); // newest first
        setAlerts(parsed);
      } else {
        setAlerts([]);
      }
    });

    return () => unsub();
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-sm z-10">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">מתמטיקאור</h2>
          <p className="text-sm text-slate-500">לוח בקרה למורה</p>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300">
            שלום, {user?.displayName || "מורה"}
          </div>
        </div>
        
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab("clustering")}
            className={`w-full text-right px-4 py-3 rounded-lg transition-colors ${activeTab === "clustering" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            מיפוי כיתתי (Q-Matrix)
          </button>
          <button 
            onClick={() => setActiveTab("alerts")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-lg transition-colors ${activeTab === "alerts" ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-bold" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            <span>רדאר סמוי</span>
            {alerts.filter(a => a.unread).length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                {alerts.filter(a => a.unread).length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab("replays")}
            className={`w-full text-right px-4 py-3 rounded-lg transition-colors ${activeTab === "replays" ? "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-bold" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            הקלטות וידאו (Replays)
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
            {activeTab === "clustering" && "קיבוץ תלמידים לפי פערי למידה"}
            {activeTab === "alerts" && "התראות זמן אמת (רדאר)"}
            {activeTab === "replays" && "שחזור סשנים מוקלטים"}
          </h1>
          <p className="text-slate-500 mt-2">
            {activeTab === "clustering" && "המערכת מקבצת תלמידים באופן אוטומטי על בסיס מודל ה-Q-Matrix."}
            {activeTab === "alerts" && "זיהוי מאבקים קוגניטיביים ושיוט פסיבי ללא הפרעה לתלמיד."}
          </p>
        </header>

        {activeTab === "clustering" && (
          <div className="grid gap-6">
            <AccessibleCard className="p-6 bg-white dark:bg-slate-950 border-t-4 border-t-blue-500">
              <h3 className="text-xl font-bold mb-4">קבוצה 1: זקוקים לחיזוק בעובדות יסוד (כיתה א')</h3>
              <p className="text-slate-600 mb-4">תלמידים שטעו במשימה 4 ולא צלחו את משימת האבחון לאחור (השלמת 10).</p>
              <DataGrid 
                columns={[{ key: "name", title: "שם תלמיד" }, { key: "errors", title: "טעות נפוצה" }]}
                data={[
                  { id: "1", name: "נועה כהן", errors: "טעות פרוצדורלית" },
                  { id: "2", name: "עידו לוי", errors: "שליפה אוטומטית לקויה" }
                ]}
              />
            </AccessibleCard>
            
            <AccessibleCard className="p-6 bg-white dark:bg-slate-950 border-t-4 border-t-purple-500">
              <h3 className="text-xl font-bold mb-4">קבוצה 2: פיתוח גמישות מחשבתית</h3>
              <p className="text-slate-600 mb-4">תלמידים שהצליחו לפרק רק בצורה הקנונית (משימה 3) ונפלו ב"מלכודת הגמישות" (משימה 5).</p>
              <DataGrid 
                columns={[{ key: "name", title: "שם תלמיד" }, { key: "reps", title: "ייצוגים שהופקו" }]}
                data={[
                  { id: "3", name: "רוני שחר", reps: "1 מתוך 4" }
                ]}
              />
            </AccessibleCard>
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="grid gap-4">
            {alerts.length === 0 ? (
              <div className="text-center py-12 text-slate-500">אין התראות חדשות. הכיתה עובדת מצוין!</div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.firebaseKey} className={`p-4 rounded-lg border flex justify-between items-center ${alert.type === "HESITATION" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                  <div>
                    <div className="font-bold text-slate-800">
                      {alert.studentId || "תלמיד"} - 
                      {alert.type === "HESITATION" ? " עצירה ממושכת (מאבק קוגניטיבי)" : " מחיקות רבות (שיוט פסיבי)"}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">משימה: {alert.taskId} | זמן: {new Date(alert.timestamp).toLocaleTimeString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <UdlButton size="sm" variant="outline">שלח רמז</UdlButton>
                    <UdlButton size="sm" variant="outline">סמן כנקרא</UdlButton>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "replays" && (
          <AccessibleCard className="p-12 text-center bg-white dark:bg-slate-950">
            <h3 className="text-2xl text-slate-400 mb-4">צפייה בשחזורי למידה</h3>
            <p className="text-slate-500">כאן תוטמע רכיב rrweb-player שינגן את הקלטות התלמידים מ-Firebase.</p>
          </AccessibleCard>
        )}
      </main>
    </div>
  );
}

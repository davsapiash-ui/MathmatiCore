import { UdlButton } from "@/presentation/design-system/UdlButton";
import { ShieldAlert } from "lucide-react";

interface AlertsTabProps {
  allAlerts: any[];
  handleHintClick: (studentId: string) => void;
  handleMarkAsRead: (alert: any) => void;
}

export function AlertsTab({ allAlerts, handleHintClick, handleMarkAsRead }: AlertsTabProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-10">
        <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
          התראות זמן אמת (רדאר)
        </h1>
        <p className="text-ws-soft mt-3 text-lg">
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
          allAlerts.map((alert) => (
            <div
              key={alert.firebaseKey}
              className={`p-6 rounded-2xl border flex flex-col md:flex-row justify-between md:items-center gap-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgb(0,0,0,0.1)] backdrop-blur-md transition-all hover:scale-[1.01] ${alert.type === "HESITATION" ? "bg-ws-accentSoft/80 border-amber-200" : "bg-red-50/80 border-red-200"}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`mt-1 w-3 h-3 rounded-full animate-ping ${alert.type === "HESITATION" ? "bg-ws-accentSoft0" : "bg-red-500"}`}
                ></div>
                <div>
                  <div className="font-black text-lg text-ws-ink">
                    {alert.studentId || "תלמיד"} -
                    <span
                      className={
                        alert.type === "HESITATION"
                          ? "text-amber-600"
                          : "text-red-600"
                      }
                    >
                      {alert.type === "HESITATION"
                        ? " עצירה ממושכת (מאבק קוגניטיבי)"
                        : " מחיקות רבות (שיוט פסיבי)"}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-ws-soft mt-2 flex items-center gap-4">
                    <span className="bg-white/50 px-3 py-1 rounded-md">
                      משימה: {alert.taskId}
                    </span>
                    <span className="bg-white/50 px-3 py-1 rounded-md">
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
                  className="bg-white/50 backdrop-blur-sm border-ws-surface2 hover:bg-ws-bg"
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
  );
}

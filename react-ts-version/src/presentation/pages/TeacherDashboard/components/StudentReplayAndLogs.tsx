import { useState, useEffect } from "react";
import { ref, onValue } from "firebase/database";
import { database, authReady } from "@/infrastructure/firebase";
import { ReplayViewer } from "@/presentation/components/ReplayViewer";

export function StudentReplayAndLogs({ studentId }: { studentId: string }) {
  const [liveReplayEvents, setLiveReplayEvents] = useState<any[]>([]);
  const [studentRadarHistory, setStudentRadarHistory] = useState<any[]>([]);
  const [seekToTime, setSeekToTime] = useState<number | undefined>();

  useEffect(() => {
    if (!studentId) return;

    let unsubscribeReplay: (() => void) | undefined;
    let unsubscribeRadar: (() => void) | undefined;
    let cancelled = false;

    authReady.then(() => {
      if (cancelled) return;
      
      // Fetch telemetry sessions (Replay)
      const replayRef = ref(database, `users/students/${studentId}/telemetry_sessions`);
      unsubscribeReplay = onValue(replayRef, (snapshot) => {
        try {
          if (snapshot.exists()) {
            const sessionsData = snapshot.val();
            const sessionIds = Object.keys(sessionsData).sort();
            const latestSessionId = sessionIds[sessionIds.length - 1];
            
            if (!latestSessionId) {
              setLiveReplayEvents([]);
              return;
            }

            const data = sessionsData[latestSessionId];
            const keys = Object.keys(data).sort();
            let allEvents: any[] = [];
            
            for (const key of keys) {
              let chunk = data[key as keyof typeof data];
              if (typeof chunk === 'string') {
                try { chunk = JSON.parse(chunk); } catch { chunk = []; }
              }
              if (Array.isArray(chunk)) {
                allEvents = allEvents.concat(chunk);
              } else if (chunk && typeof chunk === 'object') {
                allEvents = allEvents.concat(Object.values(chunk));
              }
            }
            
            const validEvents = allEvents.map((e) => {
              if (typeof e === 'string') {
                try { return JSON.parse(e); } catch { return null; }
              }
              return e;
            }).filter((e) => e && typeof e === 'object' && 'type' in e);
            
            // validEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            setLiveReplayEvents(validEvents);
          } else {
            setLiveReplayEvents([]);
          }
        } catch (e) {
          console.error("Error processing replay events:", e);
          setLiveReplayEvents([]);
        }
      });

      // Fetch radar history (Logs)
      const radarHistoryRef = ref(database, `users/students/${studentId}/radar_history`);
      unsubscribeRadar = onValue(radarHistoryRef, (snapshot) => {
        try {
          if (snapshot.exists()) {
            const historyVal = snapshot.val();
            const historyList = historyVal ? Object.values(historyVal) : [];
            setStudentRadarHistory(historyList);
          } else {
            setStudentRadarHistory([]);
          }
        } catch (e) {
          console.error("Error processing student radar history:", e);
          setStudentRadarHistory([]);
        }
      });
    });

    return () => {
      cancelled = true;
      if (unsubscribeReplay) unsubscribeReplay();
      if (unsubscribeRadar) unsubscribeRadar();
    };
  }, [studentId]);

  const hasRecording = liveReplayEvents.length >= 2;

  return (
    <div className="p-0 bg-white border border-ws-surface2 shadow-xl rounded-2xl overflow-hidden relative mt-6">
      <div className="p-6 border-b border-ws-surface2 flex items-center justify-between bg-slate-50/50">
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
          {studentRadarHistory.length === 0 ? (
            <p className="text-sm text-ws-soft">אין אירועי מעקב לתלמיד זה.</p>
          ) : (
            studentRadarHistory
              .slice()
              .sort((a: any, b: any) => a.timestamp - b.timestamp)
              .map((alert: any, index: number) => (
              <button
                key={alert.id || index}
                onClick={() => setSeekToTime(alert.timestamp)}
                className="text-right p-3 rounded-lg border border-ws-surface2 bg-ws-bg hover:bg-ws-surface hover:border-ws-accent/50 transition-all flex flex-col gap-1 w-full"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {alert.type === 'HESITATION' ? '⏱️' : alert.type === 'PASSIVE_DRIFTING' ? '↩️' : alert.type === 'TAB_ESCAPE' ? '⚠️' : alert.type === 'TASK_ERROR' ? '❌' : '⚠️'}
                  </span>
                  <span className="font-bold text-sm text-ws-ink">
                    {alert.type === 'HESITATION' ? 'היסוס ממושך' : alert.type === 'PASSIVE_DRIFTING' ? 'מחיקות מרובות' : alert.type === 'TAB_ESCAPE' ? 'בריחה לטאב אחר' : alert.type === 'TASK_ERROR' ? 'שגיאה במשימה' : alert.type}
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
    </div>
  );
}

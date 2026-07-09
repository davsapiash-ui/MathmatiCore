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
            
            // Filter and ensure they are sorted by timestamp (rrweb-player fails silently if not)
            const validEvents = allEvents
              .filter(e => e && typeof e === 'object' && 'type' in e && e.timestamp)
              .sort((a, b) => a.timestamp - b.timestamp);
            
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
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="p-0 bg-white border border-ws-surface2 shadow-xl rounded-2xl overflow-hidden relative mt-6">
      <div className="p-6 border-b border-ws-surface2 flex items-center justify-between bg-slate-50/50">
        <h3 className="text-xl font-bold text-ws-ink flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${hasRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}></span>
          רדאר סשן והקלטות
        </h3>
        <div className="text-sm font-medium text-ws-soft">
          {studentRadarHistory.length} אירועים חריגים
        </div>
      </div>
      
      <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-6 bg-white">
        <div className="flex-1">
          <p className="text-ws-ink mb-2">
            המערכת מקליטה את כל תנועות התלמיד במהלך הסשן במטרה לנתח התנהגות קוגניטיבית ורגשית. 
          </p>
          <div className="flex items-center gap-4 text-sm text-ws-soft">
            <span className="flex items-center gap-1">
              <span>📹</span> פריימים מוקלטים: {liveReplayEvents.length}
            </span>
            <span className="flex items-center gap-1">
              <span>⚠️</span> אירועי רדאר: {studentRadarHistory.length}
            </span>
          </div>
        </div>
        
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={!hasRecording}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${hasRecording ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
        >
          <span>▶</span> צפה בוידאו ובלוגים
        </button>
      </div>

      {/* Full-screen Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-slate-900/80 backdrop-blur-sm">
          <div className="w-full h-full max-w-[1600px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-slate-50 shrink-0">
              <h2 className="text-xl font-bold text-slate-800">ניתוח קוגניטיבי מבוסס וידאו</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-200 hover:bg-slate-300 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex flex-col xl:flex-row overflow-hidden bg-slate-100">
              {/* Logs Sidebar inside Modal */}
              <div className="w-full xl:w-80 bg-white border-b xl:border-b-0 xl:border-l border-slate-200 overflow-y-auto p-4 flex flex-col gap-3 shrink-0">
                <h4 className="font-bold text-slate-800 mb-2">ציר זמן אירועים</h4>
                {studentRadarHistory.length === 0 ? (
                  <p className="text-sm text-slate-500">אין אירועי מעקב לתלמיד זה.</p>
                ) : (
                  studentRadarHistory
                    .slice()
                    .sort((a: any, b: any) => a.timestamp - b.timestamp)
                    .map((alert: any, index: number) => (
                    <button
                      key={alert.id || index}
                      onClick={() => setSeekToTime(alert.timestamp)}
                      className="text-right p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 transition-all flex flex-col gap-1 w-full"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {alert.type === 'HESITATION' ? '⏱️' : alert.type === 'PASSIVE_DRIFTING' ? '↩️' : alert.type === 'TAB_ESCAPE' ? '⚠️' : alert.type === 'TASK_ERROR' ? '❌' : '⚠️'}
                        </span>
                        <span className="font-bold text-sm text-slate-800">
                          {alert.type === 'HESITATION' ? 'היסוס ממושך' : alert.type === 'PASSIVE_DRIFTING' ? 'מחיקות מרובות' : alert.type === 'TAB_ESCAPE' ? 'בריחה לטאב אחר' : alert.type === 'TASK_ERROR' ? 'שגיאה במשימה' : alert.type}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {new Date(alert.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </button>
                  ))
                )}
              </div>
              
              {/* Player Container inside Modal */}
              <div className="flex-1 relative flex items-center justify-center p-0 sm:p-6 bg-slate-100/50 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-white relative">
                  <ReplayViewer events={liveReplayEvents} seekToTime={seekToTime} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

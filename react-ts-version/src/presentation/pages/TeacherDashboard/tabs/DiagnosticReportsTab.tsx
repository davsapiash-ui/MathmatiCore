import { useState } from "react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { ReplayViewer } from "@/presentation/components/ReplayViewer";

interface DiagnosticReportsTabProps {
  allStudents: any[];
  students: Record<string, any>;
  selectedReplayStudentId: string | null;
  setSelectedReplayStudentId: (id: string | null) => void;
  liveReplayEvents: any[];
  pendingApprovals: any[];
  handleTabChange: (tab: any) => void;
  allAlerts: any[];
}

export function DiagnosticReportsTab({
  allStudents,
  students,
  selectedReplayStudentId,
  setSelectedReplayStudentId,
  liveReplayEvents,
  pendingApprovals,
  handleTabChange,
  allAlerts,
}: DiagnosticReportsTabProps) {
  const [seekToTime, setSeekToTime] = useState<number | undefined>();

  return (
    <div className="animate-in fade-in h-[calc(100vh-140px)] flex flex-col gap-6 overflow-y-auto xl:overflow-hidden pb-4 px-2">
      {/* Top Bar: Student Selection */}
      <div className="flex items-center gap-3 bg-white/80 backdrop-blur-md rounded-2xl p-2 shadow-[0_2px_10px_rgba(0,0,0,0.03)] shrink-0">
        <h2 className="font-bold text-slate-800 shrink-0 mx-2 text-sm">
          בחר תלמיד:
        </h2>
        <div className="flex-1 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {allStudents.map(s => {
            const isCompleted = s.completedMeeting2;
            const hasAlerts = allAlerts.some(a => a.student === s.studentId);
            return (
              <button
                key={s.studentId}
                onClick={() => setSelectedReplayStudentId(s.studentId)}
                className={`shrink-0 px-4 py-2.5 rounded-xl transition-all text-sm font-medium flex items-center gap-2 ${
                  selectedReplayStudentId === s.studentId 
                    ? "bg-slate-800 text-white shadow-lg shadow-slate-200" 
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                }`}
              >
                <span>{s.name}</span>
                <div className="flex items-center gap-1.5 mr-2">
                  {hasAlerts && <span className={`w-1.5 h-1.5 rounded-full ${selectedReplayStudentId === s.studentId ? 'bg-orange-400' : 'bg-orange-500'}`} title="התראות קיימות"></span>}
                  {isCompleted && <span className={`w-1.5 h-1.5 rounded-full ${selectedReplayStudentId === s.studentId ? 'bg-green-400' : 'bg-green-500'}`} title="מוכן לאבחון"></span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative">
        {!selectedReplayStudentId ? (
          <div className="h-full flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-3xl">
            <span className="text-5xl mb-4 opacity-50 grayscale">🔍</span>
            <h3 className="text-xl font-bold text-slate-700 mb-2">אבחון AI מקיף</h3>
            <p className="text-slate-500 max-w-sm text-sm">
              בחר תלמיד מהסרגל העליון כדי להציג במרוכז את סרטון הסשן, מדדי ה-Q-Matrix, נתוני הרדאר והמלצת הפעולה של המערכת.
            </p>
          </div>
        ) : (
          (() => {
            const s = students[selectedReplayStudentId];
            if (!s) return null;
            const hasRecording = liveReplayEvents.length > 2;
            const socraticApproval = s.diagnosticReport || pendingApprovals.find(a => a.studentId === selectedReplayStudentId);
            const studentAlerts = allAlerts.filter((a: any) => a.student === selectedReplayStudentId).sort((a: any, b: any) => a.timestamp - b.timestamp);

            return (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-full">
                {/* Left Column: Alerts & Q-Matrix */}
                <div className="flex flex-col gap-6 h-full min-h-0 overflow-y-auto hide-scrollbar pb-10">
                  
                  {/* Trace Data Minis */}
                  <div className="flex gap-4 shrink-0">
                    <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center justify-between">
                      <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">היסוסים</span>
                      <span className="text-xl font-black text-orange-500">{s.traceData.hesitation_events}</span>
                    </div>
                    <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center justify-between">
                      <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">מחיקות</span>
                      <span className="text-xl font-black text-red-500">{s.traceData.undo_clicks}</span>
                    </div>
                  </div>

                  {/* Q-Matrix Report */}
                  <div className="bg-white p-5 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] shrink-0">
                    <h3 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider">מדדי מיומנות (Q-Matrix)</h3>
                    <div className="flex flex-col gap-3 text-sm">
                      <div className="flex justify-between items-center py-2 border-b border-slate-50">
                        <span className="text-slate-600 font-medium">אפס כשומר מקום</span>
                        <span className={`font-bold ${s.qMatrixResults.task1_zero_placeholder === 'success' ? 'text-green-500' : s.qMatrixResults.task1_zero_placeholder ? 'text-red-400' : 'text-slate-300'}`}>
                          {s.qMatrixResults.task1_zero_placeholder === null ? 'חסר נתון' : s.qMatrixResults.task1_zero_placeholder === 'success' ? 'שולט' : 'זקוק לחיזוק'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-50">
                        <span className="text-slate-600 font-medium">גמישות / המרה</span>
                        <span className={`font-bold ${s.qMatrixResults.task3_flexible_regrouping === 'success' ? 'text-green-500' : s.qMatrixResults.task3_flexible_regrouping ? 'text-red-400' : 'text-slate-300'}`}>
                          {s.qMatrixResults.task3_flexible_regrouping === null ? 'חסר נתון' : s.qMatrixResults.task3_flexible_regrouping === 'success' ? 'שולט' : 'זקוק לחיזוק'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-50">
                        <span className="text-slate-600 font-medium">עובדות יסוד</span>
                        <span className={`font-bold ${(s.qMatrixResults.task4_basic_addition_fluency && s.qMatrixResults.task4_basic_addition_fluency !== 'success') ? 'text-red-400' : s.qMatrixResults.task4_basic_addition_fluency === 'success' ? 'text-green-500' : 'text-slate-300'}`}>
                          {s.qMatrixResults.task4_basic_addition_fluency === null ? 'חסר נתון' : s.qMatrixResults.task4_basic_addition_fluency === 'success' ? 'שולט' : 'זקוק לחיזוק'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-50">
                        <span className="text-slate-600 font-medium">חשיבה אלגברית</span>
                        <span className={`font-bold ${(s.qMatrixResults.task7_missing_subtrahend && s.qMatrixResults.task7_missing_subtrahend !== 'success') ? 'text-red-400' : s.qMatrixResults.task7_missing_subtrahend === 'success' ? 'text-green-500' : 'text-slate-300'}`}>
                          {s.qMatrixResults.task7_missing_subtrahend === null ? 'חסר נתון' : s.qMatrixResults.task7_missing_subtrahend === 'success' ? 'שולט' : 'זקוק לחיזוק'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* AI Diagnostic Summary */}
                  <div className={`p-5 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] shrink-0 ${socraticApproval ? 'bg-indigo-50/50' : 'bg-white'}`}>
                    <h3 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider">
                      {socraticApproval ? 'תובנות מבוססות AI' : 'ניתוח פדגוגי חי'}
                    </h3>
                    
                    <div className="text-sm text-slate-600 leading-relaxed">
                      {!socraticApproval ? (
                        <p>
                          ניתוח פעולות התלמיד בוידאו יחד עם מטריצת המיומנויות מעלה כי 
                          {s.qMatrixResults.task3_flexible_regrouping === 'canonical_fixation' ? ' קיים קושי בגמישות מחשבתית וצורך בהמחשה מוחשית של פעולת הפריטה.' : s.qMatrixResults.task3_flexible_regrouping === 'success' ? ' קיימת הבנה טובה של פריטה והמרה.' : ' טרם נאספו מספיק נתונים לקביעה מוחלטת.'}
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <strong className="block text-indigo-900 mb-1 text-xs uppercase">אבחון:</strong>
                            <p className="text-slate-700">{socraticApproval.clinicalDiagnosisHe || "לא נרשמו תובנות."}</p>
                          </div>
                          <div>
                            <strong className="block text-indigo-900 mb-1 text-xs uppercase">פעולה מומלצת:</strong>
                            <p className="text-slate-700">{socraticApproval.actionPlanHe || "לא נקבעה תוכנית."}</p>
                          </div>
                          
                          <UdlButton 
                            size="sm" 
                            semanticColor="primary"
                            className="w-full mt-4 font-bold shadow-md"
                            onClick={() => handleTabChange("approvals")}
                          >
                            החל תוכנית התערבות
                          </UdlButton>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right/Center Column: Video Replay & Alerts */}
                <div className="xl:col-span-2 flex flex-col gap-6 h-full min-h-0">
                  {/* Video Player */}
                  <div className="flex-1 bg-white rounded-3xl shadow-[0_4px_30px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col min-h-[400px]">
                    <div className="flex items-center justify-between p-4 px-6 shrink-0 border-b border-slate-50">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${hasRecording ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-slate-300'}`}></div>
                        <h3 className="text-sm font-bold text-slate-700">הקלטת רדאר</h3>
                      </div>
                      {hasRecording && (
                        <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                          {liveReplayEvents.length} פריימים נתפסו
                        </span>
                      )}
                    </div>
                    
                    <div className="flex-1 bg-slate-50 relative flex items-center justify-center p-4">
                      {hasRecording ? (
                        <div className="w-full h-full relative rounded-2xl overflow-hidden shadow-sm border border-slate-200/60 bg-white" style={{ aspectRatio: '16/9' }}>
                           <ReplayViewer events={liveReplayEvents} seekToTime={seekToTime} />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <span className="text-4xl mb-3 opacity-30 grayscale">🎥</span>
                          <p className="font-medium text-sm">הקלטה לא זמינה</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Alerts Timeline (Horizontal) */}
                  <div className="h-32 bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] shrink-0 p-4 px-6 flex flex-col">
                    <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">ציר זמן התראות</h3>
                    <div className="flex-1 flex items-center gap-3 overflow-x-auto hide-scrollbar pb-1">
                      {studentAlerts.length === 0 ? (
                        <div className="text-slate-400 text-xs w-full text-center">לא נרשמו אירועים חריגים במהלך הלמידה.</div>
                      ) : (
                        studentAlerts.map((alert: any) => (
                          <button
                            key={alert.id}
                            onClick={() => setSeekToTime(alert.timestamp)}
                            className="shrink-0 w-40 bg-slate-50 hover:bg-slate-100 rounded-2xl p-3 flex flex-col gap-1 text-right transition-colors"
                          >
                            <span className="font-bold text-xs text-slate-700 truncate">
                              {alert.type === 'HESITATION' ? 'היסוס ממושך' : alert.type === 'PASSIVE_DRIFTING' ? 'מחיקות מרובות' : alert.type}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(alert.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </div>
      
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}


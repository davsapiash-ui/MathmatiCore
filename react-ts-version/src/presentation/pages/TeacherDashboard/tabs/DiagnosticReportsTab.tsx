import { useState } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-140px)] flex flex-col gap-4 overflow-hidden pb-4">
      {/* Top Bar: Student Selection */}
      <div className="flex items-center gap-4 bg-ws-surface/80 backdrop-blur-xl border border-ws-surface2 p-3 rounded-2xl shadow-sm shrink-0">
        <h2 className="font-bold text-ws-ink shrink-0 mr-2 flex items-center gap-2">
          <span className="text-xl">🎓</span>
          בחר תלמיד לאבחון:
        </h2>
        <div className="flex-1 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {allStudents.map(s => {
            const isCompleted = s.completedMeeting2;
            const hasAlerts = allAlerts.some(a => a.student === s.studentId);
            return (
              <button
                key={s.studentId}
                onClick={() => setSelectedReplayStudentId(s.studentId)}
                className={`shrink-0 px-4 py-2 rounded-xl transition-all text-sm flex items-center gap-2 border whitespace-nowrap ${
                  selectedReplayStudentId === s.studentId 
                    ? "bg-ws-accent text-white font-bold shadow-md border-transparent" 
                    : "bg-white hover:bg-ws-bg text-ws-ink border-ws-surface2 shadow-sm"
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${selectedReplayStudentId === s.studentId ? 'bg-white/20' : 'bg-ws-surface2'}`}>
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <span>{s.name}</span>
                <div className="flex items-center gap-1 mr-2">
                  {hasAlerts && <span className={`w-2 h-2 rounded-full ${selectedReplayStudentId === s.studentId ? 'bg-orange-300' : 'bg-orange-500'}`} title="התראות קיימות"></span>}
                  {isCompleted && <span className={`w-2 h-2 rounded-full ${selectedReplayStudentId === s.studentId ? 'bg-white' : 'bg-green-500'}`} title="מוכן לאבחון (סיים מפגש 2)"></span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative">
        {!selectedReplayStudentId ? (
          <div className="h-full flex flex-col items-center justify-center text-center bg-ws-surface/30 rounded-3xl border-2 border-dashed border-ws-surface2">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md mb-6">
              <span className="text-4xl">🔍</span>
            </div>
            <h3 className="text-2xl font-bold text-ws-ink mb-3">אבחון AI מקיף לתלמיד</h3>
            <p className="text-ws-soft max-w-md text-lg">
              בחר תלמיד מהסרגל העליון כדי להציג במרוכז את סרטון הסשן, מדדי ה-Q-Matrix, נתוני הרדאר והמלצת הפעולה של ה-Socratic Engine.
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
              <div className="absolute inset-0 grid grid-cols-12 gap-4 animate-in fade-in zoom-in-95 duration-300">
                {/* Right Column: Q-Matrix & AI Insights (Col span 4) */}
                <div className="col-span-12 xl:col-span-4 flex flex-col gap-4 h-full">
                  {/* Trace Data Summary (Mini) */}
                  <div className="flex gap-3 shrink-0">
                    <div className="flex-1 flex items-center justify-between p-3 bg-ws-bg rounded-xl border border-ws-surface2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">⏱️</span>
                        <span className="font-semibold text-xs">היסוסים</span>
                      </div>
                      <span className="text-lg font-black text-orange-600">{s.traceData.hesitation_events}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-between p-3 bg-ws-bg rounded-xl border border-ws-surface2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">↩️</span>
                        <span className="font-semibold text-xs">ביטולים/מחיקות</span>
                      </div>
                      <span className="text-lg font-black text-red-600">{s.traceData.undo_clicks}</span>
                    </div>
                  </div>

                  {/* Q-Matrix Report */}
                  <AccessibleCard className="p-4 bg-white border border-ws-surface2 shadow-sm rounded-2xl shrink-0">
                    <h3 className="text-sm font-bold text-ws-ink mb-3 flex items-center gap-2 border-b pb-2">
                      <span className="text-ws-accent">📊</span>
                      מדדי Q-Matrix
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-ws-bg p-2 rounded-lg border border-ws-surface2 flex flex-col">
                        <span className="text-ws-soft font-bold mb-1 truncate" title="שומר מקום (אפס)">אפס כשומר מקום</span>
                        <span className={`font-black ${s.qMatrixResults.task1_zero_placeholder && s.qMatrixResults.task1_zero_placeholder !== 'success' ? 'text-red-500' : s.qMatrixResults.task1_zero_placeholder === 'success' ? 'text-green-600' : 'text-slate-400'}`}>
                          {s.qMatrixResults.task1_zero_placeholder === null ? 'טרם נבדק' : s.qMatrixResults.task1_zero_placeholder === 'success' ? 'V שולט' : 'X חלש'}
                        </span>
                      </div>
                      <div className="bg-ws-bg p-2 rounded-lg border border-ws-surface2 flex flex-col">
                        <span className="text-ws-soft font-bold mb-1 truncate" title="גמישות מחשבתית/המרה">גמישות / המרה</span>
                        <span className={`font-black ${s.qMatrixResults.task3_flexible_regrouping && s.qMatrixResults.task3_flexible_regrouping !== 'success' ? 'text-red-500' : s.qMatrixResults.task3_flexible_regrouping === 'success' ? 'text-green-600' : 'text-slate-400'}`}>
                          {s.qMatrixResults.task3_flexible_regrouping === null ? 'טרם נבדק' : s.qMatrixResults.task3_flexible_regrouping === 'success' ? 'V שולט' : 'X חלש'}
                        </span>
                      </div>
                      <div className="bg-ws-bg p-2 rounded-lg border border-ws-surface2 flex flex-col">
                        <span className="text-ws-soft font-bold mb-1 truncate" title="חיבור וחיסור (עובדות)">עובדות יסוד</span>
                        <span className={`font-black ${(s.qMatrixResults.task4_basic_addition_fluency && s.qMatrixResults.task4_basic_addition_fluency !== 'success') || (s.qMatrixResults.task6_subtraction_regrouping && s.qMatrixResults.task6_subtraction_regrouping !== 'success') ? 'text-red-500' : (s.qMatrixResults.task4_basic_addition_fluency === 'success' && s.qMatrixResults.task6_subtraction_regrouping === 'success') ? 'text-green-600' : 'text-slate-400'}`}>
                          {(s.qMatrixResults.task4_basic_addition_fluency === null && s.qMatrixResults.task6_subtraction_regrouping === null) ? 'טרם נבדק' : ((s.qMatrixResults.task4_basic_addition_fluency && s.qMatrixResults.task4_basic_addition_fluency !== 'success') || (s.qMatrixResults.task6_subtraction_regrouping && s.qMatrixResults.task6_subtraction_regrouping !== 'success')) ? 'X חלש' : 'V שולט'}
                        </span>
                      </div>
                      <div className="bg-ws-bg p-2 rounded-lg border border-ws-surface2 flex flex-col">
                        <span className="text-ws-soft font-bold mb-1 truncate" title="הבנה אלגברית">הבנה אלגברית</span>
                        <span className={`font-black ${s.qMatrixResults.task7_missing_subtrahend && s.qMatrixResults.task7_missing_subtrahend !== 'success' && s.qMatrixResults.task8_missing_addend !== 'success' ? 'text-red-500' : (s.qMatrixResults.task7_missing_subtrahend === 'success' || s.qMatrixResults.task8_missing_addend === 'success') ? 'text-green-600' : 'text-slate-400'}`}>
                          {(s.qMatrixResults.task7_missing_subtrahend === null && s.qMatrixResults.task8_missing_addend === null) ? 'טרם נבדק' : (s.qMatrixResults.task7_missing_subtrahend === 'success' || s.qMatrixResults.task8_missing_addend === 'success') ? 'V שולט' : 'X חלש'}
                        </span>
                      </div>
                    </div>
                  </AccessibleCard>

                  {/* AI Diagnostic Summary */}
                  <AccessibleCard className={`p-4 border shadow-sm rounded-2xl flex flex-col flex-1 min-h-0 ${socraticApproval ? 'bg-indigo-50/50 border-indigo-100' : 'bg-white border-ws-surface2'}`}>
                    <h3 className="text-sm font-bold text-ws-ink mb-3 flex items-center gap-2 border-b pb-2 border-indigo-100 shrink-0">
                      <span className="text-ws-accent text-lg">🤖</span>
                      {socraticApproval ? 'תובנות Socratic Engine' : 'מדדי למידה סמויים'}
                    </h3>
                    
                    <div className="overflow-y-auto pr-1 text-sm text-slate-700 leading-relaxed custom-scrollbar flex flex-col gap-3 flex-1">
                      {!socraticApproval ? (
                        <p>
                          ניתוח פעולות התלמיד בוידאו יחד עם מטריצת המיומנויות מצביע על כך ש
                          {s.qMatrixResults.task3_flexible_regrouping === 'canonical_fixation' ? ' נראה כי קיים קושי בגמישות מחשבתית וצורך בהמחשה מוחשית (באמצעות בלוקים) של פעולת הפריטה לפני תרגול במאונך.' : s.qMatrixResults.task3_flexible_regrouping === 'success' ? ' קיימת הבנה מוחשית וכמותית טובה של פריטה והמרה.' : ' טרם נאספו מספיק נתונים לקביעת הבנה מוחשית של המרות.'}
                          {(s.qMatrixResults.task7_missing_subtrahend === 'algebraic_concept_deficit' || s.qMatrixResults.task8_missing_addend === 'algebraic_concept_deficit') ? ' ניכר קושי מהותי בחשיבה אלגברית והבנת משמעות סימן השוויון.' : ''}
                        </p>
                      ) : (
                        <>
                          <div>
                            <strong className="block text-indigo-900 mb-1">אבחון קליני:</strong>
                            {socraticApproval.clinicalDiagnosisHe || "לא נרשמו תובנות מהאבחון."}
                          </div>
                          <div>
                            <strong className="block text-indigo-900 mb-1">תוכנית פעולה מוצעת:</strong>
                            {socraticApproval.actionPlanHe || "לא נקבעה תוכנית."}
                          </div>
                        </>
                      )}
                    </div>
                    
                    {socraticApproval && (
                      <div className="mt-2 pt-3 border-t border-indigo-100 shrink-0">
                        <UdlButton 
                          size="sm" 
                          semanticColor="primary"
                          className="w-full font-bold shadow-md text-xs py-2"
                          onClick={() => handleTabChange("approvals")}
                        >
                          החל תוכנית על התלמיד
                        </UdlButton>
                      </div>
                    )}
                  </AccessibleCard>
                </div>

                {/* Left/Center Column: Video Replay & Alert Sidebar (Col span 8) */}
                <div className="col-span-12 xl:col-span-8 flex flex-col lg:flex-row gap-4 h-full">
                  {/* Alert Sidebar (Narrower) */}
                  <AccessibleCard className="w-full lg:w-48 xl:w-56 shrink-0 p-0 bg-white border border-ws-surface2 shadow-sm rounded-2xl flex flex-col h-full">
                    <div className="p-3 border-b border-ws-surface2 bg-slate-50/50 shrink-0">
                      <h4 className="font-bold text-ws-ink flex items-center gap-2 text-sm">
                        <span className="text-ws-accent">📋</span>
                        אירועים חריגים
                      </h4>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 bg-slate-50/30 custom-scrollbar">
                      {studentAlerts.length === 0 ? (
                        <div className="text-center p-4 text-ws-soft text-xs mt-4">
                          <span className="block mb-1 opacity-50 text-xl">✅</span>
                          אין אירועי מעקב לתלמיד זה.
                        </div>
                      ) : (
                        studentAlerts.map((alert: any) => (
                          <button
                            key={alert.id}
                            onClick={() => setSeekToTime(alert.timestamp)}
                            className="text-right p-3 rounded-lg border border-ws-surface2 bg-white hover:bg-ws-bg hover:border-ws-accent/50 hover:shadow-sm transition-all flex flex-col w-full group"
                          >
                            <div className="flex items-center justify-between w-full mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base leading-none">
                                  {alert.type === 'HESITATION' ? '⏱️' : alert.type === 'PASSIVE_DRIFTING' ? '↩️' : alert.type === 'TASK_ERROR' ? '❌' : '⚠️'}
                                </span>
                                <span className="font-bold text-xs text-ws-ink group-hover:text-ws-accent transition-colors">
                                  {alert.type === 'HESITATION' ? 'היסוס ממושך' : alert.type === 'PASSIVE_DRIFTING' ? 'מחיקות מרובות' : alert.type === 'TASK_ERROR' ? 'שגיאה' : alert.type}
                                </span>
                              </div>
                            </div>
                            <div className="text-[10px] text-ws-soft font-mono bg-slate-100 px-1.5 py-0.5 rounded w-fit">
                              {new Date(alert.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </AccessibleCard>

                  {/* Video Player */}
                  <AccessibleCard className="flex-1 p-0 bg-white border border-ws-surface2 shadow-md rounded-2xl overflow-hidden flex flex-col h-full">
                    <div className="p-3 border-b border-ws-surface2 flex items-center justify-between bg-slate-50/50 shrink-0">
                      <h3 className="text-sm font-bold text-ws-ink flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full shadow-sm ${hasRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}></span>
                        הקלטת רדאר
                      </h3>
                      {hasRecording && (
                        <div className="text-xs font-medium text-ws-soft bg-white px-2 py-0.5 rounded-full shadow-sm border border-slate-200">
                          {liveReplayEvents.length} פריימים
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 bg-slate-100 flex items-center justify-center p-2 relative">
                      {hasRecording ? (
                        <div className="absolute inset-2 flex items-center justify-center rounded-xl overflow-hidden shadow-inner border border-slate-300 bg-white">
                          <div className="w-full h-full relative" style={{ aspectRatio: '16/9' }}>
                             <ReplayViewer events={liveReplayEvents} seekToTime={seekToTime} />
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-ws-soft text-center px-4 h-full">
                          <span className="text-4xl mb-2 opacity-50">🎥</span>
                          <p className="text-sm font-medium">לא נמצאה הקלטה של הלמידה</p>
                        </div>
                      )}
                    </div>
                  </AccessibleCard>
                </div>
              </div>
            );
          })()
        )}
      </div>
      
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
}

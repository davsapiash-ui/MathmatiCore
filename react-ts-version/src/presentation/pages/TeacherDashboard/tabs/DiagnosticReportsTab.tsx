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
}

export function DiagnosticReportsTab({
  allStudents,
  students,
  selectedReplayStudentId,
  setSelectedReplayStudentId,
  liveReplayEvents,
  pendingApprovals,
  handleTabChange
}: DiagnosticReportsTabProps) {
  return (
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
                const hasRecording = liveReplayEvents.length > 2;
                const socraticApproval = s.diagnosticReport || pendingApprovals.find(a => a.studentId === selectedReplayStudentId);

                return (
                  <div className="animate-in fade-in zoom-in-95 duration-300">
                    {/* Top Row: Q-Matrix & Traces */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                      {/* Q-Matrix Report */}
                      <AccessibleCard className="p-6 bg-white border border-ws-surface2 shadow-md rounded-2xl">
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
                      <AccessibleCard className={`p-6 border shadow-md rounded-2xl flex flex-col ${socraticApproval ? 'bg-indigo-50/50 border-indigo-100' : 'bg-white border-ws-surface2'}`}>
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

                          {/* Analytical Report */}
                          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-800 mb-3 text-lg flex items-center gap-2">
                              <span className="text-ws-accent">📋</span>
                              מצב נוכחי (ניתוח אוטומטי):
                            </h4>
                            <p className="text-sm text-slate-700 leading-relaxed mb-4">
                              התלמיד חווה <strong className="text-orange-600">{s.traceData.hesitation_events}</strong> אירועי היסוס המעידים על מאבק קוגניטיבי, וביצע <strong className="text-red-600">{s.traceData.undo_clicks}</strong> מחיקות או חזרות. 
                              ניתוח הפעולות בוידאו יחד עם מטריצת המיומנויות (Q-Matrix) מצביע על כך ש
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
                                {socraticApproval.clinicalDiagnosisHe || "לא נרשמו תובנות מהאבחון."}
                              </p>
                              <p className="text-sm text-indigo-800 leading-relaxed mb-5 bg-white p-4 rounded-lg border border-indigo-100/50">
                                <strong className="block mb-1 text-indigo-900">תוכנית פעולה מוצעת:</strong>
                                {socraticApproval.actionPlanHe || "לא נקבעה תוכנית."}
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
                                      {task.numberA} {task.isSubtraction ? '-' : '+'} {task.numberB} = ?
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

                    {/* Video Replay */}
                    <AccessibleCard className="p-6 bg-white border border-ws-surface2 shadow-xl rounded-2xl overflow-hidden relative">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-ws-ink flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full ${hasRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}></span>
                          צפייה בהקלטת סשן הלמידה
                        </h3>
                        <div className="text-sm font-medium text-ws-soft">
                          {hasRecording ? `נמצאו ${liveReplayEvents.length} פריימים לניתוח` : 'לא נמצאה הקלטה לסשן זה'}
                        </div>
                      </div>
                      
                      <div className="bg-slate-50 border border-ws-surface2 rounded-xl overflow-x-auto relative flex justify-center py-4">
                        {hasRecording ? (
                          <div className="w-fit flex justify-center items-center shadow-lg rounded-xl overflow-hidden border border-slate-200">
                            <ReplayViewer events={liveReplayEvents} />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-ws-soft py-20">
                            <span className="text-4xl mb-3">🎥</span>
                            <p>התלמיד טרם ביצע פעולות שנקלטו ברדאר</p>
                          </div>
                        )}
                      </div>
                    </AccessibleCard>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

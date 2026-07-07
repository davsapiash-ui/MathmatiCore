import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { ShieldAlert, MessageCircle } from "lucide-react";
import { SocraticEngine } from "@/infrastructure/services/SocraticEngine";

interface ApprovalsTabProps {
  pendingRouteStudents: any[];
  pendingApprovals: any[];
  teacherApprovals: any[];
  fallbackApprovals: any[];
  setTeacherApprovals: React.Dispatch<React.SetStateAction<any[]>>;
  setFallbackApprovals: React.Dispatch<React.SetStateAction<any[]>>;
  TEACHER_ID: string;
  approveRoute: (studentId: string) => void;
}

export function ApprovalsTab({
  pendingRouteStudents,
  pendingApprovals,
  teacherApprovals,
  fallbackApprovals,
  setTeacherApprovals,
  setFallbackApprovals,
  TEACHER_ID,
  approveRoute,
}: ApprovalsTabProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-10">
        <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
          אישור משימות <span dir="ltr">AI</span> (<span dir="ltr">Socratic Engine</span>)
        </h1>
        <p className="text-ws-soft mt-3 text-lg">
          אישור ותיקוף מסלולי למידה אדפטיביים שנוצרו על ידי המערכת.
        </p>
      </header>
      
      <div className="flex flex-col gap-6">
        {pendingRouteStudents.length === 0 ? (
          <div className="text-center py-20 text-ws-soft bg-ws-surface/50 backdrop-blur-md rounded-2xl border-2 border-dashed border-ws-surface2 shadow-sm">
            <div className="w-16 h-16 mx-auto mb-4 bg-ws-bg rounded-full flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-ws-soft" />
            </div>
            <p className="text-xl font-bold">אין תלמידים הממתינים לאישור מסלול.</p>
          </div>
        ) : (
          pendingRouteStudents.map(student => (
            <AccessibleCard key={student.studentId} className="p-8 bg-ws-surface border border-ws-surface2 shadow-lg rounded-3xl">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-ws-ink">{student.name || student.studentId}</h3>
                  <p className="text-sm text-ws-soft mt-1">מזהה: {student.studentId} | סיום מפגש 2</p>
                </div>
                <div className="flex gap-3">
                  <UdlButton 
                    semanticColor="primary" 
                    size="sm" 
                    className="font-bold shadow-md shadow-ws-accent/20"
                    onClick={async () => {
                      approveRoute(student.studentId);
                      const approval = pendingApprovals.find((a) => a.studentId === student.studentId);
                      if (approval) {
                        try {
                          await SocraticEngine.approveTasks(TEACHER_ID, approval.id, approval.studentId, approval.tasks);
                        } catch {
                          // offline logic here
                        }
                      }
                    }}
                  >
                    אישור מסלול
                  </UdlButton>
                  <UdlButton 
                    variant="outline" 
                    size="sm"
                    onClick={async () => {
                      const allPending = [...teacherApprovals, ...fallbackApprovals];
                      const approval = allPending.find((a) => a.studentId === student.studentId);
                      if (approval) {
                        try {
                          await SocraticEngine.rejectTasks(TEACHER_ID, approval.id);
                          setTeacherApprovals(prev => prev.filter(a => a.id !== approval.id));
                          setFallbackApprovals(prev => prev.filter(a => a.id !== approval.id));
                        } catch {
                          // offline logic
                        }
                      }
                    }}
                  >
                    דחייה / עריכה
                  </UdlButton>
                </div>
              </div>
              
              <div className="bg-ws-accentSoft/30 p-5 rounded-2xl border border-ws-accent/10 mb-6">
                <h4 className="font-bold text-ws-accent mb-2 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  המלצת נתב הלמידה (Curriculum Router):
                </h4>
                <p className="text-ws-ink font-medium leading-relaxed mb-4">
                  מערכת הניתוב ממליצה על שיבוץ התלמיד ל<strong>{student.routeRecommendation === 'YELLOW' ? 'מסלול צהוב (מבוסס תמיכה)' : 'מסלול ירוק (אתגר מתקדם)'}</strong>.<br/>
                  {student.routeRecommendation === 'YELLOW' 
                    ? 'המלצה זו מבוססת על זיהוי פערי ליבה (כגון חוסר שליטה בעובדות יסוד או היסוסים מרובים) במהלך מפגש האבחון. התלמיד יקבל פיגומים (Scaffolding) מותאמים במפגש 3.' 
                    : 'התלמיד הפגין שליטה טובה במיומנויות הבסיס וללא סימני מאבק קוגניטיבי מהותיים. מפגש 3 יאתגר אותו בבעיות מתקדמות ללא פיגומים מיותרים.'}
                </p>

                {/* --- ROUTE DEEP DIVE --- */}
                {(() => {
                  const metadata = import('@/data/routeMetadatas').then(m => m.ROUTE_METADATA);
                  // Dynamic import workaround for now: We'll hardcode the display logic based on routeRecommendation to guarantee it works without async issues in render
                  const routeMeta = student.routeRecommendation === 'YELLOW' ? 
                    {
                      sessions: [
                        { sessionNumber: 3, goals: 'בניית ביטחון בעשרות ויחידות: חיבור מספרים דו-ספרתיים עם המרה ברורה תוך שימוש חובה בלוח מוחשי.' },
                        { sessionNumber: 4, goals: 'הפחתת תלות במוחשי: תרגילי חיסור עם פריטה תוך הצגת הלוח אך ללא חובת גרירה מלאה.' },
                        { sessionNumber: 5, goals: 'ביסוס תובנת המספר (Number Sense): אומדן תוצאות לפני פתרון מדויק.' },
                        { sessionNumber: 6, goals: 'מעבר לגמישות מחשבתית: פתרון משוואות עם נעלם (Addend חסר) באמצעות המחשות חלקיות.' },
                        { sessionNumber: 7, goals: 'הסרת פיגומים מוחלטת: יישום האלגוריתם הסטנדרטי עם תמיכה סוקרטית בלבד במידת הצורך.' }
                      ],
                      tasks: [
                        { id: 's3_y_1', title: 'חיבור דו-ספרתי', instruction: 'פתור: 27 + 15. היעזר בלוח המוחשי לבצע את ההמרה.' },
                        { id: 's3_y_2', title: 'חיבור עשרות', instruction: 'פתור: 48 + 24. שים לב מה קורה כשיש יותר מ-10 יחידות.' },
                        { id: 's3_y_3', title: 'אתגר חיבור', instruction: 'פתור: 36 + 25. נסה לפתור קודם בראש ואז לבדוק עם הבדידים.' }
                      ]
                    } : {
                      sessions: [
                        { sessionNumber: 3, goals: 'חשיבה אלגברית התחלתית: מציאת מחוברים חסרים במשוואות חיבור (למשל 45 + _ = 72).' },
                        { sessionNumber: 4, goals: 'אומדן ודיוק: חיסור מספרים רב-ספרתיים עם פריטה כפולה תוך ביצוע אומדן מהיר.' },
                        { sessionNumber: 5, goals: 'בעיות מילוליות מורכבות: ניתוח מצבים נתונים והפיכתם למשוואה מתמטית ללא עזרים ויזואליים.' },
                        { sessionNumber: 6, goals: 'אסטרטגיות חישוב מתקדמות: שימוש בקיזוז (Compensation) לפתרון מהיר.' },
                        { sessionNumber: 7, goals: 'העברה (Transfer): יישום אסטרטגיות אלו בסביבת בעיות שבר/עשרוני (הכנה להמשך).' }
                      ],
                      tasks: [
                        { id: 's3_g_1', title: 'מחובר חסר', instruction: 'השלם את המספר החסר: 34 + ___ = 61.' },
                        { id: 's3_g_2', title: 'מחובר חסר - אתגר', instruction: 'השלם: ___ + 28 = 75.' },
                        { id: 's3_g_3', title: 'חיסור גמיש', instruction: 'פתור 82 - 37 באמצעות חישוב בראש והסבר את דרך הפעולה.' }
                      ]
                    };

                  return (
                    <div className="mt-4 bg-white/80 rounded-xl p-4 border border-slate-200">
                      <h5 className="font-bold text-slate-800 mb-3 border-b pb-2">יעדים פדגוגיים להמשך המסלול (מפגשים 3-7):</h5>
                      <ul className="space-y-2 mb-5">
                        {routeMeta.sessions.map(s => (
                          <li key={s.sessionNumber} className="text-sm flex gap-2">
                            <span className="font-bold text-slate-700 min-w-[60px]">מפגש {s.sessionNumber}:</span>
                            <span className="text-slate-600">{s.goals}</span>
                          </li>
                        ))}
                      </ul>

                      <h5 className="font-bold text-slate-800 mb-3 border-b pb-2 flex justify-between items-center">
                        <span>תוכנית עבודה מיידית (מפגש 3)</span>
                        <UdlButton size="sm" variant="outline" className="text-xs" onClick={() => alert('ממשק עריכת תרגילים ייפתח כעת... (Mock)')}>
                          ✏️ ערוך תרגילים
                        </UdlButton>
                      </h5>
                      <div className="grid md:grid-cols-3 gap-3">
                        {routeMeta.tasks.map(t => (
                          <div key={t.id} className="bg-slate-50 border border-slate-100 p-3 rounded-lg">
                            <strong className="block text-xs text-slate-800 mb-1">{t.title}</strong>
                            <p className="text-xs text-slate-600">{t.instruction}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* AI Socratic Engine Diagnosis */}
              {(() => {
                const approval = pendingApprovals.find(a => a.studentId === student.studentId);
                if (!approval || !approval.clinicalDiagnosisHe) return null;
                return (
                  <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 mb-4">
                    <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2 text-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                      אבחון קליני (Socratic AI Engine):
                    </h4>
                    <p className="text-amber-900 text-sm leading-relaxed mb-3">{approval.clinicalDiagnosisHe}</p>
                    <h5 className="font-bold text-amber-800 text-sm mb-1">תוכנית פעולה מוצעת:</h5>
                    <p className="text-amber-900 text-sm leading-relaxed">{approval.actionPlanHe}</p>
                  </div>
                );
              })()}

              <h4 className="font-bold text-lg mb-3">מדדי אבחון קריטיים (Q-Matrix):</h4>
              <div className="grid gap-3">
                  <div className="bg-ws-bg p-4 rounded-xl flex items-center justify-between border border-ws-surface2">
                    <div>
                      <span className="font-semibold">מאבק קוגניטיבי סמוי</span>
                    </div>
                    <div className="text-sm font-bold text-ws-soft">
                      {student.traceData.hesitation_events} היסוסים, {student.traceData.undo_clicks} חזרות
                    </div>
                  </div>
                  <div className="bg-ws-bg p-4 rounded-xl flex items-center justify-between border border-ws-surface2">
                    <div>
                      <span className="font-semibold">בסיס עשרוני וחיבור</span>
                    </div>
                    <div className={`text-sm font-bold ${(student.qMatrixResults.task4_basic_addition_fluency && student.qMatrixResults.task4_basic_addition_fluency !== 'success') ? 'text-red-500' : 'text-green-500'}`}>
                      {(student.qMatrixResults.task4_basic_addition_fluency && student.qMatrixResults.task4_basic_addition_fluency !== 'success') ? 'נכשל' : 'תקין'}
                    </div>
                  </div>
              </div>
            </AccessibleCard>
          ))
        )}
      </div>
    </div>
  );
}

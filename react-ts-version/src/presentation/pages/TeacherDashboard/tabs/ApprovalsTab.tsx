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
                <p className="text-ws-ink font-medium leading-relaxed">
                  מערכת הניתוב ממליצה על שיבוץ התלמיד ל<strong>{student.routeRecommendation === 'YELLOW' ? 'מסלול צהוב (מבוסס תמיכה)' : 'מסלול ירוק (אתגר מתקדם)'}</strong>.<br/>
                  {student.routeRecommendation === 'YELLOW' 
                    ? 'המלצה זו מבוססת על זיהוי פערי ליבה (כגון חוסר שליטה בעובדות יסוד או היסוסים מרובים) במהלך מפגש האבחון. התלמיד יקבל פיגומים (Scaffolding) מותאמים במפגש 3.' 
                    : 'התלמיד הפגין שליטה טובה במיומנויות הבסיס וללא סימני מאבק קוגניטיבי מהותיים. מפגש 3 יאתגר אותו בבעיות מתקדמות ללא פיגומים מיותרים.'}
                </p>
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

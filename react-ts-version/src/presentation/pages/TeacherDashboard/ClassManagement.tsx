import { useAdminStore } from '@/application/useAdminStore';
import { ShieldCheck, Users, Search, RotateCcw, Settings, X, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import type { StudentData } from '@/application/useStore';
import { database } from '@/infrastructure/firebase';
import { ref, set, remove, get } from 'firebase/database';

export function ClassManagement({ allStudents }: { allStudents: StudentData[] }) {
  const classes = useAdminStore(s => s.classes);
  const schools = useAdminStore(s => s.schools);
  
  // We're working with a single default school & class based on the strict hierarchy
  const currentClass = classes[0];
  const currentSchool = schools.find(s => s.id === currentClass?.schoolId);
  
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);

  const filteredStudents = allStudents.filter(s => (s.name || s.studentId || '').toLowerCase().includes(search.toLowerCase()));

  const handleResetStudent = async (studentId: string) => {
    if (!window.confirm(`האם אתה בטוח שברצונך לאפס את כל ההתקדמות והנתונים של תלמיד ${studentId}?\nהפעולה תמחק: לוגים, הקלטות, אבחונים, משימות AI, ולא ניתן לבטל.`)) return;
    
    try {
      // 1. Fetch existing record to keep identity fields (name, classId)
      const existingSnap = await get(ref(database, `users/students/${studentId}`));
      const existing = existingSnap.val() || {};

      let cleanName = existing.name || studentId;
      if (cleanName === 'student' || cleanName === 'student_user1' || cleanName.toLowerCase().startsWith('student_')) {
          cleanName = studentId.replace('student_', '');
      }

      // 2. Write a clean slate — preserve only identity, wipe all progress
      await set(ref(database, `users/students/${studentId}`), {
        studentId,
        name: cleanName,
        classId: existing.classId || 'class_1',
        completedMeeting2: false,
        routeStatus: null,
        routeRecommendation: null,
        qMatrixResults: null,
        traceData: { hesitation_events: 0, undo_clicks: 0 },
        workspaceState: {
          sessionNumber: 1,
          isASD: false,
          standardTaskIdx: 0,
          qflow: { step: 0, results: {} },
          flowStatus: 'IDLE',
          counts: { single: 0, ten: 0 },
          packagedBlocks: [],
          undoCount: 0,
          hesitationCount: 0,
          hasInteracted: false,
          aiTasks: []
        }
      });

      // 3. Clear all related Firebase paths
      await Promise.all([
        remove(ref(database, `students/${studentId}/telemetry_chunks`)),
        remove(ref(database, `approved_tasks/${studentId}`)),
        remove(ref(database, `replays/${studentId}`)),
        remove(ref(database, `ai_pending_approvals/039604483/${studentId}`)).catch(() => {}),
        remove(ref(database, `ai_pending_approvals/teacher-1/${studentId}`)).catch(() => {}),
      ]);

      // 4. Clean up any orphaned radar alerts for this student
      try {
        const alertsSnap = await get(ref(database, 'radar_alerts'));
        const alertsData = alertsSnap.val();
        if (alertsData) {
          const rawId = studentId.replace('student_', '');
          const deletePromises = Object.keys(alertsData)
            .filter(key => {
              const a = alertsData[key];
              return a.student === studentId || a.student === rawId || a.rawStudentId === studentId || a.username === studentId || a.username === rawId;
            })
            .map(key => remove(ref(database, `radar_alerts/${key}`)));
          await Promise.all(deletePromises);
        }
      } catch (err) {
        console.warn('Failed to clean up radar alerts:', err);
      }

      alert('✅ הנתונים אופסו בהצלחה. התלמיד מוכן להתחיל מחדש.');
      setSelectedStudent(null);
    } catch (err: any) {
      console.error('Reset failed:', err);
      alert(`שגיאה באיפוס נתונים: ${err?.message || err}`);
    }
  };

  const handleChangeSession = async (studentId: string, newSession: number) => {
    if (!window.confirm(`להעביר את התלמיד/ה למפגש ${newSession}?`)) return;
    try {
      await set(ref(database, `users/students/${studentId}/workspaceState/sessionNumber`), newSession);
      await set(ref(database, `users/students/${studentId}/workspaceState/flowStatus`), 'IDLE');
      if (newSession > 2) {
        await set(ref(database, `users/students/${studentId}/completedMeeting2`), true);
      }
      alert(`✅ הועבר למפגש ${newSession}.`);
      setSelectedStudent(null);
    } catch (err: any) {
      alert(`שגיאה: ${err.message}`);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full h-full flex flex-col animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-2">
          <Users className="w-8 h-8 text-indigo-500" />
          ניהול כיתה
        </h1>
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <span className="bg-slate-200 px-3 py-1 rounded-md">{currentSchool?.name || 'ביקורת'}</span>
          <span>&gt;</span>
          <span className="bg-slate-200 px-3 py-1 rounded-md">{currentClass?.name || 'כיתה 1'}</span>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6 flex gap-4 items-start shadow-sm">
        <ShieldCheck className="text-amber-600 w-6 h-6 shrink-0 mt-1" />
        <div>
          <h3 className="font-bold text-amber-900">הנחיית פרטיות ואבטחת מידע</h3>
          <p className="text-sm text-amber-800 mt-1">
            מטעמי פרטיות והנחיות המערכת, שמות התלמידים מיוצגים במערכת באופן אנונימי כ-<code>user1</code> עד <code>user30</code>.
            שיוך הזיהוי האנונימי לשם התלמיד האמיתי ייעשה אך ורק באמצעות הקובץ השמי המאובטח (Secure List) המנוהל חיצונית על ידי המורה ומנהל המערכת.
          </p>
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex gap-4 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש לפי קוד משתמש (לדוגמה: user5)" 
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center px-4 bg-indigo-50 text-indigo-700 font-bold rounded-xl text-sm border border-indigo-100">
            סה"כ תלמידים: {allStudents.length}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-right relative">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-md z-10 shadow-sm">
              <tr className="text-slate-500 dark:text-slate-400 text-sm">
                <th className="py-4 px-6 font-medium">קוד זיהוי (מערכת)</th>
                <th className="py-4 px-6 font-medium">סטטוס שלב ב' (אבחון)</th>
                <th className="py-4 px-6 font-medium">המלצת מסלול אדפטיבי</th>
                <th className="py-4 px-6 font-medium text-left">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredStudents.map(student => (
                <tr key={student.studentId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-200 text-lg font-mono">
                    {student.name || (student.studentId ? student.studentId.replace(/^student_/, '') : 'תלמיד חדש')}
                  </td>
                  <td className="py-4 px-6">
                    {student.completedMeeting2 ? (
                      <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">סיים מפגש 2</span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 text-xs font-bold px-3 py-1 rounded-full">טרם סיים</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-sm">
                    {student.routeStatus === 'APPROVED' ? (
                      <span className="text-indigo-600 font-bold bg-indigo-50 px-3 py-1 rounded-full">אושר: {student.routeRecommendation}</span>
                    ) : student.routeStatus === 'PENDING' ? (
                      <span className="text-amber-600 font-bold bg-amber-50 px-3 py-1 rounded-full">ממתין לאישור מורה</span>
                    ) : (
                      <span className="text-slate-400">אין המלצה</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-left">
                    <button
                      onClick={() => setSelectedStudent(student)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors border border-indigo-100"
                      title="ניהול תלמיד ושליטה על תהליך הלמידה"
                    >
                      <Settings className="w-4 h-4" />
                      ניהול ובקרה
                    </button>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-500">
                    לא נמצאו תלמידים.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Control Panel Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Settings className="text-indigo-500 w-5 h-5" />
                לוח בקרה: {selectedStudent.name}
              </h2>
              <button 
                onClick={() => setSelectedStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6">
              
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5">
                <h3 className="font-bold text-blue-900 mb-3 text-sm flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-blue-500" />
                  הקפצה והעברת שלבים
                </h3>
                <p className="text-xs text-blue-700 mb-4">במידה והתלמיד נתקע, ניתן להעביר אותו ידנית למפגש הבא או להחזיר אותו אחורה. יש לרענן את מסך התלמיד לאחר מכן.</p>
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map(session => (
                    <button
                      key={session}
                      onClick={() => handleChangeSession(selectedStudent.studentId, session)}
                      className="bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-bold py-2 px-4 rounded-xl transition-colors shadow-sm text-sm"
                    >
                      העבר למפגש {session}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-red-50/50 border border-red-100 rounded-2xl p-5">
                <h3 className="font-bold text-red-900 mb-3 text-sm flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-red-500" />
                  איפוס נתונים מלא (סכנת מחיקה)
                </h3>
                <p className="text-xs text-red-700 mb-4">מוחק את כל ההקלטות, פערים שאובחנו ומשימות AI שהוקצו לתלמיד. מחזיר את המערכת למצב חלק לחלוטין כמו ביום הראשון.</p>
                <button
                  onClick={() => handleResetStudent(selectedStudent.studentId)}
                  className="w-full bg-red-100 hover:bg-red-200 text-red-700 font-bold py-3 px-4 rounded-xl transition-colors shadow-sm text-sm flex justify-center items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  אפס את התלמיד והתחל מחדש
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

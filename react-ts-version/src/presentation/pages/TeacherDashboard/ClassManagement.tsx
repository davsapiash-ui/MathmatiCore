import { useAdminStore } from '@/application/useAdminStore';
import { ShieldCheck, Users, Search, RotateCcw, Settings, X } from 'lucide-react';
import { useState } from 'react';
import { useStore, type StudentData } from '@/application/useStore';
import { database } from '@/infrastructure/firebase';
import { ref, get, remove, update } from 'firebase/database';

export function ClassManagement({ allStudents }: { allStudents: StudentData[] }) {
  const classes = useAdminStore(s => s.classes);
  const schools = useAdminStore(s => s.schools);
  const teacherId = useStore(s => s.currentUserId);
  
  // We're working with a single default school & class based on the strict hierarchy
  const currentClass = classes[0];
  const currentSchool = schools.find(s => s.id === currentClass?.schoolId);
  
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);

  // Reset Modal State
  const [resetModalOptions, setResetModalOptions] = useState<{
    show: boolean;
    studentId: string;
    options: {
      progress: boolean;
      diagnostics: boolean;
      recordings: boolean;
      teacherHints: boolean;
      chat: boolean;
      reflections: boolean;
    };
  } | null>(null);

  const handleResetStudent = async () => {
    if (!resetModalOptions) return;
    const { studentId, options } = resetModalOptions;
    
    try {
      // 1. Fetch existing record to keep identity fields (name, classId)
      const existingSnap = await get(ref(database, `users/students/${studentId}`));
      const existing = existingSnap.val() || {};

      let cleanName = existing.name || studentId;
      if (cleanName === 'student' || cleanName === 'student_user1' || cleanName.toLowerCase().startsWith('student_')) {
          cleanName = studentId.replace('student_', '');
      }

      // 2. Write a clean slate — preserve identity, wipe progress
      const updatePayload: any = { forceReload: Date.now() };
      
      if (options.progress) {
        updatePayload.completedMeeting2 = false;
        updatePayload.workspaceState = {
          sessionNumber: 1,
          isASD: false,
          standardTaskIdx: 0,
          qflow: { step: 0, results: {} },
          flowStatus: 'IDLE',
          counts: { single: 0, ten: 0 },
          undoCount: 0,
          hesitationCount: 0,
          hasInteracted: false,
          aiTasks: []
        };
      }
      
      if (options.diagnostics) {
        updatePayload.routeStatus = null;
        updatePayload.routeRecommendation = null;
        updatePayload.qMatrixResults = null;
        updatePayload.traceData = { hesitation_events: 0, undo_clicks: 0 };
      }

      await update(ref(database, `users/students/${studentId}`), updatePayload);

      // 3. Clear all related Firebase paths based on options
      const pathsToDelete = [];
      
      if (options.recordings) {
        pathsToDelete.push(`users/students/${studentId}/telemetry_chunks`);
        pathsToDelete.push(`replays/${studentId}`);
      }
      
      if (options.teacherHints) {
        pathsToDelete.push(`users/students/${studentId}/teacher_hint`);
      }
      
      if (options.progress) {
        pathsToDelete.push(`approved_tasks/${studentId}`);
        if (teacherId) pathsToDelete.push(`ai_pending_approvals/${teacherId}/${studentId}`);
      }

      await Promise.all(pathsToDelete.map(path => remove(ref(database, path)).catch(e => console.warn(path, e))));

      // 4. Clean up any orphaned radar alerts for this student (tied to diagnostics/progress)
      if (options.progress || options.diagnostics) {
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
      }
      
      // 5. Clean up chat history
      if (options.chat && teacherId) {
        const roomId = `${teacherId}_${studentId}`;
        await remove(ref(database, `chat_messages/${roomId}`)).catch(e => console.warn('chat', e));
      }

      // 6. Clean up reflections
      if (options.reflections) {
        try {
          const reflectionsSnap = await get(ref(database, 'reflections'));
          const reflectionsData = reflectionsSnap.val();
          if (reflectionsData) {
            const rawId = studentId.replace('student_', '');
            const deletePromises = Object.keys(reflectionsData)
              .filter(key => {
                const r = reflectionsData[key];
                return r?.student?.id === studentId || r?.student?.id === rawId;
              })
              .map(key => remove(ref(database, `reflections/${key}`)));
            await Promise.all(deletePromises);
          }
        } catch (err) {
          console.warn('Failed to clean up reflections:', err);
        }
      }

      alert('✅ הנתונים אופסו בהצלחה. התלמיד יכול להתחיל מחדש.');
      setResetModalOptions(null);
      setSelectedStudent(null);
    } catch (err: unknown) {
      console.error('Reset failed:', err);
      const e = err as Error;
      alert(`שגיאה באיפוס נתונים: ${e?.message || 'Unknown error'}`);
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
              
              <div className="bg-red-50/50 border border-red-100 rounded-2xl p-5">
                <h3 className="font-bold text-red-900 mb-3 text-sm flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-red-500" />
                  איפוס נתונים
                </h3>
                <p className="text-xs text-red-700 mb-4">בחר איזה נתונים ברצונך למחוק לאפס עבור תלמיד זה.</p>
                <button
                  onClick={() => setResetModalOptions({
                    show: true,
                    studentId: selectedStudent.studentId,
                    options: {
                      progress: true,
                      diagnostics: true,
                      recordings: true,
                      teacherHints: true,
                      chat: true,
                      reflections: true
                    }
                  })}
                  className="w-full bg-red-100 hover:bg-red-200 text-red-700 font-bold py-3 px-4 rounded-xl transition-colors shadow-sm text-sm flex justify-center items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  אפשרויות איפוס נתונים...
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Reset Options Modal */}
      {resetModalOptions && resetModalOptions.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-red-50 dark:bg-red-900/20">
              <h2 className="text-xl font-black text-red-800 dark:text-red-400 flex items-center gap-2">
                <RotateCcw className="w-5 h-5" />
                איפוס נתונים - בחירת רכיבים
              </h2>
              <button 
                onClick={() => setResetModalOptions(null)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
              <div className="text-sm text-slate-600 mb-2">
                סמן אילו נתונים של התלמיד יאופסו ויימחקו לצמיתות:
              </div>

              {[
                { key: 'progress', label: 'התקדמות במשימות וסטטוס במרחב העבודה' },
                { key: 'diagnostics', label: 'תוצאות אבחון ורדאר פדגוגי' },
                { key: 'recordings', label: 'הקלטות מסך (Telemetry)' },
                { key: 'teacherHints', label: 'רמזים פתוחים מהמורה' },
                { key: 'chat', label: 'היסטוריית הצ\'אט הישיר' },
                { key: 'reflections', label: 'משובים ורפלקציות' },
              ].map((opt) => (
                <label key={opt.key} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-lg">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-red-500 rounded"
                    checked={(resetModalOptions.options as any)[opt.key]}
                    onChange={(e) => setResetModalOptions({
                      ...resetModalOptions,
                      options: {
                        ...resetModalOptions.options,
                        [opt.key]: e.target.checked
                      }
                    })}
                  />
                  <span className="text-slate-800 font-medium">{opt.label}</span>
                </label>
              ))}

              <div className="mt-4 pt-4 border-t border-slate-100 flex gap-3">
                <button
                  onClick={handleResetStudent}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all shadow-sm shadow-red-200"
                >
                  בצע איפוס
                </button>
                <button
                  onClick={() => setResetModalOptions(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

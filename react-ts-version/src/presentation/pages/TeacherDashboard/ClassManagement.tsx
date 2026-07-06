import { useAdminStore } from '@/application/useAdminStore';
import { ShieldCheck, Users, Search, RotateCcw } from 'lucide-react';
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

  const filteredStudents = allStudents.filter(s => (s.name || s.studentId || '').toLowerCase().includes(search.toLowerCase()));

  const handleResetStudent = async (studentId: string) => {
    if (!window.confirm(`האם אתה בטוח שברצונך לאפס את כל ההתקדמות והנתונים של תלמיד ${studentId}?\nהפעולה תמחק: לוגים, הקלטות, אבחונים, משימות AI, ולא ניתן לבטל.`)) return;
    
    try {
      // 1. Fetch existing record to keep identity fields (name, classId)
      const existingSnap = await get(ref(database, `users/students/${studentId}`));
      const existing = existingSnap.val() || {};

      // 2. Write a clean slate — preserve only identity, wipe all progress
      await set(ref(database, `users/students/${studentId}`), {
        studentId,
        name: existing.name || studentId,
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
        // Clear AI pending approvals for all known teacher IDs
        remove(ref(database, `ai_pending_approvals/039604483`)).catch(() => {}),
        remove(ref(database, `ai_pending_approvals/teacher-1`)).catch(() => {}),
      ]);

      alert('✅ הנתונים אופסו בהצלחה. התלמיד מוכן להתחיל מחדש.');
    } catch (err: any) {
      console.error('Reset failed:', err);
      alert(`שגיאה באיפוס נתונים: ${err?.message || err}`);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full animate-in fade-in duration-500">
      
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        
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

        <div className="max-h-[60vh] overflow-y-auto">
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
                    {student.name || student.studentId || 'תלמיד חדש'}
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
                      onClick={() => handleResetStudent(student.studentId)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 text-xs font-bold rounded-md transition-colors border border-red-100"
                      title="איפוס כל נתוני התלמיד והתחלה מחדש"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      איפוס
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

    </div>
  );
}

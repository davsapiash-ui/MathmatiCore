import { type StudentData } from '@/application/useStore';
import { Settings } from 'lucide-react';

interface Props {
  students: StudentData[];
  onSelectStudent: (student: StudentData) => void;
  pendingApprovals: Set<string>; // Set of student IDs that are pending approval in the gate
}

export function StudentList({ students, onSelectStudent, pendingApprovals }: Props) {
  // Sort students: those pending approval first
  const sortedStudents = [...students].sort((a, b) => {
    const aPending = pendingApprovals.has(a.studentId) || a.routeStatus === 'PENDING' ? 1 : 0;
    const bPending = pendingApprovals.has(b.studentId) || b.routeStatus === 'PENDING' ? 1 : 0;
    return bPending - aPending; // Higher pending value goes to top
  });

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-[300px]">
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-right relative">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-md z-10 shadow-sm border-b border-slate-200 dark:border-slate-800">
            <tr className="text-slate-500 dark:text-slate-400 text-sm">
              <th className="py-4 px-6 font-medium">שם התלמיד</th>
              <th className="py-4 px-6 font-medium">סטטוס פדגוגי</th>
              <th className="py-4 px-6 font-medium">שלב נוכחי</th>
              <th className="py-4 px-6 font-medium text-left">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedStudents.map(student => {
              const isPending = pendingApprovals.has(student.studentId) || student.routeStatus === 'PENDING';
              
              return (
                <tr 
                  key={student.studentId} 
                  className={`transition-colors ${isPending ? 'bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-900/10 dark:hover:bg-amber-900/20' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30'}`}
                >
                  <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-200 text-lg">
                    <div className="flex items-center gap-3">
                      {student.name || student.studentId.replace(/^student_/, '')}
                      {isPending && (
                        <span className="animate-pulse bg-amber-500 rounded-full w-2 h-2" title="ממתין לאישור" />
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    {isPending ? (
                      <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 text-xs font-bold px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800/50">
                        ממתין בשער האישור
                      </span>
                    ) : student.routeStatus === 'APPROVED' ? (
                      <span className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 text-xs font-bold px-3 py-1 rounded-full border border-green-200 dark:border-green-800/50">
                        מסלול אושר
                      </span>
                    ) : student.completedMeeting2 ? (
                      <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 text-xs font-bold px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800/50">
                        מוכן לאבחון
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-xs font-bold px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                        בתהליך חקר
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400">
                    {student.workspaceState ? `מפגש ${student.workspaceState.sessionNumber} - משימה ${student.workspaceState.standardTaskIdx + 1}` : 'התחברות ראשונית'}
                  </td>
                  <td className="py-4 px-6 text-left">
                    <button
                      onClick={() => onSelectStudent(student)}
                      className={`inline-flex items-center gap-2 px-4 py-2 font-bold rounded-lg transition-colors border ${
                        isPending 
                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700' 
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-800'
                      }`}
                      title="פתיחת תיק תלמיד"
                    >
                      <Settings className="w-4 h-4" />
                      {isPending ? 'סקור ואשר' : 'תיק תלמיד'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {sortedStudents.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-500">
                  לא נמצאו תלמידים העונים לסינון.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

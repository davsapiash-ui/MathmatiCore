import { useState } from 'react';
import { type StudentData } from '@/application/useStore';
import { X, CheckCircle, Video, ListTodo } from 'lucide-react';
import { StudentReplayAndLogs } from './StudentReplayAndLogs';
import { BlueprintEditor } from './BlueprintEditor';

interface Props {
  student: StudentData | null;
  onClose: () => void;
  isPendingApproval: boolean;
  onApproveTasks?: (studentId: string) => Promise<void>;
}

export function StudentSideDrawer({ student, onClose, isPendingApproval, onApproveTasks }: Props) {
  const [activeTab, setActiveTab] = useState<'replays' | 'blueprint'>(isPendingApproval ? 'blueprint' : 'replays');

  if (!student) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      <div className="fixed top-0 right-0 w-full sm:w-[600px] h-[100dvh] bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 border-l border-slate-200 dark:border-slate-800">
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {student.name || student.studentId}
            </h2>
            {isPendingApproval && (
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-md border border-amber-200">
                ממתין לאישור
              </span>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 pt-2 bg-slate-50/50 dark:bg-slate-800/20">
          <button
            onClick={() => setActiveTab('replays')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'replays'
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Video className="w-4 h-4" />
            אבחון והקלטות
          </button>
          <button
            onClick={() => setActiveTab('blueprint')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'blueprint'
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ListTodo className="w-4 h-4" />
            תוכנית עבודה ואישור
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-slate-900">
          {activeTab === 'replays' && (
            <div className="animate-in fade-in duration-300">
              <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-slate-200">נתוני אבחון AI (Q-Matrix)</h3>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {Object.entries(student.conceptMastery || {}).map(([key, val]) => (
                  <div key={key} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl flex justify-between items-center shadow-sm">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      {key.replace('_', ' ')}
                    </span>
                    <span className={`font-bold text-sm ${val < 0.8 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                ))}
              </div>
              
              <StudentReplayAndLogs studentId={student.studentId} />
            </div>
          )}

          {activeTab === 'blueprint' && (
            <div className="animate-in fade-in duration-300 flex flex-col h-full">
              <BlueprintEditor student={student} />
              
              {isPendingApproval && onApproveTasks && (
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                  <button
                    onClick={() => onApproveTasks(student.studentId)}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
                  >
                    <CheckCircle className="w-5 h-5" />
                    אשר תוכנית למפגש הבא
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

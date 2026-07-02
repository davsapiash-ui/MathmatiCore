import { useState } from 'react';
import { UdlButton } from '@/presentation/design-system/UdlButton';
import { Users, UserPlus, MoreVertical, Search } from 'lucide-react';

export function ClassManagement() {
  const [students, setStudents] = useState([
    { id: '1', name: 'אבי כהן', username: 'avi.c', level: 'מתקדם', lastActive: 'לפני שעתיים' },
    { id: '2', name: 'שירה לוי', username: 'shira.l', level: 'בינוני', lastActive: 'אתמול' },
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');

  const handleAddStudent = () => {
    if (!newStudentName.trim()) return;
    
    const newStudent = {
      id: Date.now().toString(),
      name: newStudentName,
      username: newStudentName.toLowerCase().replace(' ', '.'),
      level: 'מתחיל',
      lastActive: 'טרם התחבר'
    };
    
    setStudents([...students, newStudent]);
    setNewStudentName('');
    setIsAdding(false);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-indigo-500" />
            ניהול כיתה
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            כאן תוכל להקים תלמידים חדשים, לנהל את הסיסמאות שלהם ולעקוב אחרי החיבור האחרון.
          </p>
        </div>
        
        <UdlButton 
          semanticColor="primary" 
          className="gap-2 font-bold shadow-lg shadow-indigo-500/20"
          onClick={() => setIsAdding(true)}
        >
          <UserPlus className="w-5 h-5" />
          הקמת תלמיד חדש
        </UdlButton>
      </div>

      {/* Add Student Quick Form */}
      {isAdding && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-6 mb-8 flex gap-4 items-end animate-in slide-in-from-top-4">
          <div className="flex-1">
            <label className="block text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-2">שם התלמיד המלא</label>
            <input 
              type="text" 
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="לדוגמה: דניאל שלום"
              autoFocus
            />
          </div>
          <UdlButton onClick={handleAddStudent} semanticColor="primary" className="h-12 px-8">שמור תלמיד</UdlButton>
          <UdlButton onClick={() => setIsAdding(false)} variant="outline" className="h-12 border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300">ביטול</UdlButton>
        </div>
      )}

      {/* Roster Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex gap-4 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="חיפוש תלמיד..." 
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <table className="w-full text-right">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-sm">
              <th className="py-4 px-6 font-medium">שם התלמיד</th>
              <th className="py-4 px-6 font-medium">שם משתמש (להתחברות)</th>
              <th className="py-4 px-6 font-medium">רמה פדגוגית</th>
              <th className="py-4 px-6 font-medium">חיבור אחרון</th>
              <th className="py-4 px-6 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {students.map(student => (
              <tr key={student.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-200">
                  {student.name}
                </td>
                <td className="py-4 px-6 font-mono text-sm text-slate-600 dark:text-slate-400">
                  {student.username}
                </td>
                <td className="py-4 px-6">
                  <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold px-3 py-1 rounded-full">
                    {student.level}
                  </span>
                </td>
                <td className="py-4 px-6 text-sm text-slate-500 dark:text-slate-500">
                  {student.lastActive}
                </td>
                <td className="py-4 px-6 text-center">
                  <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-500">
                  אין תלמידים בכיתה עדיין. לחץ על "הקמת תלמיד חדש".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}

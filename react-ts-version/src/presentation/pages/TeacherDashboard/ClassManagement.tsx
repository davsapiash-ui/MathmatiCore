import { useAdminStore } from '@/application/useAdminStore';
import { ShieldCheck, Users } from 'lucide-react';
import { useStore, type StudentData } from '@/application/useStore';
import { HeatmapGrid } from './components/HeatmapGrid';

export function ClassManagement({ allStudents }: { allStudents: StudentData[] }) {
  const classes = useAdminStore(s => s.classes);
  const schools = useAdminStore(s => s.schools);
  
  // We're working with a single default school & class based on the strict hierarchy
  const currentClass = classes[0];
  const currentSchool = schools.find(s => s.id === currentClass?.schoolId);
  
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

      {/* Heatmap Grid and Live Feed */}
      <HeatmapGrid />
    </div>
  );
}

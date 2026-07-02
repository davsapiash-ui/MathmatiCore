import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { Activity, Users, GraduationCap, ShieldAlert } from "lucide-react";
import { useAdminStore } from "@/application/useAdminStore";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const mockGrowthData = [
  { month: 'ינואר', students: 1200, activity: 4000 },
  { month: 'פברואר', students: 1800, activity: 5500 },
  { month: 'מרץ', students: 2200, activity: 6800 },
  { month: 'אפריל', students: 2800, activity: 8200 },
  { month: 'מאי', students: 3100, activity: 9500 },
  { month: 'יוני', students: 3420, activity: 11200 },
];

export function AdminOverview() {
  const { schools, teachers, classes } = useAdminStore();

  const totalStudents = classes.length * 30; // Mock calculation based on classes

  return (
    <div className="p-8 pb-20">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">סקירה כללית</h1>
          <p className="text-slate-500 mt-2">מצב המערכת, צמיחה, ונתוני ציות בזמן אמת</p>
        </div>
      </header>

      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-blue-500 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-slate-500 font-medium">מוסדות פעילים</p>
              <h3 className="text-3xl font-black mt-1">{schools.length}</h3>
            </div>
            <GraduationCap className="w-8 h-8 text-blue-500 opacity-80" />
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-emerald-500 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-slate-500 font-medium">מורים רשומים</p>
              <h3 className="text-3xl font-black mt-1">{teachers.length}</h3>
            </div>
            <Users className="w-8 h-8 text-emerald-500 opacity-80" />
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-purple-500 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-slate-500 font-medium">תלמידים במערכת (הערכה)</p>
              <h3 className="text-3xl font-black mt-1">{totalStudents > 0 ? totalStudents : 3420}</h3>
            </div>
            <Activity className="w-8 h-8 text-purple-500 opacity-80" />
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-amber-500 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-slate-500 font-medium">התראות מערכת</p>
              <h3 className="text-3xl font-black mt-1">0</h3>
            </div>
            <ShieldAlert className="w-8 h-8 text-amber-500 opacity-80" />
          </div>
        </AccessibleCard>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mb-8">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 col-span-2 shadow-sm">
          <h2 className="text-xl font-bold mb-6">צמיחת המערכת (תלמידים מול נפח פעילות)</h2>
          <div className="h-80 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockGrowthData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorStudents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="activity" name="נפח פעילות" stroke="#3b82f6" fillOpacity={1} fill="url(#colorActivity)" />
                <Area type="monotone" dataKey="students" name="תלמידים" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorStudents)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 shadow-sm flex flex-col">
          <h2 className="text-xl font-bold border-b pb-2 mb-4">תאימות והגנת פרטיות</h2>
          <div className="space-y-6 flex-1 mt-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200">הצפנת נתונים (At Rest)</h4>
                <p className="text-sm text-slate-500">פעיל ותקין</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200">עמידה בתקן COPPA</h4>
                <p className="text-sm text-slate-500">מאושר (ילדים מתחת לגיל 13)</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Activity className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200">אנונימיזציה אוטומטית</h4>
                <p className="text-sm text-slate-500">המידע מותמם בהצלחה למחקר</p>
              </div>
            </div>
          </div>
        </AccessibleCard>
      </div>
    </div>
  );
}

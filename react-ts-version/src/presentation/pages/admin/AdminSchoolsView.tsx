import { useState } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Plus, Users, Settings } from "lucide-react";

export function AdminSchoolsView() {
  const [schools] = useState([
    { id: 1, name: "ביה״ס הדרים", teachers: 12, classes: 24, students: 420 },
    { id: 2, name: "חטיבת ביניים אלון", teachers: 8, classes: 16, students: 310 }
  ]);

  return (
    <div className="p-8">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">ניהול מוסדות ומורים</h1>
          <p className="text-slate-500">הקמת בתי ספר, הוספת מורים והגדרת כיתות לימוד</p>
        </div>
        <UdlButton semanticColor="primary" className="gap-2">
          <Plus className="w-5 h-5" />
          מוסד חדש
        </UdlButton>
      </header>

      {/* Quick Actions / Configuration */}
      <AccessibleCard className="p-6 bg-white dark:bg-slate-900 mb-8 border-r-4 border-r-blue-500">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          הגדרות כיתה גלובליות
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-200">מגבלת תלמידים לכיתה תקנית</p>
            <p className="text-sm text-slate-500">מספר המקסימום המותר לרישום תלמידים בכל כיתה רגילה. ברירת מחדל: 35</p>
          </div>
          <div className="flex items-center gap-4">
            <input 
              type="number" 
              defaultValue={35}
              className="w-20 text-center border-2 border-slate-200 dark:border-slate-700 rounded-lg p-2 font-bold focus:border-blue-500 outline-none bg-transparent" 
            />
            <UdlButton semanticColor="secondary">שמור הגדרה</UdlButton>
          </div>
        </div>
      </AccessibleCard>

      <div className="grid lg:grid-cols-2 gap-8">
        {schools.map(school => (
          <AccessibleCard key={school.id} className="p-0 overflow-hidden bg-white dark:bg-slate-900 flex flex-col">
            <div className="bg-slate-50 dark:bg-slate-950 p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{school.name}</h3>
                <p className="text-slate-500 text-sm">מזהה מוסד: #{school.id * 1024}</p>
              </div>
              <UdlButton variant="outline" semanticColor="neutral" className="text-sm">נהל מוסד</UdlButton>
            </div>
            
            <div className="p-6 flex-1">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-center">
                  <p className="text-sm text-blue-600 dark:text-blue-400 font-bold mb-1">מורים</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{school.teachers}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl text-center">
                  <p className="text-sm text-purple-600 dark:text-purple-400 font-bold mb-1">כיתות</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{school.classes}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl text-center">
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-bold mb-1">תלמידים</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{school.students}</p>
                </div>
              </div>

              <div className="flex gap-3 mt-auto">
                <UdlButton semanticColor="primary" className="flex-1 gap-2">
                  <Users className="w-4 h-4" />
                  הוסף מורה
                </UdlButton>
                <UdlButton semanticColor="secondary" className="flex-1 gap-2">
                  <Plus className="w-4 h-4" />
                  הקם כיתה חדשה
                </UdlButton>
              </div>
            </div>
          </AccessibleCard>
        ))}
      </div>
    </div>
  );
}

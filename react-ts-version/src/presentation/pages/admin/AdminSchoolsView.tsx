import { useState } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Plus, Users, Settings, Trash2 } from "lucide-react";
import { useAdminStore } from "@/application/useAdminStore";

export function AdminSchoolsView() {
  const { 
    schools, 
    teachers, 
    classes, 
    globalStudentLimit, 
    setGlobalStudentLimit,
    addSchool,
    deleteSchool,
    addTeacher,
    deleteTeacher,
    addClassRoom,
    deleteClassRoom
  } = useAdminStore();

  const [limitInput, setLimitInput] = useState(globalStudentLimit.toString());

  const handleAddSchool = () => {
    const name = window.prompt("שם המוסד:");
    if (name) addSchool(name);
  };

  const handleAddTeacher = (schoolId: string) => {
    const name = window.prompt("שם המורה:");
    if (!name) return;
    const taz = window.prompt("תעודת זהות (9 ספרות):");
    if (!taz) return;
    const dob = window.prompt("תאריך לידה (6 ספרות - DDMMYY):");
    if (!dob) return;

    addTeacher(schoolId, name, taz, dob);
  };

  const handleAddClass = (schoolId: string) => {
    const schoolTeachers = teachers.filter(t => t.schoolId === schoolId);
    if (schoolTeachers.length === 0) {
      alert("יש להוסיף מורה למוסד לפני הקמת כיתה.");
      return;
    }

    const name = window.prompt("שם הכיתה (לדוגמה: א'1):");
    if (!name) return;
    
    const teacherId = schoolTeachers[0].id; // Assign to first teacher by default for simplicity in UI
    addClassRoom(schoolId, teacherId, name);
  };

  const handleSaveLimit = () => {
    const num = parseInt(limitInput);
    if (!isNaN(num) && num > 0) {
      setGlobalStudentLimit(num);
      alert("מגבלת התלמידים עודכנה בהצלחה.");
    }
  };

  return (
    <div className="p-8">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">ניהול מוסדות ומורים</h1>
          <p className="text-slate-500">הקמת בתי ספר, הוספת מורים והגדרת כיתות לימוד</p>
        </div>
        <UdlButton semanticColor="primary" className="gap-2" onClick={handleAddSchool}>
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
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="w-20 text-center border-2 border-slate-200 dark:border-slate-700 rounded-lg p-2 font-bold focus:border-blue-500 outline-none bg-transparent" 
            />
            <UdlButton semanticColor="secondary" onClick={handleSaveLimit}>שמור הגדרה</UdlButton>
          </div>
        </div>
      </AccessibleCard>

      <div className="grid lg:grid-cols-2 gap-8">
        {schools.length === 0 && (
          <div className="col-span-2 text-center py-12 text-slate-500">
            לא הוקמו מוסדות עדיין. לחץ על "מוסד חדש" כדי להתחיל.
          </div>
        )}
        
        {schools.map(school => {
          const schoolTeachers = teachers.filter(t => t.schoolId === school.id);
          const schoolClasses = classes.filter(c => c.schoolId === school.id);

          return (
            <AccessibleCard key={school.id} className="p-0 overflow-hidden bg-white dark:bg-slate-900 flex flex-col">
              <div className="bg-slate-50 dark:bg-slate-950 p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{school.name}</h3>
                  <p className="text-slate-500 text-sm font-mono mt-1">{school.id}</p>
                </div>
                <button 
                  onClick={() => { if(window.confirm('למחוק מוסד זה?')) deleteSchool(school.id); }}
                  className="text-red-500 hover:text-red-700 transition-colors p-2"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 flex-1 flex flex-col">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-center">
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-bold mb-1">מורים</p>
                    <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{schoolTeachers.length}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl text-center">
                    <p className="text-sm text-purple-600 dark:text-purple-400 font-bold mb-1">כיתות</p>
                    <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{schoolClasses.length}</p>
                  </div>
                </div>

                {/* List Teachers */}
                {schoolTeachers.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-bold text-sm text-slate-600 mb-2">צוות המורים:</h4>
                    <div className="space-y-2">
                      {schoolTeachers.map(t => (
                        <div key={t.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded text-sm">
                          <div>
                            <span className="font-bold">{t.name}</span>
                            <span className="text-slate-500 mr-2 text-xs">ת"ז: {t.taz} | ססמה: {t.dob}</span>
                          </div>
                          <button onClick={() => deleteTeacher(t.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* List Classes */}
                {schoolClasses.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-bold text-sm text-slate-600 mb-2">כיתות מוגדרות:</h4>
                    <div className="space-y-2">
                      {schoolClasses.map(c => (
                        <div key={c.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded text-sm">
                          <span className="font-bold">{c.name}</span>
                          <button onClick={() => deleteClassRoom(c.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                  <UdlButton semanticColor="primary" className="flex-1 gap-2 text-sm" onClick={() => handleAddTeacher(school.id)}>
                    <Users className="w-4 h-4" />
                    הוסף מורה
                  </UdlButton>
                  <UdlButton semanticColor="secondary" className="flex-1 gap-2 text-sm" onClick={() => handleAddClass(school.id)}>
                    <Plus className="w-4 h-4" />
                    הקם כיתה
                  </UdlButton>
                </div>
              </div>
            </AccessibleCard>
          );
        })}
      </div>
    </div>
  );
}

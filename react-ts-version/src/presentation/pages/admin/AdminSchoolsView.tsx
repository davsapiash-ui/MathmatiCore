import { useState } from "react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Plus, Users, Settings, Trash2, Building, ShieldCheck, X } from "lucide-react";
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
  
  // UI State for Forms
  const [isAddingSchool, setIsAddingSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");

  const [addingTeacherTo, setAddingTeacherTo] = useState<string | null>(null);
  const [teacherForm, setTeacherForm] = useState({ name: "", taz: "", dob: "" });

  const [addingClassTo, setAddingClassTo] = useState<string | null>(null);
  const [classNameInput, setClassNameInput] = useState("");

  const handleSaveLimit = () => {
    const num = parseInt(limitInput);
    if (!isNaN(num) && num > 0) {
      setGlobalStudentLimit(num);
    }
  };

  const handleCreateSchool = () => {
    if (newSchoolName.trim()) {
      addSchool(newSchoolName.trim());
      setNewSchoolName("");
      setIsAddingSchool(false);
    }
  };

  const handleCreateTeacher = (schoolId: string) => {
    if (teacherForm.name && teacherForm.taz.length >= 8 && teacherForm.dob.length === 6) {
      addTeacher(schoolId, teacherForm.name, teacherForm.taz, teacherForm.dob);
      setTeacherForm({ name: "", taz: "", dob: "" });
      setAddingTeacherTo(null);
    } else {
      alert("נא למלא את כל השדות בצורה תקינה (ת\"ז 9 ספרות, תאריך לידה 6 ספרות).");
    }
  };

  const handleCreateClass = (schoolId: string) => {
    const schoolTeachers = teachers.filter(t => t.schoolId === schoolId);
    if (schoolTeachers.length === 0) {
      alert("יש להוסיף לפחות מורה אחד לפני הקמת כיתה.");
      return;
    }
    if (classNameInput.trim()) {
      addClassRoom(schoolId, schoolTeachers[0].id, classNameInput.trim());
      setClassNameInput("");
      setAddingClassTo(null);
    }
  };

  return (
    <div className="p-8 pb-20 max-w-7xl mx-auto" dir="rtl">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-l from-indigo-400 to-cyan-400 tracking-tight">ניהול פריסת מוסדות ומורים</h1>
          <p className="text-slate-400 mt-2 font-light">ממשק שליטה אדמיניסטרטיבי מתקדם להקמת בתי ספר וכיתות לימוד</p>
        </div>
        <UdlButton 
          semanticColor="primary" 
          className="gap-2 shadow-[0_0_15px_rgba(99,102,241,0.5)] hover:shadow-[0_0_25px_rgba(99,102,241,0.7)] transition-all bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-6"
          onClick={() => setIsAddingSchool(true)}
        >
          <Plus className="w-5 h-5" />
          הקמת מוסד חדש
        </UdlButton>
      </header>

      {/* Global Class Limit */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 p-6 rounded-2xl mb-8 flex flex-col md:flex-row justify-between items-center shadow-lg">
        <div className="flex items-center gap-4 mb-4 md:mb-0">
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
            <Settings className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">מגבלת תפוסה גלובלית</h2>
            <p className="text-sm text-slate-400">מספר המקסימום המותר לרישום תלמידים בכל כיתה רגילה ברחבי המערכת.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="number" 
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            className="w-24 text-center bg-slate-950 border border-slate-700 text-slate-100 rounded-lg p-3 font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-inner" 
          />
          <UdlButton semanticColor="neutral" className="border border-slate-600 hover:bg-slate-800" onClick={handleSaveLimit}>עדכן</UdlButton>
        </div>
      </div>

      {/* Add School Inline Form */}
      {isAddingSchool && (
        <div className="bg-indigo-950/40 backdrop-blur-md border border-indigo-500/30 p-6 rounded-2xl mb-8 shadow-[0_0_20px_rgba(99,102,241,0.1)] flex flex-col md:flex-row gap-4 items-end animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-indigo-300 mb-2">שם המוסד החדש</label>
            <input 
              type="text" 
              autoFocus
              placeholder="לדוגמה: בית ספר אלונים"
              value={newSchoolName}
              onChange={(e) => setNewSchoolName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <UdlButton semanticColor="primary" className="flex-1 bg-indigo-600 hover:bg-indigo-500" onClick={handleCreateSchool}>
              הקם מוסד
            </UdlButton>
            <UdlButton semanticColor="neutral" onClick={() => setIsAddingSchool(false)}>
              ביטול
            </UdlButton>
          </div>
        </div>
      )}

      {/* Schools Grid */}
      <div className="grid lg:grid-cols-2 gap-8">
        {schools.length === 0 && !isAddingSchool && (
          <div className="col-span-2 text-center py-20 border border-dashed border-slate-700 rounded-2xl bg-slate-900/30">
            <Building className="w-16 h-16 mx-auto text-slate-600 mb-4 opacity-50" />
            <p className="text-xl font-bold text-slate-400">טרם הוקמו מוסדות במערכת.</p>
            <p className="text-slate-500 mt-2">לחץ על הקמת מוסד חדש כדי להתחיל באכלוס.</p>
          </div>
        )}
        
        {schools.map(school => {
          const schoolTeachers = teachers.filter(t => t.schoolId === school.id);
          const schoolClasses = classes.filter(c => c.schoolId === school.id);

          return (
            <div key={school.id} className="relative group rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-all duration-300 shadow-xl flex flex-col">
              {/* Card Header */}
              <div className="bg-slate-950 p-6 flex justify-between items-center border-b border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/30">
                    <Building className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-100">{school.name}</h3>
                    <p className="text-slate-500 text-xs font-mono mt-1 opacity-70">ID: {school.id}</p>
                  </div>
                </div>
                <button 
                  onClick={() => { if(window.confirm('מחיקת המוסד תמחק גם את כל המורים והכיתות המשויכים אליו. האם להמשיך?')) deleteSchool(school.id); }}
                  className="text-slate-600 hover:text-red-500 hover:bg-red-500/10 transition-colors p-3 rounded-full"
                  title="מחק מוסד"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 flex-1 flex flex-col">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400 mb-1">סגל הוראה</p>
                      <p className="text-3xl font-black text-indigo-400">{schoolTeachers.length}</p>
                    </div>
                    <Users className="w-8 h-8 text-indigo-900" />
                  </div>
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400 mb-1">כיתות לימוד</p>
                      <p className="text-3xl font-black text-cyan-400">{schoolClasses.length}</p>
                    </div>
                    <ShieldCheck className="w-8 h-8 text-cyan-900" />
                  </div>
                </div>

                {/* Lists */}
                <div className="space-y-6 flex-1">
                  {/* Teachers */}
                  <div>
                    <h4 className="font-bold text-sm text-slate-400 mb-3 border-b border-slate-800 pb-2">מורים פעילים:</h4>
                    {schoolTeachers.length === 0 ? (
                      <p className="text-sm text-slate-600 italic">אין מורים במוסד זה.</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        {schoolTeachers.map(t => (
                          <div key={t.id} className="flex justify-between items-center bg-slate-950 border border-slate-800 hover:border-slate-700 p-3 rounded-lg text-sm transition-colors group/item">
                            <div>
                              <div className="font-bold text-slate-200">{t.name}</div>
                              <div className="text-slate-500 text-xs mt-1">ת"ז (שם משתמש): {t.taz} | סיסמה: {t.dob}</div>
                            </div>
                            <button onClick={() => deleteTeacher(t.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-opacity p-2">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Classes */}
                  <div>
                    <h4 className="font-bold text-sm text-slate-400 mb-3 border-b border-slate-800 pb-2">כיתות מוגדרות:</h4>
                    {schoolClasses.length === 0 ? (
                      <p className="text-sm text-slate-600 italic">אין כיתות במוסד זה.</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        {schoolClasses.map(c => (
                          <div key={c.id} className="flex justify-between items-center bg-slate-950 border border-slate-800 hover:border-slate-700 p-3 rounded-lg text-sm transition-colors group/item">
                            <span className="font-bold text-slate-200">{c.name}</span>
                            <button onClick={() => deleteClassRoom(c.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-opacity p-2">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-8 pt-6 border-t border-slate-800">
                  <UdlButton 
                    semanticColor="neutral" 
                    className="flex-1 gap-2 text-sm bg-slate-800 hover:bg-indigo-600 hover:text-white border-0 transition-colors" 
                    onClick={() => setAddingTeacherTo(school.id)}
                  >
                    <Users className="w-4 h-4" />
                    רישום מורה
                  </UdlButton>
                  <UdlButton 
                    semanticColor="neutral" 
                    className="flex-1 gap-2 text-sm bg-slate-800 hover:bg-cyan-600 hover:text-white border-0 transition-colors" 
                    onClick={() => setAddingClassTo(school.id)}
                  >
                    <Plus className="w-4 h-4" />
                    הקמת כיתה
                  </UdlButton>
                </div>
              </div>

              {/* Add Teacher Overlay */}
              {addingTeacherTo === school.id && (
                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-10 p-6 flex flex-col justify-center animate-in zoom-in-95 duration-200">
                  <button onClick={() => setAddingTeacherTo(null)} className="absolute top-4 left-4 text-slate-400 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                  <h3 className="text-xl font-bold text-white mb-6 text-center">רישום מורה חדש</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">שם מלא</label>
                      <input type="text" value={teacherForm.name} onChange={e => setTeacherForm({...teacherForm, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3" placeholder="ישראל ישראלי" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">תעודת זהות (9 ספרות)</label>
                      <input type="text" maxLength={9} value={teacherForm.taz} onChange={e => setTeacherForm({...teacherForm, taz: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3" placeholder="123456789" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">תאריך לידה (6 ספרות - סיסמה)</label>
                      <input type="text" maxLength={6} value={teacherForm.dob} onChange={e => setTeacherForm({...teacherForm, dob: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3" placeholder="DDMMYY" />
                    </div>
                    <UdlButton semanticColor="primary" className="w-full bg-indigo-600 mt-4" onClick={() => handleCreateTeacher(school.id)}>
                      שמור במערכת
                    </UdlButton>
                  </div>
                </div>
              )}

              {/* Add Class Overlay */}
              {addingClassTo === school.id && (
                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-10 p-6 flex flex-col justify-center animate-in zoom-in-95 duration-200">
                  <button onClick={() => setAddingClassTo(null)} className="absolute top-4 left-4 text-slate-400 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                  <h3 className="text-xl font-bold text-white mb-6 text-center">הקמת כיתת לימוד</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">שם הכיתה</label>
                      <input type="text" value={classNameInput} onChange={e => setClassNameInput(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3" placeholder="לדוגמה: ה'3" />
                    </div>
                    <p className="text-xs text-slate-400 text-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                      הכיתה תשויך אוטומטית למורה הראשון ברשימה. בעתיד יתווסף ממשק שיוך דינמי.
                    </p>
                    <UdlButton semanticColor="primary" className="w-full bg-cyan-600 hover:bg-cyan-500 mt-4" onClick={() => handleCreateClass(school.id)}>
                      הקם כיתה
                    </UdlButton>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

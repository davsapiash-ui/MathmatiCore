import { UdlButton } from '../design-system/UdlButton';
import { Play, Trophy, Star, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function StudentHub() {
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-6xl mx-auto w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Welcome Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-10 text-white shadow-2xl shadow-indigo-500/20 border border-white/10">
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl font-black mb-4 tracking-tight drop-shadow-sm">ברוך שובך, תלמיד! 👋</h1>
          <p className="text-indigo-100 text-lg mb-8 leading-relaxed max-w-xl">
            המשך במסע הלמידה שלך. משימת חיבור וחיסור מחכה לך, בוא נראה מה אתה יודע!
          </p>
          <UdlButton 
            size="lg" 
            semanticColor="primary" 
            className="bg-white text-indigo-600 hover:bg-indigo-50 shadow-xl font-bold text-lg px-8 gap-3"
            onClick={() => navigate('/workspace')}
          >
            <Play className="w-5 h-5 fill-current" />
            המשך מאיפה שעצרת
          </UdlButton>
        </div>
        
        {/* Decorative background elements */}
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute right-10 bottom-10 w-32 h-32 bg-purple-400/20 rounded-full blur-2xl pointer-events-none"></div>
      </section>

      {/* Grid Layout for Modules & Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Active Modules (Courses) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-500" /> הקורסים שלי
          </h2>
          
          {/* Module Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow group flex flex-col sm:flex-row gap-6">
            <div className="w-full sm:w-48 h-32 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-[1.02] transition-transform">
              <div className="text-6xl">🧮</div>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">חיבור וחיסור עד רבבה</h3>
                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full dark:bg-indigo-900/50 dark:text-indigo-300">
                  כיתה ג׳
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 mb-6 line-clamp-2">
                נלמד לקבץ ולפרוט עשרות, מאות ואלפים בעזרת משחקים ובדידים וירטואליים.
              </p>
              
              {/* Progress Bar */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-sm font-medium text-slate-600 dark:text-slate-300">
                  <span>התקדמות</span>
                  <span>45%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-slate-700">
                  <div className="bg-gradient-to-r from-amber-400 to-orange-500 h-full rounded-full w-[45%] transition-all duration-1000"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gamification / Stats Panel */}
        <div className="flex flex-col gap-6">
           <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" /> ההישגים שלי
          </h2>
          
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
            <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-500 rounded-xl flex items-center justify-center">
                <Star className="w-6 h-6 fill-current" />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800 dark:text-slate-100">1,250</div>
                <div className="text-sm font-medium text-slate-500">נקודות ניסיון</div>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-500 rounded-xl flex items-center justify-center">
                <div className="text-2xl font-black">🔥</div>
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800 dark:text-slate-100">3 ימים</div>
                <div className="text-sm font-medium text-slate-500">רצף למידה</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

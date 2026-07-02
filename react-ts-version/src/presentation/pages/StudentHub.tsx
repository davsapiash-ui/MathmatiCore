import { Play, Trophy, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../styles/main.css';

export function StudentHub() {
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-6xl mx-auto w-full flex flex-col gap-8 fade-in" style={{ backgroundColor: 'var(--color-bg)' }}>
      
      {/* Welcome Hero - Clean and premium, no aggressive purple gradients */}
      <section className="relative overflow-hidden rounded-3xl p-10 shadow-lg border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl font-black mb-4 tracking-tight" style={{ color: 'var(--color-text)' }}>ברוך שובך, תלמיד! 👋</h1>
          <p className="text-lg mb-8 leading-relaxed max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
            המשך במסע הלמידה שלך. משימת חיבור וחיסור מחכה לך, בוא נראה מה אתה יודע!
          </p>
          <button 
            className="btn-primary px-8 gap-3"
            onClick={() => navigate('/workspace')}
          >
            <Play className="w-5 h-5 fill-current" />
            המשך מאיפה שעצרת
          </button>
        </div>
      </section>

      {/* Grid Layout for Modules & Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 flex flex-col gap-6">
          {[
            { id: 1, title: 'מפגש 1: היכרות ותפעול', desc: 'התנסות חופשית במרחב העבודה הווירטואלי ותרגול ראשוני.', icon: '👋', color: 'var(--color-primary)' },
            { id: 2, title: 'מפגש 2: מיפוי יכולות אישי', desc: 'אבחון אדפטיבי (מעוף הדבורה לאחור) וזיהוי חוזקות.', icon: '🎯', color: 'var(--color-accent)' },
            { id: 3, title: 'מפגש 3: מסלול אדפטיבי', desc: 'בניית ידע ראשונית - תרגול חיבור מותאם אישית.', icon: '📈', color: 'var(--color-success)' },
            { id: 4, title: 'מפגש 4: מסלול אדפטיבי', desc: 'ביסוס ידע ודעיכת פיגומים - תרגול חיסור.', icon: '📈', color: 'var(--color-success)' },
            { id: 5, title: 'מפגש 5: מסלול אדפטיבי', desc: 'המשך מסלול הלמידה המותאם אדפטיבית לביצועיך.', icon: '📈', color: 'var(--color-success)' },
            { id: 6, title: 'מפגש 6: מסלול אדפטיבי', desc: 'המשך מסלול הלמידה המותאם אדפטיבית לביצועיך.', icon: '📈', color: 'var(--color-success)' },
            { id: 7, title: 'מפגש 7: מסלול אדפטיבי', desc: 'המשך מסלול הלמידה המותאם אדפטיבית לביצועיך.', icon: '📈', color: 'var(--color-success)' },
            { id: 8, title: 'מפגש 8: סיכום ורפלקציה', desc: 'רפלקציה על התהליך, הסקת מסקנות והערכה עצמית.', icon: '🏆', color: 'var(--color-warning)' },
          ].map(meeting => (
            <div key={meeting.id} className="transition-transform hover:-translate-y-1 p-6 flex flex-col sm:flex-row gap-6 items-center" style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border)' }}>
              <div className="w-16 h-16 flex items-center justify-center text-3xl shrink-0" style={{ backgroundColor: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)' }}>
                {meeting.icon}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{meeting.title}</h3>
                </div>
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  {meeting.desc}
                </p>
              </div>
              <button 
                onClick={() => navigate(`/workspace?meeting=${meeting.id}`)}
                className="btn-primary w-full sm:w-auto"
                style={{ backgroundColor: meeting.color }}
              >
                התחל מפגש
              </button>
            </div>
          ))}
        </div>

        {/* Gamification / Stats Panel */}
        <div className="flex flex-col gap-6">
           <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            <Trophy className="w-6 h-6" style={{ color: 'var(--color-warning)' }} /> ההישגים שלי
          </h2>
          
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="w-12 h-12 flex items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
                <Star className="w-6 h-6 fill-current" />
              </div>
              <div>
                <div className="text-2xl font-black" style={{ color: 'var(--color-text)' }}>1,250</div>
                <div className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>נקודות ניסיון</div>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="w-12 h-12 flex items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)' }}>
                <div className="text-2xl font-black">🔥</div>
              </div>
              <div>
                <div className="text-2xl font-black" style={{ color: 'var(--color-text)' }}>3 ימים</div>
                <div className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>רצף למידה</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

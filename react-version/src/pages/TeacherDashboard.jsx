import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext';

export default function TeacherDashboard() {
  const { teacherUser, logout } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!teacherUser) {
      navigate('/', { replace: true });
    }
  }, [teacherUser, navigate]);

  if (!teacherUser) return null;

  return (
    <div className="dashboard-page" dir="rtl">
      <header className="dashboard-header">
        <h1>דשבורד מורה - {teacherUser.name}</h1>
        <button className="logout-btn" onClick={logout}>התנתק</button>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-card">
          <h2>רדאר כיתתי חי</h2>
          <p>כאן יוצגו התלמידים עם אירועי מאבק קוגניטיבי (Silent Radar)...</p>
        </section>

        <section className="dashboard-card">
          <h2>קיבוץ אלגוריתמי (Q-Matrix)</h2>
          <p>כאן יוצגו קבוצות הלמידה שהאלגוריתם יצר באופן אוטומטי...</p>
        </section>
      </main>
    </div>
  );
}

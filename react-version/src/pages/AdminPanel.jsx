import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext';

export default function AdminPanel() {
  const { adminUser, logout } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!adminUser) {
      navigate('/', { replace: true });
    }
  }, [adminUser, navigate]);

  if (!adminUser) return null;

  return (
    <div className="admin-page" dir="rtl">
      <header className="dashboard-header" style={{ background: 'var(--accent-red)' }}>
        <h1>פאנל ניהול - {adminUser.name}</h1>
        <button className="logout-btn" onClick={logout}>התנתק</button>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-card">
          <h2>ניהול בסיס הנתונים</h2>
          <p>הגדרות מתקדמות למנהל המערכת...</p>
        </section>
      </main>
    </div>
  );
}

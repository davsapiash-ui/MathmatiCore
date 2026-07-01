import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext';

const DEMO_USERS = {
  'user1': { password: '10203040', name: 'משתמש 1', session: 1, classMode: 'regular' },
  'user2': { password: '10203040', name: 'משתמש 2', session: 1, classMode: 'regular' },
  'user3': { password: '10203040', name: 'משתמש 3', session: 1, classMode: 'regular' },
  'user4': { password: '10203040', name: 'משתמש 4', session: 1, classMode: 'regular' },
  'user5': { password: '10203040', name: 'משתמש 5', session: 1, classMode: 'regular' },
  'user6': { password: '10203040', name: 'משתמש 6', session: 1, classMode: 'regular' },
  'user7': { password: '10203040', name: 'משתמש 7', session: 1, classMode: 'regular' },
  'user8': { password: '10203040', name: 'משתמש 8', session: 1, classMode: 'regular' },
  'pilot': { password: '10203040', name: 'פיילוט תלמיד', session: 1, classMode: 'regular' },
  'pilot2': { password: '10203040', name: 'פיילוט תלמיד 2', session: 1, classMode: 'regular' }
};

export default function Login() {
  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setStudentUser, setTeacherUser, setAdminUser } = useSession();

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
  };

  const executeMockSSO = () => {
    if (selectedRole === 'student') {
      const username = prompt("אנא הזן שם משתמש (לדוגמה: user1):");
      if (!username) return;
      const password = prompt("אנא הזן קוד סודי:");
      if (!password) return;
      
      const user = DEMO_USERS[username];
      if (user && user.password === password) {
        setStudentUser({
          name:       user.name,
          username:   username,
          session:    user.session,
          classMode:  user.classMode,
          loginTime:  Date.now(),
          taskIndex:  0
        });
      } else {
        alert("שם המשתמש או הסיסמה שגויים.");
        return;
      }
    } else if (selectedRole === 'teacher') {
      setTeacherUser({
        name:      'מורה (Mock SSO)',
        username:  'teacher_demo',
        role:      'teacher',
        loginTime: Date.now()
      });
    } else if (selectedRole === 'admin') {
      const username = prompt("אנא הזן שם משתמש מנהל:");
      if (username !== 'davsapiash') {
        alert("שם משתמש שגוי.");
        return;
      }
      const password = prompt("אנא הזן סיסמת מנהל:");
      if (password !== 'carlibach') {
        alert("סיסמה שגויה.");
        return;
      }

      setAdminUser({
        name:      'מנהל מערכת',
        username:  'davsapiash',
        role:      'admin',
        loginTime: Date.now()
      });
    }

    setLoading(true);

    setTimeout(() => {
      if (selectedRole === 'student') {
        navigate('/student');
      } else if (selectedRole === 'teacher') {
        navigate('/teacher');
      } else if (selectedRole === 'admin') {
        navigate('/admin');
      }
    }, 600);
  };

  return (
    <div className="login-page">
      <div className="bg-orb bg-orb-1" aria-hidden="true"></div>
      <div className="bg-orb bg-orb-2" aria-hidden="true"></div>
      <div className="bg-orb bg-orb-3" aria-hidden="true"></div>

      <main className="login-container" role="main">
        <div className="logo-area">
          <div className="logo-icon" aria-hidden="true">
            <span className="logo-symbol">מ</span>
          </div>
          <div className="logo-text">
            <h1 className="app-name">מתמטיקאור</h1>
            <p className="app-tagline">סביבת למידה מוגברת טכנולוגיה</p>
          </div>
        </div>

        {!selectedRole ? (
          <div className="login-card fade-in" role="region" aria-label="בחירת סוג כניסה">
            <h2 className="card-title">כניסה למערכת</h2>
            <p className="card-subtitle">בחר את סוג הכניסה שלך</p>

            <div className="role-buttons" role="group" aria-label="בחר תפקיד">
              <button className="role-btn role-btn--student" onClick={() => handleRoleSelect('student')} aria-label="כניסת תלמיד">
                <span className="role-icon" aria-hidden="true">🎓</span>
                <span className="role-label">תלמיד</span>
              </button>
              <button className="role-btn role-btn--teacher" onClick={() => handleRoleSelect('teacher')} aria-label="כניסת מורה">
                <span className="role-icon" aria-hidden="true">📊</span>
                <span className="role-label">מורה</span>
              </button>
              <button className="role-btn role-btn--admin" onClick={() => handleRoleSelect('admin')} aria-label="כניסת מנהל מערכת">
                <span className="role-icon" aria-hidden="true">⚙️</span>
                <span className="role-label">מנהל מערכת</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="login-card login-form-card fade-in" role="region" aria-label="התחברות שקופה">
            <button className="back-btn" onClick={() => setSelectedRole(null)} aria-label="חזרה לבחירת תפקיד">
              &larr; חזרה
            </button>
            <div className="form-header">
              <h2 className="card-title">
                {selectedRole === 'student' ? 'כניסת תלמיד - זיהוי אוטומטי' : 
                 selectedRole === 'teacher' ? 'כניסת מורה - זיהוי אוטומטי' : 'כניסת מנהל - זיהוי אוטומטי'}
              </h2>
            </div>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <p style={{ marginBottom: '20px', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                מערכת ה-SSO מזהה אותך אוטומטית לפי חשבון הגוגל הבית-ספרי שלך. אין צורך בסיסמה.
              </p>
              <button 
                className="submit-btn" 
                onClick={executeMockSSO} 
                disabled={loading}
                style={{ background: 'white', color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: loading ? 0.7 : 1 }}
              >
                {!loading && (
                  <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)"><path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/><path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.369 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/><path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/><path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.109 -17.884 43.989 -14.754 43.989 Z"/></g></svg>
                )}
                {loading ? 'מתחבר בצורה שקופה...' : 'התחברות מהירה (Mock SSO)'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

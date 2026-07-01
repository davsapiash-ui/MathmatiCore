import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext';

// MOCK DATA for dropdowns
const SCHOOLS = ['בי"ס תל אביב', 'בי"ס חיפה', 'בי"ס ירושלים'];
const TEACHERS = ['מורה אליהו', 'מורה דבורה', 'מורה יוסי'];

export default function Login() {
  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Student Form State
  const [school, setSchool] = useState('');
  const [teacher, setTeacher] = useState('');
  const [studentUsername, setStudentUsername] = useState('');
  const [studentPassword, setStudentPassword] = useState('');

  // Teacher Form State
  const [teacherTz, setTeacherTz] = useState('');
  const [teacherBirthYear, setTeacherBirthYear] = useState('');

  // Admin Form State
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const navigate = useNavigate();
  const { loginStudent, loginTeacher, setAdminUser } = useSession();

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
  };

  const handleStudentLogin = (e) => {
    e.preventDefault();
    if (!school || !teacher || !studentUsername || !studentPassword) {
      alert("אנא מלא את כל השדות");
      return;
    }
    const success = loginStudent(school, teacher, studentUsername, studentPassword);
    if (!success) {
      alert("שם המשתמש או הסיסמה שגויים. (שם משתמש: userX, סיסמה: 10203040)");
    }
  };

  const handleTeacherLogin = (e) => {
    e.preventDefault();
    if (!teacherTz || !teacherBirthYear) {
      alert("אנא מלא תעודת זהות ושנת לידה");
      return;
    }
    const success = loginTeacher(teacherTz, teacherBirthYear);
    if (!success) {
      alert("פרטי ההתחברות שגויים");
    }
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminUsername === 'davsapiash' && adminPassword === 'carlibach') {
      setAdminUser({
        name: 'מנהל מערכת',
        username: 'davsapiash',
        role: 'admin',
        loginTime: Date.now()
      });
      navigate('/admin', { replace: true });
    } else {
      alert("פרטי ההתחברות שגויים");
    }
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
            
            {/* Future SSO Placeholder */}
            <div style={{ marginTop: '30px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '20px' }}>
              <button className="submit-btn" style={{ background: 'white', color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }} onClick={() => alert('SSO טרם הופעל בסביבה זו.')}>
                <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)"><path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/><path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.369 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/><path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/><path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.109 -17.884 43.989 -14.754 43.989 Z"/></g></svg>
                כניסה מהירה (SSO) ממוסד חינוכי
              </button>
            </div>
          </div>
        ) : (
          <div className="login-card login-form-card fade-in" role="region" aria-label="טופס התחברות">
            <button className="back-btn" onClick={() => setSelectedRole(null)} aria-label="חזרה לבחירת תפקיד">
              &larr; חזרה
            </button>
            
            <div className="form-header">
              <h2 className="card-title">
                {selectedRole === 'student' ? 'כניסת תלמיד' : 
                 selectedRole === 'teacher' ? 'כניסת מורה' : 'כניסת מנהל'}
              </h2>
            </div>

            <div style={{ padding: '0 20px 20px 20px' }}>
              {selectedRole === 'student' && (
                <form onSubmit={handleStudentLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <select className="form-input" value={school} onChange={e => setSchool(e.target.value)} required>
                    <option value="" disabled>-- בחר מוסד --</option>
                    {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  
                  <select className="form-input" value={teacher} onChange={e => setTeacher(e.target.value)} required>
                    <option value="" disabled>-- בחר מורה / כיתה --</option>
                    {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>

                  <input type="text" className="form-input" placeholder="שם משתמש (למשל: user1)" value={studentUsername} onChange={e => setStudentUsername(e.target.value)} required />
                  <input type="password" className="form-input" placeholder="סיסמה" value={studentPassword} onChange={e => setStudentPassword(e.target.value)} required />
                  
                  <button type="submit" className="submit-btn" disabled={loading}>כניסה</button>
                </form>
              )}

              {selectedRole === 'teacher' && (
                <form onSubmit={handleTeacherLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <input type="text" className="form-input" placeholder="מספר תעודת זהות" value={teacherTz} onChange={e => setTeacherTz(e.target.value)} required />
                  <input type="password" className="form-input" placeholder="שנת לידה (לדוגמה: 1985)" value={teacherBirthYear} onChange={e => setTeacherBirthYear(e.target.value)} required />
                  <button type="submit" className="submit-btn" disabled={loading}>כניסה</button>
                </form>
              )}

              {selectedRole === 'admin' && (
                <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <input type="text" className="form-input" placeholder="שם משתמש" value={adminUsername} onChange={e => setAdminUsername(e.target.value)} required />
                  <input type="password" className="form-input" placeholder="סיסמה" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required />
                  <button type="submit" className="submit-btn" disabled={loading}>כניסה</button>
                </form>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

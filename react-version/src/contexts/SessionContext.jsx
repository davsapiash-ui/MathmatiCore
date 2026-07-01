import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const SessionContext = createContext();

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }) {
  const navigate = useNavigate();
  
  const safeParse = (key, storage) => {
    try {
      const data = storage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error(`Error parsing ${key} from storage`, e);
      storage.removeItem(key);
      return null;
    }
  };

  const [studentUser, _setStudentUser] = useState(() => 
    safeParse('mathematicor_student', sessionStorage) || safeParse('mathematicor_admin_student_impersonation', sessionStorage)
  );

  const [teacherUser, _setTeacherUser] = useState(() => 
    safeParse('mathematicor_teacher', localStorage)
  );

  const [adminUser, _setAdminUser] = useState(() => 
    safeParse('mathematicor_admin', localStorage)
  );

  const [adminImpersonating, _setAdminImpersonating] = useState(() => 
    safeParse('mathematicor_admin_impersonation', sessionStorage)
  );

  const setStudentUser = useCallback((user) => {
    _setStudentUser(user);
    if (user) {
      sessionStorage.setItem('mathematicor_student', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('mathematicor_student');
    }
  }, []);

  // Listen for cross-tab localStorage changes
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'mathematicor_teacher') _setTeacherUser(safeParse('mathematicor_teacher', localStorage));
      if (e.key === 'mathematicor_admin') _setAdminUser(safeParse('mathematicor_admin', localStorage));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('mathematicor_student');
    sessionStorage.removeItem('mathematicor_admin_student_impersonation');
    sessionStorage.removeItem('mathematicor_admin_impersonation');
    localStorage.removeItem('mathematicor_teacher');
    localStorage.removeItem('mathematicor_admin');
    
    _setStudentUser(null);
    _setTeacherUser(null);
    _setAdminUser(null);
    _setAdminImpersonating(null);
    
    navigate('/', { replace: true });
  }, [navigate]);

  const value = useMemo(() => ({
    studentUser,
    teacherUser,
    adminUser,
    adminImpersonating,
    setStudentUser,
    logout
  }), [studentUser, teacherUser, adminUser, adminImpersonating, setStudentUser, logout]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

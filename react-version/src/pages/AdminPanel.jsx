import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext';
import { LogOut } from 'lucide-react';
import '../styles/admin.css';

import AdminOverview from '../components/admin/AdminOverview';
import TeacherClassesView from '../components/admin/TeacherClassesView';
import ClassStudentsView from '../components/admin/ClassStudentsView';
import StudentPedagogicalModal from '../components/admin/StudentPedagogicalModal';

// --- MOCK DATA ---
const MOCK_DATA = [
  {
    id: 't1', name: 'מורה אליהו', status: 'active',
    classes: [
      {
        id: 'c1', name: 'כיתה ג\'1',
        students: [
          {
            id: 's1', name: 'תלמיד אליעזר',
            qMatrixResults: { task1_zero_placeholder: true, task2_estimation_error_margin: 5, task3_flexible_regrouping: true, task4_basic_addition_fluency: true },
            traceData: { hesitation_events: 1, undo_clicks: 0 }
          },
          {
            id: 's2', name: 'תלמיד ברוך',
            qMatrixResults: { task1_zero_placeholder: false, task2_estimation_error_margin: 20, task3_flexible_regrouping: false, task4_basic_addition_fluency: false },
            traceData: { hesitation_events: 8, undo_clicks: 5 }
          }
        ]
      },
      {
        id: 'c2', name: 'כיתה ד\'3',
        students: [
          {
            id: 's3', name: 'תלמיד גבריאל',
            qMatrixResults: { task1_zero_placeholder: true, task2_estimation_error_margin: 2, task3_flexible_regrouping: true, task4_basic_addition_fluency: true },
            traceData: { hesitation_events: 0, undo_clicks: 1 }
          }
        ]
      }
    ]
  },
  {
    id: 't2', name: 'מורה דבורה', status: 'active',
    classes: [
      {
        id: 'c3', name: 'כיתה ב\'2',
        students: [
          {
            id: 's4', name: 'תלמיד דניאל',
            qMatrixResults: { task1_zero_placeholder: true, task2_estimation_error_margin: 8, task3_flexible_regrouping: true, task4_basic_addition_fluency: false },
            traceData: { hesitation_events: 5, undo_clicks: 2 }
          },
          {
            id: 's5', name: 'תלמיד הראל',
            qMatrixResults: { task1_zero_placeholder: false, task2_estimation_error_margin: 15, task3_flexible_regrouping: false, task4_basic_addition_fluency: false },
            traceData: { hesitation_events: 12, undo_clicks: 8 }
          }
        ]
      }
    ]
  }
];

export default function AdminPanel() {
  const { adminUser, logout } = useSession();
  const navigate = useNavigate();

  // Drill-down State
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    if (!adminUser) {
      navigate('/', { replace: true });
    }
  }, [adminUser, navigate]);

  if (!adminUser) return null;

  return (
    <div className="admin-layout" dir="rtl">
      <header className="admin-header">
        <div className="admin-header-title">
          <div className="admin-header-icon">⚙️</div>
          פאנל ניהול - {adminUser.name}
        </div>
        <div className="admin-header-actions">
          <button className="admin-logout-btn" onClick={logout}>
            <LogOut size={16} /> התנתק
          </button>
        </div>
      </header>

      <main className="admin-main">
        {!selectedTeacher && (
          <AdminOverview 
            mockData={MOCK_DATA} 
            onSelectTeacher={(t) => setSelectedTeacher(t)} 
          />
        )}
        
        {selectedTeacher && !selectedClass && (
          <TeacherClassesView 
            teacher={selectedTeacher}
            onBack={() => setSelectedTeacher(null)}
            onSelectClass={(c) => setSelectedClass(c)}
          />
        )}

        {selectedTeacher && selectedClass && (
          <ClassStudentsView 
            cls={selectedClass}
            teacherName={selectedTeacher.name}
            onBackToTeachers={() => { setSelectedClass(null); setSelectedTeacher(null); }}
            onBackToClasses={() => setSelectedClass(null)}
            onSelectStudent={(s) => setSelectedStudent(s)}
          />
        )}
      </main>

      {/* Student Modal */}
      {selectedStudent && (
        <StudentPedagogicalModal 
          student={selectedStudent} 
          onClose={() => setSelectedStudent(null)} 
        />
      )}
    </div>
  );
}

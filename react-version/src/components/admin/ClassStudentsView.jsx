import React from 'react';
import { User, AlertTriangle, CheckCircle } from 'lucide-react';

export default function ClassStudentsView({ cls, teacherName, onBackToTeachers, onBackToClasses, onSelectStudent }) {
  if (!cls) return null;

  return (
    <div className="admin-view animate-fade-in">
      <div className="admin-breadcrumbs">
        <span className="breadcrumb-item" onClick={onBackToTeachers}>מורים</span>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-item" onClick={onBackToClasses}>{teacherName}</span>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-item" style={{ color: '#F1F5F9' }}>{cls.name}</span>
      </div>

      <div className="admin-card" style={{ marginBottom: '24px', padding: '24px' }}>
        <h2 style={{ margin: 0, color: '#38BDF8' }}>{cls.name}</h2>
        <p style={{ margin: '8px 0 0', color: '#94A3B8' }}>{cls.students.length} תלמידים</p>
      </div>

      <h3 className="admin-section-title">רשימת תלמידים</h3>
      <div className="admin-grid">
        {(cls.students || []).map(student => {
          const hesitations = student?.traceData?.hesitation_events ?? 0;
          const undoClicks = student?.traceData?.undo_clicks ?? 0;
          const fluency = student?.qMatrixResults?.task4_basic_addition_fluency ?? false;
          const needsIntervention = hesitations > 3 || !fluency;
          
          return (
            <div key={student.id} className="entity-card" onClick={() => onSelectStudent(student)} style={{ borderColor: needsIntervention ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.06)' }}>
              <div className="entity-header">
                <div className="entity-title">
                  <User size={18} color={needsIntervention ? '#FCA5A5' : '#6EE7B7'} />
                  {student.name}
                </div>
                {needsIntervention ? (
                  <AlertTriangle size={18} color="#EF4444" />
                ) : (
                  <CheckCircle size={18} color="#10B981" />
                )}
              </div>
              <div className="entity-meta">
                <span>אירועי היסוס: {hesitations}</span>
                <span>מחיקות: {undoClicks}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

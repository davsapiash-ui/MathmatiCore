import React from 'react';
import { BookOpen, Users } from 'lucide-react';

export default function TeacherClassesView({ teacher, onBack, onSelectClass }) {
  if (!teacher) return null;

  return (
    <div className="admin-view animate-fade-in">
      <div className="admin-breadcrumbs">
        <span className="breadcrumb-item" onClick={onBack}>מורים</span>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-item" style={{ color: '#F1F5F9' }}>{teacher.name}</span>
      </div>

      <div className="admin-card" style={{ marginBottom: '24px', padding: '24px' }}>
        <h2 style={{ margin: 0, color: '#9B5CFF' }}>{teacher.name}</h2>
        <p style={{ margin: '8px 0 0', color: '#94A3B8' }}>{teacher.classes.length} כיתות משויכות</p>
      </div>

      <h3 className="admin-section-title">כיתות</h3>
      <div className="admin-grid">
        {teacher.classes.map(cls => (
          <div key={cls.id} className="entity-card" onClick={() => onSelectClass(cls)}>
            <div className="entity-header">
              <div className="entity-title">
                <BookOpen size={18} color="#38BDF8" />
                {cls.name}
              </div>
            </div>
            <div className="entity-meta">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={14} />
                {cls.students.length} תלמידים
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

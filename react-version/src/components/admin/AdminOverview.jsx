import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, GraduationCap, AlertTriangle, TrendingUp } from 'lucide-react';

export default function AdminOverview({ mockData, onSelectTeacher }) {
  // Calculate global stats
  const totalTeachers = mockData.length;
  const totalClasses = mockData.reduce((acc, t) => acc + t.classes.length, 0);
  const totalStudents = mockData.reduce((acc, t) => acc + t.classes.reduce((cAcc, c) => cAcc + c.students.length, 0), 0);
  
  // Example global chart data
  const chartData = mockData.map(t => ({
    name: t.name,
    students: t.classes.reduce((acc, c) => acc + c.students.length, 0),
    avgScore: 85 // Mocked average
  }));

  return (
    <div className="admin-view animate-fade-in">
      <div className="admin-stats-row">
        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <span className="admin-stat-label">סה"כ מורים</span>
            <Users className="admin-stat-icon" size={20} color="#A78BFF" />
          </div>
          <div className="admin-stat-number">{totalTeachers}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <span className="admin-stat-label">סה"כ כיתות</span>
            <GraduationCap className="admin-stat-icon" size={20} color="#38BDF8" />
          </div>
          <div className="admin-stat-number">{totalClasses}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <span className="admin-stat-label">סה"כ תלמידים פעילים</span>
            <TrendingUp className="admin-stat-icon" size={20} color="#10B981" />
          </div>
          <div className="admin-stat-number">{totalStudents}</div>
        </div>
        <div className="admin-stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div className="admin-stat-header">
            <span className="admin-stat-label">התראות (דורש התערבות)</span>
            <AlertTriangle className="admin-stat-icon" size={20} color="#EF4444" />
          </div>
          <div className="admin-stat-number" style={{ color: '#FCA5A5' }}>4</div>
        </div>
      </div>

      <div className="admin-charts-section">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">התפלגות תלמידים לפי מורה</h3>
          </div>
          <div className="admin-card-body" style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#64748B" tick={{ fill: '#CBD5E1' }} />
                <YAxis stroke="#64748B" tick={{ fill: '#CBD5E1' }} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} 
                />
                <Bar dataKey="students" name="תלמידים" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#9B5CFF', '#38BDF8', '#10B981', '#F59E0B'][index % 4]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <h3 className="admin-section-title">רשימת מורים</h3>
      <div className="admin-grid">
        {mockData.map(teacher => (
          <div key={teacher.id} className="entity-card" onClick={() => onSelectTeacher(teacher)}>
            <div className="entity-header">
              <div className="entity-title">
                <Users size={18} color="#9B5CFF" />
                {teacher.name}
              </div>
              <span className={`status-badge status-badge--${teacher.status === 'active' ? 'active' : 'suspended'}`}>
                {teacher.status === 'active' ? 'פעיל' : 'לא פעיל'}
              </span>
            </div>
            <div className="entity-meta">
              <span>{teacher.classes.length} כיתות משויכות</span>
              <span>{teacher.classes.reduce((a,c) => a + c.students.length, 0)} תלמידים</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

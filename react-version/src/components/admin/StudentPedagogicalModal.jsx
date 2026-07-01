import React from 'react';
import { X, BrainCircuit, Activity, RotateCcw } from 'lucide-react';

export default function StudentPedagogicalModal({ student, onClose }) {
  if (!student) return null;

  return (
    <div className="admin-modal-overlay open">
      <div className="student-modal">
        <div className="student-modal-header">
          <h2 className="entity-title" style={{ margin: 0, fontSize: '1.5rem' }}>
            <BrainCircuit color="#9B5CFF" size={24} />
            רדאר פדגוגי: {student.name}
          </h2>
          <button className="student-modal-close" onClick={onClose} aria-label="סגור חלון">
            <X size={20} />
          </button>
        </div>

        <div className="student-modal-content">
          <div className="admin-card" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', margin: 0 }}>
            <h3 style={{ margin: '0 0 16px', color: '#F1F5F9' }}>נתוני מעקב ביצוע (Trace Data)</h3>
            <div className="trace-grid">
              <div className="trace-card">
                <Activity size={24} color="#F59E0B" style={{ marginBottom: '8px' }} />
                <h4>אירועי היסוס (Hesitations)</h4>
                <div className="val" style={{ color: student.traceData.hesitation_events > 3 ? '#EF4444' : '#A78BFF' }}>
                  {student.traceData.hesitation_events}
                </div>
              </div>
              <div className="trace-card">
                <RotateCcw size={24} color="#38BDF8" style={{ marginBottom: '8px' }} />
                <h4>פעולות ביטול (Undo Clicks)</h4>
                <div className="val">{student.traceData.undo_clicks}</div>
              </div>
            </div>
          </div>

          <div className="admin-card" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', margin: 0 }}>
            <h3 style={{ margin: '0 0 16px', color: '#F1F5F9' }}>תוצאות פריסת Q-Matrix</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="qmatrix-table">
                <thead>
                  <tr>
                    <th>מיומנות נבדקת</th>
                    <th>סטטוס שליטה</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>שומר מקום לאפס (Zero Placeholder)</td>
                    <td>
                      {student.qMatrixResults.task1_zero_placeholder ? 
                        <span className="status-badge status-badge--active">נרכש בהצלחה</span> : 
                        <span className="status-badge status-badge--expired">דורש חיזוק</span>
                      }
                    </td>
                  </tr>
                  <tr>
                    <td>מרווח שגיאת אומדן (Estimation Error Margin)</td>
                    <td style={{ fontWeight: 700, color: '#38BDF8' }}>
                      {student.qMatrixResults.task2_estimation_error_margin}% חריגה
                    </td>
                  </tr>
                  <tr>
                    <td>המרות והרכבות גמישות (Flexible Regrouping)</td>
                    <td>
                      {student.qMatrixResults.task3_flexible_regrouping ? 
                        <span className="status-badge status-badge--active">נרכש בהצלחה</span> : 
                        <span className="status-badge status-badge--expired">דורש חיזוק</span>
                      }
                    </td>
                  </tr>
                  <tr>
                    <td>שטף חיבור בסיסי (Basic Addition Fluency)</td>
                    <td>
                      {student.qMatrixResults.task4_basic_addition_fluency ? 
                        <span className="status-badge status-badge--active">נרכש בהצלחה</span> : 
                        <span className="status-badge status-badge--expired">דורש חיזוק</span>
                      }
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

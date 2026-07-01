import React from 'react';

export default function AdminAuditLog() {
  return (
    <div className="admin-view">
      <div className="admin-section-title" style={{ color: '#FCA5A5' }}>🔐 לוג ביקורת גישה (בפיתוח)</div>
      <div className="admin-card">
        כאן תופיע רשימת כניסות Impersonation של המנהל למסכי המורים והתלמידים.
      </div>
    </div>
  );
}

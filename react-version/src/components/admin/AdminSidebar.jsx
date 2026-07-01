import React from 'react';
import ThemeToggle from '../common/ThemeToggle';

export default function AdminSidebar({ activeView, setActiveView, onLogout }) {

  return (
    <aside className="admin-sidebar" style={{
      width: '280px',
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(16px)',
      borderLeft: '1px solid var(--glass-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: 'var(--space-6) var(--space-4)',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.1)'
    }}>
      <div className="admin-sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
        <div className="admin-logo-mark" style={{
          width: '48px', height: '48px',
          background: 'linear-gradient(135deg, var(--color-primary), #9B5CFF)',
          borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: '1.5rem', fontWeight: '900',
          boxShadow: '0 4px 10px rgba(91,79,255,0.3)'
        }}>מ</div>
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--color-text)' }}>מתמטיקאור</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>School System Manager</div>
        </div>
      </div>
      
      <div className="sidebar-nav" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-text-muted)', marginBottom: '8px', paddingRight: '8px' }}>
          ניהול מערכת אדמיניסטרטיבי
        </div>
        
        <SidebarButton 
          active={activeView === 'schools'} 
          onClick={() => setActiveView('schools')}
          icon="🏢" label="מוסדות חינוך" 
        />
        <SidebarButton 
          active={activeView === 'licenses'} 
          onClick={() => setActiveView('licenses')}
          icon="🔑" label="הקצאת רישיונות" 
        />
        <SidebarButton 
          active={activeView === 'teachers'} 
          onClick={() => setActiveView('teachers')}
          icon="👨‍🏫" label="הקמת מורים (1/3)" 
        />
        <SidebarButton 
          active={activeView === 'audit'} 
          onClick={() => setActiveView('audit')}
          icon="🔐" label="לוג ביקורת (סמוי)" 
          color="#FCA5A5"
        />
        <SidebarButton 
          active={activeView === 'settings'} 
          onClick={() => setActiveView('settings')}
          icon="🎨" label="עיצוב והגדרות מערכת" 
        />
      </div>

      <div className="sidebar-footer" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px', marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: 'var(--color-text)' }}>ד</div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--color-text)' }}>דוד ספיאשוילי</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Super Admin</div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={onLogout}
            style={{ 
              flex: 1, background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', 
              border: '1px solid rgba(239, 68, 68, 0.2)', padding: '8px', 
              borderRadius: '8px', fontWeight: '600', cursor: 'pointer' 
            }}>
            🚪 התנתק
          </button>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function SidebarButton({ active, onClick, icon, label, color }) {
  return (
    <button 
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px',
        background: active ? 'var(--color-primary)' : 'transparent',
        color: active ? 'white' : (color || 'var(--color-text-secondary)'),
        border: 'none',
        borderRadius: '12px',
        fontWeight: '600',
        cursor: 'pointer',
        textAlign: 'right',
        transition: 'all 0.2s'
      }}
      onMouseOver={(e) => { if(!active) e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseOut={(e) => { if(!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ fontSize: '1.2rem', opacity: active ? 1 : 0.8 }}>{icon}</span>
      {label}
    </button>
  );
}

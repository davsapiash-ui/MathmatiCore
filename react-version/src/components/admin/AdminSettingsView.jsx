import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export default function AdminSettingsView() {
  const { theme, setTheme, primaryColor, setPrimaryColor, glassEnabled, setGlassEnabled } = useTheme();

  const presetColors = ['#5B4FFF', '#FF4F79', '#00C896', '#FFB020', '#111827'];

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ marginBottom: '24px', color: 'var(--color-text)' }}>עיצוב והגדרות תצוגה</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px' }}>
        כאן תוכל לעצב את המערכת ולהתאים את הנראות של מתמטיקאור לפי העדפות מוסד הלימודים.
      </p>

      <div style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        maxWidth: '800px'
      }}>
        
        {/* Theme Mode */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--color-text)' }}>מצב תצוגה (Theme)</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>בחר בין מצב יום למצב לילה</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', background: 'var(--color-surface-2)', padding: '4px', borderRadius: '12px' }}>
            <button 
              onClick={() => setTheme('light')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: theme === 'light' ? 'white' : 'transparent',
                color: theme === 'light' ? '#111827' : 'var(--color-text-muted)',
                boxShadow: theme === 'light' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
                fontWeight: '600'
              }}>
              ☀️ יום
            </button>
            <button 
              onClick={() => setTheme('dark')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: theme === 'dark' ? '#111827' : 'transparent',
                color: theme === 'dark' ? 'white' : 'var(--color-text-muted)',
                boxShadow: theme === 'dark' ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
                cursor: 'pointer',
                fontWeight: '600'
              }}>
              🌙 לילה
            </button>
          </div>
        </div>

        <div style={{ height: '1px', background: 'var(--glass-border)' }}></div>

        {/* Primary Color */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--color-text)' }}>צבע מותג ראשי</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>משפיע על כפתורים, תפריטים וגרפים</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {presetColors.map(color => (
              <button
                key={color}
                onClick={() => setPrimaryColor(color)}
                style={{
                  width: '32px', height: '32px',
                  borderRadius: '50%',
                  background: color,
                  border: primaryColor === color ? '3px solid white' : 'none',
                  boxShadow: primaryColor === color ? `0 0 0 2px ${color}` : '0 2px 4px rgba(0,0,0,0.1)',
                  cursor: 'pointer'
                }}
              />
            ))}
            <input 
              type="color" 
              value={primaryColor} 
              onChange={(e) => setPrimaryColor(e.target.value)}
              style={{
                width: '40px', height: '40px', padding: '0',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                background: 'transparent'
              }}
            />
          </div>
        </div>

        <div style={{ height: '1px', background: 'var(--glass-border)' }}></div>

        {/* Glassmorphism Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--color-text)' }}>אפקט זכוכית (Glassmorphism)</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>שקיפות וטשטוש ברקע (עשוי להשפיע על ביצועים במחשבים ישנים)</p>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '28px' }}>
            <input 
              type="checkbox" 
              checked={glassEnabled} 
              onChange={(e) => setGlassEnabled(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }} 
            />
            <span style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: glassEnabled ? 'var(--color-primary)' : 'var(--color-surface-2)',
              transition: '.4s', borderRadius: '34px'
            }}>
              <span style={{
                position: 'absolute', content: '""', height: '20px', width: '20px', left: glassEnabled ? '26px' : '4px', bottom: '4px',
                backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
              }}></span>
            </span>
          </label>
        </div>

      </div>

      {/* Preview Section */}
      <h3 style={{ marginTop: '48px', marginBottom: '24px', color: 'var(--color-text)' }}>תצוגה מקדימה</h3>
      <div style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '32px',
        display: 'flex',
        gap: '24px',
        maxWidth: '800px'
      }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ marginBottom: '16px', color: 'var(--color-text)' }}>כותרת לדוגמה</h4>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px', lineHeight: '1.6' }}>
            כך ייראה הטקסט במערכת תחת ההגדרות החדשות. שינוי הצבע הראשי ישפיע על הכפתורים ורכיבי המפתח.
          </p>
          <button style={{
            background: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            כפתור פעולה ראשי
          </button>
        </div>
        <div style={{
          width: '200px', height: '150px',
          background: 'linear-gradient(135deg, var(--color-primary), transparent)',
          borderRadius: '12px',
          opacity: 0.8
        }}></div>
      </div>
    </div>
  );
}

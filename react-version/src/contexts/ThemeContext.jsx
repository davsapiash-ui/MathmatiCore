/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('mathematicor_theme') || 'light';
  });
  
  const [primaryColor, setPrimaryColor] = useState(() => {
    return localStorage.getItem('mathematicor_primary') || '#5B4FFF';
  });

  const [glassEnabled, setGlassEnabled] = useState(() => {
    const saved = localStorage.getItem('mathematicor_glass');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mathematicor_theme', theme);
    
    // Apply primary color
    document.documentElement.style.setProperty('--color-primary', primaryColor);
    localStorage.setItem('mathematicor_primary', primaryColor);
    
    // Apply glass settings
    if (!glassEnabled) {
      document.documentElement.style.setProperty('--glass-bg', theme === 'dark' ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)');
      document.documentElement.style.setProperty('--glass-border', theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)');
    } else {
      document.documentElement.style.removeProperty('--glass-bg');
      document.documentElement.style.removeProperty('--glass-border');
    }
    localStorage.setItem('mathematicor_glass', glassEnabled);
    
  }, [theme, primaryColor, glassEnabled]);

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, primaryColor, setPrimaryColor, glassEnabled, setGlassEnabled }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}

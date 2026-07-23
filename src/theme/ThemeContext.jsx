import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'dark', toggle: () => {}, colors: {} });

// CSS 변수와 동일한 값 — 차트 눈금/격자 색에 사용 (Recharts는 JS 값을 받아야 함)
const THEME_COLORS = {
  dark:  { muted: '#8888a0', grid: '#2e2e3f', text: '#e8e8f0' },
  light: { muted: '#6b6b80', grid: '#e2e6f0', text: '#1d1d2b' },
};

function applyTheme(t) {
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else               document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('dash-theme', t); } catch (e) {}
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('dash-theme') || 'dark'; } catch (e) { return 'dark'; }
  });

  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggle = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggle, colors: THEME_COLORS[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

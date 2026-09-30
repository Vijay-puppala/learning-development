import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { applyTheme, readTheme, type Theme } from '../lib/theme';
import { TOTAL_QUESTIONS } from '../data/meta';

export function Layout() {
  const [theme, setTheme] = useState<Theme>('system');
  const { pathname } = useLocation();

  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const cycle = () => {
    const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/">
            <span className="brand-mark">SQL</span>
            <span>Interview Patterns</span>
          </Link>
          <span className="topbar-spacer" />
          <nav className="topbar-links">
            <Link className="btn" to="/">
              Patterns
            </Link>
            <Link className="btn" to="/schema">
              Schema
            </Link>
            <button className="btn" type="button" onClick={cycle} title={`Theme: ${theme}`}>
              {theme === 'system' ? '◐ Auto' : theme === 'light' ? '☀ Light' : '☾ Dark'}
            </button>
          </nav>
        </div>
      </header>
      <main className="shell">
        <Outlet />
      </main>
      <footer className="site">
        {TOTAL_QUESTIONS} questions across 50 patterns · Reason first, reveal second. Progress is
        stored in this browser only.
      </footer>
    </>
  );
}

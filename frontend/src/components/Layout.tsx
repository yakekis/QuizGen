import { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from './Button';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="container-app flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-slate-900">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
            </span>
            <span className="text-lg">QuizGen</span>
          </Link>

          {user && (
            <nav className="flex items-center gap-1 sm:gap-3">
              <NavLink to="/" end className={navItem}>Мои квизы</NavLink>
              <NavLink to="/generate" className={navItem}>Создать</NavLink>
              <div className="mx-2 hidden h-6 w-px bg-slate-200 sm:block" />
              <span className="hidden text-sm text-slate-600 sm:inline">
                {user.name || user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  logout();
                  nav('/auth');
                }}
              >
                Выйти
              </Button>
            </nav>
          )}
        </div>
      </header>

      <main className="container-app flex-1 py-6 sm:py-10">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="container-app py-4 text-center text-xs text-slate-500">
          QuizGen · MVP генератор викторин
        </div>
      </footer>
    </div>
  );
}

function navItem({ isActive }: { isActive: boolean }) {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
  }`;
}

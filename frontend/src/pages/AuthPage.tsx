import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../toast/ToastContext';

export function AuthPage() {
  const { user, login, register } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, name, password);
      toast.success('Добро пожаловать!');
      nav('/');
    } catch (err: any) {
      toast.error(err.message || 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-sber text-white shadow-hover">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">QuizGen <span className="text-slate-300 font-normal">×</span> <span className="text-brand-600">СберОбразование</span></h1>
          <p className="mt-1 text-sm text-slate-500">Сгенерируйте викторину за минуту</p>
        </div>

        <div className="surface p-6 sm:p-8">
          <div className="mb-6 flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            {mode === 'register' && (
              <Input
                label="Имя"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иван Иванов"
              />
            )}
            <Input
              label="Пароль"
              type="password"
              required
              minLength={mode === 'register' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              hint={mode === 'register' ? 'Минимум 8 символов' : undefined}
            />

            <Button type="submit" loading={loading} fullWidth size="lg">
              {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </Button>
          </form>
        </div>

        <div className="mt-4 text-center text-sm text-slate-500">
          Вы ученик?{' '}
          <button
            type="button"
            onClick={() => nav('/play/live')}
            className="font-medium text-brand-700 hover:underline"
          >
            Присоединиться к игре по PIN →
          </button>
        </div>
      </div>
    </div>
  );
}

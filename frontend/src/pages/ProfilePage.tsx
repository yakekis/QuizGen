import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageSpinner } from '../components/Spinner';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../toast/ToastContext';

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getMe()
      .then((u) => {
        setName(u.name);
        setEmail(u.email);
        updateUser(u);
        setLoaded(true);
      })
      .catch((e) => {
        // Фолбэк на данные из контекста, если запрос не прошёл.
        if (user) {
          setName(user.name);
          setEmail(user.email);
          setLoaded(true);
        } else {
          toast.error(e.message || 'Не удалось загрузить профиль');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) return <PageSpinner label="Загрузка профиля…" />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && !currentPassword) {
      toast.error('Введите текущий пароль для смены пароля');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        name: name.trim(),
        email: email.trim(),
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      });
      updateUser(updated);
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Профиль обновлён');
    } catch (err: any) {
      toast.error(err.message || 'Не удалось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <button onClick={() => nav('/')} className="mb-2 text-sm text-slate-500 hover:text-brand-700">← К списку</button>
        <h1 className="text-2xl font-bold text-slate-900">Профиль</h1>
        <p className="mt-1 text-sm text-slate-500">Измените имя, email или пароль.</p>
      </div>

      <Card title="Личные данные">
        <form onSubmit={onSubmit} className="space-y-4">
          <Input label="Имя" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <div className="border-t border-slate-200 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Смена пароля</h3>
            <p className="mb-3 text-xs text-slate-500">
              Заполните оба поля, только если хотите сменить пароль.
            </p>
            <div className="space-y-4">
              <Input
                label="Текущий пароль"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <Input
                label="Новый пароль"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                hint="Минимум 8 символов"
                minLength={newPassword ? 8 : undefined}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={saving}>Сохранить изменения</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

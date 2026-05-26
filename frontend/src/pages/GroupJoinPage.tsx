import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageSpinner } from '../components/Spinner';
import { useToast } from '../toast/ToastContext';
import type { GroupSessionInfo, LeaderboardEntry } from '../types';

export function GroupJoinPage() {
  const { accessCode = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [info, setInfo] = useState<GroupSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [polling, setPolling] = useState(false);

  const loadInfo = async () => {
    try {
      const data = await api.getGroupSessionInfo(accessCode);
      setInfo(data);
      if (data?.show_leaderboard) {
        loadLeaderboard();
      }
    } catch (e: any) {
      toast.error(e.message || 'Сессия не найдена');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    try {
      const data = await api.getLeaderboard(accessCode);
      // ✅ Безопасный фоллбек, если бэк вернёт null вместо массива
      setLeaderboard(data?.entries ?? []);
    } catch (e) {
      console.warn('Leaderboard fetch error:', e);
    }
  };

  useEffect(() => {
    if (!info?.is_active || !info?.show_leaderboard) return;
    setPolling(true);
    const interval = setInterval(loadLeaderboard, 5000);
    return () => {
      setPolling(false);
      clearInterval(interval);
    };
  }, [info, accessCode]);

  useEffect(() => { loadInfo(); }, [accessCode]);

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true);
    try {
      const result = await api.joinGroupSession(accessCode, { student_name: name.trim() });
      if (result.status === 'waiting') {
        toast.info('Квиз ещё не начался. Ждём старта...');
        setTimeout(() => onJoin(e), 5000);
        return;
      }
      if (result.session_token) {
        navigate(`/play/${result.session_token}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Не удалось присоединиться');
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <PageSpinner label="Загрузка сессии…" />;
  if (!info) return null;

  return (
    <div className="mx-auto max-w-4xl grid md:grid-cols-2 gap-6 p-4">
      <div className="surface p-6">
        <h2 className="text-xl font-bold mb-4">🎯 {info.quiz_title || 'Квиз'}</h2>
        <p className="text-sm text-slate-500 mb-4">
          Код доступа: <span className="font-mono font-bold">{info.access_code}</span>
        </p>

        {!info.is_active ? (
          <div className="p-4 bg-slate-100 rounded-lg text-center">
            <p className="text-slate-600">Сессия завершена</p>
          </div>
        ) : (
          <form onSubmit={onJoin} className="space-y-4">
            <Input
              label="Ваше имя"
              placeholder="Иванов Иван"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
            <Button type="submit" fullWidth loading={joining} disabled={!name.trim()}>
              Присоединиться →
            </Button>
          </form>
        )}

        {info.starts_in != null && info.starts_in > 0 && (
          <p className="mt-4 text-sm text-amber-600">
            ⏱ Начало через {Math.ceil(info.starts_in / 60)} мин
          </p>
        )}
        {info.ends_in != null && info.ends_in > 0 && (
          <p className="mt-2 text-sm text-slate-500">
            ⏱ Осталось {Math.ceil(info.ends_in / 60)} мин
          </p>
        )}
      </div>

      {info.show_leaderboard && (
        <div className="surface p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">🏆 Таблица лидеров</h3>
            {polling && <span className="text-xs text-slate-400">обновляется…</span>}
          </div>

          {(!leaderboard || leaderboard.length === 0) ? (
            <p className="text-sm text-slate-500">Пока нет результатов</p>
          ) : (
            <ol className="space-y-2">
              {leaderboard.map((entry) => (
                <li key={entry.student_name} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      entry.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                      entry.rank === 2 ? 'bg-gray-300 text-gray-700' :
                      entry.rank === 3 ? 'bg-orange-300 text-orange-800' :
                      'bg-slate-200 text-slate-600'
                    }`}>
                      {entry.rank}
                    </span>
                    <span className="font-medium">{entry.student_name}</span>
                  </div>
                  <span className="font-bold text-brand-600">
                    {Math.round((entry.score || 0) * 100)}%
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
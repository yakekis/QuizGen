import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { api } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { PageSpinner } from '../components/Spinner';
import { useToast } from '../toast/ToastContext';
import type { QuizStats, SessionStat, LeaderboardEntry } from '../types';

export function QuizStatsPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [stats, setStats] = useState<QuizStats | null>(null);
  
  // Group mode state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [accessCode, setAccessCode] = useState<string>('');
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  useEffect(() => {
    api.quizStats(id).then(setStats).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll leaderboard if modal is open
  useEffect(() => {
    if (!showLeaderboard || !accessCode) return;
    
    const fetchLeaderboard = async () => {
      try {
        setLeaderboardLoading(true);
        const data = await api.getLeaderboard(accessCode);
        setLeaderboardEntries(data.entries);
      } catch {}
      setLeaderboardLoading(false);
    };
    
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 5000);
    return () => clearInterval(interval);
  }, [showLeaderboard, accessCode]);

  const distribution = useMemo(() => {
    if (!stats) return [];
    const buckets = [
      { range: '0-20%', count: 0, min: 0, max: 0.2 },
      { range: '20-40%', count: 0, min: 0.2, max: 0.4 },
      { range: '40-60%', count: 0, min: 0.4, max: 0.6 },
      { range: '60-80%', count: 0, min: 0.6, max: 0.8 },
      { range: '80-100%', count: 0, min: 0.8, max: 1.01 },
    ];
    (stats.sessions ?? []).forEach((s) => {
      if (s.score == null) return;
      const b = buckets.find((b) => s.score! >= b.min && s.score! < b.max);
      if (b) b.count++;
    });
    return buckets.map(({ range, count }) => ({ range, count }));
  }, [stats]);

  const onDownloadCSV = async () => {
    try {
      const blob = await api.statsCSV(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-${id}-stats.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || 'Не удалось скачать CSV');
    }
  };

  const onCreateGroupSession = async (config: {
    maxParticipants: number;
    durationMinutes: number;
    showLeaderboard: boolean;
  }) => {
    try {
      const resp = await api.createGroupSession(id, {
        max_participants: config.maxParticipants,
        start_in_minutes: 0,
        duration_minutes: config.durationMinutes,
        show_leaderboard: config.showLeaderboard,
      });
      setAccessCode(resp.access_code);
      setShowGroupModal(false);
      toast.success('Групповая сессия создана!');
    } catch (e: any) {
      toast.error(e.message || 'Не удалось создать сессию');
    }
  };

  const onCopyLink = () => {
    const url = `${window.location.origin}/group/${accessCode}`;
    navigator.clipboard.writeText(url);
    toast.success('Ссылка скопирована!');
  };

  if (!stats) return <PageSpinner label="Загрузка статистики…" />;

  const sessions = stats.sessions ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => nav('/')} className="mb-2 text-sm text-slate-500 hover:text-brand-700">← К списку</button>
          <h1 className="text-2xl font-bold text-slate-900">{stats.title}</h1>
          <p className="mt-1 text-sm text-slate-500">Статистика прохождений</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onDownloadCSV}>📊 Скачать CSV</Button>
          <Button variant="primary" onClick={() => setShowGroupModal(true)}>👥 Групповой режим</Button>
          {accessCode && (
            <>
              <Button variant="ghost" onClick={onCopyLink}>🔗 Копировать</Button>
              <Button variant="secondary" onClick={() => setShowLeaderboard(true)}>🏆 Топ</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatBox label="Всего попыток" value={stats.total_sessions} />
        <StatBox label="Завершено" value={stats.completed} />
        <StatBox label="Средний балл" value={`${Math.round(stats.avg_score * 100)}%`} accent />
      </div>

      {sessions.some((s) => s.score != null) && (
        <Card title="Распределение баллов">
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart data={distribution} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 600 }}
                  formatter={(v: number) => [`${v} учеников`, 'Количество']}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {distribution.map((_, i) => (
                    <Cell key={i} fill={i >= 4 ? '#10b981' : i >= 2 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card title="Ученики" subtitle={sessions.length ? undefined : 'Пока никто не открыл ссылку'}>
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500">Создайте персональную ссылку на странице квиза и отправьте её ученикам.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto sm:-mx-7">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Ученик</th>
                  <th className="px-6 py-3 text-left font-medium">Статус</th>
                  <th className="px-6 py-3 text-left font-medium">Балл</th>
                  <th className="px-6 py-3 text-left font-medium">Завершён</th>
                  <th className="px-6 py-3 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <SessionRow key={s.session_id} quizId={id} s={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="По вопросам">
        {stats.questions.length === 0 ? (
          <p className="text-sm text-slate-500">Пока никто не прошёл квиз.</p>
        ) : (
          <ul className="space-y-3">
            {stats.questions.map((q, i) => {
              const pct = q.total_count ? Math.round((q.correct_count / q.total_count) * 100) : 0;
              const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500';
              return (
                <li key={q.question_id} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-slate-700">
                      <span className="mr-1 text-slate-400">{i + 1}.</span>
                      {q.text}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-slate-600">
                      {q.correct_count}/{q.total_count} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Modal: Create Group Session */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-scale-in">
            <h3 className="text-lg font-bold mb-4">👥 Групповой режим</h3>
            <GroupSessionForm 
              onClose={() => setShowGroupModal(false)}
              onCreate={onCreateGroupSession}
            />
          </div>
        </div>
      )}

      {/* Modal: Leaderboard */}
      {showLeaderboard && accessCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden animate-scale-in">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-bold">🏆 Таблица лидеров</h3>
              <button 
                onClick={() => setShowLeaderboard(false)}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {leaderboardLoading && leaderboardEntries.length === 0 ? (
                <div className="text-center text-slate-500 py-8">Загрузка...</div>
              ) : leaderboardEntries.length === 0 ? (
                <div className="text-center text-slate-500 py-8">Пока нет результатов</div>
              ) : (
                <ol className="space-y-2">
                  {leaderboardEntries.map((entry) => (
                    <li 
                      key={entry.student_name} 
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                          entry.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                          entry.rank === 2 ? 'bg-gray-300 text-gray-700' :
                          entry.rank === 3 ? 'bg-orange-300 text-orange-800' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          {entry.rank}
                        </span>
                        <span className="font-medium">{entry.student_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-brand-600">
                          {Math.round(entry.score * 100)}%
                        </span>
                        <div className="text-xs text-slate-400">
                          из {entry.total_questions}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="p-3 border-t bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
              <span>Код: <span className="font-mono font-bold">{accessCode}</span></span>
              <span>Обновляется каждые 5 сек</span>
            </div>
          </div>
        </div>
      )}

      {/* Banner: Active Group Session */}
      {accessCode && !showGroupModal && (
        <Card className="p-4 bg-brand-50 border-brand-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-sm text-brand-700 font-medium">
                ✅ Групповая сессия активна
              </div>
              <div className="text-lg font-mono mt-1">{accessCode}</div>
              <div className="text-sm text-slate-500 mt-1">
                Ссылка: {window.location.origin}/group/{accessCode}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onCopyLink}>📋 Копировать</Button>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => {
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${window.location.origin}/group/${accessCode}`;
                  window.open(qrUrl, '_blank');
                }}
              >
                📱 QR
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Компонент формы создания групповой сессии ─────────────────────────────
function GroupSessionForm({ 
  onClose, 
  onCreate 
}: { 
  onClose: () => void;
  onCreate: (config: { maxParticipants: number; durationMinutes: number; showLeaderboard: boolean }) => void;
}) {
  const [maxParticipants, setMaxParticipants] = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [showLeaderboard, setShowLeaderboard] = useState(true);

  return (
    <>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Макс. участников</label>
          <input
            type="number"
            min="1"
            max="100"
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Длительность (мин)</label>
          <input
            type="number"
            min="1"
            max="120"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500"
          />
        </div>
        
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showLeaderboard}
            onChange={(e) => setShowLeaderboard(e.target.checked)}
            className="rounded border-slate-300 text-brand-600"
          />
          <span className="text-sm">Показывать таблицу лидеров ученикам</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button 
          variant="primary" 
          onClick={() => onCreate({ maxParticipants, durationMinutes, showLeaderboard })}
        >
          Создать сессию →
        </Button>
      </div>
    </>
  );
}

// ── Вспомогательные компоненты ─────────────────────────────────────────────
function SessionRow({ s, quizId }: { s: SessionStat; quizId: string }) {
  const status = s.finished_at ? 'completed' : s.started_at ? 'in_progress' : 'idle';
  const statusLabel = status === 'completed' ? 'Завершено' : status === 'in_progress' ? 'В процессе' : 'Не начато';
  const statusClass =
    status === 'completed'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'in_progress'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-600';

  const score = s.score != null ? `${Math.round(s.score * 100)}%` : '—';
  const finishedAt = s.finished_at ? new Date(s.finished_at).toLocaleString('ru-RU') : '—';
  const canOpen = status !== 'idle';

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-6 py-3 font-medium text-slate-900">
        {s.student_name || <span className="italic text-slate-400">не назвался</span>}
      </td>
      <td className="px-6 py-3">
        <span className={`pill ${statusClass}`}>{statusLabel}</span>
      </td>
      <td className="px-6 py-3 font-semibold text-slate-700">{score}</td>
      <td className="px-6 py-3 text-slate-500">{finishedAt}</td>
      <td className="px-6 py-3 text-right">
        {canOpen && (
          <Link
            to={`/quizzes/${quizId}/sessions/${s.session_id}`}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Ответы →
          </Link>
        )}
      </td>
    </tr>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`surface p-5 text-center ${accent ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white border-transparent' : ''}`}>
      <div className={`text-3xl font-bold ${accent ? 'text-white' : 'text-slate-900'}`}>{value}</div>
      <div className={`mt-1 text-xs uppercase tracking-wide ${accent ? 'text-brand-100' : 'text-slate-500'}`}>{label}</div>
    </div>
  );
}
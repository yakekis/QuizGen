import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { api } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { PageSpinner } from '../components/Spinner';
import { useToast } from '../toast/ToastContext';
import type { QuizStats, SessionStat } from '../types';

export function QuizStatsPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [stats, setStats] = useState<QuizStats | null>(null);

  useEffect(() => {
    api.quizStats(id).then(setStats).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  if (!stats) return <PageSpinner label="Загрузка статистики…" />;

  const sessions = stats.sessions ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => nav('/')} className="mb-2 text-sm text-slate-500 hover:text-brand-700">← К списку</button>
          <h1 className="text-2xl font-bold text-slate-900">{stats.title}</h1>
          <p className="mt-1 text-sm text-slate-500">Статистика прохождений</p>
        </div>
        <Button variant="secondary" onClick={onDownloadCSV}>📊 Скачать CSV</Button>
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
    </div>
  );
}

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

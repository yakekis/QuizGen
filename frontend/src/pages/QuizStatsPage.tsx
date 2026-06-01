import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { PageSpinner } from '../components/Spinner';
import { useToast } from '../toast/ToastContext';
import type { QuizStats, SessionStat, QuestionStat, LeaderboardEntry } from '../types';

type Tab = 'overview' | 'students' | 'questions';
type SortDir = 'desc' | 'asc';

// Quizizz-стиль: цвет по точности (зелёный/жёлтый/красный).
function accuracyTone(pct: number) {
  if (pct >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-700' };
  if (pct >= 50) return { bar: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-100 text-amber-700' };
  return { bar: 'bg-rose-500', text: 'text-rose-700', chip: 'bg-rose-100 text-rose-700' };
}

function ringColor(pct: number) {
  return pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
}

// Точность сессии: серверный score, иначе из верных/отвеченных.
function sessionPct(s: SessionStat): number | null {
  if (s.score != null) return Math.round(s.score * 100);
  if (s.answered_count > 0) return Math.round((s.correct_count / s.answered_count) * 100);
  return null;
}

const typeLabel: Record<string, string> = {
  single: 'Один ответ',
  multiple: 'Множественный выбор',
  true_false: 'Верно / неверно',
};

function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

export function QuizStatsPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [stats, setStats] = useState<QuizStats | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [questionSort, setQuestionSort] = useState<'position' | 'difficulty'>('position');

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

  // Вопросы в порядке прохождения с посчитанной точностью.
  const questions = useMemo<(QuestionStat & { pct: number | null })[]>(() => {
    if (!stats) return [];
    return [...stats.questions]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        ...q,
        pct: q.total_count ? Math.round((q.correct_count / q.total_count) * 100) : null,
      }));
  }, [stats]);

  // Сессии, отсортированные по точности (хук должен идти до раннего return).
  const sortedSessions = useMemo(() => {
    const arr = stats?.sessions ?? [];
    const acc = (s: SessionStat) => sessionPct(s) ?? -1;
    return [...arr].sort((a, b) => (sortDir === 'desc' ? acc(b) - acc(a) : acc(a) - acc(b)));
  }, [stats, sortDir]);

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
  const accuracyPct = Math.round(stats.avg_score * 100);
  const completionPct = stats.total_sessions
    ? Math.round((stats.completed / stats.total_sessions) * 100)
    : 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'students', label: 'Участники' },
    { key: 'questions', label: 'Вопросы' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <button onClick={() => nav('/')} className="mb-2 text-sm text-slate-500 hover:text-brand-700">← К списку</button>
        <h1 className="text-2xl font-bold text-slate-900">{stats.title}</h1>
        <p className="mt-1 text-sm text-slate-500">Отчёт по прохождениям</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          icon="🎯"
          label="Точность"
          value={`${accuracyPct}%`}
          hint="Средняя доля правильных ответов по всем прохождениям квиза."
        />
        <Kpi
          icon="✓"
          label="Скорость завершения"
          value={`${completionPct}%`}
          hint="Доля участников, полностью завершивших квиз, от числа всех начавших."
        />
        <Kpi icon="👥" label="Всего учащихся" value={stats.total_sessions} />
        <Kpi icon="❓" label="Вопросов" value={stats.questions.length} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onDownloadCSV}>📊 Скачать CSV</Button>
          {accessCode && (
            <>
              <Button variant="ghost" onClick={onCopyLink}>🔗 Копировать</Button>
              <Button variant="secondary" onClick={() => setShowLeaderboard(true)}>🏆 Топ</Button>
            </>
          )}
        </div>
      </div>

      {/* Tab pills */}
      <div className="flex items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-card ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sort control (overview / students) */}
      {(tab === 'overview' || tab === 'students') && sessions.length > 0 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-slate-500">Сортировать по:</span>
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700">Точность</span>
          <button
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title={sortDir === 'desc' ? 'По убыванию' : 'По возрастанию'}
          >
            {sortDir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      )}

      {/* ── Обзор: матрица участник × вопрос ──────────────────────────────── */}
      {tab === 'overview' && (
        <Card noPadding>
          {sessions.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Пока никто не прошёл квиз.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3 text-left font-semibold text-slate-700 border-b border-slate-200">
                      Участник
                    </th>
                    <th className="bg-slate-50 px-4 py-3 text-center font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                      Балл
                      <div className="text-[11px] font-normal text-slate-400">из {questions.length}</div>
                    </th>
                    {questions.map((q, i) => {
                      const tone = accuracyTone(q.pct ?? 0);
                      return (
                        <th key={q.question_id} className="bg-slate-50 px-2 py-3 text-center font-semibold text-slate-700 border-b border-slate-200">
                          <div>Q{i + 1}</div>
                          <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${tone.chip}`}>
                            {q.pct ?? 0}%
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedSessions.map((s) => {
                    const byQ = new Map<string, boolean | null>();
                    (s.answers ?? []).forEach((a) => byQ.set(a.question_id, a.is_correct));
                    const pct = sessionPct(s);
                    return (
                      <tr key={s.session_id} className="hover:bg-slate-50/60">
                        <td className="sticky left-0 z-10 bg-white px-5 py-3 font-medium text-slate-900 border-b border-slate-100">
                          {s.student_name || <span className="italic text-slate-400">не назвался</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-700 border-b border-slate-100 whitespace-nowrap">
                          {s.correct_count} {pct != null && <span className="text-slate-400">({pct}%)</span>}
                        </td>
                        {questions.map((q) => {
                          const v = byQ.get(q.question_id);
                          return (
                            <td key={q.question_id} className="border-b border-slate-100 px-2 py-2 text-center">
                              <Cell value={v} />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Участники ─────────────────────────────────────────────────────── */}
      {tab === 'students' && (
        <Card noPadding>
          {sessions.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Создайте персональную ссылку на странице квиза и отправьте её ученикам.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-end gap-4 px-6 py-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500" /> Правильно</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-500" /> Неправильно</span>
              </div>
              {sortedSessions.map((s) => {
                const byQ = new Map<string, boolean | null>();
                (s.answers ?? []).forEach((a) => byQ.set(a.question_id, a.is_correct));
                const pct = sessionPct(s) ?? 0;
                const incorrect = Math.max(0, s.answered_count - s.correct_count);
                return (
                  <div key={s.session_id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                    <Link
                      to={`/quizzes/${id}/sessions/${s.session_id}`}
                      className="min-w-[120px] break-words font-semibold text-slate-900 hover:text-brand-700"
                    >
                      {s.student_name || <span className="italic text-slate-400">не назвался</span>}
                      {s.tab_switches > 0 && (
                        <span className="ml-2 align-middle text-xs text-amber-600" title="Уходил с вкладки">⚠ {s.tab_switches}</span>
                      )}
                    </Link>

                    {/* Цветные квадраты по вопросам */}
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex flex-wrap gap-1">
                        {questions.map((q) => {
                          const v = byQ.get(q.question_id);
                          const c = v === true ? 'bg-emerald-500' : v === false ? 'bg-rose-500' : 'bg-slate-200';
                          return <span key={q.question_id} className={`h-5 w-5 rounded ${c}`} title={q.text} />;
                        })}
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="text-emerald-600">✓ {s.correct_count}</span>
                        <span className="text-rose-500">✕ {incorrect}</span>
                      </div>
                    </div>

                    <Ring pct={pct} />
                    <div className="w-16 shrink-0 text-center">
                      <div className="text-xs text-slate-400">Балл</div>
                      <div className="font-semibold text-slate-800">{s.correct_count}/{questions.length}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── Вопросы: разбивка по вариантам ────────────────────────────────── */}
      {tab === 'questions' && (
        <div className="space-y-4">
          {questions.length > 0 && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <span className="text-slate-500">Сортировать по:</span>
              <select
                value={questionSort}
                onChange={(e) => setQuestionSort(e.target.value as 'position' | 'difficulty')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700"
              >
                <option value="position">Порядок вопросов</option>
                <option value="difficulty">По сложности</option>
              </select>
            </div>
          )}
          {questions.length === 0 ? (
            <Card><p className="text-sm text-slate-500">Пока никто не прошёл квиз.</p></Card>
          ) : (
            (questionSort === 'difficulty'
              ? [...questions].sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999))
              : questions
            ).map((q, i) => (
              <QuestionCard key={q.question_id} q={q} index={questions.indexOf(q) + 1 || i + 1} />
            ))
          )}
        </div>
      )}

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

// ── Ячейка матрицы (верно/неверно/не отвечено) ─────────────────────────────
function Cell({ value }: { value: boolean | null | undefined }) {
  if (value === true)
    return <span className="mx-auto grid h-7 w-7 place-items-center rounded bg-emerald-100 text-emerald-600">✓</span>;
  if (value === false)
    return <span className="mx-auto grid h-7 w-7 place-items-center rounded bg-rose-100 text-rose-500">✕</span>;
  return <span className="mx-auto grid h-7 w-7 place-items-center rounded bg-slate-50 text-slate-300">–</span>;
}

// ── Кольцо точности ────────────────────────────────────────────────────────
function Ring({ pct, size = 48 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor(pct)}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-bold text-slate-700">{pct}%</span>
    </div>
  );
}

// ── Карточка вопроса с разбивкой по вариантам ──────────────────────────────
function QuestionCard({ q, index }: { q: QuestionStat & { pct: number | null }; index: number }) {
  const options = q.options ?? [];
  const correctCount = q.correct_count;
  const incorrectCount = Math.max(0, q.total_count - q.correct_count);
  const maxSide = Math.max(correctCount, incorrectCount, 1);
  const avg = q.avg_time_sec > 0 ? `${q.avg_time_sec.toFixed(q.avg_time_sec < 10 ? 1 : 0)} с` : '—';

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {typeLabel[q.type] ?? q.type}
        </span>
        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-center gap-2">
            <Ring pct={q.pct ?? 0} size={40} />
            <span className="text-xs text-slate-500">Точность</span>
          </div>
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{avg}</span>
            <span className="ml-1 text-xs text-slate-400">Среднее время</span>
          </div>
        </div>
      </div>

      <div className="py-4">
        <div className="text-xs uppercase tracking-wide text-slate-400">Вопрос</div>
        <p className="mt-1 font-semibold text-slate-900">{index}. {q.text}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        {/* Опции */}
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Опции</div>
          <ul className="space-y-2">
            {options.map((o, i) => (
              <li key={o.answer_id} className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {letter(i)}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm text-slate-800">
                    {o.is_correct ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-rose-400">✕</span>
                    )}
                    <span className={o.is_correct ? 'font-medium' : ''}>{o.text}</span>
                  </div>
                  <div className={`mt-0.5 text-xs ${o.is_correct ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {o.selected_count} ответил{plural(o.selected_count)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Правильно / Неправильно бары */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Правильно</span>
              <span className="font-semibold text-slate-800">{correctCount} учащ.</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500" style={{ width: `${(correctCount / maxSide) * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Неправильно</span>
              <span className="font-semibold text-slate-800">{incorrectCount} учащ.</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-rose-500" style={{ width: `${(incorrectCount / maxSide) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return '';
  return 'и';
}

// ── KPI карточка ───────────────────────────────────────────────────────────
function Kpi({ icon, label, value, hint }: { icon: string; label: string; value: string | number; hint?: string }) {
  return (
    <div className="surface flex items-center gap-3 p-5">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg">{icon}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-xs leading-tight text-slate-500">
          <span>{label}</span>
          {hint && <InfoDot text={hint} />}
        </div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

// ── Подсказка «?» с тултипом при наведении ─────────────────────────────────
function InfoDot({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="grid h-4 w-4 cursor-help place-items-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700">
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-52 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case leading-snug text-white shadow-lg group-hover:block"
      >
        {text}
        <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-slate-900" />
      </span>
    </span>
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

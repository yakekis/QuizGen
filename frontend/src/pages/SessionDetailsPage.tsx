import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Card } from '../components/Card';
import { PageSpinner } from '../components/Spinner';
import { useToast } from '../toast/ToastContext';
import type { SessionDetails } from '../types';

export function SessionDetailsPage() {
  const { id = '', sessionId = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<SessionDetails | null>(null);

  useEffect(() => {
    api.sessionDetails(id, sessionId).then(setData).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sessionId]);

  const answersByQ = useMemo(() => {
    const m = new Map<string, { selectedIds: Set<string>; isCorrect: boolean | null }>();
    (data?.answers ?? []).forEach((a) => {
      m.set(a.question_id, {
        selectedIds: new Set(a.selected_answer_ids),
        isCorrect: a.is_correct,
      });
    });
    return m;
  }, [data]);

  if (!data) return <PageSpinner label="Загрузка попытки…" />;

  const { session, questions } = data;
  const total = questions.length;
  const answered = answersByQ.size;
  const correctCount = Array.from(answersByQ.values()).filter((a) => a.isCorrect === true).length;
  const scorePct = total ? Math.round((correctCount / total) * 100) : 0;
  const finishedAt = session.finished_at ? new Date(session.finished_at).toLocaleString('ru-RU') : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <button onClick={() => nav(`/quizzes/${id}/stats`)} className="mb-2 text-sm text-slate-500 hover:text-brand-700">← К статистике</button>
        <h1 className="text-2xl font-bold text-slate-900">
          {session.student_name || <span className="italic text-slate-400">Без имени</span>}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {finishedAt ? `Завершено ${finishedAt}` : session.started_at ? 'В процессе' : 'Не начато'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatBox label="Правильных" value={`${correctCount} / ${total}`} />
        <StatBox label="Отвечено" value={`${answered} / ${total}`} />
        <StatBox label="Итог" value={`${scorePct}%`} accent />
      </div>

      <Card title="Разбор ответов">
        <ol className="space-y-4">
          {questions.map((q, i) => {
            const a = answersByQ.get(q.id);
            const isCorrect = a?.isCorrect === true;
            const isWrong = a && a.isCorrect === false;
            const skipped = !a;
            return (
              <li
                key={q.id}
                className={`rounded-2xl border p-5 ${
                  isCorrect
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : isWrong
                    ? 'border-rose-200 bg-rose-50/40'
                    : 'border-slate-200 bg-slate-50/40'
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">
                    <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600 shadow-sm">
                      {i + 1}
                    </span>
                    {q.text}
                  </h3>
                  <span
                    className={`shrink-0 pill ${
                      isCorrect
                        ? 'bg-emerald-100 text-emerald-700'
                        : isWrong
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isCorrect ? '✓ Верно' : isWrong ? '✗ Неверно' : '— Не отвечено'}
                  </span>
                </div>

                <ul className="space-y-2">
                  {q.answers.map((opt) => {
                    const picked = a?.selectedIds.has(opt.id);
                    const correct = opt.is_correct;
                    return (
                      <li
                        key={opt.id}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                          correct && picked
                            ? 'border-emerald-300 bg-emerald-100/70 text-emerald-900'
                            : correct
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : picked
                            ? 'border-rose-300 bg-rose-100/60 text-rose-900'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <span className="mt-0.5 text-xs font-semibold">
                          {picked ? '👤' : ''}
                          {correct ? ' ✓' : ''}
                        </span>
                        <span className="flex-1">{opt.text}</span>
                      </li>
                    );
                  })}
                </ul>

                {q.explanation && (
                  <div className="mt-3 rounded-lg bg-white/70 p-3 text-xs italic text-slate-600">
                    💡 {q.explanation}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex gap-4 text-xs text-slate-500">
          <span>👤 — выбор ученика</span>
          <span>✓ — правильный ответ</span>
        </div>
      </Card>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`surface p-4 text-center ${accent ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white border-transparent' : ''}`}>
      <div className={`text-2xl font-bold ${accent ? 'text-white' : 'text-slate-900'}`}>{value}</div>
      <div className={`mt-1 text-xs uppercase tracking-wide ${accent ? 'text-brand-100' : 'text-slate-500'}`}>{label}</div>
    </div>
  );
}

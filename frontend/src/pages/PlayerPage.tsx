import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageSpinner } from '../components/Spinner';
import type { SessionLoad } from '../types';
import { useToast } from '../toast/ToastContext';

function fmtTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function PlayerPage() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [state, setState] = useState<SessionLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [finishedScore, setFinishedScore] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const lastLeaveRef = useRef(0);
  // Момент показа текущего вопроса — для замера времени ответа.
  const qStartRef = useRef<number>(Date.now());

  // ── Таймер квиза ──────────────────────────────────────────────────────────
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const finishingRef = useRef(false);

  const deadlineKey = `quizgen.deadline.${token}`;

  // Honesty mode: detect tab switches, block copy/paste/contextmenu after identification.
  useEffect(() => {
    if (!state || !state.session.student_name || finishedScore != null) return;

    // blur и visibilitychange часто срабатывают вместе на одно переключение —
    // схлопываем их в одно событие и сообщаем о нём учителю (на сервер).
    const registerLeave = () => {
      const ts = Date.now();
      if (ts - lastLeaveRef.current < 500) return;
      lastLeaveRef.current = ts;
      setTabSwitches((n) => n + 1);
      setShowWarning(true);
      api.reportTabSwitch(token).catch(() => {});
    };

    const onBlur = () => registerLeave();
    const onVis = () => {
      if (document.hidden) registerLeave();
    };
    const blockEvent = (e: Event) => e.preventDefault();
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('copy', blockEvent);
    document.addEventListener('cut', blockEvent);
    document.addEventListener('paste', blockEvent);
    document.addEventListener('contextmenu', blockEvent);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('copy', blockEvent);
      document.removeEventListener('cut', blockEvent);
      document.removeEventListener('paste', blockEvent);
      document.removeEventListener('contextmenu', blockEvent);
    };
  }, [state, finishedScore, token]);

  // Загрузка сессии. При смене token (новая попытка) сбрасываем состояние.
  useEffect(() => {
    setState(null);
    setError(null);
    setIdx(0);
    setPicked(new Set());
    setFinishedScore(null);
    setTimedOut(false);
    setTabSwitches(0);
    setShowWarning(false);
    setDeadline(null);
    finishingRef.current = false;
    api.getSession(token)
      .then((d) => setState(d))
      .catch((e) => setError(e.message));
  }, [token]);

  // Инициализируем дедлайн, когда ученик представился и есть лимит времени.
  // Сохраняем в localStorage, чтобы перезагрузка страницы не сбрасывала отсчёт.
  useEffect(() => {
    if (!state || !state.session.student_name || finishedScore != null) return;
    const tl = state.time_limit_secs;
    if (!tl || tl <= 0) return;
    let dl = Number(localStorage.getItem(deadlineKey));
    if (!dl || Number.isNaN(dl)) {
      dl = Date.now() + tl * 1000;
      localStorage.setItem(deadlineKey, String(dl));
    }
    setDeadline(dl);
    setNow(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, finishedScore]);

  // Сбрасываем отсчёт времени при показе нового вопроса.
  useEffect(() => {
    qStartRef.current = Date.now();
  }, [idx, state?.session.student_name]);

  // Тикаем раз в секунду, пока идёт квиз с таймером.
  useEffect(() => {
    if (deadline == null || finishedScore != null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline, finishedScore]);

  const doFinish = async (viaTimeout: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      const finished = await api.finishSession(token);
      localStorage.removeItem(deadlineKey);
      if (viaTimeout) setTimedOut(true);
      setFinishedScore(finished.score ?? 0);
    } catch (e: any) {
      finishingRef.current = false;
      toast.error(e.message || 'Не удалось завершить квиз');
    }
  };

  // Время вышло → автоматически завершаем квиз (как обычное завершение).
  useEffect(() => {
    if (deadline == null || finishedScore != null) return;
    if (now >= deadline) {
      void doFinish(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadline, finishedScore]);

  const onIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state || !nameInput.trim()) return;
    setIdentifying(true);
    try {
      const updated = await api.identifySession(token, nameInput.trim());
      setState({ ...state, session: updated });
    } catch (e: any) {
      toast.error(e.message || 'Не удалось сохранить имя');
    } finally {
      setIdentifying(false);
    }
  };

  const onRetry = async () => {
    setRetrying(true);
    try {
      const s = await api.retrySession(token);
      localStorage.removeItem(deadlineKey);
      nav(`/play/${s.token}`);
    } catch (e: any) {
      toast.error(e.message || 'Не удалось начать новую попытку');
      setRetrying(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="surface p-8">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Ссылка недействительна</h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!state) return <PageSpinner label="Загрузка квиза…" />;

  // Step 1: ask for name if not provided yet
  if (!state.session.student_name) {
    return (
      <div className="mx-auto max-w-md animate-fade-in">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-sber text-white shadow-hover">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Перед началом</h1>
          <p className="mt-1 text-sm text-slate-500">Представьтесь — учитель должен знать, кто проходит квиз.</p>
          {state.time_limit_secs ? (
            <p className="mt-2 text-sm font-medium text-amber-700">
              ⏱ На квиз даётся {fmtTime(state.time_limit_secs)} — отсчёт начнётся сразу после старта.
            </p>
          ) : null}
        </div>

        <form onSubmit={onIdentify} className="surface p-6 space-y-4">
          <Input
            label="Фамилия и имя"
            placeholder="Иванов Иван"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoFocus
            required
            minLength={2}
          />
          <Button type="submit" fullWidth size="lg" loading={identifying} disabled={!nameInput.trim()}>
            Начать квиз →
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Имя сохранится в этой попытке и будет видно только учителю.
        </p>
      </div>
    );
  }

  const current = state.questions[idx];
  const total = state.questions.length;
  const progress = total ? (idx / total) * 100 : 0;

  const togglePick = (id: string) => {
    if (!current) return;
    if (current.type === 'multiple') {
      setPicked((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    } else {
      setPicked(new Set([id]));
    }
  };

  // Единое действие: отправляем выбранный ответ и сразу переходим дальше
  // (или завершаем квиз на последнем вопросе). Ответ можно менять свободно
  // вплоть до нажатия кнопки — отдельного шага «Ответить» больше нет.
  const submitAndNext = async () => {
    if (!current || picked.size === 0) return;
    setSubmitting(true);
    try {
      const elapsed = Date.now() - qStartRef.current;
      await api.submitAnswer(token, current.id, Array.from(picked), elapsed);
      const nextIdx = idx + 1;
      if (nextIdx >= total) {
        await doFinish(false);
      } else {
        setIdx(nextIdx);
        setPicked(new Set());
      }
    } catch (e: any) {
      toast.error(e.message || 'Не удалось отправить ответ');
    } finally {
      setSubmitting(false);
    }
  };

  if (finishedScore != null) {
    const pct = Math.round(finishedScore * 100);
    const limit = state.attempt_limit;
    const usedNow = state.attempts_used + 1; // эта попытка только что завершилась
    const canRetry =
      state.session.mode !== 'group' && (limit === 0 || usedNow < limit);
    const attemptsLeft = limit === 0 ? null : Math.max(0, limit - usedNow);
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="surface p-8">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-sber text-white">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Готово, {state.session.student_name}!</h2>
          {timedOut && (
            <p className="mt-2 text-sm font-medium text-amber-700">
              ⏱ Время вышло — квиз завершён автоматически.
            </p>
          )}
          <p className="mt-2 text-sm text-slate-500">Ваш результат</p>
          <div className="mt-4 text-5xl font-bold text-brand-700">{pct}%</div>

          {canRetry ? (
            <div className="mt-6">
              <Button onClick={onRetry} loading={retrying} size="lg" fullWidth>
                🔄 Пройти ещё раз
              </Button>
              {attemptsLeft != null && (
                <p className="mt-2 text-xs text-slate-500">
                  Осталось попыток: {attemptsLeft}
                </p>
              )}
            </div>
          ) : (
            limit !== 0 && (
              <p className="mt-6 text-sm text-slate-500">
                Это была последняя доступная попытка.
              </p>
            )
          )}
        </div>
      </div>
    );
  }

  if (!current) return null;

  const remaining = deadline != null ? (deadline - now) / 1000 : null;
  const lowTime = remaining != null && remaining <= 30;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {showWarning && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 animate-slide-up"
          role="alert"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong>Замечено переключение вкладки.</strong> Учитель увидит это в отчёте ({tabSwitches}).
            </div>
            <button
              onClick={() => setShowWarning(false)}
              className="text-amber-700 hover:text-amber-900"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>Вопрос {idx + 1} из {total}</span>
          <span className="flex items-center gap-3">
            {remaining != null && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums ${
                  lowTime ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-slate-100 text-slate-700'
                }`}
              >
                ⏱ {fmtTime(remaining)}
              </span>
            )}
            <span>👤 {state.session.student_name}{tabSwitches > 0 && <span className="ml-2 text-amber-600">⚠ {tabSwitches}</span>}</span>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-sber transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="surface p-6 sm:p-8 animate-fade-in">
        <div className="mb-2 text-xs uppercase tracking-wide text-brand-600">
          {current.type === 'single' ? 'Один правильный ответ' : current.type === 'multiple' ? 'Несколько правильных' : 'Верно / неверно'}
        </div>
        <h2 className="mb-4 text-xl font-semibold leading-snug text-slate-900">{current.text}</h2>

        {current.image_url && (
          <img
            src={current.image_url}
            alt="Иллюстрация к вопросу"
            className="mb-6 max-h-80 w-full rounded-xl border border-slate-200 object-contain"
          />
        )}

        <div className="space-y-3">
          {current.answers.map((a) => {
            const isPicked = picked.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => togglePick(a.id)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                  isPicked
                    ? 'border-brand-500 bg-brand-50 text-brand-900'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50/40'
                }`}
              >
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                  isPicked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {isPicked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </span>
                <span className="text-sm">{a.text}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
          <Button onClick={submitAndNext} loading={submitting} disabled={picked.size === 0} size="lg">
            {idx + 1 === total ? 'Завершить' : 'Далее →'}
          </Button>
        </div>
      </div>
    </div>
  );
}

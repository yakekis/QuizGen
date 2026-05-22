import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageSpinner } from '../components/Spinner';
import type { Question, Session } from '../types';
import { useToast } from '../toast/ToastContext';

interface Loaded {
  session: Session;
  questions: Question[];
}

export function PlayerPage() {
  const { token = '' } = useParams();
  const toast = useToast();
  const [state, setState] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [finishedScore, setFinishedScore] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [showWarning, setShowWarning] = useState(false);

  // Honesty mode: detect tab switches, block copy/paste/contextmenu after identification.
  useEffect(() => {
    if (!state || !state.session.student_name || finishedScore != null) return;
    const onBlur = () => {
      setTabSwitches((n) => n + 1);
      setShowWarning(true);
    };
    const onVis = () => {
      if (document.hidden) {
        setTabSwitches((n) => n + 1);
        setShowWarning(true);
      }
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
  }, [state, finishedScore]);

  useEffect(() => {
    api.getSession(token)
      .then((d) => setState({ session: d.session, questions: d.questions }))
      .catch((e) => setError(e.message));
  }, [token]);

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
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-hover">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Перед началом</h1>
          <p className="mt-1 text-sm text-slate-500">Представьтесь — учитель должен знать, кто проходит квиз.</p>
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

  const submitCurrent = async () => {
    if (!current || picked.size === 0) return;
    setSubmitting(true);
    try {
      await api.submitAnswer(token, current.id, Array.from(picked));
      setAnswered(true);
    } catch (e: any) {
      toast.error(e.message || 'Не удалось отправить ответ');
    } finally {
      setSubmitting(false);
    }
  };

  const next = async () => {
    if (!current) return;
    const nextIdx = idx + 1;
    if (nextIdx >= total) {
      setSubmitting(true);
      try {
        const finished = await api.finishSession(token);
        setFinishedScore(finished.score ?? 0);
      } catch (e: any) {
        toast.error(e.message || 'Не удалось завершить квиз');
      } finally {
        setSubmitting(false);
      }
    } else {
      setIdx(nextIdx);
      setPicked(new Set());
      setAnswered(false);
    }
  };

  if (finishedScore != null) {
    const pct = Math.round(finishedScore * 100);
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="surface p-8">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Готово, {state.session.student_name}!</h2>
          <p className="mt-2 text-sm text-slate-500">Ваш результат</p>
          <div className="mt-4 text-5xl font-bold text-brand-700">{pct}%</div>
        </div>
      </div>
    );
  }

  if (!current) return null;

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
          <span>👤 {state.session.student_name}{tabSwitches > 0 && <span className="ml-2 text-amber-600">⚠ {tabSwitches}</span>}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="surface p-6 sm:p-8 animate-fade-in">
        <div className="mb-2 text-xs uppercase tracking-wide text-brand-600">
          {current.type === 'single' ? 'Один правильный ответ' : current.type === 'multiple' ? 'Несколько правильных' : 'Верно / неверно'}
        </div>
        <h2 className="mb-6 text-xl font-semibold leading-snug text-slate-900">{current.text}</h2>

        <div className="space-y-3">
          {current.answers.map((a) => {
            const isPicked = picked.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => !answered && togglePick(a.id)}
                disabled={answered}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all disabled:cursor-default ${
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
          {!answered ? (
            <Button onClick={submitCurrent} loading={submitting} disabled={picked.size === 0} size="lg">
              Ответить
            </Button>
          ) : (
            <Button onClick={next} loading={submitting} size="lg">
              {idx + 1 === total ? 'Завершить' : 'Далее →'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

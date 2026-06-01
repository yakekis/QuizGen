import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { useToast } from '../toast/ToastContext';
import { tileTheme, secondsLeft } from '../components/liveTheme';
import type { LiveEvent, LivePhase } from '../types';

const HOST_TOKEN_KEY = (pin: string) => `quizgen.live.host.${pin}`;

export function LiveHostPage() {
  const { pin = '' } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();

  // host_token comes from the create call (router state); persist it so a page
  // refresh keeps control of the game.
  const hostToken = useMemo(() => {
    const fromState = (loc.state as any)?.hostToken as string | undefined;
    if (fromState) {
      sessionStorage.setItem(HOST_TOKEN_KEY(pin), fromState);
      return fromState;
    }
    return sessionStorage.getItem(HOST_TOKEN_KEY(pin)) || '';
  }, [pin, loc.state]);

  const [phase, setPhase] = useState<LivePhase>('lobby');
  const [data, setData] = useState<LiveEvent>({});
  const [connError, setConnError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const joinUrl = `${window.location.origin}/play/live/${pin}`;

  useEffect(() => {
    if (!hostToken) {
      toast.error('Нет доступа к игре. Запустите её заново из квиза.');
      nav('/');
      return;
    }
    const es = new EventSource(`/api/live/${pin}/host?host_token=${encodeURIComponent(hostToken)}`);
    const on = (type: LivePhase) =>
      es.addEventListener(type, (e: MessageEvent) => {
        setConnError(false);
        setPhase(type);
        try {
          setData(JSON.parse(e.data));
        } catch {
          /* ignore malformed frame */
        }
      });
    on('lobby');
    on('question');
    on('reveal');
    on('game_over');
    // "answers" is a partial update during a question: merge the live answered
    // count into the current frame without switching phase or clearing the
    // question payload.
    es.addEventListener('answers', (e: MessageEvent) => {
      try {
        const p = JSON.parse(e.data);
        setData((prev) => ({ ...prev, answered: p.answered }));
      } catch {
        /* ignore malformed frame */
      }
    });
    es.onerror = () => setConnError(true);
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, hostToken]);

  // Drive the question countdown.
  useEffect(() => {
    if (phase !== 'question') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  const act = async (action: 'start' | 'next' | 'end') => {
    setBusy(true);
    try {
      await api.liveHostAction(pin, action, hostToken);
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  if (!hostToken) return null;

  const remaining = secondsLeft(data.deadline_unix);
  void now; // `now` only forces re-render for the countdown above

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {connError && (
          <div className="mb-4 rounded-lg bg-amber-500/20 px-4 py-2 text-sm text-amber-200">
            Переподключение к серверу…
          </div>
        )}

        {phase === 'lobby' && (
          <LobbyView
            pin={pin}
            joinUrl={joinUrl}
            quizTitle={data.quiz_title}
            players={data.players ?? []}
            busy={busy}
            onStart={() => act('start')}
            onCancel={() => nav('/')}
          />
        )}

        {phase === 'question' && (
          <QuestionView
            data={data}
            remaining={remaining}
            busy={busy}
            onReveal={() => act('next')}
          />
        )}

        {phase === 'reveal' && (
          <RevealView data={data} busy={busy} onNext={() => act('next')} />
        )}

        {phase === 'game_over' && (
          <GameOverView data={data} onExit={() => nav('/')} />
        )}
      </div>
    </div>
  );
}

// ── Lobby ───────────────────────────────────────────────────────────────────
function LobbyView(props: {
  pin: string;
  joinUrl: string;
  quizTitle?: string;
  players: string[];
  busy: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-8 text-center">
      <div>
        <p className="text-sm uppercase tracking-widest text-slate-400">Подключайтесь на</p>
        <p className="text-2xl font-semibold text-brand-300">{window.location.host}/play/live</p>
        <h1 className="mt-1 text-lg text-slate-300">{props.quizTitle}</h1>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
        <div className="rounded-2xl bg-white p-4">
          <QRCodeSVG value={props.joinUrl} size={180} />
        </div>
        <div>
          <p className="text-sm uppercase tracking-widest text-slate-400">PIN игры</p>
          <p className="font-mono text-7xl font-black tracking-[0.15em] text-white tabular-nums">
            {props.pin}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-800/60 p-5">
        <div className="mb-3 flex items-center justify-center gap-2 text-slate-300">
          <span className="text-2xl font-bold text-white">{props.players.length}</span>
          <span>{props.players.length === 1 ? 'участник' : 'участников'} в игре</span>
        </div>
        {props.players.length === 0 ? (
          <p className="text-slate-500">Ждём, пока ученики присоединятся…</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {props.players.map((name) => (
              <span
                key={name}
                className="animate-scale-in rounded-full bg-brand-500/20 px-4 py-1.5 font-medium text-brand-100"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" onClick={props.onCancel} className="text-slate-300 hover:bg-slate-800">
          Отмена
        </Button>
        <Button
          size="lg"
          variant="success"
          loading={props.busy}
          disabled={props.players.length === 0}
          onClick={props.onStart}
        >
          Начать игру →
        </Button>
      </div>
    </div>
  );
}

// ── Question ────────────────────────────────────────────────────────────────
function QuestionView(props: {
  data: LiveEvent;
  remaining: number;
  busy: boolean;
  onReveal: () => void;
}) {
  const { data, remaining } = props;
  const options = data.options ?? [];
  const answered = typeof data.answered === 'number' ? data.answered : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-slate-300">
        <span className="text-sm">
          Вопрос {(data.index ?? 0) + 1} из {data.total ?? 0}
        </span>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-sm">
          Ответили: <span className="font-bold text-white">{answered}</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-brand-500 text-3xl font-black tabular-nums">
          {remaining}
        </div>
        <h2 className="text-2xl font-bold leading-snug sm:text-3xl">{data.text}</h2>
      </div>

      {data.image && (
        <img
          src={data.image}
          alt="Иллюстрация к вопросу"
          className="mx-auto max-h-72 rounded-xl object-contain"
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o, i) => {
          const t = tileTheme(i);
          return (
            <div
              key={o.id}
              className={`flex items-center gap-3 rounded-2xl ${t.bg} px-5 py-6 text-lg font-semibold shadow-lg`}
            >
              <span className="text-2xl">{t.shape}</span>
              <span>{o.text}</span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button size="lg" variant="secondary" loading={props.busy} onClick={props.onReveal}>
          Показать ответ →
        </Button>
      </div>
    </div>
  );
}

// ── Reveal ──────────────────────────────────────────────────────────────────
function RevealView(props: { data: LiveEvent; busy: boolean; onNext: () => void }) {
  const { data } = props;
  const options = data.options ?? [];
  const maxCount = Math.max(1, ...options.map((o) => o.count ?? 0));
  const leaderboard = data.leaderboard ?? [];

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="mb-4 text-lg font-semibold text-slate-300">Распределение ответов</h3>
        <div className="flex h-64 items-end gap-3">
          {options.map((o, i) => {
            const t = tileTheme(i);
            const count = o.count ?? 0;
            return (
              <div key={o.id} className="flex flex-1 flex-col items-center justify-end gap-2">
                <span className="text-sm font-bold text-white">{count}</span>
                <div
                  className={`w-full rounded-t-lg ${t.bg} ${o.is_correct ? '' : 'opacity-50'} transition-all`}
                  style={{ height: `${(count / maxCount) * 100}%`, minHeight: 4 }}
                />
                <span className="flex items-center gap-1 text-center text-xs text-slate-300">
                  {o.is_correct && <span className="text-emerald-400">✓</span>}
                  <span className="text-lg">{t.shape}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 space-y-1 text-sm">
          {options.map((o, i) => (
            <div key={o.id} className={o.is_correct ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
              {tileTheme(i).shape} {o.text} {o.is_correct ? '— верно' : ''}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-slate-300">🏆 Таблица лидеров</h3>
        <ol className="space-y-2">
          {leaderboard.map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between rounded-xl bg-slate-800/70 px-4 py-3"
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-center font-bold text-slate-400">{row.rank}</span>
                <span className="font-medium">{row.name}</span>
              </span>
              <span className="font-bold text-brand-300 tabular-nums">{row.score}</span>
            </li>
          ))}
          {leaderboard.length === 0 && <p className="text-slate-500">Пока нет очков</p>}
        </ol>

        <div className="mt-6 flex justify-end">
          <Button size="lg" variant="success" loading={props.busy} onClick={props.onNext}>
            {data.is_last ? 'Завершить и показать итоги →' : 'Следующий вопрос →'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Game over ─────────────────────────────────────────────────────────────────
function GameOverView(props: { data: LiveEvent; onExit: () => void }) {
  const podium = props.data.podium ?? [];
  const top3 = podium.slice(0, 3);
  const rest = podium.slice(3);
  const medal = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-8 text-center">
      <h1 className="text-3xl font-black">🎉 Игра завершена!</h1>

      <div className="flex items-end justify-center gap-4">
        {top3.map((row, i) => (
          <div key={row.name} className="flex flex-col items-center">
            <span className="text-4xl">{medal[i]}</span>
            <div
              className="mt-2 flex w-24 flex-col items-center justify-end rounded-t-xl bg-brand-500/30 px-2 pb-3 pt-4"
              style={{ height: i === 0 ? 140 : i === 1 ? 110 : 90 }}
            >
              <span className="font-bold">{row.name}</span>
              <span className="text-brand-200 tabular-nums">{row.score}</span>
            </div>
          </div>
        ))}
        {top3.length === 0 && <p className="text-slate-400">Нет участников</p>}
      </div>

      {rest.length > 0 && (
        <ol className="mx-auto max-w-md space-y-2 text-left">
          {rest.map((row) => (
            <li key={row.name} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-4 py-2">
              <span>
                <span className="mr-3 text-slate-400">{row.rank}</span>
                {row.name}
              </span>
              <span className="font-bold text-brand-300 tabular-nums">{row.score}</span>
            </li>
          ))}
        </ol>
      )}

      <Button size="lg" onClick={props.onExit}>
        К моим квизам
      </Button>
    </div>
  );
}

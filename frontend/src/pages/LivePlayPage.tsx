import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useToast } from '../toast/ToastContext';
import { tileTheme, secondsLeft } from '../components/liveTheme';
import { FlappyBird } from '../components/FlappyBird';
import type { LiveEvent, LivePhase } from '../types';

const PLAYER_KEY = (pin: string) => `quizgen.live.player.${pin}`;

export function LivePlayPage() {
  const { pin: pinParam = '' } = useParams();
  const toast = useToast();

  const [pin, setPin] = useState(pinParam);
  const [playerId, setPlayerId] = useState<string>('');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);

  // Resume an existing session on refresh (player_id persisted per PIN).
  useEffect(() => {
    if (!pinParam) return;
    const saved = sessionStorage.getItem(PLAYER_KEY(pinParam));
    if (saved) setPlayerId(saved);
  }, [pinParam]);

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim();
    const cleanName = name.trim();
    if (!/^\d{4,8}$/.test(cleanPin)) {
      toast.error('PIN — это число из 4–8 цифр');
      return;
    }
    if (cleanName.length < 2) {
      toast.error('Введите имя (минимум 2 символа)');
      return;
    }
    setJoining(true);
    try {
      const res = await api.joinLive(cleanPin, cleanName);
      sessionStorage.setItem(PLAYER_KEY(cleanPin), res.player_id);
      setPin(cleanPin);
      setPlayerId(res.player_id);
    } catch (err: any) {
      toast.error(err.message || 'Не удалось подключиться');
    } finally {
      setJoining(false);
    }
  };

  if (!playerId) {
    return (
      <JoinForm
        pin={pin}
        name={name}
        joining={joining}
        lockedPin={Boolean(pinParam)}
        onPinChange={setPin}
        onNameChange={setName}
        onSubmit={onJoin}
      />
    );
  }

  return <LiveGameView pin={pin} playerId={playerId} name={name} />;
}

// ── Join form ─────────────────────────────────────────────────────────────────
function JoinForm(props: {
  pin: string;
  name: string;
  joining: boolean;
  lockedPin: boolean;
  onPinChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-500 to-brand-800 p-4">
      <form onSubmit={props.onSubmit} className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-7 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-black text-slate-900">Живая игра 🎮</h1>
          <p className="mt-1 text-sm text-slate-500">Введите PIN и своё имя</p>
        </div>
        <Input
          label="PIN игры"
          inputMode="numeric"
          placeholder="000000"
          value={props.pin}
          onChange={(e) => props.onPinChange(e.target.value.replace(/\D/g, ''))}
          disabled={props.lockedPin}
          maxLength={8}
          className="text-center font-mono text-2xl tracking-[0.3em]"
        />
        <Input
          label="Ваше имя"
          placeholder="Например, Аня"
          value={props.name}
          onChange={(e) => props.onNameChange(e.target.value)}
          maxLength={20}
          autoFocus
        />
        <Button type="submit" fullWidth size="lg" loading={props.joining}>
          Войти в игру →
        </Button>
      </form>
    </div>
  );
}

// ── Live game (after joining) ───────────────────────────────────────────────
function LiveGameView(props: { pin: string; playerId: string; name: string }) {
  const { pin, playerId } = props;
  const [phase, setPhase] = useState<LivePhase>('lobby');
  const [data, setData] = useState<LiveEvent>({});
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const currentIndex = useRef<number>(-1);

  useEffect(() => {
    const es = new EventSource(`/api/live/${pin}/stream?player_id=${encodeURIComponent(playerId)}`);
    const on = (type: LivePhase) =>
      es.addEventListener(type, (e: MessageEvent) => {
        let payload: LiveEvent = {};
        try {
          payload = JSON.parse(e.data);
        } catch {
          return;
        }
        // Reset answer selection when a new question begins.
        if (type === 'question' && payload.index !== currentIndex.current) {
          currentIndex.current = payload.index ?? -1;
          setSelected(payload.answered === true ? '__locked__' : null);
        }
        setPhase(type);
        setData(payload);
      });
    on('lobby');
    on('question');
    on('waiting');
    on('reveal');
    on('game_over');
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, playerId]);

  useEffect(() => {
    if (phase !== 'question') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  const choose = async (answerId: string) => {
    if (selected) return;
    setSelected(answerId);
    setSubmitting(true);
    try {
      await api.answerLive(pin, playerId, answerId);
    } catch {
      setSelected(null); // let them retry if the submit failed
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = secondsLeft(data.deadline_unix);
  void now;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {phase === 'lobby' && <PlayerLobby name={props.name} />}
      {phase === 'question' && (
        <PlayerQuestion
          data={data}
          remaining={remaining}
          selected={selected}
          submitting={submitting}
          onChoose={choose}
        />
      )}
      {phase === 'waiting' && <PlayerWaiting data={data} name={props.name} />}
      {phase === 'reveal' && <PlayerReveal data={data} />}
      {phase === 'game_over' && <PlayerGameOver data={data} name={props.name} />}
    </div>
  );
}

function PlayerLobby({ name }: { name: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
      <div>
        <h2 className="text-2xl font-bold">Вы в игре{name ? `, ${name}` : ''}!</h2>
        <p className="mt-1 flex items-center justify-center gap-2 text-slate-400">
          <span className="animate-spin">⏳</span>
          Ждём, пока ведущий начнёт игру…
        </p>
      </div>

      <p className="text-sm text-slate-300">А пока — сыграйте, чтобы не скучать 👇</p>
      <FlappyBird />
    </div>
  );
}

function PlayerQuestion(props: {
  data: LiveEvent;
  remaining: number;
  selected: string | null;
  submitting: boolean;
  onChoose: (id: string) => void;
}) {
  const { data, remaining, selected } = props;
  const options = data.options ?? [];

  if (selected) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-bold">Ответ принят!</h2>
        <p className="text-slate-400">Ждём остальных…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="mb-4 flex items-center justify-between text-slate-300">
        <span className="text-sm">
          Вопрос {(data.index ?? 0) + 1}/{data.total ?? 0}
        </span>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 font-bold tabular-nums">
          {remaining}
        </span>
      </div>

      <h2 className="mb-4 text-center text-xl font-bold leading-snug">{data.text}</h2>

      {data.image && (
        <img
          src={data.image}
          alt="Иллюстрация к вопросу"
          className="mx-auto mb-4 max-h-52 w-full rounded-xl object-contain"
        />
      )}

      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((o, i) => {
          const t = tileTheme(i);
          return (
            <button
              key={o.id}
              onClick={() => props.onChoose(o.id)}
              disabled={props.submitting}
              className={`flex items-center gap-3 rounded-2xl ${t.bg} px-5 py-6 text-left text-lg font-semibold shadow-lg transition-transform active:scale-95 disabled:opacity-60`}
            >
              <span className="text-2xl">{t.shape}</span>
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Экран ожидания: игрок ответил, остальные ещё думают — показываем таблицу лидеров.
function PlayerWaiting({ data, name }: { data: LiveEvent; name: string }) {
  const board = data.leaderboard ?? [];
  const you = data.you;
  const answered = typeof data.answered === 'number' ? data.answered : undefined;
  const total = data.total;

  return (
    <div className="flex min-h-screen flex-col items-center gap-5 p-6">
      <div className="text-center">
        <div className="text-4xl">✅</div>
        <h2 className="mt-1 text-2xl font-bold">Ответ принят!</h2>
        <p className="text-slate-400">
          Ждём остальных…
          {answered != null && total != null ? ` ${answered}/${total} ответили` : ''}
        </p>
      </div>

      <div className="w-full max-w-md rounded-2xl bg-slate-800/60 p-4">
        <div className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
          🏆 Таблица лидеров
        </div>
        {board.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">Пока нет очков</p>
        ) : (
          <ol className="space-y-2">
            {board.map((row) => {
              const isYou = row.name === name;
              return (
                <li
                  key={row.name}
                  className={`flex items-center justify-between rounded-lg px-4 py-2 ${
                    isYou ? 'bg-brand-500 text-white' : 'bg-slate-900/40'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className={isYou ? 'text-white/80' : 'text-slate-400'}>{row.rank}</span>
                    <span className="font-medium">
                      {row.name}
                      {isYou && ' (вы)'}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums">{row.score}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {you && (
        <p className="text-sm text-slate-400">
          Вы сейчас: <span className="font-bold text-white">{you.rank} место</span> ·{' '}
          {you.total_score ?? 0} очков
        </p>
      )}
    </div>
  );
}

function PlayerReveal({ data }: { data: LiveEvent }) {
  const you = data.you;
  const correct = you?.correct;
  const correctOptions = (data.options ?? []).filter((o) => o.is_correct);

  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center ${
        correct ? 'bg-emerald-600' : 'bg-rose-600'
      }`}
    >
      <div className="text-6xl">{correct ? '🎉' : '😕'}</div>
      <h2 className="text-3xl font-black">{correct ? 'Верно!' : 'Неверно'}</h2>
      {correct && (you?.points ?? 0) > 0 && (
        <p className="text-xl font-bold">+{you?.points} очков</p>
      )}
      {(you?.streak ?? 0) > 1 && correct && (
        <p className="text-white/80">🔥 Серия: {you?.streak}</p>
      )}

      {correctOptions.length > 0 && (
        <div className="mt-1 w-full max-w-sm rounded-xl bg-black/20 px-5 py-3">
          <p className="text-sm text-white/70">
            {correctOptions.length > 1 ? 'Правильные ответы' : 'Правильный ответ'}
          </p>
          <p className="mt-1 text-lg font-bold leading-snug">
            {correctOptions.map((o) => o.text).join(', ')}
          </p>
        </div>
      )}

      <div className="mt-1 rounded-xl bg-black/20 px-6 py-3">
        <p className="text-sm text-white/70">Ваше место</p>
        <p className="text-2xl font-bold">
          {you?.rank} · {you?.total_score ?? 0} очков
        </p>
      </div>
    </div>
  );
}

function PlayerGameOver({ data, name }: { data: LiveEvent; name: string }) {
  const you = data.you;
  const podium = data.podium ?? [];
  const isWinner = you?.rank === 1;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="text-6xl">{isWinner ? '👑' : '🎮'}</div>
      <h1 className="text-3xl font-black">{isWinner ? 'Вы победили!' : 'Игра окончена'}</h1>
      <div className="rounded-xl bg-slate-800 px-8 py-4">
        <p className="text-sm text-slate-400">{name || you?.name}</p>
        <p className="text-2xl font-bold text-brand-300">
          {you?.rank} место · {you?.total_score ?? 0} очков
        </p>
      </div>
      {podium.length > 0 && (
        <ol className="mx-auto w-full max-w-xs space-y-2 text-left">
          {podium.slice(0, 5).map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between rounded-lg bg-slate-800/60 px-4 py-2"
            >
              <span>
                <span className="mr-3 text-slate-400">{row.rank}</span>
                {row.name}
              </span>
              <span className="font-bold text-brand-300 tabular-nums">{row.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

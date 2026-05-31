import { useEffect, useRef, useState } from 'react';

// Мини-игра «Flappy Bird», чтобы скоротать ожидание в лобби живой игры.
// Вся игровая логика живёт в ref'е и крутится на requestAnimationFrame,
// React-состояние нужно только для оверлеев (счёт, рекорд, статус).

const W = 300;
const H = 420;
const GROUND = 56;
const BIRD_X = 70;
const BIRD_R = 13;
const GRAVITY = 0.42;
const FLAP = -7;
const PIPE_W = 54;
const GAP = 142;
const SPEED = 1.9;
const SPAWN_MS = 1700;
// Физика считается фиксированными шагами по 1/60 c — игра идёт одинаково
// на дисплеях с любой частотой (60/120/144 Гц).
const TICK_MS = 1000 / 60;

const BEST_KEY = 'quizgen.flappy.best';

type Status = 'idle' | 'play' | 'over';
type Pipe = { x: number; gapY: number; passed: boolean };

export function FlappyBird() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0));

  const game = useRef({
    birdY: H / 2,
    birdV: 0,
    pipes: [] as Pipe[],
    spawnTimer: 0,
    elapsed: 0,
    overAt: 0,
    score: 0,
    status: 'idle' as Status,
    best: 0,
  });
  game.current.best = best;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reset = () => {
      const g = game.current;
      g.birdY = H / 2;
      g.birdV = 0;
      g.pipes = [];
      g.spawnTimer = 0;
      g.score = 0;
      g.status = 'play';
      setScore(0);
      setStatus('play');
    };

    const gameOver = () => {
      const g = game.current;
      g.status = 'over';
      g.overAt = performance.now();
      setStatus('over');
      if (g.score > g.best) {
        g.best = g.score;
        setBest(g.score);
        localStorage.setItem(BEST_KEY, String(g.score));
      }
    };

    const flap = () => {
      const g = game.current;
      if (g.status === 'over') {
        // Небольшая пауза, чтобы случайные/зажатые нажатия не перезапускали
        // игру мгновенно (иначе экран окончания «мигает»).
        if (performance.now() - g.overAt < 600) return;
        reset();
        g.birdV = FLAP;
        return;
      }
      if (g.status === 'idle') {
        reset();
        g.birdV = FLAP;
        return;
      }
      g.birdV = FLAP;
    };

    const onPointer = (e: Event) => {
      e.preventDefault();
      flap();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return; // зажатый пробел не должен «автострелять»
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        flap();
      }
    };
    canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);

    // Один фиксированный шаг симуляции (1/60 c).
    const update = () => {
      const g = game.current;
      if (g.status !== 'play') return;

      g.birdV += GRAVITY;
      g.birdY += g.birdV;

      // Спавн труб по таймеру.
      g.spawnTimer += TICK_MS;
      if (g.spawnTimer >= SPAWN_MS) {
        g.spawnTimer -= SPAWN_MS;
        const margin = 50;
        const gapY = margin + Math.random() * (H - GROUND - GAP - margin * 2);
        g.pipes.push({ x: W, gapY, passed: false });
      }

      // Движение труб + начисление очков + чистка ушедших.
      for (const p of g.pipes) {
        p.x -= SPEED;
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.passed = true;
          g.score += 1;
          setScore(g.score);
        }
      }
      g.pipes = g.pipes.filter((p) => p.x + PIPE_W > -4);

      // Столкновения: земля, потолок, трубы.
      if (g.birdY + BIRD_R >= H - GROUND) {
        g.birdY = H - GROUND - BIRD_R;
        gameOver();
        return;
      }
      if (g.birdY - BIRD_R <= 0) {
        g.birdY = BIRD_R;
        g.birdV = 0;
      }
      for (const p of g.pipes) {
        const inX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
        const inGap = g.birdY - BIRD_R > p.gapY && g.birdY + BIRD_R < p.gapY + GAP;
        if (inX && !inGap) {
          gameOver();
          return;
        }
      }
    };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = (ts: number) => {
      const g = game.current;

      // Догоняем симуляцию фиксированными тиками — независимо от частоты экрана.
      let frame = ts - last;
      last = ts;
      if (frame > 250) frame = 250; // после сворачивания вкладки не «телепортируемся»
      acc += frame;
      while (acc >= TICK_MS) {
        update();
        acc -= TICK_MS;
      }

      if (g.status === 'idle') {
        // Лёгкое «парение» птички на старте.
        g.elapsed += frame;
        g.birdY = H / 2 + Math.sin(g.elapsed / 300) * 8;
      }

      draw(ctx, g);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative select-none" style={{ width: W, height: H }}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-2xl shadow-xl"
        style={{ touchAction: 'none' }}
      />

      {/* Счёт */}
      <div className="pointer-events-none absolute left-0 right-0 top-3 text-center text-3xl font-black text-white drop-shadow">
        {score}
      </div>

      {/* Оверлеи */}
      {status === 'idle' && (
        <Overlay>
          <div className="text-4xl">🐤</div>
          <p className="text-lg font-bold">Flappy Bird</p>
          <p className="text-sm text-white/80">Нажмите или пробел, чтобы взлететь</p>
          <p className="mt-1 text-xs text-white/60">Рекорд: {best}</p>
        </Overlay>
      )}
      {status === 'over' && (
        <Overlay>
          <div className="text-4xl">💥</div>
          <p className="text-lg font-bold">Игра окончена</p>
          <p className="text-sm">Счёт: {score} · Рекорд: {best}</p>
          <p className="mt-1 text-xs text-white/70">Нажмите, чтобы сыграть снова</p>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-black/35 text-center text-white backdrop-blur-[1px]">
      {children}
    </div>
  );
}

function draw(ctx: CanvasRenderingContext2D, g: { birdY: number; birdV: number; pipes: Pipe[] }) {
  // Небо в фирменных тонах Сбера (светло-зелёный градиент).
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#e9fbf0');
  sky.addColorStop(1, '#c9f5d9');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Трубы.
  for (const p of g.pipes) {
    drawPipe(ctx, p);
  }

  // Земля.
  ctx.fillStyle = '#117a37';
  ctx.fillRect(0, H - GROUND, W, GROUND);
  ctx.fillStyle = '#0f5f2c';
  ctx.fillRect(0, H - GROUND, W, 6);

  // Птичка.
  ctx.save();
  ctx.translate(BIRD_X, g.birdY);
  const tilt = Math.max(-0.5, Math.min(1.1, g.birdV / 12));
  ctx.rotate(tilt);
  ctx.font = `${BIRD_R * 2.2}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐤', 0, 1);
  ctx.restore();
}

function drawPipe(ctx: CanvasRenderingContext2D, p: Pipe) {
  const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
  grad.addColorStop(0, '#2fcb6a');
  grad.addColorStop(1, '#1cb854');
  ctx.fillStyle = grad;
  // Верхняя труба.
  ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
  ctx.fillRect(p.x - 3, p.gapY - 14, PIPE_W + 6, 14);
  // Нижняя труба.
  const bottomY = p.gapY + GAP;
  ctx.fillRect(p.x, bottomY, PIPE_W, H - GROUND - bottomY);
  ctx.fillRect(p.x - 3, bottomY, PIPE_W + 6, 14);
}

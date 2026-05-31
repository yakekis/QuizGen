import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Quiz } from '../types';
import { Badge, Card } from '../components/Card';
import { Button } from '../components/Button';
import { PageSpinner } from '../components/Spinner';
import { useToast } from '../toast/ToastContext';

export function QuizListPage() {
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const toast = useToast();
  const nav = useNavigate();

  const reload = async () => {
    try {
      const data = await api.listQuizzes();
      setQuizzes(data ?? []);
    } catch (e: any) {
      toast.error(e.message || 'Не удалось загрузить квизы');
      setQuizzes([]);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const onLaunchLive = async (id: string) => {
    setLaunchingId(id);
    try {
      const res = await api.createLiveGame(id);
      nav(`/host/${res.pin}`, { state: { hostToken: res.host_token } });
    } catch (e: any) {
      toast.error(e.message || 'Не удалось запустить игру');
      setLaunchingId(null);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Удалить квиз без возможности восстановления?')) return;
    try {
      await api.deleteQuiz(id);
      toast.success('Квиз удалён');
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Не удалось удалить');
    }
  };

  if (quizzes === null) return <PageSpinner label="Загрузка…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Мои квизы</h1>
          <p className="mt-1 text-sm text-slate-500">
            {quizzes.length === 0 ? 'Пока пусто' : `Всего: ${quizzes.length}`}
          </p>
        </div>
        <Button onClick={() => nav('/generate')} size="lg">
          + Создать квиз
        </Button>
      </div>

      {quizzes.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Пока нет ни одного квиза</h3>
            <p className="mt-1 text-sm text-slate-500">Загрузите материал или укажите тему — и нейросеть соберёт викторину за минуту.</p>
            <Button className="mt-6" onClick={() => nav('/generate')}>Создать первый квиз</Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q) => (
            <div key={q.id} className="surface p-5 transition-shadow hover:shadow-hover">
              <div className="mb-3 flex items-start justify-between gap-3">
                <Link to={`/quizzes/${q.id}`} className="flex-1 line-clamp-2 text-base font-semibold text-slate-900 hover:text-brand-700">
                  {q.title}
                </Link>
                <Badge variant={q.status as any}>{q.status === 'draft' ? 'Черновик' : q.status === 'published' ? 'Опубликован' : 'Архив'}</Badge>
              </div>

              <dl className="space-y-1 text-xs text-slate-500">
                <div className="flex justify-between"><dt>Предмет</dt><dd className="font-medium text-slate-700">{q.subject || '—'}</dd></div>
                <div className="flex justify-between"><dt>Класс</dt><dd className="font-medium text-slate-700">{q.grade || '—'}</dd></div>
                <div className="flex justify-between"><dt>Тема</dt><dd className="font-medium text-slate-700 truncate ml-2">{q.topic || '—'}</dd></div>
              </dl>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => onLaunchLive(q.id)} loading={launchingId === q.id}>🎮 Играть</Button>
                <Button size="sm" variant="secondary" onClick={() => nav(`/quizzes/${q.id}`)}>Редактировать</Button>
                <Button size="sm" variant="secondary" onClick={() => nav(`/quizzes/${q.id}/stats`)}>Статистика</Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(q.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

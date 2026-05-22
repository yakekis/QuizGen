import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import { Badge, Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageSpinner } from '../components/Spinner';
import { useToast } from '../toast/ToastContext';
import type { Quiz, Question } from '../types';

export function QuizEditorPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [saving, setSaving] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  useEffect(() => {
    api.getQuiz(id).then(setQuiz).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!quiz) return <PageSpinner label="Загрузка…" />;

  const onSave = async () => {
    setSaving(true);
    try {
      await api.updateQuiz(id, {
        title: quiz.title,
        subject: quiz.subject,
        grade: quiz.grade,
        topic: quiz.topic,
        description: quiz.description,
        time_limit_secs: quiz.time_limit_secs,
        attempt_limit: quiz.attempt_limit,
        shuffle_questions: quiz.shuffle_questions,
        shuffle_answers: quiz.shuffle_answers,
        status: quiz.status,
      });
      toast.success('Сохранено');
    } catch (e: any) {
      toast.error(e.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const onPublish = async () => {
    try {
      await api.publishQuiz(id);
      setQuiz({ ...quiz, status: 'published' });
      toast.success('Опубликовано');
    } catch (e: any) {
      toast.error(e.message || 'Не удалось опубликовать');
    }
  };

  const onCreateLink = async () => {
    setCreatingLink(true);
    try {
      const { link } = await api.createSession(id, studentName);
      const fullUrl = `${window.location.origin}${link}`;
      setShareLink(fullUrl);
      await navigator.clipboard.writeText(fullUrl).catch(() => {});
      toast.success('Ссылка скопирована');
      setStudentName('');
    } catch (e: any) {
      toast.error(e.message || 'Не удалось создать ссылку');
    } finally {
      setCreatingLink(false);
    }
  };

  const onRegenerate = async (q: Question) => {
    if (!quiz) return;
    if (!confirm(`Перегенерировать вопрос «${q.text.slice(0, 60)}…»?`)) return;
    setRegeneratingId(q.id);
    try {
      const newQ = await api.regenerateQuestion(id, q.id);
      setQuiz({
        ...quiz,
        questions: quiz.questions?.map((x) => (x.id === q.id ? newQ : x)),
      });
      toast.success('Вопрос обновлён');
    } catch (e: any) {
      toast.error(e.message || 'Не удалось перегенерировать');
    } finally {
      setRegeneratingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => nav('/')} className="mb-2 text-sm text-slate-500 hover:text-brand-700">← К списку</button>
          <h1 className="text-2xl font-bold text-slate-900">{quiz.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={quiz.status as any}>{quiz.status === 'draft' ? 'Черновик' : quiz.status === 'published' ? 'Опубликован' : 'Архив'}</Badge>
            <span className="text-xs text-slate-500">{quiz.questions?.length || 0} вопросов</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.open(`/quizzes/${id}/print`, '_blank')}>🖨 Печать</Button>
          {quiz.status !== 'published' && (
            <Button variant="success" onClick={onPublish}>Опубликовать</Button>
          )}
          <Button onClick={onSave} loading={saving}>Сохранить</Button>
        </div>
      </div>

      <Card title="Параметры">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Название"
            value={quiz.title}
            onChange={(e) => setQuiz({ ...quiz, title: e.target.value })}
          />
          <Input
            label="Предмет"
            value={quiz.subject}
            onChange={(e) => setQuiz({ ...quiz, subject: e.target.value })}
          />
          <Input
            label="Класс"
            value={quiz.grade}
            onChange={(e) => setQuiz({ ...quiz, grade: e.target.value })}
          />
          <Input
            label="Тема"
            value={quiz.topic}
            onChange={(e) => setQuiz({ ...quiz, topic: e.target.value })}
          />
          <Input
            label="Время на квиз (сек)"
            type="number"
            value={quiz.time_limit_secs ?? ''}
            onChange={(e) => setQuiz({ ...quiz, time_limit_secs: e.target.value ? Number(e.target.value) : null })}
          />
          <Input
            label="Попыток"
            type="number"
            value={quiz.attempt_limit}
            onChange={(e) => setQuiz({ ...quiz, attempt_limit: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={quiz.shuffle_questions}
              onChange={(e) => setQuiz({ ...quiz, shuffle_questions: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Перемешивать вопросы
          </label>
          <label className="inline-flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={quiz.shuffle_answers}
              onChange={(e) => setQuiz({ ...quiz, shuffle_answers: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Перемешивать ответы
          </label>
        </div>
      </Card>

      <Card
        title="Ссылка для ученика"
        subtitle="Сгенерируйте персональную ссылку — её можно отправить ученику в чат."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Имя ученика (необязательно)"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="flex-1"
          />
          <Button onClick={onCreateLink} loading={creatingLink}>Создать и скопировать</Button>
        </div>
        {quiz.status !== 'published' && (
          <p className="mt-3 text-xs text-amber-700">
            Подсказка: опубликуйте квиз, чтобы ученики могли проходить его.
          </p>
        )}

        {shareLink && (
          <div className="mt-5 flex flex-col items-start gap-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4 sm:flex-row sm:items-center">
            <div className="rounded-lg bg-white p-2 shadow-sm">
              <QRCodeSVG value={shareLink} size={120} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wide text-brand-700 font-semibold mb-1">QR-код ссылки</div>
              <div className="break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-slate-700 border border-slate-200">
                {shareLink}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(shareLink).catch(() => {});
                  toast.success('Ссылка скопирована');
                }}
                className="mt-2 text-xs font-medium text-brand-700 hover:underline"
              >
                📋 Скопировать ещё раз
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card title={`Вопросы (${quiz.questions?.length || 0})`}>
        <ol className="space-y-3">
          {quiz.questions?.map((q, i) => (
            <li key={q.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="font-medium text-slate-900">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  {q.text}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {q.type === 'single' ? 'Один' : q.type === 'multiple' ? 'Несколько' : 'Да/Нет'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRegenerate(q)}
                    loading={regeneratingId === q.id}
                    title="Перегенерировать через ИИ"
                  >
                    🔄
                  </Button>
                </div>
              </div>
              <ul className="ml-8 space-y-1">
                {q.answers.map((a) => (
                  <li key={a.id} className={`text-sm ${a.is_correct ? 'font-medium text-emerald-700' : 'text-slate-700'}`}>
                    {a.is_correct ? '✓ ' : '• '}
                    {a.text}
                  </li>
                ))}
              </ul>
              {q.explanation && (
                <div className="ml-8 mt-2 text-xs italic text-slate-500">
                  💡 {q.explanation}
                </div>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

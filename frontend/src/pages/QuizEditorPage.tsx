import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import { Badge, Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageSpinner } from '../components/Spinner';
import { useToast } from '../toast/ToastContext';
import type { Quiz, Question, Answer, QuestionType } from '../types';

const tmpId = () => 'tmp-' + Math.random().toString(36).slice(2);
const isTmp = (id: string) => id.startsWith('tmp-');

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
  const [launching, setLaunching] = useState(false);
  const [uploadingImgId, setUploadingImgId] = useState<string | null>(null);

  useEffect(() => {
    api.getQuiz(id).then(setQuiz).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!quiz) return <PageSpinner label="Загрузка…" />;

  // ── Мутации вопросов/ответов (иммутабельно) ────────────────────────────────
  const patchQuestions = (fn: (qs: Question[]) => Question[]) =>
    setQuiz((q) => (q ? { ...q, questions: fn(q.questions ?? []) } : q));

  const updateQuestion = (qid: string, patch: Partial<Question>) =>
    patchQuestions((qs) => qs.map((q) => (q.id === qid ? { ...q, ...patch } : q)));

  const updateAnswer = (qid: string, aid: string, patch: Partial<Answer>) =>
    patchQuestions((qs) =>
      qs.map((q) =>
        q.id === qid ? { ...q, answers: q.answers.map((a) => (a.id === aid ? { ...a, ...patch } : a)) } : q,
      ),
    );

  const setCorrect = (qid: string, aid: string) =>
    patchQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== qid) return q;
        const multiple = q.type === 'multiple';
        return {
          ...q,
          answers: q.answers.map((a) => {
            if (a.id === aid) return { ...a, is_correct: multiple ? !a.is_correct : true };
            return multiple ? a : { ...a, is_correct: false };
          }),
        };
      }),
    );

  const addAnswer = (qid: string) =>
    patchQuestions((qs) =>
      qs.map((q) =>
        q.id === qid
          ? {
              ...q,
              answers: [
                ...q.answers,
                { id: tmpId(), question_id: qid, position: q.answers.length, text: '', is_correct: false },
              ],
            }
          : q,
      ),
    );

  const removeAnswer = (qid: string, aid: string) =>
    patchQuestions((qs) =>
      qs.map((q) => (q.id === qid ? { ...q, answers: q.answers.filter((a) => a.id !== aid) } : q)),
    );

  const changeType = (qid: string, type: QuestionType) =>
    patchQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== qid) return q;
        if (type === 'true_false') {
          return {
            ...q,
            type,
            answers: [
              { id: tmpId(), question_id: qid, position: 0, text: 'Верно', is_correct: true },
              { id: tmpId(), question_id: qid, position: 1, text: 'Неверно', is_correct: false },
            ],
          };
        }
        // single → оставляем только один правильный
        if (type === 'single') {
          let seen = false;
          return {
            ...q,
            type,
            answers: q.answers.map((a) => {
              if (a.is_correct && !seen) {
                seen = true;
                return a;
              }
              return { ...a, is_correct: false };
            }),
          };
        }
        return { ...q, type };
      }),
    );

  const addQuestion = () =>
    patchQuestions((qs) => [
      ...qs,
      {
        id: tmpId(),
        quiz_id: quiz.id,
        position: qs.length,
        type: 'single' as QuestionType,
        text: '',
        explanation: '',
        image_url: '',
        time_limit_secs: null,
        answers: [
          { id: tmpId(), question_id: '', position: 0, text: '', is_correct: true },
          { id: tmpId(), question_id: '', position: 1, text: '', is_correct: false },
        ],
      },
    ]);

  const removeQuestion = (qid: string) => {
    if (!confirm('Удалить этот вопрос?')) return;
    patchQuestions((qs) => qs.filter((q) => q.id !== qid));
  };

  // Загрузка картинки к вопросу: отправляем файл, сохраняем вернувшийся URL.
  const onPickImage = async (qid: string, file: File | undefined) => {
    if (!file) return;
    setUploadingImgId(qid);
    try {
      const { url } = await api.uploadImage(file);
      updateQuestion(qid, { image_url: url });
      toast.success('Картинка добавлена');
    } catch (e: any) {
      toast.error(e.message || 'Не удалось загрузить картинку');
    } finally {
      setUploadingImgId(null);
    }
  };

  // ── Валидация перед сохранением ────────────────────────────────────────────
  const validate = (): string | null => {
    const qs = quiz.questions ?? [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (!q.text.trim()) return `Вопрос ${i + 1}: пустой текст`;
      if (q.answers.length < 2) return `Вопрос ${i + 1}: нужно минимум 2 варианта ответа`;
      if (q.answers.some((a) => !a.text.trim())) return `Вопрос ${i + 1}: есть пустой вариант ответа`;
      if (!q.answers.some((a) => a.is_correct)) return `Вопрос ${i + 1}: не отмечен правильный ответ`;
    }
    return null;
  };

  const buildQuestionsPayload = () =>
    (quiz.questions ?? []).map((q, qi) => ({
      ...(isTmp(q.id) ? {} : { id: q.id }),
      type: q.type,
      text: q.text,
      explanation: q.explanation,
      image_url: q.image_url,
      time_limit_secs: q.time_limit_secs,
      position: qi,
      answers: q.answers.map((a, ai) => ({
        ...(isTmp(a.id) ? {} : { id: a.id }),
        text: a.text,
        is_correct: a.is_correct,
        position: ai,
      })),
    }));

  const onSave = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
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
        questions: buildQuestionsPayload(),
      } as any);
      // Перечитываем квиз, чтобы получить реальные id новых вопросов/ответов.
      const fresh = await api.getQuiz(id);
      setQuiz(fresh);
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

  const onLaunchLive = async () => {
    setLaunching(true);
    try {
      const res = await api.createLiveGame(id);
      nav(`/host/${res.pin}`, { state: { hostToken: res.host_token } });
    } catch (e: any) {
      toast.error(e.message || 'Не удалось запустить игру');
      setLaunching(false);
    }
  };

  const onRegenerate = async (q: Question) => {
    if (!quiz) return;
    if (isTmp(q.id)) {
      toast.error('Сначала сохраните квиз, затем перегенерируйте вопрос');
      return;
    }
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
          <Button onClick={onLaunchLive} loading={launching} disabled={!quiz.questions?.length}>
            🎮 Живая игра
          </Button>
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
            label="Попыток (0 — без ограничений)"
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

      <Card
        title={`Вопросы (${quiz.questions?.length || 0})`}
        subtitle="Редактируйте текст, варианты ответов и отметку правильности. Не забудьте «Сохранить»."
      >
        <ol className="space-y-4">
          {quiz.questions?.map((q, i) => (
            <li key={q.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="mt-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {i + 1}
                </span>
                <textarea
                  value={q.text}
                  onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                  placeholder="Текст вопроса"
                  rows={2}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <select
                    value={q.type}
                    onChange={(e) => changeType(q.id, e.target.value as QuestionType)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="single">Один ответ</option>
                    <option value="multiple">Несколько</option>
                    <option value="true_false">Да/Нет</option>
                  </select>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRegenerate(q)}
                      loading={regeneratingId === q.id}
                      title="Перегенерировать через ИИ"
                    >
                      🔄
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeQuestion(q.id)}
                      title="Удалить вопрос"
                    >
                      🗑
                    </Button>
                  </div>
                </div>
              </div>

              {/* Картинка к вопросу */}
              <div className="ml-8 mb-3">
                {q.image_url ? (
                  <div className="relative inline-block">
                    <img
                      src={q.image_url}
                      alt="Иллюстрация к вопросу"
                      className="max-h-48 rounded-lg border border-slate-200 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => updateQuestion(q.id, { image_url: '' })}
                      className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-xs text-white shadow hover:bg-rose-600"
                      title="Удалить картинку"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700">
                    {uploadingImgId === q.id ? 'Загрузка…' : '🖼 Добавить картинку'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingImgId === q.id}
                      onChange={(e) => {
                        onPickImage(q.id, e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>

              <ul className="ml-8 space-y-2">
                {q.answers.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <input
                      type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                      checked={a.is_correct}
                      onChange={() => setCorrect(q.id, a.id)}
                      className="h-4 w-4 shrink-0 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      title="Отметить правильным"
                    />
                    <input
                      value={a.text}
                      onChange={(e) => updateAnswer(q.id, a.id, { text: e.target.value })}
                      placeholder="Вариант ответа"
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-sm focus:ring-1 ${
                        a.is_correct
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 focus:border-emerald-500 focus:ring-emerald-500'
                          : 'border-slate-300 text-slate-800 focus:border-brand-500 focus:ring-brand-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => removeAnswer(q.id, a.id)}
                      disabled={q.answers.length <= 2}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Удалить вариант"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              <div className="ml-8 mt-2 flex flex-wrap items-center gap-3">
                {q.type !== 'true_false' && (
                  <button
                    type="button"
                    onClick={() => addAnswer(q.id)}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    + Добавить вариант
                  </button>
                )}
              </div>

              <div className="ml-8 mt-3">
                <input
                  value={q.explanation}
                  onChange={(e) => updateQuestion(q.id, { explanation: e.target.value })}
                  placeholder="Пояснение к правильному ответу (необязательно)"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs italic text-slate-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4">
          <Button variant="secondary" onClick={addQuestion}>+ Добавить вопрос</Button>
        </div>
      </Card>
    </div>
  );
}

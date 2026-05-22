import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { FileDrop } from '../components/FileDrop';
import { Input, Select } from '../components/Input';
import { useToast } from '../toast/ToastContext';
import type { BloomsLevel, Difficulty, Language, QuestionType, Tone } from '../types';

const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'single', label: 'Один вариант' },
  { value: 'multiple', label: 'Несколько' },
  { value: 'true_false', label: 'Да / Нет' },
];

export function QuizGeneratePage() {
  const toast = useToast();
  const nav = useNavigate();
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState<string>('');
  const [attemptLimit, setAttemptLimit] = useState(1);
  const [types, setTypes] = useState<QuestionType[]>(['single', 'multiple']);
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [tone, setTone] = useState<Tone>('neutral');
  const [language, setLanguage] = useState<Language>('ru');
  const [blooms, setBlooms] = useState<BloomsLevel>('mixed');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleType = (t: QuestionType) => {
    setTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (types.length === 0) {
      toast.error('Выберите хотя бы один тип вопросов');
      return;
    }
    setLoading(true);
    try {
      const quiz = await api.generateQuiz({
        subject,
        grade,
        topic,
        question_count: count,
        attempt_limit: attemptLimit,
        time_limit_secs: timeLimit ? Number(timeLimit) : null,
        question_types: types,
        difficulty,
        tone,
        language,
        blooms_level: blooms,
        file,
      });
      toast.success('Квиз сгенерирован!');
      nav(`/quizzes/${quiz.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Ошибка генерации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Создать квиз</h1>
        <p className="mt-1 text-sm text-slate-500">Заполните параметры — нейросеть подготовит вопросы. Можно приложить материал (PDF / Word).</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card title="Основные параметры">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Предмет"
              placeholder="Информатика"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Input
              label="Класс / уровень"
              placeholder="9 класс"
              required
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            />
            <Input
              label="Тема"
              placeholder="Алгоритмы сортировки"
              required
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
        </Card>

        <Card title="Содержание">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Количество вопросов"
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            />
            <Input
              label="Время на квиз (сек)"
              type="number"
              min={0}
              placeholder="без ограничения"
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
            />
            <Select
              label="Попыток на ученика"
              value={String(attemptLimit)}
              onChange={(e) => setAttemptLimit(Number(e.target.value))}
              options={[
                { value: '1', label: '1 попытка' },
                { value: '2', label: '2 попытки' },
                { value: '3', label: '3 попытки' },
                { value: '0', label: 'Без ограничений' },
              ]}
            />
          </div>

          <div className="mt-5">
            <div className="mb-2 text-sm font-medium text-slate-700">Типы вопросов</div>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <Chip key={t.value} active={types.includes(t.value)} onClick={() => toggleType(t.value)}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Стиль и сложность" subtitle="Тонкие настройки генерации">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Сложность"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              options={[
                { value: 'mixed', label: 'Смешанная' },
                { value: 'easy', label: 'Лёгкая' },
                { value: 'medium', label: 'Средняя' },
                { value: 'hard', label: 'Сложная' },
              ]}
            />
            <Select
              label="Тон"
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              options={[
                { value: 'neutral', label: 'Нейтральный' },
                { value: 'formal', label: 'Строгий' },
                { value: 'playful', label: 'Игровой' },
              ]}
            />
            <Select
              label="Язык"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              options={[
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' },
              ]}
            />
            <Select
              label="Уровень (Bloom's)"
              value={blooms}
              onChange={(e) => setBlooms(e.target.value as BloomsLevel)}
              options={[
                { value: 'mixed', label: 'Все уровни' },
                { value: 'remember', label: 'Запомнить' },
                { value: 'understand', label: 'Понять' },
                { value: 'apply', label: 'Применить' },
                { value: 'analyze', label: 'Проанализировать' },
                { value: 'evaluate', label: 'Оценить' },
                { value: 'create', label: 'Создать' },
              ]}
            />
          </div>
        </Card>

        <Card title="Материал" subtitle="Необязательно — если приложите файл, вопросы будут опираться на его содержание">
          <FileDrop value={file} onChange={setFile} />
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => nav('/')}>Отмена</Button>
          <Button type="submit" loading={loading} size="lg">
            {loading ? 'Генерация…' : 'Сгенерировать'}
          </Button>
        </div>
      </form>
    </div>
  );
}

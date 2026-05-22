import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { PageSpinner } from '../components/Spinner';
import type { Quiz } from '../types';

export function QuizPrintPage() {
  const { id = '' } = useParams();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [withAnswers, setWithAnswers] = useState(false);

  useEffect(() => {
    api.getQuiz(id).then(setQuiz);
  }, [id]);

  if (!quiz) return <PageSpinner label="Подготовка к печати…" />;

  return (
    <div className="print-page mx-auto max-w-3xl bg-white p-8 print:p-0">
      <style>{`
        @media print {
          @page { margin: 14mm; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <h1 className="text-sm text-slate-500">Версия для печати — нажмите Ctrl/⌘+P</h1>
        <div className="flex gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={withAnswers}
              onChange={(e) => setWithAnswers(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            С ключом ответов
          </label>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            🖨 Печать
          </button>
        </div>
      </div>

      <header className="mb-8">
        <div className="text-xs uppercase tracking-wide text-slate-500">{quiz.subject} · {quiz.grade}</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{quiz.title}</h1>
        <div className="mt-1 text-sm text-slate-600">Тема: {quiz.topic}</div>

        <div className="mt-4 grid grid-cols-3 gap-4 border-y border-slate-200 py-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">Ф.И.</div>
            <div className="h-6 border-b border-slate-400" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Класс</div>
            <div className="h-6 border-b border-slate-400" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Дата</div>
            <div className="h-6 border-b border-slate-400" />
          </div>
        </div>
      </header>

      <ol className="space-y-6">
        {quiz.questions?.map((q, i) => (
          <li key={q.id} className="break-inside-avoid">
            <div className="font-semibold text-slate-900">
              {i + 1}. {q.text}
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({q.type === 'single' ? 'один ответ' : q.type === 'multiple' ? 'несколько' : 'верно/неверно'})
              </span>
            </div>
            <ul className="mt-2 space-y-1.5 pl-6 text-slate-800">
              {q.answers.map((a, j) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-400 text-xs">
                    {String.fromCharCode(65 + j)}
                  </span>
                  <span>
                    {a.text}
                    {withAnswers && a.is_correct && <span className="ml-2 font-semibold text-emerald-700">✓</span>}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <footer className="mt-12 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
        Сгенерировано QuizGen
      </footer>
    </div>
  );
}

import { DragEvent, useRef, useState } from 'react';

interface Props {
  value: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
  hint?: string;
}

export function FileDrop({ value, onChange, accept = '.pdf,.docx,.pptx,.txt,.md', hint }: Props) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onChange(f);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          over
            ? 'border-brand-500 bg-brand-50'
            : value
            ? 'border-emerald-300 bg-emerald-50/40'
            : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
        {value ? (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="m9 15 2 2 4-4" />
            </svg>
            <div className="text-sm font-medium text-slate-700">{value.name}</div>
            <div className="text-xs text-slate-500">{(value.size / 1024).toFixed(1)} КБ — нажмите для замены</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="mt-1 text-xs font-medium text-rose-600 hover:underline"
            >
              Убрать файл
            </button>
          </>
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-sm font-medium text-slate-700">Перетащите файл сюда или кликните</div>
            <div className="text-xs text-slate-500">{hint || 'PDF, DOCX, PPTX, TXT — до 10 МБ'}</div>
          </>
        )}
      </div>
    </div>
  );
}

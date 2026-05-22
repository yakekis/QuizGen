import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const baseClass =
  'block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className = '', ...rest },
  ref
) {
  return (
    <label className="block">
      {label && <div className="mb-1.5 text-sm font-medium text-slate-700">{label}</div>}
      <input ref={ref} {...rest} className={`${baseClass} ${error ? 'border-rose-400' : ''} ${className}`} />
      {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
      {hint && !error && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </label>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', ...rest }: TextareaProps) {
  return (
    <label className="block">
      {label && <div className="mb-1.5 text-sm font-medium text-slate-700">{label}</div>}
      <textarea {...rest} className={`${baseClass} resize-y min-h-[80px] ${error ? 'border-rose-400' : ''} ${className}`} />
      {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
    </label>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className = '', ...rest }: SelectProps) {
  return (
    <label className="block">
      {label && <div className="mb-1.5 text-sm font-medium text-slate-700">{label}</div>}
      <select {...rest} className={`${baseClass} appearance-none pr-9 bg-no-repeat bg-right ${className}`}
        style={{ backgroundImage: 'url("data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27%2364748b%27 viewBox=%270 0 16 16%27%3E%3Cpath d=%27M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z%27/%3E%3C/svg%3E")', backgroundPosition: 'right 0.75rem center' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

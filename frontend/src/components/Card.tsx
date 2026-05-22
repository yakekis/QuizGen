import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, actions, children, className = '' }: CardProps) {
  return (
    <section className={`surface p-6 sm:p-7 ${className}`}>
      {(title || actions) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

interface BadgeProps {
  variant?: 'draft' | 'published' | 'archived' | 'info';
  children: ReactNode;
}

export function Badge({ variant = 'info', children }: BadgeProps) {
  const classes = {
    draft: 'bg-amber-100 text-amber-800',
    published: 'bg-emerald-100 text-emerald-800',
    archived: 'bg-slate-100 text-slate-600',
    info: 'bg-brand-100 text-brand-700',
  };
  return <span className={`pill ${classes[variant]}`}>{children}</span>;
}

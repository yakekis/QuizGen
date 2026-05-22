import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  fullWidth,
  className = '',
  disabled,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${
        variantClasses[variant]
      } ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" />
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

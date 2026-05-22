interface Props {
  size?: number;
  label?: string;
}

export function Spinner({ size = 24, label }: Props) {
  return (
    <div className="inline-flex items-center gap-2 text-slate-500">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" />
        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" />
      </svg>
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function PageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner size={32} label={label} />
    </div>
  );
}

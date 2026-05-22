interface Props {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export function Chip({ active, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50'
      }`}
    >
      {children}
    </button>
  );
}

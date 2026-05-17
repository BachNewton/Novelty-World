export function LoadingSpinner({
  label,
  accentClass,
}: {
  label: string;
  /** Tailwind border-color class for the spinning edge, e.g. "border-t-brand-pink". */
  accentClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-text-secondary">
      <div
        className={`h-8 w-8 animate-spin rounded-full border-2 border-border-default ${accentClass}`}
        aria-hidden
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}

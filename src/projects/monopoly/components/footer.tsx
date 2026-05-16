export function Footer() {
  return (
    <div className="flex shrink-0">
      <FooterButton label="Roll" />
      <FooterButton label="Buy" />
      <FooterButton label="Trade" />
      <FooterButton label="End" />
    </div>
  );
}

function FooterButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex flex-1 items-center justify-center px-3 py-5 font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: "var(--mono-board)",
        color: "var(--mono-ink)",
        fontSize: "clamp(0.875rem, 2.5vmin, 1.125rem)",
        minHeight: "56px",
      }}
    >
      {label}
    </button>
  );
}

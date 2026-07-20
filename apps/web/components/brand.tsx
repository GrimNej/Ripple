type BrandProperties = Readonly<{
  compact?: boolean;
  inverted?: boolean;
}>;

export function Brand({ compact = false, inverted = false }: BrandProperties) {
  return (
    <a
      aria-label="Ripple home"
      className={`brand ${compact ? "brand--compact" : ""} ${inverted ? "brand--inverted" : ""}`}
      href="/"
    >
      <span aria-hidden="true" className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      {!compact && <span>Ripple</span>}
    </a>
  );
}

export function SignalMark() {
  return (
    <span aria-hidden="true" className="signal-mark">
      <i />
      <i />
      <i />
    </span>
  );
}

// Decorative range indicator: where the value sits against its reference band.
// The real numbers are always in text next to it; this is aria-hidden.
export function RangeBar({ value, low, high, flag }) {
  if (value === null || value === undefined || (low === null && high === null)) return null;
  let min = Math.min(value, low ?? value, high ?? value);
  let max = Math.max(value, low ?? value, high ?? value);
  const span = max - min || 1;
  min -= span * 0.22; max += span * 0.22;
  const W = 300;
  const x = (n) => Math.round(((n - min) / (max - min)) * W * 10) / 10;
  const x1 = low === null ? 0 : x(low);
  const x2 = high === null ? W : x(high);
  const dotX = Math.min(Math.max(x(value), 8), W - 8);
  return (
    <svg className="finding-bar" viewBox={`0 0 ${W} 22`} preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="9" width={W} height="5" rx="2.5" fill="var(--ivory-deep)" />
      <rect x={x1} y="9" width={Math.max(x2 - x1, 3)} height="5" rx="2.5" fill="var(--forest-tint-2)" />
      <circle cx={dotX} cy="11.5" r="8" fill={flag === 'normal' ? 'var(--forest)' : 'var(--rust)'} stroke="var(--paper)" strokeWidth="2" />
    </svg>
  );
}

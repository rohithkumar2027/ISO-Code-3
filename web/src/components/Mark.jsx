// Original, hand-drawn-style botanical line art in the brand's forest green.
// Decorative only (aria-hidden) and inline SVG, so it costs nothing to load
// and needs no licensing — a stand-in for photography that keeps the page
// light for patients on weak data.
export function LeafMark({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <path d="M80 18C104 34 132 54 132 92c0 24-20 44-44 50-30-6-56-30-56-66 0-40 28-58 48-58Z"
        stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
      <path d="M80 28v108" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
      <path d="M80 48c-14 4-26 14-30 26M80 70c-16 4-30 16-34 30M80 92c-16 2-30 12-34 26M80 48c14 4 26 14 30 26M80 70c16 4 30 16 34 30M80 92c16 2 30 12 34 26"
        stroke="currentColor" strokeWidth="1.2" opacity="0.45" strokeLinecap="round" />
    </svg>
  );
}

export function SprigDivider({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 220 28" fill="none" aria-hidden="true">
      <path d="M4 14h80M136 14h80" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
      <circle cx="110" cy="14" r="4" stroke="currentColor" strokeWidth="1.3" opacity="0.7" />
      <path d="M92 14c4-6 10-10 18-10s14 4 18 10c-4 6-10 10-18 10s-14-4-18-10Z" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
    </svg>
  );
}

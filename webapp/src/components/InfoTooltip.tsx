// Small circled-"i" icon that reveals helper text (e.g. a market's
// resolutionSource) in muted gray on hover/focus. Tailwind `group` powers
// the reveal so it works inside any page regardless of its CSS scope.
// `className` lets callers nudge spacing (e.g. `-ml-1` to sit closer to the text).
export function InfoTooltip({ text, label = 'More info', className = '' }: { text: string; label?: string; className?: string }) {
  if (!text) return null
  return (
    <span className={`group relative inline-flex mb-[5px] align-bottom ${className}`}>
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        className="inline-flex cursor-pointer items-center justify-center text-[var(--color-muted)] opacity-50 transition hover:opacity-90 focus:opacity-90 focus:outline-none"
      >
        <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" />
          <circle cx="6" cy="3.125" r=".875" fill="currentColor" strokeWidth="0" />
          <line x1="6" y1="8.5" x2="6" y2="5.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
        </svg>
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-max max-w-[260px] -translate-x-1/2 rounded-lg border border-[rgba(20,20,20,0.1)] bg-white px-3 py-2 text-left text-[12px] leading-relaxed text-[var(--color-muted)] shadow-[0_8px_30px_rgba(20,20,20,0.12)] group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  )
}

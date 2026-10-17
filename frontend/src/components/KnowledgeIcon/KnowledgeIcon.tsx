import type { KnowledgeKind } from '../../types/landmark'

/* Small line icons for the kinds of island knowledge (24 × 24 view box, drawn in currentColor). */
const PATHS: Record<KnowledgeKind, React.JSX.Element> = {
  // An apple
  food: (
    <>
      <path d="M12 7c-1.5-1.4-5-1.6-6.3 1.2C4.3 11.4 6.3 19 9 19.6c1.2.3 2-.6 3-.6s1.8.9 3 .6c2.7-.6 4.7-8.2 3.3-11.4C17 5.4 13.5 5.6 12 7z" />
      <path d="M12 7c0-2 1-3.5 3-4" />
    </>
  ),
  // A flag on a pole
  events: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h11l-2.5 4L17 12H6" />
    </>
  ),
  // A tree
  nature: (
    <>
      <path d="M12 3l6 9h-3.5l3.5 5H6l3.5-5H6z" />
      <path d="M12 17v4" />
    </>
  ),
  // A clock (long ago)
  history: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  // A paintbrush
  arts: (
    <>
      <path d="M14 4l6 6-8 8-6-6z" />
      <path d="M6 12c-2 0-3 2-3 4s-1 3-1 3c3 0 7 0 7-4" />
    </>
  ),
}

export function KnowledgeIcon({ kind, size = 24, className }: { kind: KnowledgeKind; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[kind]}
    </svg>
  )
}

/**
 * A flat drawing of the diver: shown while the 3D model loads, if it can't load, and as the fallback the
 * M0 check asked for. Same proportions as the model (feet at the bottom, helmet at the top).
 */
export function DiverSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 160" className={className} aria-hidden="true">
      <ellipse cx="60" cy="154" rx="34" ry="5" fill="#d1bd92" />
      {/* boots and legs */}
      <rect x="40" y="128" width="17" height="22" rx="5" fill="#3b4148" />
      <rect x="63" y="128" width="17" height="22" rx="5" fill="#3b4148" />
      <path d="M38 84 h44 l-2 48 h-17 l-3 -30 l-3 30 h-17 z" fill="#ddd0ab" stroke="#b9ab86" strokeWidth="2" />
      {/* body and arms */}
      <path d="M30 48 q30 -10 60 0 l6 40 q-36 10 -72 0 z" fill="#ddd0ab" stroke="#b9ab86" strokeWidth="2" />
      <path d="M30 52 q-8 16 -6 36" fill="none" stroke="#ddd0ab" strokeWidth="11" strokeLinecap="round" />
      <path d="M90 52 q8 16 6 36" fill="none" stroke="#ddd0ab" strokeWidth="11" strokeLinecap="round" />
      <circle cx="24" cy="90" r="6" fill="#c9976f" />
      <circle cx="96" cy="90" r="6" fill="#c9976f" />
      <rect x="38" y="80" width="44" height="6" rx="2" fill="#8a6a42" />
      {/* breastplate and helmet */}
      <path d="M34 46 q26 -12 52 0 l-6 10 q-20 -6 -40 0 z" fill="#c7963b" />
      <circle cx="60" cy="28" r="23" fill="#c7963b" stroke="#a87a28" strokeWidth="2" />
      <circle cx="60" cy="30" r="11" fill="#243642" stroke="#a87a28" strokeWidth="3" />
      <path d="M53 30 h14 M60 23 v14" stroke="#a87a28" strokeWidth="2" />
      <circle cx="40" cy="27" r="5" fill="#243642" stroke="#a87a28" strokeWidth="2" />
      <circle cx="80" cy="27" r="5" fill="#243642" stroke="#a87a28" strokeWidth="2" />
      <ellipse cx="52" cy="14" rx="6" ry="3" fill="#f3d48a" opacity="0.7" transform="rotate(-25 52 14)" />
    </svg>
  )
}

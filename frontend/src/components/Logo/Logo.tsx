// Sizes made from public/images/logo.png. Ratios are of the trimmed images.
const SOURCES = {
  full: { name: 'logo', ratio: 1605 / 679, widths: [400, 800, 1600] },
  mark: { name: 'logo-mark', ratio: 695 / 362, widths: [128, 256] },
}

interface Props {
  /** "full" is the wordmark with tagline; "mark" is the orca alone, for tight spots */
  variant?: keyof typeof SOURCES
  /** Display height in px; the width follows the ratio */
  height: number
  className?: string
}

/** SEAsk logo. Transparent, made for light backgrounds. */
export function Logo({ variant = 'full', height, className }: Props) {
  const { name, ratio, widths } = SOURCES[variant]
  const width = Math.round(height * ratio)
  return (
    <img
      className={className}
      src={`/images/${name}-${widths[0]}.webp`}
      srcSet={widths.map((w) => `/images/${name}-${w}.webp ${w}w`).join(', ')}
      sizes={`${width}px`}
      width={width}
      height={height}
      alt="SEAsk"
      decoding="async"
    />
  )
}

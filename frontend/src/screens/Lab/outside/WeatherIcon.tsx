import type { Sky } from '../../../weather/describe'

const SUN = <circle cx="72" cy="38" r="24" fill="#F5C04A" />
const MOON = <path d="M80 16 A26 26 0 1 0 96 58 A20 20 0 1 1 80 16 Z" fill="#C9D3E0" />
const CLOUD = (
  <path d="M24 82 Q12 82 12 70 Q12 58 26 58 Q30 42 48 42 Q64 42 68 58 Q84 56 88 70 Q90 82 76 82 Z" fill="#E4E9EC" stroke="#C9D1D4" strokeWidth="2" />
)
const BIG_CLOUD = (
  <path d="M28 76 Q10 76 10 60 Q10 44 30 44 Q36 24 60 24 Q82 24 88 44 Q108 44 108 60 Q108 76 90 76 Z" fill="#E4E9EC" stroke="#C9D1D4" strokeWidth="2" />
)

/** Weather picture for the "Outside right now" card (sun or moon, cloud, rain, fog). */
export function WeatherIcon({ sky, night, className }: { sky: Sky; night: boolean; className?: string }) {
  const body = night ? MOON : SUN
  let art
  if (sky === 'clear') art = body
  else if (sky === 'fewClouds' || sky === 'partlyCloudy') art = <>{body}{CLOUD}</>
  else if (sky === 'fog') art = (
    <g stroke="#C3CCD0" strokeWidth="6" strokeLinecap="round">
      <path d="M14 40 H98" /><path d="M24 58 H108" /><path d="M14 76 H90" />
    </g>
  )
  else {
    const drops = sky === 'drizzle' || sky === 'rain' || sky === 'thunder' || sky === 'snow'
    art = (
      <>
        {BIG_CLOUD}
        {drops && (
          <g fill={sky === 'snow' ? '#FFFFFF' : '#7FB2E5'} stroke={sky === 'snow' ? '#C3CCD0' : 'none'}>
            {[34, 58, 82].map((x) => <ellipse key={x} cx={x} cy={90} rx={sky === 'snow' ? 4 : 3} ry={sky === 'snow' ? 4 : 6} />)}
          </g>
        )}
      </>
    )
  }
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden="true">
      {art}
    </svg>
  )
}

import { formatHour, formatNumber, formatTime, minutesOf, todayAt } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import { describeTide } from '../../../tides/trend'
import type { TidesContent } from '../../../types/content'
import styles from './TideChart.module.css'

/* Chart frame from the mockup: x 40–1060 for 24 h, y = 260 − 62 × height (m). */
const X0 = 40
const X1 = 1060
const xAt = (minutes: number) => X0 + (minutes / 1440) * (X1 - X0)
const yAt = (h: number) => 260 - 62 * h
/** A label near the "Now" marker moves to the right, as in the mockup. */
const NOW_CLEARANCE = 60
const NOW_SHIFT = 126

/** Today's tide curve with "Now" at the clock time, and a headline worked out from the curve. */
export function TideChart({ tides, now }: { tides: TidesContent; now: Date }) {
  const { t, lang } = useLanguage()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const said = describeTide(tides.heights, nowMin)
  const step = (X1 - X0) / (tides.heights.length - 1)
  const curve = 'M' + tides.heights.map((h, i) => `${(X0 + i * step).toFixed(1)} ${yAt(h).toFixed(1)}`).join(' L')
  const nowX = xAt(nowMin)
  const k = (nowX - X0) / step
  const i = Math.min(tides.heights.length - 2, Math.floor(k))
  const nowY = yAt(tides.heights[i] + (tides.heights[i + 1] - tides.heights[i]) * (k - i))

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>{t('tides.tideToday', { place: tides.place })}</span>
          <span className={styles.title}>{t(`tides.state.${said.headline}`)}</span>
        </div>
        <span className={styles.sub}>{t(`tides.trend.${said.sub}`, { n: said.n })}</span>
      </div>
      <svg viewBox="0 0 1100 300" className={styles.chart} role="img" aria-label={t('tides.chartLabel')}>
        <defs>
          <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1F6FE0" stopOpacity="0.28" />
            <stop offset="1" stopColor="#1F6FE0" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <g stroke="#E6EAEC" strokeWidth="1">
          {[3, 2, 1, 0].map((m) => <line key={m} x1={X0} y1={yAt(m)} x2={X1} y2={yAt(m)} />)}
        </g>
        <g fontFamily="JetBrains Mono, monospace" fontSize="13" fill="#5D676D">
          {[3, 2, 1, 0].map((m) => <text key={m} x="0" y={yAt(m) + 4}>{m} m</text>)}
          {[0, 6, 12, 18, 24].map((h) => (
            <text key={h} x={xAt(h * 60)} y="290" textAnchor="middle">{formatHour(todayAt(`${h % 24}:00`), lang)}</text>
          ))}
        </g>
        <path d={`${curve} L${X1} 260 L${X0} 260 Z`} fill="url(#tideFill)" />
        <path d={curve} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="4" strokeLinejoin="round" />
        <line x1={nowX} y1="40" x2={nowX} y2="260" stroke="#15191C" strokeWidth="2" strokeDasharray="4 5" />
        <circle cx={nowX} cy={nowY} r="9" fill="#FFFFFF" stroke="#15191C" strokeWidth="4" />
        <rect x={nowX - 40} y="14" width="80" height="26" rx="13" fill="#15191C" />
        <text x={nowX} y="32" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="14" fontWeight="600" fill="#FFFFFF">
          {t('tides.now')}
        </text>
        <g fontFamily="Outfit, sans-serif" fontSize="14" fill="#3C464B" textAnchor="middle">
          {tides.extremes.map((e) => {
            const x = xAt(minutesOf(e.at))
            const label = t(e.type === 'high' ? 'tides.high' : 'tides.low', {
              h: formatNumber(e.h, 1, lang),
              time: formatTime(todayAt(e.at), lang),
            })
            return (
              <text key={e.at} x={Math.abs(x - nowX) < NOW_CLEARANCE ? nowX + NOW_SHIFT : x} y={yAt(e.h) + (e.type === 'high' ? -12 : 28)}>
                {label}
              </text>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

import { useBridgeData, useSnapshot } from '../../../bridge/BridgeProvider'
import { FOULING, foulingAlongRoute, nextHotspot } from '../../../bridge/derive/fouling'
import { short } from '../../../config/sources'
import { ROUTE } from '../../../ship/sailing'
import { FoulingStrip } from '../charts/FoulingStrip'
import { dayLabel, num, t, ZONE_NAMES } from '../strings'
import { Empty, Section, Stat } from './parts'
import styles from './Rail.module.css'

/**
 * The experimental biofouling index on this crossing: the next hotspot and how far it is, the index
 * along the route, and every hotspot. An advisory (where not to hold or run slow), never a route.
 */
export function FoulingSection() {
  const snap = useSnapshot()
  const { day, status } = useBridgeData()
  const f = day.fouling
  const s = status.fouling

  if (!f) {
    const text = s.state === 'missing' ? s.reason.charAt(0).toUpperCase() + s.reason.slice(1) : s.state === 'loading' ? t('loading') : t('missing')
    return (
      <Section title={t('fouling')}>
        <Empty text={text} />
      </Section>
    )
  }

  const { profile, hotspots } = foulingAlongRoute(f)
  const ship = snap.ship
  const crossing = ship?.crossing ?? null
  const direction = crossing?.direction ?? ship?.nextDeparture?.direction ?? 'swb_to_tsa'
  const ahead = crossing && ship && Number.isFinite(ship.frac) ? nextHotspot(hotspots, ship.frac, crossing.direction, ship.sogKn) : null
  const zone = (id: string) => ZONE_NAMES[id] ?? id

  return (
    <Section title={t('fouling')} aside={`${short('seaskFouling')} · ${f.date === day.date ? 'experimental' : `${dayLabel(f.date)} run`}`}>
      {!hotspots.length ? (
        <Empty text={t('foulingNoHotspots', { level: FOULING.elevated })} />
      ) : ahead ? (
        <div className={styles.pair}>
          <Stat
            label={ahead.inside ? t('foulingInside') : t('foulingNext')}
            value={ahead.hotspot.id}
            size="lg"
            sub={
              <>
                {zone(ahead.hotspot.zone)}
                <br />
                {t(ahead.inside ? 'foulingLeft' : 'foulingIn', { nm: num(ahead.inside ? ahead.leftNm : ahead.distNm, 1), min: num(ahead.minutes, 0) })}
              </>
            }
          />
          <Stat label="Peak" value={num(ahead.hotspot.peak, 0)} sub={`spread ${num(ahead.hotspot.spread, 0)}`} />
        </div>
      ) : crossing ? (
        <Empty text={t('foulingNoneAhead')} />
      ) : null}
      <FoulingStrip profile={profile} hotspots={hotspots} frac={ship?.frac ?? NaN} east={direction === 'swb_to_tsa'} />
      {hotspots.length > 0 && (
        <ul className={styles.hotspots}>
          {hotspots.map((h) => (
            <li key={h.id} data-next={ahead?.hotspot.id === h.id || undefined}>
              <b>
                {h.id} · {zone(h.zone)}
              </b>
              <span>
                peak {num(h.peak, 0)} (spread {num(h.spread, 0)}) · {num(h.lengthNm, 1)} nm · ~{num((h.lengthNm / ROUTE.serviceSpeedKn) * 60, 0)} min
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.muted}>{t('foulingAdvice')}</p>
      <p className={styles.muted}>{t('foulingCaveat', { date: dayLabel(f.date) })}</p>
    </Section>
  )
}

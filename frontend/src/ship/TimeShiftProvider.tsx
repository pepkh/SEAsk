import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { indexAt, rowAt } from './interpolate'
import { deriveSailing } from './sailing'
import { ShownShipContext, TimeShiftContext, type ReplaySpeed, type ShipState } from './shipContext'

/** The rewound clock moves on this often while playing (ms). */
const TICK_MS = 250
/** Closer than this to now counts as caught up: back to live (ms). */
const CATCH_UP_MS = 1500

interface Shift {
  at: number
  playing: boolean
  speed: ReplaySpeed
  /** Feed source when the rewind started; a change of source ends it */
  source: ShipState['source']
  /** Visitor session it was made in; a new visitor always starts live */
  session: number
}

/**
 * Rewinding the current trip, like a live stream: the screens can show an earlier moment from the history and
 * play on from there, until "Go Live" (or catching up) returns to now. Everything that reads useShip() follows.
 */
export function TimeShiftProvider({ live, session, children }: { live: ShipState | null; session: number; children: ReactNode }) {
  const [shift, setShift] = useState<Shift | null>(null)
  const [jump, setJump] = useState(0)
  const history = live?.history
  const times = useMemo(() => history?.map((row) => Date.parse(row.time)) ?? [], [history])
  const latest = useRef(0)
  useEffect(() => {
    latest.current = times[times.length - 1] ?? 0
  }, [times])

  // A rewind only makes sense on the history (and for the visitor) it was made for.
  const current = shift && live && shift.source === live.source && shift.session === session ? shift : null
  const speed = current?.speed ?? 1

  // The playback timer reads the rewind from here; every change goes through `update`, so a tick that lands just
  // after Go Live can't bring the old rewind back.
  const playing = useRef<Shift | null>(null)
  const update = useCallback((next: Shift | null) => {
    playing.current = next
    setShift(next)
  }, [])

  useEffect(() => {
    if (!current?.playing) return
    const id = setInterval(() => {
      const s = playing.current
      if (!s) return
      const at = s.at + TICK_MS * s.speed
      if (at >= latest.current - CATCH_UP_MS) {
        // Caught up with now: back to live.
        update(null)
        setJump((n) => n + 1)
      } else {
        update({ ...s, at })
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [current?.playing, update])

  const rewindTo = useCallback(
    (at: number) => {
      if (!live) return
      // Another jump in the same rewind keeps its speed.
      const same = playing.current?.session === session ? playing.current : null
      update({ at, playing: true, speed: same?.speed ?? 1, source: live.source, session })
      setJump((n) => n + 1)
    },
    [live, session, update],
  )
  const setPlaying = useCallback((on: boolean) => playing.current && update({ ...playing.current, playing: on }), [update])
  const setSpeed = useCallback((next: ReplaySpeed) => playing.current && update({ ...playing.current, speed: next }), [update])
  const goLive = useCallback(() => {
    update(null)
    setJump((n) => n + 1)
  }, [update])

  const shown = useMemo<ShipState | null>(() => {
    if (!live || !current || !history) return live
    const row = rowAt(history, times, current.at)
    if (!row) return live
    const past = history.slice(0, indexAt(times, current.at) + 1)
    return { row, history: past.length ? past : [row], sailing: deriveSailing(row, past.length ? past : [row], current.at), source: live.source }
  }, [live, current, history, times])

  const value = useMemo(
    () => ({
      at: current?.at ?? null,
      playing: current?.playing ?? false,
      speed,
      behindMs: current ? Math.max(0, (times[times.length - 1] ?? current.at) - current.at) : 0,
      jump,
      rewindTo,
      setPlaying,
      setSpeed,
      goLive,
    }),
    [current, speed, times, jump, rewindTo, setPlaying, setSpeed, goLive],
  )

  return (
    <TimeShiftContext value={value}>
      <ShownShipContext value={shown}>{children}</ShownShipContext>
    </TimeShiftContext>
  )
}

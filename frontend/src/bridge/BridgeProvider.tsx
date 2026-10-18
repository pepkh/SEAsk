import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BridgeMode } from '../types/bridge'
import type { DayData, PartName, PartStatus } from './model'
import { createPlayhead, usePlayheadTime, type Playhead } from './playhead'
import { snapshotAt, type Snapshot, type WaterKey } from './snapshot'
import { useDayData } from './useDayData'
import { useLiveDay } from './useLiveDay'

export type FieldLayer = 'none' | 'currents' | 'wind' | 'fouling'
export type Basemap = 'satellite' | 'chart' | 'plain'
export type TrackKey = WaterKey | 'sogKn' | 'rollDeg'

interface BridgeData {
  mode: BridgeMode
  setMode: (mode: BridgeMode) => void
  date: string
  day: DayData
  status: Record<PartName, PartStatus>
  version: number
}

interface BridgeUi {
  layer: FieldLayer
  setLayer: (layer: FieldLayer) => void
  basemap: Basemap
  setBasemap: (basemap: Basemap) => void
  trackKey: TrackKey
  setTrackKey: (key: TrackKey) => void
  /** Selected AIS vessel (MMSI) */
  selected: number | null
  setSelected: (mmsi: number | null) => void
  night: boolean
  setNight: (night: boolean) => void
  askOpen: boolean
  setAskOpen: (open: boolean) => void
}

const DataContext = createContext<BridgeData | null>(null)
const UiContext = createContext<BridgeUi | null>(null)
const PlayheadContext = createContext<Playhead | null>(null)
const SnapshotContext = createContext<Snapshot | null>(null)

/** Start time from the address (`?t=14:05`), else just before the first departure. */
function initialTime(day: DayData): number | null {
  const param = new URLSearchParams(window.location.search).get('t')
  const match = param?.match(/^(\d{1,2}):(\d{2})$/)
  if (match) return day.dayStart + (Number(match[1]) * 60 + Number(match[2])) * 60_000
  const first = day.ship?.crossings[0]
  return first ? first.start - 5 * 60_000 : null
}

/** Data, UI choices, the playhead and the snapshot at the playhead for the bridge screen. */
export function BridgeProvider({ date, mode: initialMode, children }: { date: string; mode: BridgeMode; children: ReactNode }) {
  const [mode, setMode] = useState<BridgeMode>(initialMode)
  const replay = useDayData(date, mode === 'replay')
  const live = useLiveDay(mode === 'live')
  const { day, status, version } = mode === 'live' ? live : replay
  const [playhead] = useState(() => createPlayhead({ t: day.dayStart + 7 * 3_600_000, min: day.dayStart, max: day.dayEnd - 60_000 }))
  const placed = useRef(false)

  useEffect(() => {
    playhead.setRange(day.dayStart, day.dayEnd - 60_000)
  }, [playhead, day.dayStart, day.dayEnd])

  // Replay: put the playhead at the start time once the ship (and its crossings) has arrived.
  useEffect(() => {
    if (mode !== 'replay' || placed.current || !day.ship) return
    const t = initialTime(day)
    if (t !== null) playhead.seek(t)
    placed.current = true
  }, [mode, day, version, playhead])

  // Live: follow the clock. Switching back to replay places the playhead again.
  useEffect(() => {
    if (mode !== 'live') {
      return
    }
    placed.current = false
    playhead.setPlaying(false)
    playhead.goLive(Date.now())
    const id = window.setInterval(() => playhead.tickLive(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [mode, playhead])

  const [layer, setLayer] = useState<FieldLayer>('currents')
  const [basemap, setBasemap] = useState<Basemap>('satellite')
  const [trackKey, setTrackKey] = useState<TrackKey>('sal')
  const [selected, setSelected] = useState<number | null>(null)
  const [night, setNight] = useState(false)
  const [askOpen, setAskOpen] = useState(false)

  const data = useMemo(() => ({ mode, setMode, date: day.date, day, status, version }), [mode, day, status, version])
  const ui = useMemo(
    () => ({ layer, setLayer, basemap, setBasemap, trackKey, setTrackKey, selected, setSelected, night, setNight, askOpen, setAskOpen }),
    [layer, basemap, trackKey, selected, night, askOpen],
  )

  return (
    <DataContext value={data}>
      <UiContext value={ui}>
        <PlayheadContext value={playhead}>
          <SnapshotProvider day={day} version={version} playhead={playhead} stepMs={mode === 'live' ? 1000 : 10_000}>
            {children}
          </SnapshotProvider>
        </PlayheadContext>
      </UiContext>
    </DataContext>
  )
}

/**
 * Recomputes the snapshot at most 6 times a second during playback, and for every `stepMs` of change
 * otherwise: 10 s of day time when scrubbing a replay, every second live (like the kiosk's 1 Hz feed).
 */
function SnapshotProvider({ day, version, playhead, stepMs, children }: { day: DayData; version: number; playhead: Playhead; stepMs: number; children: ReactNode }) {
  const t = usePlayheadTime(playhead, 6, stepMs)
  // `version` changes when a dataset arrives: the snapshot must be rebuilt then too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => snapshotAt(day, t), [day, version, t])
  return <SnapshotContext value={snapshot}>{children}</SnapshotContext>
}

function need<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} needs a BridgeProvider`)
  return value
}

// eslint-disable-next-line react/only-export-components
export const useBridgeData = () => need(useContext(DataContext), 'useBridgeData')
// eslint-disable-next-line react/only-export-components
export const useBridgeUi = () => need(useContext(UiContext), 'useBridgeUi')
// eslint-disable-next-line react/only-export-components
export const usePlayhead = () => need(useContext(PlayheadContext), 'usePlayhead')
// eslint-disable-next-line react/only-export-components
export const useSnapshot = () => need(useContext(SnapshotContext), 'useSnapshot')

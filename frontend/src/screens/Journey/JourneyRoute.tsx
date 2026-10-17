import { useKiosk } from '../../context/KioskContext'
import { JourneyAdults } from './adults/JourneyAdults'
import { JourneyKids } from './kids/JourneyKids'

/** Kids mode shows the 3D Journey screen. Grown-ups mode shows the data screen. */
export function JourneyRoute() {
  const { audience } = useKiosk()
  return audience === 'kids' ? <JourneyKids /> : <JourneyAdults />
}

import { Navigate, Route, Routes } from 'react-router'
import { KioskLayout } from './layout/KioskLayout'
import { JourneyRoute } from './screens/Journey/JourneyRoute'
import { Quiz } from './screens/Quiz/Quiz'
import { Seafloor } from './screens/Seafloor/Seafloor'
import { SeaLife } from './screens/SeaLife/SeaLife'
import { Tides } from './screens/Tides/Tides'

export default function App() {
  return (
    <Routes>
      <Route element={<KioskLayout />}>
        <Route path="journey" element={<JourneyRoute />} />
        <Route path="sea-life" element={<SeaLife />} />
        <Route path="seafloor" element={<Seafloor />} />
        <Route path="tides" element={<Tides />} />
        <Route path="quiz" element={<Quiz />} />
        <Route path="*" element={<Navigate to="/journey" replace />} />
      </Route>
    </Routes>
  )
}

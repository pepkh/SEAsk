import { Navigate, Route, Routes } from 'react-router'
import { KioskLayout } from './layout/KioskLayout'
import { Dive } from './screens/Dive/Dive'
import { Ferry } from './screens/Ferry/Ferry'
import { Lab } from './screens/Lab/Lab'
import { Quiz } from './screens/Quiz/Quiz'
import { Welcome } from './screens/Welcome/Welcome'

export default function App() {
  return (
    <Routes>
      <Route element={<KioskLayout />}>
        <Route index element={<Welcome />} />
        <Route path="ferry" element={<Ferry />} />
        <Route path="dive" element={<Dive />} />
        <Route path="quiz" element={<Quiz />} />
        <Route path="lab" element={<Lab />} />
        {/* Older addresses */}
        <Route path="journey" element={<Navigate to="/" replace />} />
        <Route path="tides" element={<Navigate to="/" replace />} />
        <Route path="sea-life" element={<Navigate to="/dive" replace />} />
        <Route path="seafloor" element={<Navigate to="/dive" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

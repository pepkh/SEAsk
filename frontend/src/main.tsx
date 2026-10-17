import '@fontsource/outfit/300.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './styles/tokens.css'
import './styles/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { KioskProvider } from './context/KioskContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { ShipProvider } from './ship/ShipProvider'
import { WeatherProvider } from './weather/WeatherProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <KioskProvider>
          <ShipProvider>
            <WeatherProvider>
              <App />
            </WeatherProvider>
          </ShipProvider>
        </KioskProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
)

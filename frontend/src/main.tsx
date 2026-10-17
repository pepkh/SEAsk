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
import { LOW_FX } from './config/env'
import { KioskProvider } from './context/KioskContext'
import { SessionProvider } from './context/SessionContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { ShipProvider } from './ship/ShipProvider'
import { TidesProvider } from './tides/TidesProvider'
import { WeatherProvider } from './weather/WeatherProvider'

if (LOW_FX) document.documentElement.dataset.lowfx = ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <SessionProvider>
          <KioskProvider>
            <ShipProvider>
              <WeatherProvider>
                <TidesProvider>
                  <App />
                </TidesProvider>
              </WeatherProvider>
            </ShipProvider>
          </KioskProvider>
        </SessionProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
)

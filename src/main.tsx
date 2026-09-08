import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import {
  applyTheme,
  getInitialTheme,
  THEME_STORAGE_KEY,
  type ColorTheme,
} from './lib/theme'

applyTheme(getInitialTheme())
window.addEventListener('storage', (event) => {
  if (
    event.key === THEME_STORAGE_KEY &&
    (event.newValue === 'light' || event.newValue === 'dark')
  ) {
    applyTheme(event.newValue as ColorTheme)
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

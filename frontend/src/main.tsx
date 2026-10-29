import './layers.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.tsx'
import './index.css'
import './ui/ui.css'
import { watchTheme } from './ui/theme'

// Modo oscuro: index.html ya fijó el tema antes de pintar; aquí se mantiene al día (sistema u otra pestaña).
watchTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </StrictMode>,
)

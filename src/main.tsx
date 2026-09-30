import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './pwa/register.ts'
import { demarrerSauvegarde } from './sync/demarrage.ts'

registerServiceWorker()
// Le carnet part tout seul dès qu'une session existe — CB-79e.
demarrerSauvegarde()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

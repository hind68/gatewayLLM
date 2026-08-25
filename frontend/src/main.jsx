import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/jetbrains-mono'
import './styles/index.css'
import App from './App.jsx'
import { AuthProvider } from './AuthProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)

import { useLayoutEffect, useState } from 'react'
import MainApp from './pages/MainApp'
import './index.css'

export default function App() {
  useLayoutEffect(() => {
    document.documentElement.classList.remove('electron-frame', 'electron-darwin', 'electron-win32')
  }, [])

  const [session, setSession] = useState(0)

  return (
    <div className="app-root">
      <MainApp key={session} onLogout={() => setSession(n => n + 1)} />
    </div>
  )
}

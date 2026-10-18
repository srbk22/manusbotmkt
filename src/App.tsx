import { useCallback, useLayoutEffect, useState } from 'react'
import Login from './pages/Login'
import MainApp from './pages/MainApp'
import LicenseGate from './pages/LicenseGate'
import { FEATURE_FLAGS } from './feature-flags'
import { LICENSE_STORAGE_KEY } from './lib/auth-storage'
import './index.css'

export default function App() {
  useLayoutEffect(() => {
    document.documentElement.classList.remove('electron-frame', 'electron-darwin', 'electron-win32')
  }, [])

  const [licensedEmail, setLicensedEmail] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [session, setSession] = useState(0)

  const handleLogout = useCallback(async () => {
    try {
      await window.manusPro?.appLogout?.()
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(LICENSE_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setLicensedEmail(null)
    setLoggedIn(false)
    setSession(n => n + 1)
  }, [])

  if (FEATURE_FLAGS.LICENSE_REQUIRED && !licensedEmail) {
    return (
      <div className="app-root">
        <LicenseGate onAuthorized={setLicensedEmail} />
      </div>
    )
  }

  if (FEATURE_FLAGS.BROKER10_AUTH_REQUIRED && !loggedIn) {
    return (
      <div className="app-root">
        <Login onLoggedIn={() => setLoggedIn(true)} />
      </div>
    )
  }

  return (
    <div className="app-root">
      <MainApp key={session} onLogout={handleLogout} />
    </div>
  )
}

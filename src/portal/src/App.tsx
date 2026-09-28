import * as Tooltip from '@radix-ui/react-tooltip'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout.tsx'
import { FirDetail } from './pages/FirDetail.tsx'
import { FirList, FirPage } from './pages/FirPage.tsx'
import { Login } from './pages/Login.tsx'
import { Networks } from './pages/Networks.tsx'
import { PersonProfile } from './pages/PersonProfile.tsx'
import { HOTSPOTS_URL } from './config.ts'
import { ComingSoon, Overview } from './pages/Overview.tsx'
import { Settings } from './pages/Settings.tsx'
import { Trends } from './pages/Trends.tsx'
import { StoreProvider, useStore } from './state/store.tsx'

// The Hotspots module is a separate app on this origin. A client-side route change
// cannot reach it, so hand the address to the browser for a full page load.
function OpenHotspots() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    window.location.replace((pathname.startsWith(HOTSPOTS_URL) ? pathname : HOTSPOTS_URL) + search)
  }, [pathname, search])
  return (
    <p role="status" className="text-muted">
      Opening Hotspots
    </p>
  )
}

function Screens() {
  const { signedIn } = useStore()
  if (!signedIn) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="fir" element={<FirPage />}>
          <Route index element={<FirList />} />
          <Route path="networks" element={<Networks />} />
          <Route path="trends" element={<Trends />} />
          <Route path="case/:regNo" element={<FirDetail />} />
          <Route path="person/:id" element={<PersonProfile />} />
        </Route>
        <Route path="drug-risk" element={<ComingSoon title="Drug risk">District drug risk scores, rankings and the monthly narcotics report arrive with the next module.</ComingSoon>} />
        <Route path="hotspots/*" element={<OpenHotspots />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Tooltip.Provider delayDuration={150}>
        <BrowserRouter>
          <Screens />
        </BrowserRouter>
      </Tooltip.Provider>
    </StoreProvider>
  )
}

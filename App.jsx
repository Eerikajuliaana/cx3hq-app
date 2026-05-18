import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Assessment from './pages/Assessment'
import Dashboard from './pages/Dashboard'
import Employee from './pages/Employee'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--teal)', marginBottom: '0.5rem' }}>CX3HQ</div>
        <div style={{ color: 'var(--white-dim)', fontSize: '0.85rem' }}>Loading...</div>
      </div>
    </div>
  )

  if (!session) return <Auth />

  if (!profile?.role) return <Onboarding userId={session.user.id} email={session.user.email} onComplete={setProfile} />

  const hasAssessment = profile?.assessment_completed

  if (!hasAssessment) return <Assessment userId={session.user.id} profile={profile} onComplete={() => loadProfile(session.user.id)} />

  if (profile.role === 'manager') return (
    <Routes>
      <Route path="/*" element={<Dashboard profile={profile} />} />
    </Routes>
  )

  return (
    <Routes>
      <Route path="/*" element={<Employee profile={profile} />} />
    </Routes>
  )
}

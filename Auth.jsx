import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setSuccess('Check your email to confirm your account!')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--black)' }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--white)', marginBottom: '0.25rem' }}>
            CX3HQ
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--teal)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Cognition · Communication · Capacity
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 300 }}>
            {mode === 'login' ? 'Sign in to your CX3HQ account' : 'Start your human performance journey'}
          </p>

          {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
          {success && (
            <div style={{ background: 'var(--teal-dim)', border: '1px solid var(--teal-border)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.82rem', color: 'var(--teal)', marginBottom: '1rem' }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--white-dim)', display: 'block', marginBottom: '0.4rem' }}>Email</label>
              <input className="input" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--white-dim)', display: 'block', marginBottom: '0.4rem' }}>Password</label>
              <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: '0.5rem' }}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in →' : 'Create account →'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess('') }}
              style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: '0.82rem', textDecoration: 'underline' }}>
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--white-faint)', marginTop: '1.5rem', lineHeight: 1.5 }}>
          Your data is stored securely in the EU. We never share your profile with anyone outside your team.
        </p>
      </div>
    </div>
  )
}

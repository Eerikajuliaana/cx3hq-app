import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Onboarding({ userId, email, onComplete }) {
  const [step, setStep] = useState(1)
  const [role, setRole] = useState('')
  const [fullName, setFullName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamCode, setTeamCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setLoading(true)
    setError('')

    try {
      if (role === 'manager') {
        // Create team
        const { data: team, error: teamError } = await supabase
          .from('teams')
          .insert({ name: teamName, manager_id: userId })
          .select()
          .single()

        if (teamError) throw teamError

        // Create profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .upsert({ id: userId, email, full_name: fullName, role: 'manager', team_id: team.id })
          .select()
          .single()

        if (profileError) throw profileError
        onComplete(profile)

      } else {
        // Find team by code
        const { data: team, error: teamError } = await supabase
          .from('teams')
          .select()
          .eq('id', teamCode.trim())
          .single()

        if (teamError || !team) throw new Error('Team not found. Please check the code.')

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .upsert({ id: userId, email, full_name: fullName, role: 'employee', team_id: team.id })
          .select()
          .single()

        if (profileError) throw profileError
        onComplete(profile)
      }
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: '480px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--white)' }}>CX3HQ</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--white-dim)', marginTop: '0.25rem' }}>Step {step} of {role === 'manager' ? 3 : 3}</div>
        </div>

        <div className="card">
          {step === 1 && (
            <>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>What's your name?</h2>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 300 }}>This is how your team will see you.</p>
              <input className="input" placeholder="Your full name" value={fullName} onChange={e => setFullName(e.target.value)} style={{ marginBottom: '1rem' }} />
              <button className="btn-primary" onClick={() => setStep(2)} disabled={!fullName.trim()}>Continue →</button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>What is your role?</h2>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 300 }}>This determines what you see in CX3HQ.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div onClick={() => setRole('manager')} style={{ padding: '1.25rem', border: `1px solid ${role === 'manager' ? 'var(--teal)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', background: role === 'manager' ? 'var(--teal-dim)' : 'var(--navy-light)', transition: 'all 0.15s' }}>
                  <div style={{ fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem' }}>👔 I am a manager</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--white-dim)' }}>I lead a team and want to understand how everyone works best</div>
                </div>
                <div onClick={() => setRole('employee')} style={{ padding: '1.25rem', border: `1px solid ${role === 'employee' ? 'var(--teal)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', background: role === 'employee' ? 'var(--teal-dim)' : 'var(--navy-light)', transition: 'all 0.15s' }}>
                  <div style={{ fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem' }}>🧑‍💻 I am a team member</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--white-dim)' }}>I want to understand how I work best and collaborate better</div>
                </div>
              </div>
              <button className="btn-primary" onClick={() => setStep(3)} disabled={!role}>Continue →</button>
            </>
          )}

          {step === 3 && (
            <>
              {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
              {role === 'manager' ? (
                <>
                  <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>Create your team</h2>
                  <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 300 }}>Give your team a name. You'll get a team code to share with members.</p>
                  <input className="input" placeholder="e.g. Sales Team, Marketing, Leadership" value={teamName} onChange={e => setTeamName(e.target.value)} style={{ marginBottom: '1rem' }} />
                  <button className="btn-primary" onClick={handleSubmit} disabled={!teamName.trim() || loading}>
                    {loading ? 'Creating...' : 'Create team & continue →'}
                  </button>
                </>
              ) : (
                <>
                  <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>Join your team</h2>
                  <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 300 }}>Enter the team code your manager shared with you.</p>
                  <input className="input" placeholder="Team code (from your manager)" value={teamCode} onChange={e => setTeamCode(e.target.value)} style={{ marginBottom: '1rem' }} />
                  <button className="btn-primary" onClick={handleSubmit} disabled={!teamCode.trim() || loading}>
                    {loading ? 'Joining...' : 'Join team & continue →'}
                  </button>
                </>
              )}
            </>
          )}

          {step > 1 && (
            <button onClick={() => setStep(step - 1)} style={{ background: 'none', border: 'none', color: 'var(--white-dim)', fontSize: '0.82rem', marginTop: '1rem', display: 'block' }}>← Back</button>
          )}
        </div>

        <button onClick={handleSignOut} style={{ background: 'none', border: 'none', color: 'var(--white-faint)', fontSize: '0.75rem', display: 'block', margin: '1rem auto 0', textDecoration: 'underline' }}>Sign out</button>
      </div>
    </div>
  )
}

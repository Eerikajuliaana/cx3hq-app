import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Dashboard({ profile }) {
  const [tab, setTab] = useState('overview')
  const [team, setTeam] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: `Welcome back, ${profile.full_name}! I'm your AI coach. I know your team's full profiles. Ask me anything about managing them better, or type "team summary" for an overview.` }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [transInput, setTransInput] = useState('')
  const [transTarget, setTransTarget] = useState(null)
  const [transResult, setTransResult] = useState('')
  const [transLoading, setTransLoading] = useState(false)
  const [checkinWord, setCheckinWord] = useState('')
  const [myAssessment, setMyAssessment] = useState(null)
  const [teamCheckins, setTeamCheckins] = useState({})

  useEffect(() => { loadTeam(); loadMyAssessment() }, [])

  async function loadMyAssessment() {
    const { data } = await supabase.from('assessments').select('*').eq('user_id', profile.id).order('completed_at', { ascending: false }).limit(1)
    setMyAssessment(data?.[0] || null)
  }

  async function loadTeamCheckins(memberIds) {
    if (!memberIds.length) return
    const { data } = await supabase
      .from('checkins')
      .select('*')
      .in('user_id', memberIds)
      .order('created_at', { ascending: false })
    
    // Get latest checkin per user
    const latest = {}
    data?.forEach(c => {
      if (!latest[c.user_id]) latest[c.user_id] = c
    })
    setTeamCheckins(latest)
  }

  async function loadTeam() {
    const { data: teamData } = await supabase.from('teams').select('*').eq('id', profile.team_id).single()
    setTeam(teamData)

    const { data: memberData } = await supabase
      .from('profiles')
      .select('*, assessments(*)')
      .eq('team_id', profile.team_id)
      .eq('role', 'employee')

    setMembers(memberData || [])
    setLoading(false)
    if (memberData?.length) {
      loadTeamCheckins(memberData.map(m => m.id))
    }
  }

  async function sendChat() {
    if (!chatInput.trim()) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(m => [...m, { role: 'user', text: userMsg }])
    setChatLoading(true)

    const myScores = myAssessment?.scores || {}
    const myAnswers = myAssessment?.answers || {}

    // Sensory channel definitions
    const CHANNELS = {
      listening:    { id: 7,  label: 'Listening', hemisphere: 'left' },
      speaking:     { id: 8,  label: 'Speaking', hemisphere: 'left' },
      inner_speech: { id: 9,  label: 'Inner Speech', hemisphere: 'left' },
      reading:      { id: 12, label: 'Reading', hemisphere: 'left' },
      visual:       { id: 10, label: 'Visual/Charts', hemisphere: 'right' },
      imagination:  { id: 11, label: 'Imagination', hemisphere: 'right' },
      hands:        { id: 13, label: 'Hands-on', hemisphere: 'right' },
      handwriting:  { id: 14, label: 'Handwriting', hemisphere: 'right' },
      doing:        { id: 15, label: 'Learning by Doing', hemisphere: 'right' },
      intuition:    { id: 16, label: 'Intuition', hemisphere: 'right' },
    }

    function buildChannelSummary(answers) {
      return Object.entries(CHANNELS).map(([key, ch]) => {
        const score = answers?.[ch.id] || 3
        const level = score >= 3.5 ? 'STRONG' : score < 2.5 ? 'LOW' : 'moderate'
        return `  ${ch.label} (${ch.hemisphere}): ${score.toFixed(1)} ${level}`
      }).join('\n')
    }

    const teamContext = members.map(m => {
      const scores = m.assessments?.[0]?.scores || {}
      const answers = m.assessments?.[0]?.answers || {}
      const checkin = teamCheckins[m.id]
      return `
${m.full_name}:
  Thinking: ${scores.thinking?.toFixed(1) || 'N/A'} ${scores.thinking > 3.5 ? '(big-picture)' : scores.thinking < 2.5 ? '(sequential)' : '(flexible)'}
  Motivation: ${scores.motivation?.toFixed(1) || 'N/A'} ${scores.motivation < 2.5 ? '⚠️ LOW' : scores.motivation > 3.5 ? '(strong)' : ''}
  Social: ${scores.social?.toFixed(1) || 'N/A'} ${scores.social > 3.5 ? '(collaborative)' : scores.social < 2.5 ? '(independent)' : ''}
  Environment: ${scores.environment?.toFixed(1) || 'N/A'} ${scores.environment > 3.5 ? '(needs movement+informal)' : '(structured+quiet)'}
  Weekly check-in: ${checkin?.word || 'not submitted'}
  Sensory channels:
${buildChannelSummary(answers)}`
    }).join('\n---\n')

    const systemPrompt = `You are CX3HQ AI coach for ${profile.full_name}, a manager.

YOUR OWN PROFILE:
Thinking: ${myScores.thinking?.toFixed(1) || 'unknown'} ${myScores.thinking > 3.5 ? '(big-picture thinker)' : myScores.thinking < 2.5 ? '(sequential thinker)' : '(flexible)'}
Motivation: ${myScores.motivation?.toFixed(1) || 'unknown'} ${myScores.motivation < 2.5 ? '⚠️ LOW' : myScores.motivation > 3.5 ? '(strong inner drive)' : ''}
Social: ${myScores.social?.toFixed(1) || 'unknown'}
Environment: ${myScores.environment?.toFixed(1) || 'unknown'}
Your sensory channels:
${buildChannelSummary(myAnswers)}

YOUR TEAM:
${teamContext || 'No team members have completed their assessment yet.'}

You can coach on both the manager's own performance AND how to lead each team member. Reference specific sensory channels when giving advice — e.g. if someone has low reading score, suggest verbal or visual alternatives. If motivation is below 2.5, treat as urgent.

IMPORTANT: Never use markdown, headers, bullets or bold. Write like a trusted coach. Warm, direct, conversational. Short paragraphs.`

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [...chatMessages, { role: 'user', content: userMsg }].map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content || m.text || '' }))
        })
      })
      const data = await res.json()
      setChatMessages(m => [...m, { role: 'assistant', text: data.response }])
    } catch {
      setChatMessages(m => [...m, { role: 'assistant', text: 'Sorry, I had trouble responding. Please try again.' }])
    }
    setChatLoading(false)
  }

  async function translate() {
    if (!transInput.trim() || !transTarget) return
    setTransLoading(true)
    const targetMember = members.find(m => m.id === transTarget)
    const scores = targetMember?.assessments?.[0]?.scores || {}

    const systemPrompt = `You are CX3HQ communication translator. Rewrite messages to match how ${targetMember?.full_name} best receives information.
Their profile: thinking score=${scores.thinking?.toFixed(1) || '3'} (1-2=sequential, 4-5=big-picture), motivation=${scores.motivation?.toFixed(1) || '3'}.
${scores.thinking > 3.5 ? 'They need big picture first, open questions, purpose before details, short messages.' : 'They need structured steps, specific details, written format, clear deliverables.'}
Rewrite the message, then explain in one sentence why this works for their profile.`

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [{ role: 'user', content: `Translate this message for ${targetMember?.full_name}: "${transInput}"` }]
        })
      })
      const data = await res.json()
      setTransResult(data.response)
    } catch {
      setTransResult('Sorry, translation failed. Please try again.')
    }
    setTransLoading(false)
  }

  async function saveCheckin() {
    if (!checkinWord) return
    await supabase.from('checkins').insert({ user_id: profile.id, word: checkinWord, week_number: getWeekNumber() })
    alert('Check-in saved!')
  }

  function getWeekNumber() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
    const week1 = new Date(d.getFullYear(), 0, 4)
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  }

  function getScoreColor(score) {
    if (!score) return 'var(--white-dim)'
    if (score >= 4) return 'var(--green)'
    if (score >= 2.5) return 'var(--amber)'
    return 'var(--red)'
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'myprofile', label: 'My profile' },
    { id: 'team', label: 'Team profiles' },
    { id: 'translator', label: '💬 Comm translator' },
    { id: 'coach', label: 'AI coach' },
    { id: 'help', label: '❓ Help' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      {/* Header */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(7,11,16,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)', padding: '0 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700 }}>CX3HQ</div>
          <div style={{ display: 'flex', gap: 0 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '0 1rem', height: '56px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--teal)' : 'transparent'}`, color: tab === t.id ? 'var(--teal)' : 'var(--white-dim)', fontSize: '0.82rem', fontFamily: 'var(--font-b)', transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--white-dim)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {profile.full_name}
            <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.3rem 0.75rem', color: 'var(--white-dim)', fontSize: '0.75rem', fontFamily: 'var(--font-b)', cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>
      </div>

      <div style={{ padding: '4.5rem 2rem 3rem', maxWidth: '900px', margin: '0 auto' }}>

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="fade-up">

            {/* HEADER */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <h1 style={{ fontFamily: 'var(--font-d)', fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.25rem' }}>
                {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, {profile.full_name.split(' ')[0]}
              </h1>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', fontWeight: 300 }}>{team?.name} · {members.length} {members.length === 1 ? 'member' : 'members'}</p>
            </div>

            {/* STATS ROW */}
            {!loading && members.length > 0 && (() => {
              const withAssessment = members.filter(m => m.assessments?.length > 0)
              const withCheckin = members.filter(m => teamCheckins[m.id])
              const needsAttention = members.filter(m => {
                const scores = m.assessments?.[0]?.scores || {}
                const checkin = teamCheckins[m.id]
                return (scores.motivation && scores.motivation < 2.5) || (checkin && ['Stuck','Tired'].includes(checkin.word))
              })
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  {[
                    { label: 'Team size', value: members.length, color: 'var(--teal)' },
                    { label: 'Profiles complete', value: `${withAssessment.length}/${members.length}`, color: withAssessment.length === members.length ? 'var(--green)' : 'var(--amber)' },
                    { label: 'Checked in', value: `${withCheckin.length}/${members.length}`, color: withCheckin.length === members.length ? 'var(--green)' : 'var(--amber)' },
                    { label: 'Needs attention', value: needsAttention.length, color: needsAttention.length > 0 ? 'var(--red)' : 'var(--green)' },
                  ].map(s => (
                    <div key={s.label} className="card" style={{ textAlign: 'center', padding: '1.25rem 1rem' }}>
                      <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.75rem', fontWeight: 800, color: s.color, marginBottom: '0.25rem' }}>{s.value}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--white-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* ONBOARDING BANNER */}
            {!loading && members.length === 0 && (
              <div style={{ background: 'linear-gradient(135deg,var(--navy-mid),var(--navy-light))', border: '1px solid var(--teal-border)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg,var(--teal),transparent)' }} />
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Welcome to CX3HQ 🎉</div>
                <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>You're all set. Here's how to get started.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  {[
                    { step: '1', done: true, text: 'Create your team ✓' },
                    { step: '2', done: false, text: 'Complete your own assessment — go to "My profile" tab' },
                    { step: '3', done: false, text: 'Invite your team — share the invite code below' },
                    { step: '4', done: false, text: 'Once they join — explore Team profiles, Comm translator and AI coach' },
                  ].map(s => (
                    <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: s.done ? 'var(--teal)' : 'var(--navy-light)', border: `1px solid ${s.done ? 'var(--teal)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 700, color: s.done ? 'var(--black)' : 'var(--white-dim)', flexShrink: 0, marginTop: '0.1rem' }}>{s.done ? '✓' : s.step}</div>
                      <div style={{ fontSize: '0.85rem', color: s.done ? 'var(--teal)' : 'var(--white)', lineHeight: 1.5 }}>{s.text}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setTab('help')} style={{ background: 'none', border: '1px solid var(--teal-border)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--teal)', fontSize: '0.78rem', fontFamily: 'var(--font-b)', cursor: 'pointer' }}>View full guide →</button>
              </div>
            )}

            {/* TWO COLUMN LAYOUT */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>

              {/* TEAM INVITE CODE */}
              <div className="card" style={{ borderColor: 'var(--teal-border)', background: 'var(--teal-dim)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Team invite code</div>
                <div style={{ fontFamily: 'var(--font-d)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.4rem', wordBreak: 'break-all' }}>{profile.team_id}</div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(0,212,170,0.6)' }}>Share with your team to join</div>
                <button onClick={() => { navigator.clipboard?.writeText(profile.team_id); alert('Copied!') }} style={{ marginTop: '0.75rem', background: 'none', border: '1px solid var(--teal-border)', borderRadius: '6px', padding: '0.3rem 0.75rem', color: 'var(--teal)', fontSize: '0.72rem', fontFamily: 'var(--font-b)', cursor: 'pointer' }}>Copy code</button>
              </div>

              {/* YOUR WEEKLY CHECKIN */}
              <div className="card">
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--white-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Your check-in this week</div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {['Energised', 'Stretched', 'Focused', 'Stuck', 'Tired', 'Excited'].map(w => (
                    <button key={w} onClick={() => setCheckinWord(w)} style={{ padding: '0.25rem 0.65rem', borderRadius: '100px', fontSize: '0.72rem', border: `1px solid ${checkinWord === w ? 'var(--teal)' : 'var(--border)'}`, background: checkinWord === w ? 'var(--teal-dim)' : 'var(--navy-light)', color: checkinWord === w ? 'var(--teal)' : 'var(--white-dim)', fontFamily: 'var(--font-b)', transition: 'all 0.15s' }}>{w}</button>
                  ))}
                </div>
                {checkinWord && <button className="btn-primary" onClick={saveCheckin} style={{ padding: '0.5rem', fontSize: '0.78rem' }}>Save ✓</button>}
              </div>
            </div>

            {/* ATTENTION ALERTS */}
            {!loading && members.length > 0 && (() => {
              const needsAttention = members.filter(m => {
                const checkin = teamCheckins[m.id]
                const scores = m.assessments?.[0]?.scores || {}
                return (checkin && ['Stuck','Tired'].includes(checkin.word)) || (scores.motivation && scores.motivation < 2.5)
              })
              if (!needsAttention.length) return null
              return (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>⚠️ Needs your attention</div>
                  {needsAttention.map(m => {
                    const checkin = teamCheckins[m.id]
                    const scores = m.assessments?.[0]?.scores || {}
                    return (
                      <div key={m.id} style={{ background: 'rgba(240,82,82,0.06)', border: '1px solid rgba(240,82,82,0.2)', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--white-dim)', marginTop: '0.2rem' }}>
                            {checkin && ['Stuck','Tired'].includes(checkin.word) && `Checked in as "${checkin.word}" this week`}
                            {scores.motivation && scores.motivation < 2.5 && ` · Low motivation score (${scores.motivation?.toFixed(1)})`}
                          </div>
                        </div>
                        <button onClick={() => setTab('coach')} style={{ background: 'none', border: '1px solid rgba(240,82,82,0.3)', borderRadius: '6px', padding: '0.35rem 0.875rem', color: '#F05252', fontSize: '0.72rem', fontFamily: 'var(--font-b)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Ask AI coach →</button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* TEAM LIST */}
            {loading ? (
              <div style={{ color: 'var(--white-dim)', textAlign: 'center', padding: '2rem' }}>Loading team...</div>
            ) : members.length === 0 ? null : (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--white-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Team this week</div>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {members.map(m => {
                    const scores = m.assessments?.[0]?.scores || {}
                    const hasAssessment = m.assessments?.length > 0
                    const checkin = teamCheckins[m.id]
                    const checkinColor = checkin ? (['Stuck','Tired'].includes(checkin.word) ? '#F05252' : ['Energised','Excited','Focused'].includes(checkin.word) ? 'var(--green)' : 'var(--amber)') : null
                    return (
                      <div key={m.id} className="card" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--navy-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--teal)', flexShrink: 0 }}>
                            {m.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.full_name}</div>
                            {hasAssessment && (
                              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                                {['thinking', 'motivation', 'social'].map(dim => (
                                  <div key={dim} style={{ fontSize: '0.68rem', color: 'var(--white-faint)' }}>
                                    {dim}: <span style={{ color: scores[dim] < 2.5 ? 'var(--red)' : scores[dim] > 3.5 ? 'var(--green)' : 'var(--amber)', fontWeight: 600 }}>{scores[dim]?.toFixed(1)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {checkin ? (
                              <div style={{ padding: '0.2rem 0.65rem', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 600, background: `${checkinColor}15`, color: checkinColor, border: `1px solid ${checkinColor}30` }}>
                                {checkin.word}
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.68rem', color: 'var(--white-faint)' }}>No check-in</div>
                            )}
                            {!hasAssessment && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--amber)', background: 'rgba(245,158,11,0.1)', padding: '0.2rem 0.65rem', borderRadius: '100px', border: '1px solid rgba(245,158,11,0.25)' }}>Pending</div>
                            )}
                          </div>
                        </div>
                        {hasAssessment && scores.motivation < 2.5 && (
                          <div style={{ marginTop: '0.75rem', background: 'rgba(240,82,82,0.06)', border: '1px solid rgba(240,82,82,0.15)', borderRadius: '8px', padding: '0.5rem 0.875rem', fontSize: '0.75rem', color: 'var(--red)' }}>
                            Low motivation signal — consider a 1:1 this week
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {/* MY PROFILE */}
        {tab === 'myprofile' && (
          <div className="fade-up">
            <div style={{ background: 'linear-gradient(135deg,var(--navy-mid),var(--navy-light))', border: '1px solid var(--teal-border)', borderRadius: '16px', padding: '2rem', marginBottom: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg,var(--teal),transparent)' }} />
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Your performance profile</div>
              <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>{profile.full_name?.split(' ')[0]}'s natural strengths</div>
              <div style={{ color: 'var(--white-dim)', fontSize: '0.85rem', fontWeight: 300 }}>These are your biological working strengths — permanent and unique to you. Use them to lead yourself and your team better every day.</div>
              {!myAssessment && (
                <div style={{ color: 'var(--amber)', fontSize: '0.85rem', marginTop: '0.75rem' }}>⚠️ You haven't completed your assessment yet.</div>
              )}
            </div>
            {myAssessment && (() => {
              const s = myAssessment.scores || {}
              return (
                <div>
                  {/* BIOLOGICAL DIMENSIONS — AXIS */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Biological working style — permanent & unique to you</div>
                    <div style={{ marginBottom: '0.5rem', padding: '0.75rem', background: 'rgba(0,212,170,0.06)', borderRadius: '8px', border: '1px solid var(--teal-border)', fontSize: '0.72rem', color: 'var(--teal)', lineHeight: 1.6 }}>
                      ℹ️ These dimensions are shown as a spectrum — neither end is better or worse. They describe how you naturally work, not how good you are as a leader.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                      {[
                        { dim: 'thinking', label: 'Thinking & Processing', leftLabel: 'Sequential', rightLabel: 'Simultaneous', leftDesc: 'Step-by-step, detail-first, analytical precision', rightDesc: 'Big-picture, pattern recognition, context-first', score: s.thinking,
                          strengthLabel: s.thinking < 2.5 ? 'Sequential analyst — your strength is precision, structure and analytical detail' : s.thinking > 3.5 ? 'Big-picture thinker — your strength is vision, patterns and strategic context' : 'Flexible thinker — you bridge detail and overview',
                          tips: s.thinking > 3.5 ? ['Always start briefings with the why and strategic context — before any details', 'Your pattern recognition is a leadership superpower — use it proactively', 'Delegate detailed execution to sequential thinkers on your team'] : s.thinking < 2.5 ? ['Create written agendas and structured plans before complex discussions', 'Ask for written summaries after meetings — it helps you process and retain', 'When leading big-picture thinkers, give context first — then details'] : ['You bridge big-picture and detail thinkers — use this in team meetings', 'Adapt your communication style deliberately based on who you are talking to']
                        },
                        { dim: 'sensory', label: 'Sensory Channels', leftLabel: 'Focused', rightLabel: 'Multi-channel', leftDesc: 'One or two dominant channels — deep processing', rightDesc: 'Multiple channels active simultaneously', score: s.sensory,
                          strengthLabel: s.sensory < 2.5 ? 'Focused channel learner — you go deep in your strongest channel' : s.sensory > 3.5 ? 'Multi-channel learner — you absorb through many formats simultaneously' : 'Selective learner — a few strong channels work well',
                          tips: s.sensory > 3.5 ? ['Use multiple formats in team meetings — verbal + visual + written', 'In high-load situations, reduce to your strongest channel to conserve energy', 'Your multi-channel strength helps you connect with team members who learn differently'] : ['Identify your top channel and request information in that format', 'In team meetings, ask for both verbal AND written summaries', 'Reduce weaker channels in demanding situations — it saves cognitive energy']
                        },
                        { dim: 'social', label: 'Social Working Style', leftLabel: 'Independent', rightLabel: 'Collaborative', leftDesc: 'Best thinking happens alone — autonomy drives performance', rightDesc: 'Best thinking happens with others — collaboration energises', score: s.social,
                          strengthLabel: s.social < 2.5 ? 'Independent leader — you produce your best thinking with autonomy and solo time' : s.social > 3.5 ? 'Collaborative leader — you lead and think best when connected with others' : 'Flexible collaborator — you adapt between solo and team work',
                          tips: s.social > 3.5 ? ['Build regular team touchpoints — they energise your leadership', 'Use a thinking partner for complex strategic decisions', 'Remember: some team members need solo time to do their best work'] : s.social < 2.5 ? ['Protect solo strategic thinking time in your calendar — this is where your best leadership happens', 'Delegate team facilitation when possible — it costs you energy', 'One-on-one conversations are more effective for you than group discussions'] : ['Match your working mode to the task — solo for strategy, collaborative for alignment']
                        },
                        { dim: 'environment', label: 'Environment & Performance Mode', leftLabel: 'Structured & quiet', rightLabel: 'Movement & informal', leftDesc: 'Analytical mode — quiet, still, formal settings activate best performance', rightDesc: 'Creative mode — movement, background sounds, informal settings activate best performance', score: s.environment,
                          strengthLabel: s.environment < 2.5 ? 'Analytical performance mode — quiet structured environments activate your best leadership' : s.environment > 3.5 ? 'Creative performance mode — movement and informal environments activate your best leadership' : 'Adaptable — you perform well across different environments',
                          tips: s.environment > 3.5 ? ['Take walking meetings for complex strategic conversations', 'Work from informal spaces when you need creative thinking', 'Avoid back-to-back formal meetings — it locks you out of your best performance mode'] : s.environment < 2.5 ? ['Block quiet uninterrupted time for your most important leadership work', 'Prepare for demanding conversations in a quiet space first', 'Organise your space and agenda before high-stakes meetings — it activates your best mode'] : ['Vary your environment based on the type of work — strategy in quiet, collaboration in open']
                        }
                      ].map(({ dim, label, leftLabel, rightLabel, leftDesc, rightDesc, score, strengthLabel, tips }) => {
                        const position = ((score - 1) / 4) * 100
                        return (
                          <div key={dim} className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>{label}</div>
                            <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>{strengthLabel}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--white-dim)', marginBottom: '0.4rem' }}>
                              <span style={{ fontWeight: 600, color: position < 40 ? 'var(--teal)' : 'var(--white-dim)' }}>{leftLabel}</span>
                              <span style={{ fontWeight: 600, color: position > 60 ? 'var(--teal)' : 'var(--white-dim)' }}>{rightLabel}</span>
                            </div>
                            <div style={{ position: 'relative', height: '6px', background: 'var(--navy-light)', borderRadius: '3px', border: '1px solid var(--border)', marginBottom: '0.4rem' }}>
                              <div style={{ position: 'absolute', left: `calc(${position}% - 8px)`, top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--teal)', border: '2px solid var(--black)', boxShadow: '0 0 8px rgba(0,212,170,0.4)' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--white-faint)', fontStyle: 'italic', marginBottom: '1rem' }}>
                              <span style={{ maxWidth: '45%' }}>{leftDesc}</span>
                              <span style={{ maxWidth: '45%', textAlign: 'right' }}>{rightDesc}</span>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>How to use this as a leader</div>
                              {tips.map((tip, i) => (
                                <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--white-dim)', lineHeight: 1.5 }}>
                                  <span style={{ color: 'var(--teal)', flexShrink: 0 }}>→</span>
                                  <span>{tip}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* LEARNED DIMENSIONS */}
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--white-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Current state — reflects how you feel right now</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                      {[
                        { dim: 'motivation', label: 'Inner Motivation', score: s.motivation,
                          desc: s.motivation > 3.5 ? 'Strong inner drive — you push yourself beyond expectations because it matters to you personally.' : s.motivation < 2.5 ? '⚠️ Your inner motivation is currently low. This is a current state — not permanent. Consider what may be misaligned with your natural strengths.' : 'Moderate inner drive — there may be room to reconnect with what genuinely excites you.',
                          color: s.motivation > 3.5 ? 'var(--green)' : s.motivation < 2.5 ? 'var(--red)' : 'var(--amber)'
                        },
                        { dim: 'structure', label: 'Structure & Adaptability', score: s.structure,
                          desc: s.structure > 3.5 ? 'Highly adaptable — you handle change and ambiguity well. You work best when you set your own direction.' : s.structure < 2.5 ? 'You perform best with clear goals, structured processes and regular feedback.' : 'Moderately structured — clear goals but flexibility in how you get there.',
                          color: 'var(--teal)'
                        }
                      ].map(({ dim, label, score, desc, color }) => (
                        <div key={dim} className="card">
                          <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>{label}</div>
                          <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.4rem' }}>
                            <div style={{ height: '100%', background: color, width: `${(score/5)*100}%`, borderRadius: '3px' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--white-dim)', marginBottom: '0.75rem' }}>
                            <span>Low</span>
                            <span style={{ color, fontWeight: 700 }}>{score?.toFixed(1)} / 5</span>
                            <span>High</span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--white-dim)', lineHeight: 1.6, fontWeight: 300 }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* USER MANUAL CARD */}
            {myAssessment && (() => {
              const s = myAssessment.scores || {}
              return (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>My user manual — share with your team</div>
                  <div style={{ background: 'linear-gradient(135deg,var(--navy-mid),var(--navy-light))', border: '1px solid var(--teal-border)', borderRadius: '16px', padding: '2rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg,var(--teal),transparent)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--navy-light)', border: '1px solid var(--teal-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-d)', fontSize: '1rem', fontWeight: 700, color: 'var(--teal)' }}>
                        {profile.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.1rem', fontWeight: 700 }}>{profile.full_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--teal)' }}>CX3HQ Performance Profile · Manager</div>
                      </div>
                    </div>
                    {[
                      { key: '🧠 Give me:', val: s.thinking > 3.5 ? 'The big picture and purpose first — always. I cannot engage properly until I understand the why.' : 'Clear steps, structure and written instructions. I need to know exactly what is expected.' },
                      { key: '👂 Best format:', val: s.sensory > 3 ? 'Verbal discussions and hands-on involvement work best for me.' : 'Written communication — documents, messages, structured information.' },
                      { key: '🔑 I need:', val: s.social > 3.5 ? 'Collaboration and team input. I perform better with others.' : 'Autonomy and space to work independently. Trust me with the outcome.' },
                      { key: '🔋 Drains me:', val: s.thinking > 3.5 ? 'Too many details before context. Long emails without purpose.' : 'Vague instructions. Sudden changes without explanation.' },
                      { key: '⚡ Best from me when:', val: s.motivation > 3 ? 'I believe in what I am doing and have ownership of the outcome.' : 'I have clear goals, regular check-ins and visible progress.' },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.65rem', fontSize: '0.82rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--white)', minWidth: '140px', flexShrink: 0 }}>{row.key}</span>
                        <span style={{ color: 'var(--white-dim)', lineHeight: 1.5 }}>{row.val}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--white-faint)', fontStyle: 'italic' }}>
                      Generated by CX3HQ · Based on biological assessment · Not a personality type — this is how I naturally work.
                    </div>
                    <button onClick={() => { navigator.clipboard?.writeText(window.location.href); alert('Profile link copied!') }} className="btn-primary" style={{ marginTop: '1.25rem', maxWidth: '180px' }}>
                      Share this card →
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* TEAM PROFILES */}
        {tab === 'team' && (
          <div className="fade-up">
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Team profiles</h2>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', fontWeight: 300 }}>Biological working styles — permanent and unique to each person. Use this to lead each person at their best.</p>
            </div>

            {members.filter(m => m.assessments?.length > 0).map(m => {
              const scores = m.assessments?.[0]?.scores || {}
              const checkin = teamCheckins[m.id]

              // MISMATCH DETECTION
              const mismatches = []
              if (scores.motivation < 2.5) {
                mismatches.push({
                  level: 'red',
                  title: 'Inner motivation critically low — burnout risk',
                  body: `${m.full_name?.split(' ')[0]}'s inner drive is at ${(scores.motivation * 20).toFixed(0)}% and showing motivational fatigue signals. This is a current state, not a biological trait — their biological profile may be strong but something has created a mismatch between their natural needs and their current environment. Without a direct conversation, the risk of losing them grows significantly.`,
                  action: 'Have a private 1:1 this week. Don\'t analyse — just listen. Ask: "What has changed?" and "What one thing would reconnect you to your work?"'
                })
              }
              if (scores.sensory < 2.5 && scores.thinking > 3.5) {
                mismatches.push({
                  level: 'amber',
                  title: 'Thinking-channel mismatch detected',
                  body: `${m.full_name?.split(' ')[0]} is a big-picture thinker but has limited sensory channels — they need information delivered in one clear format that works for them. Receiving information in too many formats simultaneously creates overload.`,
                  action: 'Find their strongest channel and use it consistently. Ask them: "What format helps you think best?"'
                })
              }
              if (scores.social < 2 && scores.environment > 3.5) {
                mismatches.push({
                  level: 'amber',
                  title: 'Environment-social mismatch',
                  body: `${m.full_name?.split(' ')[0]} prefers working independently but needs movement and informal environment. If they are in back-to-back meetings in formal settings, this is draining their biological energy daily.`,
                  action: 'Protect at least 2 hours of solo uninterrupted work time per day. Allow them to work from informal spaces.'
                })
              }
              if (scores.structure < 2 && scores.social > 3.5) {
                mismatches.push({
                  level: 'amber',
                  title: 'Needs more structure despite team orientation',
                  body: `${m.full_name?.split(' ')[0]} performs best in teams but needs clear structure and regular feedback to feel confident. Without this, even great team collaboration feels uncertain for them.`,
                  action: 'Give clear goals before team projects. Check in briefly after team meetings to confirm direction.'
                })
              }
              if (checkin && ['Stuck', 'Tired'].includes(checkin.word) && scores.motivation > 3) {
                mismatches.push({
                  level: 'amber',
                  title: `Checked in as "${checkin.word}" despite strong biological drive`,
                  body: `${m.full_name?.split(' ')[0]}'s biological motivation profile is strong — they have genuine inner drive. But this week they feel ${checkin.word.toLowerCase()}. This is a situational signal — something specific this week is working against their natural strengths.`,
                  action: 'A short conversation today: "What\'s making it feel heavy this week?" — not a performance conversation, just genuine interest.'
                })
              }

              // COACHING TASKS
              const coachingTasks = []
              if (scores.thinking > 3.5) {
                coachingTasks.push({
                  task: 'Context-first briefing',
                  desc: `Always start your briefings to ${m.full_name?.split(' ')[0]} with the why and the strategic goal — before any details. This activates their big-picture processing and makes them significantly more effective.`,
                  duration: 'Every time you brief them'
                })
              }
              if (scores.thinking < 2.5) {
                coachingTasks.push({
                  task: 'Written step-by-step instructions',
                  desc: `Send ${m.full_name?.split(' ')[0]} written instructions with clear numbered steps for any complex task. Their sequential processing means written structure dramatically improves their performance.`,
                  duration: 'For every new project'
                })
              }
              if (scores.social > 3.5) {
                coachingTasks.push({
                  task: 'Assign a thinking partner',
                  desc: `${m.full_name?.split(' ')[0]} performs significantly better when they have a peer to think through problems with. Assign them a thinking partner for the current project — or pair them with someone whose profile complements theirs.`,
                  duration: 'This week'
                })
              }
              if (scores.social < 2) {
                coachingTasks.push({
                  task: 'Protect solo deep work time',
                  desc: `Block 2+ hours of uninterrupted solo time for ${m.full_name?.split(' ')[0]} each day. This is where their best work happens. Reducing meeting load by even 30% will noticeably improve their output quality.`,
                  duration: 'This week — make it recurring'
                })
              }
              if (scores.motivation < 2.5) {
                coachingTasks.push({
                  task: 'Mission reconnection conversation',
                  desc: `Ask ${m.full_name?.split(' ')[0]} to spend 20 minutes writing or drawing what originally excited them about this work — what has changed, and what one thing would make their work feel meaningful again. Bring it to your next 1:1 and ask them to walk you through it. Do not analyse. Just listen.`,
                  duration: 'Before end of this week'
                })
              }
              if (scores.environment > 3.5) {
                coachingTasks.push({
                  task: 'Movement and informal environment',
                  desc: `${m.full_name?.split(' ')[0]} concentrates better with background sounds and movement. If they are in a silent formal office all day, this is draining their biological energy. Allow walking meetings, informal work spaces or background music.`,
                  duration: 'Ongoing'
                })
              }

              // HEADLINE
              const headline = (() => {
                if (scores.motivation < 2.5) return `⚠️ Urgent attention needed — motivation critically low`
                if (scores.thinking > 3.5 && scores.social > 3.5) return `Big-picture thinker · Team-oriented · Strong collaborative`
                if (scores.thinking > 3.5 && scores.social < 2) return `Big-picture thinker · Independent · Needs autonomy`
                if (scores.thinking < 2.5 && scores.social > 3.5) return `Sequential analyst · Team player · Detail + collaboration`
                if (scores.thinking < 2.5 && scores.social < 2) return `Sequential analyst · Independent worker · High precision`
                if (scores.motivation > 4) return `Strong inner drive · Self-directed · High performer`
                return `Flexible working style · Adaptable`
              })()

              return (
                <div key={m.id} style={{ marginBottom: '1.5rem', background: 'var(--navy-mid)', border: `1px solid ${mismatches.some(x => x.level === 'red') ? 'rgba(240,82,82,0.3)' : 'var(--border)'}`, borderRadius: '16px', overflow: 'hidden' }}>

                  {/* HEADER */}
                  <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--navy-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal)', flexShrink: 0 }}>
                        {m.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '1rem' }}>{m.full_name}</div>
                          {checkin && (
                            <div style={{ padding: '0.15rem 0.65rem', borderRadius: '100px', fontSize: '0.68rem', fontWeight: 600, background: ['Stuck','Tired'].includes(checkin.word) ? 'rgba(240,82,82,0.12)' : ['Energised','Excited','Focused'].includes(checkin.word) ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: ['Stuck','Tired'].includes(checkin.word) ? '#F05252' : ['Energised','Excited','Focused'].includes(checkin.word) ? 'var(--green)' : 'var(--amber)', border: `1px solid ${['Stuck','Tired'].includes(checkin.word) ? 'rgba(240,82,82,0.25)' : ['Energised','Excited','Focused'].includes(checkin.word) ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                              {checkin.word} this week
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--white-dim)', marginTop: '0.25rem' }}>{headline}</div>
                      </div>
                    </div>
                  </div>

                  {/* SCORES — AXIS FOR BIOLOGICAL, SCALE FOR LEARNED */}
                  <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Biological working style</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                      {[
                        { dim: 'thinking', leftLabel: 'Sequential', rightLabel: 'Simultaneous', score: scores.thinking },
                        { dim: 'sensory', leftLabel: 'Focused', rightLabel: 'Multi-channel', score: scores.sensory },
                        { dim: 'social', leftLabel: 'Independent', rightLabel: 'Collaborative', score: scores.social },
                        { dim: 'environment', leftLabel: 'Structured', rightLabel: 'Movement', score: scores.environment },
                      ].map(({ dim, leftLabel, rightLabel, score }) => {
                        const position = ((score - 1) / 4) * 100
                        return (
                          <div key={dim}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--white-faint)', marginBottom: '0.2rem', textTransform: 'capitalize' }}>
                              <span style={{ color: position < 40 ? 'var(--teal)' : 'var(--white-faint)', fontWeight: position < 40 ? 600 : 400 }}>{leftLabel}</span>
                              <span style={{ color: 'var(--white-faint)', fontSize: '0.58rem' }}>{dim}</span>
                              <span style={{ color: position > 60 ? 'var(--teal)' : 'var(--white-faint)', fontWeight: position > 60 ? 600 : 400 }}>{rightLabel}</span>
                            </div>
                            <div style={{ position: 'relative', height: '4px', background: 'var(--navy-light)', borderRadius: '2px', border: '1px solid var(--border)' }}>
                              <div style={{ position: 'absolute', left: `calc(${position}% - 6px)`, top: '50%', transform: 'translateY(-50%)', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--teal)', border: '2px solid var(--black)', boxShadow: '0 0 6px rgba(0,212,170,0.4)' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--white-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Current state</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                      {[
                        { dim: 'motivation', label: 'Motivation', score: scores.motivation },
                        { dim: 'structure', label: 'Structure', score: scores.structure },
                      ].map(({ dim, label, score }) => (
                        <div key={dim} style={{ background: 'var(--navy-light)', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--white-faint)', marginBottom: '0.2rem' }}>{label}</div>
                          <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.2rem' }}>
                            <div style={{ height: '100%', background: getScoreColor(score), width: `${(score/5)*100}%`, borderRadius: '2px' }} />
                          </div>
                          <div style={{ fontSize: '0.68rem', color: getScoreColor(score), fontWeight: 700 }}>{score?.toFixed(1)}</div>
                        </div>
                      ))}
                    </div>

                    {/* SENSORY CHANNELS */}
                    {(() => {
                      const answers = m.assessments?.[0]?.answers || {}
                      const CHANNELS = [
                        { id: 7,  label: 'Listening', icon: '👂', hemisphere: 'left', importantIfLow: true },
                        { id: 8,  label: 'Speaking', icon: '🗣', hemisphere: 'left', importantIfLow: false },
                        { id: 9,  label: 'Inner Speech', icon: '💭', hemisphere: 'left', importantIfLow: false },
                        { id: 12, label: 'Reading', icon: '📖', hemisphere: 'left', importantIfLow: true },
                        { id: 10, label: 'Visual/Charts', icon: '👁', hemisphere: 'right', importantIfLow: true },
                        { id: 11, label: 'Imagination', icon: '🎨', hemisphere: 'right', importantIfLow: false },
                        { id: 13, label: 'Hands-on', icon: '✋', hemisphere: 'right', importantIfLow: false },
                        { id: 14, label: 'Handwriting', icon: '✍️', hemisphere: 'right', importantIfLow: false },
                        { id: 15, label: 'Learning by Doing', icon: '⚡', hemisphere: 'right', importantIfLow: false },
                        { id: 16, label: 'Intuition', icon: '🔮', hemisphere: 'right', importantIfLow: false },
                      ]
                      const withScores = CHANNELS.map(ch => ({ ...ch, score: answers[ch.id] || 3 }))
                      const strong = withScores.filter(c => c.score >= 3.5).sort((a,b) => b.score - a.score)
                      const importantLow = withScores.filter(c => c.score < 2.5 && c.importantIfLow)
                      const leftStrong = strong.filter(c => c.hemisphere === 'left')
                      const rightStrong = strong.filter(c => c.hemisphere === 'right')

                      if (strong.length === 0) return null

                      return (
                        <div>
                          <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Sensory channels</div>

                          {leftStrong.length > 0 && (
                            <div style={{ marginBottom: '0.4rem' }}>
                              <div style={{ fontSize: '0.58rem', color: 'var(--white-faint)', marginBottom: '0.25rem' }}>Left hemisphere</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {leftStrong.map(ch => (
                                  <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(0,212,170,0.08)', border: '1px solid var(--teal-border)', borderRadius: '6px', padding: '0.25rem 0.6rem' }}>
                                    <span style={{ fontSize: '0.75rem' }}>{ch.icon}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--teal)', fontWeight: 600 }}>{ch.label}</span>
                                    <span style={{ fontSize: '0.6rem', color: 'var(--white-faint)' }}>{ch.score.toFixed(1)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {rightStrong.length > 0 && (
                            <div style={{ marginBottom: '0.5rem' }}>
                              <div style={{ fontSize: '0.58rem', color: 'var(--white-faint)', marginBottom: '0.25rem' }}>Right hemisphere</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {rightStrong.map(ch => (
                                  <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(0,168,255,0.08)', border: '1px solid rgba(0,168,255,0.2)', borderRadius: '6px', padding: '0.25rem 0.6rem' }}>
                                    <span style={{ fontSize: '0.75rem' }}>{ch.icon}</span>
                                    <span style={{ fontSize: '0.65rem', color: '#00A8FF', fontWeight: 600 }}>{ch.label}</span>
                                    <span style={{ fontSize: '0.6rem', color: 'var(--white-faint)' }}>{ch.score.toFixed(1)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {importantLow.length > 0 && (
                            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                              <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--amber)', marginBottom: '0.25rem' }}>⚠️ Important for how you communicate</div>
                              {importantLow.map(ch => (
                                <div key={ch.id} style={{ fontSize: '0.68rem', color: 'var(--white-dim)' }}>
                                  {ch.icon} {ch.label} is low —
                                  {ch.id === 7 && ' avoid verbal-only. Add written or visual.'}
                                  {ch.id === 12 && ' avoid long texts. Use verbal or visual instead.'}
                                  {ch.id === 10 && ' charts may not land. Use verbal or hands-on.'}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* MISMATCHES */}
                  {mismatches.length > 0 && (
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--white-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Signals & mismatches</div>
                      {mismatches.map((mx, i) => (
                        <div key={i} style={{ background: mx.level === 'red' ? 'rgba(240,82,82,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${mx.level === 'red' ? 'rgba(240,82,82,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: '10px', padding: '1rem', marginBottom: '0.5rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: mx.level === 'red' ? '#F05252' : 'var(--amber)', marginBottom: '0.4rem' }}>
                            {mx.level === 'red' ? '🔴' : '⚡'} {mx.title}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--white-dim)', lineHeight: 1.65, marginBottom: '0.5rem' }}>{mx.body}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--white)', fontWeight: 500 }}>→ {mx.action}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* COACHING TASKS */}
                  {coachingTasks.length > 0 && (
                    <div style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>💡 Coaching tasks — based on their profile</div>
                      {coachingTasks.map((ct, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 0', borderBottom: i < coachingTasks.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, marginTop: '0.4rem' }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.25rem' }}>{ct.task}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--white-dim)', lineHeight: 1.6, marginBottom: '0.2rem' }}>{ct.desc}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--teal)', fontWeight: 500 }}>When: {ct.duration}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* NO MISMATCHES */}
                  {mismatches.length === 0 && coachingTasks.length === 0 && (
                    <div style={{ padding: '1rem 1.5rem', fontSize: '0.82rem', color: 'var(--green)' }}>
                      ✓ Well aligned — no conflicts detected. Keep doing what you are doing.
                    </div>
                  )}

                </div>
              )
            })}

            {members.filter(m => !m.assessments?.length).length > 0 && (
              <div style={{ color: 'var(--white-dim)', fontSize: '0.82rem', padding: '1rem', background: 'var(--navy-mid)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                {members.filter(m => !m.assessments?.length).length} member(s) haven't completed their assessment yet — invite them to join.
              </div>
            )}
          </div>
        )}

        {/* COMM TRANSLATOR */}
        {tab === 'translator' && (
          <div className="fade-up">
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem' }}>Communication translator</h2>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.82rem', fontWeight: 300 }}>Write a message you want to send. The AI rewrites it for how each person naturally receives information.</p>
            </div>

            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--white-dim)', marginBottom: '0.75rem', fontWeight: 500 }}>Who are you writing to?</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {members.filter(m => m.assessments?.length > 0).map(m => (
                  <button key={m.id} onClick={() => setTransTarget(m.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.875rem', borderRadius: '100px', fontSize: '0.78rem', border: `1px solid ${transTarget === m.id ? 'var(--teal-border)' : 'var(--border)'}`, background: transTarget === m.id ? 'var(--teal-dim)' : 'var(--navy-light)', color: transTarget === m.id ? 'var(--teal)' : 'var(--white-dim)', fontFamily: 'var(--font-b)', transition: 'all 0.15s' }}>
                    {m.full_name?.split(' ')[0]}
                  </button>
                ))}
              </div>

              <textarea value={transInput} onChange={e => setTransInput(e.target.value)} placeholder="Write your message as you normally would..." style={{ width: '100%', background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.875rem', color: 'var(--white)', fontSize: '0.85rem', lineHeight: 1.6, resize: 'vertical', minHeight: '90px', outline: 'none', fontFamily: 'var(--font-b)', marginBottom: '0.75rem' }} />

              <button onClick={translate} disabled={!transInput || !transTarget || transLoading} className="btn-primary" style={{ maxWidth: '220px' }}>
                {transLoading ? 'Translating...' : 'Translate →'}
              </button>
            </div>

            {transResult && (
              <div className="card fade-up" style={{ borderColor: 'var(--teal-border)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                  ✅ Translated for {members.find(m => m.id === transTarget)?.full_name?.split(' ')[0]}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{transResult}</div>
              </div>
            )}
          </div>
        )}

        {/* AI COACH */}
        {tab === 'coach' && (
          <div className="fade-up">
            <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--teal-border)', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ background: 'var(--teal-dim)', borderBottom: '1px solid var(--border)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ fontSize: '1.2rem' }}>🤖</div>
                <div>
                  <div style={{ fontFamily: 'var(--font-d)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--teal)' }}>CX3HQ AI Coach</div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(0,212,170,0.6)' }}>Knows your full team's profiles</div>
                </div>
              </div>

              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{ background: msg.role === 'user' ? 'var(--teal-dim)' : 'var(--navy-light)', border: `1px solid ${msg.role === 'user' ? 'var(--teal-border)' : 'var(--border)'}`, borderRadius: '10px', padding: '0.875rem 1rem', fontSize: '0.83rem', lineHeight: 1.6, color: 'var(--white)', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                    {msg.text}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.875rem 1rem', fontSize: '0.83rem', color: 'var(--white-dim)' }}>
                    Thinking...
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', padding: '0 1.25rem 1.25rem' }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Ask about your team..." style={{ flex: 1, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.65rem 1rem', color: 'var(--white)', fontSize: '0.82rem', outline: 'none', fontFamily: 'var(--font-b)' }} />
                <button onClick={sendChat} disabled={!chatInput || chatLoading} style={{ background: 'var(--teal)', color: 'var(--black)', border: 'none', borderRadius: '8px', padding: '0.65rem 1.25rem', fontWeight: 600, fontSize: '0.82rem', fontFamily: 'var(--font-b)' }}>Send</button>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['Give me a team summary', 'Who needs attention this week?', 'How do I work at my best?', 'How should I prepare for a difficult conversation?', 'What coaching tasks do you suggest?'].map(s => (
                <button key={s} onClick={() => { setChatInput(s); setTimeout(sendChat, 100) }} style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', color: 'var(--white-dim)', padding: '0.35rem 0.75rem', borderRadius: '100px', fontSize: '0.72rem', fontFamily: 'var(--font-b)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* HELP */}
        {tab === 'help' && (
          <div className="fade-up">
            <div style={{ marginBottom: '1.5rem' }}>
              <h1 style={{ fontFamily: 'var(--font-d)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Manager guide</h1>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', fontWeight: 300 }}>Everything you need to get the most out of CX3HQ</p>
            </div>

            {/* GET STARTED */}
            <div className="card" style={{ marginBottom: '1.25rem', borderColor: 'var(--teal-border)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>Step-by-step — start here</div>
              {[
                { step: '01', title: 'Complete your own assessment', desc: 'Go to "My profile" tab and complete the 15-minute assessment. This maps your own thinking style, communication channels and capacity. You need to understand yourself before you can understand your team.' },
                { step: '02', title: 'Invite your team', desc: 'Share your team invite code (on the Overview tab) with each team member. They create an account, select "I am a team member", enter the code, and complete their assessment. Takes 15 minutes.' },
                { step: '03', title: 'Explore Team profiles', desc: 'Once your team has completed their assessments, go to "Team profiles". You will see each person\'s scores across all dimensions. Look especially at the Motivation score — below 2.5 needs attention.' },
                { step: '04', title: 'Use the Comm translator daily', desc: 'Every time you write an important message, use the Comm translator first. Select the person, write your message, and get a version tailored to how they best receive information. This alone removes most miscommunication.' },
                { step: '05', title: 'Ask the AI coach', desc: 'The AI coach knows your full team\'s profiles. Ask it anything — how to prepare for a difficult conversation, who might need support this week, how to improve collaboration. Try: "Give me a team summary".' },
                { step: '06', title: 'Weekly check-in rhythm', desc: 'Every Monday, do your own check-in (one word on the Overview tab). Encourage your team to do the same. Over time, this gives you a real-time pulse on how the team is doing — before issues become visible.' },
              ].map(s => (
                <div key={s.step} style={{ display: 'flex', gap: '1rem', padding: '1rem 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--teal)', opacity: 0.3, width: '2.5rem', flexShrink: 0 }}>{s.step}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, marginBottom: '0.35rem' }}>{s.title}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--white-dim)', lineHeight: 1.65, fontWeight: 300 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* FAQ */}
            <div className="card" style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>Frequently asked questions</div>
              {[
                { q: 'What does CX3HQ actually measure?', a: 'CX3HQ measures three biological dimensions: Cognition (how you think and process information), Communication (how you best receive and share information), and Capacity (how you use energy and perform). These are not personality types — they are stable, biological working styles.' },
                { q: 'How is this different from DISC or Myers-Briggs?', a: 'DISC and Myers-Briggs measure personality traits. CX3HQ measures how people biologically process information and work. The key difference: biological working styles are stable and actionable. They tell you not just who someone is, but exactly how to work with them — which communication format, which environment, which approach.' },
                { q: 'What should I do if someone has a low motivation score?', a: 'A motivation score below 2.5 is a signal — not a judgment. It means the person\'s inner drive is currently low. The best first step is a quiet 1:1 conversation: ask how they are doing, what they enjoy about their work, what feels heavy. Do not ignore it — motivation drops silently before they become visible.' },
                { q: 'How often should my team use the platform?', a: 'Minimum: weekly check-in (one word, 3 seconds). Recommended: manager uses Comm translator for every important message, checks AI coach weekly. Team members visit their profile and coach when they need guidance. The platform is designed to be lightweight — not another tool that takes time.' },
                { q: 'Can team members see each other\'s profiles?', a: 'Team members see their own profile. Managers see the full team dashboard. This protects individual privacy while giving you the insight you need to lead well.' },
                { q: 'What if a team member doesn\'t want to complete the assessment?', a: 'Participation works best when people understand what\'s in it for them — a personal profile, AI coaching, and better collaboration. Share their employee view with them first. Most people find it genuinely useful once they see it.' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '1rem 0', borderBottom: i < 5 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.88rem' }}>❓ {item.q}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--white-dim)', lineHeight: 1.65, fontWeight: 300 }}>{item.a}</div>
                </div>
              ))}
            </div>

            {/* CONTACT */}
            <div className="card" style={{ background: 'var(--teal-dim)', borderColor: 'var(--teal-border)', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, marginBottom: '0.4rem' }}>Have a question not covered here?</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--white-dim)', fontWeight: 300 }}>We respond within 48 hours.</div>
              <a href="mailto:eerika@cx3hq.com" style={{ display: 'inline-block', marginTop: '0.75rem', background: 'var(--teal)', color: 'var(--black)', padding: '0.5rem 1.25rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-b)' }}>Contact us →</a>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

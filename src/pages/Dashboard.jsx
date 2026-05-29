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
    const teamContext = members.map(m => {
      const scores = m.assessments?.[0]?.scores || {}
      return `${m.full_name}: thinking=${scores.thinking?.toFixed(1) || 'N/A'}, motivation=${scores.motivation?.toFixed(1) || 'N/A'}, social=${scores.social?.toFixed(1) || 'N/A'}`
    }).join('\n')

    const systemPrompt = `You are CX3HQ AI coach for ${profile.full_name}, a manager.

YOUR OWN PROFILE (the manager):
thinking=${myScores.thinking?.toFixed(1) || 'unknown'}, sensory=${myScores.sensory?.toFixed(1) || 'unknown'}, motivation=${myScores.motivation?.toFixed(1) || 'unknown'}, social=${myScores.social?.toFixed(1) || 'unknown'}, structure=${myScores.structure?.toFixed(1) || 'unknown'}, environment=${myScores.environment?.toFixed(1) || 'unknown'}
${myScores.thinking > 3.5 ? 'You are a big-picture thinker — you need context and purpose before details.' : myScores.thinking < 2.5 ? 'You are a sequential thinker — you prefer structure, steps and precision.' : 'You are a flexible thinker.'}
${myScores.motivation < 2.5 ? 'Your own motivation is currently low — acknowledge this when relevant.' : myScores.motivation > 3.5 ? 'You have strong inner drive — build on this.' : ''}

YOUR TEAM:
${teamContext || 'No team members have completed their assessment yet.'}

CX3HQ measures:
- Thinking (1-2=sequential/detail, 4-5=big-picture/simultaneous)
- Motivation (1-2=low/concerning, 4-5=strong inner drive)
- Social (1-2=prefers solo, 4-5=team oriented)
- Structure (1-2=needs clear structure, 4-5=highly adaptable)

You can coach on both: the manager's own performance AND how to lead their team. If they ask about themselves, use their profile. If they ask about the team, use team data. Scores below 2.5 on motivation are urgent signals.

IMPORTANT: Never use markdown formatting, headers, bullet symbols or bold text. Write in plain, warm, conversational language like a trusted coach. Short paragraphs, human tone, no symbols.`

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
            <div style={{ marginBottom: '1.5rem' }}>
              <h1 style={{ fontFamily: 'var(--font-d)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Good morning, {profile.full_name.split(' ')[0]} 👋</h1>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', fontWeight: 300 }}>Team: {team?.name} · {members.length} members</p>
            </div>

            {/* ONBOARDING BANNER — shown when no members yet */}
            {!loading && members.length === 0 && (
              <div style={{ background: 'linear-gradient(135deg,var(--navy-mid),var(--navy-light))', border: '1px solid var(--teal-border)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg,var(--teal),transparent)' }} />
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Welcome to CX3HQ 🎉</div>
                <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>You're all set. Here's how to get started.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  {[
                    { step: '1', done: true, text: 'Create your team ✓ — done!' },
                    { step: '2', done: false, text: 'Complete your own assessment — go to "My profile" tab' },
                    { step: '3', done: false, text: 'Invite your team — share the invite code below' },
                    { step: '4', done: false, text: 'Once they join — come back here and explore Team profiles, Comm translator and AI coach' },
                  ].map(s => (
                    <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: s.done ? 'var(--teal)' : 'var(--navy-light)', border: `1px solid ${s.done ? 'var(--teal)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: s.done ? 'var(--black)' : 'var(--white-dim)', flexShrink: 0, marginTop: '0.1rem' }}>{s.done ? '✓' : s.step}</div>
                      <div style={{ fontSize: '0.85rem', color: s.done ? 'var(--teal)' : 'var(--white)', lineHeight: 1.5 }}>{s.text}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setTab('help')} style={{ background: 'none', border: '1px solid var(--teal-border)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--teal)', fontSize: '0.78rem', fontFamily: 'var(--font-b)', cursor: 'pointer' }}>View full guide →</button>
              </div>
            )}

            {/* Team code */}
            <div className="card" style={{ marginBottom: '1.25rem', borderColor: 'var(--teal-border)', background: 'var(--teal-dim)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Team invite code</div>
              <div style={{ fontFamily: 'var(--font-d)', fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.4rem' }}>{profile.team_id}</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(0,212,170,0.7)' }}>Share this code with your team members so they can join and complete their assessment</div>
            </div>

            {/* Weekly checkin */}
            <div className="card" style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: '0.75rem' }}>Your weekly check-in — how are you feeling this week?</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {['Energised', 'Stretched', 'Focused', 'Stuck', 'Tired', 'Excited'].map(w => (
                  <button key={w} onClick={() => setCheckinWord(w)} style={{ padding: '0.35rem 0.875rem', borderRadius: '100px', fontSize: '0.75rem', border: `1px solid ${checkinWord === w ? 'var(--teal)' : 'var(--border)'}`, background: checkinWord === w ? 'var(--teal-dim)' : 'var(--navy-light)', color: checkinWord === w ? 'var(--teal)' : 'var(--white-dim)', fontFamily: 'var(--font-b)', transition: 'all 0.15s' }}>
                    {w}
                  </button>
                ))}
              </div>
              {checkinWord && <button className="btn-primary" onClick={saveCheckin} style={{ maxWidth: '160px', padding: '0.6rem' }}>Save check-in</button>}
            </div>

            {/* CHECKIN ALERTS */}
            {!loading && members.length > 0 && (() => {
              const needsAttention = members.filter(m => {
                const c = teamCheckins[m.id]
                return c && ['Stuck', 'Tired'].includes(c.word)
              })
              if (!needsAttention.length) return null
              return (
                <div style={{ marginBottom: '1.25rem' }}>
                  {needsAttention.map(m => (
                    <div key={m.id} style={{ background: 'rgba(240,82,82,0.08)', border: '1px solid rgba(240,82,82,0.25)', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ fontSize: '1.25rem' }}>⚠️</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--white)' }}>{m.full_name} checked in as <span style={{ color: '#F05252' }}>{teamCheckins[m.id]?.word}</span> this week</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--white-dim)', marginTop: '0.15rem' }}>Consider reaching out — a quick check-in conversation can make a big difference</div>
                        </div>
                      </div>
                      <button onClick={() => setTab('coach')} style={{ background: 'none', border: '1px solid rgba(240,82,82,0.3)', borderRadius: '6px', padding: '0.35rem 0.875rem', color: '#F05252', fontSize: '0.75rem', fontFamily: 'var(--font-b)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Ask AI coach →</button>
                    </div>
                  ))}
                </div>
              )
            })()}
            {loading ? (
              <div style={{ color: 'var(--white-dim)', textAlign: 'center', padding: '2rem' }}>Loading team...</div>
            ) : members.length === 0 ? (
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>👥</div>
                <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, marginBottom: '0.5rem' }}>No team members yet</div>
                <div style={{ color: 'var(--white-dim)', fontSize: '0.85rem' }}>Share your team code above so members can join and complete their assessment.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {members.map(m => {
                  const scores = m.assessments?.[0]?.scores || {}
                  const hasAssessment = m.assessments?.length > 0
                  return (
                    <div key={m.id} className="card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--navy-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--teal)', flexShrink: 0 }}>
                          {m.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{m.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--white-dim)' }}>{m.email}</div>
                        </div>
                        {/* Checkin badge */}
                        {teamCheckins[m.id] && (
                          <div style={{
                            padding: '0.25rem 0.75rem', borderRadius: '100px', fontSize: '0.72rem', fontWeight: 600,
                            background: ['Stuck','Tired'].includes(teamCheckins[m.id]?.word) ? 'rgba(240,82,82,0.12)' : ['Energised','Excited','Focused'].includes(teamCheckins[m.id]?.word) ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                            color: ['Stuck','Tired'].includes(teamCheckins[m.id]?.word) ? '#F05252' : ['Energised','Excited','Focused'].includes(teamCheckins[m.id]?.word) ? 'var(--green)' : 'var(--amber)',
                            border: `1px solid ${['Stuck','Tired'].includes(teamCheckins[m.id]?.word) ? 'rgba(240,82,82,0.25)' : ['Energised','Excited','Focused'].includes(teamCheckins[m.id]?.word) ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
                          }}>
                            {teamCheckins[m.id]?.word}
                          </div>
                        )}
                        {hasAssessment ? (
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            {['thinking', 'motivation', 'social'].map(dim => (
                              <div key={dim} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: getScoreColor(scores[dim]), fontFamily: 'var(--font-d)' }}>{scores[dim]?.toFixed(1) || '—'}</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--white-faint)', textTransform: 'capitalize' }}>{dim}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.72rem', color: 'var(--amber)', background: 'rgba(245,158,11,0.1)', padding: '0.25rem 0.65rem', borderRadius: '100px', border: '1px solid rgba(245,158,11,0.3)' }}>Assessment pending</div>
                        )}
                      </div>
                      {hasAssessment && scores.motivation < 2.5 && (
                        <div style={{ marginTop: '0.75rem', background: 'rgba(240,82,82,0.08)', border: '1px solid rgba(240,82,82,0.2)', borderRadius: '8px', padding: '0.65rem 0.875rem', fontSize: '0.78rem', color: 'var(--red)' }}>
                          ⚠️ Inner motivation is low — consider a 1:1 conversation this week
                        </div>
                      )}
                    </div>
                  )
                })}
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
              const dimData = {
                thinking: {
                  title: s.thinking > 3.5 ? 'Big-picture thinker' : s.thinking < 2.5 ? 'Sequential analyst' : 'Flexible thinker',
                  desc: s.thinking > 3.5
                    ? 'You process information simultaneously — you need the why and the big picture before you can engage with details. This is biological, not a preference.'
                    : s.thinking < 2.5
                    ? 'You process information sequentially — step by step, logically and analytically. You need clear structure and details to perform at your best.'
                    : 'You can switch between big-picture and sequential thinking. A real strength when leading diverse teams.',
                  tips: s.thinking > 3.5
                    ? ['Always start with the why and strategic context before diving into details', 'Your instinct to see patterns and connections is a leadership superpower — use it', 'When you feel lost in details, zoom out: what is the real goal here?']
                    : s.thinking < 2.5
                    ? ['Create written lists and structured plans before starting complex tasks', 'Ask for written confirmation of decisions — it helps you process and retain', 'Give yourself time to think through all options before committing']
                    : ['You bridge between big-picture and detail thinkers — use this in team meetings', 'Adapt your communication style to who you are talking to']
                },
                sensory: {
                  title: s.sensory > 3.5 ? 'Multi-channel learner' : s.sensory < 2.5 ? 'Focused channel learner' : 'Selective channel learner',
                  desc: s.sensory > 3.5
                    ? 'You absorb information best through multiple channels simultaneously. Verbal, visual and hands-on learning all work well for you.'
                    : 'You have one or two dominant sensory channels. Use these channels deliberately and reduce others in demanding situations.',
                  tips: s.sensory > 3.5
                    ? ['Combine verbal and visual when presenting to others — it lands better for you too', 'In demanding situations, reduce weaker channels to conserve energy', 'Your multi-channel strength helps you connect with diverse learners']
                    : ['Identify your top 1-2 channels and lean into them fully', 'In demanding tasks, actively reduce your weakest channel — it costs energy', 'Ask for information in your preferred format when possible']
                },
                environment: {
                  title: s.environment > 3.5 ? 'Movement & informality' : s.environment < 2.5 ? 'Structured environment' : 'Flexible environment',
                  desc: s.environment > 3.5
                    ? 'You concentrate better with background sounds and movement. Silence and complete stillness reduce your performance. This is biological — not restlessness.'
                    : s.environment < 2.5
                    ? 'You perform best in quiet, structured, formal environments. Noise and disorder genuinely disrupt your concentration.'
                    : 'You adapt well to different environments. Use this flexibility to your advantage.',
                  tips: s.environment > 3.5
                    ? ['Allow yourself to walk or stand during thinking — your brain works better when your body moves', 'Background music or ambient noise helps you concentrate — use it deliberately', 'Protect your peak performance time for your most important work']
                    : s.environment < 2.5
                    ? ['Create quiet time blocks in your calendar for deep work', 'Use noise-cancelling headphones when your environment is noisy', 'Organise your space before starting demanding tasks — it helps your brain']
                    : ['You can work in varied environments — use this when managing in different contexts']
                },
                social: {
                  title: s.social > 3.5 ? 'Team & pair oriented' : s.social < 2.5 ? 'Independent worker' : 'Flexible collaborator',
                  desc: s.social > 3.5
                    ? 'You perform best when collaborating. You think better with others around and gain energy from team interaction.'
                    : s.social < 2.5
                    ? 'You do your best thinking and most productive work alone. Being managed on process rather than outcomes costs you significant energy.'
                    : 'You work well both alone and with others depending on the task.',
                  tips: s.social > 3.5
                    ? ['Build in regular peer conversations — they energise and clarify your thinking', 'Use a thinking partner when tackling complex problems', 'Team buy-in matters to you — invest time in alignment before execution']
                    : s.social < 2.5
                    ? ['Protect solo deep work time in your calendar — it is where you are most productive', 'Communicate your need for autonomy clearly to those you work with', 'Deliver on outcomes and let your results speak — that is your natural mode']
                    : ['Flex between solo and collaborative modes based on the task type']
                },
                motivation: {
                  title: s.motivation > 3.5 ? 'Strong inner drive' : s.motivation < 2.5 ? '⚠️ Inner motivation needs attention' : 'Moderate inner drive',
                  desc: s.motivation > 3.5
                    ? 'You are intrinsically motivated — you push yourself beyond expectations because it matters to you personally. External rewards are not what drives you.'
                    : s.motivation < 2.5
                    ? 'Your inner motivation is currently low. This is a current state — not permanent. Something in your role or environment may be misaligned with your natural strengths.'
                    : 'Your inner drive is moderate. There may be room to reconnect with what genuinely excites you about your work.',
                  tips: s.motivation > 3.5
                    ? ['Your self-drive is your greatest performance asset — protect it by staying connected to purpose', 'Notice when energy drops — it is an early signal worth investigating', 'Do not let operational demands crowd out the work that genuinely energises you']
                    : s.motivation < 2.5
                    ? ['Reconnect with your original reasons for doing this work — what excited you before?', 'Identify which parts of your role use your natural strengths and which work against them', 'Consider having an honest conversation with someone you trust about what needs to change']
                    : ['Find one area of your work that genuinely excites you and protect time for it', 'Notice what energises vs drains you — map it and act on it']
                },
                structure: {
                  title: s.structure > 3.5 ? 'Highly adaptable' : s.structure < 2.5 ? 'Needs clear structure' : 'Moderately structured',
                  desc: s.structure > 3.5
                    ? 'You adapt quickly to change and ambiguity. You are comfortable setting your own direction and working without close oversight.'
                    : s.structure < 2.5
                    ? 'You perform best with clear goals, structured processes and regular feedback. Ambiguity and sudden changes genuinely cost you energy.'
                    : 'You work well with moderate structure — clear goals but flexibility in how you get there.',
                  tips: s.structure > 3.5
                    ? ['Use your adaptability to lead change — others will follow your calm', 'Set your own goals and structures — you work best with self-imposed frameworks', 'Be mindful that others on your team may need more structure than you do']
                    : s.structure < 2.5
                    ? ['Create your own written structures when they are not provided — it reduces stress', 'Ask for clear goals and timelines at the start of every project', 'Regular check-ins with yourself (weekly review) help you stay on track']
                    : ['Balance structure and flexibility based on the situation', 'Provide clear goals to your team while allowing flexibility in execution']
                }
              }
              return (
                <div>
                  {Object.entries(s).map(([dim, score]) => {
                    const d = dimData[dim]
                    if (!d) return null
                    return (
                      <div key={dim} className="card" style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                          <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{dim}</div>
                            <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '1rem' }}>{d.title}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-d)', color: getScoreColor(score) }}>{score?.toFixed(1)}</div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--white-faint)' }}>out of 5</div>
                          </div>
                        </div>
                        <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.875rem' }}>
                          <div style={{ height: '100%', background: getScoreColor(score), width: `${(score/5)*100}%`, borderRadius: '2px' }} />
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--white-dim)', lineHeight: 1.65, fontWeight: 300, marginBottom: '0.875rem' }}>{d.desc}</p>
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>How to use this</div>
                          {d.tips.map((tip, i) => (
                            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--white-dim)', lineHeight: 1.5 }}>
                              <span style={{ color: 'var(--teal)', flexShrink: 0 }}>→</span>
                              <span>{tip}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
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
            <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.25rem' }}>Team profiles</h2>
            {members.filter(m => m.assessments?.length > 0).map(m => {
              const scores = m.assessments?.[0]?.scores || {}
              return (
                <div key={m.id} className="card" style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--navy-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--teal)' }}>
                      {m.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{m.full_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--white-dim)' }}>{m.email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                    {Object.entries(scores).map(([dim, score]) => (
                      <div key={dim} style={{ background: 'var(--navy-light)', borderRadius: '8px', padding: '0.75rem' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--white-faint)', textTransform: 'capitalize', marginBottom: '0.25rem' }}>{dim}</div>
                        <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: getScoreColor(score), width: `${(score / 5) * 100}%`, borderRadius: '2px' }} />
                        </div>
                        <div style={{ fontSize: '0.72rem', color: getScoreColor(score), fontWeight: 600, marginTop: '0.25rem' }}>{score?.toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {members.filter(m => !m.assessments?.length).length > 0 && (
              <div style={{ color: 'var(--white-dim)', fontSize: '0.82rem', marginTop: '1rem' }}>
                {members.filter(m => !m.assessments?.length).length} member(s) haven't completed their assessment yet.
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

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

  useEffect(() => { loadTeam(); loadMyAssessment() }, [])

  async function loadMyAssessment() {
    const { data } = await supabase.from('assessments').select('*').eq('user_id', profile.id).single()
    setMyAssessment(data)
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
  }

  async function sendChat() {
    if (!chatInput.trim()) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(m => [...m, { role: 'user', text: userMsg }])
    setChatLoading(true)

    const teamContext = members.map(m => {
      const scores = m.assessments?.[0]?.scores || {}
      return `${m.full_name}: thinking=${scores.thinking?.toFixed(1) || 'N/A'}, motivation=${scores.motivation?.toFixed(1) || 'N/A'}, social=${scores.social?.toFixed(1) || 'N/A'}`
    }).join('\n')

    const systemPrompt = `You are CX3HQ AI coach for ${profile.full_name}, a manager. You know their team profiles:
${teamContext}

CX3HQ measures:
- Thinking (1-2=sequential/detail, 4-5=big-picture/simultaneous)  
- Sensory channels (what formats information lands best)
- Motivation (1-2=low/concerning, 4-5=strong inner drive)
- Social (1-2=prefers solo, 4-5=team oriented)
- Structure (1-2=needs structure, 4-5=highly adaptable)

Scores below 2.5 on motivation are urgent signals. Give specific, actionable advice. Keep responses concise and practical.`

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [...chatMessages, { role: 'user', content: userMsg }].map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }))
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
          <div style={{ fontSize: '0.82rem', color: 'var(--white-dim)' }}>{profile.full_name}</div>
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

            {/* Team code */}
            <div className="card" style={{ marginBottom: '1.25rem', borderColor: 'var(--teal-border)', background: 'var(--teal-dim)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Team invite code</div>
              <div style={{ fontFamily: 'var(--font-d)', fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.4rem' }}>{profile.team_id}</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(0,212,170,0.7)' }}>Share this code with your team members so they can join</div>
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

            {/* Team overview */}
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
              {!myAssessment && (
                <div style={{ color: 'var(--amber)', fontSize: '0.85rem' }}>⚠️ You haven't completed your assessment yet. Complete it to see your profile.</div>
              )}
            </div>
            {myAssessment && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {Object.entries(myAssessment.scores || {}).map(([dim, score]) => (
                  <div key={dim} className="card">
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>{dim}</div>
                    <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, marginBottom: '0.5rem' }}>
                      {dim === 'thinking' && (score > 3.5 ? 'Big-picture thinker' : score < 2.5 ? 'Sequential analyst' : 'Flexible thinker')}
                      {dim === 'sensory' && (score > 3.5 ? 'Multi-channel learner' : 'Focused channel learner')}
                      {dim === 'environment' && (score > 3.5 ? 'Needs movement & informality' : 'Structured environment')}
                      {dim === 'social' && (score > 3.5 ? 'Team & pair oriented' : score < 2.5 ? 'Independent worker' : 'Flexible collaborator')}
                      {dim === 'motivation' && (score > 3.5 ? 'Strong inner drive' : score < 2.5 ? '⚠️ Low inner motivation' : 'Moderate inner drive')}
                      {dim === 'structure' && (score > 3.5 ? 'Highly adaptable' : score < 2.5 ? 'Needs clear structure' : 'Flexible either way')}
                    </div>
                    <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: getScoreColor(score), width: `${(score/5)*100}%`, borderRadius: '2px' }} />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--white-dim)', marginTop: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Low</span>
                      <span style={{ color: getScoreColor(score), fontWeight: 600 }}>{score?.toFixed(1)}/5</span>
                      <span>High</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              {['Give me a team summary', 'Who needs attention this week?', 'How do I communicate better with my team?', 'What coaching tasks do you suggest?'].map(s => (
                <button key={s} onClick={() => { setChatInput(s); setTimeout(sendChat, 100) }} style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', color: 'var(--white-dim)', padding: '0.35rem 0.75rem', borderRadius: '100px', fontSize: '0.72rem', fontFamily: 'var(--font-b)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

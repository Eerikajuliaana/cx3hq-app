import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Employee({ profile }) {
  const [tab, setTab] = useState('profile')
  const [assessment, setAssessment] = useState(null)
  const [teammates, setTeammates] = useState([])
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: `Hi ${profile.full_name?.split(' ')[0]}! I'm your personal AI coach. I know your full profile from your assessment. Ask me anything about how you work best, or how to improve your performance and collaboration.` }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [transInput, setTransInput] = useState('')
  const [transTarget, setTransTarget] = useState(null)
  const [transResult, setTransResult] = useState('')
  const [transLoading, setTransLoading] = useState(false)
  const [checkinWord, setCheckinWord] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: asmData } = await supabase.from('assessments').select('*').eq('user_id', profile.id).single()
    setAssessment(asmData)

    const { data: teamData } = await supabase.from('profiles').select('*, assessments(scores)').eq('team_id', profile.team_id).neq('id', profile.id)
    setTeammates(teamData || [])
  }

  async function sendChat() {
    if (!chatInput.trim()) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(m => [...m, { role: 'user', text: userMsg }])
    setChatLoading(true)

    const scores = assessment?.scores || {}
    const systemPrompt = `You are CX3HQ personal AI coach for ${profile.full_name}.
Their assessment scores: thinking=${scores.thinking?.toFixed(1) || '3'}, sensory avg=${scores.sensory?.toFixed(1) || '3'}, motivation=${scores.motivation?.toFixed(1) || '3'}, social=${scores.social?.toFixed(1) || '3'}, structure=${scores.structure?.toFixed(1) || '3'}.
${scores.thinking > 3.5 ? 'Big-picture thinker — needs context first, hates being buried in details.' : 'Sequential thinker — likes structure, steps and precision.'}
${scores.motivation < 2.5 ? 'Inner motivation is currently low — be supportive and help reconnect with purpose.' : 'Good inner drive — reinforce and build on it.'}
Give personal, specific advice based on their unique profile. Be warm, practical and concise.
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
    const target = teammates.find(m => m.id === transTarget)
    const targetScores = target?.assessments?.[0]?.scores || {}

    const systemPrompt = `You are CX3HQ communication translator. Rewrite messages to work better for ${target?.full_name}.
Their profile: thinking=${targetScores.thinking?.toFixed(1) || '3'}.
${targetScores.thinking > 3.5 ? 'They need big picture first, short messages, purpose before details.' : 'They need structure, steps, specific details, written format.'}
Rewrite the message, then briefly explain why this works for them.`

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [{ role: 'user', content: `Translate this for ${target?.full_name}: "${transInput}"` }]
        })
      })
      const data = await res.json()
      setTransResult(data.response)
    } catch {
      setTransResult('Translation failed. Please try again.')
    }
    setTransLoading(false)
  }

  async function saveCheckin() {
    if (!checkinWord) return
    await supabase.from('checkins').insert({ user_id: profile.id, word: checkinWord, week_number: getWeek() })
    alert('Check-in saved! ✓')
  }

  function getWeek() {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7)
    const w = new Date(d.getFullYear(),0,4)
    return 1+Math.round(((d-w)/86400000-3+(w.getDay()+6)%7)/7)
  }

  const scores = assessment?.scores || {}

  function getBar(score) {
    const color = score >= 4 ? 'var(--green)' : score >= 2.5 ? 'var(--amber)' : 'var(--red)'
    return (
      <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: color, width: `${(score/5)*100}%`, borderRadius: '2px' }} />
      </div>
    )
  }

  const tabs = [
    { id: 'profile', label: 'My profile' },
    { id: 'coach', label: 'AI coach' },
    { id: 'translator', label: '💬 Comm translator' },
    { id: 'card', label: 'My user manual' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(7,11,16,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)', padding: '0 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700 }}>CX3HQ</div>
          <div style={{ display: 'flex' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '0 1rem', height: '56px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--teal)' : 'transparent'}`, color: tab === t.id ? 'var(--teal)' : 'var(--white-dim)', fontSize: '0.82rem', fontFamily: 'var(--font-b)' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--white-dim)' }}>{profile.full_name?.split(' ')[0]}</div>
        </div>
      </div>

      <div style={{ padding: '4.5rem 2rem 3rem', maxWidth: '900px', margin: '0 auto' }}>

        {/* Check-in bar */}
        <div className="card fade-up" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.15rem' }}>How are you feeling this week?</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--white-dim)' }}>One word · 3 seconds · your manager sees this</div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {['Energised', 'Stretched', 'Focused', 'Stuck', 'Tired', 'Excited'].map(w => (
              <button key={w} onClick={() => setCheckinWord(w)} style={{ padding: '0.3rem 0.75rem', borderRadius: '100px', fontSize: '0.72rem', border: `1px solid ${checkinWord === w ? 'var(--teal)' : 'var(--border)'}`, background: checkinWord === w ? 'var(--teal-dim)' : 'var(--navy-light)', color: checkinWord === w ? 'var(--teal)' : 'var(--white-dim)', fontFamily: 'var(--font-b)' }}>
                {w}
              </button>
            ))}
            {checkinWord && <button onClick={saveCheckin} style={{ padding: '0.3rem 0.75rem', borderRadius: '100px', fontSize: '0.72rem', border: '1px solid var(--teal)', background: 'var(--teal)', color: 'var(--black)', fontFamily: 'var(--font-b)', fontWeight: 600 }}>Save ✓</button>}
          </div>
        </div>

        {/* MY PROFILE */}
        {tab === 'profile' && (
          <div className="fade-up">
            <div style={{ background: 'linear-gradient(135deg,var(--navy-mid),var(--navy-light))', border: '1px solid var(--teal-border)', borderRadius: '16px', padding: '2rem', marginBottom: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg,var(--teal),transparent)' }} />
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Your performance profile</div>
              <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>{profile.full_name?.split(' ')[0]}'s natural strengths</div>
              <div style={{ color: 'var(--white-dim)', fontSize: '0.9rem', fontWeight: 300 }}>
                {scores.thinking > 3.5 ? 'Big-picture thinker' : 'Sequential precision thinker'} · {scores.motivation > 3.5 ? 'Strongly self-driven' : scores.motivation < 2.5 ? 'Inner motivation needs attention' : 'Moderate inner drive'} · {scores.social > 3.5 ? 'Team-oriented' : 'Independent worker'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {Object.entries(scores).map(([dim, score]) => (
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
                  {getBar(score)}
                  <div style={{ fontSize: '0.72rem', color: 'var(--white-dim)', marginTop: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Low</span><span style={{ color: score >= 4 ? 'var(--green)' : score >= 2.5 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>{score?.toFixed(1)}/5</span><span>High</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI COACH */}
        {tab === 'coach' && (
          <div className="fade-up">
            <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--teal-border)', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ background: 'var(--teal-dim)', borderBottom: '1px solid var(--border)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ fontSize: '1.2rem' }}>🤖</div>
                <div>
                  <div style={{ fontFamily: 'var(--font-d)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--teal)' }}>Your personal AI coach</div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(0,212,170,0.6)' }}>Knows your full profile</div>
                </div>
              </div>
              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '360px', overflowY: 'auto' }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{ background: msg.role === 'user' ? 'var(--teal-dim)' : 'var(--navy-light)', border: `1px solid ${msg.role === 'user' ? 'var(--teal-border)' : 'var(--border)'}`, borderRadius: '10px', padding: '0.875rem 1rem', fontSize: '0.83rem', lineHeight: 1.6, color: 'var(--white)', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                    {msg.text}
                  </div>
                ))}
                {chatLoading && <div style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.875rem 1rem', fontSize: '0.83rem', color: 'var(--white-dim)' }}>Thinking...</div>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', padding: '0 1.25rem 1.25rem' }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Ask anything about how you work best..." style={{ flex: 1, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.65rem 1rem', color: 'var(--white)', fontSize: '0.82rem', outline: 'none', fontFamily: 'var(--font-b)' }} />
                <button onClick={sendChat} disabled={!chatInput || chatLoading} style={{ background: 'var(--teal)', color: 'var(--black)', border: 'none', borderRadius: '8px', padding: '0.65rem 1.25rem', fontWeight: 600, fontSize: '0.82rem', fontFamily: 'var(--font-b)' }}>Send</button>
              </div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['How should I prepare for a difficult conversation?', 'When is my best time to do deep work?', 'How do I stay focused and avoid burnout?', 'What is my strongest sensory channel?'].map(s => (
                <button key={s} onClick={() => { setChatInput(s); setTimeout(sendChat, 100) }} style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', color: 'var(--white-dim)', padding: '0.35rem 0.75rem', borderRadius: '100px', fontSize: '0.72rem', fontFamily: 'var(--font-b)' }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* COMM TRANSLATOR */}
        {tab === 'translator' && (
          <div className="fade-up">
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem' }}>Comm translator</h2>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.82rem', fontWeight: 300 }}>Write a message for a colleague. The AI rewrites it for how they naturally receive information.</p>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.75rem', color: 'var(--white-dim)', marginBottom: '0.75rem' }}>Who are you writing to?</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {teammates.filter(m => m.assessments?.length > 0).map(m => (
                  <button key={m.id} onClick={() => setTransTarget(m.id)} style={{ padding: '0.35rem 0.875rem', borderRadius: '100px', fontSize: '0.78rem', border: `1px solid ${transTarget === m.id ? 'var(--teal-border)' : 'var(--border)'}`, background: transTarget === m.id ? 'var(--teal-dim)' : 'var(--navy-light)', color: transTarget === m.id ? 'var(--teal)' : 'var(--white-dim)', fontFamily: 'var(--font-b)' }}>
                    {m.full_name?.split(' ')[0]}
                  </button>
                ))}
              </div>
              <textarea value={transInput} onChange={e => setTransInput(e.target.value)} placeholder="Write your message..." style={{ width: '100%', background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.875rem', color: 'var(--white)', fontSize: '0.85rem', lineHeight: 1.6, resize: 'vertical', minHeight: '80px', outline: 'none', fontFamily: 'var(--font-b)', marginBottom: '0.75rem' }} />
              <button onClick={translate} disabled={!transInput || !transTarget || transLoading} className="btn-primary" style={{ maxWidth: '200px' }}>
                {transLoading ? 'Translating...' : 'Translate →'}
              </button>
            </div>
            {transResult && (
              <div className="card fade-up" style={{ marginTop: '1rem', borderColor: 'var(--teal-border)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>✅ Translated</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{transResult}</div>
              </div>
            )}
          </div>
        )}

        {/* USER MANUAL CARD */}
        {tab === 'card' && (
          <div className="fade-up">
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem' }}>My user manual</h2>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.82rem', fontWeight: 300 }}>Share this with your manager and colleagues so they understand how to work with you at your best.</p>
            </div>
            <div style={{ background: 'linear-gradient(135deg,var(--navy-mid),var(--navy-light))', border: '1px solid var(--teal-border)', borderRadius: '16px', padding: '2rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg,var(--teal),transparent)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--navy-light)', border: '1px solid var(--teal-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-d)', fontSize: '1rem', fontWeight: 700, color: 'var(--teal)' }}>
                  {profile.full_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.1rem', fontWeight: 700 }}>{profile.full_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--teal)' }}>CX3HQ Performance Profile</div>
                </div>
              </div>

              {[
                { key: '🧠 Give me:', val: scores.thinking > 3.5 ? 'The big picture and purpose first — always. I cannot engage properly until I understand the why.' : 'Clear steps, structure and written instructions. I need to know exactly what is expected.' },
                { key: '👂 Best format:', val: scores.sensory > 3 ? 'Verbal discussions and hands-on involvement. Written summaries help me retain.' : 'Written communication — documents, messages, structured information.' },
                { key: '⏰ My peak time:', val: 'Based on my profile — check my assessment for specific peak hours.' },
                { key: '🔑 I need:', val: scores.social > 3.5 ? 'Collaboration and team input. I perform better with others.' : 'Autonomy and space to work independently. Trust me with the outcome.' },
                { key: '🔋 Drains me:', val: scores.thinking > 3.5 ? 'Too many details before context. Micromanagement. Long emails without purpose.' : 'Vague instructions. Sudden changes without explanation. Too many things at once.' },
                { key: '⚡ Best from me when:', val: scores.motivation > 3 ? 'I believe in what I am doing and have ownership of the outcome.' : 'I have clear goals, regular check-ins and visible progress.' },
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
        )}

      </div>
    </div>
  )
}

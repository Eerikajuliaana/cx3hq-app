import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Sensory channel definitions
const SENSORY_CHANNELS = {
  // LEFT HEMISPHERE
  listening:    { id: 7,  label: 'Listening', hemisphere: 'left', icon: '👂', desc: 'Absorbs information through hearing and verbal explanation' },
  speaking:     { id: 8,  label: 'Speaking & Discussion', hemisphere: 'left', icon: '🗣', desc: 'Processes and clarifies thinking through conversation' },
  inner_speech: { id: 9,  label: 'Inner Speech', hemisphere: 'left', icon: '💭', desc: 'Uses internal monologue to work through complex ideas' },
  reading:      { id: 12, label: 'Reading', hemisphere: 'left', icon: '📖', desc: 'Takes in information most effectively through written text' },
  // RIGHT HEMISPHERE
  visual:       { id: 10, label: 'Visual / Charts', hemisphere: 'right', icon: '👁', desc: 'Understands instantly through diagrams, charts and visual overviews' },
  imagination:  { id: 11, label: 'Visual Imagination', hemisphere: 'right', icon: '🎨', desc: 'Creates mental images and pictures when processing information' },
  hands:        { id: 13, label: 'Hands-on', hemisphere: 'right', icon: '✋', desc: 'Concentrates and retains better when physically handling objects' },
  handwriting:  { id: 14, label: 'Handwriting', hemisphere: 'right', icon: '✍️', desc: 'Processes and remembers significantly better when writing by hand' },
  doing:        { id: 15, label: 'Learning by Doing', hemisphere: 'right', icon: '⚡', desc: 'Learns new skills most effectively through direct hands-on experience' },
  intuition:    { id: 16, label: 'Intuition', hemisphere: 'right', icon: '🔮', desc: 'Gets reliable inner feelings or gut sense about situations and people' },
}

// Channels that are important to flag if LOW
const IMPORTANT_IF_LOW = ['listening', 'reading', 'visual']

function analyzeSensoryChannels(answers) {
  if (!answers) return { strong: [], moderate: [], low: [], byHemisphere: { left: [], right: [] } }
  
  const channelScores = Object.entries(SENSORY_CHANNELS).map(([key, ch]) => ({
    key,
    ...ch,
    score: answers[ch.id] || 3
  }))

  const strong = channelScores.filter(c => c.score >= 3.5).sort((a, b) => b.score - a.score)
  const moderate = channelScores.filter(c => c.score >= 2.5 && c.score < 3.5)
  const low = channelScores.filter(c => c.score < 2.5)
  const importantLow = low.filter(c => IMPORTANT_IF_LOW.includes(c.key))

  const byHemisphere = {
    left: strong.filter(c => c.hemisphere === 'left'),
    right: strong.filter(c => c.hemisphere === 'right')
  }

  return { strong, moderate, low, importantLow, byHemisphere, all: channelScores }
}

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
    const { data: asmData } = await supabase.from('assessments').select('*').eq('user_id', profile.id).order('completed_at', { ascending: false }).limit(1)
    setAssessment(asmData?.[0] || null)

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
    { id: 'help', label: '❓ Help' },
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
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,212,170,0.06)', borderRadius: '8px', border: '1px solid var(--teal-border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--teal)', lineHeight: 1.6 }}>
                  ℹ️ Your biological dimensions are shown as a spectrum — neither end is better or worse. They describe how you naturally work, not how good you are. Only Motivation and Structure reflect your current state.
                </div>
              </div>
            </div>

            {/* BIOLOGICAL DIMENSIONS — AXIS */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Biological working style — permanent & unique to you</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  {
                    dim: 'thinking',
                    label: 'Thinking & Processing',
                    leftLabel: 'Sequential',
                    rightLabel: 'Simultaneous',
                    leftDesc: 'Step-by-step, detail-first, analytical precision',
                    rightDesc: 'Big-picture, pattern recognition, simultaneous processing',
                    score: scores.thinking,
                    strengthLabel: scores.thinking < 2.5 ? 'Sequential analyst — your strength is precision, structure and detail' :
                      scores.thinking > 3.5 ? 'Big-picture thinker — your strength is vision, patterns and context' :
                      'Flexible thinker — you move between detail and overview'
                  },
                  {
                    dim: 'sensory',
                    label: 'Sensory Channels',
                    leftLabel: 'Focused',
                    rightLabel: 'Multi-channel',
                    leftDesc: 'One or two strong channels — deep processing in those channels',
                    rightDesc: 'Multiple strong channels — absorbs through many formats',
                    score: scores.sensory,
                    strengthLabel: scores.sensory < 2.5 ? 'Focused channel learner — you go deep in your strongest channel' :
                      scores.sensory > 3.5 ? 'Multi-channel learner — you absorb through many formats simultaneously' :
                      'Selective channel learner — a few channels work well for you'
                  },
                  {
                    dim: 'social',
                    label: 'Social Working Style',
                    leftLabel: 'Independent',
                    rightLabel: 'Collaborative',
                    leftDesc: 'Best thinking happens alone — autonomy drives performance',
                    rightDesc: 'Best thinking happens with others — collaboration energises',
                    score: scores.social,
                    strengthLabel: scores.social < 2.5 ? 'Independent worker — you produce your best work with autonomy and solo time' :
                      scores.social > 3.5 ? 'Collaborative performer — you think and work best with others around' :
                      'Flexible collaborator — you adapt well to both solo and team work'
                  },
                  {
                    dim: 'environment',
                    label: 'Environment & Performance Mode',
                    leftLabel: 'Structured & quiet',
                    rightLabel: 'Movement & informal',
                    leftDesc: 'Analytical performance mode — quiet, still, formal settings',
                    rightDesc: 'Creative performance mode — movement, background sounds, informal',
                    score: scores.environment,
                    strengthLabel: scores.environment < 2.5 ? 'Analytical mode — quiet structured environments activate your best performance' :
                      scores.environment > 3.5 ? 'Creative mode — movement and informal environments activate your best performance' :
                      'Adaptable — you perform well across different environments'
                  }
                ].map(({ dim, label, leftLabel, rightLabel, leftDesc, rightDesc, score, strengthLabel }) => {
                  const position = ((score - 1) / 4) * 100
                  return (
                    <div key={dim} className="card" style={{ padding: '1.25rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>{label}</div>
                      <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--white)' }}>{strengthLabel}</div>

                      {/* AXIS */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--white-dim)', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 600, color: position < 40 ? 'var(--teal)' : 'var(--white-dim)' }}>{leftLabel}</span>
                        <span style={{ fontWeight: 600, color: position > 60 ? 'var(--teal)' : 'var(--white-dim)' }}>{rightLabel}</span>
                      </div>
                      <div style={{ position: 'relative', height: '6px', background: 'linear-gradient(90deg, var(--navy-light), var(--navy-light))', borderRadius: '3px', border: '1px solid var(--border)', marginBottom: '0.4rem' }}>
                        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', background: 'var(--border)', transform: 'translateY(-50%)' }} />
                        <div style={{ position: 'absolute', left: `calc(${position}% - 8px)`, top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--teal)', border: '2px solid var(--black)', boxShadow: '0 0 8px rgba(0,212,170,0.4)' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--white-faint)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                        <span style={{ maxWidth: '45%' }}>{leftDesc}</span>
                        <span style={{ maxWidth: '45%', textAlign: 'right' }}>{rightDesc}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* SENSORY CHANNEL BREAKDOWN */}
              {(() => {
                const answers = assessment?.answers || {}
                const { strong, importantLow, byHemisphere } = analyzeSensoryChannels(answers)
                return (
                  <div className="card" style={{ marginTop: '0.75rem', padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Your sensory channels — individual strengths</div>

                    {/* LEFT HEMISPHERE STRONG */}
                    {byHemisphere.left.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--white-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Left hemisphere — sequential processing</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {byHemisphere.left.map(ch => (
                            <div key={ch.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(0,212,170,0.1)', border: '1px solid var(--teal-border)', borderRadius: '8px', padding: '0.4rem 0.75rem' }}>
                              <span style={{ fontSize: '0.9rem' }}>{ch.icon}</span>
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)' }}>{ch.label}</div>
                                <div style={{ fontSize: '0.62rem', color: 'var(--white-dim)' }}>{ch.score?.toFixed(1)} / 5</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RIGHT HEMISPHERE STRONG */}
                    {byHemisphere.right.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--white-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Right hemisphere — simultaneous processing</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {byHemisphere.right.map(ch => (
                            <div key={ch.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(0,168,255,0.08)', border: '1px solid rgba(0,168,255,0.2)', borderRadius: '8px', padding: '0.4rem 0.75rem' }}>
                              <span style={{ fontSize: '0.9rem' }}>{ch.icon}</span>
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#00A8FF' }}>{ch.label}</div>
                                <div style={{ fontSize: '0.62rem', color: 'var(--white-dim)' }}>{ch.score?.toFixed(1)} / 5</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* IMPORTANT LOW CHANNELS */}
                    {importantLow.length > 0 && (
                      <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '0.875rem' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>⚠️ Good to know</div>
                        {importantLow.map(ch => (
                          <div key={ch.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{ch.icon}</span>
                            <div>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--amber)' }}>{ch.label} is a weaker channel — </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--white-dim)' }}>
                                {ch.key === 'listening' && 'verbal-only instructions may not land well. Combine with written or visual support.'}
                                {ch.key === 'reading' && 'long written documents may not be the most effective format. Prefer verbal or visual communication.'}
                                {ch.key === 'visual' && 'charts and diagrams may not be the clearest format. Prefer verbal explanation or hands-on approaches.'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {strong.length === 0 && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--white-dim)' }}>Complete your assessment to see your individual sensory channels.</div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* LEARNED DIMENSIONS — SCALE */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--white-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Current state — reflects how you feel right now, not your biological wiring</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  {
                    dim: 'motivation',
                    label: 'Inner Motivation',
                    score: scores.motivation,
                    desc: scores.motivation > 3.5 ? 'Strong inner drive — you push yourself beyond expectations because it matters to you personally.' :
                      scores.motivation < 2.5 ? '⚠️ Your inner motivation is currently low. This is a current state — not permanent. Something may be misaligned with your natural needs.' :
                      'Moderate inner drive. There may be room to reconnect with what genuinely excites you.',
                    color: scores.motivation > 3.5 ? 'var(--green)' : scores.motivation < 2.5 ? 'var(--red)' : 'var(--amber)'
                  },
                  {
                    dim: 'structure',
                    label: 'Structure & Adaptability',
                    score: scores.structure,
                    desc: scores.structure > 3.5 ? 'Highly adaptable — you handle change and ambiguity well. You work best when you can set your own direction.' :
                      scores.structure < 2.5 ? 'You perform best with clear goals, structured processes and regular feedback.' :
                      'Moderately structured — you work well with clear goals but flexibility in how you get there.',
                    color: 'var(--teal)'
                  }
                ].map(({ dim, label, score, desc, color }) => (
                  <div key={dim} className="card">
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>{label}</div>
                    <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.4rem' }}>
                      <div style={{ height: '100%', background: color, width: `${(score/5)*100}%`, borderRadius: '3px', transition: 'width 0.5s ease' }} />
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
                {teammates.map(m => (
                  <button key={m.id} onClick={() => setTransTarget(m.id)} style={{ padding: '0.35rem 0.875rem', borderRadius: '100px', fontSize: '0.78rem', border: `1px solid ${transTarget === m.id ? 'var(--teal-border)' : 'var(--border)'}`, background: transTarget === m.id ? 'var(--teal-dim)' : 'var(--navy-light)', color: transTarget === m.id ? 'var(--teal)' : 'var(--white-dim)', fontFamily: 'var(--font-b)' }}>
                    {m.full_name?.split(' ')[0]} {m.role === 'manager' ? '(Manager)' : ''}
                  </button>
                ))}
                {teammates.length === 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--white-dim)' }}>No teammates yet — your manager will appear here once they join.</div>
                )}
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

        {/* HELP */}
        {tab === 'help' && (
          <div className="fade-up">
            <div style={{ marginBottom: '1.5rem' }}>
              <h1 style={{ fontFamily: 'var(--font-d)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Your guide to CX3HQ</h1>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.85rem', fontWeight: 300 }}>How to get the most out of your profile and tools</p>
            </div>

            {/* GET STARTED */}
            <div className="card" style={{ marginBottom: '1.25rem', borderColor: 'var(--teal-border)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>Step-by-step — start here</div>
              {[
                { step: '01', title: 'Read your profile', desc: 'Go to "My profile" tab. Read each dimension carefully — Cognition, Communication, Capacity. These are not personality labels. They describe how you biologically process information and work best. Most people say it\'s the most accurate description of themselves they\'ve ever read.' },
                { step: '02', title: 'Share your user manual', desc: 'Go to "My user manual" tab. Share this card with your manager and key colleagues. This is the most impactful thing you can do — it tells people exactly how to work with you at your best, without having to explain it yourself.' },
                { step: '03', title: 'Use the AI coach', desc: 'The AI coach knows your full profile. Ask it anything — how to prepare for a meeting, how to handle a difficult conversation, how to stay focused, what your strongest working hours are. It gives you personalised advice based on how you actually work.' },
                { step: '04', title: 'Use the Comm translator', desc: 'Before sending an important message to your manager or a colleague, use the Comm translator. Select the person, write your message, and get a version that works better for how they receive information. It saves time and prevents misunderstanding.' },
                { step: '05', title: 'Do your weekly check-in', desc: 'Every week, tap one word that describes how you\'re feeling. It takes 3 seconds. Your manager sees this — it helps them support you before small things become big things. It\'s not about performance. It\'s about making sure you\'re not struggling alone.' },
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
                { q: 'Is this a personality test?', a: 'No. CX3HQ does not measure personality. It measures biological working styles — how your brain naturally processes information, communicates and performs. These are stable facts about how you work, not labels about who you are.' },
                { q: 'Can my manager see all my answers?', a: 'Your manager sees your dimension scores — not your individual answers. They see how you score on Cognition, Communication and Capacity. This gives them enough to lead you better without exposing everything.' },
                { q: 'What if my profile doesn\'t feel right?', a: 'Answer the assessment based on how you naturally work — not how you think you should work. If something still doesn\'t feel right, speak to your manager or contact us. Profiles can be discussed and refined.' },
                { q: 'What is the weekly check-in for?', a: 'The one-word check-in gives your manager a real-time signal of how you are doing. It is not about performance or productivity — it is so they can support you before small things become big things. It is completely voluntary but highly recommended.' },
                { q: 'What does the Comm translator actually do?', a: 'It rewrites your message for how the other person best receives information. For example, if your manager is a sequential thinker, it structures your message with clear steps. If a colleague is a big-picture thinker, it leads with the purpose first. Same message — better landing.' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '1rem 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.88rem' }}>❓ {item.q}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--white-dim)', lineHeight: 1.65, fontWeight: 300 }}>{item.a}</div>
                </div>
              ))}
            </div>

            <div className="card" style={{ background: 'var(--teal-dim)', borderColor: 'var(--teal-border)', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, marginBottom: '0.4rem' }}>Have a question?</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--white-dim)', fontWeight: 300 }}>We respond within 48 hours.</div>
              <a href="mailto:eerika@cx3hq.com" style={{ display: 'inline-block', marginTop: '0.75rem', background: 'var(--teal)', color: 'var(--black)', padding: '0.5rem 1.25rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-b)' }}>Contact us →</a>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

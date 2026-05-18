import { useState } from 'react'
import { supabase } from '../lib/supabase'

const questions = [
  // D1 THINKING
  { id: 1, dim: 'thinking', text: 'When starting something new, I need to understand the overall goal and purpose before I can begin working on the details.', lo: 'I prefer to start with the steps', hi: 'I need the why and overview first' },
  { id: 2, dim: 'thinking', text: 'I often read the end of a book or report first, then decide whether to read the whole thing — I need the big picture before the details.', lo: 'I always read from beginning to end', hi: 'I browse backwards and read conclusions first' },
  { id: 3, dim: 'thinking', text: 'I naturally work on several things at the same time rather than finishing one task completely before starting the next.', lo: 'I always finish one thing before starting another', hi: 'I juggle multiple things simultaneously' },
  { id: 4, dim: 'thinking', text: 'I trust my gut feeling when making decisions, often before I have analysed all the data.', lo: 'I need facts and analysis before deciding', hi: 'My instinct is almost always right — I act on it first' },
  { id: 5, dim: 'thinking', text: 'I get frustrated and lose focus when people give me too many details before getting to the point.', lo: 'I want all the details first', hi: 'Too much detail loses me completely' },
  { id: 6, dim: 'thinking', text: 'I prefer to think things through slowly and consider all options carefully before responding or taking action.', lo: 'I am a quick thinker — reflecting too long bores me', hi: 'I always think about consequences before acting' },

  // D2 SENSORY
  { id: 7, dim: 'sensory', text: 'I understand and remember information much better when I hear it explained verbally by someone else.', lo: 'I absorb very little from just listening', hi: 'I remember almost everything I hear' },
  { id: 8, dim: 'sensory', text: 'I think through problems most effectively when I can discuss them out loud with another person.', lo: 'Discussing with others does not help me think', hi: 'I need to talk things through with someone' },
  { id: 9, dim: 'sensory', text: 'When I am reading or working through something difficult, I have a strong inner voice — I talk to myself mentally.', lo: 'I have no strong inner voice', hi: 'My inner monologue is always active' },
  { id: 10, dim: 'sensory', text: 'I understand complex information significantly faster when I can see it as a diagram, chart or visual overview.', lo: 'Visuals do not help me much', hi: 'Show me a visual and I understand instantly' },
  { id: 11, dim: 'sensory', text: 'When I read or hear something, I often see images in my mind — I picture what is described.', lo: 'I do not think in pictures', hi: 'I think almost entirely in mental images' },
  { id: 12, dim: 'sensory', text: 'Reading written text is one of my strongest ways of taking in information.', lo: 'Reading is my weakest channel', hi: 'Reading is one of my best channels' },
  { id: 13, dim: 'sensory', text: 'I concentrate better and remember more when I can use my hands to touch or physically handle objects.', lo: 'Using my hands does not help me concentrate', hi: 'I need to use my hands to focus' },
  { id: 14, dim: 'sensory', text: 'Writing things down by hand with a pen on paper helps me remember and process information significantly better.', lo: 'Writing by hand does not help me more than other methods', hi: 'Handwriting is essential for me' },
  { id: 15, dim: 'sensory', text: 'I learn new skills most effectively by actually doing them myself — hands-on experience works far better than reading or watching.', lo: 'I always want to read or watch before trying', hi: 'Just let me try it. Doing is how I learn' },
  { id: 16, dim: 'sensory', text: 'I often get a strong inner feeling or gut sense about a situation or person — before I can logically explain why, and this sense is usually right.', lo: 'I rely on logic and data, not gut feelings', hi: 'My intuition is almost always right' },

  // D3 ENVIRONMENT
  { id: 17, dim: 'environment', text: 'I concentrate significantly better when I work in a quiet environment with minimal background noise.', lo: 'Background noise does not bother me', hi: 'I need complete silence to concentrate' },
  { id: 18, dim: 'environment', text: 'I work and concentrate better when there is background noise, music or the sound of people around me.', lo: 'Background noise makes it hard to concentrate', hi: 'I need background sounds — silence feels wrong' },
  { id: 19, dim: 'environment', text: 'I prefer to work in bright, well-lit environments — natural daylight or full overhead lighting helps me concentrate.', lo: 'Bright light makes me tense', hi: 'I always want maximum light' },
  { id: 20, dim: 'environment', text: 'I prefer to work in softer, dimmer lighting — harsh bright light stresses me.', lo: 'Dim lighting makes me sleepy', hi: 'I need dim lighting to perform' },
  { id: 21, dim: 'environment', text: 'I find it very difficult to sit still for long periods — I need to move my body to concentrate effectively.', lo: 'I can sit comfortably for hours', hi: 'Sitting still is nearly impossible — I need movement' },
  { id: 22, dim: 'environment', text: 'I prefer to work in a relaxed, informal environment rather than a very formal structured space.', lo: 'I work best in formal structured environments', hi: 'I need informality — formal environments drain me' },
  { id: 23, dim: 'environment', text: 'My concentration and memory are at their best during early morning hours — before 9am.', lo: 'Early morning is my worst thinking time', hi: 'Early morning 6–9am is when I produce my best work' },
  { id: 24, dim: 'environment', text: 'My thinking and concentration peak in the late morning — roughly between 10am and noon.', lo: 'Late morning is not particularly special for me', hi: '10am to noon is my absolute peak' },
  { id: 25, dim: 'environment', text: 'I am most alert and productive in the afternoon — after lunch is when I really come alive.', lo: 'Afternoon is a low point for me', hi: 'Afternoon is my best time' },
  { id: 26, dim: 'environment', text: 'I do my best work in the evening or at night — I prefer to tackle difficult tasks after normal working hours.', lo: 'Evening work is the worst for me', hi: 'I am a night person — best work after 6pm' },

  // D4 SOCIAL
  { id: 27, dim: 'social', text: 'I do my best thinking and most productive work when I am completely alone.', lo: 'I think better when other people are around', hi: 'Alone is where I produce my best work' },
  { id: 28, dim: 'social', text: 'I am significantly more productive when I have one specific person to work alongside — a thinking partner.', lo: 'Working in pairs does not help me', hi: 'A thinking partner brings out my best' },
  { id: 29, dim: 'social', text: 'I perform best when working with a group of peers — people at a similar level who share similar challenges.', lo: 'Peer groups do not help my performance', hi: 'Working with peers energises me' },
  { id: 30, dim: 'social', text: 'I enjoy working in teams and find that being part of a team significantly enhances the quality of my work.', lo: 'Teams frustrate me', hi: 'Teams bring out my best' },
  { id: 31, dim: 'social', text: 'I prefer to work independently and figure things out myself — I do not like receiving instructions or being told how to do something.', lo: 'I prefer clear instructions', hi: 'I work best without oversight — I find my own way' },
  { id: 32, dim: 'social', text: 'I am comfortable challenging my manager if I believe they are wrong, and I prefer to develop my own approaches.', lo: 'I respect authority and follow directions', hi: 'I challenge authority and do things my own way' },
  { id: 33, dim: 'social', text: 'I feel uncomfortable when my work is closely supervised — I prefer high autonomy and minimal oversight.', lo: 'I welcome close supervision', hi: 'Close supervision genuinely stresses me' },

  // D5 MOTIVATION
  { id: 34, dim: 'motivation', text: 'Even without deadlines or anyone checking on me, I push myself to do my best work — I hold myself to standards that exceed what is expected.', lo: 'I need external pressure to do my best', hi: 'I always push myself beyond expectations' },
  { id: 35, dim: 'motivation', text: 'When working on something that genuinely interests me, I lose track of time — I think about work even outside hours simply because I want to.', lo: 'I rarely think about work outside of work hours', hi: 'I regularly get absorbed in work I find interesting' },
  { id: 36, dim: 'motivation', text: 'The standards I set for my own work come from inside me — I would be disappointed in myself if I delivered something mediocre, even if nobody else noticed.', lo: 'My standards are set by what others expect', hi: 'I have my own internal bar independent of others' },
  { id: 37, dim: 'motivation', text: 'Right now, when I think about my work, I feel a genuine inner pull — I actually want to do it, not just because I have to.', lo: 'Right now I am going through the motions', hi: 'Right now I feel genuinely energised about my work' },
  { id: 38, dim: 'motivation', text: 'Lately, I find it harder than usual to get started on work tasks — even things I would normally enjoy feel heavier than before.', lo: 'I find it just as easy to get started as always', hi: 'Getting started feels very heavy lately' },
  { id: 39, dim: 'motivation', text: 'Overall, when I look at my work right now — the role, the team, the challenges — I feel this is where I want to be.', lo: 'Overall I feel disconnected from my work right now', hi: 'Overall I feel this is exactly where I want to be' },

  // D6 STRUCTURE
  { id: 40, dim: 'structure', text: 'I find it easy to adapt when plans change suddenly — I am comfortable with uncertainty.', lo: 'Sudden changes genuinely stress me', hi: 'I adapt quickly to any change or unexpected situation' },
  { id: 41, dim: 'structure', text: 'I take my responsibilities extremely seriously — if I commit to something I follow through even when difficult.', lo: 'I struggle to follow through on all commitments', hi: 'My word is my bond — I always deliver' },
  { id: 42, dim: 'structure', text: 'I prefer flexible working arrangements where I can organise my own time — fixed schedules reduce my effectiveness.', lo: 'I work best with clear fixed routines', hi: 'Flexibility is essential — rigid schedules drain me' },
  { id: 43, dim: 'structure', text: 'I need regular feedback and check-ins from my manager to feel confident that I am on the right track.', lo: 'I rarely need external feedback to feel confident', hi: 'Regular feedback is essential for me' },
]

const dimensions = {
  thinking: { label: 'Dimension 1', title: 'Thinking & Processing Style', desc: 'How you naturally process information and make decisions.' },
  sensory: { label: 'Dimension 2', title: 'Sensory Channels', desc: 'The specific channels through which you best receive and retain information.' },
  environment: { label: 'Dimension 3', title: 'Physical Needs & Environment', desc: 'The conditions under which you concentrate and perform best.' },
  social: { label: 'Dimension 4', title: 'Social Style & Authority', desc: 'How you perform best in relation to others.' },
  motivation: { label: 'Dimension 5', title: 'Inner Motivation', desc: 'What drives you — and your current motivation state.' },
  structure: { label: 'Dimension 6', title: 'Structure & Adaptability', desc: 'How you handle change, responsibility and structure.' },
}

export default function Assessment({ userId, profile, onComplete }) {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)

  const q = questions[current]
  const prevDim = current > 0 ? questions[current - 1].dim : null
  const showDimIntro = q.dim !== prevDim

  function calcScores(ans) {
    const scores = {}
    Object.keys(dimensions).forEach(dim => {
      const qs = questions.filter(q => q.dim === dim)
      const vals = qs.map(q => ans[q.id] || 3)
      scores[dim] = vals.reduce((a, b) => a + b, 0) / vals.length
    })
    return scores
  }

  async function finish() {
    setSaving(true)
    const scores = calcScores(answers)

    await supabase.from('assessments').insert({
      user_id: userId,
      answers,
      scores,
    })

    await supabase.from('profiles').update({ assessment_completed: true }).eq('id', userId)
    onComplete()
  }

  const progress = Math.round((current / questions.length) * 100)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      {/* Header */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(7,11,16,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)', padding: '0.875rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '1rem' }}>CX3HQ</div>
        <div style={{ flex: 1, maxWidth: '400px' }}>
          <div style={{ height: '4px', background: 'var(--white-faint)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--teal)', borderRadius: '2px', width: `${progress}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--white-dim)', marginTop: '0.3rem', textAlign: 'center' }}>Question {current + 1} of {questions.length}</div>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 600 }}>{dimensions[q.dim]?.title}</div>
      </div>

      {/* Body */}
      <div style={{ padding: '5rem 2rem 3rem', maxWidth: '700px', margin: '0 auto' }}>
        {/* Dim intro */}
        {showDimIntro && (
          <div className="fade-up" style={{ background: 'var(--navy-mid)', border: '1px solid var(--teal-border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '0.4rem' }}>{dimensions[q.dim]?.label} of 6</div>
            <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>{dimensions[q.dim]?.title}</div>
            <div style={{ fontSize: '0.83rem', color: 'var(--white-dim)', fontWeight: 300 }}>{dimensions[q.dim]?.desc}</div>
          </div>
        )}

        {/* Question */}
        <div className="fade-up card" key={current}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '0.75rem' }}>Question {q.id} of 43</div>
          <div style={{ fontFamily: 'var(--font-d)', fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.45, marginBottom: '1.5rem' }}>{q.text}</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--white-dim)', marginBottom: '0.4rem', padding: '0 0.25rem' }}>
            <span>Not like me at all</span>
            <span>Completely like me</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setAnswers(a => ({ ...a, [q.id]: n }))}
                style={{ flex: 1, height: '48px', background: answers[q.id] === n ? 'var(--teal)' : 'var(--navy-light)', border: `1px solid ${answers[q.id] === n ? 'var(--teal)' : 'var(--border)'}`, borderRadius: '8px', color: answers[q.id] === n ? 'var(--black)' : 'var(--white-dim)', fontFamily: 'var(--font-d)', fontSize: '1rem', fontWeight: 600, transition: 'all 0.15s' }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--white-faint)', fontStyle: 'italic' }}>
            <span>{q.lo}</span>
            <span>{q.hi}</span>
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button className="btn-secondary" onClick={() => setCurrent(c => c - 1)} disabled={current === 0} style={{ flex: 1 }}>← Back</button>
          {current < questions.length - 1 ? (
            <button className="btn-primary" onClick={() => setCurrent(c => c + 1)} disabled={!answers[q.id]} style={{ flex: 2 }}>Continue →</button>
          ) : (
            <button className="btn-primary" onClick={finish} disabled={!answers[q.id] || saving} style={{ flex: 2 }}>
              {saving ? 'Saving...' : 'See my results →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

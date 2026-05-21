export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages, system } = req.body

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.VITE_ANTHROPIC_KEY || process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: system || 'You are CX3HQ AI coach, a helpful performance coach.',
        messages
      })
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || 'Sorry, I could not generate a response.'
    res.status(200).json({ response: text })
  } catch (error) {
    res.status(500).json({ error: 'Failed to get AI response' })
  }
}

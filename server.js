require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

app.post('/api/ask', async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Question is required.' });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: `You are Joey. Someone is visiting your personal website and asking you a question directly.
Answer in first person, conversationally, as if you're speaking face-to-face.
Keep your answer concise — 1 to 3 sentences max.
Do not use bullet points, markdown, or formatting. Plain conversational English only.`,
      messages: [{ role: 'user', content: question.trim() }],
    });

    const answer = message.content[0].text;
    res.json({ answer });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'Failed to get a response. Please try again.' });
  }
});

app.listen(port, () => {
  console.log(`Joey Zero running at http://localhost:${port}`);
});

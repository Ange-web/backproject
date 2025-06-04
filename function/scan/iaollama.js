const express = require('express');
const router = express.Router();
const fetch = require('node-fetch'); // ou global `fetch` en Node 18+

router.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message manquant' });
  }

  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemma:2b',
        messages: [
          { role: 'user', content: message }
        ],
        stream: false
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Erreur avec Ollama:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

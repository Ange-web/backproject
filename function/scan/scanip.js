const express = require('express');
const fetch = require('node-fetch');
const verifyToken = require('../auth');
const router = express.Router();

router.get('/ip', verifyToken, async (req, res) => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    res.json({ ip: data.ip });
  } catch (error) {
    console.error("Erreur lors de la récupération de l'IP publique :", error);
    res.status(500).json({ error: "Impossible de récupérer l'adresse IP publique" });
  }
});

module.exports = router;

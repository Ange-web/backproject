const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const verifyToken = require('../auth');
const trackScan = require('../trackScan');

router.post('/', verifyToken, (req, res) => {
  const url = req.body.url;
  const userId = req.user.id;

  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'URL invalide' });
  }

  const cmd = `nuclei -u ${url} -tags xss,sqli,misconfig -j`;

  exec(cmd, async (error, stdout, stderr) => {
    if (error) {
      console.error('Erreur Nuclei :', stderr);
      return res.status(500).json({ error: 'Erreur pendant le scan' });
    }

    const lines = stdout.trim().split('\n');
    const results = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return { error: 'Ligne JSON invalide', raw: line };
      }
    });

    // Enregistrer le scan dans la base de données
    const resultCount = results.filter(r => !r.error).length;
    await trackScan(userId, 'url', url, resultCount);

    res.json({ url, results });
  });
});

module.exports = router;

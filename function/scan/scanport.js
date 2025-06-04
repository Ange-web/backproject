const express = require('express');
const { exec } = require('child_process');
const router = express.Router();
const verifyToken = require("../auth")

const defaultPorts = [21, 22, 80, 443, 445, 3306, 3389, 8080];

router.post('/port', verifyToken,(req, res) => {
  const { type, ip, ports } = req.body;

  // Déterminer l'IP cible
  let targetIp;
  if (type === 'public') {
    if (!ip) return res.status(400).json({ error: "Aucune adresse IP fournie." });
    targetIp = ip;
  } else {
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    targetIp = userIp.replace('::ffff:', '');
  }

  // Déterminer les ports à scanner
  const portList = (ports && ports.length > 0 ? ports : defaultPorts).join(',');

  // Commande Nmap (ne garde que les ports ouverts)
  const cmd = `nmap -p ${portList} ${targetIp} --open`;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('Erreur Nmap :', stderr);
      return res.status(500).json({ error: "Erreur pendant le scan. Assurez-vous que l'IP est accessible." });
    }

    // Extraction des ports ouverts à partir de la sortie
    const lines = stdout
      .split('\n')
      .filter(line => line.includes('/tcp') && line.includes('open'));

    const openPorts = lines.map(line => line.split('/')[0].trim());

    return res.json({
      scannedIp: targetIp,
      openPorts
    });
  });
});

module.exports = router;

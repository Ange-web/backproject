const express = require('express');
const net = require('net');
const verifyToken = require('../auth');
const trackScan = require('../trackScan');
const router = express.Router();

function normalizeIp(raw) {
  if (!raw) return null;
  // si X-Forwarded-For contient une liste, on prend la première (client réel)
  if (raw.includes(',')) raw = raw.split(',')[0].trim();

  // retirer le suffixe de zone IPv6 (%eth0)
  raw = raw.split('%')[0];

  // IPv4 mappée en IPv6 -> enlever ::ffff:
  if (raw.startsWith('::ffff:')) raw = raw.replace('::ffff:', '');

  // valider
  if (net.isIP(raw)) return raw;
  return null;
}

router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Avec `app.set('trust proxy', true)` Express remplira req.ip correctement.
    // On lit différents headers pour compatibilité
    const xff = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['cf-connecting-ip'];
    // Express req.ip en fallback
    const raw = xff || req.ip || req.connection.remoteAddress;
    const ip = normalizeIp(raw);

    if (!ip) {
      return res.status(400).json({ error: 'IP non valide ou introuvable', raw });
    }

    console.log('IP publique du client détectée:', ip);

    // Enregistrer le scan dans la base de données
    await trackScan(userId, 'ip', ip, 1);

    res.json({
      ip,
      source: xff ? 'header-x-forwarded/real/cf' : 'direct-connection',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Erreur récupération IP client:', err);
    res.status(500).json({ error: 'Impossible de récupérer l\'adresse IP' });
  }
});

module.exports = router;

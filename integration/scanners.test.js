// Scans réels (Nmap et Nuclei) contre un laboratoire autorisé.
// Démarrer l'API avec SCANNERS_ENABLED=true, SCAN_ALLOWED_IPS et SCAN_ALLOWED_URLS pointant vers VOTRE laboratoire, puis :
//   E2E_BASE_URL=http://127.0.0.1:3000 LAB_IP=127.0.0.1 LAB_URL=http://127.0.0.1:8099/ LAB_OPEN_PORT=8099 npm run test:scanners
// Ne jamais viser une cible sans autorisation écrite.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.E2E_BASE_URL, ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:5173';
const { LAB_IP, LAB_URL } = process.env, LAB_OPEN_PORT = Number(process.env.LAB_OPEN_PORT);

test('scans réels limités au laboratoire', { skip: !(BASE && LAB_IP && LAB_URL && LAB_OPEN_PORT) }, async () => {
  const jar = new Map(); let csrf = '';
  const call = async (method, url, json) => {
    const headers = { Origin: ORIGIN, 'Content-Type': 'application/json' };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => k + '=' + v).join('; ');
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(BASE + url, { method, headers, body: json && JSON.stringify(json) });
    for (const c of res.headers.getSetCookie()) { const [k, ...v] = c.split(';')[0].split('='); if (v.join('=')) jar.set(k, v.join('=')); else jar.delete(k); }
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const email = `scan.${Date.now()}@exemple.test`, password = 'Mot-de-passe-scan-2026';
  await call('POST', '/new/signup', { email, username: 'scan' + Date.now(), password });
  csrf = (await call('POST', '/user/login', { email, password })).data.csrfToken;
  try {
    // Nmap : le port ouvert du laboratoire est détecté, enregistré au niveau « info »
    const port = await call('POST', '/scan/port', { type: 'public', ip: LAB_IP, ports: [LAB_OPEN_PORT, 1] });
    assert.equal(port.status, 200, JSON.stringify(port.data));
    assert.ok(port.data.findings.some(f => f.title.includes(String(LAB_OPEN_PORT))), JSON.stringify(port.data.findings));
    assert.ok(port.data.findings.every(f => f.severity === 'info'));

    // Cibles hors laboratoire et tentatives d'injection refusées AVANT toute exécution
    for (const ip of ['8.8.8.8', LAB_IP + ';id', '$(whoami)']) assert.equal((await call('POST', '/scan/port', { type: 'public', ip, ports: [80] })).status, 400, ip);
    assert.equal((await call('POST', '/scan/port', { type: 'public', ip: LAB_IP, ports: [0] })).status, 400);
    for (const url of ['https://example.com/', LAB_URL + ';touch /tmp/pwn', 'file:///etc/passwd']) assert.equal((await call('POST', '/scan/url', { url })).status, 400, url);

    // Nuclei : exécution réelle contre l'URL du laboratoire, résultat normalisé (tableau, éventuellement vide)
    const url = await call('POST', '/scan/url', { url: LAB_URL });
    assert.equal(url.status, 200, JSON.stringify(url.data));
    assert.ok(Array.isArray(url.data.findings));
    assert.equal(url.data.scan.tool_type, 'url');
  } finally { await call('DELETE', '/profile', { password }); }
});

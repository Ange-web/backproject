// Parcours complet contre une API réellement démarrée (PostgreSQL, MongoDB et ExifTool réels).
// Usage : démarrer l'API (npm start), puis  E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
// Utiliser uniquement une base de test : le test crée puis supprime deux comptes fictifs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const BASE = process.env.E2E_BASE_URL;
const ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:5173';

function client() {
  const jar = new Map(); let csrf = '';
  async function call(method, url, { json, form, raw } = {}) {
    const headers = { Origin: ORIGIN };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => k + '=' + v).join('; ');
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
    let body;
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(BASE + url, { method, headers, body });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) { const [k, ...v] = c.split(';')[0].split('='); const val = v.join('='); if (val) jar.set(k, val); else jar.delete(k); }
    const data = raw ? Buffer.from(await res.arrayBuffer()) : await res.json().catch(() => null);
    return { status: res.status, data, headers: res.headers };
  }
  return { call, setCsrf: t => { csrf = t; } };
}

// Petite image PNG valide (CRC calculés), enrichie d'un champ EXIF avec le vrai ExifTool quand il est présent.
function crc32(buf) { let c, crc = 0xffffffff; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b)); return Buffer.concat([l, b, c]); }
function samplePng() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nspy-e2e-')), 'photo.png');
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0])), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0]))), chunk('IEND', Buffer.alloc(0))]));
  execFileSync(process.env.EXIFTOOL_PATH || 'exiftool', ['-overwrite_original', '-Artist=Photographe fictif', file]);
  return fs.readFileSync(file);
}

test('parcours complet NSPY sur la pile réelle', { skip: !BASE }, async () => {
  const stamp = Date.now();
  const alice = client(), bob = client();
  const pwd = 'Mot-de-passe-e2e-2026';
  const emailA = `alice.${stamp}@exemple.test`, emailB = `bob.${stamp}@exemple.test`;

  assert.equal((await alice.call('GET', '/readyz')).status, 200);
  assert.equal((await alice.call('GET', '/')).status, 404, 'aucune liste publique des comptes');

  // Inscription : pas de mot de passe dans la réponse ; doublon refusé quelle que soit la casse
  const s = await alice.call('POST', '/new/signup', { json: { email: emailA, username: 'alice' + stamp, password: pwd } });
  assert.equal(s.status, 201); assert.equal(s.data.user.password, undefined);
  assert.equal((await bob.call('POST', '/new/signup', { json: { email: emailA.toUpperCase(), username: 'x' + stamp, password: pwd } })).status, 409);
  assert.equal((await bob.call('POST', '/new/signup', { json: { email: emailB, username: 'bob' + stamp, password: pwd } })).status, 201);

  // Connexion : cookie HttpOnly, pas de JWT dans le JSON
  assert.equal((await alice.call('POST', '/user/login', { json: { email: emailA, password: 'faux' } })).status, 401);
  const l = await alice.call('POST', '/user/login', { json: { email: emailA, password: pwd } });
  assert.equal(l.status, 200); assert.equal(l.data.token, undefined); alice.setCsrf(l.data.csrfToken);
  const lb = await bob.call('POST', '/user/login', { json: { email: emailB, password: pwd } }); bob.setCsrf(lb.data.csrfToken);

  // Profil : modification persistée
  assert.equal((await alice.call('PUT', '/profile', { json: { prenom: 'Alice', nom: 'Test' } })).status, 200);
  assert.equal((await alice.call('GET', '/profile')).data.user.prenom, 'Alice');

  // EXIF réel : lecture, modification, téléchargement ; Bob n'a pas accès au fichier d'Alice
  const form = new FormData(); form.append('image', new Blob([samplePng()], { type: 'image/png' }), 'photo.png');
  const up = await alice.call('POST', '/scan/exif/read', { form });
  assert.equal(up.status, 201, JSON.stringify(up.data)); assert.equal(up.data.metadata.Artist, 'Photographe fictif');
  assert.equal(up.data.metadata.SourceFile, undefined, 'aucun chemin serveur divulgué');
  assert.equal(up.data.metadata.FilePermissions, undefined, 'aucune permission serveur divulguée');
  const id = up.data.storedName;
  assert.equal((await alice.call('POST', '/scan/exif/edit', { json: { storedName: id, tag: 'Artist', value: 'NSPY' } })).status, 200);
  const dl = await alice.call('GET', '/scan/exif/download/' + id, { raw: true });
  assert.equal(dl.status, 200); assert.ok(dl.data.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71])));
  assert.equal((await bob.call('GET', '/scan/exif/download/' + id, { raw: true })).status, 404);
  assert.equal((await bob.call('POST', '/scan/exif/edit', { json: { storedName: id, tag: 'Artist', value: 'pirate' } })).status, 404);
  assert.equal((await alice.call('POST', '/scan/exif/edit', { json: { storedName: id, tag: 'SourceFile', value: 'x' } })).status, 400, 'tag hors liste refusé');
  const fakeForm = new FormData(); fakeForm.append('image', new Blob([Buffer.from('<?php echo 1; ?>')], { type: 'image/png' }), 'shell.png');
  assert.equal((await alice.call('POST', '/scan/exif/read', { form: fakeForm })).status, 400, 'signature de fichier vérifiée');

  // Enregistrement IP : écrit en SQL puis copié dans MongoDB
  const ip = await alice.call('POST', '/scan/ip', { json: {} });
  assert.equal(ip.status, 200);
  const detail = await alice.call('GET', '/api/scans/' + ip.data.scan.id);
  assert.equal(detail.status, 200); assert.equal(detail.data.scan.document_status, 'mongo');
  assert.equal((await bob.call('GET', '/api/scans/' + ip.data.scan.id)).status, 404);

  // Historique et statistiques personnels
  const hist = await alice.call('GET', '/api/scans');
  assert.equal(hist.data.scans.length, 2);
  assert.equal((await bob.call('GET', '/api/scans')).data.scans.length, 0);
  const st = await alice.call('GET', '/stats'); assert.equal(st.data.exifScans, 1); assert.equal(st.data.ipScans, 1);
  const pdf = await alice.call('GET', `/api/scans/${ip.data.scan.id}/report/latest`, { raw: true });
  assert.equal(pdf.status, 200); assert.equal(pdf.data.subarray(0, 4).toString(), '%PDF');

  // Protection CSRF et déconnexion
  const noCsrf = await fetch(BASE + '/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: 'x=y' }, body: '{"prenom":"x"}' });
  assert.equal(noCsrf.status, 401);

  // Suppression des comptes : données SQL, Mongo et fichiers effacés
  assert.equal((await alice.call('DELETE', '/profile', { json: { password: pwd } })).status, 200);
  assert.equal((await alice.call('GET', '/profile')).status, 401);
  assert.equal((await bob.call('DELETE', '/profile', { json: { password: pwd } })).status, 200);
});

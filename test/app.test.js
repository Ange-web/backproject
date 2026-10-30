const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { createApp } = require('../app');
const { validateTarget, validatePorts, createRunner } = require('../src/tools');
let pool, app, root, alice, bob, aliceCsrf, bobCsrf, scanId, file;
const password = 'Long-password-test-2026';
const fakeExif = { read: async () => ({ Artist: 'Test', SourceFile: 'private/path.jpg', FileName: 'secret.jpg' }), write: async () => {} };
before(async () => {
  const db = newDb();
  db.public.none(await fs.readFile(path.join(__dirname, '../migrations/001_schema.sql'), 'utf8'));
  // pg-mem cannot reapply CREATE TABLE IF NOT EXISTS constraints; test the production schema once.

  const Pg = db.adapters.createPg(); pool = new Pg.Pool(); root = await fs.mkdtemp(path.join(os.tmpdir(), 'nspy-test-'));
  app = createApp({ pool, secret: 'test-secret-32-characters-minimum-12345', limits: false, uploadDir: root, exif: fakeExif,
    runner: async (kind, body) => ({ target: kind === 'url' ? body.url : body.ip, duration_ms: 10,
      findings: [{ title: 'Test du laboratoire', severity: 'info', description: 'Simulation de test', evidence: 'Aucune commande réseau exécutée' }] }) });
  alice = request.agent(app); bob = request.agent(app);
});
after(async () => { await pool?.end(); if (root) await fs.rm(root, { recursive: true, force: true }); });
test('validation: malformed targets, injection strings and ports rejected', async () => {
  assert.throws(() => validateTarget('url', 'https://lab.example/; touch file', ['https://lab.example/']));
  assert.throws(() => validateTarget('url', 'file:///etc/passwd', []));
  assert.throws(() => validateTarget('url', 'https://lab.example@other.example/', ['https://lab.example/']));
  assert.throws(() => validateTarget('ip', '127.0.0.1;whoami', ['127.0.0.1']));
  assert.throws(() => validatePorts([0, 70000])); assert.throws(() => validatePorts([22.5]));
  assert.equal(validateTarget('url', 'https://lab.example/', ['https://lab.example/']), 'https://lab.example/');
  assert.deepEqual(validatePorts([22, 22, 443]), [22, 443]);
  await assert.rejects(createRunner()('url', {}), { status: 503 });
});
test('public routes never expose accounts and unauthenticated access fails', async () => {
  await request(app).get('/').expect(404); await request(app).get('/stats').expect(401);
  await request(app).get('/api/scans').expect(401); await request(app).get('/profile').expect(401);
  await request(app).post('/proxy/user/login').expect(404);
});
test('signup validates, hashes password and does not return it', async () => {
  await alice.post('/new/signup').send({ email: 'bad', password: 'tiny', username: 'a' }).expect(400);
  for (const [agent, email, username] of [[alice, 'alice@example.com', 'alice'], [bob, 'bob@example.com', 'bob']]) {
    const res = await agent.post('/new/signup').send({ email, username, password }).expect(201);
    assert.equal(res.body.user.email, email); assert.equal(res.body.user.password, undefined);
  }
  const row = (await pool.query('SELECT password FROM public."user" WHERE id=1')).rows[0];
  assert.notEqual(row.password, password); assert.match(row.password, /^\$2[ab]\$12\$/);
  await alice.post('/new/signup').send({ email: 'ALICE@example.com', username: 'again', password }).expect(409);
});
test('login returns HttpOnly session, CSRF token and no JWT in JSON', async () => {
  await alice.post('/user/login').send({ email: 'alice@example.com', password: 'wrong' }).expect(401);
  const a = await alice.post('/user/login').send({ email: 'alice@example.com', password }).expect(200);
  aliceCsrf = a.body.csrfToken; assert.equal(a.body.token, undefined);
  assert.match(a.headers['set-cookie'][0], /HttpOnly/); assert.match(a.headers['set-cookie'][0], /SameSite=Lax/);
  const b = await bob.post('/user/login').send({ email: 'bob@example.com', password }).expect(200); bobCsrf = b.body.csrfToken;
  await alice.get('/session').expect(200);
});
test('cross-origin and missing CSRF mutations are rejected', async () => {
  await alice.put('/profile').send({ username: 'attacker' }).expect(403);
  await alice.put('/profile').set('X-CSRF-Token', aliceCsrf).set('Origin', 'https://other.example').send({ username: 'attacker' }).expect(403);
  await alice.put('/profile').set('X-CSRF-Token', aliceCsrf).send({ id: 2, username: 'attacker' }).expect(400);
  const res = await alice.put('/profile').set('X-CSRF-Token', aliceCsrf).send({ prenom: 'Alice' }).expect(200);
  assert.equal(res.body.user.prenom, 'Alice');
});
test('scan creation, private history, personal stats, detail and PDF', async () => {
  const res = await alice.post('/scan/url').set('X-CSRF-Token', aliceCsrf).send({ url: 'https://lab.example/' }).expect(200);
  scanId = res.body.scan.id; assert.equal(res.body.findings[0].severity, 'info');
  const list = await alice.get('/api/scans').expect(200); assert.equal(list.body.scans.length, 1);
  assert.equal((await bob.get('/api/scans').expect(200)).body.scans.length, 0);
  assert.equal((await alice.get('/stats').expect(200)).body.totalScans, 1);
  assert.equal((await bob.get('/stats').expect(200)).body.totalScans, 0);
  await bob.get('/api/scans/' + scanId).expect(404);
  await bob.get('/api/scans/' + scanId + '/report/latest').expect(404);
  await alice.get('/api/scans/' + scanId).expect(200);
  const report = await alice.get('/api/scans/' + scanId + '/report/latest').expect(200).expect('Content-Type', /pdf/);
  assert.ok(Buffer.isBuffer(report.body)); assert.equal(report.body.subarray(0, 4).toString(), '%PDF');
});
test('files validate signatures, filter paths, enforce ownership on edit/delete/download', async () => {
  await alice.post('/scan/exif/read').set('X-CSRF-Token', aliceCsrf).attach('image', Buffer.from('not-a-picture'), 'fake.png').expect(400);
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  const res = await alice.post('/scan/exif/read').set('X-CSRF-Token', aliceCsrf).attach('image', png, 'picture.png').expect(201);
  file = res.body.storedName; assert.ok(file); assert.equal(res.body.metadata.SourceFile, undefined); assert.equal(res.body.metadata.FileName, undefined);
  await bob.get('/scan/exif/download/' + file).expect(404);
  await bob.post('/scan/exif/edit').set('X-CSRF-Token', bobCsrf).send({ storedName: file, tag: 'Artist', value: 'bad' }).expect(404);
  await bob.delete('/scan/exif/' + file).set('X-CSRF-Token', bobCsrf).expect(404);
  await alice.post('/scan/exif/edit').set('X-CSRF-Token', aliceCsrf).send({ storedName: file, tag: 'FileName', value: '../../bad' }).expect(400);
  await alice.post('/scan/exif/edit').set('X-CSRF-Token', aliceCsrf).send({ storedName: file, tag: 'Artist', value: 'Alice' }).expect(200);
  await alice.post('/scan/exif/delete').set('X-CSRF-Token', aliceCsrf).send({ storedName: file }).expect(200);
  await alice.get('/scan/exif/download/' + file).expect(200);
  await alice.post('/scan/exif/read').set('X-CSRF-Token', aliceCsrf).attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png').expect(413);
});
test('logout revokes a copied session and deleted accounts lose all SQL resources', async () => {
  const copied = await request(app).post('/user/login').send({ email: 'alice@example.com', password }).expect(200);
  const cookie = copied.headers['set-cookie'].map(v => v.split(';')[0]).join('; ');
  await alice.post('/user/logout').set('X-CSRF-Token', aliceCsrf).expect(200);
  await request(app).get('/session').set('Cookie', cookie).expect(401);
  const relog = await alice.post('/user/login').send({ email: 'alice@example.com', password }).expect(200); aliceCsrf = relog.body.csrfToken;
  await alice.delete('/profile').set('X-CSRF-Token', aliceCsrf).send({ password: 'wrong' }).expect(401);
  await alice.delete('/profile').set('X-CSRF-Token', aliceCsrf).send({ password }).expect(200);
  assert.equal((await pool.query('SELECT * FROM scans WHERE user_id=1')).rows.length, 0);
  assert.equal((await pool.query('SELECT * FROM user_files WHERE user_id=1')).rows.length, 0);
  assert.equal((await fs.readdir(root)).length, 0);
  await alice.get('/session').expect(401);
});
test('SQL retains scan details when MongoDB is unavailable', async () => {
  const fallbackApp = createApp({ pool, secret: 'test-secret-32-characters-minimum-12345', limits: false, uploadDir: root,
    documents: { put: async () => { throw new Error('offline'); } }, runner: async () => ({ target: 'lab', findings: [], duration_ms: 1 }) });
  const agent = request.agent(fallbackApp);
  const login = await agent.post('/user/login').send({ email: 'bob@example.com', password }).expect(200);
  const scan = await agent.post('/scan/url').set('X-CSRF-Token', login.body.csrfToken).send({ url: 'lab' }).expect(200);
  const saved = (await pool.query('SELECT document_status,detail FROM scans WHERE id=$1', [scan.body.scan.id])).rows[0];
  assert.equal(saved.document_status, 'pending'); assert.equal(saved.detail.target, 'lab');
  await agent.get('/api/scans/' + scan.body.scan.id).expect(200);
});


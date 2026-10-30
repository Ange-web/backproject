const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDocumentStore } = require('../src/documents');
test('MongoDB: upsert, owner-scoped read and deletion', { skip: !process.env.TEST_MONGO_URL }, async () => {
  const store = createDocumentStore(process.env.TEST_MONGO_URL);
  const id = Date.now();
  try {
    await store.ready(); await store.put(id, id, { target: 'laboratoire', findings: [] });
    assert.equal((await store.get(id, id)).target, 'laboratoire');
    assert.equal(await store.get(id, id + 1), null);
    await store.removeUser(id); assert.equal(await store.get(id, id), null);
  } finally { await store.removeUser(id).catch(() => {}); await store.close(); }
});

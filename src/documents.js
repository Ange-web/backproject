const { MongoClient } = require('mongodb');
function createDocumentStore(uri) {
  if (!uri) return null;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  const collection = client.db(process.env.MONGO_DB || 'nspy').collection('scan_details');
  return {
    async ready() { await client.connect(); await collection.createIndex({ scanId: 1, userId: 1 }, { unique: true }); },
    async put(scanId, userId, detail) {
      await collection.updateOne({ scanId, userId }, { $set: { schemaVersion: 1, detail, updatedAt: new Date() } }, { upsert: true });
    },
    async get(scanId, userId) { return (await collection.findOne({ scanId, userId }, { projection: { _id: 0, detail: 1 } }))?.detail || null; },
    async removeUser(userId) { await collection.deleteMany({ userId }); },
    close() { return client.close(); },
  };
}
module.exports = { createDocumentStore };

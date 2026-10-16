/* Dry run by default. Never delete or merge records. */
require('ts-node/register');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { inspectReferences, normalizeReferences } = require('../src/common/database/reference-repair');

async function main() {
  require('dotenv').config({ quiet: true });
  const uri = process.env.MONGODB_URI_PROD || process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!uri) throw new Error('Production MongoDB URI is missing');
  const connection = await mongoose.createConnection(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 }).asPromise();
  try {
    function schemas(directory) {
      for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, item.name);
        if (item.isDirectory()) schemas(file);
        else if (file.endsWith('.schema.ts')) {
          for (const [key, value] of Object.entries(require(file))) {
            if (key.endsWith('Schema') && value instanceof mongoose.Schema) connection.model(key.slice(0, -6), value);
          }
        }
      }
    }
    schemas(path.resolve(__dirname, '../src/modules'));
    const report = await inspectReferences(connection);
    const mismatchedXp = await connection.collection('user_xp').aggregate([
      { $lookup: { from: 'xp_transactions', localField: 'userId', foreignField: 'userId', as: 'ledger' } },
      { $match: { $expr: { $ne: ['$totalXp', { $sum: '$ledger.amount' }] } } }, { $count: 'count' },
    ]).toArray();
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'read-only', references: report.filter((r) => r.convertible || r.invalid || r.collisions), xpBalancesNeedingReview: mismatchedXp[0]?.count ?? 0 }, null, 2));
    if (process.argv.includes('--apply')) {
      const directory = path.resolve(__dirname, '../.tmp');
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const backupPath = path.join(directory, 'reference-backup-' + Date.now() + '.json');
      await normalizeReferences(connection, (backup) => {
        fs.writeFileSync(backupPath, mongoose.mongo.BSON.EJSON.stringify({ createdAt: new Date(), entries: backup }), { mode: 0o600 });
      });
      console.log('Original reference values backed up to ' + backupPath);
      console.log('Valid historical ID references normalized; records and scores preserved.');
    }
  } finally { await connection.close(); }
}
main().catch((error) => { console.error(error.name + ': ' + (error.message.includes('Reference') || error.message.includes('historical') ? error.message : 'Database inspection failed; no credential details printed.')); process.exitCode = 1; });

/* Dry run by default. Append-only repair preserving all historical scores and records. */
require('ts-node/register');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { inspectXpBalances, reconcileHistoricalXp } = require('../src/common/database/xp-reconciliation');

async function main() {
  const test = process.env.NODE_ENV === 'test';
  if (!test) require('dotenv').config({ quiet: true });
  const uri = test ? process.env.MONGODB_URI_TEST : (process.env.MONGODB_URI_PROD || process.env.MONGODB_URI || process.env.MONGO_URL);
  if (!uri || (test && !/^mongodb:\/\/127\.0\.0\.1:\d+\/xp_reconciliation_test(?:\?|$)/.test(uri))) throw new Error('Database configuration refused');
  const connection = await mongoose.createConnection(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 }).asPromise();
  try {
    const planned = (await inspectXpBalances(connection)).length;
    const apply = process.argv.includes('--apply');
    let reconciled = 0;
    if (apply) {
      const directory = process.env.XP_RECONCILIATION_BACKUP_DIR || path.resolve(__dirname, '../.tmp');
      reconciled = await reconcileHistoricalXp(connection, snapshots => {
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const backup = path.join(directory, `xp-reconciliation-${crypto.randomUUID()}.json`);
        fs.writeFileSync(backup, mongoose.mongo.BSON.EJSON.stringify({ createdAt: new Date(), snapshots }), { mode: 0o600, flag: 'wx' });
      });
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'read-only', planned, reconciled }));
  } finally { await connection.close(); }
}
main().catch(() => { console.error('XP reconciliation failed; scores were not changed. Inspect the private backup and database configuration.'); process.exitCode = 1; });

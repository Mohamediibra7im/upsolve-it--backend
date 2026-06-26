/**
 * backup-roadmap.js
 * Dumps all roadmap-related collections from PRODUCTION to a local JSON file.
 * Run this BEFORE the migration script.
 *
 * Usage:
 *   node scripts/backup-roadmap.js
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function parseEnv() {
  try {
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        env[match[1]] = val;
      }
    });
    return env;
  } catch (err) {
    console.error('Error parsing .env file:', err);
    return {};
  }
}

async function run() {
  const env = parseEnv();
  const mongoUri = env.MONGODB_URI_PROD;
  if (!mongoUri) {
    console.error('MONGODB_URI_PROD not found in .env — aborting.');
    process.exit(1);
  }

  console.log('Connecting to PRODUCTION MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  const db = mongoose.connection.db;

  const collections = [
    { name: 'roadmap_levels',   key: 'levels'   },
    { name: 'roadmap_topics',   key: 'topics'   },
    { name: 'roadmap_videos',   key: 'videos'   },
    { name: 'roadmap_sheets',   key: 'sheets'   },
    { name: 'roadmap_problems', key: 'problems' },
  ];

  const backupData = {};

  for (const { name, key } of collections) {
    try {
      const docs = await db.collection(name).find({}).toArray();
      backupData[key] = docs;
      console.log(`  ${name}: ${docs.length} documents`);
    } catch (err) {
      console.warn(`  ${name}: skipped (${err.message})`);
      backupData[key] = [];
    }
  }

  const backupPath = path.join(__dirname, 'roadmap_backup_prod.json');
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');

  const total = Object.values(backupData).reduce((s, a) => s + a.length, 0);
  console.log(`\nBackup saved to: ${backupPath}`);
  console.log(`Total documents: ${total}`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});

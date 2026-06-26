/**
 * migrate-roadmap.js
 * Migrates PRODUCTION roadmap data from the old schema to the new schema.
 *
 * Old model: Level → Topic → Video + Sheet → Problems (attached to Sheet)
 * New model: Level → Topic → Resources (Videos/Articles/etc) + Problems (attached to Topic)
 *
 * Usage:
 *   1. Run backup first:  node scripts/backup-roadmap.js
 *   2. Then migrate:      node scripts/migrate-roadmap.js
 *
 * Reads MONGODB_URI_PROD from ../.env automatically.
 * Reads backup from scripts/roadmap_backup_prod.json (created by backup script).
 *
 * Collections touched (dropped + recreated):
 *   roadmap_levels, roadmap_topics, roadmap_problems, roadmap_resources,
 *   roadmap_videos (dropped), roadmap_sheets (dropped),
 *   user_video_progress (dropped), user_resource_progress (recreated empty),
 *   user_problem_progress (dropped + recreated empty),
 *   user_topic_progress (dropped + recreated empty),
 *   user_level_progress (dropped + recreated empty)
 *
 * Collections NOT touched (user data is safe):
 *   users, user_xp, xp_transactions, trainings, userstats,
 *   upsolved_problems, dismissed_upsolves, friendrequests, friendships,
 *   traininglevels, whats_new_entries, audit_logs, refresh_tokens
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// ── helpers ───────────────────────────────────────────────────────────────────

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

function getCodeforcesUrl(cfProblemId) {
  if (!cfProblemId) return 'https://codeforces.com/problemset';
  const trimmed = cfProblemId.trim();
  if (trimmed.toLowerCase().startsWith('http://') || trimmed.toLowerCase().startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.toLowerCase().startsWith('gym/')) {
    const parts = trimmed.split('/').filter(Boolean);
    return `https://codeforces.com/gym/${parts[1]}/problem/${parts[2]}`;
  }
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').filter(Boolean);
    return `https://codeforces.com/problemset/problem/${parts[0]}/${parts[1]}`;
  }
  const match = trimmed.match(/^(\d+)([A-Za-z][A-Za-z0-9]*)$/);
  if (match) {
    return `https://codeforces.com/problemset/problem/${match[1]}/${match[2]}`;
  }
  return 'https://codeforces.com/problemset';
}

function toObjectId(val) {
  if (!val) return new mongoose.Types.ObjectId();
  try { return new mongoose.Types.ObjectId(val.toString()); } catch { return new mongoose.Types.ObjectId(); }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  // 1. Load backup
  const backupPath = path.join(__dirname, 'roadmap_backup_prod.json');
  if (!fs.existsSync(backupPath)) {
    console.error(`Backup file not found: ${backupPath}`);
    console.error('Run "node scripts/backup-roadmap.js" first.');
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log('Loaded backup:');
  console.log(`  Levels:   ${backup.levels?.length   || 0}`);
  console.log(`  Topics:   ${backup.topics?.length   || 0}`);
  console.log(`  Videos:   ${backup.videos?.length   || 0}`);
  console.log(`  Sheets:   ${backup.sheets?.length   || 0}`);
  console.log(`  Problems: ${backup.problems?.length || 0}`);
  console.log('');

  // 2. Connect to production
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

  // 3. Drop old collections (content will be rebuilt from backup)
  const toDrop = [
    'roadmap_levels',
    'roadmap_topics',
    'roadmap_problems',
    'roadmap_resources',
    'roadmap_videos',       // old — replaced by roadmap_resources
    'roadmap_sheets',       // old — removed
    'user_video_progress',  // old — replaced by user_resource_progress
    'user_resource_progress',
    'user_problem_progress',
    'user_topic_progress',
    'user_level_progress',
  ];

  console.log('Dropping old collections...');
  for (const name of toDrop) {
    try {
      await db.collection(name).drop();
      console.log(`  dropped: ${name}`);
    } catch (e) {
      console.log(`  skipped: ${name} (${e.message})`);
    }
  }
  console.log('');

  // 4. Migrate levels
  if (backup.levels?.length > 0) {
    console.log('Migrating levels...');
    const levels = backup.levels.map(l => ({
      _id:            toObjectId(l._id),
      title:          l.title        || '',
      description:    l.description  || '',
      orderIndex:     l.orderIndex   ?? 0,
      isPublished:    l.isPublished  ?? false,
      visibility:     l.visibility   || 'all',
      allowedUserIds: (l.allowedUserIds || []).map(toObjectId),
      levelBonusXp:   500,   // new field — default for all existing levels
      createdAt:      l.createdAt ? new Date(l.createdAt) : new Date(),
      updatedAt:      new Date(),
    }));
    await db.collection('roadmap_levels').insertMany(levels);
    console.log(`  migrated ${levels.length} levels`);
  }

  // 5. Migrate topics
  //    Build a map: old topicId (string) → topic document, for use when migrating videos
  const topicsMap = new Map();
  if (backup.topics?.length > 0) {
    console.log('\nMigrating topics...');
    const topics = backup.topics.map(t => {
      topicsMap.set(String(t._id), t);
      return {
        _id:                toObjectId(t._id),
        levelId:            toObjectId(t.levelId),
        title:              t.title       || '',
        description:        t.description || '',
        orderIndex:         t.orderIndex  ?? 0,
        subtopics:          t.subtopics   || [],
        requiredLearningPct: 80,   // new field
        requiredProblemPct:  60,   // new field
        topicXpReward:       100,  // new field
        groupLinks:          '',   // new field
        groupNote:           '',   // new field
        createdAt:           t.createdAt ? new Date(t.createdAt) : new Date(),
        updatedAt:           new Date(),
      };
    });
    await db.collection('roadmap_topics').insertMany(topics);
    console.log(`  migrated ${topics.length} topics`);
  }

  // 6. Migrate videos → roadmap_resources
  //    Each old video becomes one resource (type: Video, language: Arabic)
  if (backup.videos?.length > 0) {
    console.log('\nMigrating videos → resources...');
    const resources = backup.videos.map((v, i) => {
      const parentTopic = topicsMap.get(String(v.topicId));
      const xpReward = parentTopic?.xpVideoReward ?? 50;
      return {
        _id:                          toObjectId(v._id),
        topicId:                      toObjectId(v.topicId),
        title:                        v.title || 'Introduction Video',
        description:                  '',
        language:                     'Arabic',
        type:                         'Video',
        url:                          v.youtubeUrl || '',
        weight:                       100,  // 1 video = full learning weight
        xpReward:                     xpReward,
        videoCompletionThresholdPct:  80,
        orderIndex:                   1,
        createdAt:                    v.createdAt ? new Date(v.createdAt) : new Date(),
        updatedAt:                    new Date(),
      };
    });
    await db.collection('roadmap_resources').insertMany(resources);
    console.log(`  migrated ${resources.length} videos as resources`);
  }

  // 7. Build sheet → topicId map, then migrate problems
  //    Old: problem.sheetId → sheet.topicId
  //    New: problem.topicId (directly)
  const sheetToTopic = new Map();
  (backup.sheets || []).forEach(s => {
    sheetToTopic.set(String(s._id), String(s.topicId));
  });

  if (backup.problems?.length > 0) {
    console.log('\nMigrating problems...');
    const problems = [];
    let skipped = 0;

    for (const p of backup.problems) {
      const topicId = sheetToTopic.get(String(p.sheetId));
      if (!topicId) {
        console.warn(`  WARN: problem "${p.cfProblemId}" has no matching sheet — skipped`);
        skipped++;
        continue;
      }
      problems.push({
        _id:          toObjectId(p._id),
        topicId:      toObjectId(topicId),
        name:         p.title || p.cfProblemId || 'Problem',
        url:          getCodeforcesUrl(p.cfProblemId),
        cfProblemId:  p.cfProblemId || '',
        orderIndex:   p.orderIndex  ?? 0,
        xpReward:     p.xpReward    ?? 40,
        createdAt:    p.createdAt ? new Date(p.createdAt) : new Date(),
        updatedAt:    new Date(),
      });
    }

    if (problems.length > 0) {
      await db.collection('roadmap_problems').insertMany(problems);
    }
    console.log(`  migrated ${problems.length} problems (skipped ${skipped} orphaned)`);
  }

  // 8. Rebuild indexes on new collections
  console.log('\nRebuilding indexes...');

  await db.collection('roadmap_problems').createIndex({ topicId: 1, orderIndex: 1 });
  await db.collection('roadmap_problems').createIndex({ topicId: 1, cfProblemId: 1 });
  console.log('  roadmap_problems indexes created');

  await db.collection('roadmap_resources').createIndex({ topicId: 1, orderIndex: 1 });
  console.log('  roadmap_resources indexes created');

  await db.collection('user_topic_progress').createIndex({ userId: 1, topicId: 1 }, { unique: true });
  console.log('  user_topic_progress indexes created');

  await db.collection('user_level_progress').createIndex({ userId: 1, levelId: 1 }, { unique: true });
  console.log('  user_level_progress indexes created');

  await db.collection('user_problem_progress').createIndex({ userId: 1, problemId: 1 }, { unique: true });
  await db.collection('user_problem_progress').createIndex({ userId: 1, isSolved: 1 });
  await db.collection('user_problem_progress').createIndex({ userId: 1, isSolved: 1, solvedAt: 1 });
  console.log('  user_problem_progress indexes created');

  await db.collection('user_resource_progress').createIndex({ userId: 1, resourceId: 1 }, { unique: true });
  console.log('  user_resource_progress indexes created');

  console.log('\nMigration complete!');
  console.log('Summary:');
  console.log(`  Levels:    ${backup.levels?.length   || 0} migrated`);
  console.log(`  Topics:    ${backup.topics?.length   || 0} migrated`);
  console.log(`  Resources: ${backup.videos?.length   || 0} migrated (from videos)`);
  console.log(`  Problems:  ${backup.problems?.length || 0} processed`);
  console.log('\nUser XP, trainings, streaks, friends — untouched.');

  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});

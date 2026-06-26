/**
 * Migration script: Award 50 XP to all existing verified users
 * who were verified before the XP reward feature was added.
 *
 * Run with: node scripts/award-verification-xp.js
 */

const mongoose = require('mongoose');

const MONGO_URI =
  process.env.MONGODB_URI ??
  'mongodb://training-tracker:MIcJjqiXoIl6HUSQ@ac-sxtovbd-shard-00-00.piz32f2.mongodb.net:27017,ac-sxtovbd-shard-00-01.piz32f2.mongodb.net:27017,ac-sxtovbd-shard-00-02.piz32f2.mongodb.net:27017/training-tracker-prod?replicaSet=atlas-cknx67-shard-0&ssl=true&authSource=admin';

const VERIFICATION_XP = 50;
const SOURCE_TYPE = 'verification';

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;
  const usersCol = db.collection('users');
  const xpCol = db.collection('user_xp');
  const txnCol = db.collection('xp_transactions');

  const verifiedUsers = await usersCol
    .find({ isVerified: true })
    .project({ _id: 1, codeforcesHandle: 1 })
    .toArray();

  console.log('Found ' + verifiedUsers.length + ' verified users.');

  let awarded = 0;
  let alreadyDone = 0;

  for (const user of verifiedUsers) {
    const userId = user._id;

    // Check if verification XP transaction already exists
    const existingTxn = await txnCol.findOne({
      userId,
      sourceType: SOURCE_TYPE,
      sourceId: userId,
    });

    if (existingTxn) {
      // Transaction exists — just make sure user_xp is correct
      const xpDoc = await xpCol.findOne({ userId });
      const currentXp = xpDoc?.totalXp ?? 0;

      // Count all transactions sum for this user
      const txnSum = await txnCol
        .aggregate([
          { $match: { userId } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .toArray();

      const expectedXp = txnSum.length > 0 ? txnSum[0].total : 0;

      if (currentXp !== expectedXp) {
        // XP is out of sync — fix it
        await xpCol.findOneAndUpdate(
          { userId },
          { $set: { totalXp: expectedXp } },
          { upsert: true },
        );
        console.log('  Fixed XP for ' + user.codeforcesHandle + ': ' + currentXp + ' → ' + expectedXp);
        awarded++;
      } else {
        alreadyDone++;
      }
      continue;
    }

    // No transaction yet — create one and award XP
    await txnCol.insertOne({
      userId,
      amount: VERIFICATION_XP,
      reason: 'Codeforces profile verification',
      sourceType: SOURCE_TYPE,
      sourceId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await xpCol.findOneAndUpdate(
      { userId },
      { $inc: { totalXp: VERIFICATION_XP } },
      { upsert: true },
    );

    awarded++;
    console.log('  +' + VERIFICATION_XP + ' XP → ' + user.codeforcesHandle);
  }

  console.log('\nDone. Updated: ' + awarded + ', Already correct: ' + alreadyDone);
  await mongoose.disconnect();
}

run().catch(function (err) {
  console.error('Migration failed:', err);
  process.exit(1);
});

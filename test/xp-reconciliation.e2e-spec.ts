import { reconcileHistoricalXp } from '../src/common/database/xp-reconciliation';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createConnection, Connection, Types } from 'mongoose';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  statSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

jest.setTimeout(120_000);

describe('historical XP reconciliation (isolated replica set)', () => {
  let mongo: MongoMemoryReplSet;
  let db: Connection;
  let directory: string;
  let uri: string;
  const run = (apply = true, backup = directory) =>
    spawnSync(
      process.execPath,
      [
        resolve(__dirname, '../scripts/reconcile-xp.cjs'),
        ...(apply ? ['--apply'] : []),
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          MONGODB_URI_TEST: uri,
          XP_RECONCILIATION_BACKUP_DIR: backup,
        },
      },
    );

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = mongo.getUri('xp_reconciliation_test');
    if (!uri.startsWith('mongodb://127.0.0.1:'))
      throw new Error('Non-disposable database');
    db = await createConnection(uri).asPromise();
    await db
      .collection('xp_transactions')
      .createIndex({ userId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
  });
  afterAll(async () => {
    await db?.close();
    await mongo?.stop();
  });
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'upsolve-xp-test-'));
    for (const name of ['users', 'user_xp', 'xp_transactions'])
      await db.collection(name).deleteMany({});
    for (const [balance, ledger] of [
      [500, 340],
      [1330, 1380],
      [720, 700],
    ]) {
      const userId = new Types.ObjectId();
      await db.collection('users').insertOne({ _id: userId });
      await db.collection('user_xp').insertOne({
        userId,
        totalXp: balance,
        updatedAt: new Date('2026-01-01'),
      });
      await db.collection('xp_transactions').insertOne({
        userId,
        amount: ledger,
        sourceType: 'problem',
        sourceId: new Types.ObjectId(),
      });
    }
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('preserves balances and old entries, backs up originals, and applies once', async () => {
    const before = await db.collection('user_xp').find().toArray();
    const oldEntries = await db.collection('xp_transactions').find().toArray();
    const result = run();
    expect({ status: result.status, error: result.stderr }).toEqual({
      status: 0,
      error: '',
    });
    expect(JSON.parse(result.stdout).reconciled).toBe(3);
    for (const original of before) {
      const current = await db
        .collection('user_xp')
        .findOne({ _id: original._id });
      expect(current?.totalXp).toBe(original.totalXp);
      expect(current?.updatedAt).toEqual(original.updatedAt);
      const ledger = await db
        .collection('xp_transactions')
        .find({ userId: original.userId })
        .toArray();
      expect(ledger.reduce((sum, entry) => sum + entry.amount, 0)).toBe(
        original.totalXp,
      );
    }
    for (const original of oldEntries)
      expect(
        await db.collection('xp_transactions').findOne({ _id: original._id }),
      ).toEqual(original);
    const backups = readdirSync(directory);
    expect(backups.length).toBeGreaterThan(0);
    expect(statSync(join(directory, backups[0])).mode & 0o777).toBe(0o600);
    expect(JSON.parse(run().stdout).reconciled).toBe(0);
    expect(await db.collection('xp_transactions').countDocuments()).toBe(6);
  });
  it('dry runs and backup failures make no changes', async () => {
    expect(run(false).status).toBe(0);
    const badPath = join(directory, 'file');
    writeFileSync(badPath, 'not a directory');
    expect(run(true, badPath).status).toBe(1);
    expect(await db.collection('xp_transactions').countDocuments()).toBe(3);
    expect(
      await db
        .collection('user_xp')
        .countDocuments({ ledgerReconciledAt: { $exists: true } }),
    ).toBe(0);
  });
  it('rolls back every adjustment if a later write fails', async () => {
    const balances = await db.collection('user_xp').find().toArray();
    await db.db!.command({
      collMod: 'xp_transactions',
      validator: {
        $or: [
          { sourceType: { $ne: 'historical_balance_reconciliation' } },
          { userId: { $ne: balances[1].userId } },
        ],
      },
    });
    try {
      expect(run().status).toBe(1);
      expect(await db.collection('xp_transactions').countDocuments()).toBe(3);
      expect(
        await db
          .collection('user_xp')
          .countDocuments({ ledgerReconciledAt: { $exists: true } }),
      ).toBe(0);
    } finally {
      await db.db!.command({ collMod: 'xp_transactions', validator: {} });
    }
  });
  it('retries a concurrent award without changing or losing earned XP', async () => {
    const balance = await db.collection('user_xp').findOne({ totalXp: 500 });
    let backedUp = 0;
    const reconciled = await reconcileHistoricalXp(db, async () => {
      if (++backedUp !== 1) return;
      const awardSession = await db.startSession();
      try {
        await awardSession.withTransaction(async () => {
          await db
            .collection('user_xp')
            .updateOne(
              { _id: balance!._id },
              { $inc: { totalXp: 10 } },
              { session: awardSession },
            );
          await db
            .collection('xp_transactions')
            .insertOne(
              {
                userId: balance!.userId,
                amount: 10,
                sourceType: 'problem',
                sourceId: new Types.ObjectId(),
              },
              { session: awardSession },
            );
        });
      } finally {
        await awardSession.endSession();
      }
    });
    expect(reconciled).toBe(3);
    expect(backedUp).toBeGreaterThan(1);
    expect(
      (await db.collection('user_xp').findOne({ _id: balance!._id }))?.totalXp,
    ).toBe(510);
    const ledger = await db
      .collection('xp_transactions')
      .find({ userId: balance!.userId })
      .toArray();
    expect(ledger.reduce((sum, entry) => sum + entry.amount, 0)).toBe(510);
  });

  it('refuses to hide a new discrepancy after historical reconciliation', async () => {
    expect(run().status).toBe(0);
    await db
      .collection('user_xp')
      .updateOne({ totalXp: 500 }, { $inc: { totalXp: 1 } });
    expect(run().status).toBe(1);
    expect(await db.collection('xp_transactions').countDocuments()).toBe(6);
  });
});

import { Connection, mongo } from 'mongoose';

export const HISTORICAL_RECONCILIATION_SOURCE =
  'historical_balance_reconciliation';

type Snapshot = {
  balance: mongo.WithId<mongo.Document>;
  ledger: mongo.WithId<mongo.Document>[];
  ledgerTotal: number;
  adjustment: number;
};

export async function inspectXpBalances(
  connection: Connection,
  session?: mongo.ClientSession,
): Promise<Snapshot[]> {
  const results: Snapshot[] = [];
  for (const balance of await connection
    .collection('user_xp')
    .find({}, { session })
    .toArray()) {
    const ledger = await connection
      .collection('xp_transactions')
      .find({ userId: balance.userId }, { session })
      .toArray();
    if (
      !Number.isSafeInteger(balance.totalXp) ||
      balance.totalXp < 0 ||
      ledger.some((entry) => !Number.isSafeInteger(entry.amount))
    ) {
      throw new Error(
        'Historical XP has invalid numeric values; manual review required',
      );
    }
    const ledgerTotal = ledger.reduce(
      (sum, entry) => sum + Number(entry.amount),
      0,
    );
    const adjustment = Number(balance.totalXp) - ledgerTotal;
    if (!Number.isSafeInteger(ledgerTotal) || !Number.isSafeInteger(adjustment))
      throw new Error('Historical XP exceeds safe numeric limits');
    if (!adjustment) continue;
    if (
      !(balance.userId instanceof mongo.ObjectId) ||
      !(await connection
        .collection('users')
        .findOne({ _id: balance.userId }, { session }))
    ) {
      throw new Error('Historical XP account reference requires manual review');
    }
    if (
      ledger.some(
        (entry) => entry.sourceType === HISTORICAL_RECONCILIATION_SOURCE,
      )
    ) {
      throw new Error(
        'Previously reconciled historical XP differs again; investigate instead of masking it',
      );
    }
    results.push({ balance, ledger, ledgerTotal, adjustment });
  }
  return results;
}

/** Preserve account totals. This records bookkeeping differences, never inferred earned XP. */
export async function reconcileHistoricalXp(
  connection: Connection,
  backup: (snapshots: Snapshot[]) => void | Promise<void>,
) {
  const session = await connection.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const snapshots = await inspectXpBalances(connection, session);
        if (!snapshots.length) return 0;
        await backup(snapshots); // Must succeed before the first database write, including retries.
        const now = new Date();
        for (const snapshot of snapshots) {
          // A real write on the balance serializes this operation with normal transactional XP awards.
          await connection
            .collection('user_xp')
            .updateOne(
              { _id: snapshot.balance._id },
              { $set: { ledgerReconciledAt: now } },
              { session },
            );
          await connection.collection('xp_transactions').insertOne(
            {
              userId: snapshot.balance.userId,
              amount: snapshot.adjustment,
              sourceType: HISTORICAL_RECONCILIATION_SOURCE,
              sourceId: snapshot.balance._id,
              reason:
                'Historical balance reconciliation; original earning history unavailable',
              reconciliation: {
                preservedBalance: snapshot.balance.totalXp,
                previousLedgerTotal: snapshot.ledgerTotal,
              },
              createdAt: now,
              updatedAt: now,
            },
            { session },
          );
        }
        return snapshots.length;
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  } finally {
    await session.endSession();
  }
}

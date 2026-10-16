import { Injectable, Module } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TransactionsModule,
  TransactionsService,
} from '../../common/database/transactions.module';
import { UserXp, UserXpSchema } from '../roadmap/schemas/user-xp.schema';
import {
  XpTransaction,
  XpTransactionSchema,
} from '../roadmap/schemas/xp-transaction.schema';

@Injectable()
export class XpService {
  constructor(
    @InjectModel(UserXp.name) private readonly balances: Model<UserXp>,
    @InjectModel(XpTransaction.name)
    private readonly ledger: Model<XpTransaction>,
    private readonly transactions: TransactionsService,
  ) {}

  run<T>(work: () => Promise<T>) {
    return this.transactions.run(work);
  }

  award(
    userId: string,
    amount: number,
    reason: string,
    sourceType: string,
    sourceId: Types.ObjectId,
  ) {
    return this.run(async () => {
      if (!Number.isFinite(amount) || amount <= 0) return 0;
      const filter = {
        userId: new Types.ObjectId(userId),
        sourceType,
        sourceId,
      };
      if (await this.ledger.exists(filter)) return 0;
      await this.ledger.create({ ...filter, amount, reason });
      await this.balances.findOneAndUpdate(
        { userId: filter.userId },
        { $inc: { totalXp: amount } },
        { upsert: true },
      );
      return amount;
    });
  }

  revoke(userId: Types.ObjectId, sourceType: string, sourceId: Types.ObjectId) {
    return this.run(async () => {
      const entry = await this.ledger.findOneAndDelete({
        userId,
        sourceType,
        sourceId,
      });
      if (!entry) return 0;
      await this.balances.updateOne(
        { userId },
        [
          {
            $set: {
              totalXp: {
                $max: [
                  0,
                  { $subtract: [{ $ifNull: ['$totalXp', 0] }, entry.amount] },
                ],
              },
            },
          },
        ],
        { updatePipeline: true },
      );
      return entry.amount;
    });
  }
}

@Module({
  imports: [
    TransactionsModule,
    MongooseModule.forFeature([
      { name: UserXp.name, schema: UserXpSchema },
      { name: XpTransaction.name, schema: XpTransactionSchema },
    ]),
  ],
  providers: [XpService],
  exports: [XpService],
})
export class XpModule {}

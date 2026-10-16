import { Injectable, Module } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Connection } from 'mongoose';

@Injectable()
export class TransactionsService {
  private readonly active = new AsyncLocalStorage<boolean>();

  constructor(@InjectConnection() private readonly connection: Connection) {
    // Mongoose propagates the session to queries, document saves and bulk writes.
    this.connection.base.set('transactionAsyncLocalStorage', true);
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active.getStore()) return work();
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.connection.transaction(() =>
          this.active.run(true, work),
        );
      } catch (error) {
        // Concurrent first-time upserts can hit a unique index before MongoDB
        // labels the conflict transient. Retry the entire aborted transaction.
        if (attempt >= 4 || (error as { code?: number })?.code !== 11000)
          throw error;
      }
    }
  }
}

@Module({ providers: [TransactionsService], exports: [TransactionsService] })
export class TransactionsModule {}

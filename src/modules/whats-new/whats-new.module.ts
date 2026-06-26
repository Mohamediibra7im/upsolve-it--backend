import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsNewController } from './whats-new.controller';
import { WhatsNewService } from './whats-new.service';
import {
  WhatsNewEntry,
  WhatsNewEntrySchema,
} from './schemas/whats-new-entry.schema';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    AdminModule,
    MongooseModule.forFeature([
      { name: WhatsNewEntry.name, schema: WhatsNewEntrySchema },
    ]),
  ],
  controllers: [WhatsNewController],
  providers: [WhatsNewService],
})
export class WhatsNewModule {}

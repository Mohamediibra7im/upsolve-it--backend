import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import {
  TrainingLevel,
  TrainingLevelSchema,
} from './schemas/training-level.schema';
import { TrainingLevelsService } from './training-levels.service';
import { TrainingLevelsController } from './training-levels.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrainingLevel.name, schema: TrainingLevelSchema },
    ]),
    AuditLogsModule,
  ],
  controllers: [TrainingLevelsController],
  providers: [TrainingLevelsService],
  exports: [TrainingLevelsService],
})
export class TrainingLevelsModule {}

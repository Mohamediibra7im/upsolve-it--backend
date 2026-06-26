import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserStatsService } from './user-stats.service';
import {
  UserStats,
  UserStatsSchema,
} from '../trainings/schemas/user-stats.schema';
import { Training, TrainingSchema } from '../trainings/schemas/training.schema';
import {
  UpsolvedProblem,
  UpsolvedProblemSchema,
} from '../upsolve/schemas/upsolved-problem.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserStats.name, schema: UserStatsSchema },
      { name: Training.name, schema: TrainingSchema },
      { name: UpsolvedProblem.name, schema: UpsolvedProblemSchema },
    ]),
  ],
  providers: [UserStatsService],
  exports: [UserStatsService],
})
export class UserStatsModule {}

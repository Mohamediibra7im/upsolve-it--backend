import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ContactModule } from '../contact/contact.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Training, TrainingSchema } from '../trainings/schemas/training.schema';
import {
  UpsolvedProblem,
  UpsolvedProblemSchema,
} from '../upsolve/schemas/upsolved-problem.schema';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { TrainingLevelsModule } from '../training-levels/training-levels.module';
import {
  RoadmapLevel,
  RoadmapLevelSchema,
} from '../roadmap/schemas/roadmap-level.schema';
import { UserXp, UserXpSchema } from '../roadmap/schemas/user-xp.schema';
import {
  UserLevelProgress,
  UserLevelProgressSchema,
} from '../roadmap/schemas/user-level-progress.schema';
import {
  UserTopicProgress,
  UserTopicProgressSchema,
} from '../roadmap/schemas/user-topic-progress.schema';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
    TrainingLevelsModule,
    ContactModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Training.name, schema: TrainingSchema },
      { name: UpsolvedProblem.name, schema: UpsolvedProblemSchema },
      { name: RoadmapLevel.name, schema: RoadmapLevelSchema },
      { name: UserXp.name, schema: UserXpSchema },
      { name: UserLevelProgress.name, schema: UserLevelProgressSchema },
      { name: UserTopicProgress.name, schema: UserTopicProgressSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

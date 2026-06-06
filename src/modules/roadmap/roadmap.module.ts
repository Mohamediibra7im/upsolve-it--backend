import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from '../admin/admin.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  RoadmapLevel,
  RoadmapLevelSchema,
} from './schemas/roadmap-level.schema';
import {
  RoadmapTopic,
  RoadmapTopicSchema,
} from './schemas/roadmap-topic.schema';
import {
  RoadmapResource,
  RoadmapResourceSchema,
} from './schemas/roadmap-resource.schema';
import {
  RoadmapProblem,
  RoadmapProblemSchema,
} from './schemas/roadmap-problem.schema';
import {
  UserResourceProgress,
  UserResourceProgressSchema,
} from './schemas/user-resource-progress.schema';
import {
  UserProblemProgress,
  UserProblemProgressSchema,
} from './schemas/user-problem-progress.schema';
import {
  UserTopicProgress,
  UserTopicProgressSchema,
} from './schemas/user-topic-progress.schema';
import {
  UserLevelProgress,
  UserLevelProgressSchema,
} from './schemas/user-level-progress.schema';
import { UserXp, UserXpSchema } from './schemas/user-xp.schema';
import {
  XpTransaction,
  XpTransactionSchema,
} from './schemas/xp-transaction.schema';
import { RoadmapAdminController } from './roadmap-admin.controller';
import { RoadmapAdminService } from './roadmap-admin.service';
import { RoadmapPublicController } from './roadmap-public.controller';
import { RoadmapPublicService } from './roadmap-public.service';
import { RoadmapProgressService } from './roadmap-progress.service';

@Module({
  imports: [
    AuthModule,
    AdminModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RoadmapLevel.name, schema: RoadmapLevelSchema },
      { name: RoadmapTopic.name, schema: RoadmapTopicSchema },
      { name: RoadmapResource.name, schema: RoadmapResourceSchema },
      { name: RoadmapProblem.name, schema: RoadmapProblemSchema },
      { name: UserResourceProgress.name, schema: UserResourceProgressSchema },
      { name: UserProblemProgress.name, schema: UserProblemProgressSchema },
      { name: UserTopicProgress.name, schema: UserTopicProgressSchema },
      { name: UserLevelProgress.name, schema: UserLevelProgressSchema },
      { name: UserXp.name, schema: UserXpSchema },
      { name: XpTransaction.name, schema: XpTransactionSchema },
    ]),
  ],
  controllers: [RoadmapAdminController, RoadmapPublicController],
  providers: [
    RoadmapAdminService,
    RoadmapPublicService,
    RoadmapProgressService,
  ],
  exports: [RoadmapAdminService, RoadmapPublicService, RoadmapProgressService],
})
export class RoadmapModule {}

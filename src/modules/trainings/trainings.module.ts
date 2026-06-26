import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { TrainingsController } from './trainings.controller';
import { TrainingSessionsController } from './training-sessions.controller';
import { UsersMeController } from './users-me.controller';
import { TrainingsService } from './trainings.service';
import { TrainingSessionsService } from './training-sessions.service';
import { Training, TrainingSchema } from './schemas/training.schema';
import { UserStatsModule } from '../user-stats/user-stats.module';
import { UpsolveModule } from '../upsolve/upsolve.module';

@Module({
  imports: [
    AuthModule,
    UserStatsModule,
    forwardRef(() => UpsolveModule),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Training.name, schema: TrainingSchema },
    ]),
  ],
  controllers: [
    TrainingsController,
    TrainingSessionsController,
    UsersMeController,
  ],
  providers: [TrainingsService, TrainingSessionsService],
  exports: [TrainingsService],
})
export class TrainingsModule {}

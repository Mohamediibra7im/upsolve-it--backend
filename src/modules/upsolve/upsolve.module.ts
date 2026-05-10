import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { UpsolveController } from './upsolve.controller';
import { UpsolveService } from './upsolve.service';
import {
  UpsolvedProblem,
  UpsolvedProblemSchema,
} from './schemas/upsolved-problem.schema';
import {
  DismissedUpsolve,
  DismissedUpsolveSchema,
} from './schemas/dismissed-upsolve.schema';
import { UserStatsModule } from '../user-stats/user-stats.module';

@Module({
  imports: [
    AuthModule,
    UserStatsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UpsolvedProblem.name, schema: UpsolvedProblemSchema },
      { name: DismissedUpsolve.name, schema: DismissedUpsolveSchema },
    ]),
  ],
  controllers: [UpsolveController],
  providers: [UpsolveService],
  exports: [UpsolveService],
})
export class UpsolveModule {}


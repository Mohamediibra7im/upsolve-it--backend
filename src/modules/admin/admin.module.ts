import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Training, TrainingSchema } from '../trainings/schemas/training.schema';
import {
  UpsolvedProblem,
  UpsolvedProblemSchema,
} from '../upsolve/schemas/upsolved-problem.schema';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Training.name, schema: TrainingSchema },
      { name: UpsolvedProblem.name, schema: UpsolvedProblemSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

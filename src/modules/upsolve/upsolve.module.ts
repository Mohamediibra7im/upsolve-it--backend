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

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UpsolvedProblem.name, schema: UpsolvedProblemSchema },
    ]),
  ],
  controllers: [UpsolveController],
  providers: [UpsolveService],
})
export class UpsolveModule {}

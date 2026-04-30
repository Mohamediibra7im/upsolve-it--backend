import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { TrainingsController } from './trainings.controller';
import { TrainingsService } from './trainings.service';
import { Training, TrainingSchema } from './schemas/training.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Training.name, schema: TrainingSchema },
    ]),
  ],
  controllers: [TrainingsController],
  providers: [TrainingsService],
})
export class TrainingsModule {}

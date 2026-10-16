import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import {
  Training,
  type TrainingDocument,
  type TrainingProblemStored,
} from './schemas/training.schema';
import { isProblemMarkedSolved } from './utils/problem-solved';
import { UserStatsService } from '../user-stats/user-stats.service';
import { ensureProblemIds } from './utils/problem-ids';
import { computeSessionPerformance } from './utils/session-performance';
import { UpsolveService } from '../upsolve/upsolve.service';
import { TransactionsService } from '../../common/database/transactions.module';

@Injectable()
export class TrainingsService {
  constructor(
    private readonly auth: AuthService,
    private readonly transactions: TransactionsService,
    private readonly upsolve: UpsolveService,
    private readonly userStats: UserStatsService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
  ) {}

  async createTraining(userId: string, body: Record<string, any>) {
    return this.transactions.run(async () => {
      const rest = { ...body };
      delete rest._id;
      delete rest.user;
      const problems = ensureProblemIds(
        rest.problems as TrainingProblemStored[],
      );
      const solvedCount = problems.filter((p) =>
        isProblemMarkedSolved(p),
      ).length;

      const durationMinutes =
        rest.durationMinutes ??
        (rest.endTime && rest.startTime
          ? Math.max(1, Math.round((rest.endTime - rest.startTime) / 60000))
          : 120);

      const user = await this.userModel.findById(userId);
      if (!user) throw new NotFoundException('User not found');
      const rating = user.rating ?? 1500;
      const performance =
        solvedCount === 0
          ? rating
          : computeSessionPerformance(
              {
                startTime: Number(rest.startTime),
                endTime: Number(rest.endTime),
                customRatings: rest.customRatings as Training['customRatings'],
                problems,
              },
              rating,
            );
      const doc = await this.trainingModel.create({
        ...rest,
        user: userId,
        problems,
        trainingMode: rest.trainingMode ?? 'ladder',
        status: rest.status ?? 'completed',
        durationMinutes,
        level: rest.level ?? '',
        showRatings: rest.showRatings !== false,
        reviewGenerated: rest.reviewGenerated ?? true,
        solvedCount,
        performance,
        tagsFilter: rest.tagsFilter ?? rest.tags ?? [],
        weaknessFallback: rest.weaknessFallback ?? false,
      });

      const status = doc.status ?? 'completed';
      if (status === 'completed') {
        await this.upsolve.insertMany(
          userId,
          problems
            .filter((p) => !isProblemMarkedSolved(p))
            .map((p) => ({ ...p, solvedTime: null })),
        );
        await this.userStats.recordTrainingCompleted(userId, doc.endTime);
      }
      return doc;
    });
  }

  async listTrainings(userId: string) {
    return await this.trainingModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ startTime: -1 });
  }

  async deleteTraining(userId: string, trainingId: string) {
    if (!Types.ObjectId.isValid(trainingId)) {
      throw new NotFoundException('Training not found');
    }
    const doc = await this.trainingModel.findOneAndDelete({
      _id: trainingId,
      user: new Types.ObjectId(userId),
    });
    if (!doc) throw new NotFoundException('Training not found');
    return { ok: true };
  }
}

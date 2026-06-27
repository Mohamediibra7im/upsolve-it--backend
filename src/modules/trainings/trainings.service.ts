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

function ensureProblemIds(problems: unknown[] | undefined) {
  return (problems ?? []).map((p: any) => ({
    ...p,
    problemId: p.problemId ?? `${p.contestId}_${p.index}`,
  }));
}

@Injectable()
export class TrainingsService {
  constructor(
    private readonly auth: AuthService,
    private readonly userStats: UserStatsService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
  ) {}

  async getUserFromAuthHeader(authHeader?: string, accessTokenCookie?: string) {
    return this.auth.getUserFromAuthHeader(authHeader, accessTokenCookie);
  }

  async createTraining(userId: string, body: Record<string, any>) {
    const rest = { ...body };
    delete rest._id;
    delete rest.user;
    const problems = ensureProblemIds(rest.problems as unknown[]);
    const solvedCount =
      rest.solvedCount ??
      problems.filter((p) => isProblemMarkedSolved(p as TrainingProblemStored))
        .length;

    const durationMinutes =
      rest.durationMinutes ??
      (rest.endTime && rest.startTime
        ? Math.max(1, Math.round((rest.endTime - rest.startTime) / 60000))
        : 120);

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
      tagsFilter: rest.tagsFilter ?? rest.tags ?? [],
      weaknessFallback: rest.weaknessFallback ?? false,
    });

    const status = doc.status ?? 'completed';
    if (status === 'completed') {
      await this.userStats.recordTrainingCompleted(userId, doc.endTime);
    }
    return doc;
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

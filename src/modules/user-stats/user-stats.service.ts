import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  UserStats,
  type UserStatsDocument,
} from '../trainings/schemas/user-stats.schema';
import { Training, type TrainingDocument } from '../trainings/schemas/training.schema';
import {
  UpsolvedProblem,
  type UpsolvedProblemDocument,
} from '../upsolve/schemas/upsolved-problem.schema';
import { applyActivityToStreak } from '../trainings/utils/streak-logic';
import { toUtcDayKey } from '../trainings/utils/date-key';

@Injectable()
export class UserStatsService {
  constructor(
    @InjectModel(UserStats.name)
    private readonly userStatsModel: Model<UserStatsDocument>,
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
    @InjectModel(UpsolvedProblem.name)
    private readonly upsolveModel: Model<UpsolvedProblemDocument>,
  ) {}

  async getOrCreate(userId: string): Promise<UserStatsDocument> {
    const id = new Types.ObjectId(userId);
    let doc = await this.userStatsModel.findOne({ user: id });
    if (!doc) {
      doc = await this.userStatsModel.create({ user: id });
    }
    return doc;
  }

  async recordTrainingCompleted(userId: string, atMs: number = Date.now()) {
    const doc = await this.getOrCreate(userId);
    const upd = applyActivityToStreak(
      {
        currentStreak: doc.trainingStreak,
        bestStreak: doc.bestTrainingStreak,
        lastActivityDayKey: doc.lastTrainingActivityDate,
      },
      atMs,
    );
    doc.trainingStreak = upd.streak;
    doc.bestTrainingStreak = upd.best;
    doc.lastTrainingActivityDate = upd.lastDayKey;
    this.appendActiveDay(doc, upd.lastDayKey);
    await this.recomputeConsistency(userId, doc);
    await doc.save();
  }

  async recordUpsolveSolved(userId: string, atMs: number = Date.now()) {
    const doc = await this.getOrCreate(userId);
    const upd = applyActivityToStreak(
      {
        currentStreak: doc.upsolveStreak,
        bestStreak: doc.bestUpsolveStreak,
        lastActivityDayKey: doc.lastUpsolveActivityDate,
      },
      atMs,
    );
    doc.upsolveStreak = upd.streak;
    doc.bestUpsolveStreak = upd.best;
    doc.lastUpsolveActivityDate = upd.lastDayKey;
    this.appendActiveDay(doc, upd.lastDayKey);
    await this.recomputeConsistency(userId, doc);
    await doc.save();
  }

  private appendActiveDay(doc: UserStatsDocument, dayKey: string) {
    const set = new Set(doc.activeDays ?? []);
    set.add(dayKey);
    doc.activeDays = Array.from(set).sort().slice(-60);
  }

  private async recomputeConsistency(
    userId: string,
    doc: UserStatsDocument,
  ) {
    const now = Date.now();
    const dayMs = 86_400_000;
    const startWindow = now - 7 * dayMs;
    const days = new Set<string>();

    const trainings = await this.trainingModel
      .find({
        user: new Types.ObjectId(userId),
        $or: [
          { status: 'completed' },
          { status: { $exists: false } },
        ],
        endTime: { $gte: startWindow },
      })
      .select('endTime')
      .lean();

    for (const t of trainings) {
      if (t.endTime) days.add(toUtcDayKey(t.endTime));
    }

    const ups = await this.upsolveModel
      .find({
        user: new Types.ObjectId(userId),
        solvedTime: { $ne: null, $gte: startWindow },
      })
      .select('solvedTime')
      .lean();

    for (const u of ups) {
      if (u.solvedTime) days.add(toUtcDayKey(u.solvedTime));
    }

    let activeInLast7 = 0;
    for (let i = 0; i < 7; i++) {
      const k = toUtcDayKey(now - i * dayMs);
      if (days.has(k)) activeInLast7++;
    }

    doc.consistencyScore = Math.round((activeInLast7 / 7) * 100);
  }

  async getStreakPayload(userId: string) {
    const doc = await this.getOrCreate(userId);
    await this.recomputeConsistency(userId, doc);
    await doc.save();
    return {
      trainingStreak: doc.trainingStreak,
      upsolveStreak: doc.upsolveStreak,
      bestTrainingStreak: doc.bestTrainingStreak,
      bestUpsolveStreak: doc.bestUpsolveStreak,
      bestStreak: Math.max(doc.bestTrainingStreak, doc.bestUpsolveStreak),
      consistencyScore: doc.consistencyScore,
      lastTrainingActivityDate: doc.lastTrainingActivityDate,
      lastUpsolveActivityDate: doc.lastUpsolveActivityDate,
      activeDays: doc.activeDays ?? [],
    };
  }
}

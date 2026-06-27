import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import {
  Training,
  type TrainingDocument,
  type TrainingMode,
  type TrainingProblemStored,
} from './schemas/training.schema';
import { expectedTimeSecondsFromRating } from './utils/expected-time';
import { computeSpeedStatus, type SpeedStatus } from './utils/speed-status';
import { buildInsightAndRecommendation } from './utils/insights';
import { computeSessionPerformance } from './utils/session-performance';
import { UserStatsService } from '../user-stats/user-stats.service';
import { UpsolveService } from '../upsolve/upsolve.service';
import { topWeakTags, type TagAgg } from './utils/weakness';
import { isProblemMarkedSolved } from './utils/problem-solved';

function makeProblemId(c: number, i: string): string {
  return `${c}_${i}`;
}

function ensureProblemIds(
  problems: TrainingProblemStored[],
): TrainingProblemStored[] {
  return (problems ?? []).map((p) => ({
    ...p,
    problemId: p.problemId || makeProblemId(p.contestId, p.index),
  }));
}

@Injectable()
export class TrainingSessionsService {
  constructor(
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly userStats: UserStatsService,
    private readonly upsolve: UpsolveService,
  ) {}

  async createSession(userId: string, body: Record<string, unknown>) {
    const problems = ensureProblemIds(
      (body.problems as TrainingProblemStored[]) ?? [],
    ).map((p) => this.withExpectedDefaults(p));

    const doc = await this.trainingModel.create({
      user: new Types.ObjectId(userId),
      startTime: body.startTime as number,
      endTime: body.endTime as number,
      customRatings: body.customRatings as Training['customRatings'],
      problems,
      performance: 0,
      trainingMode: (body.trainingMode as TrainingMode) ?? 'ladder',
      level: (body.level as string) ?? '',
      durationMinutes: Number(body.durationMinutes ?? 120),
      status: 'active',
      solvedCount: 0,
      reviewGenerated: false,
      showRatings: body.showRatings !== false,
      tagsFilter: (body.tags as string[]) ?? [],
      weaknessFallback: Boolean(body.weaknessFallback),
    });

    return doc;
  }

  private withExpectedDefaults(
    p: TrainingProblemStored,
  ): TrainingProblemStored {
    const rating = p.rating ?? 0;
    const expected = expectedTimeSecondsFromRating(rating);
    return {
      ...p,
      problemId: p.problemId || makeProblemId(p.contestId, p.index),
      expectedTimeSeconds: p.expectedTimeSeconds ?? expected,
      speedStatus: p.speedStatus ?? 'unsolved',
      attempts: p.attempts ?? 0,
      isSolved: p.isSolved ?? false,
      tags: p.tags ?? [],
    };
  }

  async markProblemStart(
    userId: string,
    sessionId: string,
    problemId: string,
    atMs?: number,
  ) {
    const session = await this.requireOwnedSession(userId, sessionId);
    const now = atMs ?? Date.now();
    const idx = session.problems.findIndex((p) => p.problemId === problemId);
    if (idx < 0) throw new BadRequestException('Unknown problem');
    if (session.problems[idx].startedAt != null) {
      return session;
    }
    session.problems[idx].startedAt = now;
    session.markModified('problems');
    await session.save();
    return session;
  }

  async syncSession(
    userId: string,
    sessionId: string,
    body: { problemUpdates?: Record<string, Partial<TrainingProblemStored>> },
  ) {
    const session = await this.requireOwnedSession(userId, sessionId);
    const updates = body.problemUpdates ?? {};
    for (const p of session.problems) {
      const u = updates[p.problemId];
      if (!u) continue;
      Object.assign(p, this.mergeProblemSync(session, p, u));
    }
    session.markModified('problems');
    await session.save();
    return session;
  }

  private mergeProblemSync(
    session: TrainingDocument,
    current: TrainingProblemStored,
    incoming: Partial<TrainingProblemStored>,
  ): TrainingProblemStored {
    const start = current.startedAt ?? incoming.startedAt ?? session.startTime;
    const solvedAt =
      incoming.solvedAt ?? current.solvedAt ?? current.solvedTime;
    const isSolved = Boolean(
      incoming.isSolved ??
      current.isSolved ??
      (solvedAt != null && solvedAt > 0),
    );
    const attempts = incoming.attempts ?? current.attempts ?? 0;
    const expected =
      current.expectedTimeSeconds ??
      expectedTimeSecondsFromRating(current.rating ?? 0);
    let timeSpent: number | null =
      incoming.timeSpentSeconds ?? current.timeSpentSeconds ?? null;
    if (isSolved && solvedAt != null) {
      timeSpent = Math.max(0, Math.round((solvedAt - start) / 1000));
    }
    const speed = computeSpeedStatus(Boolean(isSolved), timeSpent, expected);
    return {
      ...current,
      ...incoming,
      attempts,
      isSolved,
      solvedAt: solvedAt ?? undefined,
      solvedTime: solvedAt ?? current.solvedTime ?? null,
      timeSpentSeconds: timeSpent,
      expectedTimeSeconds: expected,
      speedStatus: speed,
    };
  }

  async endSession(
    userId: string,
    sessionId: string,
    body: {
      endTime?: number;
      problemUpdates?: Record<string, Partial<TrainingProblemStored>>;
    },
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const userRating = user.rating ?? 1500;

    const session = await this.requireOwnedSession(userId, sessionId);
    const endTime = body.endTime ?? Date.now();
    session.endTime = endTime;

    const updates = body.problemUpdates ?? {};
    for (const p of session.problems) {
      const u = updates[p.problemId];
      let next: TrainingProblemStored = { ...p };
      if (u) {
        next = this.mergeProblemSync(session, p, u);
      }
      next = this.finalizeProblem(session, next);
      const insight = buildInsightAndRecommendation({
        isSolved: isProblemMarkedSolved(next),
        speedStatus: (next.speedStatus as SpeedStatus) ?? 'unsolved',
        problemRating: next.rating ?? 0,
        userRating,
        attempts: next.attempts ?? 0,
      });
      next.insightMessage = insight.insightMessage;
      next.recommendation = insight.recommendation;
      Object.assign(p, next);
    }

    session.solvedCount = session.problems.filter(isProblemMarkedSolved).length;
    // ponytail: 0-solve sessions get neutral performance (user's rating).
    // computeSessionPerformance penalizes unsolved problems and produces
    // ~600 for 0 solves, which drags down averages on abandoned sessions.
    if (session.solvedCount === 0) {
      session.performance = userRating;
    } else {
      session.performance = computeSessionPerformance(
        {
          startTime: session.startTime,
          endTime: session.endTime,
          customRatings: session.customRatings,
          problems: session.problems,
        },
        userRating,
      );
    }
    session.status = 'completed';
    session.reviewGenerated = true;

    // ponytail: contest modes use incremental (delta) time, not CF cumulative.
    // Each problem's time = time since previous AC (or session start for first).
    if (['ladder', 'contest'].includes(session.trainingMode)) {
      let prev = session.startTime;
      const solved = session.problems
        .filter((p) => isProblemMarkedSolved(p) && p.solvedAt != null)
        .sort((a, b) => (a.solvedAt ?? 0) - (b.solvedAt ?? 0));
      for (const p of solved) {
        const incremental = Math.max(
          0,
          Math.round(((p.solvedAt ?? prev) - prev) / 1000),
        );
        p.timeSpentSeconds = incremental;
        p.speedStatus = computeSpeedStatus(
          true,
          incremental,
          p.expectedTimeSeconds ?? expectedTimeSecondsFromRating(p.rating ?? 0),
        );
        prev = p.solvedAt ?? prev;
      }
    }

    session.markModified('problems');
    await session.save();

    const unsolved = session.problems.filter((p) => !isProblemMarkedSolved(p));
    if (unsolved.length > 0) {
      await this.upsolve.insertMany(
        userId,
        unsolved.map((p) => ({
          contestId: p.contestId,
          index: p.index,
          name: p.name,
          rating: p.rating,
          tags: p.tags,
          url: p.url,
          solvedTime: null,
        })),
      );
    }

    await this.userStats.recordTrainingCompleted(userId, endTime);
    return session;
  }

  private finalizeProblem(
    session: TrainingDocument,
    p: TrainingProblemStored,
  ): TrainingProblemStored {
    const start = p.startedAt ?? session.startTime;
    const solvedAt =
      p.solvedAt ?? (p.solvedTime != null ? p.solvedTime : undefined);
    const isSolved = Boolean(p.isSolved || (solvedAt != null && solvedAt > 0));
    const expected =
      p.expectedTimeSeconds ?? expectedTimeSecondsFromRating(p.rating ?? 0);
    let timeSpent = p.timeSpentSeconds ?? null;
    if (isSolved && solvedAt != null) {
      timeSpent = Math.max(0, Math.round((solvedAt - start) / 1000));
    }
    const speed = computeSpeedStatus(isSolved, timeSpent, expected);
    return {
      ...p,
      isSolved,
      solvedAt: solvedAt ?? undefined,
      solvedTime: solvedAt ?? p.solvedTime ?? null,
      timeSpentSeconds: timeSpent,
      expectedTimeSeconds: expected,
      speedStatus: speed,
    };
  }

  async getReview(userId: string, sessionId: string) {
    const session = await this.requireOwnedSession(userId, sessionId);
    const user = await this.userModel.findById(userId);
    const userRating = user?.rating ?? 1500;

    const contestModes: TrainingMode[] = ['ladder', 'contest'];
    const problems = session.problems ?? [];
    const totalTime = contestModes.includes(session.trainingMode)
      ? Math.round((session.endTime - session.startTime) / 1000)
      : problems.reduce((acc, p) => acc + (p.timeSpentSeconds ?? 0), 0);
    // ponytail: contest modes use session duration as totalTime.
    // Sum of per-problem CF timestamps is meaningless (each is from session start).

    const problemReviews = problems.map((p) => {
      const solvedFlag = isProblemMarkedSolved(p);
      // Always derive copy from current facts; stale DB insights showed "too easy" while status was unsolved.
      const insight = buildInsightAndRecommendation({
        isSolved: solvedFlag,
        speedStatus: (p.speedStatus as SpeedStatus) ?? 'unsolved',
        problemRating: p.rating ?? 0,
        userRating,
        attempts: p.attempts ?? 0,
      });
      return {
        problemId: p.problemId || makeProblemId(p.contestId, p.index),
        name: p.name,
        contestId: p.contestId,
        index: p.index,
        rating: p.rating,
        tags: p.tags ?? [],
        solved: solvedFlag,
        attempts: p.attempts ?? 0,
        timeSpentSeconds: p.timeSpentSeconds ?? 0,
        expectedTimeSeconds:
          p.expectedTimeSeconds ?? expectedTimeSecondsFromRating(p.rating ?? 0),
        speedStatus: p.speedStatus ?? 'unsolved',
        insightMessage: insight.insightMessage,
        recommendation: insight.recommendation,
      };
    });

    const solved = problemReviews.filter((r) => r.solved).length;
    const avgTime = solved > 0 ? Math.round(totalTime / solved) : 0;

    return {
      sessionId: String(session._id),
      summary: {
        totalProblems: problems.length,
        solvedProblems: solved,
        unsolvedProblems: problems.length - solved,
        totalTimeSpent: totalTime,
        averageTimePerProblem: avgTime,
        performanceScore: session.performance,
        trainingMode: session.trainingMode,
        durationMinutes: session.durationMinutes,
      },
      problems: problemReviews,
    };
  }

  async getWeaknesses(userId: string) {
    const user = await this.userModel.findById(userId);
    const userRating = user?.rating ?? 1500;
    const sessions = await this.trainingModel
      .find({
        user: new Types.ObjectId(userId),
        $or: [{ status: 'completed' }, { status: { $exists: false } }],
      })
      .select('problems')
      .lean();

    const byTag = new Map<string, TagAgg>();

    for (const s of sessions) {
      for (const p of s.problems ?? []) {
        const tags = p.tags ?? [];
        const solved = isProblemMarkedSolved(p);
        const slow = p.speedStatus === 'slow';
        for (const tag of tags) {
          if (!byTag.has(tag)) {
            byTag.set(tag, { unsolvedCount: 0, slowSolvedCount: 0 });
          }
          const a = byTag.get(tag)!;
          if (!solved) a.unsolvedCount++;
          else if (slow) a.slowSolvedCount++;
        }
      }
    }

    const topTags = topWeakTags(byTag, 3);
    const weakRatingRanges: { low: number; high: number; weight: number }[] =
      [];

    return {
      userRating,
      weakTags: topTags,
      weakRatingRanges,
      hasEnoughData: topTags.length >= 3,
    };
  }

  private async requireOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<TrainingDocument> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('Invalid session id');
    }
    const session = await this.trainingModel.findById(sessionId);
    if (!session || String(session.user) !== userId) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }
}

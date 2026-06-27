import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import {
  RoadmapLevel,
  RoadmapLevelDocument,
} from './schemas/roadmap-level.schema';
import {
  RoadmapTopic,
  RoadmapTopicDocument,
} from './schemas/roadmap-topic.schema';
import {
  RoadmapResource,
  RoadmapResourceDocument,
} from './schemas/roadmap-resource.schema';
import {
  RoadmapProblem,
  RoadmapProblemDocument,
} from './schemas/roadmap-problem.schema';
import {
  UserResourceProgress,
  UserResourceProgressDocument,
} from './schemas/user-resource-progress.schema';
import {
  UserProblemProgress,
  UserProblemProgressDocument,
} from './schemas/user-problem-progress.schema';
import {
  UserTopicProgress,
  UserTopicProgressDocument,
} from './schemas/user-topic-progress.schema';
import {
  UserLevelProgress,
  UserLevelProgressDocument,
} from './schemas/user-level-progress.schema';
import { UserXp, UserXpDocument } from './schemas/user-xp.schema';
import {
  XpTransaction,
  XpTransactionDocument,
} from './schemas/xp-transaction.schema';
import { ImportProblemsDto } from './dto/import-problems.dto';
import { toUtcDayKey, addUtcDays } from '../trainings/utils/date-key';

const MAX_STATUS_COUNT = 1000;

type ParsedProblemId = {
  contestId: number;
  index: string;
  isGym: boolean;
};

@Injectable()
export class RoadmapProgressService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RoadmapLevel.name)
    private readonly levelModel: Model<RoadmapLevelDocument>,
    @InjectModel(RoadmapTopic.name)
    private readonly topicModel: Model<RoadmapTopicDocument>,
    @InjectModel(RoadmapResource.name)
    private readonly resourceModel: Model<RoadmapResourceDocument>,
    @InjectModel(RoadmapProblem.name)
    private readonly problemModel: Model<RoadmapProblemDocument>,
    @InjectModel(UserResourceProgress.name)
    private readonly resourceProgressModel: Model<UserResourceProgressDocument>,
    @InjectModel(UserProblemProgress.name)
    private readonly problemProgressModel: Model<UserProblemProgressDocument>,
    @InjectModel(UserTopicProgress.name)
    private readonly topicProgressModel: Model<UserTopicProgressDocument>,
    @InjectModel(UserLevelProgress.name)
    private readonly levelProgressModel: Model<UserLevelProgressDocument>,
    @InjectModel(UserXp.name) private readonly xpModel: Model<UserXpDocument>,
    @InjectModel(XpTransaction.name)
    private readonly xpTransactionModel: Model<XpTransactionDocument>,
  ) {}

  private async revokeXp(
    userId: Types.ObjectId,
    amount: number,
  ): Promise<void> {
    const xpDoc = await this.xpModel
      .findOne({ userId })
      .select('totalXp')
      .lean();
    const current = xpDoc?.totalXp ?? 0;
    const newTotal = Math.max(0, current - amount);
    await this.xpModel.updateOne({ userId }, { $set: { totalXp: newTotal } });
  }

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`${label} not found`);
    }
    return new Types.ObjectId(id);
  }

  private parseProblemId(value: string): ParsedProblemId | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.toLowerCase().startsWith('http')) {
      const parts = trimmed.split('/').filter(Boolean);
      const contestIdx = parts.findIndex((p) => p.toLowerCase() === 'contest');
      const problemIdx = parts.findIndex((p) => p.toLowerCase() === 'problem');
      const gymIdx = parts.findIndex((p) => p.toLowerCase() === 'gym');

      if (contestIdx !== -1 && problemIdx !== -1 && problemIdx > contestIdx) {
        const contestId = Number(parts[contestIdx + 1]);
        const index = parts[problemIdx + 1] ?? '';
        if (Number.isFinite(contestId) && index) {
          return {
            contestId,
            index: index.toUpperCase(),
            isGym: gymIdx !== -1 || trimmed.toLowerCase().includes('/gym/'),
          };
        }
      }

      if (gymIdx !== -1 && problemIdx !== -1 && problemIdx > gymIdx) {
        const contestId = Number(parts[gymIdx + 1]);
        const index = parts[problemIdx + 1] ?? '';
        if (Number.isFinite(contestId) && index) {
          return { contestId, index: index.toUpperCase(), isGym: true };
        }
      }

      const problemsetIdx = parts.findIndex(
        (p) => p.toLowerCase() === 'problemset',
      );
      const problemsetProblemIdx = parts.findIndex(
        (p) => p.toLowerCase() === 'problem',
      );
      if (
        problemsetIdx !== -1 &&
        problemsetProblemIdx !== -1 &&
        problemsetProblemIdx > problemsetIdx
      ) {
        const contestId = Number(parts[problemsetProblemIdx + 1]);
        const index = parts[problemsetProblemIdx + 2] ?? '';
        if (Number.isFinite(contestId) && index) {
          return { contestId, index: index.toUpperCase(), isGym: false };
        }
      }
    }

    if (trimmed.includes('/')) {
      const parts = trimmed.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0].toLowerCase() === 'gym') {
        const contestId = Number(parts[1]);
        const index = parts[2] ?? '';
        if (Number.isFinite(contestId) && index) {
          return { contestId, index: index.toUpperCase(), isGym: true };
        }
      }
      if (parts.length >= 2) {
        const contestId = Number(parts[0]);
        const index = parts[1] ?? '';
        if (Number.isFinite(contestId) && index) {
          return { contestId, index: index.toUpperCase(), isGym: false };
        }
      }
    }

    const match = trimmed.match(/^(\d+)([A-Za-z][A-Za-z0-9]*)$/);
    if (!match) return null;

    const contestId = Number(match[1]);
    const index = match[2];
    if (!Number.isFinite(contestId) || !index) return null;
    return { contestId, index: index.toUpperCase(), isGym: false };
  }

  private async fetchSolvedFromStatus(handle: string): Promise<Set<string>> {
    const url = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(
      handle,
    )}&from=1&count=${MAX_STATUS_COUNT}`;
    let data: any;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      data = await res.json();
    } catch {
      throw new BadRequestException(
        'Unable to reach Codeforces API. Please try again later.',
      );
    }
    if (data?.status !== 'OK') {
      throw new BadRequestException(
        'Codeforces API is currently unavailable. Please try again later.',
      );
    }
    const solved = new Set<string>();
    for (const sub of data.result ?? []) {
      if (sub?.verdict !== 'OK') continue;
      const contestId = sub?.problem?.contestId;
      const index = sub?.problem?.index;
      if (contestId && index) {
        solved.add(`${contestId}_${String(index).toUpperCase()}`);
      }
    }
    return solved;
  }

  private async fetchSolvedFromGymContests(
    handle: string,
    contestIds: number[],
  ): Promise<Set<string>> {
    const solved = new Set<string>();
    await Promise.all(
      contestIds.map(async (contestId) => {
        const url = `https://codeforces.com/api/contest.standings?contestId=${contestId}&handles=${encodeURIComponent(
          handle,
        )}&showUnofficial=true`;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          const data = await res.json();
          if (data?.status !== 'OK') return;
          const problems = data.result?.problems ?? [];
          const row = data.result?.rows?.[0];
          if (!row?.problemResults) return;
          const results = row.problemResults as Array<{ points?: number }>;
          for (let i = 0; i < problems.length; i += 1) {
            const p = problems[i];
            const r = results[i];
            if (!p?.index) continue;
            if ((r?.points ?? 0) > 0) {
              solved.add(`${contestId}_${String(p.index).toUpperCase()}`);
            }
          }
        } catch {
          // ignore per-contest errors
        }
      }),
    );
    return solved;
  }

  private async fetchSolvedFromContestStatus(
    handle: string,
    contestIds: number[],
  ): Promise<Set<string>> {
    const solved = new Set<string>();
    await Promise.all(
      contestIds.map(async (contestId) => {
        try {
          const url = `https://codeforces.com/api/contest.status?contestId=${contestId}&handle=${encodeURIComponent(
            handle,
          )}&from=1&count=100`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          const data = await res.json();
          if (data?.status !== 'OK') return;
          for (const sub of data.result ?? []) {
            if (sub?.verdict !== 'OK') continue;
            const index = sub?.problem?.index;
            if (index) {
              solved.add(`${contestId}_${String(index).toUpperCase()}`);
            }
          }
        } catch {
          // ignore per-contest errors
        }
      }),
    );
    return solved;
  }

  private async awardXp(
    userId: string,
    amount: number,
    reason: string,
    sourceType: string,
    sourceId: Types.ObjectId,
  ): Promise<number> {
    if (!Number.isFinite(amount) || amount <= 0) {
      return 0;
    }

    try {
      await this.xpTransactionModel.create({
        userId: new Types.ObjectId(userId),
        amount,
        reason,
        sourceType,
        sourceId,
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: number }).code === 11000
      ) {
        // Transaction already exists — XP was already credited. Treat as success
        // so the caller can set the xpAwarded flag even if the write arrived late.
        return amount;
      }
      throw error;
    }

    await this.xpModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $inc: { totalXp: amount } },
      { upsert: true },
    );
    return amount;
  }

  private async ensureLevelProgress(userId: string, levelId: Types.ObjectId) {
    const now = new Date();
    await this.levelProgressModel.updateOne(
      { userId: new Types.ObjectId(userId), levelId },
      { $setOnInsert: { unlockedAt: now } },
      { upsert: true },
    );
  }

  private async calculateLearningProgress(
    userId: string,
    topicId: Types.ObjectId,
    language?: 'Arabic' | 'English',
  ): Promise<number> {
    const filter: Record<string, unknown> = { topicId };
    if (language) filter.language = language;
    const resources = await this.resourceModel.find(filter).lean();
    if (resources.length === 0) return 100; // Unlocks problems instantly if no resources

    const resourceIds = resources.map((r) => r._id);
    const progressDocs = await this.resourceProgressModel
      .find({
        userId: new Types.ObjectId(userId),
        resourceId: { $in: resourceIds },
      })
      .lean();

    const progressMap = new Map(
      progressDocs.map((p) => [String(p.resourceId), p]),
    );
    let totalContribution = 0;

    for (const res of resources) {
      const prog = progressMap.get(String(res._id));
      if (!prog) continue;

      if (res.type === 'Video') {
        const watchPct = prog.watchPct ?? 0;
        totalContribution += res.weight * (watchPct / 100);
      } else {
        if (prog.isCompleted) {
          totalContribution += res.weight;
        }
      }
    }

    return Math.min(100, Math.round(totalContribution));
  }

  private async checkLearningGate(
    userId: string,
    topicId: Types.ObjectId,
    language: 'Arabic' | 'English' | undefined,
    requiredPct: number,
  ): Promise<void> {
    const pct = await this.calculateLearningProgress(userId, topicId, language);
    if (pct < requiredPct) {
      throw new BadRequestException(
        `Problems are locked. Reach ${requiredPct}% learning progress first. Currently: ${pct}%`,
      );
    }
  }

  private async awardXpAndMarkFlag(
    userId: string,
    amount: number,
    reason: string,
    sourceType: string,
    sourceId: Types.ObjectId,
    filter: Record<string, unknown>,
    progressModel: Model<any>,
  ): Promise<number> {
    const earned = await this.awardXp(
      userId,
      amount,
      reason,
      sourceType,
      sourceId,
    );
    if (earned > 0) {
      await progressModel.updateOne(filter, { $set: { xpAwarded: true } });
    }
    return earned;
  }

  private async revokeXpIfAwarded(
    userId: Types.ObjectId,
    progressModel: Model<any>,
    findFilter: Record<string, unknown>,
    updateFields: Record<string, unknown>,
    sourceType: string,
    sourceId: Types.ObjectId,
    xpAmount: number,
  ): Promise<boolean> {
    const claimed = await progressModel.findOneAndUpdate(
      { ...findFilter, xpAwarded: true },
      { $set: { ...updateFields, xpAwarded: false } },
      { returnDocument: 'before' },
    );
    if (claimed) {
      await this.xpTransactionModel.deleteOne({
        userId,
        sourceType,
        sourceId,
      });
      await this.revokeXp(userId, xpAmount);
      return true;
    }
    return false;
  }

  private async updateTopicAndLevelProgress(
    userId: string,
    topicId: Types.ObjectId,
    language?: 'Arabic' | 'English',
  ) {
    const userOid = new Types.ObjectId(userId);
    const topic = await this.topicModel.findById(topicId).lean();
    if (!topic) return;

    const level = await this.levelModel.findById(topic.levelId).lean();
    if (!level) return;

    // 1. Calculate Learning Progress (language-aware)
    const learningPct = await this.calculateLearningProgress(
      userId,
      topicId,
      language,
    );

    // 2. Calculate Problems Progress
    const problems = await this.problemModel.find({ topicId }).lean();
    const problemIds = problems.map((p) => p._id);
    const solvedProblemsCount = problemIds.length
      ? await this.problemProgressModel.countDocuments({
          userId: userOid,
          problemId: { $in: problemIds },
          isSolved: true,
        })
      : 0;

    const problemPct =
      problems.length > 0
        ? Math.round((solvedProblemsCount / problems.length) * 100)
        : 0;

    // Check completion requirements
    const isLearningComplete = learningPct >= topic.requiredLearningPct;
    const isProblemsComplete = problemPct >= topic.requiredProblemPct;
    const isTopicComplete = isLearningComplete && isProblemsComplete;

    // Get existing topic progress
    const existingTopicProgress = await this.topicProgressModel.findOne({
      userId: userOid,
      topicId,
    });

    await this.topicProgressModel.updateOne(
      { userId: userOid, topicId },
      {
        $set: {
          learningPct,
          problemPct,
          isTopicComplete,
          completedAt: isTopicComplete
            ? (existingTopicProgress?.completedAt ?? new Date())
            : null,
        },
        $setOnInsert: { topicBonusAwarded: false },
      },
      { upsert: true },
    );

    // Award Topic completion bonus XP (atomic claim to prevent TOCTOU race)
    let xpEarned = 0;
    if (isTopicComplete) {
      const claimedTopicBonus = await this.topicProgressModel.findOneAndUpdate(
        { userId: userOid, topicId, topicBonusAwarded: false },
        { $set: { topicBonusAwarded: true } },
        { returnDocument: 'before' },
      );
      if (claimedTopicBonus) {
        const bonus = await this.awardXp(
          userId,
          topic.topicXpReward ?? 100,
          `Completed topic ${topic.title}`,
          'topic',
          topicId,
        );
        xpEarned += bonus;
        if (bonus === 0) {
          // Transaction already existed — roll back the flag
          await this.topicProgressModel.updateOne(
            { _id: claimedTopicBonus._id },
            { $set: { topicBonusAwarded: false } },
          );
        }
      }
    }

    // 3. Level Progress calculation
    await this.ensureLevelProgress(userId, topic.levelId);

    const levelTopicIds = await this.topicModel
      .find({ levelId: topic.levelId })
      .select('_id')
      .lean();

    const completedTopicsCount = await this.topicProgressModel.countDocuments({
      userId: userOid,
      topicId: { $in: levelTopicIds.map((t) => t._id) },
      isTopicComplete: true,
    });

    const topicsCount = levelTopicIds.length;
    const topicsCompletePct = topicsCount
      ? Math.round((completedTopicsCount / topicsCount) * 100)
      : 0;

    // Level complete if all topics completed (100%)
    const isLevelComplete =
      completedTopicsCount === topicsCount && topicsCount > 0;

    const existingLevelProgress = await this.levelProgressModel.findOne({
      userId: userOid,
      levelId: topic.levelId,
    });

    await this.levelProgressModel.updateOne(
      { userId: userOid, levelId: topic.levelId },
      {
        $set: {
          topicsCompletePct,
          isLevelComplete,
          completedAt: isLevelComplete
            ? (existingLevelProgress?.completedAt ?? new Date())
            : null,
        },
        $setOnInsert: { levelBonusAwarded: false, unlockedAt: new Date() },
      },
      { upsert: true },
    );

    // Award Level completion bonus XP (atomic claim to prevent TOCTOU race)
    if (isLevelComplete) {
      const claimedLevelBonus = await this.levelProgressModel.findOneAndUpdate(
        { userId: userOid, levelId: topic.levelId, levelBonusAwarded: false },
        { $set: { levelBonusAwarded: true } },
        { returnDocument: 'before' },
      );
      if (claimedLevelBonus) {
        const bonus = await this.awardXp(
          userId,
          level.levelBonusXp ?? 500,
          `Completed level ${level.title}`,
          'level',
          topic.levelId,
        );
        xpEarned += bonus;
        if (bonus === 0) {
          // Transaction already existed — roll back the flag
          await this.levelProgressModel.updateOne(
            { _id: claimedLevelBonus._id },
            { $set: { levelBonusAwarded: false } },
          );
        }
      }
    }

    return { xpEarned, learningPct, problemPct, isTopicComplete };
  }

  // === RESOURCE PROGRESS UPDATING ===

  async recordResourceProgress(
    userId: string,
    resourceId: string,
    dto: { watchPct?: number; positionSec?: number; completed?: boolean },
  ) {
    const resId = this.toObjectId(resourceId, 'Resource');
    const resource = await this.resourceModel.findById(resId).lean();
    if (!resource) throw new NotFoundException('Resource not found');

    const userOid = new Types.ObjectId(userId);

    const existing = await this.resourceProgressModel.findOne({
      userId: userOid,
      resourceId: resId,
    });

    const watchPct = Math.min(
      100,
      Math.max(
        existing?.watchPct ?? 0,
        dto.watchPct ?? existing?.watchPct ?? 0,
      ),
    );
    const lastPositionSec = Math.max(
      0,
      dto.positionSec ?? existing?.lastPositionSec ?? 0,
    );

    // Check completion
    let isCompleted = false;
    if (resource.type === 'Video') {
      const threshold = resource.videoCompletionThresholdPct ?? 80;
      isCompleted = watchPct >= threshold;
    } else {
      isCompleted = dto.completed ?? existing?.isCompleted ?? false;
    }

    const nextCompleted =
      resource.type === 'Video'
        ? existing?.isCompleted || isCompleted
        : isCompleted;
    const nextCompletedAt = nextCompleted
      ? (existing?.completedAt ?? new Date())
      : null;

    const updated = await this.resourceProgressModel.findOneAndUpdate(
      { userId: userOid, resourceId: resId },
      {
        $set: {
          watchPct,
          lastPositionSec,
          isCompleted: nextCompleted,
          completedAt: nextCompletedAt,
        },
        $setOnInsert: { xpAwarded: false },
      },
      { upsert: true, returnDocument: 'after' },
    );

    let xpEarned = 0;
    if (nextCompleted && updated && !updated.xpAwarded) {
      xpEarned = await this.awardXpAndMarkFlag(
        userId,
        resource.xpReward ?? 10,
        `Completed resource ${resource.title}`,
        'resource',
        resId,
        { _id: updated._id },
        this.resourceProgressModel,
      );
    } else if (!isCompleted && !nextCompleted) {
      const revoked = await this.revokeXpIfAwarded(
        userOid,
        this.resourceProgressModel,
        { userId: userOid, resourceId: resId },
        { isCompleted: false, completedAt: null },
        'resource',
        resId,
        resource.xpReward ?? 10,
      );
      if (revoked) {
        xpEarned = -(resource.xpReward ?? 10);
      } else {
        await this.resourceProgressModel.updateOne(
          { userId: userOid, resourceId: resId },
          { $set: { isCompleted: false, completedAt: null } },
        );
      }
    }

    const progressUpdates = await this.updateTopicAndLevelProgress(
      userId,
      resource.topicId,
      resource.language,
    );

    return {
      isCompleted: nextCompleted,
      watchPct,
      lastPositionSec,
      xpEarned: xpEarned + (progressUpdates?.xpEarned ?? 0),
      learningPct: progressUpdates?.learningPct ?? 0,
    };
  }

  // === CODEFORCES SYNCING ===

  async syncTopicProblems(
    userId: string,
    topicId: string,
    language?: 'Arabic' | 'English',
  ) {
    const tId = this.toObjectId(topicId, 'Topic');
    const topic = await this.topicModel.findById(tId).lean();
    if (!topic) throw new NotFoundException('Topic not found');

    await this.checkLearningGate(
      userId,
      tId,
      language,
      topic.requiredLearningPct,
    );

    const user = await this.userModel
      .findById(userId)
      .select('codeforcesHandle');
    if (!user) throw new NotFoundException('User not found');
    if (!user.codeforcesHandle) {
      throw new BadRequestException('User Codeforces handle is missing');
    }

    const problems = await this.problemModel.find({ topicId: tId }).lean();
    if (!problems.length) {
      return {
        newlySolved: [],
        xpEarned: 0,
        problemPct: 0,
        problemsSolved: 0,
        totalProblems: 0,
      };
    }

    const parsedByProblem = new Map<string, ParsedProblemId>();
    const allContestIds = new Set<number>();
    for (const p of problems) {
      if (!p.cfProblemId) continue;
      // Parse cfProblemId which was saved as contestId_index (e.g. 1234_A)
      const parts = p.cfProblemId.split('_');
      const contestId = Number(parts[0]);
      const index = parts[1];
      if (Number.isFinite(contestId) && index) {
        parsedByProblem.set(String(p._id), { contestId, index, isGym: false });
        allContestIds.add(contestId);
      }
    }

    const solvedFromStatus = await this.fetchSolvedFromStatus(
      user.codeforcesHandle,
    );

    if (allContestIds.size > 0) {
      const uniqueContestIds = Array.from(allContestIds);
      const [standingsSolved, statusSolved] = await Promise.all([
        this.fetchSolvedFromGymContests(
          user.codeforcesHandle,
          uniqueContestIds,
        ).catch(() => new Set<string>()),
        this.fetchSolvedFromContestStatus(
          user.codeforcesHandle,
          uniqueContestIds,
        ).catch(() => new Set<string>()),
      ]);
      for (const key of standingsSolved) solvedFromStatus.add(key);
      for (const key of statusSolved) solvedFromStatus.add(key);
    }

    const problemIds = problems.map((p) => p._id);
    const existing = await this.problemProgressModel
      .find({
        userId: new Types.ObjectId(userId),
        problemId: { $in: problemIds },
      })
      .lean();
    const existingMap = new Map(existing.map((p) => [String(p.problemId), p]));

    const solvedProblemIds = new Set(
      existing.filter((p) => p.isSolved).map((p) => String(p.problemId)),
    );

    const newlySolved: string[] = [];
    let xpEarned = 0;

    for (const p of problems) {
      const parsed = parsedByProblem.get(String(p._id));
      if (!parsed) continue;
      const key = `${parsed.contestId}_${parsed.index}`;
      if (!solvedFromStatus.has(key)) continue;

      const existingProgress = existingMap.get(String(p._id));
      if (!existingProgress?.isSolved) {
        newlySolved.push(String(p._id));
        solvedProblemIds.add(String(p._id));

        await this.problemProgressModel.updateOne(
          { userId: new Types.ObjectId(userId), problemId: p._id },
          {
            $set: { isSolved: true, solvedAt: new Date() },
            $setOnInsert: { xpAwarded: false },
          },
          { upsert: true },
        );

        // Read xpAwarded state after upsert to avoid double-award
        const prog = await this.problemProgressModel
          .findOne({ userId: new Types.ObjectId(userId), problemId: p._id })
          .lean();

        if (!prog?.xpAwarded) {
          xpEarned += await this.awardXpAndMarkFlag(
            userId,
            p.xpReward ?? 40,
            `Solved ${p.name}`,
            'problem',
            p._id,
            { userId: new Types.ObjectId(userId), problemId: p._id },
            this.problemProgressModel,
          );
        }
      }
    }

    const progressUpdates = await this.updateTopicAndLevelProgress(
      userId,
      tId,
      language,
    );

    return {
      newlySolved,
      xpEarned: xpEarned + (progressUpdates?.xpEarned ?? 0),
      problemPct: progressUpdates?.problemPct ?? 0,
      problemsSolved: solvedProblemIds.size,
      totalProblems: problems.length,
    };
  }

  // === MANUAL PROBLEM TOGGLING ===

  async toggleProblemSolved(
    userId: string,
    problemId: string,
    solved: boolean,
    language?: 'Arabic' | 'English',
  ) {
    const probOid = this.toObjectId(problemId, 'Problem');
    const problem = await this.problemModel.findById(probOid).lean();
    if (!problem) throw new NotFoundException('Problem not found');

    const topic = await this.topicModel.findById(problem.topicId).lean();
    if (!topic) throw new NotFoundException('Topic not found');

    if (solved) {
      await this.checkLearningGate(
        userId,
        topic._id,
        language,
        topic.requiredLearningPct,
      );
    }

    const userOid = new Types.ObjectId(userId);
    let xpDelta = 0;

    if (solved) {
      // Upsert progress doc; only set xpAwarded=false for brand-new documents
      await this.problemProgressModel.updateOne(
        { userId: userOid, problemId: probOid },
        {
          $set: { isSolved: true, solvedAt: new Date() },
          $setOnInsert: { xpAwarded: false },
        },
        { upsert: true },
      );

      // Read the current xpAwarded state after upsert
      const prog = await this.problemProgressModel
        .findOne({ userId: userOid, problemId: probOid })
        .lean();

      if (!prog?.xpAwarded) {
        xpDelta = await this.awardXpAndMarkFlag(
          userId,
          problem.xpReward ?? 40,
          `Solved ${problem.name}`,
          'problem',
          probOid,
          { userId: userOid, problemId: probOid },
          this.problemProgressModel,
        );
      }
    } else {
      const revoked = await this.revokeXpIfAwarded(
        userOid,
        this.problemProgressModel,
        { userId: userOid, problemId: probOid },
        { isSolved: false, solvedAt: null },
        'problem',
        probOid,
        problem.xpReward ?? 40,
      );
      if (revoked) {
        xpDelta = -(problem.xpReward ?? 40);
      } else {
        await this.problemProgressModel.updateOne(
          { userId: userOid, problemId: probOid },
          { $set: { isSolved: false, solvedAt: null } },
        );
      }
    }

    const progressUpdates = await this.updateTopicAndLevelProgress(
      userId,
      topic._id,
      language,
    );

    const allTopicProblems = await this.problemModel
      .find({ topicId: topic._id })
      .select('_id')
      .lean();
    const totalProblems = allTopicProblems.length;
    const solvedProblemsCount = totalProblems
      ? await this.problemProgressModel.countDocuments({
          userId: userOid,
          problemId: { $in: allTopicProblems.map((p) => p._id) },
          isSolved: true,
        })
      : 0;

    return {
      problemId,
      isSolved: solved,
      xpDelta: xpDelta + (progressUpdates?.xpEarned ?? 0),
      problemPct: progressUpdates?.problemPct ?? 0,
      problemsSolved: solvedProblemsCount,
      totalProblems,
    };
  }

  // === USER SUMMARY & LEADERS ===

  async computeSolveStreak(userId: string): Promise<number> {
    const solved = await this.problemProgressModel
      .find({
        userId: new Types.ObjectId(userId),
        isSolved: true,
        solvedAt: { $ne: null },
      })
      .select('solvedAt')
      .lean();

    if (!solved.length) return 0;

    const days = new Set<string>();
    for (const s of solved) {
      if (s.solvedAt) days.add(toUtcDayKey(s.solvedAt.getTime()));
    }

    const today = toUtcDayKey(Date.now());
    let streak = 0;
    let cursor = today;
    while (days.has(cursor)) {
      streak += 1;
      cursor = addUtcDays(cursor, -1);
    }
    return streak;
  }

  async getUserSummary(userId: string) {
    const xp = await this.xpModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    const totalXp = xp?.totalXp ?? 0;

    const problemsSolved = await this.problemProgressModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isSolved: true,
    });
    const topicsCompleted = await this.topicProgressModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isTopicComplete: true,
    });
    const levelsCompleted = await this.levelProgressModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isLevelComplete: true,
    });

    const progressDocs = await this.levelProgressModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('levelId topicsCompletePct isLevelComplete')
      .lean();

    const levelIds = progressDocs.map((p) => p.levelId);
    const levels = await this.levelModel
      .find({ _id: { $in: levelIds } })
      .select('title orderIndex')
      .lean();
    const levelMap = new Map(levels.map((l) => [String(l._id), l]));

    let currentLevel: { id: string; title: string } | null = null;
    let maxOrder = -1;
    for (const p of progressDocs) {
      const level = levelMap.get(String(p.levelId));
      if (!level) continue;
      if (level.orderIndex > maxOrder && p.topicsCompletePct > 0) {
        maxOrder = level.orderIndex;
        currentLevel = { id: String(level._id), title: level.title };
      }
    }

    return {
      totalXp,
      problemsSolved,
      topicsCompleted,
      levelsCompleted,
      currentLevel,
    };
  }

  async getUserActivity(userId: string) {
    const userOid = new Types.ObjectId(userId);

    const solvedProblems = await this.problemProgressModel
      .find({ userId: userOid, isSolved: true, solvedAt: { $ne: null } })
      .select('solvedAt')
      .lean();

    const topicCompletions = await this.xpTransactionModel
      .find({ userId: userOid, sourceType: 'topic' })
      .select('createdAt')
      .lean<{ createdAt?: Date }[]>();

    const problemDates = solvedProblems
      .map((p) => p.solvedAt?.toISOString())
      .filter(Boolean) as string[];

    const topicDates = topicCompletions
      .map((t) => t.createdAt?.toISOString())
      .filter(Boolean) as string[];

    return { problemDates, topicDates };
  }

  async getLeaderboard(
    query: {
      level?: string;
      period?: string;
      page?: string;
      limit?: string;
    },
    userId?: string,
  ) {
    const pageSize = Math.min(parseInt(query.limit ?? '20', 10) || 20, 200);
    const page = Math.max(parseInt(query.page ?? '1', 10) || 1, 1);
    const skip = (page - 1) * pageSize;

    // Total count for pagination metadata
    const total = await this.xpModel.countDocuments({});
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    // Top 3 always fetched for podium, regardless of current page
    const top3Docs = await this.xpModel
      .find({})
      .sort({ totalXp: -1 })
      .limit(3)
      .lean();

    // Paginated entries for current page
    const xpDocs = await this.xpModel
      .find({})
      .sort({ totalXp: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    if (total === 0) {
      return {
        leaderboard: [],
        top3: [],
        total,
        page,
        pageSize,
        totalPages,
        myRank: null,
      };
    }

    // Collect all unique userIds from both top3 and current page
    const allUserIds = [
      ...new Set([
        ...xpDocs.map((x) => x.userId),
        ...top3Docs.map((x) => x.userId),
      ]),
    ];

    const [users, topicCounts, problemCounts] = await Promise.all([
      this.userModel
        .find({ _id: { $in: allUserIds } })
        .select('codeforcesHandle avatar')
        .lean(),
      this.topicProgressModel.aggregate([
        { $match: { userId: { $in: allUserIds }, isTopicComplete: true } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
      this.problemProgressModel.aggregate([
        { $match: { userId: { $in: allUserIds }, isSolved: true } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const topicMap = new Map<string, number>(
      topicCounts.map((t: { _id: any; count: number }) => [
        String(t._id),
        t.count,
      ]),
    );
    const problemMap = new Map<string, number>(
      problemCounts.map((p: { _id: any; count: number }) => [
        String(p._id),
        p.count,
      ]),
    );

    const buildEntry = (xp: { userId: any; totalXp: number }, rank: number) => {
      const u = userMap.get(String(xp.userId));
      if (!u) return null;
      return {
        userId: String(xp.userId),
        handle: u.codeforcesHandle ?? 'Anonymous',
        avatar: u.avatar || null,
        totalXp: xp.totalXp,
        topicsDone: topicMap.get(String(xp.userId)) ?? 0,
        problemsSolved: problemMap.get(String(xp.userId)) ?? 0,
        rank,
      };
    };

    // Build top3 with global ranks 1-3
    const top3: any[] = [];
    for (let i = 0; i < top3Docs.length; i++) {
      const entry = buildEntry(top3Docs[i], i + 1);
      if (entry) top3.push(entry);
    }

    // Build paginated leaderboard with correct global ranks
    const leaderboard: any[] = [];
    let rank = skip + 1;
    for (const xp of xpDocs) {
      const entry = buildEntry(xp, rank);
      if (entry) leaderboard.push(entry);
      rank++;
    }

    // Calculate current user's rank
    let myRank: number | null = null;
    if (userId) {
      const userXp = await this.xpModel
        .findOne({ userId })
        .select('totalXp')
        .lean();
      if (userXp) {
        const higherCount = await this.xpModel.countDocuments({
          totalXp: { $gt: userXp.totalXp },
        });
        myRank = higherCount + 1;
      }
    }

    return { leaderboard, top3, total, page, pageSize, totalPages, myRank };
  }

  private async getMaxOrderIndex(
    model: Model<any>,
    filter: Record<string, unknown>,
  ): Promise<number> {
    const last = await model
      .find(filter)
      .sort({ orderIndex: -1 })
      .select('orderIndex')
      .limit(1)
      .lean();
    return last[0]?.orderIndex ?? -1;
  }

  // === IMPORT PROBLEMS FROM CF CONTEST ===

  async importProblems(topicId: string, dto: ImportProblemsDto) {
    const tId = this.toObjectId(topicId, 'Topic');
    const topic = await this.topicModel.findById(tId);
    if (!topic) throw new NotFoundException('Topic not found');

    const contestId = dto.contestId;
    const url = `https://codeforces.com/api/contest.standings?contestId=${contestId}`;
    let data: any;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      data = await res.json();
    } catch {
      throw new BadRequestException(
        'Unable to reach Codeforces API. Please try again later.',
      );
    }
    if (data?.status !== 'OK') {
      throw new BadRequestException(
        'Codeforces API is currently unavailable. Please try again later.',
      );
    }

    const problems = data.result?.problems ?? [];
    const maxIndex = await this.getMaxOrderIndex(this.problemModel, {
      topicId: tId,
    });

    const inserts: any[] = [];
    let orderIndex = maxIndex;

    for (const p of problems) {
      if (!p.index) continue;
      const cfProblemId = `${contestId}_${p.index.toUpperCase()}`;

      const exists = await this.problemModel.findOne({
        topicId: tId,
        cfProblemId,
      });

      if (exists && !dto.force) continue;

      orderIndex++;
      const name = `${contestId}${p.index} - ${p.name || 'Problem'}`;
      const problemUrl = `https://codeforces.com/problemset/problem/${contestId}/${p.index}`;

      if (exists && dto.force) {
        await this.problemModel.updateOne(
          { _id: exists._id },
          { $set: { name, url: problemUrl } },
        );
      } else {
        inserts.push({
          topicId: tId,
          name,
          url: problemUrl,
          cfProblemId,
          orderIndex,
          xpReward: 40, // default reward
        });
      }
    }

    if (inserts.length === 0) return { count: 0 };
    await this.problemModel.insertMany(inserts);
    return { count: inserts.length };
  }

  async completeLearning(
    userId: string,
    topicId: string,
    language?: 'Arabic' | 'English',
  ) {
    const tId = this.toObjectId(topicId, 'Topic');
    const topic = await this.topicModel.findById(tId).lean();
    if (!topic) throw new NotFoundException('Topic not found');

    await this.checkLearningGate(
      userId,
      tId,
      language,
      topic.requiredLearningPct,
    );

    const filter: Record<string, unknown> = { topicId: tId };
    if (language) filter.language = language;
    const resources = await this.resourceModel.find(filter).lean();
    if (resources.length === 0)
      return { ok: true, xpEarned: 0, learningPct: 100 };

    const userOid = new Types.ObjectId(userId);
    let xpEarned = 0;

    for (const resource of resources) {
      const existing = await this.resourceProgressModel
        .findOne({ userId: userOid, resourceId: resource._id })
        .lean();

      // For videos: contribution = weight * (watchPct / 100), so we need watchPct=100.
      // Skip only when the video is already fully watched.
      // For non-video resources: skip only when already completed.
      const alreadyDone =
        resource.type === 'Video'
          ? (existing?.watchPct ?? 0) >= 100
          : existing?.isCompleted === true;

      if (alreadyDone) continue;

      const updated = await this.resourceProgressModel.findOneAndUpdate(
        { userId: userOid, resourceId: resource._id },
        {
          $set: {
            watchPct: 100,
            isCompleted: true,
            completedAt: existing?.completedAt ?? new Date(),
          },
          $setOnInsert: { xpAwarded: false, lastPositionSec: 0 },
        },
        { upsert: true, returnDocument: 'after' },
      );

      if (updated && !updated.xpAwarded) {
        xpEarned += await this.awardXpAndMarkFlag(
          userId,
          resource.xpReward ?? 10,
          `Completed resource ${resource.title}`,
          'resource',
          resource._id,
          { _id: updated._id },
          this.resourceProgressModel,
        );
      }
    }

    const progressUpdates = await this.updateTopicAndLevelProgress(
      userId,
      tId,
      language,
    );

    return {
      ok: true,
      xpEarned: xpEarned + (progressUpdates?.xpEarned ?? 0),
      learningPct: progressUpdates?.learningPct ?? 100,
      isTopicComplete: progressUpdates?.isTopicComplete ?? false,
    };
  }

  async resetTopicLearningProgress(
    userId: string,
    topicId: string,
    language?: 'Arabic' | 'English',
  ) {
    const tId = this.toObjectId(topicId, 'Topic');
    const uId = new Types.ObjectId(userId);

    // Find resources (optionally filtered by language)
    const filter: Record<string, unknown> = { topicId: tId };
    if (language) filter.language = language;
    const resources = await this.resourceModel.find(filter).lean();
    const resourceIds = resources.map((r) => r._id);
    if (resourceIds.length === 0) return { ok: true, xpRevoked: 0 };

    // Find completed resources that awarded XP — accumulate revoke amount
    const completedProgress = await this.resourceProgressModel
      .find({
        userId: uId,
        resourceId: { $in: resourceIds },
        isCompleted: true,
        xpAwarded: true,
      })
      .lean();

    let xpRevoked = 0;
    for (const prog of completedProgress) {
      const res = resources.find(
        (r) => String(r._id) === String(prog.resourceId),
      );
      if (!res) continue;
      xpRevoked += res.xpReward ?? 10;
    }

    // Batch-delete all resource XP transactions in one query
    if (completedProgress.length > 0) {
      await this.xpTransactionModel.deleteMany({
        userId: uId,
        sourceType: 'resource',
        sourceId: { $in: completedProgress.map((p) => p.resourceId) },
      });
    }

    // Delete all resource progress for this user + topic (or language)
    await this.resourceProgressModel.deleteMany({
      userId: uId,
      resourceId: { $in: resourceIds },
    });

    // When switching language, also revoke all problem XP for this topic
    // (problems are unlocked by learning progress, so resetting learning = re-locking problems)
    const topicProblems = await this.problemModel.find({ topicId: tId }).lean();
    if (topicProblems.length > 0) {
      const problemIds = topicProblems.map((p) => p._id);
      const solvedWithXp = await this.problemProgressModel
        .find({
          userId: uId,
          problemId: { $in: problemIds },
          isSolved: true,
          xpAwarded: true,
        })
        .lean();

      if (solvedWithXp.length > 0) {
        for (const prog of solvedWithXp) {
          const problem = topicProblems.find(
            (p) => String(p._id) === String(prog.problemId),
          );
          if (!problem) continue;
          xpRevoked += problem.xpReward ?? 40;
        }
        await this.xpTransactionModel.deleteMany({
          userId: uId,
          sourceType: 'problem',
          sourceId: { $in: solvedWithXp.map((p) => p.problemId) },
        });
        await this.problemProgressModel.deleteMany({
          userId: uId,
          problemId: { $in: problemIds },
        });
      }
    }

    // Reset learning progress in topic progress
    const topicProgress = await this.topicProgressModel.findOne({
      userId: uId,
      topicId: tId,
    });
    const topic = await this.topicModel.findById(tId).lean();
    if (topicProgress?.topicBonusAwarded && topic) {
      xpRevoked += topic.topicXpReward ?? 100;
      await this.xpTransactionModel.deleteOne({
        userId: uId,
        sourceType: 'topic',
        sourceId: tId,
      });
    }
    await this.topicProgressModel.updateOne(
      { userId: uId, topicId: tId },
      {
        $set: {
          learningPct: 0,
          problemPct: 0,
          isTopicComplete: false,
          completedAt: null,
          topicBonusAwarded: false,
        },
      },
    );

    // Revoke level bonus XP if awarded and reset flag
    if (topic) {
      const levelProgress = await this.levelProgressModel.findOne({
        userId: uId,
        levelId: topic.levelId,
      });
      if (levelProgress?.levelBonusAwarded) {
        const level = await this.levelModel.findById(topic.levelId).lean();
        if (level) {
          xpRevoked += level.levelBonusXp ?? 500;
          await this.xpTransactionModel.deleteOne({
            userId: uId,
            sourceType: 'level',
            sourceId: topic.levelId,
          });
        }
        await this.levelProgressModel.updateOne(
          { userId: uId, levelId: topic.levelId },
          { $set: { levelBonusAwarded: false } },
        );
      }
    }

    // Revoke total XP after all revocations are accumulated
    if (xpRevoked > 0) {
      await this.revokeXp(uId, xpRevoked);
    }

    return { ok: true, xpRevoked };
  }
}

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
  RoadmapVideo,
  RoadmapVideoDocument,
} from './schemas/roadmap-video.schema';
import {
  RoadmapSheet,
  RoadmapSheetDocument,
} from './schemas/roadmap-sheet.schema';
import {
  RoadmapProblem,
  RoadmapProblemDocument,
} from './schemas/roadmap-problem.schema';
import {
  UserVideoProgress,
  UserVideoProgressDocument,
} from './schemas/user-video-progress.schema';
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
import { UpdateVideoProgressDto } from './dto/update-video-progress.dto';
import { ImportProblemsDto } from './dto/import-problems.dto';
import { toUtcDayKey, addUtcDays } from '../trainings/utils/date-key';

const TOPIC_BONUS_XP = 100;
const LEVEL_BONUS_XP = 500;
const DEFAULT_VIDEO_UNLOCK_PCT = 80;
const DEFAULT_SHEET_UNLOCK_PCT = 80;
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
    @InjectModel(RoadmapVideo.name)
    private readonly videoModel: Model<RoadmapVideoDocument>,
    @InjectModel(RoadmapSheet.name)
    private readonly sheetModel: Model<RoadmapSheetDocument>,
    @InjectModel(RoadmapProblem.name)
    private readonly problemModel: Model<RoadmapProblemDocument>,
    @InjectModel(UserVideoProgress.name)
    private readonly videoProgressModel: Model<UserVideoProgressDocument>,
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

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`${label} not found`);
    }
    return new Types.ObjectId(id);
  }

  private parseProblemId(value: string): ParsedProblemId | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Check if it's a full Codeforces URL
    if (trimmed.toLowerCase().startsWith('http')) {
      const parts = trimmed.split('/').filter(Boolean);
      const contestIdx = parts.findIndex((p) => p.toLowerCase() === 'contest');
      const problemIdx = parts.findIndex((p) => p.toLowerCase() === 'problem');
      const gymIdx = parts.findIndex((p) => p.toLowerCase() === 'gym');

      if (contestIdx !== -1 && problemIdx !== -1 && problemIdx > contestIdx) {
        // .../contest/1234/problem/A
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
        // .../gym/102951/problem/A
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
        // .../problemset/problem/1234/A
        const contestId = Number(parts[problemsetProblemIdx + 1]);
        const index = parts[problemsetProblemIdx + 2] ?? '';
        if (Number.isFinite(contestId) && index) {
          return { contestId, index: index.toUpperCase(), isGym: false };
        }
      }
    }

    // Fallback to standard formats (e.g. gym/102951/A or 1234A)
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
    const res = await fetch(url);
    const data = await res.json();
    if (data?.status !== 'OK') {
      throw new BadRequestException(
        'Failed to fetch submissions from Codeforces',
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
    for (const contestId of contestIds) {
      const url = `https://codeforces.com/api/contest.standings?contestId=${contestId}&handles=${encodeURIComponent(
        handle,
      )}&showUnofficial=true`;
      const res = await fetch(url);
      const data = await res.json();
      if (data?.status !== 'OK') continue;
      const problems = data.result?.problems ?? [];
      const row = data.result?.rows?.[0];
      if (!row?.problemResults) continue;
      const results = row.problemResults as Array<{ points?: number }>;
      for (let i = 0; i < problems.length; i += 1) {
        const p = problems[i];
        const r = results[i];
        if (!p?.index) continue;
        if ((r?.points ?? 0) > 0) {
          solved.add(`${contestId}_${String(p.index).toUpperCase()}`);
        }
      }
    }
    return solved;
  }
  private async fetchSolvedFromContestStatus(
    handle: string,
    contestIds: number[],
  ): Promise<Set<string>> {
    const solved = new Set<string>();
    for (const contestId of contestIds) {
      try {
        const url = `https://codeforces.com/api/contest.status?contestId=${contestId}&handle=${encodeURIComponent(
          handle,
        )}&from=1&count=100`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.status !== 'OK') continue;
        for (const sub of data.result ?? []) {
          if (sub?.verdict !== 'OK') continue;
          const index = sub?.problem?.index;
          if (index) {
            solved.add(`${contestId}_${String(index).toUpperCase()}`);
          }
        }
      } catch (err) {
        console.error(
          `Error fetching contest status for contest ${contestId}`,
          err,
        );
      }
    }
    return solved;
  }

  private async awardXp(
    userId: string,
    amount: number,
    reason: string,
    sourceType: string,
    sourceId: Types.ObjectId,
  ): Promise<number> {
    if (!Number.isFinite(amount) || amount <= 0) return 0;

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
        return 0;
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

  private async updateTopicProgress(
    userId: string,
    topicId: Types.ObjectId,
    patch: Partial<UserTopicProgress>,
  ) {
    await this.topicProgressModel.updateOne(
      { userId: new Types.ObjectId(userId), topicId },
      { $set: patch, $setOnInsert: { topicBonusAwarded: false } },
      { upsert: true },
    );
  }

  async recordVideoProgress(
    userId: string,
    videoId: string,
    dto: UpdateVideoProgressDto,
  ) {
    const vid = this.toObjectId(videoId, 'Video');
    const video = await this.videoModel.findById(vid).lean();
    if (!video) throw new NotFoundException('Video not found');

    const topic = await this.topicModel
      .findById(video.topicId)
      .select('levelId xpVideoReward')
      .lean();
    if (!topic) throw new NotFoundException('Topic not found');

    const level = await this.levelModel
      .findById(topic.levelId)
      .select('videoUnlockSheetPct')
      .lean();
    if (!level) throw new NotFoundException('Level not found');

    const threshold = level.videoUnlockSheetPct ?? DEFAULT_VIDEO_UNLOCK_PCT;
    const watchPct = Math.min(100, Math.max(0, dto.watchPct));
    const positionSec = Math.max(0, dto.positionSec ?? 0);

    const existing = await this.videoProgressModel.findOne({
      userId: new Types.ObjectId(userId),
      videoId: vid,
    });

    const nextPct = Math.max(existing?.watchPct ?? 0, watchPct);
    const lastPositionSec = Math.max(
      0,
      positionSec ?? existing?.lastPositionSec ?? 0,
    );
    const isThresholdMet = nextPct >= threshold;

    const updated = await this.videoProgressModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), videoId: vid },
      {
        $set: {
          watchPct: nextPct,
          lastPositionSec,
          isThresholdMet,
        },
        $setOnInsert: { xpAwarded: false },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    await this.updateTopicProgress(userId, topic._id, {
      videoPct: nextPct,
      videoUnlockedSheet: isThresholdMet,
    });

    let xpEarned = 0;
    if (isThresholdMet && !updated?.xpAwarded) {
      xpEarned = await this.awardXp(
        userId,
        topic.xpVideoReward ?? 0,
        `Completed ${topic._id.toString()} video`,
        'video',
        vid,
      );
      if (xpEarned > 0) {
        await this.videoProgressModel.updateOne(
          { _id: updated?._id ?? undefined },
          { $set: { xpAwarded: true } },
        );
      }
    }

    await this.ensureLevelProgress(userId, topic.levelId);
    const topicProgress = await this.topicProgressModel.findOne({
      userId: new Types.ObjectId(userId),
      topicId: topic._id,
    });

    if (topicProgress?.sheetUnlockedNext && !topicProgress.isTopicComplete) {
      const bonus = await this.awardXp(
        userId,
        TOPIC_BONUS_XP,
        `Completed topic ${topic._id.toString()}`,
        'topic',
        topic._id,
      );
      await this.topicProgressModel.updateOne(
        { _id: topicProgress._id },
        {
          $set: {
            isTopicComplete: true,
            topicBonusAwarded: bonus > 0,
          },
        },
      );
    }

    return {
      watchPct: updated?.watchPct ?? nextPct,
      lastPositionSec: updated?.lastPositionSec ?? lastPositionSec,
      sheetUnlocked: updated?.isThresholdMet ?? isThresholdMet,
      threshold,
      xpEarned,
    };
  }

  async syncSheet(userId: string, sheetId: string) {
    const sheet = await this.sheetModel.findById(
      this.toObjectId(sheetId, 'Sheet'),
    );
    if (!sheet) throw new NotFoundException('Sheet not found');

    const topic = await this.topicModel
      .findById(sheet.topicId)
      .select('levelId')
      .lean();
    if (!topic) throw new NotFoundException('Topic not found');

    const level = await this.levelModel
      .findById(topic.levelId)
      .select('sheetUnlockTopicPct levelCompletionPct')
      .lean();
    if (!level) throw new NotFoundException('Level not found');

    const user = await this.userModel
      .findById(userId)
      .select('codeforcesHandle');
    if (!user) throw new NotFoundException('User not found');
    if (!user.codeforcesHandle) {
      throw new BadRequestException('User Codeforces handle is missing');
    }

    const problems = await this.problemModel
      .find({ sheetId: sheet._id })
      .sort({ orderIndex: 1 })
      .lean();

    if (!problems.length) {
      return {
        newlySolved: [],
        xpEarned: 0,
        sheetPct: 0,
        problemsSolved: 0,
        totalProblems: 0,
      };
    }

    const parsedByProblem = new Map<string, ParsedProblemId>();
    const allContestIds = new Set<number>();
    for (const p of problems) {
      const parsed = this.parseProblemId(p.cfProblemId);
      if (!parsed) continue;
      parsedByProblem.set(String(p._id), parsed);
      allContestIds.add(parsed.contestId);
    }

    const solvedFromStatus = await this.fetchSolvedFromStatus(
      user.codeforcesHandle,
    );

    if (allContestIds.size > 0) {
      const uniqueContestIds = Array.from(allContestIds);

      // 1. Fetch from standings (gym/group scoreboard standings check)
      try {
        const standingsSolved = await this.fetchSolvedFromGymContests(
          user.codeforcesHandle,
          uniqueContestIds,
        );
        for (const key of standingsSolved) solvedFromStatus.add(key);
      } catch (err) {
        console.error('Error fetching standings solved', err);
      }

      // 2. Fetch from contest status (individual submissions check for groups/gyms)
      try {
        const statusSolved = await this.fetchSolvedFromContestStatus(
          user.codeforcesHandle,
          uniqueContestIds,
        );
        for (const key of statusSolved) solvedFromStatus.add(key);
      } catch (err) {
        console.error('Error fetching contest status solved', err);
      }
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
    const xpAwardedProblemIds: Types.ObjectId[] = [];
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
            $set: {
              isSolved: true,
              solvedAt: new Date(),
            },
            $setOnInsert: { xpAwarded: false },
          },
          { upsert: true },
        );

        const earned = await this.awardXp(
          userId,
          p.xpReward ?? 0,
          `Solved ${p.cfProblemId}`,
          'problem',
          p._id,
        );
        xpEarned += earned;
        if (earned > 0) xpAwardedProblemIds.push(p._id);
      }
    }

    if (xpAwardedProblemIds.length > 0) {
      await this.problemProgressModel.updateMany(
        {
          userId: new Types.ObjectId(userId),
          problemId: { $in: xpAwardedProblemIds },
        },
        { $set: { xpAwarded: true } },
      );
    }

    const sheetPct =
      problems.length > 0
        ? Math.round((solvedProblemIds.size / problems.length) * 100)
        : 0;
    const sheetUnlockedNext =
      sheetPct >= (level.sheetUnlockTopicPct ?? DEFAULT_SHEET_UNLOCK_PCT);

    const video = await this.videoModel.findOne({ topicId: topic._id }).lean();
    const videoProgress = video
      ? await this.videoProgressModel.findOne({
          userId: new Types.ObjectId(userId),
          videoId: video._id,
        })
      : null;

    const videoPct = videoProgress?.watchPct ?? 0;
    const videoUnlockedSheet = Boolean(videoProgress?.isThresholdMet);

    await this.updateTopicProgress(userId, topic._id, {
      videoPct,
      videoUnlockedSheet,
      sheetPct,
      sheetUnlockedNext,
      isTopicComplete: videoUnlockedSheet && sheetUnlockedNext,
    });

    const topicProgress = await this.topicProgressModel.findOne({
      userId: new Types.ObjectId(userId),
      topicId: topic._id,
    });

    if (topicProgress?.isTopicComplete && !topicProgress.topicBonusAwarded) {
      const bonus = await this.awardXp(
        userId,
        TOPIC_BONUS_XP,
        `Completed topic ${topic._id.toString()}`,
        'topic',
        topic._id,
      );
      xpEarned += bonus;
      await this.topicProgressModel.updateOne(
        { _id: topicProgress._id },
        { $set: { topicBonusAwarded: bonus > 0 } },
      );
    }

    await this.ensureLevelProgress(userId, topic.levelId);

    const topicIds = await this.topicModel
      .find({ levelId: topic.levelId })
      .select('_id')
      .lean();

    const completedTopics = await this.topicProgressModel.countDocuments({
      userId: new Types.ObjectId(userId),
      topicId: { $in: topicIds.map((t) => t._id) },
      isTopicComplete: true,
    });

    const totalTopics = topicIds.length;
    const topicsCompletePct = totalTopics
      ? Math.round((completedTopics / totalTopics) * 100)
      : 0;
    const isLevelComplete =
      topicsCompletePct >= (level.levelCompletionPct ?? 100);

    const levelProgress = await this.levelProgressModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), levelId: topic.levelId },
      {
        $set: {
          topicsCompletePct,
          isLevelComplete,
          completedAt: isLevelComplete ? new Date() : null,
        },
        $setOnInsert: { unlockedAt: new Date(), levelBonusAwarded: false },
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (isLevelComplete && !levelProgress.levelBonusAwarded) {
      const bonus = await this.awardXp(
        userId,
        LEVEL_BONUS_XP,
        `Completed level ${topic.levelId.toString()}`,
        'level',
        topic.levelId,
      );
      xpEarned += bonus;
      await this.levelProgressModel.updateOne(
        { _id: levelProgress._id },
        { $set: { levelBonusAwarded: bonus > 0 } },
      );
    }

    return {
      newlySolved,
      xpEarned,
      sheetPct,
      problemsSolved: solvedProblemIds.size,
      totalProblems: problems.length,
      topicProgress: {
        sheetPct,
        sheetUnlockedNext,
        videoPct,
        videoUnlockedSheet,
        isTopicComplete: videoUnlockedSheet && sheetUnlockedNext,
      },
      levelProgress: {
        topicsCompletePct,
        isLevelComplete,
      },
    };
  }

  private async computeSolveStreak(userId: string): Promise<number> {
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

  async getLeaderboard(query: { level?: string; period?: string }) {
    const levelStr =
      query.level && query.level !== 'undefined' && query.level !== 'null'
        ? query.level
        : null;
    const levelId = levelStr ? this.toObjectId(levelStr, 'Level') : null;
    const period = query.period ?? 'all';
    const now = Date.now();
    const since =
      period === 'weekly'
        ? new Date(now - 7 * 86_400_000)
        : period === 'monthly'
          ? new Date(now - 30 * 86_400_000)
          : null;

    let xpByUser = new Map<string, number>();
    if (since) {
      const rows = await this.xpTransactionModel.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$userId', total: { $sum: '$amount' } } },
      ]);
      xpByUser = new Map(rows.map((r) => [String(r._id), Number(r.total)]));
    } else {
      const xpRows = await this.xpModel.find().lean();
      xpByUser = new Map(xpRows.map((r) => [String(r.userId), r.totalXp]));
    }

    const userIds = Array.from(xpByUser.keys()).map(
      (id) => new Types.ObjectId(id),
    );

    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('codeforcesHandle avatar')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    let topicIds: Types.ObjectId[] | null = null;
    let problemIds: Types.ObjectId[] | null = null;

    if (levelId) {
      const topics = await this.topicModel
        .find({ levelId })
        .select('_id')
        .lean();
      topicIds = topics.map((t) => t._id);
      const sheets = await this.sheetModel
        .find({ topicId: { $in: topicIds } })
        .select('_id')
        .lean();
      const sheetIds = sheets.map((s) => s._id);
      const problems = await this.problemModel
        .find({ sheetId: { $in: sheetIds } })
        .select('_id')
        .lean();
      problemIds = problems.map((p) => p._id);
    }

    const topicCounts = await this.topicProgressModel.aggregate([
      {
        $match: {
          isTopicComplete: true,
          ...(topicIds ? { topicId: { $in: topicIds } } : {}),
        },
      },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    const topicMap = new Map(
      topicCounts.map((r) => [String(r._id), Number(r.count)]),
    );

    const problemCounts = await this.problemProgressModel.aggregate([
      {
        $match: {
          isSolved: true,
          ...(problemIds ? { problemId: { $in: problemIds } } : {}),
        },
      },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    const problemMap = new Map(
      problemCounts.map((r) => [String(r._id), Number(r.count)]),
    );

    const entries = Array.from(xpByUser.entries()).map(([uid, totalXp]) => {
      const user = userMap.get(uid);
      return {
        userId: uid,
        handle: user?.codeforcesHandle ?? 'Unknown',
        avatar: user?.avatar ?? '',
        totalXp: totalXp ?? 0,
        topicsDone: topicMap.get(uid) ?? 0,
        problemsSolved: problemMap.get(uid) ?? 0,
        rank: 0,
      };
    });

    entries.sort((a, b) => b.totalXp - a.totalXp);

    let rank = 1;
    for (let i = 0; i < entries.length; i += 1) {
      if (i > 0 && entries[i].totalXp < entries[i - 1].totalXp) {
        rank = i + 1;
      }
      entries[i].rank = rank;
    }

    return entries;
  }

  private extractContestIdFromUrl(url?: string | null): number | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'contest' || p === 'contests');
      if (idx >= 0 && parts[idx + 1]) {
        const contestId = Number(parts[idx + 1]);
        return Number.isFinite(contestId) ? contestId : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async importProblems(sheetId: string, body: ImportProblemsDto) {
    const sheet = await this.sheetModel.findById(
      this.toObjectId(sheetId, 'Sheet'),
    );
    if (!sheet) throw new NotFoundException('Sheet not found');

    const contestId =
      body.contestId ?? this.extractContestIdFromUrl(sheet.cfGroupUrl);
    if (!contestId) {
      throw new BadRequestException(
        'Contest ID is required to import problems',
      );
    }

    const url = `https://codeforces.com/api/contest.standings?contestId=${contestId}&from=1&count=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.status !== 'OK') {
      throw new BadRequestException('Failed to fetch contest problems');
    }

    const problems = (data.result?.problems ?? []) as Array<{
      index: string;
      name?: string;
      rating?: number;
    }>;

    if (!problems.length) {
      return { count: 0 };
    }

    const existing = await this.problemModel
      .find({ sheetId: sheet._id })
      .select('cfProblemId')
      .lean();
    const existingIds = new Set(existing.map((p) => p.cfProblemId));

    const last = await this.problemModel
      .find({ sheetId: sheet._id })
      .sort({ orderIndex: -1 })
      .select('orderIndex')
      .limit(1)
      .lean();
    let orderIndex = last[0]?.orderIndex ?? 0;

    const inserts: Array<Partial<RoadmapProblem>> = [];
    for (const p of problems) {
      const cfProblemId = `${contestId}${p.index}`;
      if (existingIds.has(cfProblemId)) continue;
      orderIndex += 1;
      inserts.push({
        sheetId: sheet._id,
        cfProblemId,
        title: p.name ?? '',
        difficulty: p.rating ? String(p.rating) : '',
        orderIndex,
        xpReward: 10,
      });
    }

    if (inserts.length === 0) return { count: 0 };
    await this.problemModel.insertMany(inserts);
    return { count: inserts.length };
  }

  /**
   * Toggle a problem's solved status via manual checkbox.
   * Awards XP when marking solved, revokes XP when unmarking.
   * Recalculates topic and level progress after each toggle.
   */
  async toggleProblemSolved(
    userId: string,
    problemId: string,
    solved: boolean,
  ) {
    const probOid = this.toObjectId(problemId, 'Problem');
    const problem = await this.problemModel.findById(probOid).lean();
    if (!problem) throw new NotFoundException('Problem not found');

    const sheet = await this.sheetModel.findById(problem.sheetId).lean();
    if (!sheet) throw new NotFoundException('Sheet not found');

    const topic = await this.topicModel
      .findById(sheet.topicId)
      .select('levelId')
      .lean();
    if (!topic) throw new NotFoundException('Topic not found');

    const level = await this.levelModel
      .findById(topic.levelId)
      .select('sheetUnlockTopicPct levelCompletionPct')
      .lean();
    if (!level) throw new NotFoundException('Level not found');

    const userOid = new Types.ObjectId(userId);

    let xpDelta = 0;

    if (solved) {
      // Mark as solved
      await this.problemProgressModel.updateOne(
        { userId: userOid, problemId: probOid },
        {
          $set: {
            isSolved: true,
            solvedAt: new Date(),
          },
          $setOnInsert: { xpAwarded: false },
        },
        { upsert: true },
      );

      // Award XP
      const earned = await this.awardXp(
        userId,
        problem.xpReward ?? 0,
        `Solved ${problem.cfProblemId}`,
        'problem',
        probOid,
      );
      xpDelta = earned;

      if (earned > 0) {
        await this.problemProgressModel.updateOne(
          { userId: userOid, problemId: probOid },
          { $set: { xpAwarded: true } },
        );
      }
    } else {
      // Mark as unsolved
      const existing = await this.problemProgressModel.findOne({
        userId: userOid,
        problemId: probOid,
      });

      if (existing?.xpAwarded) {
        // Revoke XP by adding a negative transaction
        const revokeAmount = -(problem.xpReward ?? 0);
        if (revokeAmount < 0) {
          await this.xpTransactionModel.create({
            userId: userOid,
            amount: revokeAmount,
            reason: `Unmarked ${problem.cfProblemId}`,
            sourceType: 'problem_revoke',
            sourceId: probOid,
          });
          await this.xpModel.findOneAndUpdate(
            { userId: userOid },
            { $inc: { totalXp: revokeAmount } },
            { upsert: true },
          );
          xpDelta = revokeAmount;
        }
      }

      await this.problemProgressModel.updateOne(
        { userId: userOid, problemId: probOid },
        {
          $set: {
            isSolved: false,
            solvedAt: null,
            xpAwarded: false,
          },
        },
      );
    }

    // Recalculate sheet / topic / level progress
    const problems = await this.problemModel
      .find({ sheetId: sheet._id })
      .lean();
    const problemIds = problems.map((p) => p._id);

    const solvedDocs = await this.problemProgressModel
      .find({
        userId: userOid,
        problemId: { $in: problemIds },
        isSolved: true,
      })
      .lean();

    const sheetPct =
      problems.length > 0
        ? Math.round((solvedDocs.length / problems.length) * 100)
        : 0;
    const sheetUnlockedNext =
      sheetPct >= (level.sheetUnlockTopicPct ?? DEFAULT_SHEET_UNLOCK_PCT);

    const video = await this.videoModel.findOne({ topicId: topic._id }).lean();
    const videoProgress = video
      ? await this.videoProgressModel.findOne({
          userId: userOid,
          videoId: video._id,
        })
      : null;

    const videoPct = videoProgress?.watchPct ?? 0;
    const videoUnlockedSheet = Boolean(videoProgress?.isThresholdMet);

    const isTopicComplete = videoUnlockedSheet && sheetUnlockedNext;

    await this.updateTopicProgress(userId, topic._id, {
      videoPct,
      videoUnlockedSheet,
      sheetPct,
      sheetUnlockedNext,
      isTopicComplete,
    });

    // Topic bonus
    const topicProgress = await this.topicProgressModel.findOne({
      userId: userOid,
      topicId: topic._id,
    });

    if (isTopicComplete && !topicProgress?.topicBonusAwarded) {
      const bonus = await this.awardXp(
        userId,
        TOPIC_BONUS_XP,
        `Completed topic ${topic._id.toString()}`,
        'topic',
        topic._id,
      );
      xpDelta += bonus;
      await this.topicProgressModel.updateOne(
        { _id: topicProgress?._id },
        { $set: { topicBonusAwarded: bonus > 0 } },
      );
    }

    // Level progress
    await this.ensureLevelProgress(userId, topic.levelId);

    const topicIds = await this.topicModel
      .find({ levelId: topic.levelId })
      .select('_id')
      .lean();

    const completedTopics = await this.topicProgressModel.countDocuments({
      userId: userOid,
      topicId: { $in: topicIds.map((t) => t._id) },
      isTopicComplete: true,
    });

    const totalTopics = topicIds.length;
    const topicsCompletePct = totalTopics
      ? Math.round((completedTopics / totalTopics) * 100)
      : 0;
    const isLevelComplete =
      topicsCompletePct >= (level.levelCompletionPct ?? 100);

    await this.levelProgressModel.findOneAndUpdate(
      { userId: userOid, levelId: topic.levelId },
      {
        $set: {
          topicsCompletePct,
          isLevelComplete,
          completedAt: isLevelComplete ? new Date() : null,
        },
        $setOnInsert: { unlockedAt: new Date(), levelBonusAwarded: false },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return {
      problemId,
      isSolved: solved,
      xpDelta,
      sheetPct,
      problemsSolved: solvedDocs.length,
      totalProblems: problems.length,
    };
  }
}

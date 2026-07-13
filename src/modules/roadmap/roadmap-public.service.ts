import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { User, UserDocument } from '../auth/schemas/user.schema';
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
import { computeLearningPct } from './utils/learning-progress';

export type TopicProgressSnapshot = {
  learningPct: number;
  problemPct: number;
  isComplete: boolean;
};

@Injectable()
export class RoadmapPublicService {
  constructor(
    private readonly auth: AuthService,
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
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async resolveUserId(
    authHeader?: string,
    accessTokenCookie?: string,
  ): Promise<string | null> {
    const token = authHeader?.replace('Bearer ', '') ?? accessTokenCookie ?? '';
    if (!token) return null;
    try {
      const decoded = await this.auth.verifyAccessToken(token);
      return decoded?.userId ?? null;
    } catch {
      return null;
    }
  }

  private async isUserAdmin(userId: string | null): Promise<boolean> {
    if (!userId) return false;
    const user = await this.userModel.findById(userId).select('role').lean();
    return user?.role === 'admin';
  }

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`${label} not found`);
    }
    return new Types.ObjectId(id);
  }

  private async progressByTopic(
    userId: string | null,
    topicIds: Types.ObjectId[],
  ): Promise<Map<string, TopicProgressSnapshot>> {
    const map = new Map<string, TopicProgressSnapshot>();
    if (!userId || topicIds.length === 0) return map;

    const topicProgressDocs = await this.topicProgressModel
      .find({
        userId: new Types.ObjectId(userId),
        topicId: { $in: topicIds },
      })
      .lean();

    const topicProgressMap = new Map(
      topicProgressDocs.map((tp) => [String(tp.topicId), tp]),
    );

    for (const tId of topicIds) {
      const tp = topicProgressMap.get(String(tId));
      map.set(String(tId), {
        learningPct: tp?.learningPct ?? 0,
        problemPct: tp?.problemPct ?? 0,
        isComplete: tp?.isTopicComplete ?? false,
      });
    }

    return map;
  }

  async listLevels(userId: string | null) {
    const levels = await this.levelModel
      .find({ isPublished: true })
      .sort({ orderIndex: 1 })
      .lean();

    const hasSpecific = levels.some((l) => l.visibility === 'specific_users');
    const isAdmin = hasSpecific ? await this.isUserAdmin(userId) : false;

    const visibleLevels = isAdmin
      ? levels
      : levels.filter((l) => {
          if (l.visibility === 'specific_users') {
            if (!userId) return false;
            return l.allowedUserIds?.some((id) => String(id) === userId);
          }
          return true;
        });

    if (visibleLevels.length === 0) return [];

    const levelIds = visibleLevels.map((l) => l._id);
    const topicCounts = await this.topicModel.aggregate([
      { $match: { levelId: { $in: levelIds } } },
      { $group: { _id: '$levelId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      topicCounts.map((c) => [String(c._id), Number(c.count)]),
    );

    const topics = await this.topicModel
      .find({ levelId: { $in: levelIds } })
      .select('_id levelId orderIndex')
      .lean();
    const progress = await this.progressByTopic(
      userId,
      topics.map((t) => t._id),
    );

    const completedCountByLevel = new Map<string, number>();
    for (const t of topics) {
      const p = progress.get(String(t._id));
      if (!p?.isComplete) continue;
      const levelKey = String(t.levelId);
      completedCountByLevel.set(
        levelKey,
        (completedCountByLevel.get(levelKey) ?? 0) + 1,
      );
    }

    return visibleLevels.map((l) => ({
      ...l,
      topicsCount: countMap.get(String(l._id)) ?? 0,
      topicsUnlockedCount: completedCountByLevel.get(String(l._id)) ?? 0, // In user listing, show completed topics count
      isGranted:
        !!userId &&
        l.visibility === 'specific_users' &&
        l.allowedUserIds?.some((id) => String(id) === userId),
    }));
  }

  async getLevelDetail(levelId: string, userId: string | null) {
    const level = await this.levelModel
      .findOne({ _id: this.toObjectId(levelId, 'Level'), isPublished: true })
      .lean();
    if (!level) throw new NotFoundException('Level not found');

    if (level.visibility === 'specific_users') {
      const isAdmin = await this.isUserAdmin(userId);
      if (!isAdmin) {
        const hasAccess =
          userId && level.allowedUserIds?.some((id) => String(id) === userId);
        if (!hasAccess) throw new NotFoundException('Level not found');
      }
    }

    const topics = await this.topicModel
      .find({ levelId: level._id })
      .sort({ orderIndex: 1 })
      .lean();

    const topicIds = topics.map((t) => t._id);
    const progressMap = await this.progressByTopic(userId, topicIds);

    const problems = topicIds.length
      ? await this.problemModel.aggregate([
          { $match: { topicId: { $in: topicIds } } },
          { $group: { _id: '$topicId', count: { $sum: 1 } } },
        ])
      : [];
    const countMap = new Map(
      problems.map((c) => [String(c._id), Number(c.count)]),
    );

    let canAccess = true;
    let topicsCompletedCount = 0;

    const topicRows = topics.map((t) => {
      const progress = progressMap.get(String(t._id)) ?? {
        learningPct: 0,
        problemPct: 0,
        isComplete: false,
      };

      const isLocked = !canAccess;
      const isComplete = progress.isComplete;

      if (isComplete) topicsCompletedCount += 1;

      // Unlocking rule: Next topic unlocks if current is completed
      if (canAccess) {
        canAccess = isComplete;
      }

      return {
        ...t,
        problemsCount: countMap.get(String(t._id)) ?? 0,
        progress: {
          ...progress,
          isLocked,
          isComplete,
        },
      };
    });

    return {
      level: {
        ...level,
        topicsCount: topics.length,
        topicsUnlockedCount: topicsCompletedCount,
      },
      topics: topicRows,
    };
  }

  async getTopicDetail(
    levelId: string,
    topicId: string,
    userId: string | null,
    language?: 'Arabic' | 'English',
  ) {
    const level = await this.levelModel
      .findOne({ _id: this.toObjectId(levelId, 'Level'), isPublished: true })
      .lean();
    if (!level) throw new NotFoundException('Level not found');

    if (level.visibility === 'specific_users') {
      const isAdmin = await this.isUserAdmin(userId);
      if (!isAdmin) {
        const hasAccess =
          userId && level.allowedUserIds?.some((id) => String(id) === userId);
        if (!hasAccess) throw new NotFoundException('Level not found');
      }
    }

    const topic = await this.topicModel
      .findOne({ _id: this.toObjectId(topicId, 'Topic'), levelId: level._id })
      .lean();
    if (!topic) throw new NotFoundException('Topic not found');

    const allResources = await this.resourceModel
      .find({ topicId: topic._id })
      .sort({ orderIndex: 1 })
      .lean();

    const resources = language
      ? allResources.filter((r) => r.language === language)
      : allResources;

    const problems = await this.problemModel
      .find({ topicId: topic._id })
      .sort({ orderIndex: 1 })
      .lean();

    // Fetch user progress
    let learningPct = 0;
    let problemPct = 0;
    let isTopicComplete = false;
    const resourceProgress: Record<
      string,
      { watchPct: number; isCompleted: boolean; lastPositionSec: number }
    > = {};
    const problemProgress: Record<string, boolean> = {};

    if (userId) {
      const userOid = new Types.ObjectId(userId);
      const tp = await this.topicProgressModel
        .findOne({ userId: userOid, topicId: topic._id })
        .lean();
      if (tp) {
        problemPct = tp.problemPct ?? 0;
        isTopicComplete = tp.isTopicComplete ?? false;
      }

      const resProg = await this.resourceProgressModel
        .find({
          userId: userOid,
          resourceId: { $in: resources.map((r) => r._id) },
        })
        .lean();

      for (const rp of resProg) {
        resourceProgress[String(rp.resourceId)] = {
          watchPct: rp.watchPct ?? 0,
          isCompleted: rp.isCompleted ?? false,
          lastPositionSec: rp.lastPositionSec ?? 0,
        };
      }

      // Recalculate learning progress from filtered (language-specific)
      // resources — same normalized formula the unlock gate uses.
      learningPct = computeLearningPct(
        resources,
        (i) => resourceProgress[String(resources[i]._id)],
      );

      const probProg = await this.problemProgressModel
        .find({
          userId: userOid,
          problemId: { $in: problems.map((p) => p._id) },
          isSolved: true,
        })
        .lean();

      for (const pp of probProg) {
        problemProgress[String(pp.problemId)] = true;
      }
    }

    return {
      level,
      topic,
      resources,
      problems,
      progress: {
        learningPct,
        problemPct,
        isTopicComplete,
        resourceProgress,
        problemProgress,
      },
    };
  }
}

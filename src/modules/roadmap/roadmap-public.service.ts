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
import { UpdateVideoProgressDto } from './dto/update-video-progress.dto';

export type VideoProgressSnapshot = {
  videoPct: number;
  sheetUnlocked: boolean;
  lastPositionSec: number;
  sheetPct: number;
  sheetUnlockedNext: boolean;
};

@Injectable()
export class RoadmapPublicService {
  constructor(
    private readonly auth: AuthService,
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
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async resolveUserId(
    authHeader?: string,
    accessTokenCookie?: string,
  ): Promise<string | null> {
    const token = authHeader?.replace('Bearer ', '') ?? accessTokenCookie ?? '';
    if (!token) return null;
    const decoded = await this.auth.verifyAccessToken(token);
    return decoded?.userId ?? null;
  }

  async resolveUser(
    authHeader?: string,
    accessTokenCookie?: string,
  ): Promise<{ userId: string | null; isAdmin: boolean }> {
    const token = authHeader?.replace('Bearer ', '') ?? accessTokenCookie ?? '';
    if (!token) return { userId: null, isAdmin: false };
    const decoded = await this.auth.verifyAccessToken(token);
    if (!decoded?.userId) return { userId: null, isAdmin: false };
    const user = await this.userModel
      .findById(decoded.userId)
      .select('role')
      .lean();
    return { userId: decoded.userId, isAdmin: user?.role === 'admin' };
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
  ): Promise<Map<string, VideoProgressSnapshot>> {
    if (!userId || topicIds.length === 0) return new Map();

    const videos = await this.videoModel
      .find({ topicId: { $in: topicIds } })
      .select('_id topicId')
      .lean();

    if (!videos.length) return new Map();

    const videoIds = videos.map((v) => v._id);
    const videoToTopic = new Map(
      videos.map((v) => [String(v._id), String(v.topicId)]),
    );

    const progressDocs = await this.videoProgressModel
      .find({
        userId: new Types.ObjectId(userId),
        videoId: { $in: videoIds },
      })
      .lean();

    const topicProgressDocs = await this.topicProgressModel
      .find({
        userId: new Types.ObjectId(userId),
        topicId: { $in: topicIds },
      })
      .lean();

    const topicProgressMap = new Map(
      topicProgressDocs.map((tp) => [String(tp.topicId), tp]),
    );

    const map = new Map<string, VideoProgressSnapshot>();
    for (const p of progressDocs) {
      const topicId = videoToTopic.get(String(p.videoId));
      if (!topicId) continue;
      const topicProgress = topicProgressMap.get(topicId);
      map.set(topicId, {
        videoPct: p.watchPct ?? 0,
        sheetUnlocked: Boolean(p.isThresholdMet),
        lastPositionSec: p.lastPositionSec ?? 0,
        sheetPct: topicProgress?.sheetPct ?? 0,
        sheetUnlockedNext: Boolean(topicProgress?.sheetUnlockedNext),
      });
    }

    return map;
  }

  async listLevels(userId: string | null, isAdmin = false) {
    const levels = await this.levelModel
      .find({ isPublished: true })
      .sort({ orderIndex: 1 })
      .lean();

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
      .select('_id levelId')
      .lean();
    const progress = await this.progressByTopic(
      userId,
      topics.map((t) => t._id),
    );

    const unlockedCountByLevel = new Map<string, number>();
    for (const t of topics) {
      const p = progress.get(String(t._id));
      if (!p?.sheetUnlocked || !p?.sheetUnlockedNext) continue;
      const levelKey = String(t.levelId);
      unlockedCountByLevel.set(
        levelKey,
        (unlockedCountByLevel.get(levelKey) ?? 0) + 1,
      );
    }

    return visibleLevels.map((l) => ({
      ...l,
      topicsCount: countMap.get(String(l._id)) ?? 0,
      topicsUnlockedCount: unlockedCountByLevel.get(String(l._id)) ?? 0,
    }));
  }

  async getLevelDetail(levelId: string, userId: string | null, isAdmin = false) {
    const level = await this.levelModel
      .findOne({ _id: this.toObjectId(levelId, 'Level'), isPublished: true })
      .lean();
    if (!level) throw new NotFoundException('Level not found');

    if (!isAdmin && level.visibility === 'specific_users') {
      const hasAccess = userId && level.allowedUserIds?.some((id) => String(id) === userId);
      if (!hasAccess) throw new NotFoundException('Level not found');
    }

    const topics = await this.topicModel
      .find({ levelId: level._id })
      .sort({ orderIndex: 1 })
      .lean();

    const topicIds = topics.map((t) => t._id);
    const progressMap = await this.progressByTopic(userId, topicIds);

    const videos = topicIds.length
      ? await this.videoModel
          .find({ topicId: { $in: topicIds } })
          .select('topicId')
          .lean()
      : [];
    const sheets = topicIds.length
      ? await this.sheetModel
          .find({ topicId: { $in: topicIds } })
          .select('_id topicId')
          .lean()
      : [];

    const videoSet = new Set(videos.map((v) => String(v.topicId)));
    const sheetMap = new Map(sheets.map((s) => [String(s.topicId), s._id]));
    const sheetIds = sheets.map((s) => s._id);

    const problemCounts = sheetIds.length
      ? await this.problemModel.aggregate([
          { $match: { sheetId: { $in: sheetIds } } },
          { $group: { _id: '$sheetId', count: { $sum: 1 } } },
        ])
      : [];
    const countMap = new Map(
      problemCounts.map((c) => [String(c._id), Number(c.count)]),
    );

    let canAccess = true;
    let topicsUnlockedCount = 0;
    const topicRows = topics.map((t) => {
      const progress =
        progressMap.get(String(t._id)) ??
        ({
          videoPct: 0,
          sheetUnlocked: false,
          lastPositionSec: 0,
          sheetPct: 0,
          sheetUnlockedNext: false,
        } as const);

      const isLocked = !canAccess;
      const sheetUnlocked = progress.sheetUnlocked;
      const sheetUnlockedNext = progress.sheetUnlockedNext;
      const isComplete = false;

      if (sheetUnlocked && sheetUnlockedNext) topicsUnlockedCount += 1;

      if (canAccess) {
        canAccess = sheetUnlocked && sheetUnlockedNext;
      }

      return {
        ...t,
        hasVideo: videoSet.has(String(t._id)),
        hasSheet: sheetMap.has(String(t._id)),
        problemsCount: sheetMap.get(String(t._id))
          ? (countMap.get(String(sheetMap.get(String(t._id)))) ?? 0)
          : 0,
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
        topicsUnlockedCount,
      },
      topics: topicRows,
    };
  }

  async getTopicDetail(
    levelId: string,
    topicId: string,
    userId: string | null,
    isAdmin = false,
  ) {
    const level = await this.levelModel
      .findOne({ _id: this.toObjectId(levelId, 'Level'), isPublished: true })
      .lean();
    if (!level) throw new NotFoundException('Level not found');

    if (!isAdmin && level.visibility === 'specific_users') {
      const hasAccess = userId && level.allowedUserIds?.some((id) => String(id) === userId);
      if (!hasAccess) throw new NotFoundException('Level not found');
    }

    const topic = await this.topicModel
      .findOne({ _id: this.toObjectId(topicId, 'Topic'), levelId: level._id })
      .lean();
    if (!topic) throw new NotFoundException('Topic not found');

    const video = await this.videoModel.findOne({ topicId: topic._id }).lean();
    const sheet = await this.sheetModel.findOne({ topicId: topic._id }).lean();
    const problems = sheet
      ? await this.problemModel
          .find({ sheetId: sheet._id })
          .sort({ orderIndex: 1 })
          .lean()
      : [];

    const progressMap = await this.progressByTopic(userId, [topic._id]);
    const basicProgress = progressMap.get(String(topic._id)) ?? {
      videoPct: 0,
      sheetUnlocked: false,
      lastPositionSec: 0,
    };

    const problemProgress: Record<string, boolean> = {};
    if (userId && problems.length > 0) {
      const solvedProblems = await this.problemProgressModel
        .find({
          userId: new Types.ObjectId(userId),
          problemId: { $in: problems.map((p) => p._id) },
          isSolved: true,
        })
        .lean();
      for (const p of solvedProblems) {
        problemProgress[String(p.problemId)] = true;
      }
    }

    const progress = {
      ...basicProgress,
      problemProgress,
    };

    return {
      level,
      topic,
      video,
      sheet,
      problems,
      progress,
    };
  }

  async updateVideoProgress(
    userId: string,
    videoId: string,
    dto: UpdateVideoProgressDto,
  ) {
    const vid = this.toObjectId(videoId, 'Video');

    const video = await this.videoModel.findById(vid).lean();
    if (!video) throw new NotFoundException('Video not found');

    const topic = await this.topicModel
      .findById(video.topicId)
      .select('levelId')
      .lean();
    if (!topic) throw new NotFoundException('Topic not found');

    const level = await this.levelModel
      .findById(topic.levelId)
      .select('videoUnlockSheetPct')
      .lean();

    const threshold = level?.videoUnlockSheetPct ?? 80;

    const existing = await this.videoProgressModel.findOne({
      userId: new Types.ObjectId(userId),
      videoId: vid,
    });

    const nextPct = Math.min(100, Math.max(0, dto.watchPct));
    const watchPct = Math.max(existing?.watchPct ?? 0, nextPct);
    const lastPositionSec = Math.max(
      0,
      dto.positionSec ?? existing?.lastPositionSec ?? 0,
    );
    const isThresholdMet = watchPct >= threshold;

    const updated = await this.videoProgressModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), videoId: vid },
      {
        $set: {
          watchPct,
          lastPositionSec,
          isThresholdMet,
        },
        $setOnInsert: {
          xpAwarded: false,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    return {
      watchPct: updated?.watchPct ?? watchPct,
      lastPositionSec: updated?.lastPositionSec ?? lastPositionSec,
      sheetUnlocked: updated?.isThresholdMet ?? isThresholdMet,
      threshold,
    };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import {
  Training,
  type TrainingDocument,
  type TrainingProblemStored,
} from '../trainings/schemas/training.schema';
import {
  UpsolvedProblem,
  type UpsolvedProblemDocument,
} from '../upsolve/schemas/upsolved-problem.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { averageEffectiveProblemRatingForSession } from '../trainings/utils/session-performance';
import {
  RoadmapLevel,
  type RoadmapLevelDocument,
} from '../roadmap/schemas/roadmap-level.schema';
import { UserXp, type UserXpDocument } from '../roadmap/schemas/user-xp.schema';
import {
  UserLevelProgress,
  type UserLevelProgressDocument,
} from '../roadmap/schemas/user-level-progress.schema';
import {
  UserTopicProgress,
  type UserTopicProgressDocument,
} from '../roadmap/schemas/user-topic-progress.schema';
import { getRankFromRating } from '../../common/utils/rating';

@Injectable()
export class AdminService {
  constructor(
    private readonly auth: AuthService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
    @InjectModel(UpsolvedProblem.name)
    private readonly upsolveModel: Model<UpsolvedProblemDocument>,
    @InjectModel(RoadmapLevel.name)
    private readonly levelModel: Model<RoadmapLevelDocument>,
    @InjectModel(UserXp.name)
    private readonly userXpModel: Model<UserXpDocument>,
    @InjectModel(UserLevelProgress.name)
    private readonly userLevelProgressModel: Model<UserLevelProgressDocument>,
    @InjectModel(UserTopicProgress.name)
    private readonly userTopicProgressModel: Model<UserTopicProgressDocument>,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async requireAdmin(authHeader?: string, accessTokenCookie?: string) {
    const token = authHeader?.replace('Bearer ', '') ?? accessTokenCookie ?? '';
    const decoded = token ? await this.auth.verifyAccessToken(token) : null;
    if (!decoded) throw new UnauthorizedException('Unauthorized');
    const currentUser = await this.userModel.findById(decoded.userId);
    if (currentUser?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return currentUser;
  }

  async stats() {
    const { thirtyDaysAgo, trendStart, trendStartMs } =
      this.getDateBoundaries();

    const solvedProblemsExpression = this.getSolvedExpression();

    const [
      userStats,
      trainingStats,
      upsolveStats,
      ratingBandsRaw,
      trainingModesRaw,
      userTrendRaw,
      trainingTrendRaw,
      upsolveTrendRaw,
      activeTrainingUsers,
      activeUpsolveUsers,
      totalLevels,
      roadmapXpStats,
      roadmapLevelStats,
      roadmapTopicStats,
    ] = await Promise.all([
      this.userModel.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            adminUsers: {
              $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] },
            },
            recentlyJoinedUsers: {
              $sum: { $cond: [{ $gte: ['$createdAt', thirtyDaysAgo] }, 1, 0] },
            },
            verifiedUsers: {
              $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] },
            },
            averageRating: {
              $avg: {
                $cond: [{ $gt: ['$rating', 0] }, '$rating', null],
              },
            },
          },
        },
      ]),
      this.trainingModel.aggregate([
        {
          $group: {
            _id: null,
            totalTrainings: { $sum: 1 },
            completedTrainings: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            activeTrainings: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
            },
            abandonedTrainings: {
              $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] },
            },
            totalTrainingProblems: {
              $sum: { $size: { $ifNull: ['$problems', []] } },
            },
            solvedTrainingProblems: { $sum: solvedProblemsExpression },
            averagePerformance: { $avg: '$performance' },
            bestPerformance: { $max: '$performance' },
          },
        },
      ]),
      this.upsolveModel.aggregate([
        {
          $group: {
            _id: null,
            totalUpsolvedProblems: { $sum: 1 },
            completedUpsolves: {
              $sum: {
                $cond: [
                  { $ne: [{ $ifNull: ['$solvedTime', null] }, null] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      this.userModel.aggregate([
        {
          $project: {
            band: {
              $switch: {
                branches: [
                  {
                    case: { $lt: [{ $ifNull: ['$rating', 0] }, 1200] },
                    then: '<1200',
                  },
                  {
                    case: { $lt: [{ $ifNull: ['$rating', 0] }, 1400] },
                    then: '1200-1399',
                  },
                  {
                    case: { $lt: [{ $ifNull: ['$rating', 0] }, 1600] },
                    then: '1400-1599',
                  },
                  {
                    case: { $lt: [{ $ifNull: ['$rating', 0] }, 1900] },
                    then: '1600-1899',
                  },
                  {
                    case: { $lt: [{ $ifNull: ['$rating', 0] }, 2100] },
                    then: '1900-2099',
                  },
                  {
                    case: { $lt: [{ $ifNull: ['$rating', 0] }, 2400] },
                    then: '2100-2399',
                  },
                ],
                default: '2400+',
              },
            },
          },
        },
        { $group: { _id: '$band', count: { $sum: 1 } } },
      ]),
      this.trainingModel.aggregate([
        {
          $group: {
            _id: '$trainingMode',
            sessions: { $sum: 1 },
            solved: { $sum: solvedProblemsExpression },
          },
        },
        { $sort: { sessions: -1 } },
      ]),
      this.userModel.aggregate([
        { $match: { createdAt: { $gte: trendStart } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            users: { $sum: 1 },
          },
        },
      ]),
      this.trainingModel.aggregate([
        { $match: { startTime: { $gte: trendStartMs } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $toDate: '$startTime' },
              },
            },
            sessions: { $sum: 1 },
          },
        },
      ]),
      this.upsolveModel.aggregate([
        { $match: { createdAt: { $gte: trendStart } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            upsolves: { $sum: 1 },
          },
        },
      ]),
      this.trainingModel.distinct('user', {
        startTime: { $gte: thirtyDaysAgo.getTime() },
      }),
      this.upsolveModel.distinct('user', {
        $or: [
          { createdAt: { $gte: thirtyDaysAgo } },
          { solvedTime: { $gte: thirtyDaysAgo.getTime() } },
        ],
      }),
      this.levelModel.countDocuments(),
      this.userXpModel.aggregate([
        {
          $group: {
            _id: null,
            totalXpEarned: { $sum: '$totalXp' },
            usersWithXp: { $sum: 1 },
          },
        },
      ]),
      this.userLevelProgressModel.aggregate([
        {
          $group: {
            _id: null,
            totalLevelsCompleted: {
              $sum: { $cond: ['$isLevelComplete', 1, 0] },
            },
          },
        },
      ]),
      this.userTopicProgressModel.aggregate([
        {
          $group: {
            _id: null,
            totalTopicsCompleted: {
              $sum: { $cond: ['$isTopicComplete', 1, 0] },
            },
          },
        },
      ]),
    ]);

    const userTotals = userStats[0] ?? {};
    const trainingTotals = trainingStats[0] ?? {};
    const upsolveTotals = upsolveStats[0] ?? {};
    const roadmapXpTotals = roadmapXpStats[0] ?? {};
    const roadmapLevelTotals = roadmapLevelStats[0] ?? {};
    const roadmapTopicTotals = roadmapTopicStats[0] ?? {};
    const totalUsers = userTotals.totalUsers ?? 0;
    const adminUsers = userTotals.adminUsers ?? 0;
    const totalTrainingProblems = trainingTotals.totalTrainingProblems ?? 0;
    const solvedTrainingProblems = trainingTotals.solvedTrainingProblems ?? 0;
    const totalUpsolvedProblems = upsolveTotals.totalUpsolvedProblems ?? 0;
    const completedUpsolves = upsolveTotals.completedUpsolves ?? 0;

    const ratingBands = this.buildRatingBands(ratingBandsRaw);

    const trainingModes = this.buildTrainingModes(trainingModesRaw);

    const activityTrend = this.buildActivityTrend(
      trendStart,
      userTrendRaw,
      trainingTrendRaw,
      upsolveTrendRaw,
    );

    const activeUserIds = new Set([
      ...activeTrainingUsers.map((id) => String(id)),
      ...activeUpsolveUsers.map((id) => String(id)),
    ]);

    return {
      totalUsers,
      adminUsers,
      regularUsers: Math.max(totalUsers - adminUsers, 0),
      recentlyJoinedUsers: userTotals.recentlyJoinedUsers ?? 0,
      verifiedUsers: userTotals.verifiedUsers ?? 0,
      unverifiedUsers: Math.max(
        totalUsers - (userTotals.verifiedUsers ?? 0),
        0,
      ),
      activeUsers: activeUserIds.size,
      averageRating: Math.round(Number(userTotals.averageRating) || 0),
      totalTrainings: trainingTotals.totalTrainings ?? 0,
      completedTrainings: trainingTotals.completedTrainings ?? 0,
      activeTrainings: trainingTotals.activeTrainings ?? 0,
      abandonedTrainings: trainingTotals.abandonedTrainings ?? 0,
      totalTrainingProblems,
      solvedTrainingProblems,
      solvingRate:
        totalTrainingProblems > 0
          ? Math.round((solvedTrainingProblems / totalTrainingProblems) * 100)
          : 0,
      averagePerformance: Math.round(
        Number(trainingTotals.averagePerformance) || 0,
      ),
      bestPerformance: Math.round(Number(trainingTotals.bestPerformance) || 0),
      totalUpsolvedProblems,
      completedUpsolves,
      upsolveSolveRate:
        totalUpsolvedProblems > 0
          ? Math.round((completedUpsolves / totalUpsolvedProblems) * 100)
          : 0,
      totalLevels: totalLevels ?? 0,
      totalXpEarned: roadmapXpTotals.totalXpEarned ?? 0,
      totalLevelsCompleted: roadmapLevelTotals.totalLevelsCompleted ?? 0,
      totalTopicsCompleted: roadmapTopicTotals.totalTopicsCompleted ?? 0,
      ratingBands,
      trainingModes,
      activityTrend,
    };
  }

  private getDateBoundaries() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const trendStart = new Date(now);
    trendStart.setUTCHours(0, 0, 0, 0);
    trendStart.setUTCDate(trendStart.getUTCDate() - 6);
    const trendStartMs = trendStart.getTime();
    return { now, thirtyDaysAgo, trendStart, trendStartMs };
  }

  private getSolvedExpression() {
    return {
      $size: {
        $filter: {
          input: { $ifNull: ['$problems', []] },
          as: 'problem',
          cond: {
            $or: [
              { $eq: ['$$problem.isSolved', true] },
              { $ne: [{ $ifNull: ['$$problem.solvedTime', null] }, null] },
              { $ne: [{ $ifNull: ['$$problem.solvedAt', null] }, null] },
            ],
          },
        },
      },
    };
  }

  private buildRatingBands(ratingBandsRaw: { _id: string; count: number }[]) {
    const ratingBandOrder = [
      '<1200',
      '1200-1399',
      '1400-1599',
      '1600-1899',
      '1900-2099',
      '2100-2399',
      '2400+',
    ];
    const ratingBandMap = new Map(
      ratingBandsRaw.map((band) => [band._id, band.count]),
    );
    return ratingBandOrder.map((label) => ({
      label,
      count: ratingBandMap.get(label) ?? 0,
    }));
  }

  private buildTrainingModes(
    trainingModesRaw: { _id: string; sessions: number; solved: number }[],
  ) {
    const modeOrder = ['ladder', 'weakness', 'speed', 'contest', 'endurance'];
    const modeMap = new Map(
      trainingModesRaw.map((mode) => [
        mode._id ?? 'ladder',
        { sessions: mode.sessions ?? 0, solved: mode.solved ?? 0 },
      ]),
    );
    return modeOrder.map((mode) => {
      const modeStats = modeMap.get(mode) ?? { sessions: 0, solved: 0 };
      return {
        mode,
        label: mode.charAt(0).toUpperCase() + mode.slice(1),
        sessions: modeStats.sessions,
        solved: modeStats.solved,
      };
    });
  }

  private buildActivityTrend(
    trendStart: Date,
    userTrend: { _id: string; users: number }[],
    trainingTrend: { _id: string; sessions: number }[],
    upsolveTrend: { _id: string; upsolves: number }[],
  ) {
    const trendMap = new Map<
      string,
      {
        date: string;
        label: string;
        users: number;
        sessions: number;
        upsolves: number;
      }
    >();
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(trendStart);
      date.setUTCDate(trendStart.getUTCDate() + index);
      const dateKey = date.toISOString().slice(0, 10);
      trendMap.set(dateKey, {
        date: dateKey,
        label: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }),
        users: 0,
        sessions: 0,
        upsolves: 0,
      });
    }
    for (const row of userTrend) {
      const bucket = trendMap.get(row._id);
      if (bucket) bucket.users = row.users ?? 0;
    }
    for (const row of trainingTrend) {
      const bucket = trendMap.get(row._id);
      if (bucket) bucket.sessions = row.sessions ?? 0;
    }
    for (const row of upsolveTrend) {
      const bucket = trendMap.get(row._id);
      if (bucket) bucket.upsolves = row.upsolves ?? 0;
    }
    return Array.from(trendMap.values());
  }

  async listUsers(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userModel
        .find({})
        .select('codeforcesHandle role rating rank avatar createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.userModel.countDocuments({}),
    ]);
    return { users, total, page, limit };
  }

  async updateUserRole(
    currentAdminId: string,
    userId: string,
    role: 'admin' | 'user',
  ) {
    if (!userId || !role) throw new NotFoundException('Invalid data');
    if (String(currentAdminId) === userId && role !== 'admin') {
      throw new ForbiddenException(
        'You cannot remove your own admin privileges',
      );
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, { role }, { returnDocument: 'after' })
      .select('codeforcesHandle role rating rank avatar createdAt');

    if (!updatedUser) throw new NotFoundException('User not found');

    const adminHandle =
      (await this.userModel.findById(currentAdminId))?.codeforcesHandle ||
      'Unknown';
    const previousRole = role === 'admin' ? 'user' : 'admin';

    await this.auditLogs.logAction(
      'UPDATE_ROLE',
      'User',
      currentAdminId,
      adminHandle,
      { userId, newRole: role, previousRole },
      userId,
    );

    return {
      message: `User role updated to ${role}`,
      user: updatedUser,
    };
  }

  async userStats(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('User not found');
    }
    const uid = new Types.ObjectId(userId);

    const user = await this.userModel.findById(uid);
    if (!user) throw new NotFoundException('User not found');

    /** Match ObjectId field exactly — same as TrainingsService.listTrainings */
    const trainings = await this.trainingModel
      .find({ user: uid })
      .sort({ startTime: -1 });
    const upsolvedProblems = await this.upsolveModel.find({ user: uid });

    const totalSessions = trainings.length;
    const totalProblems = trainings.reduce(
      (acc, session) => acc + session.problems.length,
      0,
    );
    const solvedProblems = trainings.reduce(
      (acc, session) =>
        acc +
        session.problems.filter(
          (p: TrainingProblemStored) =>
            p.isSolved || (p.solvedTime !== null && p.solvedTime !== undefined),
        ).length,
      0,
    );
    const upsolvedCount = upsolvedProblems.length;
    const upsolvedSolvedCount = upsolvedProblems.filter(
      (p) => p.solvedTime !== null && p.solvedTime !== undefined,
    ).length;

    const averagePerformance =
      totalSessions > 0
        ? Math.round(
            trainings.reduce((acc, session) => acc + session.performance, 0) /
              totalSessions,
          )
        : 0;

    const bestPerformance =
      totalSessions > 0
        ? Math.max(...trainings.map((session) => session.performance))
        : 0;

    const worstPerformance =
      totalSessions > 0
        ? Math.min(...trainings.map((session) => session.performance))
        : 0;

    const solvingRate =
      totalProblems > 0
        ? Math.round((solvedProblems / totalProblems) * 100)
        : 0;

    const averageRatingRaw =
      totalSessions > 0
        ? trainings.reduce(
            (acc, session) =>
              acc +
              averageEffectiveProblemRatingForSession(
                session.customRatings,
                session.problems,
              ),
            0,
          ) / totalSessions
        : 0;
    const averageRating = Number.isFinite(averageRatingRaw)
      ? Math.round(averageRatingRaw)
      : 0;

    const recentTrend =
      totalSessions >= 2
        ? trainings[0].performance - trainings[1].performance
        : 0;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentSessions = trainings.filter(
      (t) => t.startTime >= thirtyDaysAgo,
    ).length;

    const [xpDoc, levelsCompleted, topicsCompleted] = await Promise.all([
      this.userXpModel.findOne({ userId: uid }).lean(),
      this.userLevelProgressModel.countDocuments({
        userId: uid,
        isLevelComplete: true,
      }),
      this.userTopicProgressModel.countDocuments({
        userId: uid,
        isTopicComplete: true,
      }),
    ]);

    return {
      user: {
        codeforcesHandle: user.codeforcesHandle,
        rating: user.rating,
        rank: user.rank,
        maxRating: user.maxRating,
        maxRank: user.maxRank,
        avatar: user.avatar,
        xp: xpDoc?.totalXp ?? 0,
        levelsCompleted,
        topicsCompleted,
      },
      stats: {
        totalSessions,
        totalProblems,
        solvedProblems,
        upsolvedCount,
        upsolvedSolvedCount,
        averagePerformance,
        bestPerformance,
        worstPerformance,
        solvingRate,
        averageRating,
        recentTrend,
        recentSessions,
      },
      trainings: trainings.slice(0, 10).map((t) => ({
        id: String(t._id),
        startTime: t.startTime,
        endTime: t.endTime,
        performance: t.performance,
        problemsCount: t.problems.length,
        solvedCount: t.problems.filter(
          (p: TrainingProblemStored) =>
            p.isSolved || (p.solvedTime !== null && p.solvedTime !== undefined),
        ).length,
      })),
    };
  }

  async listLogs(limit?: number, offset?: number, filters?: any) {
    return await this.auditLogs.listLogs(limit, offset, filters);
  }

  async syncUserRating(currentAdminId: string, userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    const uid = new Types.ObjectId(userId);
    const user = await this.userModel.findById(uid);
    if (!user) throw new NotFoundException('User not found');

    let data: any;
    try {
      const res = await fetch(
        `https://codeforces.com/api/user.info?handles=${encodeURIComponent(
          user.codeforcesHandle,
        )}`,
        { signal: AbortSignal.timeout(8000) },
      );
      data = await res.json();
    } catch {
      throw new BadRequestException(
        'Unable to reach Codeforces API. Please try again later.',
      );
    }
    if (data?.status !== 'OK' || !data.result?.[0]) {
      throw new BadRequestException(
        'Codeforces API is currently unavailable. Please try again later.',
      );
    }
    const cfUser = data.result[0];

    const currentRating = Number(cfUser.rating ?? 0);
    const currentRank = cfUser.rank ?? getRankFromRating(currentRating);
    const maxRating = Number(cfUser.maxRating ?? 0);
    const maxRank = cfUser.maxRank ?? getRankFromRating(maxRating);

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        uid,
        {
          rating: currentRating,
          rank: currentRank,
          maxRating,
          maxRank,
          organization: cfUser.organization,
          lastSyncTime: Date.now(),
          avatar: cfUser.avatar ?? user.avatar,
        },
        { returnDocument: 'after' },
      )
      .select('codeforcesHandle role rating rank avatar createdAt');

    const admin = await this.userModel.findById(currentAdminId);
    const adminHandle = admin?.codeforcesHandle || 'Unknown';

    await this.auditLogs.logAction(
      'SYNC_RATING',
      'User',
      currentAdminId,
      adminHandle,
      {
        userId,
        handle: user.codeforcesHandle,
        rating: currentRating,
        previousRating: user.rating,
      },
      userId,
    );

    return {
      message: 'Rating synced successfully',
      user: updatedUser,
    };
  }

  async syncBatchUserRatings(currentAdminId: string, userIds: string[]) {
    if (!userIds?.length) {
      throw new BadRequestException('No user IDs provided');
    }

    // Fetch all users from DB
    const validIds = userIds.filter((id) => Types.ObjectId.isValid(id));
    const users = await this.userModel.find({ _id: { $in: validIds } });
    if (!users.length) throw new NotFoundException('No valid users found');

    // Build handles list and fetch from Codeforces in one call
    const handles = users.map((u) => u.codeforcesHandle).join(';');
    let data: any;
    try {
      const res = await fetch(
        `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handles)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      data = await res.json();
    } catch {
      throw new BadRequestException(
        'Unable to reach Codeforces API. Please try again later.',
      );
    }
    if (data?.status !== 'OK' || !data.result?.length) {
      throw new BadRequestException(
        'Codeforces API is currently unavailable. Please try again later.',
      );
    }

    // Map CF results by handle (lowercase) for easy lookup
    const cfMap = new Map<string, any>();
    for (const cfUser of data.result) {
      cfMap.set((cfUser.handle as string).toLowerCase(), cfUser);
    }

    const admin = await this.userModel.findById(currentAdminId);
    const adminHandle = admin?.codeforcesHandle || 'Unknown';

    let synced = 0;
    let failed = 0;

    for (const user of users) {
      const cfUser = cfMap.get(user.codeforcesHandle.toLowerCase());
      if (!cfUser) {
        failed++;
        continue;
      }

      const currentRating: number = Number(cfUser.rating) || 0;
      const currentRank = cfUser.rank ?? getRankFromRating(currentRating);
      const maxRating: number = Number(cfUser.maxRating) || 0;
      const maxRank = cfUser.maxRank ?? getRankFromRating(maxRating);

      await this.userModel.findByIdAndUpdate(user._id, {
        rating: currentRating,
        rank: currentRank,
        maxRating,
        maxRank,
        organization: cfUser.organization,
        lastSyncTime: Date.now(),
        avatar: cfUser.avatar ?? user.avatar,
      });

      await this.auditLogs.logAction(
        'SYNC_RATING',
        'User',
        currentAdminId,
        adminHandle,
        {
          userId: String(user._id),
          handle: user.codeforcesHandle,
          rating: currentRating,
          previousRating: user.rating,
        },
        String(user._id),
      );

      synced++;
    }

    return { message: `Synced ${synced} user(s)`, synced, failed };
  }

  async lockUser(adminId: string, targetUserId: string) {
    const target = await this.userModel.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');

    await this.userModel.findByIdAndUpdate(targetUserId, { locked: true });
    await this.auditLogs.logAction(
      'LOCK_USER',
      'User',
      adminId,
      'admin',
      { targetUserId, targetHandle: target.codeforcesHandle },
      targetUserId,
    );
    return { message: 'User locked' };
  }

  async unlockUser(adminId: string, targetUserId: string) {
    const target = await this.userModel.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');

    await this.userModel.findByIdAndUpdate(targetUserId, { locked: false });
    await this.auditLogs.logAction(
      'UNLOCK_USER',
      'User',
      adminId,
      'admin',
      { targetUserId, targetHandle: target.codeforcesHandle },
      targetUserId,
    );
    return { message: 'User unlocked' };
  }
}

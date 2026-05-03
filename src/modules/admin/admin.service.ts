import {
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

@Injectable()
export class AdminService {
  constructor(
    private readonly auth: AuthService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
    @InjectModel(UpsolvedProblem.name)
    private readonly upsolveModel: Model<UpsolvedProblemDocument>,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async requireAdmin(authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '') ?? '';
    const decoded = token ? await this.auth.verifyAccessToken(token) : null;
    if (!decoded) throw new UnauthorizedException('Unauthorized');
    const currentUser = await this.userModel.findById(decoded.userId);
    if (currentUser?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return currentUser;
  }

  async stats() {
    const userStats = await this.userModel.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          adminUsers: {
            $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] },
          },
        },
      },
    ]);

    return {
      totalUsers: userStats[0]?.totalUsers || 0,
      adminUsers: userStats[0]?.adminUsers || 0,
    };
  }

  async listUsers() {
    const users = await this.userModel
      .find({})
      .select('codeforcesHandle role rating rank avatar createdAt')
      .sort({ createdAt: -1 });
    return { users };
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

    const adminHandle = (await this.userModel.findById(currentAdminId))?.codeforcesHandle || 'Unknown';
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
            p.isSolved ||
            (p.solvedTime !== null && p.solvedTime !== undefined),
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
                session.problems as TrainingProblemStored[],
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

    return {
      user: {
        codeforcesHandle: user.codeforcesHandle,
        rating: user.rating,
        rank: user.rank,
        maxRating: user.maxRating,
        maxRank: user.maxRank,
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
            p.isSolved ||
            (p.solvedTime !== null && p.solvedTime !== undefined),
        ).length,
      })),
    };
  }

  async listLogs(limit?: number, offset?: number, filters?: any) {
    return await this.auditLogs.listLogs(limit, offset, filters);
  }
}

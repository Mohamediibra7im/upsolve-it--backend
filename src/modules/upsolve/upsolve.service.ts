import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import {
  UpsolvedProblem,
  type UpsolvedProblemDocument,
} from './schemas/upsolved-problem.schema';

@Injectable()
export class UpsolveService {
  constructor(
    private readonly auth: AuthService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(UpsolvedProblem.name)
    private readonly upsolveModel: Model<UpsolvedProblemDocument>,
  ) {}

  async getUserFromAuthHeader(authHeader?: string) {
    const token = authHeader?.split(' ')[1];
    if (!token) return null;
    const decoded = await this.auth.verifyAccessToken(token);
    if (!decoded) return null;
    return await this.userModel.findById(decoded.userId);
  }

  async list(userId: string) {
    return await this.upsolveModel
      .find({ user: userId })
      .sort({ createdAt: 1, _id: 1 });
  }

  async insertMany(userId: string, problems: any[]) {
    const docs = problems.map((p) => ({ ...p, user: userId }));
    await this.upsolveModel.insertMany(docs, { ordered: false });
  }

  async bulkUpdateSolvedTime(userId: string, problems: any[]) {
    const bulkOps = problems.map((problem) => ({
      updateOne: {
        filter: {
          user: userId,
          contestId: problem.contestId,
          index: problem.index,
        },
        update: { $set: { solvedTime: problem.solvedTime } },
      },
    }));
    await this.upsolveModel.bulkWrite(bulkOps);
  }

  async deleteOne(userId: string, contestId: number, index: string) {
    await this.upsolveModel.deleteOne({ user: userId, contestId, index });
  }
}

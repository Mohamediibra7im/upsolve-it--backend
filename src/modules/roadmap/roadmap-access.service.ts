import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../auth/schemas/user.schema';
import { RoadmapLevel } from './schemas/roadmap-level.schema';

@Injectable()
export class RoadmapAccessService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(RoadmapLevel.name)
    private readonly levels: Model<RoadmapLevel>,
  ) {}

  async requireLevel(id: string | Types.ObjectId, userId?: string | null) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Level not found');
    const level = await this.levels
      .findOne({ _id: id, isPublished: true })
      .lean();
    if (!level) throw new NotFoundException('Level not found');
    if (level.visibility === 'specific_users') {
      const user = userId
        ? await this.users.findById(userId).select('role locked').lean()
        : null;
      if (
        !user ||
        user.locked ||
        (user.role !== 'admin' &&
          !level.allowedUserIds.some((uid) => String(uid) === userId))
      )
        throw new NotFoundException('Level not found');
    }
    return level;
  }
}

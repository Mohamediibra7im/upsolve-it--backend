import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import { Training, type TrainingDocument } from './schemas/training.schema';

@Injectable()
export class TrainingsService {
  constructor(
    private readonly auth: AuthService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
  ) {}

  async getUserFromAuthHeader(authHeader?: string) {
    const token = authHeader?.split(' ')[1];
    if (!token) return null;
    const decoded = await this.auth.verifyAccessToken(token);
    if (!decoded) return null;
    return await this.userModel.findById(decoded.userId);
  }

  async createTraining(userId: string, body: any) {
    const doc = await this.trainingModel.create({ ...body, user: userId });
    return doc;
  }

  async listTrainings(userId: string) {
    return await this.trainingModel
      .find({ user: userId })
      .sort({ startTime: -1 });
  }
}

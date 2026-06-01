import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { RoadmapProgressService } from './roadmap-progress.service';
import { User } from '../auth/schemas/user.schema';
import { RoadmapLevel } from './schemas/roadmap-level.schema';
import { RoadmapTopic } from './schemas/roadmap-topic.schema';
import { RoadmapVideo } from './schemas/roadmap-video.schema';
import { RoadmapSheet } from './schemas/roadmap-sheet.schema';
import { RoadmapProblem } from './schemas/roadmap-problem.schema';
import { UserVideoProgress } from './schemas/user-video-progress.schema';
import { UserProblemProgress } from './schemas/user-problem-progress.schema';
import { UserTopicProgress } from './schemas/user-topic-progress.schema';
import { UserLevelProgress } from './schemas/user-level-progress.schema';
import { UserXp } from './schemas/user-xp.schema';
import { XpTransaction } from './schemas/xp-transaction.schema';

const mockQuery = <T>(data: T) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(data),
});

const createModel = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  insertMany: jest.fn(),
  deleteMany: jest.fn(),
  deleteOne: jest.fn(),
});

describe('RoadmapProgressService', () => {
  let service: RoadmapProgressService;
  let userModel: ReturnType<typeof createModel>;
  let levelModel: ReturnType<typeof createModel>;
  let topicModel: ReturnType<typeof createModel>;
  let videoModel: ReturnType<typeof createModel>;
  let sheetModel: ReturnType<typeof createModel>;
  let problemModel: ReturnType<typeof createModel>;
  let videoProgressModel: ReturnType<typeof createModel>;
  let problemProgressModel: ReturnType<typeof createModel>;
  let topicProgressModel: ReturnType<typeof createModel>;
  let levelProgressModel: ReturnType<typeof createModel>;
  let xpModel: ReturnType<typeof createModel>;
  let xpTransactionModel: ReturnType<typeof createModel>;

  beforeEach(async () => {
    userModel = createModel();
    levelModel = createModel();
    topicModel = createModel();
    videoModel = createModel();
    sheetModel = createModel();
    problemModel = createModel();
    videoProgressModel = createModel();
    problemProgressModel = createModel();
    topicProgressModel = createModel();
    levelProgressModel = createModel();
    xpModel = createModel();
    xpTransactionModel = createModel();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RoadmapProgressService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(RoadmapLevel.name), useValue: levelModel },
        { provide: getModelToken(RoadmapTopic.name), useValue: topicModel },
        { provide: getModelToken(RoadmapVideo.name), useValue: videoModel },
        { provide: getModelToken(RoadmapSheet.name), useValue: sheetModel },
        { provide: getModelToken(RoadmapProblem.name), useValue: problemModel },
        {
          provide: getModelToken(UserVideoProgress.name),
          useValue: videoProgressModel,
        },
        {
          provide: getModelToken(UserProblemProgress.name),
          useValue: problemProgressModel,
        },
        {
          provide: getModelToken(UserTopicProgress.name),
          useValue: topicProgressModel,
        },
        {
          provide: getModelToken(UserLevelProgress.name),
          useValue: levelProgressModel,
        },
        { provide: getModelToken(UserXp.name), useValue: xpModel },
        {
          provide: getModelToken(XpTransaction.name),
          useValue: xpTransactionModel,
        },
      ],
    }).compile();

    service = moduleRef.get(RoadmapProgressService);
  });

  it('awards video XP once when threshold is reached', async () => {
    const userId = new Types.ObjectId().toString();
    const levelId = new Types.ObjectId();
    const topicId = new Types.ObjectId();
    const videoId = new Types.ObjectId();

    videoModel.findById.mockImplementation(() =>
      mockQuery({ _id: videoId, topicId }),
    );
    topicModel.findById.mockImplementation(() =>
      mockQuery({ _id: topicId, levelId, xpVideoReward: 50 }),
    );
    levelModel.findById.mockImplementation(() =>
      mockQuery({ _id: levelId, videoUnlockSheetPct: 80 }),
    );

    videoProgressModel.findOne.mockResolvedValue(null);
    videoProgressModel.findOneAndUpdate.mockResolvedValue({
      _id: new Types.ObjectId(),
      watchPct: 85,
      lastPositionSec: 120,
      isThresholdMet: true,
      xpAwarded: false,
    });

    topicProgressModel.updateOne.mockResolvedValue(null);
    topicProgressModel.findOne.mockResolvedValue(null);
    levelProgressModel.updateOne.mockResolvedValue(null);
    xpTransactionModel.create.mockResolvedValue(null);
    xpModel.findOneAndUpdate.mockResolvedValue(null);
    videoProgressModel.updateOne.mockResolvedValue(null);

    const result = await service.recordVideoProgress(
      userId,
      videoId.toString(),
      {
        watchPct: 85,
        positionSec: 120,
      },
    );

    expect(result.sheetUnlocked).toBe(true);
    expect(result.xpEarned).toBe(50);
    expect(xpTransactionModel.create).toHaveBeenCalledTimes(1);
  });

  it('does not award XP when threshold is not met', async () => {
    const userId = new Types.ObjectId().toString();
    const levelId = new Types.ObjectId();
    const topicId = new Types.ObjectId();
    const videoId = new Types.ObjectId();

    videoModel.findById.mockImplementation(() =>
      mockQuery({ _id: videoId, topicId }),
    );
    topicModel.findById.mockImplementation(() =>
      mockQuery({ _id: topicId, levelId, xpVideoReward: 50 }),
    );
    levelModel.findById.mockImplementation(() =>
      mockQuery({ _id: levelId, videoUnlockSheetPct: 80 }),
    );

    videoProgressModel.findOne.mockResolvedValue(null);
    videoProgressModel.findOneAndUpdate.mockResolvedValue({
      _id: new Types.ObjectId(),
      watchPct: 40,
      lastPositionSec: 45,
      isThresholdMet: false,
      xpAwarded: false,
    });

    topicProgressModel.updateOne.mockResolvedValue(null);
    topicProgressModel.findOne.mockResolvedValue(null);
    levelProgressModel.updateOne.mockResolvedValue(null);

    const result = await service.recordVideoProgress(
      userId,
      videoId.toString(),
      {
        watchPct: 40,
        positionSec: 45,
      },
    );

    expect(result.sheetUnlocked).toBe(false);
    expect(result.xpEarned).toBe(0);
    expect(xpTransactionModel.create).not.toHaveBeenCalled();
  });

  it('builds a summary with current level and counts', async () => {
    const userId = new Types.ObjectId().toString();
    const levelA = new Types.ObjectId();
    const levelB = new Types.ObjectId();

    xpModel.findOne.mockResolvedValue({ totalXp: 120 });

    problemProgressModel.countDocuments.mockResolvedValue(3);
    topicProgressModel.countDocuments.mockResolvedValue(1);
    levelProgressModel.countDocuments.mockResolvedValue(1);

    levelProgressModel.find.mockImplementation(() =>
      mockQuery([
        { levelId: levelA, topicsCompletePct: 50, isLevelComplete: false },
        { levelId: levelB, topicsCompletePct: 0, isLevelComplete: false },
      ]),
    );
    levelModel.find.mockImplementation(() =>
      mockQuery([
        { _id: levelA, title: 'Level 0', orderIndex: 0 },
        { _id: levelB, title: 'Level 1', orderIndex: 1 },
      ]),
    );

    const summary = await service.getUserSummary(userId);

    expect(summary.totalXp).toBe(120);
    expect(summary.problemsSolved).toBe(3);
    expect(summary.topicsCompleted).toBe(1);
    expect(summary.levelsCompleted).toBe(1);
    expect(summary.currentLevel?.title).toBe('Level 0');
  });
});

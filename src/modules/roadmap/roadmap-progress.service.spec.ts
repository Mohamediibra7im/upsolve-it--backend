import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { RoadmapProgressService } from './roadmap-progress.service';
import { User } from '../auth/schemas/user.schema';
import { RoadmapLevel } from './schemas/roadmap-level.schema';
import { RoadmapTopic } from './schemas/roadmap-topic.schema';
import { RoadmapResource } from './schemas/roadmap-resource.schema';
import { RoadmapProblem } from './schemas/roadmap-problem.schema';
import { UserResourceProgress } from './schemas/user-resource-progress.schema';
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
  let resourceModel: ReturnType<typeof createModel>;
  let problemModel: ReturnType<typeof createModel>;
  let resourceProgressModel: ReturnType<typeof createModel>;
  let problemProgressModel: ReturnType<typeof createModel>;
  let topicProgressModel: ReturnType<typeof createModel>;
  let levelProgressModel: ReturnType<typeof createModel>;
  let xpModel: ReturnType<typeof createModel>;
  let xpTransactionModel: ReturnType<typeof createModel>;

  beforeEach(async () => {
    userModel = createModel();
    levelModel = createModel();
    topicModel = createModel();
    resourceModel = createModel();
    problemModel = createModel();
    resourceProgressModel = createModel();
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
        {
          provide: getModelToken(RoadmapResource.name),
          useValue: resourceModel,
        },
        { provide: getModelToken(RoadmapProblem.name), useValue: problemModel },
        {
          provide: getModelToken(UserResourceProgress.name),
          useValue: resourceProgressModel,
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

  it('awards XP once when a resource is completed for the first time', async () => {
    const userId = new Types.ObjectId().toString();
    const levelId = new Types.ObjectId();
    const topicId = new Types.ObjectId();
    const resourceId = new Types.ObjectId();

    resourceModel.findById.mockImplementation(() =>
      mockQuery({
        _id: resourceId,
        topicId,
        type: 'Article',
        xpReward: 10,
        weight: 50,
        videoCompletionThresholdPct: 80,
        language: 'English',
        title: 'Test Resource',
      }),
    );

    // No existing progress
    resourceProgressModel.findOne.mockResolvedValue(null);
    resourceProgressModel.findOneAndUpdate.mockResolvedValue({
      _id: new Types.ObjectId(),
      xpAwarded: false,
      isCompleted: true,
      watchPct: 0,
      lastPositionSec: 0,
    });

    xpTransactionModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
    xpModel.findOneAndUpdate.mockResolvedValue(null);
    resourceProgressModel.updateOne.mockResolvedValue(null);

    // topic/level progress stubs
    topicModel.findById.mockImplementation(() =>
      mockQuery({
        _id: topicId,
        levelId,
        requiredLearningPct: 80,
        requiredProblemPct: 60,
        topicXpReward: 100,
        title: 'Test',
      }),
    );
    levelModel.findById.mockImplementation(() =>
      mockQuery({ _id: levelId, levelBonusXp: 500 }),
    );
    resourceModel.find.mockImplementation(() =>
      mockQuery([
        { _id: resourceId, type: 'Article', weight: 100, language: 'English' },
      ]),
    );
    resourceProgressModel.find.mockImplementation(() =>
      mockQuery([{ resourceId, isCompleted: true, watchPct: 0 }]),
    );
    topicModel.find.mockImplementation(() => mockQuery([{ _id: topicId }]));
    problemModel.find.mockImplementation(() => mockQuery([]));
    problemProgressModel.countDocuments.mockResolvedValue(0);
    topicProgressModel.findOne.mockResolvedValue(null);
    topicProgressModel.updateOne.mockResolvedValue(null);
    topicProgressModel.findOneAndUpdate.mockResolvedValue(null);
    levelProgressModel.updateOne.mockResolvedValue(null);
    levelProgressModel.findOneAndUpdate.mockResolvedValue(null);

    const result = await service.recordResourceProgress(
      userId,
      resourceId.toString(),
      { completed: true },
    );

    expect(result.xpEarned).toBe(10);
    expect(xpTransactionModel.create).toHaveBeenCalledTimes(1);
  });

  it('does not double-award XP when resource already has xpAwarded=true', async () => {
    const userId = new Types.ObjectId().toString();
    const topicId = new Types.ObjectId();
    const levelId = new Types.ObjectId();
    const resourceId = new Types.ObjectId();

    resourceModel.findById.mockImplementation(() =>
      mockQuery({
        _id: resourceId,
        topicId,
        type: 'Article',
        xpReward: 10,
        weight: 50,
        language: 'English',
        title: 'Test Resource',
      }),
    );

    resourceProgressModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      isCompleted: true,
      xpAwarded: true,
      watchPct: 0,
    });
    // findOneAndUpdate returns doc with xpAwarded: true → XP branch skipped
    resourceProgressModel.findOneAndUpdate.mockResolvedValue({
      _id: new Types.ObjectId(),
      xpAwarded: true,
      isCompleted: true,
    });
    resourceProgressModel.updateOne.mockResolvedValue(null);

    topicModel.findById.mockImplementation(() =>
      mockQuery({
        _id: topicId,
        levelId,
        requiredLearningPct: 80,
        requiredProblemPct: 60,
        topicXpReward: 100,
        title: 'Test',
      }),
    );
    levelModel.findById.mockImplementation(() =>
      mockQuery({ _id: levelId, levelBonusXp: 500 }),
    );
    resourceModel.find.mockImplementation(() =>
      mockQuery([
        { _id: resourceId, type: 'Article', weight: 100, language: 'English' },
      ]),
    );
    resourceProgressModel.find.mockImplementation(() =>
      mockQuery([{ resourceId, isCompleted: true, watchPct: 0 }]),
    );
    topicModel.find.mockImplementation(() => mockQuery([{ _id: topicId }]));
    problemModel.find.mockImplementation(() => mockQuery([]));
    problemProgressModel.countDocuments.mockResolvedValue(0);
    topicProgressModel.findOne.mockResolvedValue(null);
    topicProgressModel.updateOne.mockResolvedValue(null);
    topicProgressModel.findOneAndUpdate.mockResolvedValue(null);
    levelProgressModel.updateOne.mockResolvedValue(null);
    levelProgressModel.findOneAndUpdate.mockResolvedValue(null);

    const result = await service.recordResourceProgress(
      userId,
      resourceId.toString(),
      { completed: true },
    );

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

  it('awardXp treats duplicate transaction (11000) as already credited', async () => {
    const userId = new Types.ObjectId().toString();
    const topicId = new Types.ObjectId();
    const levelId = new Types.ObjectId();
    const problemId = new Types.ObjectId();

    problemModel.findById.mockImplementation(() =>
      mockQuery({
        _id: problemId,
        topicId,
        xpReward: 40,
        name: 'Test Problem',
      }),
    );
    topicModel.findById.mockImplementation(() =>
      mockQuery({
        _id: topicId,
        levelId,
        requiredLearningPct: 0,
        requiredProblemPct: 0,
        topicXpReward: 100,
        title: 'Test',
      }),
    );
    levelModel.findById.mockImplementation(() =>
      mockQuery({ _id: levelId, levelBonusXp: 500 }),
    );

    // Simulate progress doc already has xpAwarded: false (ready to award)
    problemProgressModel.updateOne.mockResolvedValue(null);
    problemProgressModel.findOne.mockImplementation(() =>
      mockQuery({
        _id: new Types.ObjectId(),
        isSolved: true,
        xpAwarded: false,
      }),
    );

    // Transaction create throws duplicate key error
    const dupError = Object.assign(new Error('duplicate key'), { code: 11000 });
    xpTransactionModel.create.mockRejectedValue(dupError);

    xpModel.findOneAndUpdate.mockResolvedValue(null);
    resourceModel.find.mockImplementation(() => mockQuery([]));
    topicModel.find.mockImplementation(() => mockQuery([{ _id: topicId }]));
    problemModel.find.mockImplementation(() => mockQuery([{ _id: problemId }]));
    problemProgressModel.countDocuments.mockResolvedValue(1);
    topicProgressModel.findOne.mockResolvedValue(null);
    topicProgressModel.updateOne.mockResolvedValue(null);
    topicProgressModel.findOneAndUpdate.mockResolvedValue(null);
    levelProgressModel.updateOne.mockResolvedValue(null);
    levelProgressModel.findOneAndUpdate.mockResolvedValue(null);

    const result = await service.toggleProblemSolved(
      userId,
      problemId.toString(),
      true,
    );

    // Even with 11000, xpDelta should reflect the problem reward (tx was already there)
    expect(result.xpDelta).toBe(40);
    // xpAwarded flag should be set to true
    expect(problemProgressModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ problemId: problemId }),
      { $set: { xpAwarded: true } },
    );
  });
});

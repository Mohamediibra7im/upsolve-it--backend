import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { XpService } from '../xp/xp.module';
import { RoadmapAccessService } from './roadmap-access.service';
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
        { provide: XpService, useValue: {} },
        { provide: RoadmapAccessService, useValue: {} },
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

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { UserStatsService } from './user-stats.service';
import { UserStats } from '../trainings/schemas/user-stats.schema';
import { Training } from '../trainings/schemas/training.schema';
import { UpsolvedProblem } from '../upsolve/schemas/upsolved-problem.schema';
import { applyActivityToStreak } from '../trainings/utils/streak-logic';
import { toUtcDayKey } from '../trainings/utils/date-key';

jest.mock('../trainings/utils/streak-logic', () => ({
  applyActivityToStreak: jest.fn(),
}));

jest.mock('../trainings/utils/date-key', () => ({
  toUtcDayKey: jest.fn(),
}));

const createModel = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  insertMany: jest.fn(),
  deleteMany: jest.fn(),
  deleteOne: jest.fn(),
});

const VALID_ID = '507f1f77bcf86cd799439011';

const queryChain = <T>(data: T) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(data),
});

describe('UserStatsService', () => {
  let service: UserStatsService;
  let userStatsModel: ReturnType<typeof createModel>;
  let trainingModel: ReturnType<typeof createModel>;
  let upsolveModel: ReturnType<typeof createModel>;

  beforeEach(async () => {
    userStatsModel = createModel();
    trainingModel = createModel();
    upsolveModel = createModel();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UserStatsService,
        { provide: getModelToken(UserStats.name), useValue: userStatsModel },
        { provide: getModelToken(Training.name), useValue: trainingModel },
        {
          provide: getModelToken(UpsolvedProblem.name),
          useValue: upsolveModel,
        },
      ],
    }).compile();

    service = moduleRef.get(UserStatsService);
  });

  // ──────────────────────────────────────────────
  //  getOrCreate
  // ──────────────────────────────────────────────

  describe('getOrCreate', () => {
    it('returns existing stats doc', async () => {
      const doc = { _id: 'sid', user: VALID_ID, trainingStreak: 5 };
      userStatsModel.findOne.mockResolvedValue(doc);

      const result = await service.getOrCreate(VALID_ID);

      expect(result).toEqual(doc);
      expect(userStatsModel.create).not.toHaveBeenCalled();
    });

    it('creates new stats doc if none exists', async () => {
      userStatsModel.findOne.mockResolvedValue(null);
      const created = { _id: 'sid', user: VALID_ID };
      userStatsModel.create.mockResolvedValue(created);

      const result = await service.getOrCreate(VALID_ID);

      expect(userStatsModel.findOne).toHaveBeenCalledWith({
        user: expect.any(Types.ObjectId),
      });
      expect(userStatsModel.create).toHaveBeenCalledWith({
        user: expect.any(Types.ObjectId),
      });
      expect(result).toEqual(created);
    });
  });

  // ──────────────────────────────────────────────
  //  recordTrainingCompleted
  // ──────────────────────────────────────────────

  describe('recordTrainingCompleted', () => {
    it('updates training streak on completed training', async () => {
      const existingDoc = {
        _id: 'sid',
        user: VALID_ID,
        trainingStreak: 3,
        bestTrainingStreak: 5,
        lastTrainingActivityDate: null,
        activeDays: [],
        consistencyScore: 50,
        save: jest.fn().mockResolvedValue(undefined),
      } as any;
      userStatsModel.findOne.mockResolvedValue(existingDoc);
      (applyActivityToStreak as jest.Mock).mockReturnValue({
        streak: 4,
        best: 5,
        lastDayKey: '2026-06-27',
      });
      (toUtcDayKey as jest.Mock).mockReturnValue('2026-06-27');
      trainingModel.find.mockReturnValue(queryChain([]));
      upsolveModel.find.mockReturnValue(queryChain([]));

      await service.recordTrainingCompleted(VALID_ID, 1000);

      expect(applyActivityToStreak).toHaveBeenCalledWith(
        { currentStreak: 3, bestStreak: 5, lastActivityDayKey: null },
        1000,
      );
      expect(existingDoc.trainingStreak).toBe(4);
      expect(existingDoc.save).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  //  recordUpsolveSolved
  // ──────────────────────────────────────────────

  describe('recordUpsolveSolved', () => {
    it('updates upsolve streak on solved upsolve', async () => {
      const existingDoc = {
        _id: 'sid',
        user: VALID_ID,
        upsolveStreak: 0,
        bestUpsolveStreak: 0,
        lastUpsolveActivityDate: null,
        activeDays: [],
        consistencyScore: 50,
        save: jest.fn().mockResolvedValue(undefined),
      } as any;
      userStatsModel.findOne.mockResolvedValue(existingDoc);
      (applyActivityToStreak as jest.Mock).mockReturnValue({
        streak: 1,
        best: 1,
        lastDayKey: '2026-06-27',
      });
      (toUtcDayKey as jest.Mock).mockReturnValue('2026-06-27');
      trainingModel.find.mockReturnValue(queryChain([]));
      upsolveModel.find.mockReturnValue(queryChain([]));

      await service.recordUpsolveSolved(VALID_ID, 2000);

      expect(applyActivityToStreak).toHaveBeenCalledWith(
        { currentStreak: 0, bestStreak: 0, lastActivityDayKey: null },
        2000,
      );
      expect(existingDoc.upsolveStreak).toBe(1);
      expect(existingDoc.save).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  //  getStreakPayload
  // ──────────────────────────────────────────────

  describe('getStreakPayload', () => {
    it('returns streak payload with consistency score', async () => {
      const existingDoc = {
        _id: 'sid',
        user: VALID_ID,
        trainingStreak: 3,
        upsolveStreak: 2,
        bestTrainingStreak: 5,
        bestUpsolveStreak: 4,
        consistencyScore: 71,
        lastTrainingActivityDate: '2026-06-26',
        lastUpsolveActivityDate: '2026-06-27',
        activeDays: ['2026-06-27'],
        save: jest.fn().mockResolvedValue(undefined),
      } as any;
      userStatsModel.findOne.mockResolvedValue(existingDoc);

      // Provide 5 training records so recomputeConsistency sees 5 active days
      const now = Date.now();
      const dayMs = 86400000;
      const trainingData = Array.from({ length: 5 }, (_, i) => ({
        endTime: now - i * dayMs,
      }));
      trainingModel.find.mockReturnValue(queryChain(trainingData));
      upsolveModel.find.mockReturnValue(queryChain([]));

      // First 5 calls (trainings) yield day-0..day-4 → populate days set
      // Next 7 calls (loop) yield day-0..day-6 — first 5 match → activeInLast7 = 5
      const dayKeyMock = jest
        .fn()
        .mockReturnValueOnce('day-0')
        .mockReturnValueOnce('day-1')
        .mockReturnValueOnce('day-2')
        .mockReturnValueOnce('day-3')
        .mockReturnValueOnce('day-4')
        .mockReturnValueOnce('day-0')
        .mockReturnValueOnce('day-1')
        .mockReturnValueOnce('day-2')
        .mockReturnValueOnce('day-3')
        .mockReturnValueOnce('day-4')
        .mockReturnValueOnce('day-5')
        .mockReturnValueOnce('day-6');
      (toUtcDayKey as jest.Mock).mockImplementation(dayKeyMock);

      const result = await service.getStreakPayload(VALID_ID);

      expect(result.bestStreak).toBe(5); // max(bestTrainingStreak, bestUpsolveStreak)
      expect(result.consistencyScore).toBe(71); // round(5 / 7 * 100)
      expect(result.activeDays).toEqual(['2026-06-27']);
    });
  });
});

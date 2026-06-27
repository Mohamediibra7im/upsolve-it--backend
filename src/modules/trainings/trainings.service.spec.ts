import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { TrainingsService } from './trainings.service';
import { Training } from './schemas/training.schema';
import { User } from '../auth/schemas/user.schema';
import { AuthService } from '../auth/auth.service';
import { UserStatsService } from '../user-stats/user-stats.service';

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

describe('TrainingsService', () => {
  let service: TrainingsService;
  let trainingModel: ReturnType<typeof createModel>;
  let userModel: ReturnType<typeof createModel>;
  let userStats: Record<string, jest.Mock>;
  let authService: Record<string, jest.Mock>;

  beforeEach(async () => {
    trainingModel = createModel();
    userModel = createModel();
    userStats = {
      recordTrainingCompleted: jest.fn().mockResolvedValue(undefined),
    };
    authService = { getUserFromAuthHeader: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingsService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Training.name), useValue: trainingModel },
        { provide: AuthService, useValue: authService },
        { provide: UserStatsService, useValue: userStats },
      ],
    }).compile();

    service = moduleRef.get(TrainingsService);
  });

  describe('createTraining', () => {
    it('creates training and records stats when status is completed', async () => {
      const body = {
        startTime: 1000,
        endTime: 2000,
        problems: [
          {
            contestId: 1,
            index: 'A',
            name: 'Test',
            rating: 800,
            tags: [],
            url: 'http://example.com',
          },
        ],
        performance: 85,
        trainingMode: 'ladder',
      };
      // ensureProblemIds() adds problemId to each problem
      const transformedProblems = body.problems.map((p) => ({
        ...p,
        problemId: `${p.contestId}_${p.index}`,
      }));
      const createdDoc = {
        _id: 'tid',
        ...body,
        problems: transformedProblems,
        user: VALID_ID,
        solvedCount: 0,
        durationMinutes: 17,
        status: 'completed',
      };
      trainingModel.create.mockResolvedValue(createdDoc);
      userStats.recordTrainingCompleted.mockResolvedValue(undefined);

      const result = await service.createTraining(VALID_ID, body);

      expect(trainingModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...body,
          problems: transformedProblems,
          user: VALID_ID,
          status: 'completed',
          solvedCount: 0,
        }),
      );
      expect(userStats.recordTrainingCompleted).toHaveBeenCalledWith(
        VALID_ID,
        2000,
      );
      expect(result).toEqual(createdDoc);
    });

    it('calculates durationMinutes from startTime/endTime', async () => {
      const body = {
        startTime: 1000,
        endTime: 3601000,
        performance: 50,
        problems: [],
      };
      trainingModel.create.mockResolvedValue({
        _id: 'tid',
        ...body,
        user: VALID_ID,
        durationMinutes: 60,
        status: 'completed',
      });
      userStats.recordTrainingCompleted.mockResolvedValue(undefined);

      await service.createTraining(VALID_ID, body);

      expect(trainingModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 60 }),
      );
    });

    it('does not record stats when status is active or abandoned', async () => {
      const body = {
        startTime: 1000,
        endTime: 2000,
        performance: 50,
        problems: [],
        status: 'active',
      };
      trainingModel.create.mockResolvedValue({
        _id: 'tid',
        ...body,
        user: VALID_ID,
        solvedCount: 0,
        status: 'active',
      });

      await service.createTraining(VALID_ID, body);

      expect(userStats.recordTrainingCompleted).not.toHaveBeenCalled();
    });
  });

  describe('listTrainings', () => {
    it('lists trainings for user sorted by startTime desc', async () => {
      const docs = [{ _id: '1' }, { _id: '2' }];
      trainingModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(docs),
      });

      const result = await service.listTrainings(VALID_ID);

      expect(trainingModel.find).toHaveBeenCalledWith({
        user: expect.any(Object),
      });
      expect(result).toEqual(docs);
    });
  });

  describe('deleteTraining', () => {
    it('deletes training by id for owning user', async () => {
      trainingModel.findOneAndDelete.mockResolvedValue({ _id: 'tid' });

      const result = await service.deleteTraining(
        VALID_ID,
        '507f1f77bcf86cd799439011',
      );

      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when training not found', async () => {
      trainingModel.findOneAndDelete.mockResolvedValue(null);

      await expect(
        service.deleteTraining(VALID_ID, '507f1f77bcf86cd799439011'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for invalid training id', async () => {
      await expect(
        service.deleteTraining(VALID_ID, 'not-an-id'),
      ).rejects.toThrow(NotFoundException);

      expect(trainingModel.findOneAndDelete).not.toHaveBeenCalled();
    });
  });
});

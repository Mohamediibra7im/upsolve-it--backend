import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UpsolveService } from './upsolve.service';
import { UpsolvedProblem } from './schemas/upsolved-problem.schema';
import { DismissedUpsolve } from './schemas/dismissed-upsolve.schema';
import { User } from '../auth/schemas/user.schema';
import { AuthService } from '../auth/auth.service';

const createModel = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  insertMany: jest.fn(),
  deleteMany: jest.fn(),
  deleteOne: jest.fn(),
  bulkWrite: jest.fn(),
});

describe('UpsolveService', () => {
  let service: UpsolveService;
  let upsolveModel: ReturnType<typeof createModel>;
  let dismissedModel: ReturnType<typeof createModel>;
  let userModel: ReturnType<typeof createModel>;
  let authService: any;

  beforeEach(async () => {
    upsolveModel = createModel();
    dismissedModel = createModel();
    userModel = createModel();
    authService = {};

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UpsolveService,
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(UpsolvedProblem.name),
          useValue: upsolveModel,
        },
        {
          provide: getModelToken(DismissedUpsolve.name),
          useValue: dismissedModel,
        },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = moduleRef.get(UpsolveService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('list', () => {
    it('lists upsolved problems sorted by createdAt', async () => {
      const docs = [{ contestId: 1, index: 'A', name: 'Test' }];
      const sortFn = jest.fn().mockReturnThis();
      const limitFn = jest.fn().mockResolvedValue(docs);
      const query = { sort: sortFn, limit: limitFn };
      upsolveModel.find.mockReturnValue(query);

      const result = await service.list('uid');

      expect(upsolveModel.find).toHaveBeenCalledWith({ user: 'uid' });
      expect(sortFn).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
      expect(limitFn).toHaveBeenCalledWith(500);
      expect(result).toEqual(docs);
    });
  });

  describe('listDismissed', () => {
    it('lists dismissed problems with lean projection', async () => {
      const docs = [{ contestId: 1, index: 'A' }];
      const limitFn = jest.fn().mockReturnThis();
      const selectFn = jest.fn().mockReturnThis();
      const leanFn = jest.fn().mockResolvedValue(docs);
      const query = { limit: limitFn, select: selectFn, lean: leanFn };
      dismissedModel.find.mockReturnValue(query);

      const result = await service.listDismissed('uid');

      expect(dismissedModel.find).toHaveBeenCalledWith({ user: 'uid' });
      expect(limitFn).toHaveBeenCalledWith(500);
      expect(selectFn).toHaveBeenCalledWith('contestId index -_id');
      expect(leanFn).toHaveBeenCalled();
      expect(result).toEqual(docs);
    });
  });

  describe('insertMany', () => {
    it('inserts problems with user field', async () => {
      const problems = [
        {
          contestId: 1,
          index: 'A',
          name: 'Test',
          rating: 800,
          tags: [],
          url: '/test',
        },
      ];
      upsolveModel.insertMany.mockResolvedValue(undefined);

      await service.insertMany('uid', problems);

      expect(upsolveModel.insertMany).toHaveBeenCalledWith(
        [{ ...problems[0], user: 'uid' }],
        { ordered: false },
      );
    });
  });

  describe('bulkUpdateSolvedTime', () => {
    it('updates solvedTime via bulkWrite', async () => {
      const problems = [{ contestId: 1, index: 'A', solvedTime: 1000 }];
      upsolveModel.bulkWrite.mockResolvedValue(undefined);

      await service.bulkUpdateSolvedTime('uid', problems);

      expect(upsolveModel.bulkWrite).toHaveBeenCalledWith([
        {
          updateOne: {
            filter: { user: 'uid', contestId: 1, index: 'A' },
            update: { $set: { solvedTime: 1000 } },
          },
        },
      ]);
    });
  });

  describe('deleteOne', () => {
    it('deletes problem and records dismissal', async () => {
      const deleteResult = { deletedCount: 1 };
      upsolveModel.deleteOne.mockResolvedValue(deleteResult);
      dismissedModel.updateOne.mockResolvedValue(undefined);

      const result = await service.deleteOne('uid', 1, 'A');

      expect(upsolveModel.deleteOne).toHaveBeenCalledWith({
        user: 'uid',
        contestId: 1,
        index: 'A',
      });
      expect(dismissedModel.updateOne).toHaveBeenCalledWith(
        { user: 'uid', contestId: 1, index: 'A' },
        {
          $setOnInsert: expect.objectContaining({
            user: 'uid',
            contestId: 1,
            index: 'A',
            dismissedAt: expect.any(Date),
          }),
        },
        { upsert: true },
      );
      expect(result).toEqual(deleteResult);
    });

    it('skips dismissal when nothing deleted', async () => {
      upsolveModel.deleteOne.mockResolvedValue({ deletedCount: 0 });

      await service.deleteOne('uid', 1, 'A');

      expect(upsolveModel.deleteOne).toHaveBeenCalledWith({
        user: 'uid',
        contestId: 1,
        index: 'A',
      });
      expect(dismissedModel.updateOne).not.toHaveBeenCalled();
    });
  });
});

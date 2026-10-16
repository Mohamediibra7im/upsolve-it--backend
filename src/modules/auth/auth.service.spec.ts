import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from './schemas/user.schema';
import { RefreshToken } from './schemas/refresh-token.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UserXp } from '../roadmap/schemas/user-xp.schema';
import { XpTransaction } from '../roadmap/schemas/xp-transaction.schema';
import bcrypt from 'bcryptjs';
import { TransactionsService } from '../../common/database/transactions.module';
import { PasswordResetChallenge } from './schemas/password-reset-challenge.schema';
import { XpService } from '../xp/xp.module';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));

const createModel = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
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

describe('AuthService', () => {
  let service: AuthService;
  let userModel: ReturnType<typeof createModel>;
  let refreshTokenModel: ReturnType<typeof createModel>;
  let xpModel: ReturnType<typeof createModel>;
  let xpTransactionModel: ReturnType<typeof createModel>;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let auditLogs: { logAction: jest.Mock };

  const mockCfFetchOk = () =>
    Promise.resolve({
      json: () =>
        Promise.resolve({
          status: 'OK',
          result: [
            {
              rating: 1500,
              rank: 'specialist',
              maxRating: 1600,
              maxRank: 'specialist',
              avatar: 'https://userpic.codeforces.org/avatar.jpg',
              organization: 'Test Org',
              firstName: '',
              lastName: '',
            },
          ],
        }),
    });

  beforeEach(async () => {
    userModel = createModel();
    refreshTokenModel = createModel();
    xpModel = createModel();
    xpTransactionModel = createModel();
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-token'),
      verifyAsync: jest.fn(),
    };
    auditLogs = { logAction: jest.fn().mockResolvedValue(undefined) };

    // Mock global.fetch for Codeforces API calls in register
    global.fetch = jest.fn().mockImplementation(() => mockCfFetchOk());

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: TransactionsService,
          useValue: { run: (work: () => Promise<unknown>) => work() },
        },
        {
          provide: getModelToken(PasswordResetChallenge.name),
          useValue: createModel(),
        },
        { provide: XpService, useValue: {} },
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: refreshTokenModel,
        },
        { provide: getModelToken(UserXp.name), useValue: xpModel },
        {
          provide: getModelToken(XpTransaction.name),
          useValue: xpTransactionModel,
        },
        { provide: JwtService, useValue: jwtService },
        { provide: AuditLogsService, useValue: auditLogs },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k: string) =>
              k === 'JWT_REFRESH_SECRET'
                ? 'test-refresh-secret-at-least-32-chars-long'
                : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => {
    delete (global as any).fetch;
    jest.restoreAllMocks();
  });

  describe('register', () => {
    it('creates user and returns tokens', async () => {
      const mockUser = {
        _id: 'newId',
        codeforcesHandle: 'testuser',
        password: 'hashed',
        rating: 1500,
        avatar: 'https://userpic.codeforces.org/avatar.jpg',
        rank: 'specialist',
        maxRating: 1600,
        maxRank: 'specialist',
        organization: 'Test Org',
        lastSyncTime: 1234567890,
        role: 'user',
        isVerified: false,
      };

      userModel.findOne.mockResolvedValue(null); // no existing user
      userModel.create.mockResolvedValue(mockUser);
      refreshTokenModel.create.mockResolvedValue({ _id: 'rtid' });

      const result = await service.register(
        'testuser',
        'StrongP@ss1',
        'StrongP@ss1',
      );

      expect(result.token).toBe('mock-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.codeforcesHandle).toBe('testuser');
      expect(userModel.create).toHaveBeenCalledTimes(1);
      expect(refreshTokenModel.create).toHaveBeenCalledTimes(1);
      expect(auditLogs.logAction).toHaveBeenCalled();
    });

    it('rejects weak password', async () => {
      await expect(
        service.register('testuser', 'weak', 'weak'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate handle', async () => {
      userModel.findOne.mockResolvedValue({
        _id: 'existing',
        codeforcesHandle: 'testuser',
      });

      await expect(
        service.register('testuser', 'StrongP@ss1', 'StrongP@ss1'),
      ).rejects.toThrow(BadRequestException);
      expect(userModel.create).not.toHaveBeenCalled();
    });

    it('rejects mismatched passwords', async () => {
      await expect(
        service.register('testuser', 'StrongP@ss1', 'DifferentP@ss1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('wrong password throws 401', async () => {
      userModel.findOne.mockReturnValue({
        collation: jest.fn().mockResolvedValue({
          _id: 'uid',
          codeforcesHandle: 'testuser',
          password: 'hashed',
          locked: false,
        }),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('testuser', 'wrongpass', '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('locked account throws 423', async () => {
      userModel.findOne.mockReturnValue({
        collation: jest.fn().mockResolvedValue({
          _id: 'uid',
          codeforcesHandle: 'testuser',
          password: 'hashed',
          locked: true,
        }),
      });

      let error: any;
      try {
        await service.login('testuser', 'wrongpass', '127.0.0.2');
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(423);
    });
  });
});

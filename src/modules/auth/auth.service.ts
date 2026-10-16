import {
  BadRequestException,
  HttpException,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import {
  RefreshToken,
  type RefreshTokenDocument,
} from './schemas/refresh-token.schema';
import { User, type UserDocument } from './schemas/user.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Types } from 'mongoose';
import { getRankFromRating } from '../../common/utils/rating';
import { shouldSyncProfile } from '../../common/utils/profile';
import { validatePassword } from '../../common/utils/password';
import { fetchCodeforcesUserInfo } from '../../common/utils/codeforces-api';
import { XpService } from '../xp/xp.module';
import { TransactionsService } from '../../common/database/transactions.module';
import {
  PasswordResetChallenge,
  PasswordResetChallengeDocument,
} from './schemas/password-reset-challenge.schema';

const loginLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
  blockDuration: 180,
});

const refreshLimiter = new RateLimiterMemory({
  points: 10,
  duration: 300,
  blockDuration: 600,
});

// Per-user failed-login throttle — 5 wrong within window → temporary block
// (auto-clears after blockDuration). Not a permanent lock.
const loginUserLimiter = new RateLimiterMemory({
  points: 5,
  duration: 900,
  blockDuration: 900,
});

const RESET_LIFETIME_MS = 10 * 60 * 1000;

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toPublicUser(user: any) {
  return {
    _id: user._id,
    codeforcesHandle: user.codeforcesHandle,
    rating: user.rating,
    avatar: user.avatar,
    rank: user.rank,
    maxRating: user.maxRating,
    maxRank: user.maxRank,
    organization: user.organization,
    lastSyncTime: user.lastSyncTime,
    role: user.role,
    isVerified: user.isVerified,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Reset/verification tokens are signed with a DIFFERENT secret than access
  // tokens. This is what prevents a password-reset token from ever verifying
  // as a session token (account-takeover fix) — without needing a `type` claim,
  // so access tokens issued before this change keep working (no forced logout).
  private readonly resetSecret: string;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly jwt: JwtService,
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService,
    @InjectModel(PasswordResetChallenge.name)
    private readonly resetChallengeModel: Model<PasswordResetChallengeDocument>,
    private readonly transactions: TransactionsService,
    private readonly xp: XpService,
  ) {
    const secret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!secret)
      throw new Error('JWT_REFRESH_SECRET must be set in environment');
    this.resetSecret = secret;
  }

  async verifyAccessToken(
    token: string,
  ): Promise<{ userId: string; authVersion?: number } | null> {
    try {
      // Verify against the access-token secret only. Reset/verification tokens
      // are signed with `resetSecret`, so they fail here and cannot be replayed
      // as a session. HS256 is pinned to prevent algorithm confusion.
      const decoded = await this.jwt.verifyAsync<{
        userId: string;
        type?: string;
        authVersion?: number;
      }>(token, {
        algorithms: ['HS256'],
      });
      if (
        !Types.ObjectId.isValid(decoded.userId) ||
        (decoded.type && decoded.type !== 'access')
      )
        return null;
      return decoded;
    } catch {
      return null;
    }
  }

  async getUserFromAuthHeader(authHeader?: string, accessTokenCookie?: string) {
    const token = authHeader?.split(' ')[1] ?? accessTokenCookie;
    if (!token) return null;
    const decoded = await this.verifyAccessToken(token);
    if (!decoded) return null;
    const user = await this.userModel.findById(decoded.userId);
    if (
      !user ||
      user.locked ||
      (user.authVersion ?? 0) !== (decoded.authVersion ?? 0)
    )
      return null;
    return user;
  }

  async rateLimit(identifier: string, limiter: RateLimiterMemory) {
    try {
      await limiter.consume(identifier);
      return { success: true as const };
    } catch (err) {
      const msBeforeNext =
        typeof err === 'object' && err && 'msBeforeNext' in err
          ? Number((err as { msBeforeNext: number }).msBeforeNext)
          : 1000;
      return {
        success: false as const,
        remainingSeconds: Math.max(1, Math.round(msBeforeNext / 1000)),
      };
    }
  }

  async register(
    codeforcesHandle: string,
    password: string,
    confirmPassword: string,
  ) {
    if (!codeforcesHandle || !password || !confirmPassword) {
      throw new BadRequestException(
        'Codeforces handle, password, and password confirmation are required',
      );
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException(passwordValidation.errors.join('. '));
    }
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const existing = await this.userModel.findOne({
      codeforcesHandle: {
        $regex: new RegExp(
          `^${codeforcesHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          'i',
        ),
      },
    });
    if (existing) throw new BadRequestException('Handle already exists');

    const results = await fetchCodeforcesUserInfo(codeforcesHandle);
    if (!results || results.length === 0) {
      throw new BadRequestException('Invalid Codeforces handle');
    }
    const cfUser = results[0];
    const rating: number = Number(cfUser.rating) || 0;
    const rank = cfUser.rank ?? getRankFromRating(rating);

    const hashed = await bcrypt.hash(password, 10);

    const maxRating: number = Number(cfUser.maxRating) || 0;
    const user = await this.userModel.create({
      codeforcesHandle,
      password: hashed,
      rating,
      avatar: cfUser.avatar ?? 'https://userpic.codeforces.org/no-avatar.jpg',
      rank,
      maxRating,
      maxRank:
        cfUser.maxRank ??
        (maxRating > 0 ? getRankFromRating(maxRating) : 'Unrated'),
      organization: cfUser.organization,
      lastSyncTime: Date.now(),
    });

    await this.auditLogs.logAction(
      'REGISTER',
      'User',
      user._id,
      user.codeforcesHandle,
      { organization: user.organization },
      user._id,
    );

    return this.issueTokens(user);
  }

  async login(codeforcesHandle: string, password: string, ip: string) {
    const rateLimitResult = await this.rateLimit(ip, loginLimiter);
    if (!rateLimitResult.success) {
      throw new UnauthorizedException(
        `Too many requests. Retry after ${rateLimitResult.remainingSeconds}s`,
      );
    }

    const user = await this.userModel
      .findOne({ codeforcesHandle })
      .collation({ locale: 'en', strength: 2 });

    // ponytail: check persistent DB lock before password check.
    if (user?.locked) {
      throw new HttpException('Account is locked', 423);
    }

    const ok = user ? await bcrypt.compare(password, user.password) : false;
    if (!user || !ok) {
      // Throttle repeated failures per-user with a TEMPORARY block (auto-clears
      // after blockDuration). We intentionally do NOT set a permanent DB lock
      // here: an attacker who knows a handle could otherwise lock any account
      // indefinitely (DoS). Permanent `locked` is reserved for admin action.
      if (user) {
        try {
          await loginUserLimiter.consume(String(user._id));
        } catch (err) {
          if (err instanceof RateLimiterRes) {
            throw new UnauthorizedException(
              'Too many failed attempts. Try again later.',
            );
          }
        }
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // ponytail: successful login — reset per-user fail counter.
    await loginUserLimiter.delete(String(user._id));

    await this.auditLogs.logAction(
      'LOGIN',
      'User',
      user._id,
      user.codeforcesHandle,
      { ip, role: user.role },
      user._id,
    );

    return this.issueTokens(user);
  }

  async initiateReset(handle: string) {
    if (!handle) throw new BadRequestException('Codeforces handle is required');
    const user = await this.userModel
      .findOne({ codeforcesHandle: handle })
      .collation({ locale: 'en', strength: 2 });
    if (!user || user.locked)
      throw new BadRequestException('Account unavailable');
    const code = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_LIFETIME_MS);
    const challenge = await this.resetChallengeModel.create({
      userId: user._id,
      authVersion: user.authVersion ?? 0,
      codeHash: hashRefreshToken(code),
      expiresAt,
      cleanupAt: new Date(expiresAt.getTime() + RESET_LIFETIME_MS),
    });
    const verificationToken = await this.jwt.signAsync(
      {
        userId: String(user._id),
        challengeId: String(challenge._id),
        type: 'profile-proof-v2',
      },
      { expiresIn: '10m', secret: this.resetSecret },
    );
    return { verificationToken, code, expiresAt };
  }

  private async decodeResetToken(token: string, purpose: string) {
    try {
      const decoded = await this.jwt.verifyAsync<{
        userId: string;
        challengeId: string;
        type: string;
      }>(token, {
        algorithms: ['HS256'],
        secret: this.resetSecret,
      });
      if (
        decoded.type !== purpose ||
        !Types.ObjectId.isValid(decoded.userId) ||
        !Types.ObjectId.isValid(decoded.challengeId)
      )
        throw new Error('Wrong purpose');
      return decoded;
    } catch {
      throw new BadRequestException(
        'Invalid or expired recovery token. Restart password recovery.',
      );
    }
  }

  async verifyResetProfile(verificationToken: string) {
    const decoded = await this.decodeResetToken(
      verificationToken,
      'profile-proof-v2',
    );
    const challenge = await this.resetChallengeModel.findOne({
      _id: decoded.challengeId,
      userId: decoded.userId,
    });
    const user = await this.userModel.findById(decoded.userId);
    if (
      !challenge ||
      !user ||
      user.locked ||
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.authVersion !== (user.authVersion ?? 0)
    ) {
      throw new BadRequestException(
        'Invalid or expired profile challenge. Restart password recovery.',
      );
    }
    let matched = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const info = await fetchCodeforcesUserInfo(user.codeforcesHandle);
      const firstName: unknown = info?.[0]?.firstName;
      if (
        typeof firstName === 'string' &&
        hashRefreshToken(firstName) === challenge.codeHash
      ) {
        matched = true;
        break;
      }
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    if (!matched)
      throw new BadRequestException(
        'Set your Codeforces first name to the recovery code, save your profile, then try again.',
      );
    const verified = await this.resetChallengeModel.findOneAndUpdate(
      {
        _id: challenge._id,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
        resetExpiresAt: null,
      },
      { $set: { resetExpiresAt: new Date(Date.now() + RESET_LIFETIME_MS) } },
      { returnDocument: 'after' },
    );
    const current =
      verified ?? (await this.resetChallengeModel.findById(challenge._id));
    if (
      !current?.resetExpiresAt ||
      current.consumedAt ||
      current.resetExpiresAt.getTime() <= Date.now()
    )
      throw new BadRequestException('Recovery proof expired');
    const resetToken = await this.jwt.signAsync(
      {
        userId: decoded.userId,
        challengeId: decoded.challengeId,
        type: 'password-reset-v2',
        iat: Math.floor(Date.now() / 1000),
      },
      {
        secret: this.resetSecret,
        expiresIn:
          Math.floor(current.resetExpiresAt.getTime() / 1000) -
          Math.floor(Date.now() / 1000),
      },
    );
    return { success: true, resetToken, expiresAt: current.resetExpiresAt };
  }

  async resetPassword(
    userId: string | undefined,
    body: { resetToken?: string; newPassword?: string; oldPassword?: string },
  ) {
    if (
      !body.newPassword ||
      (body.resetToken !== undefined && body.oldPassword !== undefined)
    )
      throw new BadRequestException(
        'Provide a new password and either a recovery token or your current password.',
      );
    const validation = validatePassword(body.newPassword);
    if (!validation.isValid)
      throw new BadRequestException(validation.errors.join('. '));
    const decoded = body.resetToken
      ? await this.decodeResetToken(body.resetToken, 'password-reset-v2')
      : null;
    if (!decoded && (!userId || !body.oldPassword))
      throw new UnauthorizedException('Current password is required');
    const targetId = decoded?.userId ?? userId!;
    const user = await this.userModel.findById(targetId);
    if (!user || user.locked)
      throw new BadRequestException('Account unavailable');
    if (!decoded && !(await bcrypt.compare(body.oldPassword!, user.password)))
      throw new UnauthorizedException('Incorrect current password.');
    const password = await bcrypt.hash(body.newPassword, 10);
    await this.transactions.run(async () => {
      if (decoded) {
        const claimed = await this.resetChallengeModel.findOneAndUpdate(
          {
            _id: decoded.challengeId,
            userId: user._id,
            authVersion: user.authVersion ?? 0,
            consumedAt: null,
            resetExpiresAt: { $gt: new Date() },
          },
          { $set: { consumedAt: new Date() } },
        );
        if (!claimed)
          throw new BadRequestException('Invalid or expired reset token');
      }
      const updated = await this.userModel.updateOne(
        {
          _id: user._id,
          locked: { $ne: true },
          password: user.password,
          $or: [
            { authVersion: user.authVersion ?? 0 },
            ...((user.authVersion ?? 0) === 0
              ? [{ authVersion: { $exists: false } }]
              : []),
          ],
        },
        { $set: { password }, $inc: { authVersion: 1 } },
      );
      if (!updated.modifiedCount)
        throw new BadRequestException(
          'Account changed. Restart password recovery.',
        );
      await this.revokeRefreshSessions(user._id);
    });
    return { message: 'Password has been reset successfully.' };
  }

  private async revokeRefreshSessions(userId: Types.ObjectId) {
    await this.refreshTokenModel.updateMany(
      { userId, revoked: false },
      { $set: { revoked: true, revokedAt: new Date() } },
    );
  }

  async setAccountLocked(userId: string, locked: boolean) {
    await this.transactions.run(async () => {
      await this.userModel.updateOne(
        { _id: userId },
        { $set: { locked }, $inc: { authVersion: 1 } },
      );
      await this.revokeRefreshSessions(new Types.ObjectId(userId));
    });
  }

  async syncProfile(user: UserDocument) {
    if (!shouldSyncProfile(user.lastSyncTime)) {
      return {
        message: 'Profile is up to date',
        user: toPublicUser(user),
      };
    }

    const results = await fetchCodeforcesUserInfo(user.codeforcesHandle);
    if (!results || results.length === 0) {
      throw new BadRequestException('Invalid Codeforces handle');
    }
    const cfUser = results[0];

    const currentRating: number = Number(cfUser.rating) || 0;
    const currentRank = cfUser.rank ?? getRankFromRating(currentRating);
    const maxRating: number = Number(cfUser.maxRating) || 0;
    const maxRank = cfUser.maxRank ?? getRankFromRating(maxRating);

    const updatedUser = await this.userModel.findByIdAndUpdate(
      user._id,
      {
        rating: currentRating,
        rank: currentRank,
        maxRating,
        maxRank,
        organization: cfUser.organization,
        lastSyncTime: Date.now(),
        avatar: cfUser.avatar ?? user.avatar,
      },
      { returnDocument: 'after' },
    );

    return {
      message: 'Profile synced successfully',
      user: toPublicUser(updatedUser),
    };
  }

  private async issueTokens(user: UserDocument) {
    const accessToken = await this.jwt.signAsync({
      userId: user._id,
      type: 'access',
      authVersion: user.authVersion ?? 0,
    });

    const refreshTokenValue = generateRefreshToken();
    const hashedToken = hashRefreshToken(refreshTokenValue);
    const jti = crypto.randomUUID();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.refreshTokenModel.create({
      jti,
      userId: user._id,
      token: hashedToken,
      expiresAt,
      revoked: false,
      authVersion: user.authVersion ?? 0,
    });

    return {
      user: toPublicUser(user),
      token: accessToken,
      refreshToken: refreshTokenValue,
    };
  }

  async refresh(refreshTokenValue: string, ip: string, userAgent: string) {
    if (!refreshTokenValue) throw new UnauthorizedException('Missing refresh');

    const rateLimitResult = await this.rateLimit(ip, refreshLimiter);
    if (!rateLimitResult.success) {
      throw new UnauthorizedException(
        `Too many refresh attempts. Retry after ${rateLimitResult.remainingSeconds}s`,
      );
    }

    const hashed = hashRefreshToken(refreshTokenValue);
    const result = await this.transactions.run(async () => {
      const tokenDoc = await this.refreshTokenModel.findOne({ token: hashed });
      if (!tokenDoc || tokenDoc.expiresAt <= new Date()) return null;
      const user = await this.userModel.findById(tokenDoc.userId);
      if (
        !user ||
        user.locked ||
        (user.authVersion ?? 0) !== (tokenDoc.authVersion ?? 0)
      )
        return null;
      if (tokenDoc.revoked) {
        const revokedAgo = tokenDoc.revokedAt
          ? Date.now() - tokenDoc.revokedAt.getTime()
          : Infinity;
        if (revokedAgo > 60_000)
          await this.revokeRefreshSessions(tokenDoc.userId);
        return null; // Commit theft revocation before rejecting the request.
      }
      const claimed = await this.refreshTokenModel.updateOne(
        { _id: tokenDoc._id, revoked: false },
        { $set: { revoked: true, revokedAt: new Date() } },
      );
      if (!claimed.modifiedCount) return null;
      const newRefreshTokenValue = generateRefreshToken();
      await this.refreshTokenModel.create({
        jti: crypto.randomUUID(),
        userId: user._id,
        token: hashRefreshToken(newRefreshTokenValue),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        deviceInfo: (userAgent || 'unknown').substring(0, 100),
        ipAddress: ip,
        revoked: false,
        authVersion: user.authVersion ?? 0,
      });
      const accessToken = await this.jwt.signAsync({
        userId: user._id,
        type: 'access',
        authVersion: user.authVersion ?? 0,
      });
      return {
        user: toPublicUser(user),
        token: accessToken,
        refreshToken: newRefreshTokenValue,
      };
    });
    if (!result) throw new UnauthorizedException('Invalid refresh');
    return result;
  }

  async generateVerificationCode(userId: string) {
    const code = crypto.randomBytes(4).toString('hex');
    const expiresAt = Date.now() + 60 * 1000; // 1 minute

    await this.userModel.findByIdAndUpdate(userId, {
      verificationCode: code,
      verificationCodeExpiry: expiresAt,
    });

    return { code, expiresAt };
  }

  async verifyCodeforcesProfile(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    if (user.isVerified) {
      return { message: 'Profile is already verified' };
    }

    if (!user.verificationCode) {
      throw new BadRequestException(
        'No verification code found. Please generate one first.',
      );
    }

    if (
      user.verificationCodeExpiry &&
      Date.now() > user.verificationCodeExpiry
    ) {
      throw new BadRequestException(
        'Verification code has expired. Please generate a new one.',
      );
    }

    // Codeforces API may cache profile data for a few seconds after the user
    // saves. Retry up to 3 times with 1.5s gaps so a save-then-immediately-
    // verify flow succeeds without requiring a manual second attempt.
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY = 1500;
    let firstName = '';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const results = await fetchCodeforcesUserInfo(user.codeforcesHandle);
      if (!results || results.length === 0) {
        throw new BadRequestException('Invalid Codeforces handle');
      }
      firstName = (results[0].firstName ?? '').trim();
      if (firstName === user.verificationCode) break;
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }
    }

    if (firstName !== user.verificationCode) {
      throw new BadRequestException(
        'Verification code not found in your Codeforces first name. Make sure you saved the changes on Codeforces, then try again.',
      );
    }

    const xpEarned = await this.xp.run(async () => {
      const claimed = await this.userModel.updateOne(
        {
          _id: userId,
          isVerified: false,
          verificationCode: user.verificationCode,
        },
        {
          $set: {
            isVerified: true,
            verificationCode: null,
            verificationCodeExpiry: null,
          },
        },
      );
      if (!claimed.modifiedCount) return 0;
      return this.xp.award(
        userId,
        50,
        'Codeforces profile verification',
        'verification',
        new Types.ObjectId(userId),
      );
    });
    return { message: 'Profile verified successfully', xpEarned };
  }

  async logout(refreshTokenValue: string) {
    if (!refreshTokenValue) return;
    const hashed = hashRefreshToken(refreshTokenValue);
    await this.refreshTokenModel.updateMany(
      { token: hashed, revoked: false },
      { $set: { revoked: true, revokedAt: new Date() } },
    );
  }
}

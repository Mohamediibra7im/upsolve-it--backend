import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import {
  RefreshToken,
  type RefreshTokenDocument,
} from './schemas/refresh-token.schema';
import { User, type UserDocument } from './schemas/user.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UserXp, type UserXpDocument } from '../roadmap/schemas/user-xp.schema';
import {
  XpTransaction,
  type XpTransactionDocument,
} from '../roadmap/schemas/xp-transaction.schema';
import { Types } from 'mongoose';

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

function validatePassword(password: string) {
  const errors: string[] = [];
  if (password.length < 8)
    errors.push('Password must be at least 8 characters long');
  if (password.length > 128)
    errors.push('Password must be less than 128 characters');
  if (!/[a-z]/.test(password))
    errors.push('Password must contain at least one lowercase letter');
  if (!/[A-Z]/.test(password))
    errors.push('Password must contain at least one uppercase letter');
  if (!/\d/.test(password))
    errors.push('Password must contain at least one number');
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  const commonPasswords = [
    'password',
    '123456789',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
    'admin123',
    'welcome123',
    'password123',
    'qwerty123',
  ];
  if (commonPasswords.some((c) => password.toLowerCase().includes(c))) {
    errors.push('Password contains common patterns and is too weak');
  }
  return { isValid: errors.length === 0, errors };
}

function getRankFromRating(rating: number): string {
  if (rating === 0) return 'Unrated';
  if (rating < 1200) return 'Newbie';
  if (rating < 1400) return 'Pupil';
  if (rating < 1600) return 'Specialist';
  if (rating < 1900) return 'Expert';
  if (rating < 2100) return 'Candidate Master';
  if (rating < 2300) return 'Master';
  if (rating < 2400) return 'International Master';
  if (rating < 2600) return 'Grandmaster';
  if (rating < 3000) return 'International Grandmaster';
  return 'Legendary Grandmaster';
}

function shouldSyncProfile(lastSyncTime?: number) {
  if (!lastSyncTime) return true;
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return now - lastSyncTime >= twentyFourHours;
}

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(UserXp.name) private readonly xpModel: Model<UserXpDocument>,
    @InjectModel(XpTransaction.name)
    private readonly xpTransactionModel: Model<XpTransactionDocument>,
    private readonly jwt: JwtService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async verifyAccessToken(token: string): Promise<{ userId: string } | null> {
    try {
      const decoded = await this.jwt.verifyAsync(token);
      return decoded;
    } catch {
      return null;
    }
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

    let data: any;
    try {
      const res = await fetch(
        `https://codeforces.com/api/user.info?handles=${encodeURIComponent(codeforcesHandle)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      data = await res.json();
    } catch {
      throw new BadRequestException(
        'Unable to reach Codeforces API. Please try again later.',
      );
    }

    if (data?.status !== 'OK' || !data.result?.[0]) {
      const comment = data?.comment ?? '';
      if (comment.includes('not found') || comment.includes('handle')) {
        throw new BadRequestException('Invalid Codeforces handle');
      }
      throw new BadRequestException(
        'Codeforces API is currently unavailable. Please try again later.',
      );
    }
    const cfUser = data.result[0];
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

    const user = await this.userModel.findOne({ codeforcesHandle });
    const ok = user ? await bcrypt.compare(password, user.password) : false;
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');

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
    const user = await this.userModel.findOne({ codeforcesHandle: handle });
    if (!user) throw new BadRequestException('User not found');

    const verificationToken = await this.jwt.signAsync(
      { userId: String(user._id), handle: user.codeforcesHandle },
      { expiresIn: '5m' },
    );

    return { verificationToken };
  }

  async verifySubmission(verificationToken: string) {
    if (!verificationToken) {
      throw new BadRequestException('Verification token is required');
    }

    let decoded: { userId?: string; handle?: string; iat?: number };
    try {
      decoded = await this.jwt.verifyAsync(verificationToken);
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const handle = String(decoded.handle ?? '');
    const iat = Number(decoded.iat ?? 0);
    const submissionsUrl = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(
      handle,
    )}&from=1&count=10`;

    let submissionsRes: Response;
    try {
      submissionsRes = await fetch(submissionsUrl, {
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new BadRequestException(
        'Unable to reach Codeforces API. Please try again later.',
      );
    }
    const submissionsData = await submissionsRes.json();
    if (submissionsData?.status !== 'OK') {
      throw new BadRequestException(
        'Codeforces API is currently unavailable. Please try again.',
      );
    }

    const submissions = submissionsData.result ?? [];
    const recentCompilationError = submissions.find(
      (sub: any) =>
        sub?.problem?.contestId === 4 &&
        sub?.problem?.index === 'A' &&
        sub?.verdict === 'COMPILATION_ERROR' &&
        typeof sub?.creationTimeSeconds === 'number' &&
        sub.creationTimeSeconds >= iat - 30,
    );

    if (!recentCompilationError) {
      throw new BadRequestException(
        'Verification failed. No recent compilation error found for problem 4A.',
      );
    }

    const resetToken = await this.jwt.signAsync(
      { userId: decoded.userId },
      { expiresIn: '10m' },
    );

    return { success: true, resetToken };
  }

  async resetPin(body: {
    resetToken?: string;
    newPassword?: string;
    accessToken?: string;
    oldPassword?: string;
  }) {
    // Forgot password flow
    if (body.resetToken) {
      if (!body.newPassword) {
        throw new BadRequestException('New password is required.');
      }
      const passwordValidation = validatePassword(body.newPassword);
      if (!passwordValidation.isValid) {
        throw new BadRequestException(passwordValidation.errors.join('. '));
      }

      let decoded: { userId?: string };
      try {
        decoded = await this.jwt.verifyAsync(body.resetToken);
      } catch {
        throw new BadRequestException('Invalid or expired reset token');
      }

      const user = await this.userModel.findById(decoded.userId);
      if (!user) throw new BadRequestException('User not found');

      const hashedNewPassword = await bcrypt.hash(body.newPassword, 10);
      await this.userModel.findByIdAndUpdate(decoded.userId, {
        password: hashedNewPassword,
      });

      return { message: 'Password has been reset successfully.' };
    }

    // Logged-in flow
    const token = body.accessToken;
    if (!token) throw new UnauthorizedException('Unauthorized');

    const decoded = await this.verifyAccessToken(token);
    if (!decoded) throw new UnauthorizedException('Invalid token');

    if (!body.oldPassword || !body.newPassword) {
      throw new BadRequestException(
        'Both current and new passwords are required.',
      );
    }

    const passwordValidation = validatePassword(body.newPassword);
    if (!passwordValidation.isValid) {
      throw new BadRequestException(passwordValidation.errors.join('. '));
    }

    const user = await this.userModel.findById(decoded.userId);
    if (!user) throw new BadRequestException('User not found');

    const isMatch = await bcrypt.compare(body.oldPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Incorrect current password.');
    }

    const hashedNewPassword = await bcrypt.hash(body.newPassword, 10);
    await this.userModel.findByIdAndUpdate(decoded.userId, {
      password: hashedNewPassword,
    });

    return { message: 'Password reset successfully.' };
  }

  async syncProfile(accessToken: string) {
    const decoded = await this.verifyAccessToken(accessToken);
    if (!decoded) throw new UnauthorizedException('Invalid token');

    const user = await this.userModel.findById(decoded.userId);
    if (!user) throw new BadRequestException('User not found');

    if (!shouldSyncProfile(user.lastSyncTime)) {
      return {
        message: 'Profile is up to date',
        user: {
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
        },
      };
    }

    let data: any;
    try {
      const res = await fetch(
        `https://codeforces.com/api/user.info?handles=${encodeURIComponent(
          user.codeforcesHandle,
        )}`,
        { signal: AbortSignal.timeout(8000) },
      );
      data = await res.json();
    } catch {
      throw new BadRequestException(
        'Unable to reach Codeforces API. Please try again later.',
      );
    }
    if (data?.status !== 'OK' || !data.result?.[0]) {
      throw new BadRequestException(
        'Codeforces API is currently unavailable. Please try again later.',
      );
    }
    const cfUser = data.result[0];

    const currentRating: number = Number(cfUser.rating) || 0;
    const currentRank =
      cfUser.rank ??
      (currentRating === 0 ? 'Unrated' : getRankFromRating(currentRating));
    const maxRating: number = Number(cfUser.maxRating) || 0;
    const maxRank =
      cfUser.maxRank ??
      (maxRating === 0 ? 'Unrated' : getRankFromRating(maxRating));

    const updatedUser = await this.userModel.findByIdAndUpdate(
      decoded.userId,
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
      user: {
        _id: updatedUser!._id,
        codeforcesHandle: updatedUser!.codeforcesHandle,
        rating: updatedUser!.rating,
        avatar: updatedUser!.avatar,
        rank: updatedUser!.rank,
        maxRating: updatedUser!.maxRating,
        maxRank: updatedUser!.maxRank,
        organization: updatedUser!.organization,
        lastSyncTime: updatedUser!.lastSyncTime,
        role: updatedUser!.role,
        isVerified: updatedUser!.isVerified,
      },
    };
  }

  private async issueTokens(user: UserDocument) {
    const accessToken = await this.jwt.signAsync({ userId: user._id });

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
    });

    return {
      user: {
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
      },
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
    const tokenDoc = await this.refreshTokenModel.findOne({
      token: hashed,
      revoked: false,
      expiresAt: { $gt: new Date() },
    });
    if (!tokenDoc) throw new UnauthorizedException('Invalid refresh');

    const user = await this.userModel.findById(tokenDoc.userId);
    if (!user) throw new UnauthorizedException('Invalid refresh');

    // rotate refresh token
    await this.refreshTokenModel.updateMany(
      { _id: tokenDoc._id },
      { $set: { revoked: true, revokedAt: new Date() } },
    );

    const newRefreshTokenValue = generateRefreshToken();
    const newHashedToken = hashRefreshToken(newRefreshTokenValue);
    const newJti = crypto.randomUUID();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.refreshTokenModel.create({
      jti: newJti,
      userId: user._id,
      token: newHashedToken,
      expiresAt,
      deviceInfo: (userAgent || 'unknown').substring(0, 100),
      ipAddress: ip,
      revoked: false,
    });

    const accessToken = await this.jwt.signAsync({ userId: user._id });
    return {
      user: {
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
      },
      token: accessToken,
      refreshToken: newRefreshTokenValue,
    };
  }

  async generateVerificationCode(accessToken: string) {
    const decoded = await this.verifyAccessToken(accessToken);
    if (!decoded) throw new UnauthorizedException('Invalid token');

    const code = crypto.randomBytes(4).toString('hex');
    const expiresAt = Date.now() + 60 * 1000; // 1 minute

    await this.userModel.findByIdAndUpdate(decoded.userId, {
      verificationCode: code,
      verificationCodeExpiry: expiresAt,
    });

    return { code, expiresAt };
  }

  async verifyCodeforcesProfile(accessToken: string) {
    const decoded = await this.verifyAccessToken(accessToken);
    if (!decoded) throw new UnauthorizedException('Invalid token');

    const user = await this.userModel.findById(decoded.userId);
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
      let res: Response;
      try {
        res = await fetch(
          `https://codeforces.com/api/user.info?handles=${encodeURIComponent(user.codeforcesHandle)}`,
          { signal: AbortSignal.timeout(8000) },
        );
      } catch {
        throw new BadRequestException(
          'Unable to reach Codeforces API. Please try again later.',
        );
      }
      const data = await res.json();
      if (data?.status !== 'OK' || !data.result?.[0]) {
        throw new BadRequestException(
          'Codeforces API is currently unavailable. Please try again.',
        );
      }
      firstName = (data.result[0].firstName ?? '').trim();
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

    await this.userModel.findByIdAndUpdate(decoded.userId, {
      isVerified: true,
      verificationCode: null,
      verificationCodeExpiry: null,
    });

    // Award 50 XP for verification
    const VERIFICATION_XP = 50;
    const userId = new Types.ObjectId(decoded.userId);
    try {
      await this.xpTransactionModel.create({
        userId,
        amount: VERIFICATION_XP,
        reason: 'Codeforces profile verification',
        sourceType: 'verification',
        sourceId: userId,
      });
      await this.xpModel.findOneAndUpdate(
        { userId },
        { $inc: { totalXp: VERIFICATION_XP } },
        { upsert: true },
      );
    } catch {
      // XP award is best-effort, don't fail verification if it errors
    }

    return {
      message: 'Profile verified successfully',
      xpEarned: VERIFICATION_XP,
    };
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

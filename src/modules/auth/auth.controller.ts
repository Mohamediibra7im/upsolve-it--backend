import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type RequestWithCookies = Request & { cookies?: { refreshToken?: string } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(
      dto.codeforcesHandle,
      dto.password,
      dto.confirmPassword,
    );
    this.setRefreshCookie(res, result.refreshToken);
    return { user: result.user, token: result.token };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      req.header('x-forwarded-for') ?? req.header('x-real-ip') ?? 'unknown';
    const result = await this.auth.login(
      dto.codeforcesHandle,
      dto.password,
      ip,
    );
    this.setRefreshCookie(res, result.refreshToken);
    return { user: result.user, token: result.token };
  }

  @Post('refresh')
  async refresh(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Missing refresh');
    const ip =
      req.header('x-forwarded-for') ?? req.header('x-real-ip') ?? 'unknown';
    const userAgent = req.header('user-agent') ?? 'unknown';
    const result = await this.auth.refresh(refreshToken, ip, userAgent);
    this.setRefreshCookie(res, result.refreshToken);
    return { user: result.user, token: result.token };
  }

  @Post('logout')
  async logout(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ) {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) await this.auth.logout(refreshToken);
    res.clearCookie('refreshToken', {
      path: '/',
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });
    return { ok: true };
  }

  @Get('health')
  health() {
    return { ok: true };
  }

  @Post('initiate-reset')
  async initiateReset(@Body() body: { handle?: string }) {
    return await this.auth.initiateReset(body.handle ?? '');
  }

  @Post('verify-submission')
  async verifySubmission(@Body() body: { verificationToken?: string }) {
    return await this.auth.verifySubmission(body.verificationToken ?? '');
  }

  @Post('reset-pin')
  async resetPin(@Req() req: Request, @Body() body: any) {
    const accessToken = req.header('authorization')?.split(' ')[1];
    return await this.auth.resetPin({
      resetToken: body?.resetToken,
      newPassword: body?.newPassword,
      oldPassword: body?.oldPassword,
      accessToken,
    });
  }

  @Post('sync-profile')
  async syncProfile(@Req() req: Request) {
    const token = req.header('authorization')?.split(' ')[1];
    if (!token) throw new UnauthorizedException('Unauthorized');
    return await this.auth.syncProfile(token);
  }

  private setRefreshCookie(res: Response, refreshTokenValue: string) {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie('refreshToken', refreshTokenValue, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
}

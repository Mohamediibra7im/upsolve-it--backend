import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private authService!: AuthService;

  constructor(private readonly moduleRef: ModuleRef) {}

  private getAuthService(): AuthService {
    if (!this.authService) {
      this.authService = this.moduleRef.get(AuthService, { strict: false });
    }
    return this.authService;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization as string | undefined;
    const cookie = req.cookies?.accessToken as string | undefined;

    const user = await this.getAuthService().getUserFromAuthHeader(
      authHeader,
      cookie,
    );
    if (!user) throw new UnauthorizedException('Unauthorized');

    req.user = user;
    return true;
  }
}

import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
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
    req.user = user ?? null;
    return true;
  }
}

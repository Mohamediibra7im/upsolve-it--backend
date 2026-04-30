import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  async stats(@Headers('authorization') authorization?: string) {
    await this.admin.requireAdmin(authorization);
    return await this.admin.stats();
  }

  @Get('users')
  async users(@Headers('authorization') authorization?: string) {
    await this.admin.requireAdmin(authorization);
    return await this.admin.listUsers();
  }

  @Patch('users')
  async updateRole(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { userId: string; role: 'admin' | 'user' },
  ) {
    const current = await this.admin.requireAdmin(authorization);
    return await this.admin.updateUserRole(
      String(current._id),
      body.userId,
      body.role,
    );
  }

  @Get('users/:userId/stats')
  async userStats(
    @Headers('authorization') authorization: string | undefined,
    @Param('userId') userId: string,
  ) {
    await this.admin.requireAdmin(authorization);
    return await this.admin.userStats(userId);
  }

  @Get('logs')
  async listLogs(
    @Headers('authorization') authorization: string | undefined,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('performedByHandle') performedByHandle?: string,
  ) {
    await this.admin.requireAdmin(authorization);
    return await this.admin.listLogs(
      limit ? Number.parseInt(limit) : undefined,
      offset ? Number.parseInt(offset) : undefined,
      { action, entity, performedByHandle },
    );
  }
}

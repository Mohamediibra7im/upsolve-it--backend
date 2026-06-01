import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { TrainingLevelsService } from '../training-levels/training-levels.service';
import { ReplaceLevelsBodyDto } from '../training-levels/dto/replace-levels.dto';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly trainingLevels: TrainingLevelsService,
  ) {}

  @Get('stats')
  async stats(@Headers('authorization') authorization?: string, @Req() req?: any) {
    await this.admin.requireAdmin(authorization, req?.cookies?.accessToken);
    return await this.admin.stats();
  }

  @Get('users')
  async users(@Headers('authorization') authorization?: string, @Req() req?: any) {
    await this.admin.requireAdmin(authorization, req?.cookies?.accessToken);
    return await this.admin.listUsers();
  }

  @Patch('users')
  async updateRole(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { userId: string; role: 'admin' | 'user' },
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
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
    @Req() req: any,
  ) {
    await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    return await this.admin.userStats(userId);
  }

  @Post('users/:userId/sync')
  async syncUserRating(
    @Headers('authorization') authorization: string | undefined,
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    return await this.admin.syncUserRating(String(current._id), userId);
  }

  @Post('users/sync-batch')
  async syncBatchUserRatings(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { userIds: string[] },
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    return await this.admin.syncBatchUserRatings(
      String(current._id),
      body.userIds,
    );
  }

  @Put('levels')
  async replaceTrainingLevels(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ReplaceLevelsBodyDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    return await this.trainingLevels.replaceAll(body.levels, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  /** Replace DB contents with built-in default levels (110 rows, same as cold-start seed). */
  @Post('levels/reseed')
  async reseedTrainingLevels(
    @Headers('authorization') authorization: string | undefined,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    return await this.trainingLevels.reseedFromSeedFile({
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  @Get('logs')
  async listLogs(
    @Headers('authorization') authorization: string | undefined,
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('performedByHandle') performedByHandle?: string,
  ) {
    await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    return await this.admin.listLogs(
      limit ? Number.parseInt(limit) : undefined,
      offset ? Number.parseInt(offset) : undefined,
      { action, entity, performedByHandle },
    );
  }
}

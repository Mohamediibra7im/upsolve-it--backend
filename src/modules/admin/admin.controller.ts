import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserDocument } from '../auth/schemas/user.schema';
import { AdminService } from './admin.service';
import { ContactService } from '../contact/contact.service';
import { TrainingLevelsService } from '../training-levels/training-levels.service';
import { ReplaceLevelsBodyDto } from '../training-levels/dto/replace-levels.dto';
import { UpdateRoleDto, SyncBatchDto, ReplyMessageDto } from './dto/admin.dto';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly trainingLevels: TrainingLevelsService,
    private readonly contact: ContactService,
  ) {}

  @UseGuards(AuthGuard, AdminGuard)
  @Get('stats')
  async stats() {
    return await this.admin.stats();
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('users')
  async users(@Query('page') page?: string, @Query('limit') limit?: string) {
    // Default to a bounded page (100). Callers may raise it up to 5000, but an
    // unbounded full-collection load is never triggered implicitly.
    const parsed = Number(limit);
    const effectiveLimit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 5000) : 100;
    return await this.admin.listUsers(page ? Number(page) : 1, effectiveLimit);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('users')
  async updateRole(
    @Body() body: UpdateRoleDto,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.admin.updateUserRole(
      current._id.toString(),
      body.userId,
      body.role,
    );
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('users/:userId/stats')
  async userStats(@Param('userId') userId: string) {
    return await this.admin.userStats(userId);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('users/:userId/sync')
  async syncUserRating(
    @Param('userId') userId: string,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.admin.syncUserRating(current._id.toString(), userId);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('users/sync-batch')
  async syncBatchUserRatings(
    @Body() body: SyncBatchDto,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.admin.syncBatchUserRatings(
      current._id.toString(),
      body.userIds,
    );
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('users/:userId/lock')
  async lockUser(
    @Param('userId') userId: string,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.admin.lockUser(current._id.toString(), userId);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('users/:userId/unlock')
  async unlockUser(
    @Param('userId') userId: string,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.admin.unlockUser(current._id.toString(), userId);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Put('levels')
  async replaceTrainingLevels(
    @Body() body: ReplaceLevelsBodyDto,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.trainingLevels.replaceAll(body.levels, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  /** Replace DB contents with built-in default levels (110 rows, same as cold-start seed). */
  @UseGuards(AuthGuard, AdminGuard)
  @Post('levels/reseed')
  async reseedTrainingLevels(@CurrentUser() current: UserDocument) {
    return await this.trainingLevels.reseedFromSeedFile({
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('logs')
  async listLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('performedByHandle') performedByHandle?: string,
  ) {
    return await this.admin.listLogs(
      limit ? Number.parseInt(limit) : undefined,
      offset ? Number.parseInt(offset) : undefined,
      { action, entity, performedByHandle },
    );
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('contact')
  async listContactMessages(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.contact.listMessages(
      Number.parseInt(page, 10) || 1,
      Number.parseInt(limit, 10) || 50,
    );
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('contact/:id/read')
  async markContactRead(@Param('id') id: string) {
    return this.contact.markAsRead(id);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('contact/:id/reply')
  async replyContactMessage(
    @Param('id') id: string,
    @Body() body: ReplyMessageDto,
  ) {
    return this.contact.sendReply(id, body.message);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Delete('contact/:id')
  async deleteContactMessage(@Param('id') id: string) {
    return this.contact.deleteMessage(id);
  }
}

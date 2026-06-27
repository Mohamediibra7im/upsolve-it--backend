import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserDocument } from '../auth/schemas/user.schema';
import { RoadmapPublicService } from './roadmap-public.service';
import { RoadmapProgressService } from './roadmap-progress.service';
import { AdminService } from '../admin/admin.service';

@Controller('roadmap')
export class RoadmapPublicController {
  constructor(
    private readonly roadmap: RoadmapPublicService,
    private readonly progress: RoadmapProgressService,
    private readonly admin: AdminService,
  ) {}

  @Get('levels')
  @UseGuards(OptionalAuthGuard)
  async listLevels(@CurrentUser() user: UserDocument | null) {
    const userId = user ? String(user._id) : null;
    const levels = await this.roadmap.listLevels(userId);
    return { levels };
  }

  @Get('leaderboard')
  @UseGuards(OptionalAuthGuard)
  async getLeaderboard(
    @CurrentUser() user: UserDocument | null,
    @Query('level') level?: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const userId = user ? user._id.toString() : undefined;
    return await this.progress.getLeaderboard(
      { level, period, limit, page },
      userId,
    );
  }

  @Get('users/:userId/stats')
  @UseGuards(AuthGuard)
  async getUserStats(@Param('userId') targetUserId: string) {
    return await this.admin.userStats(targetUserId);
  }

  @Get('user/summary')
  @UseGuards(AuthGuard)
  async getUserSummary(@CurrentUser() user: UserDocument) {
    return await this.progress.getUserSummary(user._id.toString());
  }

  @Get('user/activity')
  @UseGuards(AuthGuard)
  async getUserActivity(@CurrentUser() user: UserDocument) {
    return await this.progress.getUserActivity(user._id.toString());
  }

  @Get('levels/:id')
  @UseGuards(OptionalAuthGuard)
  async getLevel(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument | null,
  ) {
    const userId = user ? String(user._id) : null;
    return await this.roadmap.getLevelDetail(id, userId);
  }

  @Get('levels/:id/topics/:topicId')
  @UseGuards(OptionalAuthGuard)
  async getTopic(
    @Param('id') id: string,
    @Param('topicId') topicId: string,
    @Query('language') language: string | undefined,
    @CurrentUser() user: UserDocument | null,
  ) {
    const userId = user ? String(user._id) : null;
    const lang =
      language === 'Arabic' || language === 'English' ? language : undefined;
    return await this.roadmap.getTopicDetail(id, topicId, userId, lang);
  }

  @Post('resources/:resourceId/progress')
  @UseGuards(AuthGuard)
  async updateResourceProgress(
    @Param('resourceId') resourceId: string,
    @Body()
    body: { watchPct?: number; positionSec?: number; completed?: boolean },
    @CurrentUser() user: UserDocument,
  ) {
    return await this.progress.recordResourceProgress(
      user._id.toString(),
      resourceId,
      body,
    );
  }

  @Post('topics/:topicId/sync')
  @UseGuards(AuthGuard)
  async syncTopicProblems(
    @Param('topicId') topicId: string,
    @Body() body: { language?: 'Arabic' | 'English' },
    @CurrentUser() user: UserDocument,
  ) {
    return await this.progress.syncTopicProblems(
      user._id.toString(),
      topicId,
      body.language,
    );
  }

  @Post('problems/:problemId/toggle')
  @UseGuards(AuthGuard)
  async toggleProblem(
    @Param('problemId') problemId: string,
    @Body() body: { solved: boolean; language?: 'Arabic' | 'English' },
    @CurrentUser() user: UserDocument,
  ) {
    return await this.progress.toggleProblemSolved(
      user._id.toString(),
      problemId,
      body.solved,
      body.language,
    );
  }

  @Post('topics/:topicId/complete-learning')
  @UseGuards(AuthGuard)
  async completeLearning(
    @Param('topicId') topicId: string,
    @Query('language') language: 'Arabic' | 'English' | undefined,
    @CurrentUser() user: UserDocument,
  ) {
    return await this.progress.completeLearning(
      user._id.toString(),
      topicId,
      language,
    );
  }

  @Post('topics/:topicId/reset-learning')
  @UseGuards(AuthGuard)
  async resetTopicLearning(
    @Param('topicId') topicId: string,
    @Query('language') language: 'Arabic' | 'English' | undefined,
    @CurrentUser() user: UserDocument,
  ) {
    return await this.progress.resetTopicLearningProgress(
      user._id.toString(),
      topicId,
      language,
    );
  }
}

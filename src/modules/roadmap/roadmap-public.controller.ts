import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
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
  async listLevels(
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req?.cookies?.accessToken,
    );
    const levels = await this.roadmap.listLevels(userId);
    return { levels };
  }

  @Get('leaderboard')
  async getLeaderboard(
    @Query('level') level?: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.progress.getLeaderboard({ level, period, limit });
  }

  @Get('users/:userId/stats')
  async getUserStats(
    @Headers('authorization') authorization: string | undefined,
    @Param('userId') targetUserId: string,
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req?.cookies?.accessToken,
    );
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return await this.admin.userStats(targetUserId);
  }

  @Get('user/summary')
  async getUserSummary(
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req?.cookies?.accessToken,
    );
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return await this.progress.getUserSummary(userId);
  }

  @Get('user/activity')
  async getUserActivity(
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req?.cookies?.accessToken,
    );
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return await this.progress.getUserActivity(userId);
  }

  @Get('levels/:id')
  async getLevel(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req.cookies?.accessToken,
    );
    return await this.roadmap.getLevelDetail(id, userId);
  }

  @Get('levels/:id/topics/:topicId')
  async getTopic(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Param('topicId') topicId: string,
    @Query('language') language: string | undefined,
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req.cookies?.accessToken,
    );
    const lang =
      language === 'Arabic' || language === 'English' ? language : undefined;
    return await this.roadmap.getTopicDetail(id, topicId, userId, lang);
  }

  @Post('resources/:resourceId/progress')
  async updateResourceProgress(
    @Headers('authorization') authorization: string | undefined,
    @Param('resourceId') resourceId: string,
    @Body()
    body: { watchPct?: number; positionSec?: number; completed?: boolean },
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req.cookies?.accessToken,
    );
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return await this.progress.recordResourceProgress(userId, resourceId, body);
  }

  @Post('topics/:topicId/sync')
  async syncTopicProblems(
    @Headers('authorization') authorization: string | undefined,
    @Param('topicId') topicId: string,
    @Body() body: { language?: 'Arabic' | 'English' },
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req.cookies?.accessToken,
    );
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return await this.progress.syncTopicProblems(
      userId,
      topicId,
      body.language,
    );
  }

  @Post('problems/:problemId/toggle')
  async toggleProblem(
    @Headers('authorization') authorization: string | undefined,
    @Param('problemId') problemId: string,
    @Body() body: { solved: boolean; language?: 'Arabic' | 'English' },
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req.cookies?.accessToken,
    );
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return await this.progress.toggleProblemSolved(
      userId,
      problemId,
      body.solved,
      body.language,
    );
  }

  @Post('topics/:topicId/reset-learning')
  async resetTopicLearning(
    @Headers('authorization') authorization: string | undefined,
    @Param('topicId') topicId: string,
    @Query('language') language: 'Arabic' | 'English' | undefined,
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req.cookies?.accessToken,
    );
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return await this.progress.resetTopicLearningProgress(
      userId,
      topicId,
      language,
    );
  }
}

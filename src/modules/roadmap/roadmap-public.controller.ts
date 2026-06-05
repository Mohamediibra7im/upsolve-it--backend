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
import { UpdateVideoProgressDto } from './dto/update-video-progress.dto';

@Controller('roadmap')
export class RoadmapPublicController {
  constructor(
    private readonly roadmap: RoadmapPublicService,
    private readonly progress: RoadmapProgressService,
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
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req.cookies?.accessToken,
    );
    return await this.roadmap.getTopicDetail(id, topicId, userId);
  }

  @Post('videos/:videoId/progress')
  async updateVideoProgress(
    @Headers('authorization') authorization: string | undefined,
    @Param('videoId') videoId: string,
    @Body() body: UpdateVideoProgressDto,
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req.cookies?.accessToken,
    );
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return await this.progress.recordVideoProgress(userId, videoId, body);
  }

  @Post('sheets/:sheetId/sync')
  async syncSheet(
    @Headers('authorization') authorization: string | undefined,
    @Param('sheetId') sheetId: string,
    @Req() req: any,
  ) {
    const userId = await this.roadmap.resolveUserId(
      authorization,
      req.cookies?.accessToken,
    );
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return await this.progress.syncSheet(userId, sheetId);
  }

  @Post('problems/:problemId/toggle')
  async toggleProblem(
    @Headers('authorization') authorization: string | undefined,
    @Param('problemId') problemId: string,
    @Body() body: { solved: boolean },
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
    );
  }
}

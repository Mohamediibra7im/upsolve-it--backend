import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserDocument } from '../auth/schemas/user.schema';
import { TrainingSessionsService } from './training-sessions.service';

@UseGuards(AuthGuard)
@Controller('training-sessions')
export class TrainingSessionsController {
  constructor(private readonly sessions: TrainingSessionsService) {}

  @Post()
  async create(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: UserDocument,
  ) {
    const doc = await this.sessions.createSession(user._id.toString(), body);
    return { sessionId: String(doc._id), session: doc };
  }

  @Post(':id/problems/:problemId/start')
  async markStarted(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Param('problemId') problemId: string,
    @Body() body?: { at?: number },
  ) {
    const decoded = decodeURIComponent(problemId);
    await this.sessions.markProblemStart(
      user._id.toString(),
      id,
      decoded,
      body?.at,
    );
    return { ok: true };
  }

  @Post(':id/sync')
  async sync(
    @Param('id') id: string,
    @Body() body: { problemUpdates?: Record<string, Record<string, unknown>> },
    @CurrentUser() user: UserDocument,
  ) {
    const doc = await this.sessions.syncSession(user._id.toString(), id, body);
    return { session: doc };
  }

  @Post(':id/end')
  async end(
    @Param('id') id: string,
    @Body()
    body: {
      endTime?: number;
      problemUpdates?: Record<string, Record<string, unknown>>;
    },
    @CurrentUser() user: UserDocument,
  ) {
    const doc = await this.sessions.endSession(user._id.toString(), id, body);
    return { session: doc };
  }

  @Get(':id/review')
  async review(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return await this.sessions.getReview(user._id.toString(), id);
  }
}

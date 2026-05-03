import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { TrainingsService } from './trainings.service';
import { TrainingSessionsService } from './training-sessions.service';

@Controller('training-sessions')
export class TrainingSessionsController {
  constructor(
    private readonly trainings: TrainingsService,
    private readonly sessions: TrainingSessionsService,
  ) {}

  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    const doc = await this.sessions.createSession(String(user._id), body);
    return { sessionId: String(doc._id), session: doc };
  }

  @Post(':id/problems/:problemId/start')
  async markStarted(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Param('problemId') problemId: string,
    @Body() body?: { at?: number },
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    const decoded = decodeURIComponent(problemId);
    await this.sessions.markProblemStart(
      String(user._id),
      id,
      decoded,
      body?.at,
    );
    return { ok: true };
  }

  @Post(':id/sync')
  async sync(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { problemUpdates?: Record<string, Record<string, unknown>> },
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    const doc = await this.sessions.syncSession(String(user._id), id, body);
    return { session: doc };
  }

  @Post(':id/end')
  async end(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body()
    body: {
      endTime?: number;
      problemUpdates?: Record<string, Record<string, unknown>>;
    },
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    const doc = await this.sessions.endSession(String(user._id), id, body);
    return { session: doc };
  }

  @Get(':id/review')
  async review(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.sessions.getReview(String(user._id), id);
  }
}

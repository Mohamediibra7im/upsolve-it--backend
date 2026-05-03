import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { TrainingsService } from './trainings.service';
import { UserStatsService } from '../user-stats/user-stats.service';
import { TrainingSessionsService } from './training-sessions.service';

@Controller('users')
export class UsersMeController {
  constructor(
    private readonly trainings: TrainingsService,
    private readonly userStats: UserStatsService,
    private readonly sessions: TrainingSessionsService,
  ) {}

  @Get('me/streaks')
  async streaks(@Headers('authorization') authorization: string | undefined) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.userStats.getStreakPayload(String(user._id));
  }

  @Get('me/weaknesses')
  async weaknesses(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.sessions.getWeaknesses(String(user._id));
  }
}

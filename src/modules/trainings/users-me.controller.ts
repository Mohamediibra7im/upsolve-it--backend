import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import { UserStatsService } from '../user-stats/user-stats.service';
import { TrainingSessionsService } from './training-sessions.service';

@UseGuards(AuthGuard)
@Controller('users')
export class UsersMeController {
  constructor(
    private readonly userStats: UserStatsService,
    private readonly sessions: TrainingSessionsService,
  ) {}

  @Get('me/streaks')
  async streaks(@CurrentUser() user: UserDocument) {
    return await this.userStats.getStreakPayload(user._id.toString());
  }

  @Get('me/weaknesses')
  async weaknesses(@CurrentUser() user: UserDocument) {
    return await this.sessions.getWeaknesses(user._id.toString());
  }
}

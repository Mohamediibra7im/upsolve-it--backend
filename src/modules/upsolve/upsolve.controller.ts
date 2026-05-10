import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Put,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { UpsolveService } from './upsolve.service';
import { UserStatsService } from '../user-stats/user-stats.service';

@Controller('upsolve')
export class UpsolveController {
  constructor(
    private readonly upsolve: UpsolveService,
    private readonly userStats: UserStatsService,
  ) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined) {
    const user = await this.upsolve.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.upsolve.list(String(user._id));
  }

  /**
   * Returns problem identifiers that the user has deliberately deleted
   * from the upsolve list. The frontend uses this to prevent the
   * auto-sync logic from re-inserting deleted problems.
   */
  @Get('dismissed')
  async listDismissed(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const user = await this.upsolve.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.upsolve.listDismissed(String(user._id));
  }

  @Post()
  async add(
    @Headers('authorization') authorization: string | undefined,
    @Body() problems: any[],
  ) {
    const user = await this.upsolve.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    try {
      await this.upsolve.insertMany(String(user._id), problems);
      return { message: 'Upsolved problems added' };
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        return {
          message: 'Upsolved problems added (some may have been duplicates)',
        };
      }
      throw err;
    }
  }

  @Put()
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Body() problems: any[],
  ) {
    const user = await this.upsolve.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    if (!Array.isArray(problems) || problems.length === 0) {
      throw new BadRequestException('Invalid request body');
    }
    await this.upsolve.bulkUpdateSolvedTime(String(user._id), problems);
    if (problems.some((p: { solvedTime?: number | null }) => p.solvedTime)) {
      await this.userStats.recordUpsolveSolved(String(user._id));
    }
    return { message: 'Upsolved problems updated' };
  }

  @Delete()
  async remove(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { contestId?: number; index?: string },
  ) {
    const user = await this.upsolve.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    if (!body?.contestId || !body?.index) {
      throw new BadRequestException('Missing contestId or index');
    }
    await this.upsolve.deleteOne(String(user._id), body.contestId, body.index);
    return { message: 'Problem deleted from upsolve list' };
  }
}

import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  ParseArrayPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserDocument } from '../auth/schemas/user.schema';
import { UpsolveService } from './upsolve.service';
import { UserStatsService } from '../user-stats/user-stats.service';
import {
  CreateUpsolveProblemDto,
  UpdateUpsolveProblemDto,
  DeleteUpsolveProblemDto,
} from './dto/upsolve-problem.dto';

@Controller('upsolve')
export class UpsolveController {
  constructor(
    private readonly upsolve: UpsolveService,
    private readonly userStats: UserStatsService,
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  async list(@CurrentUser() user: UserDocument) {
    return await this.upsolve.list(user._id.toString());
  }

  /**
   * Returns problem identifiers that the user has deliberately deleted
   * from the upsolve list. The frontend uses this to prevent the
   * auto-sync logic from re-inserting deleted problems.
   */
  @UseGuards(AuthGuard)
  @Get('dismissed')
  async listDismissed(@CurrentUser() user: UserDocument) {
    return await this.upsolve.listDismissed(user._id.toString());
  }

  @UseGuards(AuthGuard)
  @Post()
  async add(
    @CurrentUser() user: UserDocument,
    @Body(new ParseArrayPipe({ items: CreateUpsolveProblemDto }))
    problems: CreateUpsolveProblemDto[],
  ) {
    try {
      await this.upsolve.insertMany(user._id.toString(), problems);
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

  @UseGuards(AuthGuard)
  @Put()
  async update(
    @CurrentUser() user: UserDocument,
    @Body(new ParseArrayPipe({ items: UpdateUpsolveProblemDto }))
    problems: UpdateUpsolveProblemDto[],
  ) {
    await this.upsolve.bulkUpdateSolvedTime(user._id.toString(), problems);
    if (problems.some((p: { solvedTime?: number | null }) => p.solvedTime)) {
      await this.userStats.recordUpsolveSolved(user._id.toString());
    }
    return { message: 'Upsolved problems updated' };
  }

  @UseGuards(AuthGuard)
  @Delete()
  async remove(
    @CurrentUser() user: UserDocument,
    @Body() body: DeleteUpsolveProblemDto,
  ) {
    await this.upsolve.deleteOne(
      user._id.toString(),
      body.contestId,
      body.index,
    );
    return { message: 'Problem deleted from upsolve list' };
  }
}

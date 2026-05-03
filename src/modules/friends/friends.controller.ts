import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { TrainingsService } from '../trainings/trainings.service';
import { FriendsService } from './friends.service';
import { AddFriendDto } from './dto/add-friend.dto';

/**
 * Register static `friends/requests/*` routes before parametric `friends/:userId/*`
 * so paths like `requests` are not captured as user ids.
 */
@Controller('friends')
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly trainings: TrainingsService,
  ) {}

  @Get('requests')
  async listRequests(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.friends.listRequests(String(user._id));
  }

  @Post('requests')
  async sendRequest(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AddFriendDto,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.friends.sendRequest(String(user._id), body.codeforcesHandle);
  }

  @Post('requests/:requestId/accept')
  async acceptRequest(
    @Headers('authorization') authorization: string | undefined,
    @Param('requestId') requestId: string,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.friends.acceptRequest(String(user._id), requestId);
  }

  @Post('requests/:requestId/decline')
  async declineRequest(
    @Headers('authorization') authorization: string | undefined,
    @Param('requestId') requestId: string,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.friends.declineRequest(String(user._id), requestId);
  }

  @Delete('requests/:requestId')
  async cancelRequest(
    @Headers('authorization') authorization: string | undefined,
    @Param('requestId') requestId: string,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.friends.cancelOutgoingRequest(String(user._id), requestId);
  }

  @Get()
  async list(@Headers('authorization') authorization: string | undefined) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.friends.listFriends(String(user._id));
  }

  @Get(':userId/stats')
  async friendStats(
    @Headers('authorization') authorization: string | undefined,
    @Param('userId') friendUserId: string,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.friends.getFriendStats(String(user._id), friendUserId);
  }

  @Delete(':userId')
  async remove(
    @Headers('authorization') authorization: string | undefined,
    @Param('userId') friendUserId: string,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.friends.removeFriend(String(user._id), friendUserId);
  }
}

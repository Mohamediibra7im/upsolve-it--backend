import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, type UserDocument } from '../auth/schemas/user.schema';
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
  ) {}

  @UseGuards(AuthGuard)
  @Get('requests')
  async listRequests(@CurrentUser() user: UserDocument) {
    return await this.friends.listRequests(user._id.toString());
  }

  @UseGuards(AuthGuard)
  @Post('requests')
  async sendRequest(
    @CurrentUser() user: UserDocument,
    @Body() body: AddFriendDto,
  ) {
    return await this.friends.sendRequest(
      user._id.toString(),
      body.codeforcesHandle,
    );
  }

  @UseGuards(AuthGuard)
  @Post('requests/:requestId/accept')
  async acceptRequest(
    @CurrentUser() user: UserDocument,
    @Param('requestId') requestId: string,
  ) {
    return await this.friends.acceptRequest(user._id.toString(), requestId);
  }

  @UseGuards(AuthGuard)
  @Post('requests/:requestId/decline')
  async declineRequest(
    @CurrentUser() user: UserDocument,
    @Param('requestId') requestId: string,
  ) {
    return await this.friends.declineRequest(user._id.toString(), requestId);
  }

  @UseGuards(AuthGuard)
  @Delete('requests/:requestId')
  async cancelRequest(
    @CurrentUser() user: UserDocument,
    @Param('requestId') requestId: string,
  ) {
    return await this.friends.cancelOutgoingRequest(
      user._id.toString(),
      requestId,
    );
  }

  @UseGuards(AuthGuard)
  @Get()
  async list(@CurrentUser() user: UserDocument) {
    return await this.friends.listFriends(user._id.toString());
  }

  @UseGuards(AuthGuard)
  @Get(':userId/stats')
  async friendStats(
    @CurrentUser() user: UserDocument,
    @Param('userId') friendUserId: string,
  ) {
    return await this.friends.getFriendStats(user._id.toString(), friendUserId);
  }

  @UseGuards(AuthGuard)
  @Delete(':userId')
  async remove(
    @CurrentUser() user: UserDocument,
    @Param('userId') friendUserId: string,
  ) {
    return await this.friends.removeFriend(user._id.toString(), friendUserId);
  }
}

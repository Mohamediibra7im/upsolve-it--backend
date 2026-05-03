import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from '../admin/admin.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { TrainingsModule } from '../trainings/trainings.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { FriendRequest, FriendRequestSchema } from './schemas/friend-request.schema';
import { Friendship, FriendshipSchema } from './schemas/friendship.schema';

@Module({
  imports: [
    AuthModule,
    TrainingsModule,
    AdminModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: Friendship.name, schema: FriendshipSchema },
      { name: FriendRequest.name, schema: FriendRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
})
export class FriendsModule {}

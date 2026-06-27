import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminService } from '../admin/admin.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import {
  Friendship,
  type FriendshipDocument,
} from './schemas/friendship.schema';
import {
  FriendRequest,
  type FriendRequestDocument,
} from './schemas/friend-request.schema';
import { escapeRegex } from './utils/escape-regex';
import {
  isValidCodeforcesHandleFormat,
  normalizeCodeforcesHandleInput,
} from './utils/codeforces-handle';

function normalizePair(
  userIdA: string,
  userIdB: string,
): [Types.ObjectId, Types.ObjectId] {
  const a = String(userIdA);
  const b = String(userIdB);
  if (a === b) {
    throw new BadRequestException('Cannot add yourself as a friend');
  }
  return a < b
    ? [new Types.ObjectId(a), new Types.ObjectId(b)]
    : [new Types.ObjectId(b), new Types.ObjectId(a)];
}

function publicUserPick(u: {
  _id: Types.ObjectId;
  codeforcesHandle: string;
  avatar: string;
  rating: number;
  rank: string;
}) {
  return {
    _id: String(u._id),
    codeforcesHandle: u.codeforcesHandle,
    avatar: u.avatar,
    rating: u.rating,
    rank: u.rank,
  };
}

@Injectable()
export class FriendsService {
  constructor(
    private readonly admin: AdminService,
    private readonly auditLogs: AuditLogsService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Friendship.name)
    private readonly friendshipModel: Model<FriendshipDocument>,
    @InjectModel(FriendRequest.name)
    private readonly friendRequestModel: Model<FriendRequestDocument>,
  ) {}

  private async findUserByHandleInsensitive(handle: string) {
    const trimmed = handle.trim();
    if (!trimmed) return null;
    return await this.userModel
      .findOne({
        codeforcesHandle: new RegExp(`^${escapeRegex(trimmed)}$`, 'i'),
      })
      .exec();
  }

  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    if (String(userId) === String(otherUserId)) return false;
    const [lower, higher] = normalizePair(userId, otherUserId);
    const doc = await this.friendshipModel
      .findOne({
        userLower: lower,
        userHigher: higher,
      })
      .lean();
    return !!doc;
  }

  private async createFriendshipPair(userIdA: string, userIdB: string) {
    const [lower, higher] = normalizePair(userIdA, userIdB);
    await this.friendshipModel.create({
      userLower: lower,
      userHigher: higher,
    });
  }

  /** Send a friend request (or auto-accept if the other user already requested you). */
  async sendRequest(currentUserId: string, codeforcesHandle: string) {
    const normalized = normalizeCodeforcesHandleInput(codeforcesHandle);
    if (!normalized) {
      throw new BadRequestException('Codeforces handle is required');
    }
    if (!isValidCodeforcesHandleFormat(normalized)) {
      throw new BadRequestException('That is not a valid Codeforces handle.');
    }

    const target = await this.findUserByHandleInsensitive(normalized);
    if (!target) {
      throw new NotFoundException(
        'Nobody with that handle is registered on this app yet.',
      );
    }

    const targetId = String(target._id);
    const currentHandle =
      (await this.userModel.findById(currentUserId).select('codeforcesHandle'))
        ?.codeforcesHandle ?? 'unknown';

    if (targetId === String(currentUserId)) {
      throw new BadRequestException('Cannot add yourself as a friend');
    }

    if (await this.areFriends(currentUserId, targetId)) {
      return {
        message: 'Already friends',
        friend: publicUserPick(target),
      };
    }

    const curOid = new Types.ObjectId(currentUserId);
    const tgtOid = new Types.ObjectId(targetId);

    const outboundPending = await this.friendRequestModel.findOne({
      fromUser: curOid,
      toUser: tgtOid,
      status: 'pending',
    });

    if (outboundPending) {
      return {
        message: 'Friend request already sent',
        pending: true,
        to: publicUserPick(target),
      };
    }

    const inboundPending = await this.friendRequestModel.findOne({
      fromUser: tgtOid,
      toUser: curOid,
      status: 'pending',
    });

    if (inboundPending) {
      await this.friendRequestModel.deleteOne({ _id: inboundPending._id });
      await this.createFriendshipPair(currentUserId, targetId);

      await this.auditLogs.logAction(
        'FRIEND_REQUEST_ACCEPTED',
        'Friendship',
        currentUserId,
        currentHandle,
        {
          matchedReverseRequest: true,
          friendUserId: targetId,
          friendHandle: target.codeforcesHandle,
        },
        targetId,
      );

      return {
        message: 'You are now friends',
        matchedIncomingRequest: true,
        friend: publicUserPick(target),
      };
    }

    await this.friendRequestModel.create({
      fromUser: curOid,
      toUser: tgtOid,
      status: 'pending',
    });

    await this.auditLogs.logAction(
      'FRIEND_REQUEST_SENT',
      'FriendRequest',
      currentUserId,
      currentHandle,
      { toUserId: targetId, toHandle: target.codeforcesHandle },
      targetId,
    );

    return {
      message: 'Friend request sent',
      pending: true,
      to: publicUserPick(target),
    };
  }

  async listRequests(currentUserId: string) {
    const uid = new Types.ObjectId(currentUserId);

    const [incomingDocs, outgoingDocs] = await Promise.all([
      this.friendRequestModel
        .find({ toUser: uid, status: 'pending' })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      this.friendRequestModel
        .find({ fromUser: uid, status: 'pending' })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
    ]);

    const fromIds = incomingDocs.map((d) => d.fromUser);
    const toIds = outgoingDocs.map((d) => d.toUser);
    const allIds = [...new Set([...fromIds, ...toIds].map((id) => String(id)))];
    const users =
      allIds.length === 0
        ? []
        : await this.userModel
            .find({
              _id: {
                $in: allIds.map((id) => new Types.ObjectId(id)),
              },
            })
            .select('codeforcesHandle avatar rating rank')
            .lean();

    const byId = new Map(users.map((u) => [String(u._id), u]));

    const mapIncoming = incomingDocs.flatMap((d) => {
      const u = byId.get(String(d.fromUser));
      if (!u) return [];
      const createdAt = (d as { createdAt?: Date }).createdAt;
      return [
        {
          _id: String(d._id),
          createdAt,
          from: publicUserPick(u),
        },
      ];
    });

    const mapOutgoing = outgoingDocs.flatMap((d) => {
      const u = byId.get(String(d.toUser));
      if (!u) return [];
      const createdAt = (d as { createdAt?: Date }).createdAt;
      return [
        {
          _id: String(d._id),
          createdAt,
          to: publicUserPick(u),
        },
      ];
    });

    return {
      incoming: mapIncoming,
      outgoing: mapOutgoing,
    };
  }

  async acceptRequest(currentUserId: string, requestId: string) {
    const req = await this.friendRequestModel.findById(requestId);
    if (!req || req.status !== 'pending') {
      throw new NotFoundException('Request not found');
    }
    if (String(req.toUser) !== String(currentUserId)) {
      throw new ForbiddenException('You cannot accept this request');
    }

    const fromId = String(req.fromUser);
    const currentHandle =
      (await this.userModel.findById(currentUserId).select('codeforcesHandle'))
        ?.codeforcesHandle ?? 'unknown';
    const fromUser = await this.userModel.findById(fromId);
    if (!fromUser) throw new NotFoundException('User not found');

    await this.friendRequestModel.deleteOne({ _id: req._id });

    if (!(await this.areFriends(currentUserId, fromId))) {
      await this.createFriendshipPair(currentUserId, fromId);
    }

    await this.auditLogs.logAction(
      'FRIEND_REQUEST_ACCEPTED',
      'FriendRequest',
      currentUserId,
      currentHandle,
      { requestId, fromUserId: fromId, fromHandle: fromUser.codeforcesHandle },
      new Types.ObjectId(fromId),
    );

    return {
      message: 'Friend request accepted',
      friend: publicUserPick(fromUser),
    };
  }

  async declineRequest(currentUserId: string, requestId: string) {
    const req = await this.friendRequestModel.findById(requestId);
    if (!req || req.status !== 'pending') {
      throw new NotFoundException('Request not found');
    }
    if (String(req.toUser) !== String(currentUserId)) {
      throw new ForbiddenException('You cannot decline this request');
    }

    const fromId = String(req.fromUser);
    const fromUser = await this.userModel.findById(fromId);
    const currentHandle =
      (await this.userModel.findById(currentUserId).select('codeforcesHandle'))
        ?.codeforcesHandle ?? 'unknown';

    await this.friendRequestModel.deleteOne({ _id: req._id });

    await this.auditLogs.logAction(
      'FRIEND_REQUEST_DECLINED',
      'FriendRequest',
      currentUserId,
      currentHandle,
      {
        requestId,
        fromUserId: fromId,
        fromHandle: fromUser?.codeforcesHandle,
      },
      new Types.ObjectId(fromId),
    );

    return { message: 'Friend request declined' };
  }

  async cancelOutgoingRequest(currentUserId: string, requestId: string) {
    const req = await this.friendRequestModel.findById(requestId);
    if (!req || req.status !== 'pending') {
      throw new NotFoundException('Request not found');
    }
    if (String(req.fromUser) !== String(currentUserId)) {
      throw new ForbiddenException('You cannot cancel this request');
    }

    const toId = String(req.toUser);
    const toUser = await this.userModel.findById(toId);
    const currentHandle =
      (await this.userModel.findById(currentUserId).select('codeforcesHandle'))
        ?.codeforcesHandle ?? 'unknown';

    await this.friendRequestModel.deleteOne({ _id: req._id });

    await this.auditLogs.logAction(
      'FRIEND_REQUEST_CANCELLED',
      'FriendRequest',
      currentUserId,
      currentHandle,
      {
        requestId,
        toUserId: toId,
        toHandle: toUser?.codeforcesHandle,
      },
      new Types.ObjectId(toId),
    );

    return { message: 'Friend request cancelled' };
  }

  async listFriends(currentUserId: string) {
    const uid = new Types.ObjectId(currentUserId);
    const rows = await this.friendshipModel
      .find({
        $or: [{ userLower: uid }, { userHigher: uid }],
      })
      .limit(500)
      .lean();

    const otherIds = rows.map((r) => {
      const lo = String(r.userLower);
      const hi = String(r.userHigher);
      const cur = String(currentUserId);
      return lo === cur ? hi : lo;
    });

    if (otherIds.length === 0) {
      return { friends: [] as Array<Record<string, unknown>> };
    }

    const users = await this.userModel
      .find({ _id: { $in: otherIds.map((id) => new Types.ObjectId(id)) } })
      .select('codeforcesHandle avatar rating rank')
      .lean();

    const friends = users.map((u) => ({
      _id: String(u._id),
      codeforcesHandle: u.codeforcesHandle,
      avatar: u.avatar,
      rating: u.rating,
      rank: u.rank,
    }));

    return { friends };
  }

  async removeFriend(currentUserId: string, friendUserId: string) {
    if (String(currentUserId) === String(friendUserId)) {
      throw new BadRequestException('Invalid friend');
    }

    const friendUser = await this.userModel
      .findById(friendUserId)
      .select('codeforcesHandle')
      .lean();
    const currentHandle =
      (await this.userModel.findById(currentUserId).select('codeforcesHandle'))
        ?.codeforcesHandle ?? 'unknown';

    const [lower, higher] = normalizePair(currentUserId, friendUserId);

    const result = await this.friendshipModel.deleteOne({
      userLower: lower,
      userHigher: higher,
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Friendship not found');
    }

    await this.auditLogs.logAction(
      'FRIEND_REMOVED',
      'Friendship',
      currentUserId,
      currentHandle,
      {
        friendUserId,
        friendHandle: friendUser?.codeforcesHandle,
      },
      new Types.ObjectId(friendUserId),
    );

    return { message: 'Friend removed' };
  }

  async getFriendStats(viewerUserId: string, friendUserId: string) {
    const ok = await this.areFriends(viewerUserId, friendUserId);
    if (!ok) {
      throw new ForbiddenException('You can only view stats for friends');
    }
    return await this.admin.userStats(friendUserId);
  }
}

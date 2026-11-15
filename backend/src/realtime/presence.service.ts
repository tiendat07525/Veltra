import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Friend, FriendDocument } from '../friend/schema/friend.schema';
import {
  Conversation,
  ConversationDocument,
} from '../conversation/schemas/conversation.schema';
import { RealtimeService } from './realtime.service';
import { errorMessage } from '../common/error-message';

// A user is reported offline only if no socket of theirs is back within this window
// (page reloads, short network drops). See date_logic.md §6.
export const OFFLINE_GRACE_MS = 30_000;

export type PresenceStatus = 'online' | 'offline';

const userRoom = (userId: string) => `user:${userId}`;

/**
 * Online state is not stored: a user is online while at least one of their sockets is in
 * `user:{id}` on any instance (`fetchSockets()` goes through the Redis adapter).
 * Presence is shown only to the user's audience: friends + members of any conversation
 * they are in.
 */
@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  // Pending "offline" checks on this instance, one per user
  private readonly offlineTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(Friend.name)
    private readonly friendModel: Model<FriendDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    private readonly realtimeService: RealtimeService,
  ) {}

  onModuleDestroy() {
    this.offlineTimers.forEach((timer) => clearTimeout(timer));
    this.offlineTimers.clear();
  }

  // Users who may see `userId`'s presence: friends + co-members, without `userId`
  async audienceOf(userId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) return [];
    const id = new Types.ObjectId(userId);

    const [friends, conversations] = await Promise.all([
      this.friendModel
        .find({ $or: [{ user: id }, { friend: id }] }, { user: 1, friend: 1 })
        .lean(),
      this.conversationModel
        .find({ 'participants.userId': id }, { 'participants.userId': 1 })
        .lean(),
    ]);

    const audience = new Set<string>();
    for (const pair of friends) {
      audience.add(pair.user.toString());
      audience.add(pair.friend.toString());
    }
    for (const conversation of conversations) {
      for (const participant of conversation.participants ?? []) {
        if (participant.userId) audience.add(participant.userId.toString());
      }
    }
    audience.delete(userId);
    return [...audience];
  }

  // Which of `userIds` have a connected socket right now (any instance)
  async onlineAmong(userIds: string[]): Promise<string[]> {
    const server = this.realtimeService.getServer();
    if (!server || userIds.length === 0) return [];

    const wanted = new Set(userIds);
    const sockets = await server.in(userIds.map(userRoom)).fetchSockets();
    const online = new Set<string>();
    for (const socket of sockets) {
      const id = (socket.data as { user?: { _id?: string } })?.user?._id;
      if (id && wanted.has(id)) online.add(id);
    }
    return [...online];
  }

  // presence:sync — the caller's audience members that are online
  async onlineAudience(userId: string): Promise<string[]> {
    return this.onlineAmong(await this.audienceOf(userId));
  }

  // After a socket joined user:{id}. The first socket announces "online".
  async handleConnected(userId: string): Promise<void> {
    try {
      const pending = this.offlineTimers.get(userId);
      if (pending) {
        // Back within the grace window: the user never went offline
        clearTimeout(pending);
        this.offlineTimers.delete(userId);
      }

      const server = this.realtimeService.getServer();
      if (!server) return;
      const sockets = await server.in(userRoom(userId)).fetchSockets();
      if (sockets.length === 1) {
        await this.broadcast(userId, 'online');
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[Presence] Không thể cập nhật online: ${errorMessage(err)}`,
      );
    }
  }

  // After a socket disconnected. "offline" only if no socket is back after the grace window.
  handleDisconnected(userId: string): void {
    const pending = this.offlineTimers.get(userId);
    if (pending) clearTimeout(pending);

    const timer = setTimeout(() => {
      this.offlineTimers.delete(userId);
      void this.announceOfflineIfGone(userId);
    }, OFFLINE_GRACE_MS);
    if (typeof timer.unref === 'function') timer.unref();
    this.offlineTimers.set(userId, timer);
  }

  private async announceOfflineIfGone(userId: string): Promise<void> {
    try {
      const server = this.realtimeService.getServer();
      if (!server) return;
      const sockets = await server.in(userRoom(userId)).fetchSockets();
      if (sockets.length === 0) {
        await this.broadcast(userId, 'offline');
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[Presence] Không thể cập nhật offline: ${errorMessage(err)}`,
      );
    }
  }

  private async broadcast(userId: string, status: PresenceStatus) {
    const audience = await this.audienceOf(userId);
    for (const memberId of audience) {
      this.realtimeService.emitToUser(memberId, 'presence', {
        userId,
        status,
      });
    }
  }

  /**
   * Members who receive `userId`'s typing signal in `conversationId`: every other member.
   * null when the id is invalid, the conversation does not exist or `userId` is not a member.
   */
  async typingRecipients(
    conversationId: string,
    userId: string,
  ): Promise<string[] | null> {
    if (
      !Types.ObjectId.isValid(conversationId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return null;
    }

    const conversation = await this.conversationModel
      .findOne(
        {
          _id: new Types.ObjectId(conversationId),
          'participants.userId': new Types.ObjectId(userId),
        },
        { 'participants.userId': 1 },
      )
      .lean();
    if (!conversation) return null;

    return (conversation.participants ?? [])
      .map((participant) => participant.userId?.toString())
      .filter((id): id is string => !!id && id !== userId);
  }
}

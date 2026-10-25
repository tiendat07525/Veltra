import { useState, useEffect, useCallback } from 'react';
import { friendService } from '@/services/api/friend.service';
import { FriendRequest, FriendshipStatus } from '@/types/friend';
import { UserBasicInfo } from '@/types/user';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { message?: string } } }).response;
    if (res?.data?.message) return res.data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function useFriends() {
  const [friends, setFriends] = useState<UserBasicInfo[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); 

  const fetchFriends = useCallback(async () => {
    try {
      const data = await friendService.getFriends();
      setFriends(data);
    } catch (err: unknown) {
      console.error('Lỗi khi lấy danh sách bạn bè:', err);
      setError(getErrorMessage(err, 'Không thể tải danh sách bạn bè'));
    }
  }, []);

  const fetchFriendRequests = useCallback(async () => {
    try {
      const data = await friendService.getFriendRequests();
      setSentRequests(data.sent || []);
      setReceivedRequests(data.received || []);
    } catch (err: unknown) {
      console.error('Lỗi khi lấy lời mời kết bạn:', err);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchFriends(), fetchFriendRequests()]);
    setLoading(false);
  }, [fetchFriends, fetchFriendRequests]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchAll();
    });
  }, [fetchAll]);

  const getFriendshipStatus = useCallback(
    (targetUserId: string, currentUserId: string): { status: FriendshipStatus; requestId?: string } => {
      if (targetUserId === currentUserId) {
        return { status: 'self' };
      }

      const isFriend = friends.some((f) => f._id === targetUserId);
      if (isFriend) {
        return { status: 'friends' };
      }
      const sentReq = sentRequests.find((r) => {
        const toId = typeof r.to === 'string' ? r.to : r.to?._id;
        return toId === targetUserId;
      });
      if (sentReq) {
        return { status: 'request_sent', requestId: sentReq._id };
      }

      const receivedReq = receivedRequests.find((r) => {
        const fromId = typeof r.from === 'string' ? r.from : r.from?._id;
        return fromId === targetUserId;
      });
      if (receivedReq) {
        return { status: 'request_received', requestId: receivedReq._id };
      }

      return { status: 'none' };
    },
    [friends, sentRequests, receivedRequests]
  );

  const sendFriendRequest = useCallback(
    async (toUserId: string, message?: string) => {
      if (actionLoading) return;
      setActionLoading(`send-${toUserId}`);
      try {
        await friendService.sendFriendRequest(toUserId, message);
        await fetchFriendRequests();
      } catch (err: unknown) {
        throw new Error(getErrorMessage(err, 'Không thể gửi lời mời kết bạn'));
      } finally {
        setActionLoading(null);
      }
    },
    [actionLoading, fetchFriendRequests]
  );

  const acceptFriendRequest = useCallback(
    async (requestId: string) => {
      if (actionLoading) return;
      setActionLoading(`accept-${requestId}`);
      try {
        await friendService.acceptFriendRequest(requestId);
        await fetchAll();
      } catch (err: unknown) {
        throw new Error(getErrorMessage(err, 'Không thể chấp nhận lời mời'));
      } finally {
        setActionLoading(null);
      }
    },
    [actionLoading, fetchAll]
  );

  const declineFriendRequest = useCallback(
    async (requestId: string) => {
      if (actionLoading) return;
      setActionLoading(`decline-${requestId}`);
      try {
        await friendService.declineFriendRequest(requestId);
        await fetchFriendRequests();
      } catch (err: unknown) {
        throw new Error(getErrorMessage(err, 'Không thể từ chối lời mời'));
      } finally {
        setActionLoading(null);
      }
    },
    [actionLoading, fetchFriendRequests]
  );

  const removeFriend = useCallback(
    async (friendId: string) => {
      if (actionLoading) return;
      setActionLoading(`remove-${friendId}`);
      try {
        await friendService.removeFriend(friendId);
        setFriends((prev) => prev.filter((f) => f._id !== friendId));
      } catch (err: unknown) {
        await fetchFriends();
        throw new Error(getErrorMessage(err, 'Không thể xóa bạn'));
      } finally {
        setActionLoading(null);
      }
    },
    [actionLoading, fetchFriends]
  );

  return {
    friends,
    sentRequests,
    receivedRequests,
    loading,
    error,
    actionLoading,
    getFriendshipStatus,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    refetch: fetchAll,
  };
}

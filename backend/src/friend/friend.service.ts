import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FriendRequest, FriendRequestDocument } from "./schema/friend-request.schema";
import { Model, Types } from "mongoose";
import { Friend, FriendDocument } from "./schema/friend.schema";
import { User, UserDocument } from "src/users/schemas/user.schema";

import { SendFriendRequestDto } from "./dto/send-friend-request.dto";

@Injectable()
export class FriendService {
    constructor(
        @InjectModel(Friend.name)
        private readonly friendModel: Model<FriendDocument>,
        @InjectModel(FriendRequest.name)
        private readonly friendRequestModel: Model<FriendRequestDocument>,
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
    ) { }

    async sendFriendRequest(dto: SendFriendRequestDto, userId: string) {
        const { to, message } = dto;
        const currentUserId = new Types.ObjectId(userId);
        const receiverId = new Types.ObjectId(to);

        if (currentUserId.equals(receiverId)) {
            throw new BadRequestException('Người gửi và người nhận không được giống nhau')
        }

        if(!receiverId._id){
            throw new BadRequestException("Người nhận không tồn tại")
        }


        const [userA, userB] = this.normalizeUsers(currentUserId, receiverId);

        const [alreadyFriends, existingRequest] = await Promise.all([
            this.friendModel.findOne({ user: userA, friend: userB }),
            this.friendRequestModel.findOne({
                $or: [{
                    from: currentUserId,
                    to: receiverId
                },
                {
                    from: receiverId,
                    to: currentUserId
                }]
            })
        ])

        if (alreadyFriends) {
            throw new BadRequestException('Bạn đã là bạn với người này')
        }

        if (existingRequest) {
            throw new BadRequestException('Bạn đã gửi hoặc nhận lời mời kết bạn với người này')
        }

        const request = await this.friendRequestModel.create({
            from: currentUserId,
            to: receiverId,
            message,
        })
        return {
            status: true,
            message: 'Gửi lời mời kết bạn thành công',
            request
        }
    }

    async acceptFriendRequest(requestId: string, userId: string) {
        const currentUserId = new Types.ObjectId(userId);
        const request = await this.friendRequestModel.findById(requestId);

        if (!request) {
            throw new NotFoundException('Không tìm thấy lời mời kết bạn')
        }

        if (!request.to.equals(currentUserId)) {
            throw new ForbiddenException('Bạn không có quyền chấp nhận lời mời này')
        }

        const [userA, userB] = this.normalizeUsers(request.from, request.to);

        const existingFriend = await this.friendModel.findOne({ user: userA, friend: userB })

        if (existingFriend) {
            throw new BadRequestException('Hai người đã là bạn bè')
        }

        await this.friendModel.create({ user: userA, friend: userB })

        await this.friendRequestModel.findByIdAndDelete(requestId)

        return {
            status: true,
            message: 'Chấp nhận lời mời kết bạn thành công',
        }

    }

    async declineFriendRequest(requestId: string, userId: string) {
        const currentUserId = new Types.ObjectId(userId);
        const request = await this.friendRequestModel.findById(requestId);

        if (!request) {
            throw new NotFoundException('Không tìm thấy lời mời kết bạn')
        }

        if (!request.to.equals(currentUserId)) {
            throw new ForbiddenException('Bạn không có quyền từ chối lời mời này')
        }

        await this.friendRequestModel.findByIdAndDelete(requestId)

        return {
            status: true,
            message: 'Từ chối lời mời kết bạn thành công',
        }
    }

    async removeFriend(friendId: string, userId: string) {
        const currentUserId = new Types.ObjectId(userId);
        const friendUserId = new Types.ObjectId(friendId);

        const [userA, userB] = this.normalizeUsers(currentUserId, friendUserId);

        const existingFriend = await this.friendModel.findOne({ user: userA, friend: userB })

        if (!existingFriend) {
            throw new BadRequestException('Hai người chưa là bạn bè')
        } else {
            await this.friendModel.findByIdAndDelete(existingFriend._id)
        }

        return {
            status: true,
            message: 'Xóa bạn thành công',
        }
    }

    async getAllFriend(userId: string) {
        const currentUserId = new Types.ObjectId(userId);

        const friendships = await this.friendModel.find({
            $or: [{ user: currentUserId }, { friend: currentUserId }]
        })
        .populate('user', '_id username displayName avatarUrl')
        .populate('friend', '_id username displayName avatarUrl')
        .lean()

        const friends = friendships.map((friend) => {
            return friend.user._id.equals(currentUserId) 
                ? friend.friend 
                : friend.user;
        });
        return{
            status: true,
            friends
        }
    }

    async getFriendRequests(userId: string) {
        const currentUserId = new Types.ObjectId(userId);

        const populateFields = '_id username displayName avatarUrl';
        const [sent, received] = await Promise.all([
            this.friendRequestModel.find({ from: currentUserId }).populate('to', populateFields).lean(),
            this.friendRequestModel.find({ to: currentUserId }).populate('from', populateFields).lean()
        ]);

        return {
            success: true,
            sent,
            received,
        };
    }

    private normalizeUsers(userA: Types.ObjectId, userB: Types.ObjectId): [Types.ObjectId, Types.ObjectId] {
        const a = userA.toString();
        const b = userB.toString();
        return a < b ? [userA, userB] : [userB, userA];
    }
}
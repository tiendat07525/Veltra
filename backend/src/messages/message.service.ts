import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Message, MessageDocument } from "./schemas/message.schema";
import { Model, Types } from "mongoose";
import { CreateMessageDto } from "./dto/create-message.dto";
import { Conversation, ConversationDocument } from "src/conversation/schemas/conversation.schema";
import { create } from "domain";
import { UpdateConversationDto } from "src/conversation/dto/update-conversation.dto";
import { emitNewMessage, updateConversationAfterCreateMessage } from "./messageHelper";
import { isObject } from "class-validator";
import { NotFoundException } from "@nestjs/common";

import { RealtimeService } from "src/realtime/realtime.service";

@Injectable()
export class MessageService {
    constructor(
        @InjectModel(Message.name)
        private readonly messageModel: Model<MessageDocument>,
        @InjectModel(Conversation.name)
        private readonly conversationModel: Model<ConversationDocument>,
        private readonly realtimeService: RealtimeService,
    ){}

    async sendDirectMessage(dto: CreateMessageDto, userId: string){
        try {
            const {conversationId, receiverId, content} = dto;
            const senderId = new Types.ObjectId(userId)

            let conversation : ConversationDocument | null = null;

            if(conversationId){
                conversation = await this.conversationModel.findById(conversationId)

                if(!conversation){
                   throw new NotFoundException('Không tìm thấy hội thoại') 
                }

                const isParticipant = conversation.participants.some(
                    p => p.userId?.toString() === senderId.toString()
                )

                if (!isParticipant) {
                    throw new BadRequestException("Bạn không có quyền gửi tin nhắn");
                }
            }

            if(!conversation){
                conversation = await this.conversationModel.create({
                    type: "direct",
                    participants:[
                        {userId: senderId, joinedAt: new Date()},
                        {userId: new Types.ObjectId(receiverId), joinedAt: new Date()}
                    ],
                    lastMessageAt: new Date(),
                    unreadCounts: new Map()
                })
            }

            const message = await this.messageModel.create({
                conversationId: conversation._id,
                senderId,
                content,
            })
            updateConversationAfterCreateMessage(conversation, message, senderId)

            await conversation.save()

            // Emit realtime message:new to participants' private user rooms
            const rawMessage = message.toObject ? message.toObject() : message;
            const messagePayload = {
                _id: rawMessage._id.toString(),
                conversationId: conversation._id.toString(),
                senderId: senderId.toString(),
                content: rawMessage.content,
                createdAt: rawMessage.createdAt,
                updatedAt: rawMessage.updatedAt,
            };

            const conversationPayload = {
                _id: conversation._id.toString(),
                lastMessage: conversation.lastMessage,
                lastMessageAt: conversation.lastMessageAt,
            };

            conversation.participants?.forEach((p) => {
                const memberId = p.userId?.toString();
                if (memberId) {
                    this.realtimeService.emitToUser(memberId, 'message:new', {
                        message: messagePayload,
                        conversation: conversationPayload,
                    });
                }
            });

            return {
                success: true,
                message: 'Thành công',
                data: messagePayload,
            }
        } catch (error) {
            console.error('Lỗi gửi tin nhắn trực tiếp: ', error)
            throw error
        }
    }
}
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

@Injectable()
export class MessageService {
    constructor(
        @InjectModel(Message.name)
        private readonly messageModel: Model<MessageDocument>,
        @InjectModel(Conversation.name)
        private readonly conversationModel: Model<ConversationDocument>,
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

            //emitNewMessage(io, conversation, message); cài socket mới dùng đc

            return {
                success: true,
                message: 'Thành công'
            }
        } catch (error) {
            console.error('Lỗi gửi tin nhắn trực tiếp: ', error)
            throw error
        }
    }
}
import { IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateMessageDto{
    @IsOptional()
    @IsMongoId()
    conversationId?: string;

    @IsMongoId()
    @IsOptional()
    receiverId?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    content: string;
}
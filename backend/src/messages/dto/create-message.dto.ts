import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateMessageDto {
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

  // Optional while clients from before this change are still open; the current frontend always sends it
  @IsOptional()
  @IsUUID('7')
  clientMsgId?: string;
}

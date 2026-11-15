import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { AttachmentKind } from '../schemas/message.schema';

// Shape only; ownership / existence / real format and size are checked in AttachmentService
export class AttachmentRefDto {
  @IsString()
  @Matches(
    /^veltra\/[0-9a-f]{24}\/[0-9a-f]{24}\/[0-9a-f-]{36}(\.[a-z0-9]{2,4})?$/,
  )
  publicId: string;

  @IsIn(['image', 'video', 'audio', 'file'])
  kind: AttachmentKind;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

// POST /message/attachments/sign
export class SignAttachmentDto {
  @IsMongoId()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(127)
  mimeType: string;

  // Declared size (pre-check only)
  @IsInt()
  @Min(1)
  size: number;
}

export class CreateMessageDto {
  @IsOptional()
  @IsMongoId()
  conversationId?: string;

  @IsMongoId()
  @IsOptional()
  receiverId?: string;

  // Required unless the message has attachments (then it is an optional caption).
  // "Empty text and no files" is rejected in MessageService (whitespace counts as empty).
  @ValidateIf(
    (o: CreateMessageDto) => !o.attachments?.length || o.content !== undefined,
  )
  @IsString()
  @MaxLength(500)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentRefDto)
  attachments?: AttachmentRefDto[];

  // Optional while clients from before this change are still open; the current frontend always sends it
  @IsOptional()
  @IsUUID('7')
  clientMsgId?: string;
}

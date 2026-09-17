import {IsMongoId,IsNotEmpty,IsOptional,IsString,MaxLength,} from 'class-validator';

export class SendFriendRequestDto {
  @IsMongoId()
  @IsNotEmpty()
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}
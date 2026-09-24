import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateConversationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  groupName: string;
}
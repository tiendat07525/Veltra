import { IsArray, IsEnum, IsMongoId, IsNotEmpty, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateConversationDto {
  @IsEnum(['direct', 'group'])
  @IsNotEmpty()
  type: 'direct' | 'group';

  @IsArray()
  @IsMongoId({ each: true })
  participants: string[];

  @ValidateIf((o) => o.type === 'group')
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  groupName?: string;
}
import { IsArray, IsMongoId, ArrayMinSize } from 'class-validator';

export class AddParticipantDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  userIds: string[];
}
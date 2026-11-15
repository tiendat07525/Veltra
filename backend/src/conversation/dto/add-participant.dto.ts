import { IsArray, IsMongoId, ArrayMinSize } from 'class-validator';

export class AddParticipantDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  userIds: string[];
}

// PATCH /conversation/:id/owner — the member who becomes the group owner
export class TransferOwnerDto {
  @IsMongoId()
  userId: string;
}

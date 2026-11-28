import { IsIn, IsMongoId } from 'class-validator';
import { CALL_MEDIA } from '../call.constants';
import type { CallMedia } from '../call.constants';

export class StartCallDto {
  @IsMongoId()
  conversationId: string;

  @IsIn(CALL_MEDIA)
  media: CallMedia;
}

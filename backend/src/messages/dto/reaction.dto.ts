import { IsIn } from 'class-validator';
import { REACTION_EMOJIS, type ReactionEmoji } from '../schemas/message.schema';

// PUT /message/:messageId/reaction — only the fixed set is accepted
export class ReactionDto {
  @IsIn(REACTION_EMOJIS)
  emoji: ReactionEmoji;
}

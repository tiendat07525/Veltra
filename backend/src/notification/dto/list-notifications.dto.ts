import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_MAX_PAGE_SIZE = 50;

export class ListNotificationsDto {
  // Id of the oldest notification already loaded: returns the ones older than it
  @IsOptional()
  @IsMongoId()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_MAX_PAGE_SIZE)
  limit?: number;
}

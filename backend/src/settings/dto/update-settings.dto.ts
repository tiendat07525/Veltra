import {
  IsBoolean,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  browser?: boolean;

  @IsOptional()
  @IsBoolean()
  sound?: boolean;

  @IsOptional()
  @IsBoolean()
  doNotDisturb?: boolean;
}

export class ChatSettingsDto {
  @IsOptional()
  @IsBoolean()
  enterToSend?: boolean;
}

// Partial update: only the fields sent change. Muted conversations have their own routes.
export class UpdateSettingsDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChatSettingsDto)
  chat?: ChatSettingsDto;
}

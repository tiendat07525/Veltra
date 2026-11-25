import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  // '' clears the phone number
  @ValidateIf((_, value) => value !== '')
  @IsString()
  @MaxLength(11)
  @Matches(/^[0-9]+$/)
  phone?: string;

  @IsOptional()
  // '' clears the avatar; anything else must be an absolute https URL (blocks javascript:, data:, http:)
  @ValidateIf((_, value) => value !== '')
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  avatarUrl?: string;
}

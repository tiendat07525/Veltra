import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { TWO_FACTOR_CODE_MAX_LENGTH } from '../two-factor/dto/two-factor.dto';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  currentPassword: string;

  // Same rule as registration
  @IsString()
  @IsNotEmpty()
  @Length(6, 100)
  newPassword: string;

  // Required only when 2FA is on: a TOTP or backup code
  @IsOptional()
  @IsString()
  @MaxLength(TWO_FACTOR_CODE_MAX_LENGTH)
  code?: string;
}

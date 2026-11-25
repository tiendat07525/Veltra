import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TWO_FACTOR_CODE_MAX_LENGTH } from '../two-factor/dto/two-factor.dto';
import { IsNewPassword } from './credential-rules';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  currentPassword: string;

  // Same rule as registration
  @IsNewPassword()
  newPassword: string;

  // Required only when 2FA is on: a TOTP or backup code
  @IsOptional()
  @IsString()
  @MaxLength(TWO_FACTOR_CODE_MAX_LENGTH)
  code?: string;
}

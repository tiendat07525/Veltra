import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// A TOTP code (6 digits) or a backup code (xxxxx-xxxxx); spaces / hyphens are ignored later
export const TWO_FACTOR_CODE_MAX_LENGTH = 20;

export class TwoFactorPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  currentPassword: string;
}

export class TwoFactorCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TWO_FACTOR_CODE_MAX_LENGTH)
  code: string;
}

export class TwoFactorPasswordCodeDto extends TwoFactorPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TWO_FACTOR_CODE_MAX_LENGTH)
  code: string;
}

export class LoginTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  challengeToken: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(TWO_FACTOR_CODE_MAX_LENGTH)
  code: string;
}

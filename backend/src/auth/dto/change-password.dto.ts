import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

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
}

import { IsEmail, IsNotEmpty } from 'class-validator';
import { IsNewPassword, IsNewUsername } from './credential-rules';

export class RegisterDto {
  @IsNewUsername()
  username: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNewPassword()
  password: string;
}

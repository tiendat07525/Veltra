import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/)
  username: string;
}

import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  Matches
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  @Matches(/^[0-9]+$/)
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
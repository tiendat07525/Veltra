import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { AVATAR_PUBLIC_ID_PATTERN } from '../avatar.rules';

// POST /users/avatar/sign
export class SignAvatarDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(127)
  mimeType: string;

  // Declared size (pre-check only)
  @IsInt()
  @Min(1)
  size: number;
}

// PUT /users/avatar. Shape only; owner / existence / real format and size are checked in ProfileService
export class SetAvatarDto {
  @IsString()
  @Matches(AVATAR_PUBLIC_ID_PATTERN)
  publicId: string;
}

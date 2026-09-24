import { IsEmail, IsNotEmpty, IsString, Length } from "class-validator";

export class LoginDto {
    @IsString()
    @IsNotEmpty()
    @Length(3, 30)
    username: string;

    @IsString()
    @IsNotEmpty()
    @Length(6, 100)
    password: string;
}
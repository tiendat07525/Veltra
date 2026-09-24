import { IsString, Length, IsEmail, IsNotEmpty } from "class-validator";

export class RegisterDto {
    @IsString()
    @IsNotEmpty()
    @Length(3, 30)
    username: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    @Length(6, 100)
    password: string;
}
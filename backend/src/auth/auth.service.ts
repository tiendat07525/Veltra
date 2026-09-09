import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { RegisterDto } from "./dto/register.dto";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "src/users/users.service";
import { LoginDto } from "./dto/login.dto";
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService
    ) { }

    async register(registerDto: RegisterDto) {
        const existedUser = await this.usersService.findByEmail(registerDto.email);
        if (existedUser) {
            throw new ConflictException('Email đã tồn tại')
        }

        const existedPhone = await this.usersService.findByUsername(registerDto.username);
        if (existedPhone) {
            throw new ConflictException('Username đã tồn tại')
        }

        const hashedPassword = await bcrypt.hash(registerDto.password, 10)
        const user = await this.usersService.create({
            ...registerDto,
            password: hashedPassword
        });

        return {
            message: 'Tạo user thành công',
            data: user
        }
    }

    async login(loginDto: LoginDto) {
        const user = await this.usersService.findByUsername(loginDto.username);
        if (!user) {
            throw new NotFoundException('Username hoặc mật khẩu không chính xác');
        }

        const isMatch = await bcrypt.compare(loginDto.password, user.password);
        if (!isMatch) {
            throw new NotFoundException('Username hoặc mật khẩu không chính xác');
        }

        const payload = {
            id: user._id,
            email: user.email,
            username: user.username,
            phone: user.phone
        }

        const accessToken = await this.jwtService.signAsync(payload);

        return {
            message: 'Đăng nhập thành công',
            accessToken
        }
    }
}
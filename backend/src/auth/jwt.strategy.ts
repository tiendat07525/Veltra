import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, ExtractJwt } from "passport-jwt";
import { UsersService } from "src/users/users.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private readonly usersService: UsersService
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.getOrThrow<string>('JWT_SECRET')
        })
    }

    async validate(payload: any) {
        const user = await this.usersService.findOne(payload.id)
        if (!user) {
            throw new UnauthorizedException('Người dùng không tồn tại')
        }
        return {
            id: user._id.toString(),
            email: user.email,
            username: user.username,
            phone: user.phone
        };
    }
}
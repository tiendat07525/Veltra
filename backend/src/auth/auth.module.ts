import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from 'src/users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule.register({
      defaultStrategy: 'jwt'
    }),

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '7d'
        }
      })
    })],

  controllers: [AuthController],

  providers: [AuthService, JwtStrategy],

  exports: [AuthService, PassportModule]
})
export class AuthModule { }

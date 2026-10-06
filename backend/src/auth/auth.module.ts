import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from 'src/users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { SessionService } from './session.service';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    forwardRef(() => RealtimeModule),
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '15m',
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, JwtStrategy, SessionService],

  exports: [AuthService, PassportModule, JwtModule, SessionService],
})
export class AuthModule {}

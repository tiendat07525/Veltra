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
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { TwoFactorController } from './two-factor/two-factor.controller';
import { TwoFactorService } from './two-factor/two-factor.service';
import { TwoFactorCryptoService } from './two-factor/two-factor-crypto.service';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    // TwoFactorService reads / updates users.twoFactor (select: false) directly
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
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

  controllers: [AuthController, TwoFactorController],

  providers: [
    AuthService,
    JwtStrategy,
    SessionService,
    TwoFactorService,
    TwoFactorCryptoService,
  ],

  exports: [AuthService, PassportModule, JwtModule, SessionService],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { XpModule } from '../xp/xp.module';
import { TransactionsModule } from '../../common/database/transactions.module';
import {
  PasswordResetChallenge,
  PasswordResetChallengeSchema,
} from './schemas/password-reset-challenge.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import { User, UserSchema } from './schemas/user.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    ConfigModule,
    TransactionsModule,
    XpModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      {
        name: PasswordResetChallenge.name,
        schema: PasswordResetChallengeSchema,
      },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: (() => {
          const s = config.get<string>('JWT_SECRET');
          if (!s) throw new Error('JWT_SECRET must be set in environment');
          return s;
        })(),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

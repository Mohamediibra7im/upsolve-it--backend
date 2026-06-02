import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import { User, UserSchema } from './schemas/user.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { UserXp, UserXpSchema } from '../roadmap/schemas/user-xp.schema';
import {
  XpTransaction,
  XpTransactionSchema,
} from '../roadmap/schemas/xp-transaction.schema';

@Module({
  imports: [
    ConfigModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: UserXp.name, schema: UserXpSchema },
      { name: XpTransaction.name, schema: XpTransactionSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

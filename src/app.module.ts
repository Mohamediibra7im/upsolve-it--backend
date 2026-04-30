import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { TrainingsModule } from './modules/trainings/trainings.module';
import { UpsolveModule } from './modules/upsolve/upsolve.module';
import { AdminModule } from './modules/admin/admin.module';
import { ContactModule } from './modules/contact/contact.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
        const uri =
          (nodeEnv === 'production'
            ? config.get<string>('MONGODB_URI_PROD')
            : config.get<string>('MONGODB_URI_DEV')) ??
          config.get<string>('MONGODB_URI') ??
          config.get<string>('MONGO_URL');
        if (!uri) {
          throw new Error(
            'Missing Mongo connection string. Set MONGODB_URI_DEV/MONGODB_URI_PROD (or MONGODB_URI).',
          );
        }
        return { uri };
      },
    }),
    AuthModule,
    TrainingsModule,
    UpsolveModule,
    AdminModule,
    ContactModule,
    AuditLogsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

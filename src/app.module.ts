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
import { TrainingLevelsModule } from './modules/training-levels/training-levels.module';
import { FriendsModule } from './modules/friends/friends.module';
import { RoadmapModule } from './modules/roadmap/roadmap.module';
import { WhatsNewModule } from './modules/whats-new/whats-new.module';

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
    TrainingLevelsModule,
    FriendsModule,
    RoadmapModule,
    WhatsNewModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

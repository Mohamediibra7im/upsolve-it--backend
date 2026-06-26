import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
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
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { HealthModule } from './modules/health/health.module';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { RateLimiterGuard } from './common/guards/rate-limiter.guard';

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
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          pinoHttp: {
            level: config.get<string>('LOG_LEVEL') ?? 'info',
            transport:
              process.env.NODE_ENV !== 'production'
                ? {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                      colorize: true,
                    },
                  }
                : undefined,
            serializers: {
              req: (req) => {
                return {
                  id: req.id,
                  method: req.method,
                  url: req.url,
                  query: req.query,
                  params: req.params,
                  headers: {
                    'content-type': req.headers['content-type'],
                    'user-agent': req.headers['user-agent'],
                    'x-request-id': req.headers['x-request-id'],
                  },
                };
              },
              res: (res) => {
                return {
                  statusCode: res.statusCode,
                };
              },
            },
          },
        };
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
    SuggestionsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RateLimiterGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
